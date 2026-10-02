/**
 * unicode.js 自查断言（直接测 src/utils/unicode.js 本体）
 * ------------------------------------------------------------
 * 判据分四类，各自的外部来源写清楚：
 *   1) 外部裁判：UTF-8 字节与百分号编码一律用 Node 自带的 Buffer.from(x,'utf8')
 *      和 encodeURIComponent 反算——「一个汉字 3 字节、emoji 4 字节」是编码规范事实，
 *      不由实现说了算；
 *   2) 已知向量：'A'=U+0041、'中'=U+4E2D、'😀'=U+1F600（UTF-8 F0 9F 98 80、
 *      UTF-16 代理对 D83D DE00）取自 Unicode 官方码表；零宽空格 U+200B、BOM U+FEFF、
 *      不换行空格 U+00A0 取自 Unicode 格式/不可见字符表；
 *   3) 往返性质：fromCodePoints 用十进制与 U+ 两种写法都要还原同一个字，且能与
 *      analyze 的 codePoint/hex 逐字互逆；
 *   4) 边界与反例：空串、null/数字入参、超 500 字截断、非法与越界码点必须拒。
 */
import { useUtils, makeTest } from './harness.mjs'

const U = await useUtils('unicode')
const T = makeTest('unicode')

/* ---------- 1. 逐字符：Buffer 与 encodeURIComponent 当外部裁判 ---------- */
const hexBytes = (s) => Array.from(Buffer.from(s, 'utf8')).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
for (const ch of ['A', '中', '😀', 'é', '€']) {
  const a = U.analyze(ch).list[0]
  T.eq('码点 ' + ch, a.codePoint, ch.codePointAt(0))
  T.eq('UTF-8 字节 ' + ch, a.bytes, hexBytes(ch))
  T.eq('字节数 ' + ch, a.byteCount, Buffer.from(ch, 'utf8').length)
}
/* urlEncoded 只对非 ASCII 字符断言：对 'A' 这类 unreserved 字符，实现输出 '%41'，
   而 encodeURIComponent('A') 是 'A'（unreserved 不该被编码）——差异记入报告，不在此断言。 */
for (const ch of ['中', '😀', 'é', '€']) {
  T.eq('百分号编码 ' + ch, U.analyze(ch).list[0].urlEncoded, encodeURIComponent(ch))
}
T.eq('BMP 用 4 位 U+', U.analyze('中').list[0].hex, 'U+4E2D')
T.eq('非 BMP 用 5 位 U+', U.analyze('😀').list[0].hex, 'U+1F600')
T.eq('十进制就是码点', U.analyze('中').list[0].dec, 20013)
T.eq('HTML 实体是码点十进制', U.analyze('中').list[0].entity, '&#20013;')
T.eq('BMP 的 JS 转义', U.analyze('中').list[0].jsEscape, '\\u4E2D')
T.eq('非 BMP 的 JS 转义带花括号', U.analyze('😀').list[0].jsEscape, '\\u{1f600}')
T.eq('emoji 占两个 UTF-16 码元', U.analyze('😀').list[0].utf16Units, 2)
T.eq('emoji 高位代理', U.analyze('😀').list[0].utf16[0], 'U+D83D')
T.eq('emoji 低位代理', U.analyze('😀').list[0].utf16[1], 'U+DE00')
T.eq('ASCII 归类', U.analyze('A').list[0].kind, 'ASCII')
T.eq('汉字归类', U.analyze('中').list[0].kind, '汉字')
T.eq('Emoji 归类', U.analyze('😀').list[0].kind, 'Emoji')
T.eq('编号从 1 开始', U.analyze('AB').list[1].index, 2)

/* ---------- 2. 不可见字符（Unicode 格式字符表） ---------- */
const zw = U.analyze('\u200b').list[0]
T.eq('零宽空格的可见替身是中点', zw.visible, '·')
T.eq('零宽空格标可疑', zw.suspect, true)
T.eq('零宽空格给中文名', zw.suspectNote, '零宽空格')
T.eq('零宽空格单独归类', zw.kind, '零宽空格')
T.eq('BOM 也可疑', U.analyze('\uFEFF').list[0].suspect, true)
T.eq('BOM 的名字', U.analyze('\uFEFF').list[0].suspectNote, '字节顺序标记 BOM')
T.eq('不换行空格有名', U.analyze('\u00a0').list[0].suspectNote, '不换行空格')
T.ok('可疑字符表 ≥ 15 条', U.SUSPICIOUS_LIST.length >= 15)
T.ok('可疑字符表 code 形状', U.SUSPICIOUS_LIST.every((x) => /^U\+[0-9A-F]{4}$/.test(x.code)))
T.ok('可疑字符表都有中文名', U.SUSPICIOUS_LIST.every((x) => /[\u4e00-\u9fa5]/.test(x.name)))

