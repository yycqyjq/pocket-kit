/**
 * 描述统计
 * ------------------------------------------------------------
 * 纯函数层：只吃数字数组 / 文本，不碰 uni、不碰 DOM。
 *
 * 口径约定（都写死在这里，视图只负责展示）：
 *   · 分位数：线性插值法（R-7），与 Excel PERCENTILE.INC、numpy 默认一致
 *   · 方差：同时给「总体」（除以 n）和「样本」（除以 n - 1）两种口径
 *   · 异常值：Tukey 箱线图围栏，Q1 - 1.5×IQR / Q3 + 1.5×IQR；3×IQR 为极端异常值
 *   · 回归：普通最小二乘（OLS），R² 为 Pearson 相关系数的平方
 * 统计为数学计算结果，不构成任何专业（医学 / 金融 / 工程）建议。
 */

/** 单次最多接受的数据点，防止 `1x99999999` 之类的写法把内存吃满 */
export const MAX_POINTS = 5000
/** 重复记法 `AxN` 中 N 的上限 */
export const MAX_REPEAT = 2000

const NUM_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/
const REP_RE = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)[x*×](\d+)$/i

/** 数字格式化：去掉多余的 0，保留有效位 */
export function fmtNum(n, digits) {
  if (n === null || n === undefined || !isFinite(n)) return '—'
  const d = digits === undefined ? 4 : digits
  const abs = Math.abs(n)
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-7)) return n.toExponential(4)
  let s = n.toFixed(Math.max(0, Math.min(12, d)))
  if (s.indexOf('.') > -1) s = s.replace(/0+$/, '').replace(/\.$/, '')
  return s
}

/**
 * 解析「一列数字」。
 * 支持的分隔符：换行、空格、制表符、逗号、分号、顿号、全角逗号、竖线。
 * 支持千分位（1,234,567 会被当成一个数）。
 * 支持重复记法 `3x7`（= 3 出现 7 次）、`-1.5*4`。
 * @returns {{values:number[], skipped:string[], repeats:number, truncated:boolean, notice:string}}
 */
export function parseNumbers(text, opt) {
  const limit = (opt && opt.limit) || MAX_POINTS
  const raw = String(text === null || text === undefined ? '' : text)
  const values = []
  const skipped = []
  let repeats = 0
  let truncated = false
  let notice = ''

  // 先把数字内部的千分位逗号吃掉，再把全角分隔符统一成半角空格
  const norm = raw
    .replace(/(\d)[,，](?=\d{3}(?:\D|$))/g, '$1')
    .replace(/[×]/g, 'x')
    .replace(/[，、；;|｜]/g, ' ')
  const tokens = norm.split(/[\s,]+/).filter(Boolean)

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (values.length >= limit) {
      truncated = true
      continue
    }
    const rep = REP_RE.exec(t)
    if (rep) {
      const v = Number(rep[1])
      const cnt = Number(rep[2])
      if (!isFinite(v) || !isFinite(cnt)) {
        if (skipped.length < 30) skipped.push(t)
        continue
      }
      if (cnt > MAX_REPEAT) {
        notice = '重复记法的次数上限 ' + MAX_REPEAT + '，已忽略 ' + t
        continue
      }
      for (let k = 0; k < cnt && values.length < limit; k++) values.push(v)
      repeats += cnt
      continue
    }
    if (NUM_RE.test(t)) {
      const v = Number(t)
      if (isFinite(v)) values.push(v)
      else if (skipped.length < 30) skipped.push(t)
    } else if (skipped.length < 30) {
      skipped.push(t)
    }
  }
  if (truncated && !notice) notice = '数据点超过 ' + limit + ' 个，只保留了前面的部分'
  return { values, skipped, repeats, truncated, notice, tokenCount: tokens.length }
}

/** 分位数（R-7 线性插值），p ∈ [0,1]，要求传已排序数组 */
export function quantileSorted(sorted, p) {
  const n = sorted.length
  if (!n) return NaN
  if (n === 1) return sorted[0]
  const h = (n - 1) * Math.min(1, Math.max(0, p))
  const lo = Math.floor(h)
  const hi = Math.min(lo + 1, n - 1)
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo])
}

export function quantile(values, p) {
  const s = toSorted(values)
  return quantileSorted(s, p)
}

function toSorted(values) {
  return cleanValues(values).sort((a, b) => a - b)
}

