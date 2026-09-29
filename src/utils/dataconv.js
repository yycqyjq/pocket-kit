/**
 * 数据格式互转
 * 以 JS 值为中枢：先 parse 成值，再 stringify 成目标格式。
 *
 * 支持 JSON / CSV / Markdown 表格 / XML / YAML / TOML 六种。
 * 其中 YAML、TOML 是「够用的子集」实现：只覆盖日常配置文件的写法，
 * 不支持锚点引用、多行块标量、日期时间类型等高级特性——
 * 遇到不支持的写法会明确提示，而不是猜一个错误结果。
 */

export const FORMATS = [
  { key: 'json', name: 'JSON' },
  { key: 'csv', name: 'CSV' },
  { key: 'md', name: 'Markdown 表格' },
  { key: 'xml', name: 'XML' },
  { key: 'yaml', name: 'YAML' },
  { key: 'toml', name: 'TOML' },
]

/* ==================== 解析：文本 -> 值 ==================== */

/* ---------- CSV ---------- */

/** 解析一行 CSV，处理引号包裹与转义 */
function splitCsvLine(line, delim) {
  const out = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQuote = false
      } else cur += c
    } else if (c === '"') {
      inQuote = true
    } else if (c === delim) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

function guessDelimiter(text) {
  const firstLine = text.split(/\r?\n/)[0] || ''
  const cands = [',', '\t', ';', '|']
  let best = ','
  let bestN = -1
  for (const d of cands) {
    const n = splitCsvLine(firstLine, d).length
    if (n > bestN) {
      bestN = n
      best = d
    }
  }
  return best
}

function parseCsv(text) {
  const src = String(text).replace(/^\uFEFF/, '').trim()
  if (!src) throw new Error('CSV 内容是空的')
  const delim = guessDelimiter(src)
  const lines = src.split(/\r?\n/).filter((l) => l.trim() !== '')
  const rows = lines.map((l) => splitCsvLine(l, delim))
  const header = rows[0].map((h) => h.trim())
  const out = []
  for (let i = 1; i < rows.length; i++) {
    const obj = {}
    header.forEach((h, k) => {
      obj[h || '列' + (k + 1)] = coerceScalar(rows[i][k] === undefined ? '' : rows[i][k])
    })
    out.push(obj)
  }
  return out
}

/** CSV 里的数字/布尔尽量还原成真类型，方便转 JSON 时好看 */
function coerceScalar(v) {
  const s = String(v).trim()
  if (s === '') return ''
  if (/^-?\d+$/.test(s) && s.length < 16) return Number(s)
  if (/^-?\d+\.\d+$/.test(s)) return Number(s)
  if (s === 'true') return true
  if (s === 'false') return false
  if (s === 'null') return null
  return s
}

/* ---------- Markdown 表格 ---------- */

function parseMd(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'))
  if (lines.length < 2) throw new Error('Markdown 表格至少要有表头和分隔行')
  const cells = (l) =>
    l
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim())
  const header = cells(lines[0])
  const body = lines.slice(1).filter((l) => !/^\|[\s:|-]+\|$/.test(l))
  return body.map((l) => {
    const c = cells(l)
    const obj = {}
    header.forEach((h, i) => {
      obj[h || '列' + (i + 1)] = coerceScalar(c[i] === undefined ? '' : c[i])
    })
    return obj
  })
}

/* ---------- XML ---------- */

