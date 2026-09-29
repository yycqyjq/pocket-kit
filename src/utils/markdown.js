/**
 * Markdown 子集解析 / 反向转换 / 大纲 / 统计
 * ------------------------------------------------------------
 * 完全手写，零第三方依赖（没有引入 marked / markdown-it / DOMPurify 的代码）。
 *
 * 安全模型（第一优先级）：目标是 markdown-it 的 `html: false` 语义
 *   1. 先把行内代码 / 围栏代码块抽成占位符保护起来；
 *   2. 剩下的正文 **整体** 过 escapeHtml()，因此原文里的
 *      `<script>`、`<img onerror=…>` 只会变成可见文本 `&lt;script&gt;`，
 *      永远不会成为可执行节点；
 *   3. 我们自己生成的标签（p / h1 / code / table …）通过占位符回填，
 *      不经过二次转义，所以结构不会被破坏；
 *   4. 写进属性的值（href / src / alt / title）都经过转义；
 *   5. href / src 先按「浏览器解析属性」的视角解码一次再做协议嗅探
 *      （防 &#106;avascript: 这类写法），javascript: / data: / vbscript: / file: /
 *      blob: 等一律拒绝并记一条提示，只放行 http(s) / mailto / tel / ftp /
 *      相对路径 / #锚点（data:image/*;base64 仅对 <img> 放行）。
 *   => 视图层可以用 v-html 渲染本文件的产物，前提正是上面这套转义 + 白名单。
 *
 * 分层约定：纯函数，不碰 uni、不碰 document，不用正则 lookbehind（老内核会炸）。
 *
 * 支持子集：ATX 标题、段落、粗体 / 斜体 / 删除线、行内代码、围栏代码块（保留语言标注）、
 * 块引用（可嵌套）、有序 / 无序列表（嵌套层级 + 任务列表）、链接与自动链接、图片、
 * 表格（含对齐冒号）、分隔线、硬换行、反斜杠转义、HTML 注释剥离。
 * 暂不支持：脚注、定义列表、Setext 标题、四空格缩进代码块、原始 HTML 直穿。
 */

/** 输入长度上限（超出即截断并提示），与视图的 maxlength 保持一致 */
export const MD_MAX = 20000

/* ============================================================
 * 0. 基础工具
 * ============================================================ */

/** 生成好的 HTML 片段用 \u0001序号\u0001 占位；硬换行用 \u0002 占位。
 *  这两个字符都在 normalizeSrc 里被清除，正文不可能伪造。 */
const TOK = '\u0001'
const TOK_BR = '\u0002'
/** 块级 markdown 拼装时的分隔符 */
const SEP = '\u0003'

function createContext() {
  return { parts: [], warnings: [], slugUsed: Object.create(null) }
}
function warn(st, msg) {
  if (st.warnings.length >= 20) return
  st.warnings.push(msg)
}
function stash(st, html) {
  st.parts.push(html)
  return TOK + (st.parts.length - 1) + TOK
}
/** 回填占位符；片段自身可能再含占位符，故循环若干轮 */
function resolveTokens(html, st) {
  let out = String(html)
  let guard = 0
  while (out.indexOf(TOK) > -1 && guard++ < 24) {
    // \u0001 包裹的数字是本模块内部的占位符令牌，这里就是要按令牌还原
    // eslint-disable-next-line no-control-regex
    out = out.replace(/\u0001(\d+)\u0001/g, function (m, i) {
      const v = st.parts[Number(i)]
      return v == null ? '' : v
    })
  }
  // 同上：\u0002 占位符换行标记，还原为 <br />
  // eslint-disable-next-line no-control-regex
  return out.replace(/\u0002/g, '<br />')
}

/** 文本节点转义 */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 属性值转义（用于还能拿到原文的地方） */
export function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * 属性值收尾：正文此时已过 escapeHtml（& < > 已成实体），
 * 但引号还是原样，直接拼进 href / src / alt / title 会被 " 越狱。
 * 这里只做两件事：引号转实体（& 已转义，不会二次编码），百分号编码尖括号以外的残留控制符。
 */
function attrSafe(s) {
  return String(s)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/[\t\n\r]/g, '')
}

/** UTF-8 字节数（自己算，不依赖 TextEncoder / Buffer） */
function utf8Len(s) {
  const str = String(s)
  let n = 0
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    if (c < 0x80) n += 1
    else if (c < 0x800) n += 2
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        n += 4
        i++
      } else n += 3
    } else n += 3
  }
  return n
}

/** 统一换行；清掉除 \t \n 之外的控制字符（含占位符本身，防止伪造） */
function normalizeSrc(s) {
  return String(s == null ? '' : s)
    .replace(/\r\n?/g, '\n')
    // 本函数职责就是清洗控制字符；连内部占位符 \u0001 也一并清掉，防止输入伪造令牌
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
}

function clip(s, n) {
  const str = String(s)
  const max = n || 40
  return str.length > max ? str.slice(0, max) + '…' : str
}

/* ---------- 锚点 slug：mdToHtml 与 outline 共用，保证 id 与大纲对得上 ---------- */

export function slugify(text) {
  const s = String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{Script=Han}\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return s || 'section'
}
function nextSlug(st, text) {
  const base = slugify(text)
  const used = st.slugUsed
  if (used[base] == null) {
    used[base] = 1
    return base
  }
  used[base] += 1
  return base + '-' + used[base]
}

/* ---------- URL 协议白名单 ---------- */