/** 过滤出可用数字（null / 空串 / NaN 一律丢掉，Number(null)===0 这种坑要避开） */
export function cleanValues(values) {
  const arr = Array.isArray(values) ? values : String(values).split(/[\s,]+/)
  const out = []
  for (let i = 0; i < arr.length; i++) {
    const raw = arr[i]
    if (raw === null || raw === undefined || raw === '' || (typeof raw === 'string' && !raw.trim())) continue
    const v = typeof raw === 'number' ? raw : Number(raw)
    if (isFinite(v)) out.push(v)
  }
  return out
}

/** 众数：可能多个，并列时全部列出 */
export function modeOf(values) {
  const vals = cleanValues(values)
  if (!vals.length) return { values: [], count: 0, none: true, note: '没有数据' }
  const map = {}
  let best = 0
  for (let i = 0; i < vals.length; i++) {
    // 用 12 位有效数字归并，避免 0.1+0.2 这类浮点尾巴把众数打散
    const k = String(Number(vals[i].toPrecision(12)))
    map[k] = (map[k] || 0) + 1
    if (map[k] > best) best = map[k]
  }
  const list = []
  Object.keys(map).forEach((k) => {
    if (map[k] === best) list.push(Number(k))
  })
  list.sort((a, b) => a - b)
  return {
    values: list,
    count: best,
    none: false,
    multi: list.length > 1,
    // 每个数都只出现一次时，统计学上认为「没有众数」
    uniform: best === 1,
  }
}

/**
 * 一站式描述统计。
 * @returns 空输入时返回 { n: 0, empty: true }，不抛错，方便视图直接渲染
 */
export function describe(values) {
  const vals = cleanValues(values)
  const n = vals.length
  if (!n) return { n: 0, empty: true }

  const sorted = vals.slice().sort((a, b) => a - b)
  let sum = 0
  for (let i = 0; i < n; i++) sum += vals[i]
  const mean = sum / n

  let s2 = 0
  let madRaw = 0
  for (let i = 0; i < n; i++) {
    const d = vals[i] - mean
    s2 += d * d
  }
  const variancePop = s2 / n
  const varianceSample = n > 1 ? s2 / (n - 1) : NaN
  const stdevPop = Math.sqrt(variancePop)
  const stdevSample = n > 1 ? Math.sqrt(varianceSample) : NaN

  const median = quantileSorted(sorted, 0.5)
  const q1 = quantileSorted(sorted, 0.25)
  const q3 = quantileSorted(sorted, 0.75)
  const iqr = q3 - q1
  const loFence = q1 - 1.5 * iqr
  const hiFence = q3 + 1.5 * iqr
  const loExtreme = q1 - 3 * iqr
  const hiExtreme = q3 + 3 * iqr

  const outliers = []
  for (let i = 0; i < n; i++) {
    const v = vals[i]
    if (v < loFence || v > hiFence) {
      outliers.push({
        value: v,
        side: v < loFence ? 'low' : 'high',
        extreme: v < loExtreme || v > hiExtreme,
        distance: v < loFence ? loFence - v : v - hiFence,
      })
    }
  }
  outliers.sort((a, b) => Math.abs(b.value - mean) - Math.abs(a.value - mean))

  // 均值绝对偏差（对中位数，比标准差更抗异常值）
  for (let i = 0; i < n; i++) madRaw += Math.abs(vals[i] - median)
  const mad = madRaw / n

  const allPositive = sorted[0] > 0
  let geometricMean = NaN
  let harmonicMean = NaN
  let gmNote = ''
  if (allPositive) {
    let lg = 0
    let rh = 0
    for (let i = 0; i < n; i++) {
      lg += Math.log(vals[i])
      rh += 1 / vals[i]
    }
    geometricMean = Math.exp(lg / n)
    harmonicMean = n / rh
  } else {
    gmNote = '存在非正数（最小值 ' + fmtNum(sorted[0]) + '），几何平均与调和平均无定义'
  }

  const min = sorted[0]
  const max = sorted[n - 1]
  const mode = modeOf(vals)

  return {
    empty: false,
    n,
    sorted,
    min,
    max,
    range: max - min,
    sum,
    mean,
    median,
    mode,
    midrange: (min + max) / 2,
    trimmedMean10: trimmedMean(sorted, 0.1),
    trimmedMean25: trimmedMean(sorted, 0.25),
    variancePop,
    varianceSample,
    stdevPop,
    stdevSample,
    cv: mean !== 0 ? stdevSample / mean : NaN,
    sem: n > 1 ? stdevSample / Math.sqrt(n) : NaN,
    mad,
    q1,
    q2: median,
    q3,
    iqr,
    lowerFence: loFence,
    upperFence: hiFence,
    lowerExtremeFence: loExtreme,
    upperExtremeFence: hiExtreme,
    outliers,
    outlierCount: outliers.length,
    geometricMean,
    harmonicMean,
    gmNote,
    skewness: skewness(vals, mean, stdevPop, n),
    notice: '',
  }
}

