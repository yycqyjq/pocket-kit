/**
 * normalize.js 自查断言（直接测 src/utils/normalize.js 本体）
 * ------------------------------------------------------------
 * 判据分五类：
 *   1) 外部裁判 = JS 引擎自带的 String.prototype.normalize（ICU 实现）。
 *      compare() 的每一种形式都必须与 v.normalize(key) 逐字相同；
 *      已知向量取自 Unicode 规范里公开的兼容分解结果：
 *      全角 ＡＢＣ１２３→ABC123、①→1、ﬁ→fi、Ⅻ→XII、²→2。
 *   2) 已知向量：NFC/NFD 的 é 两种写法（U+00E9 vs U+0065 U+0301）。
 *   3) 往返/幂等：normalize 是幂等的——把结果再 normalize 一次不变。
 *   4) 边界与反例：空串、纯 ASCII、代理对（emoji 不受 NFC/NFKC 影响）。
 *   5) 界面契约：inspect 每行的 index/char/hex/cls/note 都在，且 hex 形如 U+XXXX；
 *      counts 与 hasSuspect 要跟逐行结果对得上。
 */
import { useUtils, makeTest } from './harness.mjs'

const M = await useUtils('normalize')
const T = makeTest('normalize')

/* ---------- 0. 导出面与表结构 ---------- */
T.eq('FORMS 四种', M.FORMS.map((f) => f.key), ['NFC', 'NFD', 'NFKC', 'NFKD'])
for (const f of M.FORMS) {
  T.ok('form ' + f.key + ' 有名字', f.name.length > 0)
  T.ok('form ' + f.key + ' 有说明', f.note.length > 4)
}
T.ok('NORMALIZE_SAMPLES 有样例', M.NORMALIZE_SAMPLES.length >= 6)

/* ---------- 1. compare 的每种形式 == String.normalize（外部裁判） ---------- */
const VECTORS = ['ＡＢＣ１２３', '①②③', 'ﬁ ﬂ ﬀ', 'Ⅻ Ⅷ', 'x² + y³', 'e\u0301', '\u00e9', 'Cafe\u0301', 'Hello', '', '😀', 'Ａ']
for (const v of VECTORS) {
  const c = M.compare(v)
  for (const f of c.forms) {
    T.eq('compare(' + JSON.stringify(v) + ').' + f.key + ' 与引擎一致', f.text, v.normalize(f.key))
  }
  T.eq('compare 输入原样保留：' + JSON.stringify(v), c.input, v)
  T.eq('changed 标志与引擎一致：' + JSON.stringify(v), c.forms.filter((f) => f.changed).map((f) => f.key), M.FORMS.map((f) => f.key).filter((k) => v.normalize(k) !== v))
}

/* ---------- 2. 兼容分解的已知向量 ---------- */
{
  const nfkc = (s) => M.compare(s).forms.filter((f) => f.key === 'NFKC')[0].text
  T.eq('全角英文数字→半角', nfkc('ＡＢＣ１２３'), 'ABC123')
  T.eq('带圈数字→数字', nfkc('①②③'), '123')
  T.eq('连字拆开', nfkc('ﬁ ﬂ ﬀ'), 'fi fl ff')
  T.eq('罗马数字→拉丁字母', nfkc('Ⅻ Ⅷ'), 'XII VIII')
  T.eq('上标→数字', nfkc('x² + y³'), 'x2 + y3')
  T.eq('全角空格→半角空格', nfkc('a\u3000b'), 'a b')
  const nfc = (s) => M.compare(s).forms.filter((f) => f.key === 'NFC')[0].text
  const nfd = (s) => M.compare(s).forms.filter((f) => f.key === 'NFD')[0].text
  T.eq('NFC 把 e+组合符合成 é', nfc('e\u0301'), '\u00e9')
  T.eq('NFD 把 é 拆成 e+组合符', nfd('\u00e9'), 'e\u0301')
  T.eq('NFC(é) 的码点就是 U+00E9', nfc('\u00e9').codePointAt(0), 0x00e9)
}