const BAD_SCHEMES = [
  'javascript',
  'vbscript',
  'livescript',
  'jscript',
  'data',
  'file',
  'blob',
  'about',
  'view-source',
  'chrome',
  'resource',
]
const OK_SCHEMES = ['http', 'https', 'mailto', 'tel', 'ftp']

/** 按浏览器解析属性的视角解码一次，只用于安全嗅探，不作为输出 */
function decodeForProbe(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]{1,6});/gi, function (m, h) {
      return safeCodePoint(parseInt(h, 16))
    })
    .replace(/&#(\d{1,7});/g, function (m, d) {
      return safeCodePoint(Number(d))
    })
    .replace(/&amp;/g, '&')
}
function safeCodePoint(c) {
  try {
    return c > 0 && c < 0x10ffff ? String.fromCodePoint(c) : ''
  } catch (e) {
    return ''
  }
}

/**
 * @returns {string|null} 可放行的地址（仍是转义后的形态，可直接进属性）；null 表示已拦截
 */
function checkUrl(raw, st, kind, allowImageData) {
  const decoded = decodeForProbe(raw)
  // URL scheme 探测前先剥掉控制字符：防止 java\u0000script: 这类绕过，剥离本身就是安全目的
  // eslint-disable-next-line no-control-regex
  const probe = decoded.replace(/[\u0000-\u0020\u007f-\u00a0]/g, '').toLowerCase()
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(probe)
  if (scheme) {
    const name = scheme[1]
    if (allowImageData && name === 'data' && /^data:image\/(png|jpe?g|gif|webp);base64,/.test(probe)) return attrSafe(raw)
    if (BAD_SCHEMES.indexOf(name) > -1) {
      warn(st, '已拦截' + kind + '链接的「' + name + ':」协议，不会产生可点击链接：' + clip(decoded, 36))
      return null
    }
    if (OK_SCHEMES.indexOf(name) === -1) {
      warn(st, '已忽略' + kind + '链接的可疑协议「' + name + ':」：' + clip(decoded, 36))
      return null
    }
    return attrSafe(raw)
  }
  // 没有协议头 => 相对路径 / #锚点 / //host，放行
  if (/^[\w\-./#?%&=+~]*$/.test(decoded)) return attrSafe(raw)
  warn(st, '已忽略格式异常的' + kind + '链接地址：' + clip(decoded, 36))
  return null
}

/* ---------- 块级正则 ---------- */

const RE_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\n]*)$/
const RE_ATX = /^ {0,3}(#{1,6})(?:[ \t]+([^\n]*?))?[ \t]*$/
const RE_HR = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/
const RE_QUOTE = /^ {0,3}>[ \t]?(.*)$/
const RE_UL = /^(\s{0,12})([-*+])[ \t]+(.*)$/
const RE_OL = /^(\s{0,12})(\d{1,9})([.)])[ \t]+(.*)$/
const RE_TASK = /^\[([ xX✓☑])\][ \t]*(.*)$/
const RE_DELIM = /^ {0,3}\|?[ \t]*:?-{1,}:?[ \t]*(\|[ \t]*:?-{1,}:?[ \t]*)*\|?$/
const RE_ESC = /\\([\\`*_[\]()#+\-.!<>|"~'])/g

/* ============================================================
 * 1. 块级词法：行数组 -> token 树
 * ============================================================ */

function isListItem(line) {
  return RE_UL.test(line) || RE_OL.test(line)
}
function startsBlock(line) {
  return RE_FENCE.test(line) || RE_ATX.test(line) || RE_HR.test(line) || RE_QUOTE.test(line) || isListItem(line)
}
function leadingSpaces(s) {
  let n = 0
  while (n < s.length && s.charAt(n) === ' ') n++
  return n
}

/** 按竖线切单元格，尊重 `\|` 转义 */
function splitRow(line) {
  let s = String(line).trim()
  if (s.charAt(0) === '|') s = s.slice(1)
  if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1)
  const cells = []
  let buf = ''
  for (let k = 0; k < s.length; k++) {
    const c = s.charAt(k)
    if (c === '\\' && s.charAt(k + 1) === '|') {
      buf += '\\|'
      k++
      continue
    }
    if (c === '|') {
      cells.push(buf.trim())
      buf = ''
      continue
    }
    buf += c
  }
  cells.push(buf.trim())
  return cells
}

function isTableStart(lines, i) {
  const head = lines[i]
  const delim = lines[i + 1]
  if (head == null || delim == null) return false
  if (head.indexOf('|') === -1) return false
  return RE_DELIM.test(delim)
}

function tokenize(lines) {
  const toks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i++
      continue
    }
    let m

    // 围栏代码块：内容原样保留，语言标注留在 info string
    if ((m = RE_FENCE.exec(line))) {
      const ch = m[1].charAt(0)
      const lang = String(m[2] || '').trim().split(/\s+/)[0] || ''
      const body = []
      const at = i + 1
      i++
      while (i < lines.length) {
        const cl = RE_FENCE.exec(lines[i])
        if (cl && cl[1].charAt(0) === ch && !String(cl[2] || '').trim()) {
          i++
          break
        }
        body.push(lines[i])
        i++
      }
      toks.push({ t: 'code', lang: lang, raw: body.join('\n'), line: at })
      continue
    }

    // ATX 标题
    if ((m = RE_ATX.exec(line))) {
      const raw = String(m[2] || '')
        .replace(/[ \t]+#+[ \t]*$/, '')
        .trim()
      toks.push({ t: 'heading', level: m[1].length, raw: raw, line: i + 1 })
      i++
      continue
    }

    // 分隔线
    if (RE_HR.test(line)) {
      toks.push({ t: 'hr', line: i + 1 })
      i++
      continue
    }

    // 块引用：整段降一级后递归，所以 >>> 天然是嵌套引用
    if (RE_QUOTE.test(line)) {
      const at = i + 1
      const inner = []
      while (i < lines.length) {
        const q = RE_QUOTE.exec(lines[i])
        if (q) {
          inner.push(q[1])
          i++
          continue
        }
        if (lines[i].trim() !== '' && !startsBlock(lines[i]) && inner.length) {
          inner.push(lines[i])
          i++
          continue
        }
        break
      }
      toks.push({ t: 'quote', children: tokenize(inner), line: at })
      continue
    }

    // 列表：先拍平成 {indent, ordered, text}，再按缩进嵌套
    if (isListItem(line)) {
      const at = i + 1
      const flat = []
      while (i < lines.length) {
        const cur = lines[i]
        if (cur.trim() === '') {
          let j = i
          while (j < lines.length && lines[j].trim() === '') j++
          if (j < lines.length && isListItem(lines[j])) {
            i = j
            continue
          }
          break
        }
        const mu = RE_UL.exec(cur)
        const mo = RE_OL.exec(cur)
        if (mu) {
          flat.push({ indent: leadingSpaces(mu[1]), ordered: false, marker: mu[2], num: null, text: mu[3], line: i + 1 })
          i++
          continue
        }
        if (mo) {
          flat.push({ indent: leadingSpaces(mo[1]), ordered: true, marker: mo[3], num: Number(mo[2]), text: mo[4], line: i + 1 })
          i++
          continue
        }
        if (flat.length && /^\s{2,}\S/.test(cur)) {
          flat[flat.length - 1].text += '\n' + cur.replace(/^ {1,4}/, '')
          i++
          continue
        }
        break
      }
      toks.push({ t: 'list', lists: nestItems(flat), line: at })
      continue
    }

    // 表格
    if (isTableStart(lines, i)) {
      const at = i + 1
      const head = splitRow(lines[i])
      const aligns = splitRow(lines[i + 1]).map(function (c) {
        const s = c.replace(/\s/g, '')
        const l = s.charAt(0) === ':'
        const r = s.charAt(s.length - 1) === ':'
        return l && r ? 'center' : r ? 'right' : l ? 'left' : ''
      })
      i += 2
      const rows = []
      while (i < lines.length && lines[i].trim() !== '' && lines[i].indexOf('|') > -1 && !startsBlock(lines[i])) {
        const cells = splitRow(lines[i])
        const row = []
        for (let c = 0; c < head.length; c++) row.push(cells[c] == null ? '' : cells[c])
        rows.push(row)
        i++
      }
      toks.push({ t: 'table', head: head, aligns: aligns, rows: rows, line: at })
      continue
    }

    // 段落
    const at = i + 1
    const buf = [line]
    i++
    while (i < lines.length) {
      const cur = lines[i]
      if (cur.trim() === '' || startsBlock(cur) || isTableStart(lines, i)) break
      buf.push(cur)
      i++
    }
    toks.push({ t: 'para', raw: buf.join('\n'), line: at })
  }
  return toks
}

function nestItems(flat) {
  if (!flat.length) return []
  function build(pos, indent) {
    const lists = []
    let p = pos
    while (p < flat.length && flat[p].indent >= indent) {
      const cur = flat[p]
      if (cur.indent > indent) {
        const last = lists[lists.length - 1]
        const lastItem = last && last.items[last.items.length - 1]
        if (!lastItem) {
          p++
          continue
        }
        const r = build(p, cur.indent)
        if (!lastItem.subs) lastItem.subs = []
        for (let k = 0; k < r.lists.length; k++) lastItem.subs.push(r.lists[k])
        p = r.next
        continue
      }
      const prev = lists[lists.length - 1]
      // 只看有序/无序，不看具体符号：+ / * / - 混用仍属同一个列表
      let list
      if (prev && prev.ordered === cur.ordered) list = prev
      else {
        list = { ordered: cur.ordered, marker: cur.marker, start: cur.num, items: [] }
        lists.push(list)
      }
      let text = cur.text
      let task = null
      if (!cur.ordered) {
        const tk = RE_TASK.exec(text.trim())
        if (tk) {
          task = tk[1] === 'x' || tk[1] === 'X' || tk[1] === '☑' || tk[1] === '✓'
          text = tk[2]
        }
      }
      list.items.push({ text: text, task: task, line: cur.line, subs: [] })
      p++
    }
    return { lists: lists, next: p }
  }
  return build(0, flat[0].indent).lists
}

/* ============================================================
 * 2. 行法级：转义 -> 链接 -> 强调
 * ============================================================ */

/** 剥离 HTML 注释；未闭合的注释吞到结尾，宁可不显示也不放行 */
export function stripComments(s) {
  return String(s).replace(/<!--[\s\S]*?(?:-->|$)/g, '')
}

function renderInline(src, st) {
  let s = stripComments(src).replace(/^\n+/, '').replace(/\n+$/, '')

  // 1) 行内代码先藏起来：内部只做转义，不再做任何解析
  s = s.replace(/(`+)([\s\S]*?)\1/g, function (m, ticks, body) {
    let code = body
    if (code.length > 2 && code.charAt(0) === ' ' && code.charAt(code.length - 1) === ' ') code = code.slice(1, -1)
    return stash(st, '<code class="pk-md__in-code">' + escapeHtml(code) + '</code>')
  })

  // 2) 其余整体转义 —— 这一步是 XSS 的命门
  s = escapeHtml(s)

  // 3) 反斜杠转义（此时 * 与 _ 只是普通字符，先按字面量藏好）
  s = s.replace(RE_ESC, function (m, c) {
    return stash(st, escapeHtml(c))
  })

  // 4) 硬换行：行尾两个空格 或 行尾反斜杠
  s = s.replace(/(?:[ \t]{2,}|\\)\n/g, TOK_BR)

  // 5) 图片（地址允许一层括号，否则会漏掉 javascript:alert(1) 这种写法）
  s = s.replace(/!\[([^\]]*)\]\(\s*((?:[^()\s]|\([^()\s]*\))*)(?:[ \t]+"([^"]*)")?\s*\)/g, function (m, alt, url, title) {
    const safe = checkUrl(url, st, '图片', true)
    if (safe === null) return stash(st, '<span class="pk-md__rej">' + (alt || '图片地址被拦截') + '</span>')
    let h = '<img class="pk-md__img" src="' + safe + '" alt="' + attrSafe(alt) + '"'
    if (title) h += ' title="' + attrSafe(title) + '"'
    return stash(st, h + ' />')
  })

  // 6) 链接：首尾标签分别入栈，中间文字留给强调规则继续处理
  s = s.replace(/\[([^\]]*)\]\(\s*((?:[^()\s]|\([^()\s]*\))*)(?:[ \t]+"([^"]*)")?\s*\)/g, function (m, label, url, title) {
    const safe = checkUrl(url, st, '', false)
    const text = label || safe || clip(url, 60)
    if (safe === null) return '<span class="pk-md__rej">' + text + '</span>'
    let open = '<a class="pk-md__a" href="' + safe + '"'
    if (title) open += ' title="' + attrSafe(title) + '"'
    return stash(st, open + '>') + text + stash(st, '</a>')
  })

  // 7) 自动链接（尖括号此时已是实体）
  s = s.replace(/&lt;((?:https?|ftp):\/\/[^\s]+?)&gt;/g, function (m, url) {
    const safe = checkUrl(url, st, '', false)
    if (safe === null) return url
    return stash(st, '<a class="pk-md__a" href="' + safe + '">') + url + stash(st, '</a>')
  })
  s = s.replace(/&lt;([^\s@&<>"']{1,64}@[^\s@&<>"'.]{1,180}\.[^\s@&<>"']{2,24})&gt;/g, function (m, mail) {
    return stash(st, '<a class="pk-md__a" href="mailto:' + escapeAttr(mail) + '">') + mail + stash(st, '</a>')
  })

  // 8) 裸链接
  s = s.replace(/(^|[\s(（【[])(https?:\/\/[^\s<>"'）)，。；]+)/g, function (m, pre, url) {
    let pure = url
    let after = ''
    if (/[.,;:!?)\]]$/.test(pure)) {
      after = pure.charAt(pure.length - 1)
      pure = pure.slice(0, -1)
    }
    const safe = checkUrl(pure, st, '', false)
    if (safe === null) return pre + pure + after
    return pre + stash(st, '<a class="pk-md__a" href="' + safe + '">') + pure + stash(st, '</a>') + after
  })

  // 9) 删除线 / 粗体 / 斜体
  s = s.replace(/~~([^~]+?)~~/g, function (m, t) {
    return '<del class="pk-md__del">' + t + '</del>'
  })
  s = s.replace(/\*\*([^\s*][^*]*?)\*\*/g, function (m, t) {
    return '<strong class="pk-md__strong">' + t + '</strong>'
  })
  s = s.replace(/(^|[^\w\\])__([^_\s][^_]*?)__(?!\w)/g, function (m, p, t) {
    return p + '<strong class="pk-md__strong">' + t + '</strong>'
  })
  s = s.replace(/\*([^*\n]+?)\*/g, function (m, t) {
    return '<em class="pk-md__em">' + t + '</em>'
  })
  s = s.replace(/(^|[^\w\\])_([^_\n]+?)_(?!\w)/g, function (m, p, t) {
    return p + '<em class="pk-md__em">' + t + '</em>'
  })

  return s
}

