/**
 * 占位文本生成
 * 中文用常见的排版测试段落，英文用经典 Lorem ipsum。
 * 支持按「段落 / 句子 / 字数」三种口径生成，都可以指定长度。
 */

const CN_PARAGRAPHS = [
  '这里是一段占位文字，用来测试版面在真实内容下的表现。排版好不好看，往往要等放进了足够长的文字才看得出来。',
  '占位文字的作用是让设计稿先「装满」，这样行高、字距、留白的问题才会暴露出来，而不是等到上线前才发现某段文字溢出。',
  '常见的做法是先铺满内容，再逐块替换成真实文案。替换过程中只要保持长度相近，版式就不会发生大的跳动。',
  '如果一段文字看起来过于整齐，往往说明它还不够真实。真实内容里有长有短，有标点，也有断句上的例外。',
  '在多人协作里，占位文字还承担着「这里还没写完」的信号。看到它就知道该找谁补内容，而不会误以为已经定稿。',
  '移动端的屏幕窄，一行能放下的字很有限。用占位文字跑一遍，能很快看出哪些地方会折行、哪些地方会挤压。',
]

const CN_SENTENCES = [
  '这是一句占位文字。',
  '排版需要真实长度的内容才能验证。',
  '先把版面填满，再逐步替换成正式文案。',
  '行高与留白的问题通常在长文本里才暴露。',
  '占位文字也在提示这里还没有定稿。',
  '窄屏上一行放不下太多字，折行要提前确认。',
  '数字 1234567890 与标点，。！？都要一起测。',
  '中英混排 Mixed Content 也要留出足够的间距。',
]

const EN_WORDS = (
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et ' +
  'dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea ' +
  'commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur ' +
  'excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum ' +
  'porro quisquam nostrum exercitationem ullam corporis suscipit laboriosam aliquid commodi consequatur'
).split(' ')

const EN_CLASSIC =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et ' +
  'dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ' +
  'ex ea commodo consequat.'

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

/** 英文：生成 n 个单词 */
export function englishWords(n) {
  const count = Math.max(1, Math.min(5000, Number(n) || 50))
  const out = []
  for (let i = 0; i < count; i++) out.push(EN_WORDS[Math.floor(Math.random() * EN_WORDS.length)])
  out[0] = out[0][0].toUpperCase() + out[0].slice(1)
  return out.join(' ') + '.'
}

/** 英文：生成 n 个句子 */
export function englishSentences(n) {
  const count = Math.max(1, Math.min(200, Number(n) || 5))
  const out = []
  for (let i = 0; i < count; i++) {
    const len = 8 + Math.floor(Math.random() * 12)
    const s = englishWords(len).replace(/\.$/, '')
    out.push(s + '.')
  }
  if (count > 1 && Math.random() > 0.5) out[0] = EN_CLASSIC.split('. ')[0] + '.'
  return out.join(' ')
}

/** 英文：生成 n 段 */
export function englishParagraphs(n) {
  const count = Math.max(1, Math.min(30, Number(n) || 3))
  const out = []
  for (let i = 0; i < count; i++) out.push(englishSentences(3 + Math.floor(Math.random() * 3)))
  return out.join('\n\n')
}

/** 中文：生成 n 段 */
export function chineseParagraphs(n) {
  const count = Math.max(1, Math.min(30, Number(n) || 3))
  const out = []
  for (let i = 0; i < count; i++) {
    const parts = []
    const sentCount = 2 + Math.floor(Math.random() * 3)
    for (let k = 0; k < sentCount; k++) parts.push(pick(CN_SENTENCES))
    if (i % 2 === 0) parts.unshift(pick(CN_PARAGRAPHS))
    out.push(parts.join(''))
  }
  return out.join('\n\n')
}

/** 按目标字数生成中文（按句拼，尽量贴近目标） */
export function chineseByLength(target) {
  const want = Math.max(10, Math.min(5000, Number(target) || 200))
  const pool = CN_PARAGRAPHS.concat(CN_SENTENCES, CN_SENTENCES)
  let out = ''
  let guard = 0
  while (out.length < want && guard++ < 500) {
    out += pick(pool)
  }
  if (out.length > want) out = out.slice(0, want) + '…'
  return out
}

/** 按目标字数生成英文 */
export function englishByLength(target) {
  const want = Math.max(10, Math.min(20000, Number(target) || 300))
  const words = Math.max(1, Math.round(want / 5.5))
  const s = englishWords(words)
  return s.length > want ? s.slice(0, want) + '…' : s
}

/**
 * 统一入口
 * @param {object} opt { lang: 'cn'|'en', unit: 'para'|'sentence'|'length', count, targetLength, startWithClassic }
 */
export function generate(opt) {
  const o = Object.assign({ lang: 'cn', unit: 'para', count: 3, targetLength: 200 }, opt || {})
  if (o.lang === 'en') {
    if (o.unit === 'para') return englishParagraphs(o.count)
    if (o.unit === 'sentence') return englishSentences(o.count)
    return englishByLength(o.targetLength)
  }
  if (o.unit === 'para') return chineseParagraphs(o.count)
  if (o.unit === 'sentence') {
    const n = Math.max(1, Math.min(200, Number(o.count) || 5))
    const out = []
    for (let i = 0; i < n; i++) out.push(pick(CN_SENTENCES))
    return out.join('')
  }
  return chineseByLength(o.targetLength)
}

/** 统计生成结果，方便用户核对 */
export function stats(text) {
  const s = String(text)
  const hanzi = (s.match(/[\u4e00-\u9fff]/g) || []).length
  const words = (s.match(/[A-Za-z]+/g) || []).length
  return {
    chars: s.length,
    noSpace: s.replace(/\s/g, '').length,
    hanzi,
    words,
    paragraphs: s.split(/\n{2,}/).filter((x) => x.trim()).length,
  }
}

export const GENERATE_OPTIONS = {
  langs: [
    { key: 'cn', name: '中文' },
    { key: 'en', name: 'English' },
  ],
  units: [
    { key: 'para', name: '按段' },
    { key: 'sentence', name: '按句' },
    { key: 'length', name: '按字数' },
  ],
}
