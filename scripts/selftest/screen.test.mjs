/**
 * screen.js 自查断言（直接测 src/utils/screen.js 本体）
 * ------------------------------------------------------------
 * 屏幕本身没法自测（坏点要人眼看），但这里所有换算是纯数学，判据都是独立可手算的：
 *   1) 灰阶：5 级必须是 [0,64,128,191,255]（255×3/4 四舍五入），首尾锁死在 0 与 255，且严格不减；
 *   2) 网格归属：点落进哪一格用「坐标 ÷ 边长取整」另算一遍对照；
 *   3) 覆盖率：手工铺满 → 100%，故意空一格 → 精确掉到那格的百分比；
 *   4) 色值：#ff0000 这类公认写法，以及越界必须夹到 0~255。
 * 视图里测不到的只有「铺满屏幕的那一层到底有没有盖住系统栏」。
 */
import { useUtils } from './harness.mjs'

const SC = await useUtils('screen')

let ok = 0
let fail = 0
function is(a, b, m) {
  if (a === b) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b))
  }
}
function throws(fn, m) {
  try {
    fn()
    fail++
    console.log('FAIL ' + m + ': 没抛错')
  } catch (e) {
    const msg = (e && e.message) || String(e)
    if (!/[一-龥]/.test(msg)) {
      fail++
      console.log('FAIL ' + m + ': 报错不是中文 → ' + msg)
    } else ok++
  }
}

/* ---------- 0. 导出面 ---------- */
{
  const want = [
    'SOLID_ORDER', 'rgbText', 'hexText', 'grayRamp', 'grayLabel', 'rampDistinct',
    'GEOMETRY_TESTS', 'gridSpacing', 'stripeCount', 'TOUCH_COLS', 'TOUCH_ROWS',
    'cellHits', 'coverageOf', 'maxPointers', 'TOUCH_STEPS', 'hitSpread', 'ratioName', 'SCREEN_NOTES',
    'luma', 'inkOn', 'physSize', 'geomStyle', 'grayRows', 'cellStyle',
  ]
  for (const k of want) is(typeof SC[k] !== 'undefined', true, '导出 ' + k)
}

/* ---------- 1. 色值 ---------- */
{
  is(SC.rgbText([255, 0, 0]), 'rgb(255, 0, 0)', '红色 rgb 写法')
  is(SC.hexText([255, 0, 0]), '#ff0000', '红色 hex 写法')
  is(SC.hexText([0, 255, 0]), '#00ff00', '绿色 hex 写法')
  is(SC.hexText([0, 0, 255]), '#0000ff', '蓝色 hex 写法')
  is(SC.hexText([255, 255, 255]), '#ffffff', '白')
  is(SC.hexText([0, 0, 0]), '#000000', '黑')
  is(SC.hexText([128, 128, 128]), '#808080', '中灰是 80 不是 7f')
  is(SC.hexText([1, 2, 3]), '#010203', '个位数补零')
  is(SC.hexText([300, -5, 12.6]), '#ff000d', '越界夹住、小数取整')
  is(SC.rgbText(['x', null, undefined]), 'rgb(0, 0, 0)', '脏输入不抛，按 0 处理')
  // 六个纯色：色值与名字必须对得上，顺序不能随意（红绿蓝→白黑灰）
  is(SC.SOLID_ORDER.length, 6, '六张纯色图')
  is(SC.SOLID_ORDER.map((s) => s.key).join(','), 'red,green,blue,white,black,gray', '纯色顺序：先单色再白黑灰')
  is(SC.hexText(SC.SOLID_ORDER[0].rgb), '#ff0000', '第一张是纯红')
  is(SC.hexText(SC.SOLID_ORDER[3].rgb), '#ffffff', '白在单色之后')
  is(SC.hexText(SC.SOLID_ORDER[4].rgb), '#000000', '黑紧跟白，方便对比暗点／亮点')
  for (const s of SC.SOLID_ORDER) {
    is(s.rgb.length, 3, s.key + ' 是三元组')
    is(s.rgb.every((v) => v >= 0 && v <= 255), true, s.key + ' 分量在值域内')
    is(s.name.length > 1, true, s.key + ' 有中文名')
    is(s.why.length > 8, true, s.key + ' 说明这一屏要盯什么')
  }
}

