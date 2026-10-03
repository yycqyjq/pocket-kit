/**
 * HTML / CSS 美化与压缩
 * 思路：先按语法切 token（跳过字符串与注释），再按规则重新排版。
 * 不做语法校验，也不会改写选择器与属性。
 */

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
const INLINE_TAGS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd',
  'mark', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup',
  'time', 'u', 'var', 'wbr',
])
const RAW_TAGS = new Set(['pre', 'textarea', 'script', 'style'])

/* ==================== CSS ==================== */

function tokenizeCss(src) {
  const s = String(src)
  const out = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '/' && s[i + 1] === '*') {
      const j = s.indexOf('*/', i + 2)
      const end = j < 0 ? s.length : j + 2
      out.push({ t: 'comment', v: s.slice(i, end) })
      i = end
      continue
    }
    if (c === '/' && s[i + 1] === '/') {
      // 非标准但很常见，很多人会在 css 里写 // 注释
      const j = s.indexOf('\n', i)
      const end = j < 0 ? s.length : j
      out.push({ t: 'comment', v: s.slice(i, end) })
      i = end
      continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < s.length) {
        if (s[j] === '\\') {
          j += 2
          continue
        }
        if (s[j] === c) {
          j++
          break
        }
        j++
      }
      out.push({ t: 'str', v: s.slice(i, j) })
      i = j
      continue
    }
    if (c === '{' || c === '}' || c === ';') {
      out.push({ t: c })
      i++
      continue
    }
    if (/\s/.test(c)) {
      i++
      continue
    }
    // 普通片段，一直吃到下一个结构字符
    let j = i
    while (j < s.length && !'{};'.includes(s[j]) && !/\s/.test(s[j])) {
      if (s[j] === '/' && (s[j + 1] === '*' || s[j + 1] === '/')) break
      if (s[j] === '"' || s[j] === "'") break
      j++
    }
    if (j === i) {
      out.push({ t: 'word', v: s[i] })
      i++
    } else {
      out.push({ t: 'word', v: s.slice(i, j) })
      i = j
    }
  }
  return out
}

const cssJoin = (parts) => {
  // 标点前后不加空格
  let out = ''
  parts.forEach((p, i) => {
    if (i === 0) {
      out = p
      return
    }
    const noSpaceBefore = /^[,:)>\]]/.test(p) || p === '!important'
    const noSpaceAfterPrev = /[(:,>[]$/.test(out)
    out += noSpaceBefore || noSpaceAfterPrev ? p : ' ' + p
  })
  return out
}

export function formatCss(src, opt) {
  const o = Object.assign({ indent: 2, minify: false }, opt || {})
  const tokens = tokenizeCss(src)
  if (!tokens.length) throw new Error('内容是空的')

  const pad = ' '.repeat(o.indent)

  if (o.minify) {
    let out = ''
    tokens.forEach((t, idx) => {
      if (t.t === 'comment') return
      if (t.t === '{') {
        out = out.replace(/\s+$/, '') + '{'
        return
      }
      if (t.t === '}') {
        out = out.replace(/;$/, '') + '}'
        return
      }
      if (t.t === ';') {
        out += ';'
        return
      }
      const prev = out[out.length - 1]
      const needSpace = out !== '' && !/[{};:,>([]$/.test(out) && !/^[,:)>\]]/.test(t.v) && prev !== ' '
      out += (needSpace ? ' ' : '') + t.v
    })
    // 以前这里还有一道全串清扫 /\s*([{}:;,>])\s*/g 加 /;}/g——它对整段文本
    // 生效，字符串字面量也被扫到：content:"x : y" 被改成 "x:y"、";}" 被改成 "}"，
    // 改了内容语义。逐 token 拼装时结构字符周围本来就不会留空格（needSpace
    // 两头的判断、{ 与 } 分支各自处理），清扫是重复劳动，唯一的实际效果
    // 就是误伤字符串——整行删掉。
    return { text: out, size: out.length }
  }

  const lines = []
  let depth = 0
  let buf = []

  const flush = () => {
    if (!buf.length) return
    const line = cssJoin(buf).trim()
    if (line) lines.push(pad.repeat(depth) + line)
    buf = []
  }

  tokens.forEach((t) => {
    if (t.t === 'comment') {
      flush()
      lines.push(pad.repeat(depth) + t.v.trim())
      return
    }
    if (t.t === '{') {
      const sel = cssJoin(buf).trim()
      buf = []
      lines.push(pad.repeat(depth) + (sel ? sel + ' ' : '') + '{')
      depth++
      return
    }
    if (t.t === '}') {
      flush()
      depth = Math.max(0, depth - 1)
      lines.push(pad.repeat(depth) + '}')
      return
    }
    if (t.t === ';') {
      flush()
      // 给上一行补分号
      if (lines.length) {
        const last = lines[lines.length - 1]
        if (!/[;{}]$/.test(last.trim())) lines[lines.length - 1] = last + ';'
      }
      return
    }
    buf.push(t.v)
  })
  flush()

  const text = lines.join('\n')
  return { text, lines: lines.length, size: text.length }
}

/* ==================== HTML ==================== */

