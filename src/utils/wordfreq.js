/**
 * 词频统计
 * 中文按字统计（可选二字词），英文按单词统计；也支持中英混排。
 */

const EN_STOP = new Set(
  ('a an the and or but if then than that this these those of to in on at by for with from as is are was were be been being ' +
    'it its he she they we you i not no do does did done have has had will would can could should may might must ' +
    'so such very more most much many some any all each every other another own same too only just also')
    .split(' ')
)

const CN_STOP = new Set(
  ('的 了 和 是 在 我 有 就 不 人 都 一 一个 上 也 很 到 说 要 去 你 会 着 没有 看 好 自己 这 那 他 她 它 ' +
    '们 与 及 或 而 但 因 为 所 以 被 把 让 从 向 对 于 里 中 后 前 时 之 其 此 该 等 已 又 再 很 太 更 最 都 还 又 并 且')
    .split(' ')
)

const isCJK = (cp) => (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff)
const isLatin = (ch) => /[A-Za-z\u00c0-\u024f']/.test(ch)
const isDigit = (ch) => /[0-9]/.test(ch)

/**
 * 分词
 * @param {string} text
 * @param {object} opt { cnBigram: boolean }
 */
export function tokenize(text, opt) {
  const o = Object.assign({ cnBigram: false }, opt || {})
  const s = String(text)
  const out = []
  let buf = ''

  const flush = () => {
    if (buf) {
      out.push({ type: 'word', value: buf.toLowerCase() })
      buf = ''
    }
  }

  const chars = [...s]
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    const cp = ch.codePointAt(0)
    if (isCJK(cp)) {
      flush()
      if (o.cnBigram) {
        const next = chars[i + 1]
        if (next && isCJK(next.codePointAt(0))) {
          out.push({ type: 'cjk', value: ch + next })
        } else {
          out.push({ type: 'cjk', value: ch })
        }
      } else {
        out.push({ type: 'cjk', value: ch })
      }
      continue
    }
    if (isLatin(ch) || isDigit(ch)) {
      buf += ch
      continue
    }
    flush()
  }
  flush()

  // 过滤掉纯数字与过短 token
  return out.filter((t) => {
    if (t.type === 'word') {
      return t.value.length > 0 && !/^\d+$/.test(t.value)
    }
    return true
  })
}

/**
 * @param {string} text
 * @param {object} opt { topN, cnBigram, ignoreStop, minCount }
 */
export function analyze(text, opt) {
  const o = Object.assign({ topN: 30, cnBigram: false, ignoreStop: false, minCount: 1 }, opt || {})
  const s = String(text)
  if (!s.trim()) throw new Error('请输入要统计的文本')

  const tokens = tokenize(s, o)
  const map = new Map()
  let counted = 0
  tokens.forEach((t) => {
    const isStop = t.type === 'cjk' ? CN_STOP.has(t.value) : EN_STOP.has(t.value)
    if (o.ignoreStop && isStop) return
    counted++
    const cur = map.get(t.value) || { value: t.value, type: t.type, count: 0, stop: isStop }
    cur.count++
    map.set(t.value, cur)
  })

  const all = [...map.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  const filtered = all.filter((x) => x.count >= o.minCount)

  const cjkList = filtered.filter((x) => x.type === 'cjk')
  const wordList = filtered.filter((x) => x.type === 'word')
  const max = filtered.length ? filtered[0].count : 1

  const chars = [...s]
  const lines = s.split(/\r?\n/)
  const nonEmpty = lines.filter((l) => l.trim() !== '')
  // 段落 = 被空行隔开的文本块。工具页把「行数 / 段落」并排展示，
  // 这里漏了 paragraphs 会让模板渲染出 undefined。
  const paragraphs = s.split(/\r?\n\s*\r?\n/).filter((x) => x.trim() !== '').length
  const sentences = s.split(/[。！？!?.;；\n]/).filter((x) => x.trim() !== '')

  const hanzi = chars.filter((c) => isCJK(c.codePointAt(0))).length
  const latin = chars.filter((c) => isLatin(c)).length
  // 不用 \p{P} 这种 Unicode 属性转义（解析期特性，老 WebView 不支持会让脚本直接报错）
  const punct = chars.filter((c) => /[^\w\s\u4e00-\u9fff]/.test(c)).length
  const space = chars.filter((c) => /\s/.test(c)).length

  return {
    total: counted,
    rawTotal: tokens.length,
    unique: map.size,
    top: filtered.slice(0, o.topN).map((x) => ({ ...x, ratio: x.count / max })),
    cjkTop: cjkList.slice(0, o.topN).map((x) => ({ ...x, ratio: x.count / max })),
    wordTop: wordList.slice(0, o.topN).map((x) => ({ ...x, ratio: x.count / max })),
    stopCount: all.filter((x) => x.stop).reduce((a, b) => a + b.count, 0),
    stats: {
      chars: chars.length,
      hanzi,
      latin,
      punct,
      space,
      lines: lines.length,
      nonEmptyLines: nonEmpty.length,
      paragraphs,
      sentences: sentences.length,
      avgSentence: sentences.length ? Math.round((hanzi + latin) / sentences.length) : 0,
      longestLine: lines.reduce((m, l) => Math.max(m, [...l].length), 0),
      richness: tokens.length ? Math.round((map.size / tokens.length) * 1000) / 10 : 0,
    },
  }
}

/** 给出前 N 个词的条形图（用字符画，方便贴进纯文本） */
export function bars(list, width) {
  const w = width || 20
  const max = list.length ? list[0].count : 1
  return list.map((x) => {
    const n = Math.max(1, Math.round((x.count / max) * w))
    return { ...x, bar: '█'.repeat(n) }
  })
}

export const STOPWORD_NOTE = '开启「忽略虚词」后会跳过中文的「的、了、和、是」与英文的 the/a/of 这类高频虚词，剩下的词更能反映内容主题。'

export const WORDFREQ_SAMPLE =
  '随身匣是一个离线可用的工具箱。工具箱里有文本工具、数值工具、时间工具与开发工具。\n' +
  '每个工具都只在本机计算，不联网、不上传。离线可用是这个工具箱最重要的特点。\n' +
  'The toolbox works offline. Every tool in the toolbox runs locally, and the toolbox never uploads your data.'
