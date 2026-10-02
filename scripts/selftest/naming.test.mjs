/**
 * naming.js 自查断言（直接测 src/utils/naming.js 本体）
 * ------------------------------------------------------------
 * 命名风格有公认的形状定义（camelCase / snake_case / CONSTANT_CASE …），判据分四类：
 *   1) 外部裁判（形状规则）：每种风格的输出必须满足该风格的正则形状，
 *      例如 camel 必须 /^[a-z][A-Za-z0-9]*$/、constant 必须 /^[A-Z0-9_]+$/、
 *      slug 必须 /^[a-z0-9]+(-[a-z0-9]+)*$/。形状是独立于实现的行业约定。
 *   2) 分词规则：splitWords 的边界来自公开约定——显式分隔符切分、
 *      小写/数字后接大写切、连续大写后接「大写+小写」切、CJK 不拆。
 *      用这些规则手写期望词序列。
 *   3) 往返与幂等：snake 输出再分词得到的词（忽略大小写）与原词一致；
 *      同一风格套两次结果不变。
 *   4) UI 可见契约：11 种风格都有值、STYLES 的 sample 与 fn 自洽、无脏字。
 */
import { useUtils, makeTest } from './harness.mjs'

const N = await useUtils('naming')
const T = makeTest('naming')

const noJunk = (s) => !/undefined|NaN|\[object Object\]/.test(String(s))
const eqArr = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const STYLE_FNS = ['toCamel', 'toPascal', 'toSnake', 'toConstant', 'toKebab', 'toTrain', 'toDot', 'toPath', 'toTitle', 'toSentence', 'toSlug']

/* ---------------- 0. 导出面 ---------------- */
for (const k of ['splitWords', 'convertAll', 'STYLES', ...STYLE_FNS]) {
  T.ok('导出 ' + k, typeof N[k] !== 'undefined')
}

/* ---------------- 1. 分词规则（公开约定） ---------------- */
const seps = ['_', '-', '.', ' ', '/', '\\', ',', ':', ';', '+', '*', '#', '@', '!', '?', '[', ']', '{', '}', '|', '(', ')']
T.ok('常见分隔符都能切开', seps.every((s) => eqArr(N.splitWords('user' + s + 'name'), ['user', 'name'])))
T.ok('小写后接大写处切', eqArr(N.splitWords('userName'), ['user', 'Name']))
T.ok('数字后接大写处切', eqArr(N.splitWords('v2Beta'), ['v', '2', 'Beta']))
T.ok('连续大写后接大写+小写处切', eqArr(N.splitWords('HTTPServer'), ['HTTP', 'Server']))
T.ok('多个大写缩写', eqArr(N.splitWords('XMLHttpRequest'), ['XML', 'Http', 'Request']))
T.ok('末尾连续大写', eqArr(N.splitWords('ABCDef'), ['ABC', 'Def']))
T.ok('字母后接数字处切', eqArr(N.splitWords('get2Users'), ['get', '2', 'Users']))
T.ok('中文不被拆开', eqArr(N.splitWords('用户id'), ['用户id']))
T.ok('中文与英文混排也不拆', eqArr(N.splitWords('用户user'), ['用户user']))
T.ok('首尾空白被清掉', eqArr(N.splitWords('  spaced  out  '), ['spaced', 'out']))
T.ok('空串得空数组', eqArr(N.splitWords(''), []))
T.ok('null 不抛且返回数组', Array.isArray(N.splitWords(null)))
T.ok('undefined 不抛且返回数组', Array.isArray(N.splitWords(undefined)))

/* ---------------- 2. 已知风格转换（手写期望） ---------------- */
const u = N.splitWords('user_name')
T.eq('camel', N.toCamel(u), 'userName')
T.eq('pascal', N.toPascal(u), 'UserName')
T.eq('snake', N.toSnake(u), 'user_name')
T.eq('constant', N.toConstant(u), 'USER_NAME')
T.eq('kebab', N.toKebab(u), 'user-name')
T.eq('train', N.toTrain(u), 'User-Name')
T.eq('dot', N.toDot(u), 'user.name')
T.eq('path', N.toPath(u), 'user/name')
T.eq('title', N.toTitle(u), 'User Name')
T.eq('sentence', N.toSentence(u), 'User name')
T.eq('slug', N.toSlug(u), 'user-name')

