/**
 * 屏幕测试的计算层：色图序列、灰阶递进、触摸覆盖率与盲点定位。
 *
 * 坏点和触摸盲区没法靠软件「测」出来——软件只能把该显示的东西摆到屏幕上，
 * 判读的仍然是人的眼睛。所以这里负责的是把这张考卷出好：
 *   颜色顺序怎么排最容不容易看出偏色、灰阶几级才算得上「渐变带有没有断」、
 *   手指画过的格子怎么折算成覆盖率、哪几个格子始终没被碰到。
 * 这些换算必须能在 Node 里算死，视图只负责把结果铺满屏。
 */

/* ------------------------------------------------------------------ *
 *  纯色与灰阶
 * ------------------------------------------------------------------ */

/**
 * 纯色轮播顺序。先三个单色（各自的子像素坏掉最直观），再白（暗点）、黑（亮点与漏光），
 * 最后回到中性灰收尾——从黑直接看灰，最容易看出低灰阶的偏色。
 */
export const SOLID_ORDER = [
  { key: 'red', name: '纯红', rgb: [255, 0, 0], why: '看红色子像素：整屏该是饱和的红，若有黑点／异色点即坏点' },
  { key: 'green', name: '纯绿', rgb: [0, 255, 0], why: '绿色子像素最密，坏点也最常出现在这一路' },
  { key: 'blue', name: '纯蓝', rgb: [0, 0, 255], why: '蓝色子像素最暗，亮点在蓝底上最好认' },
  { key: 'white', name: '纯白', rgb: [255, 255, 255], why: '看暗点：白底上任何黑点都是不动的子像素' },
  { key: 'black', name: '纯黑', rgb: [0, 0, 0], why: '看亮点与漏光：黑底上不该有任何自发光的点，四边也不该有明显亮边' },
  { key: 'gray', name: '中灰', rgb: [128, 128, 128], why: '中性灰最容易看出整体偏色（偏黄／偏绿）' },
]

export function rgbText(rgb) {
  const c = rgb.map((v) => Math.min(255, Math.max(0, Math.round(Number(v) || 0))))
  return 'rgb(' + c[0] + ', ' + c[1] + ', ' + c[2] + ')'
}

export function hexText(rgb) {
  const c = rgb.map((v) => Math.min(255, Math.max(0, Math.round(Number(v) || 0))))
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
}

/**
 * 灰阶递进：steps 级，从最暗到最亮均匀分布。
 * 屏幕伽马不是 1，所以这里给的是 0~255 的线性值——线性等差在屏上会前密后疏，
 * 这正是用来验「低灰阶有没有糊成一片」的目的所在。
 */
export function grayRamp(steps) {
  const n = Math.round(Number(steps))
  if (!isFinite(n) || n < 2) throw new Error('灰阶梯度至少要 2 级')
  if (n > 64) throw new Error('一级一个色块，超过 64 级屏幕上摆不下也看不分')
  const out = []
  for (let i = 0; i < n; i++) out.push(Math.round((i * 255) / (n - 1)))
  return out
}

/** 灰阶条的展示文案 */
export function grayLabel(v) {
  return v + ' / 255'
}

/** 感知亮度 0~1：Rec.601 加权，人眼对绿最敏感、对蓝最迟钝 */
export function luma(rgb) {
  const c = (rgb || []).map((v) => Math.min(255, Math.max(0, Number(v) || 0)))
  return (0.299 * (c[0] || 0) + 0.587 * (c[1] || 0) + 0.114 * (c[2] || 0)) / 255
}

/** 底色偏亮就用深字，偏暗就用白字——浮层文字在纯黑和纯白屏上都得看得见 */
export function inkOn(rgb) {
  return luma(rgb) > 0.5 ? '#1A1A1A' : '#FFFFFF'
}

/** 逻辑像素 × 缩放比 = 物理像素；字段缺失时不给结论 */
export function physSize(w, h, ratio) {
  const a = Number(w)
  const b = Number(h)
  const r = Number(ratio)
  if (!isFinite(a) || !isFinite(b) || !isFinite(r) || a <= 0 || b <= 0 || r <= 0) return ''
  return Math.round(a * r) + '×' + Math.round(b * r)
}

/** 低灰阶是否糊在一起：相邻两级的差小于 1 就说明步长不够分（8bit 屏常见） */
export function rampDistinct(ramp) {
  const xs = ramp || []
  const set = new Set(xs)
  return { levels: set.size, merged: xs.length - set.size }
}

/* ------------------------------------------------------------------ *
 *  几何图：网格、斜线、色彩渐变
 * ------------------------------------------------------------------ */

export const GEOMETRY_TESTS = [
  { key: 'grid', name: '方格网格', why: '看直线是否弯曲、横竖是否等宽——透视与疏栅效应会在这里暴露' },
  { key: 'diag', name: '斜线组', why: '45° 与近垂直方向各来一组，看阶梯锯齿与子像素排布' },
  { key: 'stripe', name: '细密条纹', why: '条纹周期接近像素栅格时会摩尔纹，正常现象；固定一处发虚才是问题' },
  { key: 'gradient', name: '横向色彩渐变', why: '看色带是否断裂（banding），尤其红→绿与蓝→黄两段' },
]