function trimmedMean(sorted, trim) {
  const n = sorted.length
  if (n < 3) return NaN
  const k = Math.floor(n * trim)
  if (n - 2 * k < 1) return NaN
  let s = 0
  for (let i = k; i < n - k; i++) s += sorted[i]
  return s / (n - 2 * k)
}

function skewness(vals, mean, sd, n) {
  if (n < 3 || !(sd > 0)) return NaN
  let s = 0
  for (let i = 0; i < n; i++) {
    const z = (vals[i] - mean) / sd
    s += z * z * z
  }
  return s / n
}

/** 四分位数摘要，视图做箱线图 / 五数概括用 */
export function fiveNumber(values) {
  const s = toSorted(values)
  return {
    min: s[0],
    q1: quantileSorted(s, 0.25),
    median: quantileSorted(s, 0.5),
    q3: quantileSorted(s, 0.75),
    max: s[s.length - 1],
    n: s.length,
  }
}

/**
 * 分组频数表（离散值口径）：每个不同取值一行。
 * @param {number[]} values
 * @param {object} [opt] `{ top }` 只保留前 top 组
 */
export function freqTable(values, opt) {
  const vals = cleanValues(values)
  const n = vals.length
  if (!n) return { rows: [], n: 0, max: 0 }
  const map = {}
  for (let i = 0; i < n; i++) {
    const k = String(Number(vals[i].toPrecision(12)))
    map[k] = (map[k] || 0) + 1
  }
  let rows = Object.keys(map)
    .map((k) => ({ value: Number(k), count: map[k] }))
    .sort((a, b) => a.value - b.value)
  const total = n
  const limit = (opt && opt.top) || rows.length
  let cum = 0
  let truncatedBy = 0
  if (rows.length > limit) {
    truncatedBy = rows.length - limit
    rows = rows.slice(0, limit)
  }
  const out = rows.map((r) => {
    cum += r.count
    return {
      value: r.value,
      count: r.count,
      freq: r.count / total,
      percent: (r.count / total) * 100,
      cumCount: cum,
      cumPercent: (cum / total) * 100,
    }
  })
  return {
    rows: out,
    n: total,
    max: out.reduce((m, r) => (r.count > m ? r.count : m), 0),
    distinct: Object.keys(map).length,
    truncatedBy,
  }
}

/** 建议组数：Sturges 公式，并夹在 3~20 之间 */
export function suggestBins(values) {
  const n = cleanValues(values).length
  if (n < 2) return 0
  return Math.min(20, Math.max(3, Math.ceil(Math.log2(n) + 1)))
}

/**
 * 等宽分组直方图。
 * @param {number[]} values
 * @param {number} [binCount] 省略则用 Sturges 建议值
 */
export function histogram(values, binCount) {
  const vals = cleanValues(values)
  const n = vals.length
  if (n < 2) return { bins: [], n, binWidth: 0, method: '' }
  const sorted = vals.slice().sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[n - 1]
  let k = Math.round(Number(binCount))
  const auto = !isFinite(k) || k < 1
  if (auto) k = suggestBins(vals)
  k = Math.min(40, Math.max(1, k))

  if (min === max) {
    return {
      bins: [{ index: 1, lower: min, upper: max, count: n, freq: 1, percent: 100, label: fmtNum(min) }],
      n,
      binWidth: 0,
      max: n,
      method: '全部数值相同，只有一组',
      auto,
      binCount: 1,
    }
  }
  const width = (max - min) / k
  const bins = []
  for (let i = 0; i < k; i++) {
    bins.push({
      index: i + 1,
      lower: min + i * width,
      upper: min + (i + 1) * width,
      count: 0,
    })
  }
  for (let i = 0; i < n; i++) {
    let idx = Math.floor((vals[i] - min) / width)
    if (idx >= k) idx = k - 1 // 最大值落在最后一组（闭区间）
    if (idx < 0) idx = 0
    bins[idx].count++
  }
  let cum = 0
  bins.forEach((b) => {
    cum += b.count
    b.freq = b.count / n
    b.percent = (b.count / n) * 100
    b.cumPercent = (cum / n) * 100
    b.density = b.count / (n * width)
    b.label = fmtNum(b.lower, 3) + ' ~ ' + fmtNum(b.upper, 3)
    if (b === bins[bins.length - 1]) b.label += '（含端点）'
  })
  return {
    bins,
    n,
    binWidth: width,
    max: bins.reduce((m, b) => (b.count > m ? b.count : m), 0),
    method: auto ? '组数按 Sturges 公式 ⌈log₂n⌉+1 自动给' : '组数手填',
    auto,
    binCount: k,
  }
}

