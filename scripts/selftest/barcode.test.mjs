/**
 * barcode.js 自查断言（直接测 src/utils/barcode.js 本体）
 * ------------------------------------------------------------
 * 两层判据：
 *   1) 外部判官（没装 zbarimg / magick 就整段跳过并打印原因）：
 *      encode → PBM → zbarimg 解码，读回的内容必须与载荷逐字符相同。
 *      Code 39 那 43 个掩码本来就是靠这个判官反向标定的，这里再当一次验收。
 *   2) 自洽：readBack() 从模块串重新解析出内容。它和 encode 走不同代码路径
 *      （一个查表写、一个切块读），但共用同一张表，所以只算自洽层。
 * 表结构断言（每个字符恰好 3 个宽元素、L/G/R 三张表互不重叠、镜像关系）
 * 是第三层：不依赖任何解码器。
 */
import { useUtils } from './harness.mjs'
import { execFileSync } from 'node:child_process'
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'

const B = await useUtils('barcode')

let ok = 0
let fail = 0
function is(a, b, m) {
  if (a === b) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b))
  }
}
function throws(fn, m) {
  try {
    fn()
    fail++
    console.log('FAIL ' + m + ': should throw')
  } catch (e) {
    if (/[一-龥]/.test(String(e && e.message))) ok++
    else {
      fail++
      console.log('FAIL ' + m + ': 报错不是中文 ' + e.message)
    }
  }
}
function popcount(m) {
  let n = 0
  for (let i = 0; i < 9; i++) if (m & (1 << i)) n++
  return n
}

/* ---------- 0. 导出面 ---------- */
for (const k of [
  'CODE39_CHARS', 'CODE39_DELIM', 'EAN_L', 'EAN_G', 'EAN_R', 'EAN_PAR',
  'SYMS', 'SYM_ITEMS', 'BARCODE_SAMPLES', 'checkDigit', 'normalize',
  'encode', 'readBack', 'runsOf', 'widthProfile',
]) {
  is(B[k] !== undefined, true, '导出 ' + k)
}
is(B.SYMS.length, 4, 'SYMS 数量')
is(B.SYM_ITEMS.length, 4, 'SYM_ITEMS 数量')
is(B.SYM_ITEMS.map((i) => i.name).join('/'), 'Code 39/EAN-13/EAN-8/UPC-A', 'SYM_ITEMS 名字')

/* ---------- 1. Code 39 表结构 ---------- */
is(B.CODE39_CHARS.length, 43, 'Code 39 字符集大小')
is(B.CODE39_CHARS.indexOf('*'), -1, '分隔符 * 不属于数据字符集')
const chars = []
for (const ch of B.CODE39_CHARS) {
  const enc = B.encode(ch, 'code39')
  is(enc.moduleCount, 15 * 3 + 2, 'Code 39 单字符模块数 ' + JSON.stringify(ch))
  const g = enc.modules.slice(16, 31)
  is(g.length, 15, '取出的数据段长度 ' + JSON.stringify(ch))
  is(g[0], '1', '数据段以条开始 ' + JSON.stringify(ch))
  is(g[14], '1', '数据段以条结束 ' + JSON.stringify(ch))
  chars.push(ch)
}
is(chars.length, 43, '43 个字符全部编得出来')
// 每个字符恰好 3 个宽元素：把 15 模块按元素切开，宽度为 3 的恰好 3 个
for (const ch of B.CODE39_CHARS) {
  const g = B.encode(ch, 'code39').modules.slice(16, 31)
  const ws = B.runsOf(g).map((r) => r.len)
  is(ws.length, 9, '元素数 9 ' + JSON.stringify(ch))
  is(ws.filter((w) => w === 3).length, 3, '宽元素数 3 ' + JSON.stringify(ch))
  is(ws.filter((w) => w === 1).length, 6, '窄元素数 6 ' + JSON.stringify(ch))
}
// 分隔符同样是 3 个宽元素（它和数据字符共用一套 9 元素结构）
is(popcount(B.CODE39_DELIM), 3, 'Code 39 分隔符也是 3 个宽元素')
// 掩码两两不同（3-out-of-9 共 84 种组合里只用了 44 种）
const maskSeen = {}
for (const ch of B.CODE39_CHARS) {
  const m = maskOf(B.encode(ch, 'code39').modules.slice(16, 31))
  is(popcount(m), 3, '掩码权重 3 ' + JSON.stringify(ch))
  is(maskSeen[m] === undefined, true, '掩码不重复 ' + m)
  maskSeen[m] = ch
}
maskSeen[B.CODE39_DELIM] = '*'
is(Object.keys(maskSeen).length, 44, 'Code 39 用到 44 种 3-out-of-9 组合')
function maskOf(g) {
  let m = 0
  let at = 0
  for (let e = 0; e < 9; e++) {
    let len = 1
    while (at + len < g.length && g[at + len] === g[at]) len++
    if (len === 3) m |= 1 << e
    at += len
  }
  return m
}