/* ---------- 2. 灰阶 ---------- */
{
  is(SC.grayRamp(5).join(','), '0,64,128,191,255', '五级灰阶：255×3/4=191.25，四舍五入到 191')
  is(SC.grayRamp(2).join(','), '0,255', '两级就是黑白')
  const r16 = SC.grayRamp(16)
  is(r16.length, 16, '16 级长度')
  is(r16[0], 0, '首级最暗')
  is(r16[15], 255, '末级最亮')
  for (let i = 1; i < r16.length; i++) is(r16[i] > r16[i - 1], true, '严格递增：第 ' + i + ' 级')
  is(SC.rampDistinct(r16).levels, 16, '16 级互不相同')
  is(SC.rampDistinct(r16).merged, 0, '16 级没有被并掉')
  for (const n of [3, 4, 8, 12, 24, 32]) {
    const g = SC.grayRamp(n)
    is(g.length, n, n + ' 级长度对')
    is(SC.rampDistinct(g).levels, n, n + ' 级不重样（8bit 屏必须能分开）')
    is(g[n - 1], 255, n + ' 级末值锁 255')
  }
  throws(() => SC.grayRamp(1), '只有一级没法做梯度')
  throws(() => SC.grayRamp(0), '0 级要报错')
  throws(() => SC.grayRamp(-3), '负数要报错')
  throws(() => SC.grayRamp('x'), '非数字要报错')
  throws(() => SC.grayRamp(200), '级数过上限要报错（屏幕上摆不下）')
  is(SC.grayLabel(64), '64 / 255', '灰阶标签写法')
}

/* ---------- 3. 几何参数 ---------- */
{
  is(SC.GEOMETRY_TESTS.length, 4, '四张几何图')
  is(new Set(SC.GEOMETRY_TESTS.map((g) => g.key)).size, 4, '几何图 key 不重复')
  for (const g of SC.GEOMETRY_TESTS) {
    is(g.name.length > 1, true, g.key + ' 有名字')
    is(g.why.length > 8, true, g.key + ' 说明看什么')
  }
  is(SC.gridSpacing(1080, 2400), 96, '大屏夹到上限 96')
  is(SC.gridSpacing(360, 780), 36, '360 宽按短边十分之一')
  is(SC.gridSpacing(200, 300), 24, '小屏夹到下限 24')
  is(SC.gridSpacing(0, 0), 48, '尺寸缺失回落默认')
  is(SC.gridSpacing('x', 100), 48, '非数字回落默认')
  is(SC.stripeCount(360, 780), 14, '条纹数按短边')
  is(SC.stripeCount(1080, 2400), 24, '条纹上限 24')
  is(SC.stripeCount(100, 100), 4, '条纹下限 4')
  is(SC.stripeCount(null, null), 12, '缺失回落默认')
  for (const w of [200, 400, 800, 1600]) {
    const s = SC.gridSpacing(w, w * 2)
    is(s >= 24 && s <= 96, true, '网格间距始终在可用区间：' + w)
  }
}

/* ---------- 3b. 亮度、字色与物理分辨率 ---------- */
{
  const r3 = (x) => Math.round(x * 1000) / 1000
  is(r3(SC.luma([255, 255, 255])), 1, '白的感知亮度是 1')
  is(r3(SC.luma([0, 0, 0])), 0, '黑是 0')
  is(r3(SC.luma([255, 0, 0])), 0.299, '红的权重 0.299')
  is(r3(SC.luma([0, 255, 0])), 0.587, '绿最敏感 0.587')
  is(r3(SC.luma([0, 0, 255])), 0.114, '蓝最迟钝 0.114')
  is(SC.luma([0, 255, 0]) > SC.luma([255, 0, 0]), true, '绿比红亮')
  is(SC.luma([255, 0, 0]) > SC.luma([0, 0, 255]), true, '红比蓝亮')
  is(SC.luma([]), 0, '空色组不抛')
  is(SC.luma(null), 0, 'null 不抛')
  is(SC.luma(['x', 300, -9]), 0.587, '脏值夹回值域：NaN 当 0、300 当 255、-9 当 0')
  is(SC.inkOn([255, 255, 255]), '#1A1A1A', '白底用深字')
  is(SC.inkOn([0, 0, 0]), '#FFFFFF', '黑底用白字')
  is(SC.inkOn([0, 0, 255]), '#FFFFFF', '纯蓝偏暗，仍然用白字')
  is(SC.inkOn(SC.SOLID_ORDER[1].rgb), '#1A1A1A', '纯绿够亮，压深字才看得清')
  is(SC.physSize(360, 780, 3), '1080×2340', '逻辑乘缩放得物理分辨率')
  is(SC.physSize(360.5, 100, 2), '721×200', '半像素四舍五入')
  is(SC.physSize(360, 780, 0), '', '缩放为 0 不给结论')
  is(SC.physSize(0, 780, 3), '', '宽缺失不给结论')
  is(SC.physSize('x', 780, 3), '', '非数字不给结论')
  is(SC.physSize(null, null, null), '', 'null 不抛')
}

