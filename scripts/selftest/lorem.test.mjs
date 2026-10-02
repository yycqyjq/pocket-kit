/**
 * lorem.js 自查断言（直接测 src/utils/lorem.js 本体）
 * ------------------------------------------------------------
 * 生成器带随机，所以判据一律是「不变量」，不跟具体字串较劲：
 *   1) 口径不变量：englishWords(n) 出来正好 n 个词；englishSentences(n) 正好 n 个句号；
 *      *Paragraphs(n) 按空行切正好 n 段——这些跟随机无关，n 说话就得算数。
 *   2) 边界与夹取：0/负数/非数字走缺省（Number(x)||缺省），超大值夹到上限
 *      （词 5000、句 200、段 30）。
 *   3) 已知性质：首词首字母大写、英文以句号收尾、中文段含汉字；
 *      chineseByLength 目标字数落在 [want, want+1]（超了截断补 …）。
 *   4) 外部裁判：stats() 的 chars/hanzi/words/noSpace 用独立正则重数一遍。
 *   5) 界面契约：stats 的字段都是有限数，generate 的结果不含 undefined。
 */
import { useUtils, makeTest } from './harness.mjs'

const L = await useUtils('lorem')
const T = makeTest('lorem')

const words = (s) => s.replace(/\.$/, '').split(' ').filter(Boolean)
const dots = (s) => (s.match(/\./g) || []).length

/* ---------- 0. 导出面 ---------- */
for (const k of ['englishWords', 'englishSentences', 'englishParagraphs', 'chineseParagraphs', 'chineseByLength', 'englishByLength', 'generate', 'stats']) {
  T.ok('导出 ' + k, typeof L[k] === 'function')
}
T.eq('GENERATE_OPTIONS 两种语言', L.GENERATE_OPTIONS.langs.map((x) => x.key), ['cn', 'en'])
T.eq('GENERATE_OPTIONS 三种口径', L.GENERATE_OPTIONS.units.map((x) => x.key), ['para', 'sentence', 'length'])

/* ---------- 1. englishWords：词数 = n ---------- */
{
  T.eq('10 个词就是 10 个', words(L.englishWords(10)).length, 10)
  T.eq('1 个词', words(L.englishWords(1)).length, 1)
  T.eq('100 个词', words(L.englishWords(100)).length, 100)
  const w = L.englishWords(20)
  T.ok('首词首字母大写', /^[A-Z]/.test(w))
  T.ok('以句号收尾', w.endsWith('.'))
  T.ok('全是字母词（去尾句号后）', words(w).every((x) => /^[A-Za-z]+$/.test(x)))
  T.eq('0 走缺省 50 个', words(L.englishWords(0)).length, 50)
  T.eq('非数字走缺省 50 个', words(L.englishWords('x')).length, 50)
  T.eq('超大值夹到 5000', words(L.englishWords(99999)).length, 5000)
}

/* ---------- 2. englishSentences：句数 = n ---------- */
{
  T.eq('1 句一个句号', dots(L.englishSentences(1)), 1)
  T.eq('5 句五个句号', dots(L.englishSentences(5)), 5)
  T.eq('0 走缺省 5 句', dots(L.englishSentences(0)), 5)
  T.eq('超大值夹到 200 句', dots(L.englishSentences(9999)), 200)
  T.ok('句子之间有空隙', L.englishSentences(4).indexOf(' ') > 0)
}

/* ---------- 3. 段落口径：按空行切正好 n 段 ---------- */
{
  T.eq('英文 2 段', L.englishParagraphs(2).split('\n\n').length, 2)
  T.eq('英文 0 走缺省 3 段', L.englishParagraphs(0).split('\n\n').length, 3)
  T.eq('英文超大夹到 30 段', L.englishParagraphs(9999).split('\n\n').length, 30)
  T.eq('中文 2 段', L.chineseParagraphs(2).split('\n\n').length, 2)
  T.eq('中文 0 走缺省 3 段', L.chineseParagraphs(0).split('\n\n').length, 3)
  T.eq('中文超大夹到 30 段', L.chineseParagraphs(9999).split('\n\n').length, 30)
  T.ok('中文段里有汉字', /[\u4e00-\u9fff]/.test(L.chineseParagraphs(2)))
}

/* ---------- 4. 按字数：落在目标附近 ---------- */
{
  for (const want of [10, 50, 100, 300, 1000]) {
    const out = L.chineseByLength(want)
    T.ok('中文目标 ' + want + ' 字：' + out.length, out.length >= want && out.length <= want + 1)
  }
  T.eq('中文 0 走缺省 200 字上下', L.chineseByLength(0).length >= 200 && L.chineseByLength(0).length <= 201, true)
  for (const want of [50, 300, 1000]) {
    const out = L.englishByLength(want)
    T.ok('英文目标 ' + want + ' 字不超目标+1：' + out.length, out.length > 0 && out.length <= want + 1)
  }
  T.ok('英文 0 走缺省 300 字上下', L.englishByLength(0).length <= 301)
}

/* ---------- 5. generate 统一入口 ---------- */
{
  T.eq('默认中文 3 段', L.generate().split('\n\n').length, 3)
  T.eq('英文按段 2 段', L.generate({ lang: 'en', unit: 'para', count: 2 }).split('\n\n').length, 2)
  const cnSent = L.generate({ lang: 'cn', unit: 'sentence', count: 4 })
  T.ok('中文按句以句号收尾', /。$/.test(cnSent))
  T.ok('中文按句有内容', cnSent.length > 0)
  const cnLen = L.generate({ unit: 'length', targetLength: 80 })
  T.ok('中文按字数落在目标附近', cnLen.length >= 80 && cnLen.length <= 81)
  const enLen = L.generate({ lang: 'en', unit: 'length', targetLength: 200 })
  T.ok('英文按字数不超目标+1', enLen.length > 0 && enLen.length <= 201)
  T.ok('结果不含 undefined', [L.generate(), cnSent, cnLen, enLen].every((x) => x.indexOf('undefined') < 0))
}

/* ---------- 6. stats：外部正则重数 ---------- */
{
  const s = '你好 world\n\n第二段 abc'
  const st = L.stats(s)
  T.eq('chars = 长度', st.chars, s.length)
  T.eq('hanzi 与外部正则一致', st.hanzi, (s.match(/[\u4e00-\u9fff]/g) || []).length)
  T.eq('words 与外部正则一致', st.words, (s.match(/[A-Za-z]+/g) || []).length)
  T.eq('noSpace 与去空白一致', st.noSpace, s.replace(/\s/g, '').length)
  T.eq('paragraphs = 2', st.paragraphs, 2)
  T.eq('空串全零', JSON.stringify(L.stats('')), JSON.stringify({ chars: 0, noSpace: 0, hanzi: 0, words: 0, paragraphs: 0 }))
  for (const k of ['chars', 'noSpace', 'hanzi', 'words', 'paragraphs']) {
    T.ok('stats.' + k + ' 是有限数', Number.isFinite(st[k]))
  }
}

T.done()
