/**
 * qrcode.js 自查断言（直接测 src/utils/qrcode.js 本体）
 * ------------------------------------------------------------
 * 三层判据，从强到弱写清楚：
 *   1) 外部判官（有就跑，没有就跳过并打印原因）：
 *      encode → PBM → ImageMagick 放大 → zbarimg 解码，
 *      用第三方解码器读回原文，这是真正的「符合 ISO/IEC 18004」证据。
 *   2) 公开常量与几何公式：
 *      容量表抽查 ISO/IEC 18004 Table 9 的公开值；
 *      码字总量用模块数反推（totalCodewords = floor(可用模块 / 8)），
 *      与表里的 dataCodewords + eccPerBlock × blocks 对齐——两条独立来源；
 *      format/version 信息位校验 BCH(15,5)、BCH(18,6) 整除性。
 *   3) 自洽：本 util 自己的 decodeMatrix 读回 encode 结果。
 *      这只证明互为逆过程，不证明符合规范，所以标注为自洽层。
 */
import { useUtils } from './harness.mjs'
import { execFileSync } from 'node:child_process'
import { writeFileSync, unlinkSync, existsSync } from 'node:fs'

const Q = await useUtils('qrcode')

let ok = 0
let fail = 0
function is(a, b, m) {
  if (a === b) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b))
  }
}
function has(s, sub, m) {
  if (String(s).indexOf(sub) >= 0) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': ' + JSON.stringify(String(s).slice(0, 200)) + ' 不含 ' + sub)
  }
}
function throws(fn, m) {
  try {
    fn()
    fail++
    console.log('FAIL ' + m + ': should throw')
  } catch (e) {
    if (/[\u4e00-\u9fa5]/.test(String(e && e.message))) ok++
    else {
      fail++
      console.log('FAIL ' + m + ': 报错不是中文 ' + e.message)
    }
  }
}
/** GF(2) 多项式取余，用来独立验证 BCH 校验位 */
function gfMod(dividend, divisor) {
  let v = dividend
  const shift = (divisor.toString(2).length - 1) | 0
  for (let i = 31 - shift; i >= 0; i--) {
    if ((v >>> (i + shift)) & 1) v ^= divisor << i
  }
  return v & ((1 << shift) - 1)
}

/* ---------- 0. 导出面 ---------- */
;[
  'QUIET_ZONE',
  'capacityOf',
  'maxChars',
  'formatInfoBits',
  'versionInfoBits',
  'encode',
  'decodeMatrix',
  'toSvgMatrix',
  'buildWifi',
  'buildVCard',
  'QR_SAMPLES',
  'ELEVEL_INFO',
].forEach((k) => is(Q[k] === undefined, false, 'export:' + k))
is(Q.QUIET_ZONE, 4, 'quietZoneIs4')
is(Q.ELEVEL_INFO.map((x) => x.key).join(''), 'LMQH', 'elevelOrder')
is(Q.QR_SAMPLES.length >= 5, true, 'samplesCount')

/* ---------- 1. 容量表抽查（ISO/IEC 18004 Table 9 公开值） ---------- */
const CAP = [
  // [版本, 等级, 数字, 字母数字, 字节]
  [1, 'L', 41, 25, 17],
  [1, 'M', 34, 20, 14],
  [1, 'Q', 27, 16, 11],
  [1, 'H', 17, 10, 7],
  [2, 'M', 63, 38, 26],
  [10, 'M', 513, 311, 213],
  [14, 'Q', 621, 376, 258],
  [27, 'L', 3517, 2132, 1465],
  [33, 'M', 3909, 2369, 1628],
  [40, 'L', 7089, 4296, 2953],
  [40, 'M', 5596, 3391, 2331],
]
CAP.forEach(([v, e, n, a, b]) => {
  const c = Q.capacityOf(v, e)
  is(c.numeric, n, `cap${v}${e}numeric`)
  is(c.alphanumeric, a, `cap${v}${e}aln`)
  is(c.byte, b, `cap${v}${e}byte`)
  is(Q.maxChars(v, e, 'byte'), b, `maxChars${v}${e}`)
})