function parseXml(src) {
  let s = String(src)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/g, '')
    .trim()
  if (!s) throw new Error('XML 内容是空的')
  let pos = 0
  const skipWs = () => {
    while (pos < s.length && /\s/.test(s[pos])) pos++
  }

  function parseElement() {
    skipWs()
    if (s[pos] !== '<') throw new Error('XML 格式有误：这里应该是个标签')
    pos++
    const nm = /^[^\s/>]+/.exec(s.slice(pos))
    if (!nm) throw new Error('XML 标签名缺失')
    const name = nm[0]
    pos += name.length
    const attrs = {}
    for (;;) {
      skipWs()
      if (s.slice(pos, pos + 2) === '/>') {
        pos += 2
        return { name, attrs, children: [], text: '' }
      }
      if (s[pos] === '>') {
        pos++
        break
      }
      const am = /^([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(s.slice(pos))
      if (!am) throw new Error('XML 属性写法有误，应该形如 name="value"')
      attrs[am[1]] = am[2] !== undefined ? am[2] : am[3]
      pos += am[0].length
    }
    const children = []
    let text = ''
    for (;;) {
      if (pos >= s.length) throw new Error('标签 <' + name + '> 没有闭合')
      if (s.slice(pos, pos + 2) === '</') {
        const re = new RegExp('^</\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*>')
        const cm = re.exec(s.slice(pos))
        if (!cm) throw new Error('闭合标签与 <' + name + '> 不匹配')
        pos += cm[0].length
        break
      }
      if (s[pos] === '<') {
        children.push(parseElement())
        continue
      }
      const lt = s.indexOf('<', pos)
      text += lt < 0 ? s.slice(pos) : s.slice(pos, lt)
      pos = lt < 0 ? s.length : lt
    }
    return { name, attrs, children, text }
  }

  const roots = []
  while (pos < s.length) {
    skipWs()
    if (pos >= s.length) break
    if (s[pos] !== '<') throw new Error('XML 根节点之外还有多余内容')
    roots.push(parseElement())
  }
  if (!roots.length) throw new Error('没找到 XML 元素')
  if (roots.length > 1) throw new Error('XML 只能有一个根节点，现在有 ' + roots.length + ' 个')
  return roots[0]
}

function elemToValue(el) {
  const obj = {}
  let hasAttr = false
  for (const k in el.attrs) {
    obj['@' + k] = el.attrs[k]
    hasAttr = true
  }
  const txt = el.text.trim()
  if (txt) obj['#text'] = txt
  for (const c of el.children) {
    const v = elemToValue(c)
    if (obj[c.name] === undefined) obj[c.name] = v
    else if (Array.isArray(obj[c.name])) obj[c.name].push(v)
    else obj[c.name] = [obj[c.name], v]
  }
  const keys = Object.keys(obj)
  if (!keys.length) return ''
  if (keys.length === 1 && obj['#text'] !== undefined && !hasAttr && !el.children.length) return obj['#text']
  return obj
}

function parseXmlValue(src) {
  const root = parseXml(src)
  return { [root.name]: elemToValue(root) }
}

/* ---------- YAML（子集） ---------- */

function yamlLines(text) {
  return String(text)
    .replace(/\t/g, '  ')
    .split(/\r?\n/)
    .map((raw) => {
      const noComment = stripYamlComment(raw)
      return { indent: noComment.match(/^ */)[0].length, text: noComment.trim(), raw: noComment }
    })
    .filter((l) => l.text !== '' && l.text !== '---')
}

function stripYamlComment(line) {
  let inS = false
  let inD = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === "'" && !inD) inS = !inS
    else if (c === '"' && !inS) inD = !inD
    else if (c === '#' && !inS && !inD && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i)
    }
  }
  return line
}

function parseYamlScalar(s) {
  const t = s.trim()
  if (t === '') return null
  if (t === '~' || t === 'null' || t === 'Null' || t === 'NULL') return null
  if (t === 'true' || t === 'True' || t === 'TRUE') return true
  if (t === 'false' || t === 'False' || t === 'FALSE') return false
  if (/^-?\d+$/.test(t)) return Number(t)
  if (/^-?\d*\.\d+([eE][+-]?\d+)?$/.test(t)) return Number(t)
  if (t[0] === '"' && t[t.length - 1] === '"') {
    try {
      return JSON.parse(t)
    } catch (e) {
      return t.slice(1, -1)
    }
  }
  if (t[0] === "'" && t[t.length - 1] === "'") return t.slice(1, -1).replace(/''/g, "'")
  if (t[0] === '[' && t[t.length - 1] === ']') {
    return splitTopLevel(t.slice(1, -1)).map((x) => parseYamlScalar(x))
  }
  if (t[0] === '{' && t[t.length - 1] === '}') {
    const o = {}
    splitTopLevel(t.slice(1, -1)).forEach((kv) => {
      const idx = kv.indexOf(':')
      if (idx > -1) o[kv.slice(0, idx).trim()] = parseYamlScalar(kv.slice(idx + 1))
    })
    return o
  }
  return t
}

