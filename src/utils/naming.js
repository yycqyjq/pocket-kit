/**
 * 命名风格转换
 * 支持 camelCase / PascalCase / snake_case / CONSTANT_CASE / kebab-case /
 * dot.case / Title Case / Sentence case / slug / train-case
 * 中文不会被拆开，会原样保留
 */

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

/**
 * 把任意风格的名字拆成词。
 * 规则：分隔符切分 → 小写/数字后接大写处切 → 连续大写后接「大写+小写」处切
 */
export function splitWords(input) {
  const s = String(input)
  if (!s) return []

  return (
    s
      // 显式分隔符（含中文标点）换成空格
      .replace(/[_\-.\s/\\(),:;+*#@!?[\]{}|]+/g, ' ')
      // 小写或数字 后接 大写
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      // 连续大写 后接 大写+小写（HTTPServer -> HTTP Server）
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      // 数字与字母之间的边界（2nd -> 2 nd 会难看，所以只在字母后接数字时切）
      .replace(/([A-Za-z])([0-9])/g, '$1 $2')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.trim())
      .filter(Boolean)
  )
}

const cap = (w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '')
const low = (w) => w.toLowerCase()

/** CJK 词不需要改大小写 */
function mapCase(words, fn) {
  return words.map((w) => (CJK.test(w) ? w : fn(w)))
}

export function toCamel(words) {
  const c = mapCase(words, cap)
  if (!c.length) return ''
  return c[0].toLowerCase() + c.slice(1).join('')
}

export function toPascal(words) {
  return mapCase(words, cap).join('')
}

export function toSnake(words) {
  return mapCase(words, low).join('_')
}

export function toConstant(words) {
  return mapCase(words, (w) => w.toUpperCase()).join('_')
}

export function toKebab(words) {
  return mapCase(words, low).join('-')
}

export function toDot(words) {
  return mapCase(words, low).join('.')
}

export function toTrain(words) {
  return mapCase(words, cap).join('-')
}

export function toPath(words) {
  return mapCase(words, low).join('/')
}

export function toTitle(words) {
  return mapCase(words, cap).join(' ')
}

export function toSentence(words) {
  const c = mapCase(words, low)
  if (!c.length) return ''
  return mapCase([c[0]], cap)[0] + (c.length > 1 ? ' ' + c.slice(1).join(' ') : '')
}

/** slug：小写、只留字母数字与连字符，中文保留 */
export function toSlug(words) {
  return mapCase(words, low)
    .join('-')
    .replace(/[^a-z0-9\u3400-\u4dbf\u4e00-\u9fff-]+/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}

export const STYLES = [
  { key: 'camel', name: '小驼峰', sample: 'userName', fn: toCamel },
  { key: 'pascal', name: '大驼峰', sample: 'UserName', fn: toPascal },
  { key: 'snake', name: '下划线', sample: 'user_name', fn: toSnake },
  { key: 'constant', name: '常量', sample: 'USER_NAME', fn: toConstant },
  { key: 'kebab', name: '短横线', sample: 'user-name', fn: toKebab },
  { key: 'train', name: '首字母大写横线', sample: 'User-Name', fn: toTrain },
  { key: 'dot', name: '点号', sample: 'user.name', fn: toDot },
  { key: 'path', name: '路径', sample: 'user/name', fn: toPath },
  { key: 'title', name: '标题', sample: 'User Name', fn: toTitle },
  { key: 'sentence', name: '句子', sample: 'User name', fn: toSentence },
  { key: 'slug', name: '网址别名', sample: 'user-name', fn: toSlug },
]

/** 一次算出所有风格 */
export function convertAll(input) {
  const words = splitWords(input)
  const out = STYLES.map((s) => ({ ...s, value: words.length ? s.fn(words) : '' }))
  return { words, list: out }
}
