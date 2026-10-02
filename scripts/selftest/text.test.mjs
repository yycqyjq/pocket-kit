/**
 * text.js 自查断言（直接测 src/utils/text.js 本体）
 * ------------------------------------------------------------
 * 判据分五类，每类的「尺子」都取自被测模块之外：
 *   1) 平台内置当外部裁判：大小写用 String.prototype.toUpperCase / toLowerCase，
 *      Base64 用 Node 的 Buffer.toString('base64')，URL 编码用 encodeURIComponent，
 *      analyze 的每个计数用独立正则重数一遍——不抄模块里的那几条正则。
 *   2) 已知向量：拼音首字母（中国→ZG、北京→BJ）、HTML 去标签的常见写法。
 *   3) 往返性质：Base64 编→解、URL 编→解必须回到原值，emoji/中文也不许丢码点。
 *   4) 边界与反例：空串、纯空白、代理对、全角空格、坏 Base64 该拒。
 *   5) 界面契约：analyze 的字段都是有限数，不许出现 NaN/undefined。
 */
import { useUtils, makeTest } from './harness.mjs'

const M = await useUtils('text')
const T = makeTest('text')

/* ---------- 0. 导出面 ---------- */
for (const k of [
  'analyze', 'toUpperCase', 'toLowerCase', 'toTitleCase', 'padCJK', 'lines',
  'dedupeLines', 'removeEmptyLines', 'collapseSpaces', 'trimLines', 'sortLines',
  'reverseText', 'reverseLines', 'numberLines', 'stripHtml', 'urlEncode', 'urlDecode',
  'toBase64', 'fromBase64', 'initials',
]) {
  T.ok('导出 ' + k, typeof M[k] !== 'undefined')
}

/* ---------- 1. analyze：用独立正则重数一遍 ---------- */
{
  const s = '你好 world 123\n\n第二段'
  const a = M.analyze(s)
  T.eq('chars 是码点数', a.chars, [...s].length)
  T.eq('hanzi 与外部正则一致', a.hanzi, (s.match(/[\u4e00-\u9fff]/g) || []).length)
  T.eq('letters 与外部正则一致', a.letters, (s.match(/[A-Za-z]/g) || []).length)
  T.eq('digits 与外部正则一致', a.digits, (s.match(/[0-9]/g) || []).length)
  T.eq('words 与英文词正则一致', a.words, (s.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) || []).length)
  T.eq('noSpace 与去空白结果一致', a.noSpace, [...s.replace(/\s/g, '')].length)
  T.eq('spaces = chars - noSpace', a.spaces, a.chars - a.noSpace)
  T.eq('lines 行数', a.lines, 3)
  T.eq('paragraphs 段数', a.paragraphs, 2)
  const e = M.analyze('')
  T.eq('空串零值', JSON.stringify(e), JSON.stringify({ chars: 0, noSpace: 0, hanzi: 0, letters: 0, digits: 0, punct: 0, words: 0, lines: 0, paragraphs: 0, spaces: 0 }))
  T.eq('纯空白也算没内容', M.analyze('   \n\t ').paragraphs, 0)
  T.eq('null 当空串', M.analyze(null).chars, 0)
  for (const k of ['chars', 'noSpace', 'hanzi', 'letters', 'digits', 'punct', 'words', 'lines', 'paragraphs', 'spaces']) {
    T.ok('analyze.' + k + ' 是有限数', Number.isFinite(a[k]))
  }
}

/* ---------- 2. 大小写 / 标题 / 中英间距 ---------- */
{
  T.eq('toUpperCase 与原生一致', M.toUpperCase('straße 中'), 'STRASSE 中')
  T.eq('toLowerCase 与原生一致', M.toLowerCase('ABC XYZ'), 'abc xyz')
  T.eq('toTitleCase 逐词首字母', M.toTitleCase('hello WORLD foo-bar'), 'Hello World Foo-Bar')
  T.eq('toTitleCase 单字母词', M.toTitleCase('a b c'), 'A B C')
  T.eq('padCJK 中英之间加空格', M.padCJK('中文abc'), '中文 abc')
  T.eq('padCJK 英中之间加空格', M.padCJK('abc中文'), 'abc 中文')
  T.eq('padCJK 数字也加', M.padCJK('中1'), '中 1')
  T.eq('padCJK 全角空格不当内容', M.padCJK('中a中'), '中 a 中')
}

