/**
 * sensor.js 自查断言（直接测 src/utils/sensor.js 本体）
 * ------------------------------------------------------------
 * 传感器本身在 Node 里没有，但「三个裸数 → 倾角/气泡/方位/档位」这条换算链完全脱离硬件，
 * 所以判据用的是能手算的独立事实：
 *   1) 重力方向：静止时 (0,0,g) 应该判为水平，(g,0,0) 应该是绕纵轴 90°；
 *   2) 角度是环形的：350° 与 10° 之间应该走 20° 而不是 340°；
 *   3) 统计量：[1,2,3,4] 的均值、极差、标准差可以按定义手算；
 *   4) 档位边界：光线按公开照度常识切档，边界值必须落在预期的那一档。
 * 视图里唯一无法自测的，是把 uni 回调接到 frameRows 上的那一跳。
 */
import { useUtils } from './harness.mjs'

const S = await useUtils('sensor')

let ok = 0
let fail = 0
function is(a, b, m) {
  if (a === b) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b))
  }
}
function near(a, b, tol, m) {
  if (Math.abs(a - b) <= tol) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + a + ' want ' + b + ' ±' + tol)
  }
}
function inRange(v, lo, hi, m) {
  if (v >= lo && v <= hi) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': ' + v + ' 不在 [' + lo + ',' + hi + ']')
  }
}

const G = S.GRAVITY

/* ---------- 0. 导出面 ---------- */
{
  const want = [
    'GRAVITY', 'magnitude', 'tiltFromAccel', 'bubble', 'isLevel', 'smooth', 'smoothHeading',
    'normalizeHeading', 'dirName16', 'compassView', 'lightGrade', 'proximityState',
    'seriesStats', 'SENSOR_KINDS', 'SENSOR_RATES', 'frameRows',
  ]
  for (const k of want) is(typeof S[k] !== 'undefined', true, '导出 ' + k)
  is(S.GRAVITY > 9.78 && S.GRAVITY < 9.83, true, '重力常数取标准值')
}

/* ---------- 1. 模长 ---------- */
{
  near(S.magnitude(3, 4, 0), 5, 1e-9, '勾数 3-4-5')
  near(S.magnitude(0, 0, G), G, 1e-9, '只剩 Z 轴')
  near(S.magnitude(0, 0, 0), 0, 1e-9, '零向量')
  near(S.magnitude('x', null, undefined), 0, 1e-9, '非数字按 0 处理，不抛')
  // 静止时三轴合力就是重力，量级不该跑飞
  near(S.magnitude(0.1, -0.2, 9.79), 9.8, 0.05, '静止读数模长≈1g')
}

/* ---------- 2. 倾角 ---------- */
{
  const flat = S.tiltFromAccel(0, 0, G)
  is(flat.pitch, 0, '平放 pitch 0')
  is(flat.roll, 0, '平放 roll 0')
  is(flat.tilt, 0, '平放 tilt 0')

  const rightUp = S.tiltFromAccel(G, 0, 0)
  is(rightUp.pitch, 0, '绕 X 轴翻不影响 pitch')
  is(rightUp.roll, -90, 'x 轴朝上 → roll -90（右边抬高）')
  is(rightUp.tilt, 90, '侧立时与重力夹角 90°')

  const topUp = S.tiltFromAccel(0, G, 0)
  is(topUp.pitch, 90, 'y 轴朝上 → pitch 90（顶边抬高）')
  is(topUp.roll, 0, '顶边抬高不影响 roll')

  const down = S.tiltFromAccel(0, -G, 0)
  is(down.pitch, -90, '倒过来 pitch -90')
  is(down.tilt, 90, '倒扣仍是 90°')

  const back = S.tiltFromAccel(0, 0, -G)
  is(back.pitch, 180, '屏幕朝下 pitch 180')
  is(back.tilt, 180, '屏幕朝下与重力反向')

  const half = G / Math.SQRT2
  const d45 = S.tiltFromAccel(0, half, half)
  is(d45.pitch, 45, '45° 仰')
  is(d45.tilt, 45, '45° 倾角与 pitch 同值')
  const m45 = S.tiltFromAccel(half, 0, half)
  is(m45.roll, -45, '向右 45°')
  is(m45.tilt, 45, '左右倾 45° 同样 tilt 45')

  for (const p of [[0, 0, G], [G, 0, 0], [0, G, 0], [0.3, -0.7, 9.6], [-4, 2, 5]]) {
    const t = S.tiltFromAccel(p[0], p[1], p[2])
    is(t.pitch >= -180 && t.pitch <= 180, true, 'pitch 落在 ±180：' + p.join(','))
    is(t.roll >= -180 && t.roll <= 180, true, 'roll 落在 ±180：' + p.join(','))
    is(t.tilt >= -180 && t.tilt <= 180, true, 'tilt 落在 ±180：' + p.join(','))
    is(typeof t.pitch === 'number' && isFinite(t.pitch), true, 'pitch 是有限数：' + p.join(','))
  }
}

