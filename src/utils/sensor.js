/**
 * 传感器实验室的纯计算层。
 *
 * 这里一个 uni API 都不碰：手机给的是 x/y/z 三个裸数，页面要展示的是「倾斜多少度、
 * 平不平、朝哪个方向、光有多亮」。这层换算和判档必须能在 Node 里算死，
 * 真机上只需要把 uni 回调里那几个数喂进来。所以本文件的判据全是「已知输入 → 手算得出」的向量。
 *
 * 约定的坐标系与 uni 一致：加速度单位 m/s²，静止时重力落在某根轴上（约 9.78~9.83）；
 * 指南针 heading 是「顺时针偏离北多少度」，0=北、90=东。
 */

export const GRAVITY = 9.80665

/** 16 方位名，与 geo.js 同一套口径；这里自带一份避免跨工具依赖 */
const WIND_16 = [
  '北', '北偏东', '东北', '东偏北', '东', '东偏南', '东南', '南偏东',
  '南', '南偏西', '西南', '西偏南', '西', '西偏北', '西北', '北偏西',
]

const RAD = Math.PI / 180

/* ------------------------------------------------------------------ *
 *  加速度：倾斜、模长、低通
 * ------------------------------------------------------------------ */

/** 三轴合成模长。静止时应接近重力常数 */
export function magnitude(x, y, z) {
  return Math.sqrt(sq(num(x)) + sq(num(y)) + sq(num(z)))
}

/**
 * 由加速度算机身倾角。
 * pitch：绕横轴前后仰（+1 表示 y 轴朝上，即手机顶边抬高）
 * roll：绕纵轴左右翻（+1 表示 x 轴朝上，即手机右边压低）
 * 两个角都取 -180~180，静置时都趋近 0。
 */
export function tiltFromAccel(x, y, z) {
  const ax = num(x)
  const ay = num(y)
  const az = num(z)
  const planar = Math.sqrt(ax * ax + ay * ay)
  return {
    pitch: round1(Math.atan2(ay, az) / RAD),
    roll: round1(Math.atan2(-ax, az) / RAD),
    // 与重力矢量的夹角：0 表示屏幕朝上平放
    tilt: round1(Math.atan2(planar, az) / RAD),
  }
}

/** 水平仪气泡位置：把 x/y 分量映射成 0~100% 的偏移，超出量程截到边缘 */
export function bubble(x, y, rangeG) {
  const r = rangeG > 0 ? rangeG : 0.35
  return {
    left: clampPct(50 + (num(x) / r) * 50),
    top: clampPct(50 - (num(y) / r) * 50),
  }
}

/** 是否在水平容差内（度）。tol 省略时按 0.5° 判；三轴全零视为没有数据，不谎报水平 */
export function isLevel(x, y, z, tol) {
  if (magnitude(x, y, z) < 1) return false
  const t = tiltFromAccel(x, y, z)
  const lim = tol === undefined || tol === null ? 0.5 : Number(tol)
  return Math.abs(t.pitch) <= lim && Math.abs(t.roll) <= lim
}

/**
 * 一阶低通（指数滑动）：α 越大越跟手、越小越平滑。
 * 传感器 20Hz 原始值抖得厉害，直接上屏读数没法看，所以要压一下。
 */
export function smooth(prev, next, alpha) {
  const a = alpha === undefined ? 0.25 : Math.min(1, Math.max(0, Number(alpha)))
  const out = {}
  for (const k of ['x', 'y', 'z']) {
    const p = prev && prev[k] !== undefined && prev[k] !== null ? Number(prev[k]) : Number(next[k])
    out[k] = round3(p + a * (Number(next[k]) - p))
  }
  return out
}

/** 罗盘去抖：角度是环形的，不能直接平均（350° 与 10° 的均值是 0°，不是 180°） */
export function smoothHeading(prevDeg, nextDeg, alpha) {
  const a = alpha === undefined ? 0.3 : Math.min(1, Math.max(0, Number(alpha)))
  if (prevDeg === null || prevDeg === undefined) return round1(Number(nextDeg))
  let d = Number(nextDeg) - Number(prevDeg)
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return normalizeHeading(Number(prevDeg) + a * d)
}

/* ------------------------------------------------------------------ *
 *  指南针
 * ------------------------------------------------------------------ */

/** 归一到 0~359.9。支持任意负数与超圈输入 */
export function normalizeHeading(deg) {
  const v = Number(deg)
  if (!isFinite(v)) return 0
  return round1(((v % 360) + 360) % 360)
}