/* ---------- 2. 码字总量用模块几何反推（独立于容量表） ---------- */
/** 去掉定位/定时/格式/版本/校正图形后还剩多少可放数据的模块 */
function rawDataModules(v) {
  let n = (16 * v + 128) * v + 64
  if (v >= 2) {
    const align = Math.floor(v / 7) + 2
    n -= (25 * align - 10) * align - 55
    if (v >= 7) n -= 36
  }
  return n
}
for (let v = 1; v <= 40; v++) {
  const byGeometry = Math.floor(rawDataModules(v) / 8)
  ;['L', 'M', 'Q', 'H'].forEach((e) => {
    const c = Q.capacityOf(v, e)
    is(c.totalCodewords, byGeometry, `geom${v}${e}`)
    is(c.dataCodewords + c.eccPerBlock * c.blocks, c.totalCodewords, `split${v}${e}`)
    is(c.dataCodewords > 0 && c.eccPerBlock > 0 && c.blocks > 0, true, `positive${v}${e}`)
  })
}
// 同一版本下等级越高数据码字越少；同一等级下版本越高容量越大
for (const v of [1, 7, 12, 25, 40]) {
  const rows = ['L', 'M', 'Q', 'H'].map((e) => Q.capacityOf(v, e).dataCodewords)
  is(rows.every((x, i) => i === 0 || x < rows[i - 1]), true, `levelMonotone${v}`)
}
for (const e of ['L', 'M', 'Q', 'H']) {
  let prev = 0
  for (let v = 1; v <= 40; v++) {
    const c = Q.capacityOf(v, e)
    is(c.byte > prev, true, `byteMonotone${e}${v}`)
    prev = c.byte
  }
}
throws(() => Q.capacityOf(0, 'M'), 'capV0')
throws(() => Q.capacityOf(41, 'M'), 'capV41')
throws(() => Q.capacityOf(1, 'Z'), 'capBadLevel')

/* ---------- 3. format / version 信息位 ---------- */
const LEVEL_BITS = { L: 1, M: 0, Q: 3, H: 2 }
is(Q.formatInfoBits('L', 0), 0b111011111000100, 'fmtPublishedL0')
is(Q.formatInfoBits('M', 0), 0b101010000010010, 'fmtPublishedM0')
;['L', 'M', 'Q', 'H'].forEach((e) => {
  for (let m = 0; m < 8; m++) {
    const bits = Q.formatInfoBits(e, m)
    is(bits >> 15, 0, `fmt15bit${e}${m}`)
    const unmasked = bits ^ 0x5412
    is(gfMod(unmasked, 0x537), 0, `fmtBch${e}${m}`)
    is(unmasked >> 10, (LEVEL_BITS[e] << 3) | m, `fmtData${e}${m}`)
  }
})
is(Q.versionInfoBits(6), 0, 'verV6')
for (let v = 7; v <= 40; v++) {
  const bits = Q.versionInfoBits(v)
  is(bits >> 18, 0, `ver18bit${v}`)
  is(gfMod(bits, 0x1f25), 0, `verBch${v}`)
  is(bits >> 12, v, `verData${v}`)
}
is(Q.versionInfoBits(7), 0b000111110010010100, 'verPublishedV7')