/* ---------- 3. 水平仪气泡 ---------- */
{
  const c = S.bubble(0, 0, 0.35)
  is(c.left, 50, '静置气泡居中 X')
  is(c.top, 50, '静置气泡居中 Y')
  const edgeX = S.bubble(0.35, 0, 0.35)
  is(edgeX.left, 100, '满偏到右边缘')
  const edgeY = S.bubble(0, 0.35, 0.35)
  is(edgeY.top, 0, 'y 正向气泡往上走')
  is(S.bubble(0, -0.35, 0.35).top, 100, 'y 负向气泡往下走')
  const over = S.bubble(99, 99, 0.35)
  is(over.left >= 0 && over.left <= 100, true, '超量程气泡不飞出框（X）')
  is(over.top >= 0 && over.top <= 100, true, '超量程气泡不飞出框（Y）')
  is(S.bubble(0.175, 0).left, 75, '半偏是 75%')
  is(S.bubble(0, 0).left, 50, '缺省量程也能居中')
}

/* ---------- 4. 水平判定 ---------- */
{
  is(S.isLevel(0, 0, G), true, '平放判水平')
  is(S.isLevel(0, 0, -G), false, '屏幕朝下不算水平')
  const one = Math.tan((1 * Math.PI) / 180) * G
  is(S.isLevel(0, one, G, 0.5), false, '倾斜 1° 超 0.5° 容差')
  is(S.isLevel(0, one, G, 2), true, '倾斜 1° 在 2° 容差内')
  is(S.isLevel(0, G * 0.005, G), true, '0.3° 以内视为水平')
  is(S.isLevel('a', undefined, null), false, '缺数时不谎报水平')
}