/** 网格线间距（px）：短边的 1/8 到 1/12 之间最耐看，越界一律夹回 */
export function gridSpacing(w, h) {
  const a = Number(w)
  const b = Number(h)
  if (!isFinite(a) || !isFinite(b) || a <= 0 || b <= 0) return 48
  const short = Math.min(a, b)
  return Math.round(Math.min(96, Math.max(24, short / 10)))
}

/** 斜线条数：按短边每 26px 一条，限制在 4~24 条 */
export function stripeCount(w, h) {
  const a = Number(w)
  const b = Number(h)
  if (!isFinite(a) || !isFinite(b) || a <= 0 || b <= 0) return 12
  return Math.round(Math.min(24, Math.max(4, Math.min(a, b) / 26)))
}

/**
 * 几何考卷的背景样式。线条必须是精确的 1px 黑，所以这一组色值同样不接主题变量：
 * 深色模式一改，「直线弯不弯」就没法判了。
 */
export function geomStyle(key, w, h) {
  const W = Number(w)
  const H = Number(h)
  const ww = isFinite(W) && W > 0 ? W : 360
  const hh = isFinite(H) && H > 0 ? H : 780
  const sp = gridSpacing(ww, hh)
  if (key === 'grid') {
    const line = 'repeating-linear-gradient(%DIR%, #000000 0, #000000 1px, transparent 1px, transparent ' + sp + 'px)'
    return {
      backgroundColor: '#FFFFFF',
      backgroundImage: line.replace('%DIR%', '0deg') + ', ' + line.replace('%DIR%', '90deg'),
    }
  }
  if (key === 'diag') {
    const d = Math.round(sp * 1.4)
    const one = (deg) => 'repeating-linear-gradient(' + deg + ', #000000 0, #000000 1px, transparent 1px, transparent ' + d + 'px)'
    return { backgroundColor: '#FFFFFF', backgroundImage: one('45deg') + ', ' + one('135deg') }
  }
  if (key === 'stripe') {
    const pw = Math.max(2, Math.round(ww / (2 * stripeCount(ww, hh))))
    return {
      backgroundColor: '#FFFFFF',
      backgroundImage:
        'repeating-linear-gradient(90deg, #000000 0, #000000 ' + pw + 'px, #FFFFFF ' + pw + 'px, #FFFFFF ' + pw * 2 + 'px)',
    }
  }
  if (key === 'gradient') {
    return {
      backgroundImage:
        'linear-gradient(90deg, #FF0000, #FFFF00, #00FF00, #00FFFF, #0000FF, #FF00FF, #FF0000)',
    }
  }
  return {}
}

/** 灰阶条：每一级给出精确底色、该用的字色和读数 */
export function grayRows(steps) {
  return grayRamp(steps).map((v) => ({
    v,
    bg: rgbText([v, v, v]),
    fg: inkOn([v, v, v]),
    label: grayLabel(v),
  }))
}

/* ------------------------------------------------------------------ *
 *  触摸：网格覆盖与盲点
 * ------------------------------------------------------------------ */

/** 默认网格：竖 4 × 横 3，够定位「左上角那一片不跟手」又不会碎到没意义 */
export const TOUCH_COLS = 3
export const TOUCH_ROWS = 4

/**
 * 点集合 → 每格被碰到的次数。
 * 坐标用逻辑像素（uni 的 touch 事件 clientX/clientY），宽高是同一单位。
 */
export function cellHits(points, w, h, cols, rows) {
  const C = cols || TOUCH_COLS
  const R = rows || TOUCH_ROWS
  const W = Number(w)
  const H = Number(h)
  const grid = []
  for (let r = 0; r < R; r++) grid.push(new Array(C).fill(0))
  if (!isFinite(W) || !isFinite(H) || W <= 0 || H <= 0) return { grid, cols: C, rows: R, total: 0 }
  let total = 0
  for (const p of points || []) {
    // 注意：Number(null) 是 0，缺坐标的点会被当成按在了左上角，必须先挡掉
    if (!p || p.x == null || p.y == null) continue
    const x = Number(p.x)
    const y = Number(p.y)
    if (!isFinite(x) || !isFinite(y) || x < 0 || y < 0 || x >= W || y >= H) continue
    const c = Math.min(C - 1, Math.floor((x / W) * C))
    const r = Math.min(R - 1, Math.floor((y / H) * R))
    grid[r][c]++
    total++
  }
  return { grid, cols: C, rows: R, total }
}