function tokenizeHtml(src) {
  const s = String(src)
  const out = []
  let i = 0
  while (i < s.length) {
    if (s[i] === '<') {
      if (s.slice(i, i + 4) === '<!--') {
        const j = s.indexOf('-->', i + 4)
        const end = j < 0 ? s.length : j + 3
        out.push({ t: 'comment', v: s.slice(i, end) })
        i = end
        continue
      }
      // 找标签结束的 '>'，但要跳过引号内部 ——
      // 否则 title="a > b"、onclick="if(a>b){}" 这类属性值会被从中间切开，
      // 剩下的半截被当成文本节点重排
      let j = i + 1
      let quote = null
      while (j < s.length) {
        const ch = s[j]
        if (quote) {
          if (ch === quote) quote = null
        } else if (ch === '"' || ch === "'") {
          quote = ch
        } else if (ch === '>') {
          break
        }
        j++
      }
      if (j >= s.length) {
        out.push({ t: 'text', v: s.slice(i) })
        break
      }
      const raw = s.slice(i, j + 1)
      if (/^<!|^<\?/.test(raw)) out.push({ t: 'doctype', v: raw })
      else if (/^<\//.test(raw)) out.push({ t: 'close', v: raw, name: raw.replace(/^<\//, '').replace(/>$/, '').trim().toLowerCase() })
      else {
        const name = /^<([^\s/>]+)/.exec(raw)
        const tagName = name ? name[1].toLowerCase() : ''
        out.push({ t: 'open', v: raw, name: tagName, selfClose: /\/>$/.test(raw) })
      }
      i = j + 1
      continue
    }
    const j = s.indexOf('<', i)
    const end = j < 0 ? s.length : j
    out.push({ t: 'text', v: s.slice(i, end) })
    i = end
  }
  return out
}

export function formatHtml(src, opt) {
  const o = Object.assign({ indent: 2, minify: false }, opt || {})
  const tokens = tokenizeHtml(src)
  // 空口径与 formatCss 对齐（P3 修复）：CSS 那边纯空白切不出 token 所以抛错，
  // HTML 的切词器会把整段空白当成一个文本 token 留下来、静默排出个空结果——
  // 同模块两把尺。「没有可排版的内容」就是空，空白不算内容。
  if (!String(src).trim()) throw new Error('内容是空的')
  const pad = ' '.repeat(o.indent)

  if (o.minify) {
    let out = ''
    // pre / textarea / script / style 内部原样保留，不能压空白。
    // 非压缩分支有这层保护，压缩分支曾经漏了 —— 于是 <pre> 的排版会被压平。
    let lastRawTag = null
    tokens.forEach((t, i) => {
      if (t.t === 'comment') return
      if (t.t === 'text') {
        if (RAW_TAGS.has(lastRawTag)) {
          out += t.v
          return
        }
        const collapsed = t.v.replace(/\s+/g, ' ')
        const prev = tokens[i - 1]
        const next = tokens[i + 1]
        // 只保留有意义的文本；纯空白在标签之间可以整段删掉
        const keep = collapsed.trim() !== ''
        if (!keep) return
        const touchPrev = prev && (prev.t === 'open' || prev.t === 'close')
        const touchNext = next && (next.t === 'open' || next.t === 'close')
        out += (touchPrev ? '' : ' ') + collapsed.trim() + (touchNext ? '' : ' ')
        return
      }
      out += t.v
      if (t.t === 'open') lastRawTag = RAW_TAGS.has(t.name) ? t.name : null
      else if (t.t === 'close' && RAW_TAGS.has(t.name)) lastRawTag = null
    })
    return { text: out.trim(), size: out.length }
  }

  const lines = []
  let depth = 0
  let cur = ''
  // 当前是否处在 pre / script / style 里（内部内容原样保留，不重排）
  let lastRawTag = null
  const flush = () => {
    if (cur.trim()) lines.push(pad.repeat(depth) + cur.trim())
    cur = ''
  }

  tokens.forEach((t, idx) => {
    if (t.t === 'doctype' || t.t === 'comment') {
      flush()
      lines.push(pad.repeat(depth) + t.v.trim())
      return
    }
    if (t.t === 'text') {
      if (RAW_TAGS.has(lastRawTag)) {
        cur += t.v
        return
      }
      const collapsed = t.v.replace(/\s+/g, ' ').trim()
      if (!collapsed) return
      cur += (cur && !cur.endsWith('>') ? ' ' : '') + collapsed
      return
    }
    if (t.t === 'open') {
      const inline = INLINE_TAGS.has(t.name) || RAW_TAGS.has(t.name)
      if (inline) {
        cur += t.v
        lastRawTag = RAW_TAGS.has(t.name) ? t.name : null
        if (!t.selfClose && !VOID_TAGS.has(t.name) && RAW_TAGS.has(t.name)) depth++
        return
      }
      flush()
      lines.push(pad.repeat(depth) + t.v)
      if (!t.selfClose && !VOID_TAGS.has(t.name)) depth++
      return
    }
    if (t.t === 'close') {
      const inline = INLINE_TAGS.has(t.name) || RAW_TAGS.has(t.name)
      if (inline) {
        if (RAW_TAGS.has(t.name)) {
          depth = Math.max(0, depth - 1)
          lastRawTag = null
        }
        cur += t.v
        return
      }
      depth = Math.max(0, depth - 1)
      flush()
      lines.push(pad.repeat(depth) + t.v)
      return
    }
  })
  flush()

  const text = lines.join('\n')
  return { text, lines: lines.length, size: text.length }
}

export const HTML_SAMPLE = '<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>随身匣</title></head><body><div class="wrap"><h1>工具箱</h1><p>离线可用的<b>小工具</b>集合，共 <span>26</span> 件。</p><ul><li>哈希工坊</li><li>格式互转</li></ul><img src="a.png" alt="示例"></div></body></html>'

export const CSS_SAMPLE = '.card{padding:24rpx;border-radius:20rpx;background:#fff;border:1px solid rgba(29,37,33,.08)}\n.card .title{font-size:29rpx;font-weight:600;letter-spacing:1rpx}\n@media (max-width:600px){.card{padding:16rpx}}'
