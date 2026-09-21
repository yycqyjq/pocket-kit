/**
 * JSON 转 TypeScript 类型
 * 从实际数据反推接口定义，数组会合并成联合类型，缺失的字段标成可选。
 */

const isValidIdent = (s) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s)

function safeKey(key) {
  return isValidIdent(key) ? key : JSON.stringify(key)
}

function typeOf(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function toPascal(s) {
  const words = String(s)
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return 'Item'
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join('')
}

/**
 * 推断一个值的类型表达式
 * @param {*} value
 * @param {string} name 用于命名子接口
 * @param {object} ctx { interfaces: Map, arrayHints: Set, useArrayGeneric }
 */
function infer(value, name, ctx) {
  const t = typeOf(value)

  if (t === 'null') return 'null'
  if (t === 'string' || t === 'number' || t === 'boolean') return t
  if (t === 'undefined') return 'undefined'

  if (t === 'array') {
    if (!value.length) {
      return ctx.useArrayGeneric ? 'unknown[]' : 'any[]'
    }
    // 合并数组内所有元素的类型
    const subTypes = []
    const objMerges = []
    value.forEach((item) => {
      if (typeOf(item) === 'object' && item !== null) {
        objMerges.push(item)
      } else {
        const st = infer(item, name.replace(/s$/, '') || name, ctx)
        if (subTypes.indexOf(st) < 0) subTypes.push(st)
      }
    })
    if (objMerges.length) {
      const iface = mergeObjects(objMerges, singular(name), ctx)
      subTypes.push(iface)
    }
    const union = subTypes.length ? subTypes.join(' | ') : 'unknown'
    return union.indexOf('|') > -1 ? '(' + union + ')[]' : union + '[]'
  }

  if (t === 'object') {
    return mergeObjects([value], name, ctx)
  }
  return 'unknown'
}

function singular(name) {
  if (/ies$/.test(name)) return name.replace(/ies$/, 'y')
  if (/ses$/.test(name)) return name.replace(/es$/, '')
  if (/s$/.test(name) && !/ss$/.test(name)) return name.replace(/s$/, '')
  return name + 'Item'
}

/** 合并多个对象样本，推断出接口 */
function mergeObjects(samples, name, ctx) {
  const ifaceName = toPascal(name)
  if (ctx.interfaces.has(ifaceName)) return ifaceName

  // 先占坑，避免自引用时无限递归
  ctx.interfaces.set(ifaceName, null)

  const keys = []
  const counts = {}
  samples.forEach((s) => {
    Object.keys(s).forEach((k) => {
      if (keys.indexOf(k) < 0) keys.push(k)
      counts[k] = (counts[k] || 0) + 1
    })
  })

  const fields = keys.map((k) => {
    const values = samples.filter((s) => k in s).map((s) => s[k])
    // 数组类型的样本要合并
    const types = []
    values.forEach((v) => {
      if (typeOf(v) === 'array') {
        const merged = v.concat.apply([], samples.filter((s) => k in s).map((s) => (Array.isArray(s[k]) ? s[k] : [])))
        const t = infer(merged, k, ctx)
        if (types.indexOf(t) < 0) types.push(t)
      } else {
        const t = infer(v, k, ctx)
        if (types.indexOf(t) < 0) types.push(t)
      }
    })
    const optional = counts[k] < samples.length
    return {
      key: k,
      tsName: safeKey(k),
      type: types.length ? types.join(' | ') : 'unknown',
      optional,
      comment: k !== safeKey(k) ? '原字段名：' + k : '',
    }
  })

  ctx.interfaces.set(ifaceName, { name: ifaceName, fields })
  return ifaceName
}

/**
 * @param {*} value 已解析的 JS 值（通常是 JSON.parse 的结果）
 * @param {object} opt { rootName, indent, semicolon, useInterface }
 */
export function jsonToTs(value, opt) {
  const o = Object.assign({ rootName: 'Root', indent: 2, semicolon: true, useArrayGeneric: false }, opt || {})
  const ctx = { interfaces: new Map(), useArrayGeneric: o.useArrayGeneric }

  let rootType
  if (typeOf(value) === 'object' && value !== null && !Array.isArray(value)) {
    rootType = mergeObjects([value], o.rootName, ctx)
  } else if (Array.isArray(value)) {
    rootType = 'type ' + toPascal(o.rootName) + ' = ' + infer(value, o.rootName, ctx)
  } else {
    rootType = 'type ' + toPascal(o.rootName) + ' = ' + infer(value, o.rootName, ctx)
  }

  const pad = ' '.repeat(o.indent)
  const blocks = []
  ctx.interfaces.forEach((iface) => {
    if (!iface) return
    const lines = ['export interface ' + iface.name + ' {']
    iface.fields.forEach((f) => {
      if (f.comment) lines.push(pad + '// ' + f.comment)
      lines.push(pad + f.tsName + (f.optional ? '?' : '') + ': ' + f.type + (o.semicolon ? ';' : ''))
    })
    lines.push('}')
    blocks.push(lines.join('\n'))
  })

  const head = rootType.startsWith('type ') ? 'export ' + rootType : '// 根接口：' + rootType
  return {
    text: head + '\n\n' + blocks.join('\n\n'),
    interfaces: blocks.length,
    root: rootType,
  }
}

export const TS_SAMPLE = JSON.stringify(
  {
    code: 0,
    message: 'ok',
    data: {
      total: 128,
      page: 2,
      list: [
        { id: 1, name: '随身匣', tags: ['工具', '离线'], owner: { uid: 'u1', nick: 'you' }, deleted: null },
        { id: 2, name: 'it-tools', tags: [], owner: { uid: 'u2', nick: 'Corentin' }, extra: true },
      ],
    },
  },
  null,
  2
)