/** 覆盖统计：命中格数、百分比、盲点格（用「第几行第几列」说人话） */
export function coverageOf(hit) {
  const grid = (hit && hit.grid) || []
  let touched = 0
  let cells = 0
  const missed = []
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      cells++
      if (grid[r][c] > 0) touched++
      else missed.push({ r: r + 1, c: c + 1 })
    }
  }
  const pct = cells ? Math.round((touched / cells) * 1000) / 10 : 0
  const drew = ((hit && hit.total) || 0) > 0
  return {
    cells,
    touched,
    missed,
    pct,
    verdict:
      cells === 0 || !drew
        ? '还没画'
        : pct >= 95
          ? '全屏跟手，没有明显盲区'
          : pct >= 80
            ? '基本跟手，边角有 ' + (cells - touched) + ' 格没碰到（多半是没够到，不一定是屏的问题）'
            : '有 ' + (cells - touched) + ' 格完全没反应，重点怀疑那几块区域',
  }
}

/** 触点数的最大值：一手能按几个点，用于验多点触控 */
export function maxPointers(counts) {
  let m = 0
  for (const v of counts || []) {
    const n = Number(v)
    if (isFinite(n) && n > m) m = n
  }
  return m
}

/** 触控引导步骤：页面上按步走，走完再看统计 */
export const TOUCH_STEPS = [
  '一根手指从左上角开始，把每一格都抹一遍（四角和边缘不要放过）',
  '五指同按，看下面的「最多同时」是否到 5',
  '两根手指在屏幕上画圈，检查跟随是否连续、有没有跳点',
  '沿四边慢慢划一圈，边框触控最容易先失效',
]

/** 触摸格配色：0 次是盲区（暗红），有次数随热度递增。考卷上的颜色必须是精确值，所以不走主题变量 */
export function cellStyle(n, max) {
  const v = Number(n) || 0
  if (v <= 0) return { bg: 'rgba(196, 60, 60, 0.30)', fg: '#F2C7C7', hot: false }
  const m = Math.max(1, Number(max) || 1)
  const t = Math.min(1, v / m)
  const alpha = 0.16 + 0.62 * Math.sqrt(t)
  return { bg: 'rgba(96, 206, 120, ' + (Math.round(alpha * 100) / 100).toFixed(2) + ')', fg: '#0F1A10', hot: true }
}

/** 每格被碰次数的极差：某些格被碰几百次、某些格 0 次，就是跟随性差异 */
export function hitSpread(hit) {
  const grid = (hit && hit.grid) || []
  let lo = null
  let hi = null
  for (const row of grid) {
    for (const v of row) {
      if (lo === null || v < lo) lo = v
      if (hi === null || v > hi) hi = v
    }
  }
  if (lo === null) return { lo: 0, hi: 0, spread: 0 }
  return { lo, hi, spread: hi - lo }
}

/* ------------------------------------------------------------------ *
 *  屏幕几何说明
 * ------------------------------------------------------------------ */

/** 长宽比的常见叫法，给人一个参照 */
export function ratioName(w, h) {
  const a = Number(w)
  const b = Number(h)
  if (!isFinite(a) || !isFinite(b) || a <= 0 || b <= 0) return ''
  const r = Math.max(a, b) / Math.min(a, b)
  const known = [
    [16 / 9, '16:9'],
    [18 / 9, '18:9（2:1）'],
    [19 / 9, '19:9'],
    [19.5 / 9, '19.5:9'],
    [20 / 9, '20:9'],
    [21 / 9, '21:9'],
    [4 / 3, '4:3'],
    [3 / 2, '3:2'],
  ]
  let best = known[0]
  for (const k of known) if (Math.abs(r - k[0]) < Math.abs(r - best[0])) best = k
  return Math.round(r * 100) / 100 + '（' + (Math.abs(r - best[0]) / best[0] < 0.02 ? '接近 ' + best[1] : '不属常见标准比例') + '）'
}

/** 全屏图形的渲染口径：等比铺满后仍可能被系统栏遮一条，所以提示按物理分辨率看 */
export const SCREEN_NOTES = [
  { t: '为什么必须看实物', d: '软件能做的只是把纯色、灰阶和网格铺满屏幕；坏点、亮线、漏光、偏色只有人眼能判。这里所有结论都要你盯着屏看，工具不替你判。' },
  { t: '颜色是怎么算的', d: '色值由本页现算成 rgb()，不引用外部图片，所以不会出现「图本身有毛病」的误判；灰阶条是 0~255 线性等差，前密后疏是屏幕伽马造成的，不是画错。' },
  { t: '全屏被遮了一条', d: '安卓的刘海、状态栏与导航栏会盖住一小块，H5 预览里更明显。这里的纯色图按整屏铺，判读时忽略系统栏那一条即可。' },
  { t: '触摸盲区的判法', d: '把屏幕划成 3×4 共 12 格，每格统计被碰到的次数。某格始终为 0 才可疑；边角够不到属于正常，可以换只手握持再画一次确认。' },
  { t: '摩尔纹不是坏点', d: '细密条纹那一屏，用手机拍照会看到彩虹状波纹，这是像素栅格与相机感光阵列干涉的正常现象，肉眼平视没有就不用担心。' },
]