/* ---------- 4. 矩阵结构 ---------- */
function at(q, x, y) {
  return q.modules[y][x] ? 1 : 0
}
for (const v of [1, 7, 10, 27]) {
  const text = 'X'.repeat(Math.max(1, Q.capacityOf(v, 'H').byte - 30))
  const q = Q.encode(text, { elevel: 'H', version: v })
  const size = 4 * v + 17
  is(q.size, size, `size${v}`)
  is(q.version, v, `echoVersion${v}`)
  q.modules.forEach((row) => is(row.length, size, `square${v}`))
  // 三个角上的 7×7 回字
  ;[[0, 0], [size - 7, 0], [0, size - 7]].forEach(([ox, oy]) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const ring = Math.max(x, y) === 6 || Math.min(x, y) === 0
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4
        const want = ring || core ? 1 : 0
        if (at(q, ox + x, oy + y) !== want) {
          fail++
          console.log(`FAIL finder${v}@${ox + x},${oy + y}`)
        } else ok++
      }
    }
  })
  // 定时图形
  for (let i = 8; i < size - 8; i++) {
    is(at(q, i, 6), i % 2 === 0 ? 1 : 0, `timingRow${v}@${i}`)
    is(at(q, 6, i), i % 2 === 0 ? 1 : 0, `timingCol${v}@${i}`)
  }
  // 固定的黑模块
  is(at(q, 8, size - 8), 1, `darkModule${v}`)
  is(typeof q.darkModule, 'boolean', `darkModuleType${v}`)
  is(q.mask >= 0 && q.mask <= 7, true, `maskRange${v}`)
  is(q.penalty >= 0, true, `penalty${v}`)
  is(q.modules.flat().every((x) => typeof x === 'boolean'), true, `boolMatrix${v}`)
}

/* ---------- 5. 模式选择与最小版本 ---------- */
const numeric = Q.encode('0123456789', { elevel: 'L' })
is(numeric.mode, 'numeric', 'modeNumeric')
is(numeric.segments.length, 1, 'numericOneSeg')
is(numeric.segments[0].chars, 10, 'numericChars')
is(numeric.version, 1, 'numericV1')
is(Q.encode('HELLO WORLD', { elevel: 'L' }).mode, 'alphanumeric', 'modeAlnum')
is(Q.encode(' pockets', { elevel: 'L' }).mode, 'byte', 'modeByte')
// 字母小写只能走字节模式，但「字母+长数字串」必须分成两段才划算；
// 而 abc123 这种短串，单段字节反而比两段加起来更短，规划器就该选单段。
const mixed = Q.encode('POCKET1380013800012345678', { elevel: 'L' })
is(mixed.mode, 'mixed', 'modeMixed')
is(mixed.segments.length, 2, 'mixedSegs')
is(mixed.segments.map((x) => x.mode).join('+'), 'alphanumeric+numeric', 'mixedSegModes')
is(
  mixed.segments.reduce((s, x) => s + x.chars, 0),
  25,
  'mixedCharsSum'
)
is(Q.encode('abc123', { elevel: 'L' }).segments.length, 1, 'shortMixStaysSingle')
is(mixed.segments.every((x) => x.bits > 0), true, 'segHasBits')
is(Q.encode('随身匣', { elevel: 'M' }).mode, 'byte', 'modeCjk')
is(Q.encode('随身匣', { elevel: 'M' }).segments[0].bytes, 9, 'cjkUtf8Bytes')
// 版本必须取「装得下的最小那一版」
for (const e of ['L', 'M', 'Q', 'H']) {
  const cap = Q.capacityOf(4, e).byte
  const just = Q.encode('a'.repeat(cap), { elevel: e })
  is(just.version, 4, `tightVersion${e}`)
  const over = Q.encode('a'.repeat(cap + 1), { elevel: e })
  is(over.version, 5, `bumpVersion${e}`)
  is(over.version > just.version, true, `monotoneVersion${e}`)
}
throws(() => Q.encode('', { elevel: 'M' }), 'emptyText')
throws(() => Q.encode('A'.repeat(4000), { elevel: 'H' }), 'overCapacity')
try {
  Q.encode('A'.repeat(4000), { elevel: 'H' })
} catch (err) {
  has(err.message, '超出容量', 'overCapacityWords')
  has(err.message, '纠错等级', 'overCapacityAdvice')
}
throws(() => Q.encode('abc', { elevel: 'Z' }), 'badLevelArg')
throws(() => Q.encode('abc', { version: 99 }), 'badVersionArg')