const http = N.splitWords('HTTPServer')
T.eq('camel 处理缩写', N.toCamel(http), 'httpServer')
T.eq('snake 处理缩写', N.toSnake(http), 'http_server')
T.eq('constant 处理缩写', N.toConstant(http), 'HTTP_SERVER')
const d2 = N.splitWords('get2Users')
T.eq('camel 处理数字', N.toCamel(d2), 'get2Users')
T.eq('snake 处理数字', N.toSnake(d2), 'get_2_users')
T.eq('title 处理数字', N.toTitle(d2), 'Get 2 Users')

/* ---------------- 3. 风格形状（外部约定） ---------------- */
const SHAPES = {
  camel: /^[a-z][A-Za-z0-9]*$/,
  pascal: /^[A-Z][A-Za-z0-9]*$/,
  snake: /^[a-z0-9]+(_[a-z0-9]+)*$/,
  constant: /^[A-Z0-9]+(_[A-Z0-9]+)*$/,
  kebab: /^[a-z0-9]+(-[a-z0-9]+)*$/,
  train: /^[A-Z][a-z0-9]*(-[A-Z][a-z0-9]*)*$/,
  dot: /^[a-z0-9]+(\.[a-z0-9]+)*$/,
  path: /^[a-z0-9]+(\/[a-z0-9]+)*$/,
  title: /^[A-Z][a-z0-9]*( [A-Z][a-z0-9]*)*$/,
  sentence: /^[A-Z][a-z0-9]*( [a-z0-9]+)*$/,
  slug: /^[a-z0-9]+(-[a-z0-9]+)*$/,
}
for (const s of N.STYLES) {
  T.ok('形状 ' + s.key, SHAPES[s.key].test(s.fn(u)), s.key + ' 输出 ' + s.fn(u) + ' 不符合形状')
}

/* ---------------- 4. STYLES 表与 convertAll ---------------- */
T.eq('11 种风格', N.STYLES.length, 11)
T.eq('风格 key 唯一', new Set(N.STYLES.map((s) => s.key)).size, 11)
T.ok('每项有 name/sample/fn', N.STYLES.every((s) => s.name && typeof s.sample === 'string' && typeof s.fn === 'function'))
T.ok('sample 与 fn 自洽', N.STYLES.every((s) => s.sample === s.fn(['user', 'name'])), 'sample 不是该风格的示例')
T.ok('fn 在空词表下不抛', N.STYLES.every((s) => s.fn([]) === ''))

const all = N.convertAll('user_name')
T.eq('convertAll 词序列', JSON.stringify(all.words), JSON.stringify(['user', 'name']))
T.eq('convertAll 输出 11 项', all.list.length, 11)
T.eq('convertAll camel 值', all.list.find((x) => x.key === 'camel').value, 'userName')
T.ok('convertAll 每项都带 key/value', all.list.every((x) => typeof x.key === 'string' && typeof x.value === 'string'))
T.ok('convertAll 无脏字', all.list.every((x) => noJunk(x.value)))

const emptyAll = N.convertAll('')
T.ok('空输入所有风格为空串', emptyAll.list.every((x) => x.value === ''))
T.eq('空输入词序列为空', emptyAll.words.length, 0)
T.ok('空输入 list 仍有 11 项', emptyAll.list.length === 11)

/* ---------------- 5. 往返与幂等 ---------------- */
const roundWords = N.splitWords(N.toSnake(N.splitWords('HTTPServer'))).map((w) => w.toLowerCase())
T.eq('snake 输出可再分词回原词', JSON.stringify(roundWords), JSON.stringify(['http', 'server']))
const snakeOnce = N.toSnake(N.splitWords('XMLHttpRequest'))
T.eq('snake 幂等', N.toSnake(N.splitWords(snakeOnce)), snakeOnce)
const camelOnce = N.toCamel(N.splitWords('user_name'))
T.eq('camel 幂等', N.toCamel(N.splitWords(camelOnce)), camelOnce)
T.eq('toCamel([]) 为空串', N.toCamel([]), '')
T.eq('toPascal([]) 为空串', N.toPascal([]), '')

/* ---------------- 6. 大小写与 CJK ---------------- */
T.ok('constant 全大写', N.toConstant(u) === N.toConstant(u).toUpperCase())
T.ok('snake 全小写', N.toSnake(u) === N.toSnake(u).toLowerCase())
T.ok('中文原样保留（constant）', N.toConstant(N.splitWords('用户id')) === '用户id')
T.ok('中文原样保留（convertAll）', N.convertAll('用户id').list.every((x) => x.value === '用户id'))
T.eq('slug 剥掉特殊符号', N.toSlug(N.splitWords('Hello@World#2024!')), 'hello-world-2024')
T.ok('slug 不以横线开头结尾', !/^-|-$/.test(N.toSlug(N.splitWords('Hello@World'))))

T.done()
