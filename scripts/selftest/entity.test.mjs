/**
 * entity.js 自查断言（直接测 src/utils/entity.js 本体）
 * ------------------------------------------------------------
 * 判据分五类：
 *   1) 已知向量（HTML 规范里的实体名/码点）：&amp; &lt; &gt; &quot; &#39; &nbsp; &copy;
 *      &euro; &hellip; &mdash; &alpha; &#x41; &#65; &#x1F600; 的解码结果逐个对；
 *      encodeEntities 对五个必须转义字符的输出也逐个对（NEED_ESCAPE 表）。
 *   2) 往返性质：decode(encode(s)) === s，五种 scope/quotes 组合、含 emoji 与引号。
 *   3) 口径性质：十进制与十六进制数字实体解出同一个字符；named 有名字用名字、
 *      没名字退回数字（与组件里「命名实体」那段文案同口径）。
 *   4) 边界与反例：缺分号按宽松解、未知实体原样留着、越界码点不还原、
 *      非数字实体不被 countEntities 误计。
 *   5) 跨模块同口径 + 界面契约：&amp; &lt; &gt; &quot; 的解码与 text.stripHtml 结论一致；
 *      NAMED_ENTITIES / NEED_ESCAPE 的字段能被模板直接印（不为空、无 undefined）。
 */
import { useUtils, makeTest } from './harness.mjs'

const E = await useUtils('entity')
const TX = await useUtils('text')
const T = makeTest('entity')

/* ---------- 0. 导出面与数据表 ---------- */
{
  for (const k of ['NAMED_ENTITIES', 'encodeEntities', 'decodeEntities', 'stripTags', 'countEntities', 'NEED_ESCAPE']) {
    T.ok('导出 ' + k, typeof E[k] !== 'undefined')
  }
  T.ok('命名实体表够大', E.NAMED_ENTITIES.length >= 60)
  for (const row of E.NAMED_ENTITIES) {
    T.ok('实体行是 [字符, 名字]', Array.isArray(row) && row.length === 2)
    T.ok('实体名合法：' + row[1], /^[A-Za-z][A-Za-z0-9]*$/.test(row[1]))
    T.ok('实体字符是单码点：' + row[1], [...row[0]].length === 1)
  }
  T.eq('必须转义的五个字符', E.NEED_ESCAPE.map((x) => x.ch), ['&', '<', '>', '"', "'"])
  for (const x of E.NEED_ESCAPE) {
    T.ok(x.ch + ' 有中文说明', /[\u4e00-\u9fff]/.test(x.note))
  }
}

/* ---------- 1. 编码：五个必须转义字符 ---------- */
{
  T.eq('五个字符默认全转义', E.encodeEntities('&<>"\''), '&amp;&lt;&gt;&quot;&#39;')
  T.eq('单独 & 转义', E.encodeEntities('a&b'), 'a&amp;b')
  T.eq('quotes:false 时引号不动', E.encodeEntities('a"b\'c', { quotes: false }), 'a"b\'c')
  T.eq('quotes:true 时引号转义', E.encodeEntities('"\'', { quotes: true }), '&quot;&#39;')
  T.eq('NEED_ESCAPE 与编码输出一致', E.NEED_ESCAPE.map((x) => E.encodeEntities(x.ch)), E.NEED_ESCAPE.map((x) => x.entity))
}

/* ---------- 2. named / numeric 口径 ---------- */
{
  T.eq('named：© → &copy;', E.encodeEntities('©', { scope: 'named' }), '&copy;')
  T.eq('named：€ → &euro;', E.encodeEntities('€', { scope: 'named' }), '&euro;')
  T.eq('named：… → &hellip;', E.encodeEntities('…', { scope: 'named' }), '&hellip;')
  T.eq('named：没名字的中文退回数字实体', E.encodeEntities('中', { scope: 'named' }), '&#20013;')
  T.eq('numeric：中 → &#20013;', E.encodeEntities('中', { scope: 'numeric' }), '&#20013;')
  T.eq('numeric：© → &#169;', E.encodeEntities('©', { scope: 'numeric' }), '&#169;')
  T.eq('emoji 一律数字实体', E.encodeEntities('😀'), '&#128512;')
}

/* ---------- 3. 往返：decode(encode(s)) === s ---------- */
{
  const CASES = ['<a href="x">', '中文 & <tag>', '😀', '&amp;', "'quote'", 'line1\nline2', '', 'A&B', '©®™']
  for (const s of CASES) {
    T.eq('默认往返：' + JSON.stringify(s), E.decodeEntities(E.encodeEntities(s)), s)
    T.eq('named 往返：' + JSON.stringify(s), E.decodeEntities(E.encodeEntities(s, { scope: 'named' })), s)
    T.eq('numeric 往返：' + JSON.stringify(s), E.decodeEntities(E.encodeEntities(s, { scope: 'numeric' })), s)
    T.eq('quotes:false 往返：' + JSON.stringify(s), E.decodeEntities(E.encodeEntities(s, { quotes: false })), s)
  }
}