/* ---------- 2. EAN / UPC 表结构 ---------- */
const inv = (s) => [...s].map((c) => (c === '1' ? '0' : '1')).join('')
const rvs = (s) => [...s].reverse().join('')
is(B.EAN_L.length, 10, 'L 码 10 条')
is(B.EAN_G.length, 10, 'G 码 10 条')
is(B.EAN_R.length, 10, 'R 码 10 条')
for (let d = 0; d < 10; d++) {
  is(B.EAN_L[d].length, 7, 'L 码长度 ' + d)
  is(B.EAN_R[d], inv(B.EAN_L[d]), 'R = 取反 L ' + d)
  is(B.EAN_G[d], rvs(B.EAN_R[d]), 'G = R 左右翻转 ' + d)
  is(B.EAN_L[d][0], '0', 'L 码空开头 ' + d)
  is(B.EAN_R[d][0], '1', 'R 码条开头 ' + d)
}
const leftCodes = new Set([...B.EAN_L, ...B.EAN_G])
is(leftCodes.size, 20, 'L 与 G 两两不重复（20 条）')
is(new Set(B.EAN_R).size, 10, 'R 码不重复')
is(B.EAN_R.some((r) => leftCodes.has(r)), false, 'R 码不与左半码表混用')
is(B.EAN_PAR.length, 10, '奇偶表 10 行')
is(new Set(B.EAN_PAR).size, 10, '奇偶表行不重复')
for (const p of B.EAN_PAR) {
  is(p.length, 6, '奇偶行长度 ' + p)
  is(/^[LG]{6}$/.test(p), true, '奇偶行只含 L/G ' + p)
}
is(B.EAN_PAR[0], 'LLLLLL', '首位 0 = 全 L（UPC-A 就靠这条）')

/* ---------- 3. 校验位 ---------- */
is(B.checkDigit('590123412345', 'ean13'), '7', 'EAN-13 校验位 5901234123457')
is(B.checkDigit('400638133393', 'ean13'), '1', 'EAN-13 校验位 4006381333931')
is(B.checkDigit('0000000', 'ean8'), '0', 'EAN-8 校验位 00000000')
is(B.checkDigit('9638507', 'ean8'), '4', 'EAN-8 校验位 96385074')
is(B.checkDigit('03600029145', 'upca'), '2', 'UPC-A 校验位 036000291452')
is(B.checkDigit('01234567890', 'upca'), '5', 'UPC-A 校验位 012345678905')
// 自洽：任何一条完整码去掉校验位再算一次，应还原出同一位
for (const sym of ['ean13', 'ean8', 'upca']) {
  for (let n = 0; n < 30; n++) {
    let body = ''
    for (let i = 0; i < (sym === 'ean13' ? 12 : sym === 'ean8' ? 7 : 11); i++) body += String(Math.floor(Math.random() * 10))
    if (sym === 'upca') body = String(n % 2) + body.slice(1)
    const c = B.checkDigit(body, sym)
    is(B.checkDigit(body + c, sym).length, 1, sym + ' 校验位是一位数字')
    is(B.normalize(body, sym), body + c, sym + ' 自动补位')
    is(B.normalize(body + c, sym), body + c, sym + ' 带位输入原样通过')
  }
}