/**
 * 解析「值 + 权重」两列文本：每行 `值,权重`，也支持空格 / 制表符分隔。
 * @returns {{pairs:Array<{value:number, weight:number}>, skipped:string[], badWeight:boolean}}
 */
export function parsePairs(text) {
  const raw = String(text === null || text === undefined ? '' : text)
  const lines = raw.split(/\r?\n/)
  const pairs = []
  const skipped = []
  let badWeight = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const parts = line.split(/[\s,;，、\t]+/).filter(Boolean)
    if (parts.length < 2) {
      // 只有一个数时按权重 1 处理，方便和「单列模式」共用输入框
      if (NUM_RE.test(parts[0])) pairs.push({ value: Number(parts[0]), weight: 1 })
      else if (skipped.length < 20) skipped.push(line)
      continue
    }
    if (!NUM_RE.test(parts[0]) || !NUM_RE.test(parts[1])) {
      if (skipped.length < 20) skipped.push(line)
      continue
    }
    const v = Number(parts[0])
    const w = Number(parts[1])
    if (w < 0) badWeight = true
    pairs.push({ value: v, weight: w })
  }
  return { pairs, skipped, badWeight }
}

/**
 * 加权平均。权重和为 0 时抛错（无法定义）。
 */
export function weightedMean(pairs) {
  const list = Array.isArray(pairs) ? pairs : []
  if (!list.length) throw new Error('没有可用的「值 + 权重」数据')
  let sw = 0
  let sv = 0
  for (let i = 0; i < list.length; i++) {
    const v = Number(list[i].value)
    const w = Number(list[i].weight)
    if (!isFinite(v) || !isFinite(w)) continue
    sw += w
    sv += v * w
  }
  if (sw === 0) throw new Error('权重之和为 0，加权平均无定义')
  return { value: sv / sw, weightSum: sw, count: list.length }
}

/** 加权方差的两种口径：按权重平方 / 按权重本身 */
export function weightedVariance(pairs, unbiased) {
  const m = weightedMean(pairs)
  let s = 0
  let vw = 0
  let v1 = 0
  for (let i = 0; i < pairs.length; i++) {
    const v = Number(pairs[i].value)
    const w = Number(pairs[i].weight)
    if (!isFinite(v) || !isFinite(w)) continue
    const d = v - m.value
    s += w * d * d
    vw += w * w
    v1 += w
  }
  if (v1 === 0) return NaN
  const raw = s / v1
  if (!unbiased) return raw
  const denom = v1 * v1 - vw
  if (denom <= 0) return NaN
  return (s * v1) / denom
}

/** 解析两列 x/y 用于回归；复用 parsePairs，权重列即 y */
export function parseXY(text) {
  const r = parsePairs(text)
  return {
    points: r.pairs.map((p) => ({ x: p.value, y: p.weight })),
    skipped: r.skipped,
  }
}

/**
 * 最小二乘线性回归 y = a + b·x
 * @returns {{n, slope, intercept, r, r2, equation, meanX, meanY, sse, sst, ssr,
 *            residualStdError, seSlope, seIntercept, tSlope, worst, residuals,
 *            predict:function, note}}
 */