/** 任意角度 → 16 方位名 */
export function dirName16(deg) {
  const v = normalizeHeading(deg)
  return WIND_16[Math.round(v / 22.5) % 16]
}

/** 指南针一帧的全部读法 */
export function compassView(deg) {
  const v = normalizeHeading(deg)
  return {
    deg: v,
    dir: dirName16(v),
    cardinal: ['北', '东', '南', '西'][Math.round(v / 90) % 4],
    // 视图直接按这个数 rotate 表盘，逆时针转同样的角度就能把「北」转到正上方
    rot: v,
  }
}

/* ------------------------------------------------------------------ *
 *  光线 / 接近
 * ------------------------------------------------------------------ */

/** uni 的光线 intensity 单位是 lux（安卓 TYPE_LIGHT），档位按常识切 */
const LIGHT_BANDS = [
  { max: 0.5, name: '全黑', hint: '基本没有光，相机此时噪点会很多' },
  { max: 5, name: '极暗', hint: '夜里没开灯的房间' },
  { max: 50, name: '昏暗', hint: '室内只开了一盏灯' },
  { max: 300, name: '普通室内', hint: '办公室、教室的常规照度' },
  { max: 1000, name: '明亮室内', hint: '靠窗或有补光的室内' },
  { max: 5000, name: '阴天户外', hint: '不用防晒，看屏幕略吃力' },
  { max: 20000, name: '晴天阴凉', hint: '户外正常活动很舒适' },
  { max: 1e9, name: '阳光直射', hint: '屏幕这时候最暗也最省电不了，建议背对阳光' },
]

export function lightGrade(lux) {
  const v = Number(lux)
  if (!isFinite(v) || v < 0) return { name: '—', hint: '传感器没给读数', band: -1 }
  for (let i = 0; i < LIGHT_BANDS.length; i++) {
    if (v < LIGHT_BANDS[i].max) return { name: LIGHT_BANDS[i].name, hint: LIGHT_BANDS[i].hint, band: i }
  }
  return { name: '阳光直射', hint: '', band: LIGHT_BANDS.length - 1 }
}

/**
 * 接近传感器。安卓 TYPE_PROXIMITY 多数只给 0（贴近）和最大值（远离）两档，
 * 少数机型给连续厘米数，所以这里同时支持两种输入。
 */
export function proximityState(value, maxRange) {
  const v = Number(value)
  const mx = Number(maxRange)
  if (!isFinite(v)) return { near: null, text: '没有读数', detail: '' }
  if (isFinite(mx) && mx > 1) return { near: v < mx / 2, text: v < mx / 2 ? '贴近' : '远离', detail: round1(v) + ' / ' + round1(mx) + ' cm' }
  return { near: v < 1, text: v < 1 ? '贴近' : '远离', detail: round1(v) + '（' + (isFinite(mx) ? '满量程 ' + round1(mx) : '量程未知') + '）' }
}

/* ------------------------------------------------------------------ *
 *  采样统计：任何传感器都能用同一套
 * ------------------------------------------------------------------ */

/** 一串读数 → 最小/最大/均值/极差/标准差，供「抖动多大、稳不稳」那张卡 */
export function seriesStats(values) {
  const xs = []
  for (const v of values || []) {
    const n = Number(v)
    if (isFinite(n)) xs.push(n)
  }
  if (!xs.length) return { n: 0, min: 0, max: 0, avg: 0, spread: 0, sd: 0, stable: false }
  let min = xs[0]
  let max = xs[0]
  let sum = 0
  for (const v of xs) {
    if (v < min) min = v
    if (v > max) max = v
    sum += v
  }
  const avg = sum / xs.length
  let varSum = 0
  for (const v of xs) varSum += (v - avg) * (v - avg)
  return {
    n: xs.length,
    min: round3(min),
    max: round3(max),
    avg: round3(avg),
    spread: round3(max - min),
    sd: round3(Math.sqrt(varSum / xs.length)),
    stable: max - min <= Math.max(0.05, Math.abs(avg) * 0.02),
  }
}

/* ------------------------------------------------------------------ *
 *  传感器清单：id → uni 接口名与中文说明，视图按这张表开关
 * ------------------------------------------------------------------ */

