/**
 * 文本表格对齐
 * 把 CSV / TSV / 任意分隔符的文本转成等宽对齐的表格，方便贴进聊天、注释、文档
 */

function displayWidth(str) {
  // 中日韩全角字符占 2 列
  let w = 0
  for (const ch of String(str)) {
    const cp = ch.codePointAt(0)
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x20000 && cp <= 0x3fffd)
    w += wide ? 2 : 1
  }
  return w
}

function padTo(str, width, align) {
  const cur = displayWidth(str)
  const need = Math.max(0, width - cur)
  if (align === 'right') return ' '.repeat(need) + str
  if (align === 'center') {
    const l = Math.floor(need / 2)
    return ' '.repeat(l) + str + ' '.repeat(need - l)
  }
  return str + ' '.repeat(need)
}

/** 猜分隔符 */
export function guessDelimiter(text) {
  const line = String(text).split(/\r?\n/).find((l) => l.trim() !== '') || ''
  if (line.indexOf('\t') > -1) return '\t'
  const cands = [',', ';', '|']
  let best = ','
  let bestN = -1
  for (const d of cands) {
    const n = line.split(d).length
    if (n > bestN) {
      bestN = n
      best = d
    }
  }
  return bestN > 1 ? best : /\s{2,}/.test(line) ? null : ' '
}

/** 按分隔符切分（支持引号包裹） */
function splitRow(line, delim) {
  if (delim === null || delim === undefined) return line.trim().split(/\s{2,}/)
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQ = false
      } else cur += c
    } else if (c === '"') {
      inQ = true
    } else if (c === delim) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

/**
 * @param {string} text 源文本
 * @param {object} opt { delimiter, align: 'left'|'right'|'auto', border: boolean, header: boolean, maxWidth }
 */
export function alignTable(text, opt) {
  const o = Object.assign({ delimiter: null, align: 'auto', border: false, header: true, maxWidth: 40 }, opt || {})
  const raw = String(text || '').replace(/\r\n/g, '\n').trim()
  if (!raw) throw new Error('请粘贴要排版的内容')

  const delim = o.delimiter === null || o.delimiter === undefined ? guessDelimiter(raw) : o.delimiter
  const rows = raw
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => splitRow(l, delim))

  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0)
  if (colCount === 0) throw new Error('没解析出任何列')

  // 补齐每行列数
  rows.forEach((r) => {
    while (r.length < colCount) r.push('')
  })

  // 每列宽度（取该列最大显示宽度，并尊重 maxWidth）
  const widths = []
  for (let c = 0; c < colCount; c++) {
    let w = 0
    for (const r of rows) w = Math.max(w, displayWidth(r[c]))
    widths.push(Math.min(w, o.maxWidth))
  }

  // 对齐方式：auto 时数字列右对齐
  const aligns = []
  for (let c = 0; c < colCount; c++) {
    if (o.align !== 'auto') {
      aligns.push(o.align)
      continue
    }
    const start = o.header ? 1 : 0
    const vals = rows.slice(start).map((r) => r[c]).filter((v) => v !== '')
    const numeric = vals.length > 0 && vals.every((v) => /^[-+]?[\d,]+(\.\d+)?%?$/.test(v))
    aligns.push(numeric ? 'right' : 'left')
  }

  const cut = (s, w) => {
    if (displayWidth(s) <= w) return s
    let out = ''
    let cur = 0
    for (const ch of s) {
      const cw = displayWidth(ch)
      if (cur + cw > w - 1) break
      out += ch
      cur += cw
    }
    return out + '…'
  }

  const renderRow = (r) => r.map((v, i) => padTo(cut(v, widths[i]), widths[i], aligns[i]))

  const lines = []
  const sep = '  '
  if (o.border) {
    const bar = (l, m, rr) => l + widths.map((w) => '─'.repeat(w + 2)).join(m) + rr
    lines.push(bar('┌', '┬', '┐'))
    rows.forEach((r, i) => {
      lines.push('│ ' + renderRow(r).join(' │ ') + ' │')
      if (i === 0 && o.header && rows.length > 1) lines.push(bar('├', '┼', '┤'))
    })
    lines.push(bar('└', '┴', '┘'))
  } else {
    rows.forEach((r, i) => {
      lines.push(renderRow(r).join(sep).replace(/\s+$/, ''))
      if (i === 0 && o.header && rows.length > 1) {
        lines.push(widths.map((w) => '-'.repeat(Math.max(1, w))).join(sep))
      }
    })
  }

  return {
    text: lines.join('\n'),
    rows: rows.length,
    cols: colCount,
    widths,
    aligns,
    // 解析后的二维数组（已补齐到列数）。toMarkdownTable 需要它，
    // 否则得把切分逻辑再抄一遍。
    data: rows,
    delimiter: delim === '\t' ? '制表符' : delim === null ? '连续空格' : delim,
  }
}

/**
 * 生成 Markdown 表格（GFM 的 | 语法，可直接贴进 .md）
 * 与 alignTable 的区别：
 *  - 不做等宽填充（Markdown 渲染器自己排版，填充反而是噪声）
 *  - 不截断超宽单元格（截断在等宽场景是「避免撑爆」，在 Markdown 里就是真的丢数据）
 *  - 转义单元格里的 | 与换行
 *  - 用分隔行表达列对齐，而不是靠空格
 */
export function toMarkdownTable(text, opt) {
  const o = Object.assign({ delimiter: null, align: 'auto', header: true }, opt || {})
  const r = alignTable(text, {
    delimiter: o.delimiter,
    align: o.align,
    header: o.header,
    maxWidth: Infinity,
  })

  const cell = (v) => String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim()
  const rowLine = (row) => '| ' + row.map(cell).join(' | ') + ' |'
  // 分隔行决定该列对齐：--- 左、---: 右、:---: 居中
  const sepLine = '| ' + r.aligns.map((a) => (a === 'right' ? '---:' : a === 'center' ? ':---:' : '---')).join(' | ') + ' |'

  const out = []
  if (o.header) {
    out.push(rowLine(r.data[0]))
    out.push(sepLine)
    for (let i = 1; i < r.data.length; i++) out.push(rowLine(r.data[i]))
  } else {
    // Markdown 表格必须有表头行。没勾「首行是表头」时用空表头占位，数据全部当正文。
    out.push('| ' + r.aligns.map(() => ' ').join(' | ') + ' |')
    out.push(sepLine)
    r.data.forEach((row) => out.push(rowLine(row)))
  }
  return out.join('\n')
}

export const SAMPLE_TABLE =
  'name,role,stars,desc\n随身匣,工具盒,128,离线可用的小工具集合\nit-tools,开发者工具箱,40645,功能最全的在线工具站\nDevToys,开发者瑞士军刀,32016,Windows 上的原生工具\nCyberChef,网络瑞士军刀,35891,编解码与数据分析'