/** 按顶层逗号切分（忽略引号与括号内的逗号） */
function splitTopLevel(s) {
  const out = []
  let cur = ''
  let depth = 0
  let inS = false
  let inD = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === "'" && !inD) inS = !inS
    else if (c === '"' && !inS) inD = !inD
    else if (!inS && !inD) {
      if (c === '[' || c === '{') depth++
      else if (c === ']' || c === '}') depth--
      else if (c === ',' && depth === 0) {
        out.push(cur)
        cur = ''
        continue
      }
    }
    cur += c
  }
  if (cur.trim() !== '') out.push(cur)
  return out
}

function parseYaml(text) {
  const lines = yamlLines(text)
  if (!lines.length) throw new Error('YAML 内容是空的')
  if (lines.some((l) => /(^|\s)[&*]\w|<<:/.test(l.text))) {
    throw new Error('暂不支持 YAML 的锚点与引用（& * <<），请展开后再转换')
  }
  if (lines.some((l) => /[|>][-+]?$/.test(l.text))) {
    throw new Error('暂不支持 YAML 的多行块标量（| 和 >），请改成单行或加引号')
  }

  let idx = 0

  /** 下一行的缩进（必须比 min 更深），没有则返回 null */
  function nextIndent(min) {
    if (idx >= lines.length) return null
    return lines[idx].indent > min ? lines[idx].indent : null
  }

  /** 解析一个缩进层级为 indent 的块（对象或数组） */
  function parseBlock(indent) {
    const first = lines[idx]
    const isList = first.text === '-' || first.text.startsWith('- ')
    const container = isList ? [] : {}

    while (idx < lines.length) {
      const line = lines[idx]
      if (line.indent < indent) break
      if (line.indent > indent) {
        throw new Error('YAML 第 ' + (idx + 1) + ' 行缩进比同级多了，检查一下对齐')
      }

      if (isList) {
        if (line.text !== '-' && !line.text.startsWith('- ')) break
        const itemIndent = line.indent
        const rest = line.text === '-' ? '' : line.text.slice(1).trim()
        idx++
        if (rest === '') {
          const ni = nextIndent(itemIndent)
          container.push(ni === null ? null : parseBlock(ni))
        } else if (isKeyValue(rest)) {
          const obj = {}
          readKeyInto(obj, rest, itemIndent)
          readSiblingKeys(obj, itemIndent)
          container.push(obj)
        } else {
          container.push(parseYamlScalar(rest))
        }
        continue
      }

      if (line.text === '-' || line.text.startsWith('- ')) break
      if (!isKeyValue(line.text)) {
        throw new Error('YAML 第 ' + (idx + 1) + ' 行不是 key: value 的形式')
      }
      const keyIndent = line.indent
      const seg = line.text
      idx++
      readKeyInto(container, seg, keyIndent)
    }
    return container
  }

  /** 把 "key: value" 或 "key:" 写进 obj，key 后面没值时递归解析子块 */
  function readKeyInto(obj, seg, keyIndent) {
    const ci = seg.indexOf(':')
    const key = seg.slice(0, ci).trim().replace(/^["']|["']$/g, '')
    const rest = seg.slice(ci + 1).trim()
    if (rest === '') {
      const ni = nextIndent(keyIndent)
      obj[key] = ni === null ? null : parseBlock(ni)
    } else {
      obj[key] = parseYamlScalar(rest)
    }
    return key
  }

  /** 列表项里第一个 key 之后的同级 key */
  function readSiblingKeys(obj, itemIndent) {
    while (idx < lines.length) {
      const line = lines[idx]
      if (line.indent <= itemIndent) break
      if (line.text === '-' || line.text.startsWith('- ')) break
      if (!isKeyValue(line.text)) break
      const keyIndent = line.indent
      const seg = line.text
      idx++
      readKeyInto(obj, seg, keyIndent)
    }
  }

  const value = parseBlock(lines[0].indent)
  if (idx < lines.length) {
    throw new Error('YAML 解析到第 ' + (idx + 1) + ' 行就进行不下去了，检查缩进')
  }
  return value
}

function isKeyValue(s) {
  const ci = s.indexOf(':')
  if (ci < 0) return false
  // 排除 "http://x" 这种冒号后紧跟斜杠的情况
  if (s[ci + 1] === '/' || s[ci + 1] === '\\') return false
  return true
}

/* ---------- TOML（子集） ---------- */

function parseToml(text) {
  const root = {}
  let cur = root
  const lines = String(text).split(/\r?\n/)
  lines.forEach((raw, n) => {
    const line = stripYamlComment(raw).trim()
    if (!line) return
    if (line.startsWith('[[') && line.endsWith(']]')) {
      const path = line.slice(2, -2).trim().split('.')
      let node = root
      for (let i = 0; i < path.length - 1; i++) {
        node[path[i]] = node[path[i]] || {}
        node = node[path[i]]
      }
      const last = path[path.length - 1]
      if (!Array.isArray(node[last])) node[last] = []
      const item = {}
      node[last].push(item)
      cur = item
      return
    }
    if (line.startsWith('[') && line.endsWith(']')) {
      const path = line.slice(1, -1).trim().split('.')
      let node = root
      for (const p of path) {
        node[p] = node[p] || {}
        node = node[p]
      }
      cur = node
      return
    }
    const eq = line.indexOf('=')
    if (eq < 0) throw new Error('TOML 第 ' + (n + 1) + ' 行不是 key = value 的形式')
    const key = line.slice(0, eq).trim().replace(/^["']|["']$/g, '')
    const val = line.slice(eq + 1).trim()
    cur[key] = parseYamlScalar(val)
  })
  return root
}

/* ==================== 序列化：值 -> 文本 ==================== */

const isPlainObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/* ---------- CSV ---------- */

function csvCell(v) {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function toCsv(value) {
  const rows = Array.isArray(value) ? value : [value]
  if (!rows.length) return ''
  if (isPlainObj(rows[0])) {
    const cols = []
    rows.forEach((r) => {
      if (isPlainObj(r)) Object.keys(r).forEach((k) => cols.indexOf(k) < 0 && cols.push(k))
    })
    return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r && r[c])).join(','))].join('\n')
  }
  return rows.map((r) => (Array.isArray(r) ? r.map(csvCell).join(',') : csvCell(r))).join('\n')
}

/* ---------- Markdown 表格 ---------- */

function toMd(value) {
  const rows = Array.isArray(value) ? value : [value]
  if (!rows.length) return ''
  if (!isPlainObj(rows[0])) {
    return ['| 值 |', '| --- |', ...rows.map((r) => '| ' + csvCell(r).replace(/\|/g, '\\|') + ' |')].join('\n')
  }
  const cols = []
  rows.forEach((r) => Object.keys(r).forEach((k) => cols.indexOf(k) < 0 && cols.push(k)))
  const cell = (v) => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  }
  const head = '| ' + cols.join(' | ') + ' |'
  const sep = '| ' + cols.map(() => '---').join(' | ') + ' |'
  const body = rows.map((r) => '| ' + cols.map((c) => cell(r && r[c])).join(' | ') + ' |')
  return [head, sep, ...body].join('\n')
}