export const SENSOR_KINDS = [
  {
    key: 'accel',
    name: '加速度计',
    glyph: '加',
    start: 'startAccelerometer',
    stop: 'stopAccelerometer',
    api: 'onAccelerometerChange',
    unit: 'm/s²',
    desc: '三轴加速度。静止时合力就是重力方向，所以它同时是水平仪的原料。',
    fields: ['x', 'y', 'z'],
  },
  {
    key: 'compass',
    name: '指南针',
    glyph: '指',
    start: 'startCompass',
    stop: 'stopCompass',
    api: 'onCompassChange',
    unit: '°',
    desc: '地磁方位角，0 是北、顺时针增。磁北与真北差一个磁偏角，城市里几十微特斯拉的钢铁就会把它带偏。',
    fields: ['direction'],
  },
  {
    key: 'gyro',
    name: '陀螺仪',
    glyph: '螺',
    start: 'startGyroscope',
    stop: 'stopGyroscope',
    api: 'onGyroscopeChange',
    unit: '°/s',
    desc: '三轴角速度，不是角度。慢速翻转时它可能读不到值，这是 MEMS 陀螺的阈值特性。',
    fields: ['x', 'y', 'z'],
  },
  {
    key: 'motion',
    name: '设备方向',
    glyph: '姿',
    start: 'startDeviceMotionListening',
    stop: 'stopDeviceMotionListening',
    api: 'onDeviceMotionChange',
    unit: '°',
    desc: '姿态解算后的 beta/gamma/alpha，比单看加速度稳，但它内部已经融合了陀螺和磁力计。',
    fields: ['alpha', 'beta', 'gamma'],
  },
  {
    key: 'light',
    name: '光线',
    glyph: '光',
    start: 'onLightIntensityChange',
    stop: 'offLightIntensityChange',
    api: 'onLightIntensityChange',
    unit: 'lx',
    desc: '环境光强度，部分机型没有独立光线传感器，也没有这个接口。',
    fields: ['intensity'],
  },
  {
    key: 'prox',
    name: '接近',
    glyph: '近',
    start: 'onProximityChange',
    stop: 'offProximityChange',
    api: 'onProximityChange',
    unit: '',
    desc: '听筒旁边那颗距离感应器，打电话时用它熄屏。多数只有贴近/远离两档。',
    fields: ['value'],
  },
]

/** uni 的 interval 三档，页面用 PkSeg 直接吃 */
export const SENSOR_RATES = [
  { key: 'game', name: '最快（游戏档）' },
  { key: 'ui', name: '快（界面档）' },
  { key: 'normal', name: '常规' },
]

/** 把一帧回调对象按 kind 摊成展示行 */
export function frameRows(kind, frame) {
  if (!kind || !frame) return []
  const out = []
  const named = { x: 'X 轴', y: 'Y 轴', z: 'Z 轴', alpha: 'Alpha 绕 Z', beta: 'Beta 绕 X', gamma: 'Gamma 绕 Y', intensity: '照度', value: '距离', direction: '方位角', accuracy: '精度' }
  for (const f of kind.fields) {
    const v = frame[f]
    out.push({
      label: named[f] || f,
      value: v === undefined || v === null ? '没给' : round3(Number(v)) + (kind.unit ? ' ' + kind.unit : ''),
      raw: v === undefined || v === null ? null : Number(v),
    })
  }
  return out
}

/**
 * 一帧里挑一个「最能代表它」的数画曲线：三轴的取合成模长，其余取主字段。
 * 这样统计卡对所有传感器都用同一套 seriesStats，不用每个传感器写一遍。
 */
export function primaryValue(kind, frame) {
  if (!kind || !frame) return null
  if (kind.fields.indexOf('x') === 0) {
    const m = magnitude(frame.x, frame.y, frame.z)
    return m > 0 ? round3(m) : null
  }
  const v = frame[kind.fields[0]]
  return v === undefined || v === null || !isFinite(Number(v)) ? null : round3(Number(v))
}

/** 往环形缓冲里追加一帧，超过 cap 丢最旧的；视图画曲线和算统计都靠它 */
export function pushFrame(buf, value, cap) {
  const out = (buf || []).concat([value])
  const n = cap && cap > 0 ? cap : 60
  return out.length > n ? out.slice(out.length - n) : out
}

/* ------------------------------------------------------------------ *
 *  小工具
 * ------------------------------------------------------------------ */

function num(v) {
  const n = Number(v)
  return isFinite(n) ? n : 0
}
function sq(v) {
  return v * v
}
function round1(v) {
  return Math.round(v * 10) / 10
}
function round3(v) {
  return Math.round(v * 1000) / 1000
}
function clampPct(v) {
  return Math.round(Math.min(100, Math.max(0, v)) * 10) / 10
}