/* ---------- 3c. 灰阶条与几何背景 ---------- */
{
  const rows = SC.grayRows(5)
  is(rows.length, 5, '五级灰阶出五条')
  is(rows[0].bg, 'rgb(0, 0, 0)', '第一条最暗')
  is(rows[0].fg, '#FFFFFF', '暗条配白字')
  is(rows[0].label, '0 / 255', '读数写在条上')
  is(rows[4].bg, 'rgb(255, 255, 255)', '末条锁纯白')
  is(rows[4].fg, '#1A1A1A', '亮条配深字')
  is(rows[2].bg, 'rgb(128, 128, 128)', '中间那级正好是中灰')
  is(new Set(SC.grayRows(24).map((r) => r.bg)).size, 24, '24 级条条不同色')
  throws(() => SC.grayRows(1), '一级没法成梯度')

  const grid = SC.geomStyle('grid', 360, 780)
  is(grid.backgroundColor, '#FFFFFF', '网格是白底黑线')
  is((grid.backgroundImage.match(/36px/g) || []).length, 2, '横竖两组线用同一间距（短边 1/10 = 36）')
  is(grid.backgroundImage.indexOf('0deg') > -1 && grid.backgroundImage.indexOf('90deg') > -1, true, '横竖各一组')
  is(grid.backgroundImage.indexOf('#000000 0, #000000 1px') > -1, true, '线宽精确 1px')
  const diag = SC.geomStyle('diag', 360, 780)
  is(diag.backgroundImage.indexOf('45deg') > -1 && diag.backgroundImage.indexOf('135deg') > -1, true, '两组 45° 交叉')
  is(diag.backgroundImage.indexOf('50px') > -1, true, '斜向间距按 1.4 倍放大（36×1.4≈50）')
  const stripe = SC.geomStyle('stripe', 360, 780)
  is(stripe.backgroundImage.indexOf('13px') > -1, true, '条纹半周期 = 宽/(2×条数) = 360/28 ≈ 13')
  is(stripe.backgroundImage.indexOf('26px') > -1, true, '整周期 26px')
  const grad = SC.geomStyle('gradient', 360, 780)
  is(grad.backgroundImage.indexOf('linear-gradient') === 0, true, '渐变用 linear-gradient')
  is(/#00FFFF/.test(grad.backgroundImage) && /#FF00FF/.test(grad.backgroundImage), true, '色带含青与品红，断带最容易在这两段看出来')
  is(JSON.stringify(SC.geomStyle('nope', 360, 780)), '{}', '不认识的图形不给样式')
  is(SC.geomStyle('grid', 0, 0).backgroundImage.indexOf('36px') > -1, true, '尺寸缺失按默认短边算，不会画出 0 间距')
}

/* ---------- 4. 触摸网格归属 ---------- */
{
  is(SC.TOUCH_COLS, 3, '网格三列')
  is(SC.TOUCH_ROWS, 4, '网格四行')
  const W = 300
  const H = 400
  const hit = SC.cellHits([{ x: 10, y: 10 }, { x: 290, y: 390 }, { x: 150, y: 200 }], W, H)
  is(hit.cols, 3, '列数回显')
  is(hit.rows, 4, '行数回显')
  is(hit.grid.length, 4, '网格四行')
  is(hit.grid[0].length, 3, '每行三格')
  is(hit.total, 3, '有效点计数')
  is(hit.grid[0][0], 1, '左上角落进第 1 行第 1 列')
  is(hit.grid[3][2], 1, '右下落进最后一行最后一列')
  is(hit.grid[2][1], 1, '正中落进第 3 行第 2 列')
  // 与「坐标 ÷ 边长取整」的独立算法对一遍
  const pts = []
  for (let i = 0; i < 120; i++) pts.push({ x: (i * 37) % W, y: (i * 53) % H })
  const h2 = SC.cellHits(pts, W, H)
  let manual = 0
  for (const p of pts) {
    const c = Math.min(2, Math.floor((p.x / W) * 3))
    const r = Math.min(3, Math.floor((p.y / H) * 4))
    manual++
    is(h2.grid[r][c] > 0, true, '手工归属一致 r' + r + 'c' + c)
  }
  is(h2.total, manual, '总点数等于逐点累加')
  // 越界与脏点被丢掉，不污染统计
  const h3 = SC.cellHits([{ x: -5, y: 10 }, { x: W, y: 10 }, { x: 10, y: H }, { x: 'a', y: 1 }, null, { x: null, y: null }], W, H)
  is(h3.total, 0, '越界与脏点一个都不算')
  is(h3.grid.every((row) => row.every((v) => v === 0)), true, '网格保持全零')
  const h4 = SC.cellHits([{ x: 1, y: 1 }], 0, 0)
  is(h4.total, 0, '宽高非法时不归属')
  is(h4.grid.length, 4, '网格仍然成形')
  is(SC.cellHits(null, W, H).total, 0, '点集为 null 不抛')
  // 同一格重复触摸要累加
  const h5 = SC.cellHits([{ x: 5, y: 5 }, { x: 6, y: 6 }, { x: 7, y: 7 }], W, H)
  is(h5.grid[0][0], 3, '同格累加次数')
  is(h5.total, 3, '累加不丢点')
}

/* ---------- 5. 覆盖率与盲点 ---------- */
{
  const full = SC.coverageOf(SC.cellHits((() => {
    const ps = []
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) ps.push({ x: c * 100 + 50, y: r * 100 + 50 })
    return ps
  })(), 300, 400))
  is(full.cells, 12, '12 格')
  is(full.touched, 12, '全部画到')
  is(full.pct, 100, '100%')
  is(full.missed.length, 0, '没有盲点')
  is(full.verdict.indexOf('全屏跟手') > -1, true, '满覆盖文案')

  const empty = SC.coverageOf(SC.cellHits([], 300, 400))
  is(empty.touched, 0, '一格没画')
  is(empty.pct, 0, '0%')
  is(empty.missed.length, 12, '12 个盲点')
  is(empty.verdict, '还没画', '没有触点时不判盲区')
  is(empty.missed[0].r, 1, '盲点行号从 1 开始')
  is(empty.missed[0].c, 1, '盲点列号从 1 开始')
  is(empty.missed[11].r, 4, '最后一个盲点是第 4 行')
  is(empty.missed[11].c, 3, '最后一列')

  // 故意空出最后一格：11/12 = 91.7%
  const ps = []
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      if (r === 3 && c === 2) continue
      ps.push({ x: c * 100 + 50, y: r * 100 + 50 })
    }
  }
  const g = SC.coverageOf(SC.cellHits(ps, 300, 400))
  is(g.touched, 11, '11 格有读数')
  is(g.pct, 91.7, '91.7%')
  is(g.missed.length, 1, '报出一个盲点')
  is(g.missed[0].r + ':' + g.missed[0].c, '4:3', '盲点正是右下角那格')
  is(g.verdict.indexOf('基本跟手') > -1, true, '91.7% 落在「基本跟手」档')
  // 只画中间两格 → 覆盖率低到该重怀疑
  const bad = SC.coverageOf(SC.cellHits([{ x: 150, y: 150 }, { x: 150, y: 250 }], 300, 400))
  is(bad.touched, 2, '只有两格被碰到')
  is(bad.pct, 16.7, '16.7%')
  is(bad.verdict.indexOf('完全没反应') > -1, true, '低覆盖判为可疑')
  is(SC.coverageOf(null).verdict, '还没画', '空网格不抛')
  is(SC.coverageOf({ grid: [] }).cells, 0, '空 grid 零格')
}