/* ---------- 3. 行操作 ---------- */
{
  T.eq('lines 认三种换行', M.lines('a\r\nb\rc\nd'), ['a', 'b', 'c', 'd'])
  T.eq('lines 空串给一个空行', M.lines(''), [''])
  T.eq('trimLines 逐行去首尾', M.trimLines('  a  \n\tb\t'), 'a\nb')
  T.eq('removeEmptyLines 去空行并 trim', M.removeEmptyLines('a\n\n b \n\nc'), 'a\nb\nc')
  T.eq('removeEmptyLines 保留缩进', M.removeEmptyLines('a\n  b\n', true), 'a\n  b')
  T.eq('collapseSpaces 空格/制表/全角合并', M.collapseSpaces('a  b\t\tc\u3000d'), 'a b c d')
  T.eq('dedupeLines 忽略大小写', M.dedupeLines('a\nA\nb\n\n\nc', true), 'a\nb\n\nc')
  T.eq('dedupeLines 区分大小写', M.dedupeLines('a\nA', false), 'a\nA')
  T.eq('sortLines asc', M.sortLines('b\na\nc', 'asc'), 'a\nb\nc')
  T.eq('sortLines desc', M.sortLines('b\na\nc', 'desc'), 'c\nb\na')
  T.eq('sortLines lenAsc', M.sortLines('bb\na\nccc', 'lenAsc'), 'a\nbb\nccc')
  T.eq('sortLines lenDesc', M.sortLines('bb\na\nccc', 'lenDesc'), 'ccc\nbb\na')
  T.eq('reverseLines 倒序行', M.reverseLines('a\nb\nc'), 'c\nb\na')
  T.eq('numberLines 补零编号', M.numberLines('x\ny', 1, 3), '001. x\n002. y')
  T.eq('numberLines 起始 0 退回 1', M.numberLines('x', 0, 2), '01. x')
}

/* ---------- 4. 去标签：已知向量 ---------- */
{
  T.eq('去成对标签', M.stripHtml('<p>hello</p>'), 'hello')
  T.eq('script 整段丢弃', M.stripHtml('<script>alert(1)</script>ok'), 'ok')
  T.eq('style 整段丢弃', M.stripHtml('<style>a{}</style>x'), 'x')
  T.eq('命名实体还原 &amp;', M.stripHtml('a &amp; b'), 'a & b')
  T.eq('&nbsp; 还原成空格', M.stripHtml('a&nbsp;b'), 'a b')
  T.eq('&lt;/&gt; 还原', M.stripHtml('&lt;b&gt;'), '<b>')
  T.eq('空串不炸', M.stripHtml(''), '')
}

/* ---------- 5. Base64：Buffer 当外部裁判 ---------- */
{
  for (const s of ['', 'a', '随身匣', '😀', 'a\u0000b', '\u00ff\u00ff\u00ff', 'null']) {
    T.eq('base64 与 Buffer 一致：' + JSON.stringify(s), M.toBase64(s), Buffer.from(s, 'utf8').toString('base64'))
    T.eq('base64 编→解回原值：' + JSON.stringify(s), M.fromBase64(M.toBase64(s)), s)
    const wantUrl = Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    T.eq('url-safe base64 与 Buffer 一致：' + JSON.stringify(s), M.toBase64(s, true), wantUrl)
    T.eq('url-safe 编→解回原值：' + JSON.stringify(s), M.fromBase64(M.toBase64(s, true)), s)
  }
  T.throws('坏 Base64 该拒（中文报错）', () => M.fromBase64('='), /Base64/)
}

/* ---------- 6. URL 编码：encodeURIComponent 当外部裁判 ---------- */
{
  for (const s of ['a b', 'a&b=c', '中文', '😀', 'a+b', 'a%20b', '~!*()']) {
    T.eq('urlEncode 与 encodeURIComponent 一致：' + JSON.stringify(s), M.urlEncode(s), encodeURIComponent(s))
    T.eq('urlEncode→urlDecode 回原值：' + JSON.stringify(s), M.urlDecode(M.urlEncode(s)), s)
  }
  T.eq('urlDecode 把 + 当空格', M.urlDecode('a+b'), 'a b')
  T.eq('urlDecode 认百分号', M.urlDecode('%E4%B8%AD'), '中')
}

/* ---------- 7. 拼音首字母：已知向量 ---------- */
{
  T.eq('中国→ZG', M.initials('中国'), 'ZG')
  T.eq('北京→BJ', M.initials('北京'), 'BJ')
  T.eq('你好→NH', M.initials('你好'), 'NH')
  T.eq('英文取大写首字母', M.initials('abc'), 'ABC')
  T.eq('中英数字混排', M.initials('a中1'), 'AZ1')
  T.eq('空串给空串', M.initials(''), '')
  T.eq('纯空白给空串', M.initials('   '), '')
  T.eq('标点被丢掉', M.initials('！？'), '')
}

/* ---------- 8. 反转：码点级，不劈开代理对 ---------- */
{
  T.eq('ascii 反转', M.reverseText('abc'), 'cba')
  T.eq('emoji 不被劈开', M.reverseText('a😀'), '😀a')
  T.eq('中文与 emoji 混排', M.reverseText('a中😀'), '😀中a')
  T.eq('反转后码点数不变', [...M.reverseText('a中😀b')].length, [...'a中😀b'].length)
}

T.done()
