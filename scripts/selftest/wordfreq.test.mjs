/**
 * wordfreq.js 自查断言（直接测 src/utils/wordfreq.js 本体）
 * ------------------------------------------------------------
 * 判据分五类：
 *   1) 已知向量：分词器的输出是确定的——'Hello world'→两个小写词、
 *      '你好世界'→四个单字、中英混排按边界切开、纯数字被滤掉、撇号算词内字符。
 *   2) 计数性质：analyze 的 total 等于参与统计的 token 数、unique 等于不同值个数、
 *      频次降序、ratio = count / 最高频；topN / minCount 只影响展示不改总数。
 *   3) 停用词口径：the/的 属于停用词，ignoreStop 打开后 total 相应减少。
 *   4) 边界与反例：空白串必须抛中文错；空串、null 不炸；条状图长度按比例。
 *   5) 外部裁判 + 界面契约：stats 的 chars/hanzi/latin/space/lines 用独立正则重数；
 *      paragraphs 字段必须存在且是数（模板会直接印）。
 */
import { useUtils, makeTest } from './harness.mjs'

const W = await useUtils('wordfreq')
const T = makeTest('wordfreq')

const vals = (list) => list.map((x) => x.value)

/* ---------- 0. 导出面 ---------- */
for (const k of ['tokenize', 'analyze', 'bars']) T.ok('导出 ' + k, typeof W[k] === 'function')
T.ok('WORDFREQ_SAMPLE 是字符串', typeof W.WORDFREQ_SAMPLE === 'string' && W.WORDFREQ_SAMPLE.length > 20)

/* ---------- 1. tokenize：已知向量 ---------- */
{
  T.eq('英文按词切、转小写', W.tokenize('Hello world'), [
    { type: 'word', value: 'hello' }, { type: 'word', value: 'world' },
  ])
  T.eq('中文逐字切', vals(W.tokenize('你好世界')), ['你', '好', '世', '界'])
  T.eq('中文 token 类型', W.tokenize('中')[0].type, 'cjk')
  T.eq('中英混排按边界切开', W.tokenize('abc中文def'), [
    { type: 'word', value: 'abc' }, { type: 'cjk', value: '中' },
    { type: 'cjk', value: '文' }, { type: 'word', value: 'def' },
  ])
  T.eq('纯数字被滤掉', W.tokenize('123 456'), [])
  T.eq('字母数字混排算一个词', vals(W.tokenize('abc123')), ['abc123'])
  T.eq('撇号算词内字符', vals(W.tokenize("don't stop")), ["don't", 'stop'])
  T.eq('标点切开词', vals(W.tokenize('a,b.c')), ['a', 'b', 'c'])
  T.eq('空串给空数组', W.tokenize(''), [])
  T.eq('null 不炸（当字符串 null 切）', vals(W.tokenize(null)), ['null'])
  const bg = W.tokenize('你好世界', { cnBigram: true })
  T.eq('二字词模式 token 数', bg.length, 4)
  T.ok('二字词模式含「你好」', bg.some((x) => x.value === '你好'))
  T.ok('二字词模式含「世界」', bg.some((x) => x.value === '世界'))
}

/* ---------- 2. analyze：计数与排序 ---------- */
{
  const a = W.analyze('a a a b')
  T.eq('total = token 数', a.total, 4)
  T.eq('rawTotal 与 token 数一致', a.rawTotal, 4)
  T.eq('unique = 不同值个数', a.unique, 2)
  T.eq('最高频在最前', a.top[0].value, 'a')
  T.eq('最高频次数', a.top[0].count, 3)
  T.eq('ratio 最高频为 1', a.top[0].ratio, 1)
  T.eq('ratio = count/最高频', a.top[1].ratio, 1 / 3)
  T.eq('total = 各 count 之和', a.top.reduce((s, x) => s + x.count, 0), 4)
  T.eq('降序排列', a.top.map((x) => x.count), [3, 1])
}

/* ---------- 3. 停用词口径 ---------- */
{
  T.eq('不忽略停用词时 the 也在', W.analyze('the cat').total, 2)
  T.eq('stopCount 认出 the', W.analyze('the cat').stopCount, 1)
  T.eq('ignoreStop 后 the 被剔除', W.analyze('the cat', { ignoreStop: true }).total, 1)
  T.eq('ignoreStop 后只剩 cat', vals(W.analyze('the cat', { ignoreStop: true }).top), ['cat'])
  T.eq('中文停用词「的」被认出', W.analyze('的的的你好').top[0].stop, true)
  T.eq('ignoreStop 剔掉中文停用词', W.analyze('的的的随身匣工具', { ignoreStop: true }).total, 5)
  T.ok('中文 ignoreStop 后不含「的」', vals(W.analyze('的的的随身匣工具', { ignoreStop: true }).top).indexOf('的') < 0)
}

/* ---------- 4. topN 与 minCount ---------- */
{
  const long = W.analyze('a a a b b c d e f g h i j k l m n o p q r s t u v w x y z', { topN: 3 })
  T.eq('topN 限制条数', long.top.length, 3)
  T.ok('topN 不改变 unique', long.unique > 3)
  const mc = W.analyze('a a b', { minCount: 2 })
  T.eq('minCount 只留够次数的', vals(mc.top), ['a'])
  T.ok('minCount 不改 total', mc.total === 3)
}

/* ---------- 5. stats：外部正则重数 + 界面契约 ---------- */
{
  const s = 'hello 世界\n\n第二段'
  const st = W.analyze(s).stats
  T.eq('chars = 码点数', st.chars, [...s].length)
  T.eq('hanzi 与外部正则一致', st.hanzi, (s.match(/[\u4e00-\u9fff]/g) || []).length)
  T.eq('latin 与外部正则一致', st.latin, (s.match(/[A-Za-z]/g) || []).length)
  T.eq('space 与外部正则一致', st.space, (s.match(/\s/g) || []).length)
  T.eq('lines 行数', st.lines, 3)
  T.eq('nonEmptyLines 非空行', st.nonEmptyLines, 2)
  T.eq('paragraphs 段数', st.paragraphs, 2)
  T.ok('paragraphs 不是 undefined（模板会直接印）', st.paragraphs !== undefined && Number.isFinite(st.paragraphs))
  T.ok('longestLine = 最长行码点数', st.longestLine === Math.max(...s.split(/\r?\n/).map((l) => [...l].length)))
  T.ok('richness 是有限数', Number.isFinite(st.richness))
  for (const k of ['chars', 'hanzi', 'latin', 'punct', 'space', 'lines', 'nonEmptyLines', 'paragraphs', 'sentences', 'avgSentence', 'longestLine', 'richness']) {
    T.ok('stats.' + k + ' 是有限数', Number.isFinite(st[k]))
  }
}

/* ---------- 6. bars 与边界 ---------- */
{
  const b = W.bars([{ count: 4 }, { count: 2 }], 10)
  T.eq('最高频条满格', b[0].bar, '█'.repeat(10))
  T.eq('一半频次半格', b[1].bar, '█'.repeat(5))
  T.eq('缺省宽度 20', W.bars([{ count: 1 }])[0].bar.length, 20)
  T.ok('bar 只由方块组成', b.every((x) => /^█*$/.test(x.bar)))
  T.throws('空白文本抛中文错', () => W.analyze('   '), /文本/)
  T.throws('空串抛中文错', () => W.analyze(''), /文本/)
  T.ok('null 不炸（被当字符串处理）', W.analyze(null).total === 1)
}

T.done()