/* ---------- 6. 多点触控与次数分布 ---------- */
{
  is(SC.maxPointers([1, 2, 5, 3]), 5, '五指同按记到 5')
  is(SC.maxPointers([1]), 1, '单点')
  is(SC.maxPointers([]), 0, '没有触摸')
  is(SC.maxPointers(null), 0, 'null 不抛')
  is(SC.maxPointers(['x', null, 4]), 4, '脏值跳过')
  is(SC.maxPointers([2, 2, 2, 10, 1]), 10, '极值在中间也能抓到')
  for (let n = 1; n <= 10; n++) {
    const arr = []
    for (let i = 0; i <= n; i++) arr.push(i)
    is(SC.maxPointers(arr), n, '递增序列取到 ' + n)
  }
  is(SC.TOUCH_STEPS.length, 4, '四步触摸引导')
  for (const s of SC.TOUCH_STEPS) is(typeof s === 'string' && s.length > 6, true, '引导句成句')
  is(SC.TOUCH_STEPS.some((s) => s.indexOf('5') > -1), true, '引导里提到五指')

  const spread = SC.hitSpread(SC.cellHits([{ x: 10, y: 10 }, { x: 10, y: 10 }, { x: 150, y: 200 }], 300, 400))
  is(spread.hi, 2, '最热格 2 次')
  is(spread.lo, 0, '最冷格 0 次')
  is(spread.spread, 2, '极差 2')
  is(SC.hitSpread(null).spread, 0, '空数据不抛')

  is(SC.cellStyle(0, 10).hot, false, '0 次算冷格')
  is(SC.cellStyle(0, 10).bg.indexOf('196, 60, 60') > -1, true, '盲区标红')
  is(SC.cellStyle('x', 10).hot, false, '脏值按 0 次处理')
  is(SC.cellStyle(10, 10).bg, 'rgba(96, 206, 120, 0.78)', '最热格 alpha = 0.16+0.62')
  is(SC.cellStyle(5, 5).bg, 'rgba(96, 206, 120, 0.78)', '热度看的是占比不是绝对值')
  is(SC.cellStyle(1, 5).bg, 'rgba(96, 206, 120, 0.44)', '1/5 → sqrt(0.2)≈0.447 → 0.44')
  is(SC.cellStyle(1, 5).bg < SC.cellStyle(5, 5).bg, true, '越热 alpha 字符串越大（同宽度可比）')
  is(SC.cellStyle(3, 0).hot, true, '上限为 0 时按 1 处理，不会全红')
}