/* ---------- 5. 低通与环形去抖 ---------- */
{
  const a = S.smooth(null, { x: 1, y: 2, z: 3 })
  is(a.x, 1, '第一帧直接取当前值（X）')
  is(a.z, 3, '第一帧直接取当前值（Z）')
  is(S.smooth({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 1).x, 10, 'α=1 完全跟手')
  is(S.smooth({ x: 5, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 0).x, 5, 'α=0 完全不动')
  is(S.smooth({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 0.25).x, 2.5, 'α=0.25 走四分之一')
  let v = { x: 0, y: 0, z: 0 }
  for (let i = 0; i < 60; i++) v = S.smooth(v, { x: 1, y: 0, z: 0 }, 0.2)
  near(v.x, 1, 0.01, '反复逼近会收敛到目标值（末三位以内）')
  is(S.smooth({ x: 0, y: 0, z: 0 }, { x: 1 / 3, y: 0, z: 0 }, 1).x, 0.333, '第三位小数截断')
  // α 越界不能把数算飞
  is(S.smooth({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 5).x, 10, 'α>1 截到 1')
  is(S.smooth({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, -1).x, 0, 'α<0 截到 0')

  is(S.smoothHeading(null, 30), 30, '没有上一帧就取当前')
  is(S.smoothHeading(350, 10, 1), 10, '跨 0° 一步到位是 10 不是 -350')
  near(S.smoothHeading(350, 10, 0.5), 0, 1e-6, '跨 0° 走短弧：350 + 5')
  near(S.smoothHeading(10, 350, 0.5), 0, 1e-6, '反向跨 0°：10 - 10')
  is(S.smoothHeading(350, 10, 0.5) >= 0 && S.smoothHeading(350, 10, 0.5) < 360, true, '结果仍在 0~360')
  is(S.smoothHeading(180, 190, 0), 180, '环形去抖 α=0 也不动')
}

/* ---------- 6. 方位归一与 16 方位 ---------- */
{
  is(S.normalizeHeading(0), 0, '0 还是 0')
  is(S.normalizeHeading(-10), 350, '负角加满圈')
  is(S.normalizeHeading(370), 10, '超圈取余')
  is(S.normalizeHeading(720), 0, '整两圈归零')
  is(S.normalizeHeading(-360), 0, '负整圈归零')
  is(S.normalizeHeading(NaN), 0, 'NaN 不外泄')
  is(S.normalizeHeading(123.456), 123.5, '角度保留一位小数')
  for (let i = -720; i <= 720; i += 1) {
    const v = S.normalizeHeading(i)
    is(v >= 0 && v < 360, true, '归一化落在 [0,360)：' + i)
  }
  is(S.dirName16(0), '北', '0° 北')
  is(S.dirName16(90), '东', '90° 东')
  is(S.dirName16(180), '南', '180° 南')
  is(S.dirName16(270), '西', '270° 西')
  is(S.dirName16(45), '东北', '45° 东北')
  is(S.dirName16(315), '西北', '315° 西北')
  is(S.dirName16(10), '北', '10° 仍算北')
  is(S.dirName16(20), '北偏东', '20° 北偏东')
  is(S.dirName16(-90), '西', '负 90° 等价 270°，是西')
  is(S.dirName16(450), '东', '450° 等价 90°，是东')
  const names = new Set()
  for (let d = 0; d < 360; d += 1) names.add(S.dirName16(d))
  is(names.size, 16, '整圈走一遍能覆盖 16 个方位名')
  for (const n of names) is(typeof n === 'string' && n.length > 0, true, '方位名非空：' + n)
}

/* ---------- 7. 指南针读数 ---------- */
{
  const n = S.compassView(0)
  is(n.deg, 0, '正北 0°')
  is(n.dir, '北', '正北文字')
  is(n.cardinal, '北', '正北主方向')
  is(S.compassView(200).cardinal, '南', '200° 归到南')
  is(S.compassView(60).cardinal, '东', '60° 归到东')
  is(S.compassView(250).cardinal, '西', '250° 归到西')
  is(S.compassView(320).cardinal, '北', '320° 仍偏北')
  is(S.compassView(-45).deg, 315, '负角进表盘')
  is(S.compassView(12).rot, 12, '表盘旋转角等于读数')
  for (let d = 0; d < 360; d += 5) {
    const c = S.compassView(d)
    is(c.rot, c.deg, '旋转角与读数一致：' + d)
    is(['北', '东', '南', '西'].includes(c.cardinal), true, '主方向只可能四个：' + d)
  }
}

/* ---------- 8. 光线档位 ---------- */
{
  const cases = [
    [0, '全黑'], [0.4, '全黑'], [1, '极暗'], [4, '极暗'], [20, '昏暗'],
    [200, '普通室内'], [700, '明亮室内'], [3000, '阴天户外'], [10000, '晴天阴凉'], [90000, '阳光直射'],
  ]
  for (const [lux, name] of cases) {
    const g = S.lightGrade(lux)
    is(g.name, name, lux + ' lx 判档')
    is(typeof g.hint === 'string' && g.hint.length > 0, true, lux + ' lx 有人话说明')
    is(g.band >= 0, true, lux + ' lx 有档位号')
  }
  is(S.lightGrade(-3).name, '—', '负照度不给档')
  is(S.lightGrade(undefined).band, -1, '无读数 band 为 -1')
  is(S.lightGrade(500).name, '明亮室内', '500 落在明亮室内')
  // 档位必须随照度单调不减
  let last = -1
  for (let lux = 0; lux <= 30000; lux += 37) {
    const b = S.lightGrade(lux).band
    is(b >= last, true, '档位单调：' + lux)
    last = b
  }
}

/* ---------- 9. 接近传感器 ---------- */
{
  const near1 = S.proximityState(0, 5)
  is(near1.near, true, '0 视为贴近')
  is(near1.text, '贴近', '贴近文案')
  is(near1.detail.indexOf('cm') > -1, true, '连续量程给厘米数')
  is(S.proximityState(5, 5).near, false, '满量程视为远离')
  is(S.proximityState(3, 5).near, false, '过半算远离')
  is(S.proximityState(2, 5).near, true, '未过半算贴近')
  const two = S.proximityState(1, 1)
  is(two.near, false, '只有 0/1 两档时 1 是远离')
  is(S.proximityState(0, 1).near, true, '两档制 0 是贴近')
  is(S.proximityState(undefined).near, null, '没有读数不猜')
  is(S.proximityState(undefined).text, '没有读数', '无读数文案')
  is(S.proximityState(0).near, true, '不给量程也能判贴近')
}

/* ---------- 10. 采样统计 ---------- */
{
  const s = S.seriesStats([1, 2, 3, 4])
  is(s.n, 4, '样本数')
  is(s.min, 1, '最小值')
  is(s.max, 4, '最大值')
  is(s.avg, 2.5, '均值')
  is(s.spread, 3, '极差')
  near(s.sd, Math.sqrt(1.25), 1e-3, '标准差按定义')
  is(s.stable, false, '跨度 3 不算稳定')
  is(S.seriesStats([2, 2, 2]).stable, true, '恒定读数算稳定')
  is(S.seriesStats([2, 2, 2]).sd, 0, '恒定读数标准差 0')
  is(S.seriesStats([]).n, 0, '空序列不抛')
  is(S.seriesStats(null).n, 0, 'null 不抛')
  is(S.seriesStats([NaN, 'x', 5]).n, 1, '脏数据丢掉，只留能算的')
  is(S.seriesStats([NaN, 'x', 5]).avg, 5, '脏数据不影响均值')
  near(S.seriesStats([0.1, 0.1, 0.1]).avg, 0.1, 1e-9, '小数均值')
  is(S.seriesStats([1, 2, 3]).n, 3, '样本数按有效值计')
  // 抖动大的序列必须判为不稳定
  is(S.seriesStats([9.8, 0.1, -9.8, 0.2]).stable, false, '大抖动判不稳定')
  is(S.seriesStats([9.8, 9.81, 9.79, 9.8]).stable, true, '静置重力读数算稳定')
  for (let i = 0; i < 40; i++) {
    const arr = []
    for (let j = 0; j < 12; j++) arr.push(((i * 7 + j * 13) % 100) / 10)
    const r = S.seriesStats(arr)
    is(r.n, 12, '批量：样本数')
    inRange(r.avg, r.min, r.max, '批量：均值在极值之间')
    is(r.sd <= r.spread, true, '批量：标准差不大于极差')
    is(r.spread >= 0, true, '批量：极差非负')
  }
}

/* ---------- 11. 传感器清单与接口名 ---------- */
{
  is(S.SENSOR_KINDS.length, 6, '六种传感器')
  const keys = S.SENSOR_KINDS.map((k) => k.key)
  is(new Set(keys).size, keys.length, '传感器 key 不重复')
  const names = S.SENSOR_KINDS.map((k) => k.name)
  is(new Set(names).size, names.length, '传感器名称不重复')
  for (const k of S.SENSOR_KINDS) {
    is(typeof k.start === 'string' && k.start.length > 0, true, k.key + ' 有 start 接口')
    is(typeof k.stop === 'string' && k.stop.length > 0, true, k.key + ' 有 stop 接口')
    is(k.start !== k.stop, true, k.key + ' start/stop 不是同一个')
    is(Array.isArray(k.fields) && k.fields.length > 0, true, k.key + ' 有字段')
    is(typeof k.desc === 'string' && k.desc.length > 10, true, k.key + ' 有说明')
    is(typeof k.glyph === 'string' && k.glyph.length === 1, true, k.key + ' 有一个字的图标')
  }
  is(S.SENSOR_KINDS.some((k) => k.start === 'startAccelerometer'), true, '加速度走 uni 真名')
  is(S.SENSOR_KINDS.some((k) => k.start === 'startCompass'), true, '指南针走 uni 真名')
  is(S.SENSOR_KINDS.some((k) => k.start === 'startGyroscope'), true, '陀螺仪走 uni 真名')
  is(S.SENSOR_KINDS.some((k) => k.start === 'startDeviceMotionListening'), true, '设备方向走 uni 真名')
  is(S.SENSOR_RATES.length, 3, '三档采样率')
  is(S.SENSOR_RATES.map((r) => r.key).join(','), 'game,ui,normal', '采样率 key 与 uni 一致')
  for (const r of S.SENSOR_RATES) is(typeof r.name === 'string' && r.name.length > 1, true, '采样率有中文名：' + r.key)
}

/* ---------- 12. 一帧 → 展示行 ---------- */
{
  const accel = S.SENSOR_KINDS.find((k) => k.key === 'accel')
  const rows = S.frameRows(accel, { x: 0.12, y: -9.79, z: 0.5, currentTime: 123 })
  is(rows.length, 3, '加速度一帧三行')
  is(rows[0].label, 'X 轴', 'X 轴标签')
  is(rows[0].value, '0.12 m/s²', '带单位')
  is(rows[1].raw, -9.79, '原值留给视图画箭头')
  const compass = S.SENSOR_KINDS.find((k) => k.key === 'compass')
  const crows = S.frameRows(compass, { direction: 47.2 })
  is(crows.length, 1, '指南针一帧一行')
  is(crows[0].label, '方位角', '方位角标签')
  is(crows[0].value, '47.2 °', '方位角读数')
  is(S.frameRows(compass, {}).every((r) => r.value === '没给'), true, '指南针缺 direction 写没给')
  const motion = S.SENSOR_KINDS.find((k) => k.key === 'motion')
  is(S.frameRows(motion, {}).length, 3, '缺字段也要出行')
  is(S.frameRows(motion, {}).every((r) => r.value === '没给'), true, '缺字段写「没给」而不是 0')
  is(S.frameRows(null, { x: 1 }).length, 0, 'kind 为空不抛')
  is(S.frameRows(accel, null).length, 0, 'frame 为空不抛')
  const light = S.SENSOR_KINDS.find((k) => k.key === 'light')
  is(S.frameRows(light, { intensity: 233.4 })[0].value, '233.4 lx', '光线带 lx')
  const prox = S.SENSOR_KINDS.find((k) => k.key === 'prox')
  is(S.frameRows(prox, { value: 0 })[0].value, '0', '接近传感器无单位')
}

/* ---------- 13. 主值与环形缓冲 ---------- */
{
  const accel = S.SENSOR_KINDS.find((k) => k.key === 'accel')
  const gyro = S.SENSOR_KINDS.find((k) => k.key === 'gyro')
  const compass = S.SENSOR_KINDS.find((k) => k.key === 'compass')
  const motion = S.SENSOR_KINDS.find((k) => k.key === 'motion')
  const light = S.SENSOR_KINDS.find((k) => k.key === 'light')
  near(S.primaryValue(accel, { x: 3, y: 4, z: 0 }), 5, 1e-9, '三轴主值取合成模长')
  is(S.primaryValue(accel, { x: 0, y: 0, z: 0 }), null, '全零不给主值')
  is(S.primaryValue(compass, { direction: 123.4 }), 123.4, '指南针主值是方位角')
  is(S.primaryValue(motion, { alpha: 10, beta: 20, gamma: 30 }), 10, '设备方向主值取首字段')
  is(S.primaryValue(light, { intensity: 42 }), 42, '光线主值是照度')
  is(S.primaryValue(light, {}), null, '缺字段不给假数')
  is(S.primaryValue(light, { intensity: 'x' }), null, '脏数据不入库')
  is(S.primaryValue(null, { x: 1 }), null, 'kind 为空不抛')
  is(S.primaryValue(accel, null), null, 'frame 为空不抛')
  is(S.primaryValue(gyro, { x: 1, y: 2, z: 2 }), 3, '陀螺仪主值也是模长')

  let buf = []
  for (let i = 1; i <= 10; i++) buf = S.pushFrame(buf, i, 6)
  is(buf.length, 6, '缓冲不超过 cap')
  is(buf[0], 5, '丢的是最旧的一帧')
  is(buf[buf.length - 1], 10, '最新一帧在末尾')
  is(S.pushFrame(null, 1, 3).length, 1, '空缓冲也能追加')
  is(S.pushFrame([1, 2], null).length, 3, '缺省容量够大，不会立刻丢帧')
  is(S.pushFrame([1, 2, 3], 4).length, 4, '默认 60 容量不裁')
  let b2 = []
  for (let i = 0; i < 200; i++) b2 = S.pushFrame(b2, i, 60)
  is(b2.length, 60, '长跑不涨内存')
  is(b2[59], 199, '长跑留的是最新值')
  // 统计必须建立在缓冲之上：同一串数两条路径算出来一样
  const viaBuf = S.seriesStats(b2.map((v) => v))
  is(viaBuf.n, 60, '缓冲进统计')
  is(viaBuf.min, 140, '统计窗口是最进的 60 帧')
}

console.log('sensor ' + (fail ? 'FAIL ' + fail : '全绿') + ' ' + ok + '/' + (ok + fail))
process.exit(fail ? 1 : 0)