/* ---------- 4. 模块总数 ---------- */
is(B.encode('590123412345', 'ean13').moduleCount, 95, 'EAN-13 共 95 模块')
is(B.encode('9638507', 'ean8').moduleCount, 67, 'EAN-8 共 67 模块')
is(B.encode('03600029145', 'upca').moduleCount, 95, 'UPC-A 共 95 模块')
for (const n of [1, 2, 5, 12, 40]) {
  is(B.encode('A'.repeat(n), 'code39').moduleCount, 15 * (n + 2) + (n + 1), 'Code 39 长度公式 n=' + n)
}

/* ---------- 5. 结构分段 ---------- */
{
  const e = B.encode('590123412345', 'ean13')
  is(e.structure.length, 15, 'EAN-13 结构段 = 2 守卫 + 12 数据 + 1 中缝')
  is(e.structure.filter((s) => s.kind === 'guard').length, 3, 'EAN-13 三段守卫')
  is(e.structure[0].from, 0, '首段从 0 开始')
  is(e.structure[e.structure.length - 1].to, 95, '末段正好收尾')
  is(e.structure[1].kind, 'data', '第二格按 L 码')
  const g = B.encode('400638133393', 'ean13')
  is(g.structure.filter((s) => s.kind === 'dataG').length > 0, true, '奇偶表把某些左半位换成 G 码')
  const c = B.encode('AB-12', 'code39')
  is(c.structure.length, 7, 'Code 39 结构段 = 2 分隔符 + 5 数据')
  is(c.structure[0].kind, 'delim', '首尾是分隔符')
  is(c.structure.map((s) => s.text).join('|'), '*|A|B|-|1|2|*', '结构段标注内容')
}

/* ---------- 6. 输入校验（中文报错）---------- */
throws(() => B.encode('', 'ean13'), '空输入')
throws(() => B.encode('5901234123', 'ean13'), 'EAN-13 位数不足')
throws(() => B.encode('5901234123456', 'ean13'), 'EAN-13 校验位错')
throws(() => B.encode('59012341234a', 'ean13'), 'EAN-13 混进字母')
throws(() => B.encode('963850', 'ean8'), 'EAN-8 位数不足')
throws(() => B.encode('96385075', 'ean8'), 'EAN-8 校验位错')
throws(() => B.encode('3600029145', 'upca'), 'UPC-A 位数不足')
throws(() => B.encode('AB#CD', 'code39'), 'Code 39 非法字符 #')
throws(() => B.encode('价格 100', 'code39'), 'Code 39 中文')
throws(() => B.encode('A'.repeat(41), 'code39'), 'Code 39 超长')
throws(() => B.encode('590123412345', 'nope'), '不认识的条码类型')
is(B.normalize(' 590-1234 12345 ', 'ean13'), '5901234123457', '空格与连字符当作排版忽略')
is(B.normalize('pk-2026', 'code39'), 'PK-2026', 'Code 39 自动转大写')
is(B.encode('590123412345', 'ean13').appended, '7', 'appended 标出补的校验位')
is(B.encode('5901234123457', 'ean13').appended, null, '自带校验位时 appended 为 null')

/* ---------- 7. 回读自洽 ---------- */
{
  const msgs = ['A', 'HELLO WORLD', 'PK-2026-0921', '0123456789', '$100.00', 'ABC', 'CODE39', 'X Y Z', '9']
  for (const m of msgs) is(B.readBack(B.encode(m, 'code39').modules, 'code39'), m, 'Code 39 回读 ' + m)
  for (let n = 0; n < 40; n++) {
    const d12 = B.encode(String(Math.floor(Math.random() * 1e12)).padStart(12, '0'), 'ean13').payload
    is(B.readBack(B.encode(d12, 'ean13').modules, 'ean13'), d12, 'EAN-13 回读 ' + d12)
    const d7 = String(Math.floor(Math.random() * 1e7)).padStart(7, '0')
    is(B.readBack(B.encode(d7, 'ean8').modules, 'ean8'), B.normalize(d7, 'ean8'), 'EAN-8 回读 ' + d7)
    const d11 = String(n % 2) + String(Math.floor(Math.random() * 1e10)).padStart(10, '0')
    is(B.readBack(B.encode(d11, 'upca').modules, 'upca'), B.normalize(d11, 'upca'), 'UPC-A 回读 ' + d11)
  }
  throws(() => B.readBack('101' + '0'.repeat(42) + '01010', 'ean13'), '回读能识别坏结构')
  throws(() => B.readBack('11111111111', 'code39'), '回读能识别坏 Code 39')
}