/* ---------- 7. 屏幕比例 ---------- */
{
  is(SC.ratioName(1080, 1920).indexOf('16:9') > -1, true, '1080×1920 是 16:9')
  is(SC.ratioName(1080, 2160).indexOf('2:1') > -1, true, '1080×2160 是 2:1')
  is(SC.ratioName(1080, 2340).indexOf('19.5:9') > -1, true, '1080×2340 是 19.5:9')
  is(SC.ratioName(1440, 3200).indexOf('20:9') > -1, true, '1440×3200 是 20:9')
  is(SC.ratioName(1080, 2280).indexOf('19:9') > -1, true, '1080×2280 是 19:9（与 19.5:9 相差 2.5%，超过容差不会混判）')
  is(SC.ratioName(1080, 2280).indexOf('19.5') === -1, true, '19:9 不会被就近判成 19.5:9')
  is(SC.ratioName(1000, 1000).indexOf('1（') > -1, true, '正方形也给比值')
  is(SC.ratioName(0, 0), '', '缺尺寸不给结论')
  is(SC.ratioName('x', 100), '', '非数字不给结论')
  is(SC.ratioName(1080, 1920).indexOf('1.78') > -1, true, '同时给出实际比值')
  // 竖屏横屏给同一个比值
  is(SC.ratioName(1920, 1080), SC.ratioName(1080, 1920), '比例与方向无关')
}

/* ---------- 8. 说明口径 ---------- */
{
  is(SC.SCREEN_NOTES.length >= 4, true, '至少四条口径说明')
  for (const n of SC.SCREEN_NOTES) {
    is(typeof n.t === 'string' && n.t.length > 1, true, '标题成词：' + n.t)
    is(typeof n.d === 'string' && n.d.length > 20, true, n.t + ' 的正文够长')
  }
  is(new Set(SC.SCREEN_NOTES.map((n) => n.t)).size, SC.SCREEN_NOTES.length, '标题不重复')
  is(SC.SCREEN_NOTES.some((n) => n.d.indexOf('人眼') > -1), true, '明确说了要人眼判读')
}

console.log('screen ' + (fail ? 'FAIL ' + fail : '全绿') + ' ' + ok + '/' + (ok + fail))
process.exit(fail ? 1 : 0)
