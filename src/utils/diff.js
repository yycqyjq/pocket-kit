/**
 * 文本差异对比（行级）
 * 先剥掉公共前后缀，再对中间部分做 LCS；规模过大时退化为整块替换，
 * 避免 DP 表把内存吃爆（手机上很容易）。
 */

const MAX_CELLS = 2000000 // DP 表格上限（约 2M 格）

/**
 * @returns {{ rows: Array, stats: object }}
 *   rows: [{ type:'same'|'del'|'add', text, aNo, bNo }]
 */
export function diffLines(aText, bText) {
  const a = String(aText).split(/\r\n|\r|\n/)
  const b = String(bText).split(/\r\n|\r|\n/)

  // 1. 公共前缀
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  // 2. 公共后缀
  let tail = 0
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++
  }

  const aMid = a.slice(head, a.length - tail)
  const bMid = b.slice(head, b.length - tail)

  const rows = []
  for (let i = 0; i < head; i++) rows.push({ type: 'same', text: a[i], aNo: i + 1, bNo: i + 1 })

  const mid = diffCore(aMid, bMid, head)
  for (const r of mid) rows.push(r)

  for (let i = 0; i < tail; i++) {
    const ai = a.length - tail + i
    const bi = b.length - tail + i
    rows.push({ type: 'same', text: a[ai], aNo: ai + 1, bNo: bi + 1 })
  }

  let same = 0
  let del = 0
  let add = 0
  for (const r of rows) {
    if (r.type === 'same') same++
    else if (r.type === 'del') del++
    else add++
  }
  const total = Math.max(a.length, b.length) || 1
  return {
    rows,
    stats: {
      aLines: a.length,
      bLines: b.length,
      same,
      del,
      add,
      similarity: Math.round((same / total) * 1000) / 10,
      truncated: aMid.length * bMid.length > MAX_CELLS,
    },
  }
}

function diffCore(a, b, offset) {
  const out = []
  if (!a.length && !b.length) return out

  // 规模过大：直接整块替换，不做精细比对
  if (a.length * b.length > MAX_CELLS) {
    a.forEach((t, i) => out.push({ type: 'del', text: t, aNo: offset + i + 1, bNo: null }))
    b.forEach((t, i) => out.push({ type: 'add', text: t, aNo: null, bNo: offset + i + 1 }))
    return out
  }

  const n = a.length
  const m = b.length
  // LCS 长度表，用一维滚动数组无法回溯，这里直接开二维（已限制规模）
  const dp = new Array(n + 1)
  for (let i = 0; i <= n; i++) dp[i] = new Int32Array(m + 1)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  let i = 0
  let j = 0
  const tmp = []
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      tmp.push({ type: 'same', text: a[i], aNo: offset + i + 1, bNo: offset + j + 1 })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      tmp.push({ type: 'del', text: a[i], aNo: offset + i + 1, bNo: null })
      i++
    } else {
      tmp.push({ type: 'add', text: b[j], aNo: null, bNo: offset + j + 1 })
      j++
    }
  }
  while (i < n) {
    tmp.push({ type: 'del', text: a[i], aNo: offset + i + 1, bNo: null })
    i++
  }
  while (j < m) {
    tmp.push({ type: 'add', text: b[j], aNo: null, bNo: offset + j + 1 })
    j++
  }

  // 合并相邻的 del → add，输出成一组「改动」
  return tmp
}

/** 字符级差异，用于同一行内的精确高亮 */
export function diffChars(aStr, bStr) {
  const a = [...String(aStr)]
  const b = [...String(bStr)]
  const n = a.length
  const m = b.length
  if (n * m > 40000) {
    return [
      { type: 'del', text: aStr },
      { type: 'add', text: bStr },
    ]
  }
  const dp = new Array(n + 1)
  for (let i = 0; i <= n; i++) dp[i] = new Int32Array(m + 1)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push(out, 'same', a[i])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push(out, 'del', a[i])
      i++
    } else {
      push(out, 'add', b[j])
      j++
    }
  }
  while (i < n) push(out, 'del', a[i++])
  while (j < m) push(out, 'add', b[j++])
  return out
}

function push(arr, type, ch) {
  const last = arr[arr.length - 1]
  if (last && last.type === type) last.text += ch
  else arr.push({ type, text: ch })
}

/** 把差异结果导出成带 +/- 前缀的纯文本，便于复制 */
export function toUnified(rows) {
  return rows
    .map((r) => {
      if (r.type === 'same') return '  ' + r.text
      if (r.type === 'del') return '- ' + r.text
      return '+ ' + r.text
    })
    .join('\n')
}