/* ---------- XML ---------- */

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function valueToXml(key, value, pad, out) {
  const ind = '  '.repeat(pad)
  if (Array.isArray(value)) {
    value.forEach((v) => valueToXml(key, v, pad, out))
    return
  }
  if (isPlainObj(value)) {
    const attrs = []
    const body = []
    for (const k in value) {
      if (k[0] === '@') attrs.push(' ' + k.slice(1) + '="' + xmlEscape(value[k]) + '"')
      else if (k === '#text') body.push(xmlEscape(value[k]))
      else body.push(k)
    }
    if (!body.length) {
      out.push(ind + '<' + key + attrs.join('') + '/>')
      return
    }
    const onlyText = body.length === 1 && body[0] === xmlEscape(value['#text'] !== undefined ? value['#text'] : '')
    if (onlyText) {
      out.push(ind + '<' + key + attrs.join('') + '>' + xmlEscape(value['#text']) + '</' + key + '>')
      return
    }
    out.push(ind + '<' + key + attrs.join('') + '>')
    for (const k in value) {
      if (k[0] === '@') continue
      if (k === '#text') out.push(ind + '  ' + xmlEscape(value[k]))
      else valueToXml(k, value[k], pad + 1, out)
    }
    out.push(ind + '</' + key + '>')
    return
  }
  const text = value === null || value === undefined ? '' : xmlEscape(value)
  out.push(ind + '<' + key + '>' + text + '</' + key + '>')
}