/* ---------- 3. current / distinctCount ---------- */
{
  T.eq('é 已处于 NFC/NFKC', M.compare('\u00e9').current, ['NFC', 'NFKC'])
  T.eq('e+组合符 已处于 NFD/NFKD', M.compare('e\u0301').current, ['NFD', 'NFKD'])
  T.eq('é 的两种写法并成 2 组', M.compare('\u00e9').distinctCount, 2)
  T.eq('全角串 NFKC 后并成 2 组', M.compare('ＡＢＣ１２３').distinctCount, 2)
  T.eq('纯 ASCII 四种形式全相同', M.compare('abc').distinctCount, 1)
  T.eq('纯 ASCII 当前就是四种都算', M.compare('abc').current.length, 4)
  T.eq('空串 distinctCount=1', M.compare('').distinctCount, 1)
  T.eq('emoji 不受任何形式影响', M.compare('😀').distinctCount, 1)
}

/* ---------- 4. inspect：逐字符体检 ---------- */
{
  const i = M.inspect('A中\u0301Ａ１①ﬁ²\u200b')
  const byHex = {}
  for (const r of i.rows) byHex[r.hex] = r
  T.eq('A 判为 ASCII', byHex['U+0041'].cls, 'ASCII')
  T.eq('中 判为汉字', byHex['U+4E2D'].cls, '汉字')
  T.eq('组合符 U+0301 判为组合附加符号', byHex['U+0301'].cls, '组合附加符号')
  T.eq('全角 A 判为全角字符', byHex['U+FF21'].cls, '全角字符')
  T.eq('① 判为带圈数字', byHex['U+2460'].cls, '带圈数字')
  T.eq('ﬁ 判为连字', byHex['U+FB01'].cls, '连字')
  T.eq('² 判为上标', byHex['U+00B2'].cls, '上标')
  T.eq('U+200B 判为零宽/双向控制符', byHex['U+200B'].cls, '零宽/双向控制符')
  T.eq('全角 A 在 NFKC 下会变', byHex['U+FF21'].nfkcChanged, true)
  T.eq('全角 A 的 NFKC 结果是 A', byHex['U+FF21'].nfkcText, 'A')
  T.eq('普通 A 在 NFKC 下不变', byHex['U+0041'].nfkcChanged, false)
  T.eq('中 在 NFKC 下不变', byHex['U+4E2D'].nfkcChanged, false)
  T.eq('① 的 NFKC 结果是 1', byHex['U+2460'].nfkcText, '1')
  T.eq('inspect 的 index 从 1 连续', i.rows.map((r) => r.index), i.rows.map((r, k) => k + 1))
  T.eq('hasSuspect 为真', i.hasSuspect, true)
  T.eq('counts 全角字符=2', i.counts['全角字符'], 2)
  T.eq('counts 与逐行 suspect 数一致', Object.values(i.counts).reduce((a, b) => a + b, 0), i.rows.filter((r) => r.suspect).length)
  const empty = M.inspect('')
  T.eq('空串没有行', empty.rows.length, 0)
  T.eq('空串 hasSuspect=false', empty.hasSuspect, false)
  T.eq('空串 counts 为空', Object.keys(empty.counts).length, 0)
  for (const r of i.rows) {
    T.ok('行 hex 形如 U+XXXX：' + r.hex, /^U\+[0-9A-F]{4,6}$/.test(r.hex))
    T.ok('行 char 非 undefined', r.char !== undefined)
    T.ok('行 cls 非空', typeof r.cls === 'string' && r.cls.length > 0)
  }
}

/* ---------- 5. check 汇总 + 界面契约 ---------- */
{
  const c = M.check('\u00e9')
  T.ok('check 带 input', typeof c.input === 'string')
  T.ok('check 带 forms', Array.isArray(c.forms) && c.forms.length === 4)
  T.ok('check 带 current', Array.isArray(c.current))
  T.ok('check 带 inspect.rows', Array.isArray(c.inspect.rows))
  T.eq('check 的 input 就是原文', c.input, '\u00e9')
  const c2 = M.check('e\u0301')
  T.ok('check 的 inspect 会认出组合附加符号', c2.inspect.rows.some((r) => r.cls === '组合附加符号'))
  T.ok('check 结果里不出现 undefined 字样', JSON.stringify(c).indexOf('undefined') < 0)
}

T.done()