/* ---------- 6. 自洽层：encode → decodeMatrix ---------- */
const RT = [
  '0',
  '12345678901234567890',
  'HELLO WORLD $ 12345',
  'https://example.com/pocketkit',
  '随身匣 · 离线工具箱，共 73 件',
  '🎉 emoji 与中文混排 ok',
  'a1B2c3D4'.repeat(30),
  'WIFI:T:WPA;S:MyRouter;P:passw0rd;;',
  'x'.repeat(1200),
]
RT.forEach((t, i) => {
  ;['L', 'M', 'Q', 'H'].forEach((e) => {
    try {
      const q = Q.encode(t, { elevel: e })
      const back = Q.decodeMatrix(q.modules)
      is(back.text, t, `roundtrip${i}${e}`)
      is(back.version, q.version, `rtVersion${i}${e}`)
      is(back.elevel, e, `rtLevel${i}${e}`)
      is(back.mask, q.mask, `rtMask${i}${e}`)
      // syndromesOk 这条本身是恒真：校验不过 decodeMatrix 直接 throw，走不到这里，
      // 保留只为文档性。真正的判据是下面三行——破坏数据区的模块，必须被伴随式校验拦下。
      // 破坏位置用右下角：它是码字填充起点、恒属数据/纠错区（finder 只占三个角、
      // format 贴着 finder、alignment 最靠边的中心在 n-7，都不与 (n-1,n-1) 重叠）。
      // 不能用几何中心——大版本的 alignment pattern 恰好在中心，翻它不抛是正常的。
      is(back.syndromesOk, true, `rtSyndromes${i}${e}`)
      const broken = q.modules.map((row) => row.slice())
      broken[broken.length - 1][broken.length - 1] ^= 1
      let corruptedThrew = false
      try {
        Q.decodeMatrix(broken)
      } catch (ignore) {
        corruptedThrew = true
      }
      is(corruptedThrew, true, `rtDetectCorrupt${i}${e}`)
    } catch (err) {
      fail++
      console.log(`FAIL roundtrip${i}${e}: ${err.message}`)
    }
  })
})
throws(() => Q.decodeMatrix([]), 'decodeEmpty')
throws(() => Q.decodeMatrix([[0, 1, 0]]), 'decodeTiny')

/* ---------- 7. SVG 导出 ---------- */
const svg = Q.toSvgMatrix(numeric.modules, { scale: 4, margin: 8 })
has(svg, '<svg', 'svgTag')
has(svg, 'xmlns', 'svgNs')
is(svg.indexOf('<svg') === 0 || svg.trim().indexOf('<svg') === 0, true, 'svgStarts')
is(/(rect|path)/.test(svg), true, 'svgHasShape')

/* ---------- 8. Wi-Fi 与 vCard 文本 ---------- */
is(Q.buildWifi({ ssid: 'MyAP', password: 'p@ss', auth: 'WPA' }), 'WIFI:T:WPA;S:MyAP;P:p@ss;;', 'wifiPlain')
is(Q.buildWifi({ ssid: 'A', password: 'b', auth: 'nopass' }), 'WIFI:T:nopass;S:A;;', 'wifiOpen')
is(Q.buildWifi({ ssid: 'My AP', auth: 'WPA', hidden: true }).indexOf('H:true') > 0, true, 'wifiHidden')
is(Q.buildWifi({ ssid: 'a;b', auth: 'WPA' }), 'WIFI:T:WPA;S:a\\;b;P:;;', 'wifiEscSemicolon')
is(Q.buildWifi({ ssid: 'a\\b', auth: 'WPA' }), 'WIFI:T:WPA;S:a\\\\b;P:;;', 'wifiEscBackslash')