function toXml(value) {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>']
  const keys = isPlainObj(value) ? Object.keys(value) : null
  if (keys && keys.length === 1) {
    valueToXml(keys[0], value[keys[0]], 0, out)
  } else if (keys) {
    // XML 只允许一个根节点，多个顶层键时统一包一层 <root>
    out.push('<root>')
    for (const k in value) valueToXml(k, value[k], 1, out)
    out.push('</root>')
  } else if (Array.isArray(value)) {
    out.push('<root>')
    valueToXml('item', value, 1, out)
    out.push('</root>')
  } else {
    valueToXml('value', value, 0, out)
  }
  return out.join('\n')
}

/* ---------- YAML ---------- */

const NEEDS_QUOTE = /^(?:|~|null|true|false|[-+]?\d+(\.\d+)?|[&*!|>%@`"'#,[\]{}?:-].*|.*[:#].*|\s.*|\s*)$/i

function yamlScalar(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'boolean') return String(v)
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null'
  const s = String(v)
  if (s === '') return '""'
  if (NEEDS_QUOTE.test(s)) return JSON.stringify(s)
  return s
}

function yamlBlock(value, pad, out) {
  const ind = '  '.repeat(pad)
  if (Array.isArray(value)) {
    if (!value.length) {
      out.push(ind + '[]')
      return
    }
    value.forEach((v) => {
      if (isPlainObj(v) || Array.isArray(v)) {
        const sub = []
        yamlBlock(v, pad + 1, sub)
        out.push(ind + '- ' + sub[0].slice((pad + 1) * 2))
        sub.slice(1).forEach((l) => out.push(l))
      } else {
        out.push(ind + '- ' + yamlScalar(v))
      }
    })
    return
  }
  if (isPlainObj(value)) {
    const keys = Object.keys(value)
    if (!keys.length) {
      out.push(ind + '{}')
      return
    }
    keys.forEach((k) => {
      const v = value[k]
      if (isPlainObj(v) || Array.isArray(v)) {
        if ((Array.isArray(v) && !v.length) || (isPlainObj(v) && !Object.keys(v).length)) {
          out.push(ind + k + ': ' + (Array.isArray(v) ? '[]' : '{}'))
        } else {
          out.push(ind + k + ':')
          yamlBlock(v, pad + 1, out)
        }
      } else {
        out.push(ind + k + ': ' + yamlScalar(v))
      }
    })
    return
  }
  out.push(ind + yamlScalar(value))
}

function toYaml(value) {
  const out = []
  yamlBlock(value, 0, out)
  return out.join('\n')
}

/* ---------- TOML ---------- */

function tomlScalar(v) {
  if (v === null || v === undefined) return '""'
  if (typeof v === 'boolean') return String(v)
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) return '[' + v.map(tomlScalar).join(', ') + ']'
  if (isPlainObj(v)) {
    return '{ ' + Object.keys(v).map((k) => k + ' = ' + tomlScalar(v[k])).join(', ') + ' }'
  }
  return JSON.stringify(String(v))
}

function toToml(value) {
  if (!isPlainObj(value)) {
    throw new Error('TOML 的顶层必须是对象（键值对），当前顶层是' + (Array.isArray(value) ? '数组' : typeof value))
  }
  const out = []
  const scalars = (obj, prefix) => {
    for (const k in obj) {
      const v = obj[k]
      if (isPlainObj(v) || (Array.isArray(v) && v.length && isPlainObj(v[0]))) continue
      out.push(prefix + k + ' = ' + tomlScalar(v))
    }
  }
  const tables = (obj, prefix, path) => {
    for (const k in obj) {
      const v = obj[k]
      const full = path ? path + '.' + k : k
      if (isPlainObj(v)) {
        out.push('')
        out.push('[' + full + ']')
        scalars(v, '')
        tables(v, '', full)
      } else if (Array.isArray(v) && v.length && isPlainObj(v[0])) {
        v.forEach((item) => {
          out.push('')
          out.push('[[' + full + ']]')
          scalars(item, '')
          tables(item, '', full)
        })
      }
    }
  }
  scalars(value, '')
  tables(value, '', '')
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/* ==================== 对外接口 ==================== */

const PARSERS = {
  json: (t) => {
    try {
      return JSON.parse(t)
    } catch (e) {
      const m = /position\s+(\d+)/i.exec(e.message)
      if (m) {
        const pos = Number(m[1])
        const before = String(t).slice(0, pos)
        const line = before.split('\n').length
        const col = pos - before.lastIndexOf('\n')
        throw new Error('JSON 第 ' + line + ' 行第 ' + col + ' 列附近有语法错误', { cause: e })
      }
      throw new Error('JSON 解析失败：' + e.message, { cause: e })
    }
  },
  csv: parseCsv,
  md: parseMd,
  xml: parseXmlValue,
  yaml: parseYaml,
  toml: parseToml,
}

const STRINGIFY = {
  json: (v) => JSON.stringify(v, null, 2),
  csv: toCsv,
  md: toMd,
  xml: toXml,
  yaml: toYaml,
  toml: toToml,
}

export function formatName(key) {
  const f = FORMATS.find((x) => x.key === key)
  return f ? f.name : key
}

/**
 * @param {string} text 源文本
 * @param {string} from 源格式
 * @param {string} to   目标格式
 */
export function convert(text, from, to) {
  const src = String(text || '').trim()
  if (!src) throw new Error('请先粘贴要转换的内容')
  const parse = PARSERS[from]
  const stringify = STRINGIFY[to]
  if (!parse) throw new Error('不支持的源格式：' + from)
  if (!stringify) throw new Error('不支持的目标格式：' + to)
  if (from === to) return { text: src, note: '源格式与目标格式相同，未做转换' }

  let value = parse(src)
  let wrapNote = ''
  // TOML 顶层必须是键值对。CSV / Markdown 解析出来是数组，
  // 直接报错不如自动包一层，并在界面上说明
  if (to === 'toml' && Array.isArray(value)) {
    value = { items: value }
    wrapNote = 'TOML 顶层必须是键值对，已自动包一层 items'
  }
  let out
  try {
    out = stringify(value)
  } catch (e) {
    throw new Error('转成 ' + formatName(to) + ' 失败：' + e.message, { cause: e })
  }
  return { text: out, note: wrapNote }
}

/** 各格式的能力与限制，展示在界面上 */
export const FORMAT_NOTES = {
  json: '标准 JSON。可作源也可作目标。',
  csv: '默认把第一行当表头。会自动识别逗号 / 制表符 / 分号 / 竖线分隔符。',
  md: 'Markdown 表格，第一行是表头，第二行是分隔行。',
  xml: '只接受单个根节点。属性会写成 @name，文本会写成 #text。',
  yaml: '支持日常配置的写法（嵌套、列表、行内数组）。不支持锚点 & * 与多行块标量 | >，遇到会提示。',
  toml: '顶层必须是对象。支持 [table] 与 [[array of tables]]，不支持日期时间字面量。',
}

export const SAMPLES = {
  json: JSON.stringify(
    {
      name: '随身匣',
      version: '1.0.0',
      offline: true,
      tools: [
        { id: 'hash', name: '哈希工坊', enabled: true },
        { id: 'cron', name: 'Cron 表达式', enabled: false },
      ],
      author: { nick: 'you', mail: 'hi@example.com' },
    },
    null,
    2
  ),
  csv: 'id,name,age,city\n1,张三,28,北京\n2,李四,34,上海\n3,王五,25,广州',
  md: '| 项目 | 数量 | 单价 |\n| --- | --- | --- |\n| 键盘 | 2 | 199 |\n| 显示器 | 1 | 1299 |',
  xml: '<?xml version="1.0"?>\n<book id="1">\n  <title>向死而生</title>\n  <author>佚名</author>\n  <tags>\n    <tag>玄幻</tag>\n    <tag>修炼</tag>\n  </tags>\n</book>',
  yaml: 'server:\n  host: 0.0.0.0\n  port: 8080\n  tls: true\nusers:\n  - name: alice\n    role: admin\n  - name: bob\n    role: viewer',
  toml: '[server]\nhost = "0.0.0.0"\nport = 8080\ntls = true\n\n[[users]]\nname = "alice"\nrole = "admin"\n\n[[users]]\nname = "bob"\nrole = "viewer"',
}