/* ---------- 4. 解码：HTML 规范已知向量 ---------- */
{
  const VEC = [
    ['&amp;', '&'], ['&lt;', '<'], ['&gt;', '>'], ['&quot;', '"'], ['&#39;', "'"],
    ['&nbsp;', '\u00a0'], ['&copy;', '\u00a9'], ['&reg;', '\u00ae'], ['&trade;', '\u2122'],
    ['&euro;', '\u20ac'], ['&pound;', '\u00a3'], ['&yen;', '\u00a5'],
    ['&hellip;', '\u2026'], ['&mdash;', '\u2014'], ['&ndash;', '\u2013'],
    ['&larr;', '\u2190'], ['&rarr;', '\u2192'], ['&times;', '\u00d7'], ['&divide;', '\u00f7'],
    ['&alpha;', '\u03b1'], ['&pi;', '\u03c0'], ['&sum;', '\u2211'],
  ]
  for (const [ent, ch] of VEC) {
    T.eq('解码 ' + ent, E.decodeEntities(ent), ch)
  }
  T.eq('十进制数字实体', E.decodeEntities('&#65;'), 'A')
  T.eq('十六进制数字实体', E.decodeEntities('&#x41;'), 'A')
  T.eq('十进制与十六进制等价', E.decodeEntities('&#20013;'), E.decodeEntities('&#x4E2D;'))
  T.eq('emoji 十六进制实体', E.decodeEntities('&#x1F600;'), '😀')
  T.eq('emoji 十进制实体', E.decodeEntities('&#128512;'), '😀')
  T.eq('大写别名 &AMP;', E.decodeEntities('&AMP;'), '&')
  T.eq('句子里的实体一起解', E.decodeEntities('5 &lt; 6 &amp;&amp; 7 &gt; 6'), '5 < 6 && 7 > 6')
}

/* ---------- 5. 解码的宽松与边界 ---------- */
{
  T.eq('缺分号也解', E.decodeEntities('&amp'), '&')
  T.eq('未知实体原样留着', E.decodeEntities('&notreal;'), '&notreal;')
  T.eq('孤立 & 原样', E.decodeEntities('a & b'), 'a & b')
  T.eq('越界码点不还原', E.decodeEntities('&#1114112;'), '&#1114112;')
  T.eq('非法十六进制不还原', E.decodeEntities('&#xZZ;'), '&#xZZ;')
  T.eq('空串不炸', E.decodeEntities(''), '')
}

/* ---------- 6. countEntities ---------- */
{
  T.eq('一个完整实体算一个', E.countEntities('&amp;'), 1)
  T.eq('缺分号不计', E.countEntities('&amp &#39;'), 1)
  T.eq('三种写法都计', E.countEntities('&#x41; &#65; &nbsp;'), 3)
  T.eq('没有实体给 0', E.countEntities('plain text'), 0)
  T.eq('未知但成形的实体也计', E.countEntities('&notreal;'), 1)
  T.eq('空串给 0', E.countEntities(''), 0)
  T.eq('计数与命名表里的项对得上', E.countEntities('&copy;&reg;&trade;'), 3)
}

/* ---------- 7. stripTags ---------- */
{
  T.eq('去成对标签', E.stripTags('<p>hello</p>'), 'hello')
  T.eq('<br> 变换行', E.stripTags('a<br>b'), 'a\nb')
  T.eq('<br/> 也变换行', E.stripTags('a<br/>b'), 'a\nb')
  T.eq('块级标签收尾变换行', E.stripTags('<div>x</div>'), 'x')
  T.eq('注释整段丢弃', E.stripTags('a<!--c-->b'), 'ab')
  T.eq('script 内容丢弃', E.stripTags('a<script>x</script>b'), 'ab')
  T.eq('style 内容丢弃', E.stripTags('a<style>x{}</style>b'), 'ab')
  T.eq('标题标签取内容', E.stripTags('<h1>t</h1>'), 't')
  T.eq('stripTags 不解实体（与 decodeEntities 分工不同）', E.stripTags('&amp;'), '&amp;')
  T.eq('空串不炸', E.stripTags(''), '')
}

/* ---------- 8. 跨模块同口径 + 界面契约 ---------- */
{
  for (const [ent, want] of [['&amp;', '&'], ['&lt;', '<'], ['&gt;', '>'], ['&quot;', '"']]) {
    T.eq('实体解码与 text.stripHtml 同结论：' + ent, [E.decodeEntities(ent), TX.stripHtml(ent)], [want, want])
  }
  const enc = E.encodeEntities('中文 & <tag> "q"')
  T.ok('编码结果不含 undefined', enc.indexOf('undefined') < 0)
  T.ok('编码结果不含 [object Object]', enc.indexOf('[object Object]') < 0)
  T.ok('实体表每行都能直接印（名字非空）', E.NAMED_ENTITIES.every((r) => r[1].length > 0))
  T.ok('NEED_ESCAPE 每项实体串非空', E.NEED_ESCAPE.every((x) => x.entity.length >= 4))
}

T.done()