const vc = Q.buildVCard({ name: '张三', tel: '13800138000', org: 'A;B' })
has(vc, 'BEGIN:VCARD', 'vcBegin')
has(vc, 'VERSION:3.0', 'vcVersion')
has(vc, 'FN:张三', 'vcFn')
has(vc, 'TEL;TYPE=CELL:13800138000', 'vcTel')
has(vc, 'ORG:A\\;B', 'vcEscSemi')
has(vc, 'END:VCARD', 'vcEnd')
is(vc.split('\r\n').length >= 4, true, 'vcCrlf')
is(Q.buildWifi({ ssid: '' }), 'WIFI:T:WPA;S:;P:;;', 'wifiNoSsid')

/* ---------- 9. 外部判官：zbarimg 真解码（缺工具就跳过） ---------- */
// 定位顺序：Homebrew 常见绝对路径在前，PATH 兜底。macOS 上 zbar 明明装着
// 却常常不在 PATH（本机就是：/opt/homebrew/bin 有、which 找不到），只按 PATH 找
// 会「静默跳过」，把没验证说成验证过了。三个环境都要认：
// Apple Silicon Homebrew、Intel Homebrew、Linux CI 的 /usr/bin（本就在 PATH）。
function findBin(candidates) {
  for (const c of candidates) {
    try {
      if (c.includes('/')) {
        if (existsSync(c)) return c
      } else {
        const p = execFileSync('which', [c], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
        if (p) return p
      }
    } catch (e) {
      /* next */
    }
  }
  return null
}
const ZBAR = findBin(['/opt/homebrew/bin/zbarimg', '/usr/local/bin/zbarimg', 'zbarimg'])
const MAGICK = findBin(['/opt/homebrew/bin/magick', '/usr/local/bin/magick', 'magick', 'convert'])
if (!ZBAR || !MAGICK) {
  console.log('SKIP zbar 判官：PATH 里缺 ' + [!ZBAR && 'zbarimg', !MAGICK && 'ImageMagick'].filter(Boolean).join(' / ') + '，第 9 组外部验证未跑')
} else {
  let judged = 0
  RT.concat(['POCKET-KIT 2026', '13800138000', '中文与 emoji 🚀 混排']).forEach((t, i) => {
    const e = ['L', 'M', 'Q', 'H'][i % 4]
    let q
    try {
      q = Q.encode(t, { elevel: e })
    } catch (err) {
      fail++
      console.log('FAIL zbarEncode' + i + ': ' + err.message)
      return
    }
    const quiet = Q.QUIET_ZONE
    const side = q.size + quiet * 2
    const rows = []
    for (let y = 0; y < side; y++) {
      const line = []
      for (let x = 0; x < side; x++) {
        const inCode = x >= quiet && y >= quiet && x < side - quiet && y < side - quiet
        line.push(inCode && q.modules[y - quiet][x - quiet] ? '1' : '0')
      }
      rows.push(line.join(' '))
    }
    const pbm = '/tmp/pk-qr-' + i + '.pbm'
    const png = '/tmp/pk-qr-' + i + '.png'
    writeFileSync(pbm, 'P1\n' + side + ' ' + side + '\n' + rows.join('\n') + '\n')
    execFileSync(MAGICK, [pbm, '-scale', '600x600', '-border', '12', '-bordercolor', 'white', png])
    let out
    try {
      out = execFileSync(ZBAR, ['-q', '--raw', png], { encoding: 'utf8' })
    } catch (err) {
      out = String((err && err.stdout) || '')
    }
    is(out.replace(/\n$/, ''), t, 'zbarDecode#' + i + '(' + e + ' v' + q.version + ')')
    judged++
    unlinkSync(pbm)
    unlinkSync(png)
  })
  console.log('  zbar 判官：' + judged + ' 张码由第三方解码器读回原文')
}

console.log(fail ? 'qrcode 有 ' + fail + ' 条不过' : 'qrcode 全绿 ' + ok + '/' + (ok + fail))
process.exit(fail ? 1 : 0)