export function linearFit(xs, ys) {
  const X = cleanValues(xs)
  const Y = cleanValues(ys)
  const n = Math.min(X.length, Y.length)
  if (n < 2) throw new Error('至少需要 2 组 (x, y) 数据')
  let sx = 0
  let sy = 0
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sx += X[i]
    sy += Y[i]
    sxx += X[i] * X[i]
    syy += Y[i] * Y[i]
    sxy += X[i] * Y[i]
  }
  const dx = n * sxx - sx * sx
  if (dx === 0) throw new Error('所有 x 都相同，拟合不出斜率')
  const dy = n * syy - sy * sy
  const slope = (n * sxy - sx * sy) / dx
  const intercept = (sy - slope * sx) / n
  const r = dy === 0 ? NaN : (n * sxy - sx * sy) / Math.sqrt(dx * dy)
  const r2 = isFinite(r) ? r * r : NaN

  // 残差与标准误
  let sse = 0
  const residuals = []
  let maxY = ''
  let maxAbs = -1
  for (let i = 0; i < n; i++) {
    const fit = intercept + slope * X[i]
    const e = Y[i] - fit
    sse += e * e
    residuals.push({ x: X[i], y: Y[i], fit, residual: e })
    if (Math.abs(e) > maxAbs) {
      maxAbs = Math.abs(e)
      maxY = fmtNum(X[i], 4)
    }
  }
  const meanX = sx / n
  const sxxc = sxx - (sx * sx) / n
  const seSlope = n > 2 ? Math.sqrt(sse / (n - 2) / sxxc) : NaN
  const seIntercept = n > 2 ? Math.sqrt((sse / (n - 2)) * (1 / n + (meanX * meanX) / sxxc)) : NaN
  const sres = n > 2 ? Math.sqrt(sse / (n - 2)) : NaN
  const sst = syy - (sy * sy) / n

  return {
    n,
    slope,
    intercept,
    r,
    r2,
    equation: 'y = ' + fmtNum(intercept, 4) + (slope < 0 ? ' − ' : ' + ') + fmtNum(Math.abs(slope), 4) + 'x',
    meanX,
    meanY: sy / n,
    sse,
    sst,
    ssr: sst - sse,
    residualStdError: sres,
    seSlope,
    seIntercept,
    tSlope: isFinite(seSlope) && seSlope !== 0 ? slope / seSlope : NaN,
    worst: maxY,
    residuals,
    predict: function (x) {
      const v = Number(x)
      if (!isFinite(v)) return NaN
      return intercept + slope * v
    },
    note:
      n < 5
        ? '只有 ' + n + ' 组数据，回归结果非常不稳定'
        : r2 > 0 && r2 < 0.3
          ? 'R² 偏低，直线模型解释力有限'
          : '',
  }
}

/** Pearson 相关系数（单独给一个入口，视图里常要用） */
export function pearson(xs, ys) {
  const f = linearFit(xs, ys)
  return { r: f.r, r2: f.r2, n: f.n }
}

/**
 * 把统计结果拼成一段可复制的纯文本。
 * @param {object} st describe() 的返回值
 */
export function summaryText(st) {
  if (!st || st.empty) return '（没有数据）'
  const L = []
  L.push('样本量 n = ' + st.n)
  L.push('总和 = ' + fmtNum(st.sum, 6))
  L.push('均值 = ' + fmtNum(st.mean, 6))
  L.push('中位数 = ' + fmtNum(st.median, 6))
  L.push(
    '众数 = ' +
      (st.mode.uniform ? '无（每个值只出现一次）' : st.mode.values.map((v) => fmtNum(v, 6)).join('、') + '（各 ' + st.mode.count + ' 次）')
  )
  L.push('最小 / 最大 = ' + fmtNum(st.min, 6) + ' / ' + fmtNum(st.max, 6) + '，极差 = ' + fmtNum(st.range, 6))
  L.push('方差(总体) = ' + fmtNum(st.variancePop, 6) + '，方差(样本) = ' + fmtNum(st.varianceSample, 6))
  L.push('标准差(总体) = ' + fmtNum(st.stdevPop, 6) + '，标准差(样本) = ' + fmtNum(st.stdevSample, 6))
  L.push('四分位 Q1/Q2/Q3 = ' + fmtNum(st.q1, 6) + ' / ' + fmtNum(st.q2, 6) + ' / ' + fmtNum(st.q3, 6) + '，IQR = ' + fmtNum(st.iqr, 6))
  L.push('几何平均 = ' + fmtNum(st.geometricMean, 6) + '，调和平均 = ' + fmtNum(st.harmonicMean, 6))
  if (st.outlierCount) {
    L.push('异常值（1.5×IQR 之外）共 ' + st.outlierCount + ' 个：' + st.outliers.map((o) => fmtNum(o.value, 6)).join('、'))
  } else {
    L.push('异常值：无')
  }
  return L.join('\n')
}