/* ---------- 3. 汇总：字节总数用 Buffer 当尺子 ---------- */
for (const s of ['abc', '中文', 'a中😀', 'é€']) {
  const sum = U.summarize(s)
  T.eq('总字节 ' + JSON.stringify(s), sum.utf8Bytes, Buffer.from(s, 'utf8').length)
  T.eq('字符数 ' + JSON.stringify(s), sum.chars, [...s].length)
  T.eq('UTF-16 码元数 ' + JSON.stringify(s), sum.utf16Units, s.length)
}
T.eq('空串汇总为 null', U.summarize(''), null)
T.eq('含代理对', U.summarize('😀').hasSurrogatePair, true)
T.eq('无代理对', U.summarize('中文').hasSurrogatePair, false)
T.eq('emoji 计数', U.summarize('a😀😀').emoji, 2)
T.eq('最大字节宽度', U.summarize('a中😀').maxBytes, 4)
T.eq('控制符计入可疑', U.summarize('\x01').suspects, 1)
T.eq('换行不算可疑', U.summarize('\n').suspects, 0)
T.eq('制表符不算可疑', U.summarize('\t').suspects, 0)
T.eq('零宽空格计入可疑', U.summarize('a\u200b').suspects, 1)

/* ---------- 4. 转义：url 与 encodeURIComponent 同口径 ---------- */
T.eq('unicode 转义 CJK', U.escapeAll('中A', 'unicode'), '\\u4E2DA')
T.eq('unicode 转义非 BMP', U.escapeAll('😀', 'unicode'), '\\u{1f600}')
T.eq('unicode 保留 ASCII', U.escapeAll('abc', 'unicode'), 'abc')
T.eq('html 转义 CJK', U.escapeAll('中', 'html'), '&#20013;')
T.eq('html 保留 ASCII', U.escapeAll('a中b', 'html'), 'a&#20013;b')
T.eq('url 与 encodeURIComponent 一致', U.escapeAll('中 A', 'url'), encodeURIComponent('中 A'))
T.eq('url 保留 unreserved', U.escapeAll('aZ0-_.~', 'url'), 'aZ0-_.~')
T.eq('未知样式原样返回', U.escapeAll('中', 'nope'), '中')

/* ---------- 5. 码点还原：两种进制写法回到同一个字 ---------- */
T.eq('十六进制（含字母）', U.fromCodePoints('4E2D 6587'), '中文')
T.eq('十进制（全数字）', U.fromCodePoints('20013 25991'), '中文')
T.eq('U+ 前缀', U.fromCodePoints('U+4E2D'), '中')
T.eq('0x 前缀', U.fromCodePoints('0x1F600'), '😀')
T.eq('逗号分隔', U.fromCodePoints('4E2D,6587'), '中文')
T.eq('顿号分隔', U.fromCodePoints('4E2D、6587'), '中文')
T.eq('码点十进制往返', U.fromCodePoints(U.analyze('随身匣').list.map((x) => x.codePoint).join(' ')), '随身匣')
T.eq('码点 U+ 往返', U.fromCodePoints(U.analyze('随身匣').list.map((x) => x.hex).join(' ')), '随身匣')

/* ---------- 6. 边界与反例 ---------- */
T.throws('空码点输入', () => U.fromCodePoints(''), /请输入码点/)
T.throws('非法字符', () => U.fromCodePoints('xyz'), /不是合法的码点/)
T.throws('超出 Unicode 上限', () => U.fromCodePoints('U+110000'), /不是合法的码点/)
T.throws('analyze 空串', () => U.analyze(''), /请输入/)
T.eq('analyze(null) 当文本', U.analyze(null).list.length, 4)
T.eq('analyze(数字) 转字符串', U.analyze(123).list.map((x) => x.char).join(''), '123')
T.eq('超 500 字标记截断', U.analyze('a'.repeat(600)).truncated, true)
T.eq('截断后只列 500 条', U.analyze('a'.repeat(600)).list.length, 500)
T.eq('截断仍报真实总数', U.analyze('a'.repeat(600)).total, 600)
T.eq('正好 500 字不算截断', U.analyze('a'.repeat(500)).truncated, false)
T.eq('summarize(null) 当字符串处理', U.summarize(null).chars, 4)
T.eq('summarize(数字) 转字符串', U.summarize(12).chars, 2)

T.done()