/* ---------- 8. runs / widthProfile ---------- */
{
  const e = B.encode('590123412345', 'ean13')
  is(B.runsOf('101').length, 3, 'runsOf 合并同色')
  is(e.runs[0].on, true, 'EAN-13 以条开始')
  is(e.runs.reduce((s, r) => s + r.len, 0), 95, 'runs 总长等于模块数')
  const w = B.widthProfile(e.modules)
  is(w.runs, e.runs.length, 'widthProfile 与 runsOf 一致')
  is(w.wide, e.runs.filter((r) => r.len >= 3).length, 'widthProfile 宽段计数')
  is(e.stats.dark + e.stats.light, 95, 'stats 明暗相加 = 模块数')
  is(e.stats.chars, 13, 'stats 字符数')
}

/* ---------- 9. 外部判官：zbarimg ---------- */
const ZBAR = '/opt/homebrew/bin/zbarimg'
const ZBAR_ALT = 'zbarimg'
function which() {
  try {
    execFileSync('which', [ZBAR], { stdio: 'ignore' })
    return ZBAR
  } catch (e) {
    /* next */
  }
  try {
    execFileSync('which', [ZBAR_ALT], { stdio: 'ignore' })
    return ZBAR_ALT
  } catch (e) {
    return null
  }
}
const Z = which()
const TMP = mkdirSync(tmpdir() + '/pkbar', { recursive: true }) || tmpdir() + '/pkbar'
function pbm(modules, quiet, file, scale) {
  const line = '0'.repeat(quiet) + modules + '0'.repeat(quiet)
  const px = []
  for (const c of line) for (let k = 0; k < scale; k++) px.push(c === '1' ? 0 : 1)
  let out = 'P1\n' + px.length + ' 60\n'
  const row = px.map((v) => (v ? '0' : '1')).join(' ')
  for (let y = 0; y < 60; y++) out += row + '\n'
  writeFileSync(file, out)
  return file
}
function zdecode(file, symb) {
  try {
    return execFileSync(Z, ['-Sdisable', '-S' + symb + '.enable', '-q', '--raw', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).replace(/\n$/, '')
  } catch (e) {
    return null
  }
}
if (!Z) {
  console.log('SKIP 外部解码器：没找到 zbarimg，位模表只过了结构与自洽两层')
} else {
  const quietOf = (sym) => B.SYMS.find((s) => s.key === sym).quiet
  let judged = 0
  const cases = []
  for (const m of ['HELLO', 'CODE39', 'PK-2026-0921', '0123456789', '$100.00', 'A', 'Q', 'ABC ABC ABC', 'X-Y Z', '9']) {
    cases.push({ sym: 'code39', symb: 'code39', payload: m })
  }
  for (let n = 0; n < 20; n++) cases.push({ sym: 'ean13', symb: 'ean13', payload: String(Math.floor(Math.random() * 1e12)).padStart(12, '0') })
  for (let n = 0; n < 10; n++) cases.push({ sym: 'ean8', symb: 'ean8', payload: String(Math.floor(Math.random() * 1e7)).padStart(7, '0') })
  for (let n = 0; n < 10; n++) cases.push({ sym: 'upca', symb: 'ean13', payload: String(n % 2) + String(Math.floor(Math.random() * 1e10)).padStart(10, '0') })
  for (const c of cases) {
    const enc = B.encode(c.payload, c.sym)
    const f = TMP + '/b.pbm'
    pbm(enc.modules, quietOf(c.sym), f, 3)
    const dec = zdecode(f, c.symb)
    const want = c.sym === 'upca' ? '0' + enc.payload : enc.payload
    if (dec === want) judged++
    else {
      fail++
      console.log('FAIL zbar ' + c.sym + ' ' + JSON.stringify(c.payload) + ' -> ' + JSON.stringify(dec))
    }
    unlinkSync(f)
  }
  ok += judged
  console.log('zbarimg 外部判官：' + judged + '/' + cases.length + ' 读回一致')
}

console.log(`barcode 全绿 ${ok}/${ok + fail}`)
if (fail) process.exit(1)