/** 行内 -> 纯文本（大纲标题与 slug 用） */
function inlineToText(src) {
  let s = stripComments(src)
  s = s.replace(/(`+)([\s\S]*?)\1/g, '$2')
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  s = s.replace(/\[([^\]]*)\]\(([^)\s]*)\)/g, '$1')
  s = s.replace(/<((?:https?|ftp):\/\/[^>\s]+)>/g, '$1')
  s = s.replace(/[*_~]/g, '')
  s = s.replace(RE_ESC, '$1')
  return s.replace(/\s+/g, ' ').trim()
}

/* ============================================================
 * 3. token 树 -> HTML
 * ============================================================ */

const ALIGN_CLS = { '': '', left: ' pk-md__al--l', center: ' pk-md__al--c', right: ' pk-md__al--r' }

function renderToken(tok, st) {
  switch (tok.t) {
    case 'heading': {
      const id = nextSlug(st, inlineToText(tok.raw))
      return (
        '<h' + tok.level + ' id="' + escapeAttr(id) + '" class="pk-md__h pk-md__h--' + tok.level + '">' +
        renderInline(tok.raw, st) +
        '</h' + tok.level + '>'
      )
    }
    case 'para': {
      // 整段只有一个 HTML 注释时不要留空 <p>
      if (!stripComments(tok.raw).trim()) return ''
      return '<p class="pk-md__p">' + renderInline(tok.raw, st) + '</p>'
    }
    case 'code': {
      const lang = String(tok.lang || '').replace(/[^\w+#.-]/g, '').slice(0, 24)
      let h = '<pre class="pk-md__pre"><span class="pk-md__lang">' + (lang ? escapeHtml(lang) : '纯文本') + '</span>'
      h += '<code class="pk-md__code' + (lang ? ' language-' + escapeAttr(lang) : '') + '"'
      h += lang ? ' data-lang="' + escapeAttr(lang) + '"' : ''
      return h + '>' + escapeHtml(tok.raw) + '</code></pre>'
    }
    case 'hr':
      return '<hr class="pk-md__hr" />'
    case 'quote':
      return '<blockquote class="pk-md__quote">' + renderTokens(tok.children, st) + '</blockquote>'
    case 'list':
      return renderLists(tok.lists, st)
    case 'table': {
      let h = '<div class="pk-md__scroll"><table class="pk-md__table"><thead><tr>'
      for (let c = 0; c < tok.head.length; c++) {
        h += '<th class="pk-md__th' + (ALIGN_CLS[tok.aligns[c]] || '') + '">' + renderInline(tok.head[c], st) + '</th>'
      }
      h += '</tr></thead><tbody>'
      for (let r = 0; r < tok.rows.length; r++) {
        h += '<tr>'
        for (let c = 0; c < tok.head.length; c++) {
          h += '<td class="pk-md__td' + (ALIGN_CLS[tok.aligns[c]] || '') + '">' + renderInline(tok.rows[r][c], st) + '</td>'
        }
        h += '</tr>'
      }
      return h + '</tbody></table></div>'
    }
    default:
      return ''
  }
}
function renderTokens(toks, st) {
  let out = ''
  for (let i = 0; i < toks.length; i++) out += renderToken(toks[i], st)
  return out
}
function renderLists(lists, st) {
  let out = ''
  for (let i = 0; i < lists.length; i++) {
    const list = lists[i]
    const tag = list.ordered ? 'ol' : 'ul'
    const startAttr = list.ordered && list.start && list.start !== 1 ? ' start="' + list.start + '"' : ''
    let h = '<' + tag + ' class="pk-md__list"' + startAttr + '>'
    for (let k = 0; k < list.items.length; k++) {
      const it = list.items[k]
      h += '<li class="pk-md__li">'
      if (it.task !== null) {
        h += '<span class="pk-md__task' + (it.task ? ' pk-md__task--on' : '') + '">' + (it.task ? '☑' : '☐') + '</span>'
      }
      h += renderInline(it.text, st)
      if (it.subs && it.subs.length) h += renderLists(it.subs, st)
      h += '</li>'
    }
    out += h + '</' + tag + '>'
  }
  return out
}

/* ============================================================
 * 4. 对外：mdToHtml
 * ============================================================ */

/**
 * Markdown -> HTML。
 * 产物已完成 HTML 转义与链接协议白名单，视图层 v-html 的安全前提就在这里。
 * @param {string} src
 * @returns {{html: string, warnings: string[]}}
 */
export function mdToHtml(src) {
  const st = createContext()
  let text = normalizeSrc(src)
  if (text.length > MD_MAX) {
    warn(st, '内容超过 ' + MD_MAX + ' 字上限，只渲染前 ' + MD_MAX + ' 字（实际 ' + text.length + ' 字）')
    text = text.slice(0, MD_MAX)
  }
  const toks = tokenize(text.split('\n'))
  return { html: resolveTokens(renderTokens(toks, st), st), warnings: st.warnings }
}

/* ============================================================
 * 5. 对外：outline
 * ============================================================ */

/** 标题大纲树：[{level, text, line, slug, children}] */
export function outline(src) {
  const st = createContext()
  let text = normalizeSrc(src)
  if (text.length > MD_MAX) text = text.slice(0, MD_MAX)
  const roots = []
  const stack = []
  walkHeadings(tokenize(text.split('\n')), function (h) {
    const plain = inlineToText(h.raw)
    const node = { level: h.level, text: plain, line: h.line, slug: nextSlug(st, plain), children: [] }
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop()
    if (stack.length) stack[stack.length - 1].children.push(node)
    else roots.push(node)
    stack.push(node)
  })
  return roots
}

function walkHeadings(toks, cb) {
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    if (t.t === 'heading') cb(t)
    else if (t.t === 'quote') walkHeadings(t.children, cb)
    // 代码块里的 # 不是标题：token 阶段就已经归给 code 了
  }
}

/* ============================================================
 * 6. 对外：stats
 * ============================================================ */

/**
 * 渲染结果体量：HTML 字节数、元素数、各级标题数量等
 * @param {string} src Markdown 原文
 * @param {string} [html] 已渲染好的 HTML，省一次重复渲染
 */
export function stats(src, html) {
  const body = html != null ? String(html) : mdToHtml(src).html
  const tags = Object.create(null)
  let elements = 0
  body.replace(/<([a-zA-Z][a-zA-Z0-9-]*)/g, function (m, name) {
    elements++
    const k = name.toLowerCase()
    tags[k] = (tags[k] || 0) + 1
    return ''
  })
  const headings = {}
  let headingTotal = 0
  for (let lv = 1; lv <= 6; lv++) {
    headings['h' + lv] = tags['h' + lv] || 0
    headingTotal += headings['h' + lv]
  }
  const srcText = normalizeSrc(src)
  return {
    bytes: utf8Len(body),
    elements: elements,
    headings: headings,
    headingTotal: headingTotal,
    links: tags['a'] || 0,
    images: tags['img'] || 0,
    codeBlocks: tags['pre'] || 0,
    tables: tags['table'] || 0,
    listItems: tags['li'] || 0,
    quotes: tags['blockquote'] || 0,
    chars: srcText.length,
    lines: srcText ? srcText.split('\n').length : 0,
  }
}

/* ============================================================
 * 7. 对外：htmlToMd（基础反向转换）
 * ============================================================ */

const VOID_TAGS = ['br', 'hr', 'img', 'input', 'meta', 'link', 'source']
const BLOCK_TAGS = [
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'blockquote', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'section', 'article',
]
const DROP_TAGS = ['script', 'style', 'head', 'meta', 'link', 'title', 'svg', 'iframe', 'object', 'embed', 'noscript']

const HTML_TOKEN =
  /<!--[\s\S]*?(?:-->|$)|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)\s*(\/?)>|([^<]+)|[\s\S]/g

function decodeEntities(s) {
  return decodeForProbe(s)
}

/** 极简 HTML -> 节点树：未闭合标签自动收尾，未知标签当容器；
 *  script / style 这类"内容是原文"的标签整段跳过，避免把代码当文字吐出来 */
function parseHtmlTree(html) {
  const root = { type: 'root', children: [] }
  const stack = [root]
  const re = new RegExp(HTML_TOKEN.source, 'g')
  let dropUntil = null
  let m
  while ((m = re.exec(String(html)))) {
    if (dropUntil) {
      if (m[1] && m[1].toLowerCase() === dropUntil) dropUntil = null
      continue
    }
    if (m[5] != null) {
      stack[stack.length - 1].children.push({ type: 'text', text: m[5] })
      continue
    }
    if (m[0].charAt(0) !== '<') {
      stack[stack.length - 1].children.push({ type: 'text', text: m[0] })
      continue
    }
    if (/^<!--/.test(m[0])) continue
    if (m[1]) {
      const name = m[1].toLowerCase()
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag === name) {
          stack.length = k
          break
        }
      }
      continue
    }
    if (!m[2]) continue
    const tag = m[2].toLowerCase()
    const attrs = Object.create(null)
    const ar = /([\w:-]+)(?:[ \t]*=[ \t]*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
    let a
    const raw = m[3] || ''
    while ((a = ar.exec(raw))) {
      const val = a[2] != null ? a[2] : a[3] != null ? a[3] : a[4] != null ? a[4] : ''
      attrs[a[1].toLowerCase()] = decodeEntities(val)
    }
    if (DROP_TAGS.indexOf(tag) > -1) {
      if (m[4] !== '/' && VOID_TAGS.indexOf(tag) === -1) dropUntil = tag
      continue
    }
    const node = { type: 'el', tag: tag, attrs: attrs, children: [] }
    stack[stack.length - 1].children.push(node)
    if (m[4] === '/' || VOID_TAGS.indexOf(tag) > -1) continue
    stack.push(node)
  }
  return root
}

/** 行内部分 -> markdown 文本；块级子节点用 SEP 占位后再展开 */
function inlineMd(node) {
  if (node.type === 'text') return decodeEntities(node.text)
  const inner = containerInline(node)
  switch (node.tag) {
    case 'code':
      return '`' + inner.replace(/\s+/g, ' ').replace(/^ | $/g, '') + '`'
    case 'strong':
    case 'b':
      return '**' + inner.trim() + '**'
    case 'em':
    case 'i':
      return '*' + inner.trim() + '*'
    case 'del':
    case 's':
    case 'strike':
      return '~~' + inner.trim() + '~~'
    case 'a':
      return '[' + inner.trim() + '](' + (node.attrs.href == null ? '' : node.attrs.href) +
        (node.attrs.title ? ' "' + node.attrs.title + '"' : '') + ')'
    case 'img':
      return (
        '![' +
        (node.attrs.alt || '') +
        '](' +
        (node.attrs.src || '') +
        (node.attrs.title ? ' "' + node.attrs.title + '"' : '') +
        ')'
      )
    case 'br':
      // 反向要能重新解析出 <br />，得还原来两个空格表示硬换行
      return '  \n'
    case 'span': {
      const cls = String(node.attrs.class || '')
      if (cls.indexOf('pk-md__task') > -1) return inner.indexOf('☑') > -1 ? '[x] ' : '[ ] '
      if (cls.indexOf('pk-md__lang') > -1) return ''
      if (cls.indexOf('pk-md__rej') > -1) return inner
      return inner
    }
    default:
      return inner
  }
}

function containerInline(node) {
  let out = ''
  for (let i = 0; i < node.children.length; i++) {
    const c = node.children[i]
    if (c.type === 'text') out += decodeEntities(c.text)
    else if (BLOCK_TAGS.indexOf(c.tag) > -1) out += SEP + blockMd(c).text.replace(/\s+/g, ' ').trim() + SEP
    else out += inlineMd(c)
  }
  return out
}

function rawTextOf(node) {
  let out = ''
  for (let i = 0; i < node.children.length; i++) {
    const c = node.children[i]
    out += c.type === 'text' ? decodeEntities(c.text) : rawTextOf(c)
  }
  return out
}

function blockMd(node) {
  if (node.type === 'text') return { text: decodeEntities(node.text).trim(), block: true }
  switch (node.tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const marks = '######'.slice(0, Number(node.tag.charAt(1)))
      return { text: marks + ' ' + inlineMd(node).replace(/\n+/g, ' ').replace(SEP, '').trim(), block: true }
    }
    case 'p':
    case 'div':
    case 'section':
    case 'article':
      return { text: bodyOf(node), block: true }
    case 'hr':
      return { text: '---', block: true }
    case 'br':
      return { text: '', block: false }
    case 'blockquote': {
      const body = bodyOf(node)
      return {
        text: body
          .split('\n')
          .map(function (l) {
            return '> ' + l
          })
          .join('\n'),
        block: true,
      }
    }
    case 'pre': {
      const code = childEl(node, 'code')
      const target = code || node
      const lang = (target.attrs && (target.attrs['data-lang'] || infoLang(target.attrs))) || ''
      return { text: '```' + lang + '\n' + rawTextOf(target).replace(/\n$/, '') + '\n```', block: true }
    }
    case 'ul':
    case 'ol':
      return { text: listMd(node, node.tag === 'ol', Number(node.attrs.start || 1), 0), block: true }
    case 'table':
      return { text: tableMd(node), block: true }
    default:
      return { text: inlineMd(node).trim(), block: BLOCK_TAGS.indexOf(node.tag) > -1 }
  }
}

function infoLang(node) {
  const cls = String((node && node.attrs && node.attrs.class) || '')
  const m = /(?:^|\s)language-([\w+#.-]+)/.exec(cls)
  return m ? m[1] : ''
}

function childEl(node, tag) {
  for (let i = 0; i < node.children.length; i++) {
    if (node.children[i].type === 'el' && node.children[i].tag === tag) return node.children[i]
  }
  return null
}

/** 容器正文：把内联子节点攒成段落，块级子节点各自成段 */
function bodyOf(node) {
  const parts = []
  let buf = ''
  function flush() {
    const t = buf.replace(SEP, '').trim()
    if (t) parts.push(t)
    buf = ''
  }
  for (let i = 0; i < node.children.length; i++) {
    const c = node.children[i]
    if (c.type === 'text') {
      buf += decodeEntities(c.text)
      continue
    }
    if (BLOCK_TAGS.indexOf(c.tag) > -1) {
      flush()
      const r = blockMd(c)
      const t = String(r.text).trim()
      if (t) parts.push(t)
      continue
    }
    buf += inlineMd(c)
  }
  flush()
  return parts.join('\n\n')
}

function listMd(node, ordered, start, depth) {
  const pad = '  '.repeat(depth)
  const lines = []
  let n = start
  for (let i = 0; i < node.children.length; i++) {
    const li = node.children[i]
    if (li.type !== 'el' || li.tag !== 'li') continue
    const subs = []
    let text = ''
    for (let k = 0; k < li.children.length; k++) {
      const c = li.children[k]
      if (c.type === 'el' && (c.tag === 'ul' || c.tag === 'ol')) {
        subs.push(listMd(c, c.tag === 'ol', Number(c.attrs.start || 1), depth + 1))
        continue
      }
      text += c.type === 'text' ? decodeEntities(c.text) : inlineMd(c)
    }
    text = text.replace(SEP, '').replace(/^\s+/, '').replace(/\s+$/, '')
    const tk = /^\[( |x|X)\][ \t]+/.exec(text)
    if (tk) {
      text = (tk[1].toLowerCase() === 'x' ? '[x] ' : '[ ] ') + text.slice(tk[0].length)
    } else if (/[☐☑]/.test(text)) {
      const done = text.indexOf('☑') > -1
      text = (done ? '[x] ' : '[ ] ') + text.replace(/[☐☑][ \t]?/, '')
    }
    const marker = ordered ? n + '. ' : '- '
    n++
    lines.push(pad + marker + text.replace(/\n+/g, ' '))
    for (let s = 0; s < subs.length; s++) lines.push(subs[s])
  }
  return lines.join('\n')
}

function cellsOf(tr) {
  const out = []
  for (let i = 0; i < tr.children.length; i++) {
    const c = tr.children[i]
    if (c.type === 'el' && (c.tag === 'td' || c.tag === 'th')) out.push(c)
  }
  return out
}

function tableMd(node) {
  const rows = []
  const aligns = []
  const thead = childEl(node, 'thead')
  const groups = []
  if (thead) groups.push({ head: true, node: thead })
  const body = childEl(node, 'tbody')
  if (body) groups.push({ head: false, node: body })
  if (!groups.length) {
    for (let i = 0; i < node.children.length; i++) {
      if (node.children[i].type === 'el' && node.children[i].tag === 'tr') groups.push({ head: false, node: node.children[i] })
    }
  }
  for (let g = 0; g < groups.length; g++) {
    const grp = groups[g]
    for (let i = 0; i < grp.node.children.length; i++) {
      const tr = grp.node.children[i]
      if (tr.type !== 'el' || tr.tag !== 'tr') continue
      const cells = cellsOf(tr)
      const texts = []
      for (let c = 0; c < cells.length; c++) {
        let t = ''
        for (let k = 0; k < cells[c].children.length; k++) {
          const cc = cells[c].children[k]
          t += cc.type === 'text' ? decodeEntities(cc.text) : inlineMd(cc)
        }
        texts.push(t.replace(SEP, '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim())
        if (grp.head && !aligns[c]) {
          const cls = String(cells[c].attrs.class || '')
          aligns[c] = cls.indexOf('--c') > -1 ? ':---:' : cls.indexOf('--r') > -1 ? '---:' : cls.indexOf('--l') > -1 ? ':---' : '---'
        }
      }
      rows.push({ head: grp.head, cells: texts })
    }
  }
  if (!rows.length) return ''
  const cols = Math.max.apply(null, rows.map(function (r) { return r.cells.length }))
  for (let c = 0; c < cols; c++) if (!aligns[c]) aligns[c] = '---'
  const lines = []
  let sepDone = false
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].cells.slice()
    while (cells.length < cols) cells.push('')
    lines.push('| ' + cells.join(' | ') + ' |')
    if (rows[r].head) {
      lines.push('| ' + aligns.slice(0, cols).join(' | ') + ' |')
      sepDone = true
    }
  }
  if (!sepDone) lines.splice(1, 0, '| ' + aligns.slice(0, cols).join(' | ') + ' |')
  return lines.join('\n')
}

/**
 * HTML -> Markdown（基础反向转换：标题 / 粗斜删 / 列表与任务项 / 链接 / 图片 /
 * 行内码 / 围栏码 / 表格 / 引用 / 分隔线；script、style 一律丢弃）
 */
export function htmlToMd(html) {
  const root = parseHtmlTree(String(html == null ? '' : html).replace(/<!--[\s\S]*?(?:-->|$)/g, ''))
  const parts = []
  let buf = ''
  function flush() {
    const t = buf.replace(SEP, '').trim()
    if (t) parts.push(t)
    buf = ''
  }
  for (let i = 0; i < root.children.length; i++) {
    const c = root.children[i]
    if (c.type === 'text') {
      buf += decodeEntities(c.text)
      continue
    }
    if (BLOCK_TAGS.indexOf(c.tag) > -1) {
      flush()
      const t = String(blockMd(c).text).trim()
      if (t) parts.push(t)
      continue
    }
    buf += inlineMd(c)
  }
  flush()
  let md = parts.join('\n\n').replace(SEP, '')
  md = md.replace(/\n{3,}/g, '\n\n').trim()
  return md ? md + '\n' : ''
}

/* ============================================================
 * 8. 内置示例（第二组故意写了 <script> 与恶意协议，用来自证转义生效）
 * ============================================================ */

export const SAMPLES = [
  {
    key: 'doc',
    name: '文档示例',
    src: [
      '# 随身匣更新说明',
      '',
      '这次做了 **三件事**：速度 _更快_、体积 ~~更大~~ 更小、兼容 **新格式**。',
      '细节见 [发布页](https://example.com/release "打开发布页")。',
      '',
      '## 新增功能',
      '',
      '1. Markdown 预览',
      '2. 位运算台',
      '   - 支持 8 / 16 / 32 / 64 位',
      '   - 逐位网格可直接点击翻转',
      '     - 更深一层也接得上',
      '3. 老功能修了 bug',
      '',
      '## 待办',
      '',
      '- [x] 深色模式',
      '- [ ] 导出 PDF',
      '- [ ] 找同事复核',
      '',
      '> 提醒：升级前先备份。',
      '>',
      '> > 嵌套引用同样正常。',
      '',
      '## 对照表',
      '',
      '| 功能 | 状态 | 版本 |',
      '| :--- | :---: | ---: |',
      '| 预览 | 稳定 | 2.0 |',
      '| 导出 | 试验 | 0.5 |',
      '',
      '```js',
      'function hi(name) {',
      '  return 1 + 2 // 注释与 * 号都不会打断代码块',
      '}',
      '```',
      '',
      '---',
      '',
      '行尾两个空格会形成硬换行。  ',
      '这一行紧接在上面。',
    ].join('\n'),
  },
  {
    key: 'xss',
    name: '转义自证',
    src: [
      '# 这段专门用来试毒',
      '',
      '下面这行原文里就是 script 标签，它必须被当成文字显示出来：',
      '',
      '<script>alert(1)</script>',
      '',
      '<img src=x onerror=alert(2)>',
      '',
      '恶意链接会被拦：[点我领奖](javascript:alert(3))，',
      '还有 [这个](vbscript:msgbox(4)) 与 [那个](data:text/html;base64,PHNjcmlwdD4=)。',
      '',
      '正常链接不受影响：[回到首页](https://example.com/)、邮箱 [me@example.com](mailto:me@example.com)。',
      '',
      '> 引用里写的 <b>粗</b> 同样只是文字，不会真的变粗。',
      '',
      '```html',
      '<script>alert(5)</script> 在代码块里原样保留，方便阅读',
      '```',
    ].join('\n'),
  },
  {
    key: 'cn',
    name: '中文排版',
    src: [
      '## 中文标点与混排',
      '',
      '「引号」、《书名号》、——破折号、……省略号，都不影响解析；',
      '英文 like this 和数字 42 混排也正常。',
      '',
      '### 三种项目符号',
      '',
      '+ 加号可以用',
      '* 星号同样有效',
      '- 减号最常见',
      '',
      '### 需要转义的符号',
      '',
      '想显示字面量的星号就写 `\\*`，比如 2 \\* 3 = 6。',
      '',
      '外链写法：https://example.com/plain 会被自动识别。',
      '',
      '![示意图](https://example.com/a.png "图片标题")',
    ].join('\n'),
  },
]
