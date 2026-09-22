/**
 * 坐标系与定位换算：WGS-84（GPS 原生）、GCJ-02（国测局加密）、BD-09（百度在 GCJ 上再加密）。
 *
 * 这里的偏移算法按公开的三条关系实现：
 *   · 境外不做偏移（GCJ-02 只处理中国范围内的点）；
 *   · 偏移量由经纬度差的正弦/余弦混合而成，周期是几度量级，所以相邻点偏移几乎相同；
 *   · BD-09 = 在 GCJ-02 上再做一次带 sin/cos 的极坐标平移。
 * 反向换算没有闭式解，用两次迭代的定点法，误差能压到 1e-7 度（不到 0.02 米）。
 *
 * 全本地计算：定位结果只在本页显示，不上传。
 */

const A = 6378245.0
const EE = 0.0066927906
const R_EARTH = 6371008.8
const PI = Math.PI
const X_PI = (PI * 3000.0) / 180

export const COORD_SYS = [
  { key: 'wgs84', name: 'WGS-84 GPS' },
  { key: 'gcj02', name: 'GCJ-02 国测局' },
  { key: 'bd09', name: 'BD-09 百度' },
]

/** 三个系统两两之间的换算路径名，给界面当标题用 */
export const CONVERT_PATHS = [
  { key: 'wgs84>gcj02', name: 'GPS → 国测局' },
  { key: 'gcj02>wgs84', name: '国测局 → GPS' },
  { key: 'gcj02>bd09', name: '国测局 → 百度' },
  { key: 'bd09>gcj02', name: '百度 → 国测局' },
  { key: 'wgs84>bd09', name: 'GPS → 百度' },
  { key: 'bd09>wgs84', name: '百度 → GPS' },
]

export const GEO_SAMPLES = [
  { label: '北京 天安门', lat: '39.908722', lng: '116.397499' },
  { label: '上海 外滩', lat: '31.239703', lng: '121.490316' },
  { label: '广州 广州塔', lat: '23.106428', lng: '113.324474' },
  { label: '拉萨 布达拉宫', lat: '29.657892', lng: '91.117299' },
  { label: '境外 东京塔', lat: '35.658581', lng: '139.745433' },
]

function clampDeg(v, lim, label) {
  if (v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v))) {
    throw new Error(label + '还没填')
  }
  const n = Number(v)
  if (!isFinite(n)) throw new Error(label + '不是个数字：' + v)
  if (n < -lim || n > lim) throw new Error(label + '要在 -' + lim + ' 到 ' + lim + ' 之间，现在 ' + n)
  return n
}

export function checkLat(v) {
  return clampDeg(v, 90, '纬度')
}
export function checkLng(v) {
  return clampDeg(v, 180, '经度')
}

/**
 * 解析一组经纬度：支持「39.908722, 116.397499」这种十进制，
 * 也支持度分（4 个数）与度分秒（6 个数），带 N/S/E/W 或 北/南/东/西 时按字母定正负。
 * 纬度在前、经度在后；解不出就抛中文错误。
 */
export function parsePair(text) {
  const s = String(text == null ? '' : text).trim()
  if (!s) throw new Error('先写一组经纬度')
  const nums = (s.match(/-?\d+(?:\.\d+)?/g) || []).map(Number)
  if (!nums.length) throw new Error('这一段里没有数字')
  const hasDms = /[°d]/i.test(s) || /['″']/i.test(s) || /[时分秒]/.test(s)
  const south = /[sS南]/.test(s)
  const west = /[wW西]/.test(s)
  let lat
  let lng
  if (nums.length === 2 && !hasDms) {
    lat = nums[0]
    lng = nums[1]
  } else if (nums.length === 4) {
    lat = dms(nums[0], nums[1], 0)
    lng = dms(nums[2], nums[3], 0)
  } else if (nums.length === 6) {
    lat = dms(nums[0], nums[1], nums[2])
    lng = dms(nums[3], nums[4], nums[5])
  } else {
    throw new Error('写了 ' + nums.length + ' 个数字，对不上格式：两个十进制数、四个（度分）或六个（度分秒）')
  }
  if (south || /[nN北]/.test(s)) lat = Math.abs(lat) * (south ? -1 : 1)
  if (west || /[eE东]/.test(s)) lng = Math.abs(lng) * (west ? -1 : 1)
  return { lat: checkLat(lat), lng: checkLng(lng), raw: s }
}

function dms(d, m, sec) {
  return Math.abs(d) + (Math.abs(m) * 60 + Math.abs(sec)) / 3600
}

/* ---------------- 偏移本体 ---------------- */

function transformLat(x, y) {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  r += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3
  r += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3
  r += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3
  return r
}

function transformLng(x, y) {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  r += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3
  r += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3
  r += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3
  return r
}

/** 中国大致范围（含港澳台）；境外各家都不做偏移 */
export function inChina(lat, lng) {
  return lng >= 72.004 && lng <= 137.8347 && lat >= 0.8293 && lat <= 55.8271
}

function offset(lat, lng) {
  let dLat = transformLat(lng - 105, lat - 35)
  let dLng = transformLng(lng - 105, lat - 35)
  const radLat = (lat / 180) * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI)
  dLng = (dLng * 180) / ((A / sqrtMagic) * Math.cos(radLat) * PI)
  return { dLat, dLng }
}

export function wgsToGcj(lat, lng) {
  const a = checkLat(lat)
  const b = checkLng(lng)
  if (!inChina(a, b)) return { lat: a, lng: b, shifted: false }
  const o = offset(a, b)
  return { lat: a + o.dLat, lng: b + o.dLng, shifted: true }
}

/** 定点迭代：拿偏移后的点再算一次偏移，把残差扣掉，两轮就够 */
export function gcjToWgs(lat, lng) {
  const a = checkLat(lat)
  const b = checkLng(lng)
  if (!inChina(a, b)) return { lat: a, lng: b, shifted: false }
  let gLat = a
  let gLng = b
  for (let i = 0; i < 3; i++) {
    const w = wgsToGcj(gLat, gLng)
    gLat += a - w.lat
    gLng += b - w.lng
  }
  return { lat: gLat, lng: gLng, shifted: true }
}

export function gcjToBd(lat, lng) {
  const a = checkLat(lat)
  const b = checkLng(lng)
  const z = Math.sqrt(b * b + a * a) + 0.00002 * Math.sin(a * X_PI)
  const th = Math.atan2(a, b) + 0.000003 * Math.cos(b * X_PI)
  return { lat: z * Math.sin(th) + 0.006, lng: z * Math.cos(th) + 0.0066 }
}

export function bdToGcj(lat, lng) {
  const a = checkLat(lat)
  const b = checkLng(lng)
  const x = b - 0.0066
  const y = a - 0.006
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI)
  const th = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI)
  return { lat: z * Math.sin(th), lng: z * Math.cos(th) }
}

/** 统一入口：from/to 取 wgs84 | gcj02 | bd09 */
export function convert(lat, lng, from, to) {
  if (from === to) return { lat: checkLat(lat), lng: checkLng(lng) }
  const chain = {
    'wgs84>gcj02': wgsToGcj,
    'wgs84>bd09': (a, b) => {
      const g = wgsToGcj(a, b)
      return gcjToBd(g.lat, g.lng)
    },
    'gcj02>wgs84': gcjToWgs,
    'gcj02>bd09': gcjToBd,
    'bd09>gcj02': bdToGcj,
    'bd09>wgs84': (a, b) => {
      const g = bdToGcj(a, b)
      return gcjToWgs(g.lat, g.lng)
    },
  }
  const fn = chain[from + '>' + to]
  if (!fn) throw new Error('不支持的换算方向：' + from + ' → ' + to)
  return fn(lat, lng)
}

/** 三点系全表：一次算出同一个物理位置在三个系统下的写法 */
export function triple(lat, lng, from) {
  const out = {}
  for (const to of ['wgs84', 'gcj02', 'bd09']) out[to] = convert(lat, lng, from, to)
  return out
}

/* ---------------- 距离与方位 ---------------- */

export function toRad(d) {
  return (d * PI) / 180
}

/** 球面两点距离（米），haversine */
export function distance(lat1, lng1, lat2, lng2) {
  const p1 = toRad(checkLat(lat1))
  const p2 = toRad(checkLat(lat2))
  const dp = p2 - p1
  const dl = toRad(checkLng(lng2) - checkLng(lng1))
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 初始方位角：正北为 0，顺时针增大 */
export function bearing(lat1, lng1, lat2, lng2) {
  const p1 = toRad(checkLat(lat1))
  const p2 = toRad(checkLat(lat2))
  const dl = toRad(checkLng(lng2) - checkLng(lng1))
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  return (((Math.atan2(y, x) / PI) * 180) + 360) % 360
}

const DIRS16 = ['北', '北偏东', '东北', '东偏北', '东', '东偏南', '东南', '南偏东', '南', '南偏西', '西南', '西偏南', '西', '西偏北', '西北', '北偏西']

/** 方位角 → 16 方位中文 */
export function dirName(deg) {
  const d = ((Number(deg) % 360) + 360) % 360
  return DIRS16[Math.floor(((d + 11.25) % 360) / 22.5)]
}

/** 偏移量描述：多少米、朝哪个方向 */
export function shiftOf(lat, lng, from, to) {
  const a = convert(lat, lng, from, to)
  const b = convert(lat, lng, from, from)
  const m = distance(b.lat, b.lng, a.lat, a.lng)
  const brg = m < 0.01 ? 0 : bearing(b.lat, b.lng, a.lat, a.lng)
  return { meters: m, bearing: brg, dir: m < 0.01 ? '没动' : dirName(brg) }
}

/* ---------------- 写法 ---------------- */

const D = ['°', "'", '"']

/** 十进制度 → 度分秒文本（秒保留一位小数，进位要保证 60 秒变 1 分） */
export function toDms(v, isLat) {
  const n = Number(v)
  const hemi = isLat ? (n >= 0 ? 'N' : 'S') : n >= 0 ? 'E' : 'W'
  const abs = Math.abs(n)
  let d = Math.floor(abs)
  let m = Math.floor((abs - d) * 60)
  let s = Math.round(((abs - d) * 60 - m) * 60 * 10) / 10
  if (s >= 60) {
    s -= 60
    m += 1
  }
  if (m >= 60) {
    m -= 60
    d += 1
  }
  return d + D[0] + String(m).padStart(2, '0') + D[1] + s.toFixed(1).padStart(4, '0') + D[2] + ' ' + hemi
}

/** 数值保留 6 位小数（约 0.1 米），去掉尾随 0 */
export function fmtDeg(v, digits) {
  const n = Number(v)
  if (!isFinite(n)) return '—'
  return n.toFixed(digits === undefined ? 6 : digits)
}

/** 距离文本：不足 1 公里用米 */
export function fmtDistance(meters) {
  const m = Number(meters)
  if (!isFinite(m)) return '—'
  if (m < 1000) return (Math.round(m * 10) / 10).toFixed(1) + ' 米'
  return (Math.round((m / 1000) * 1000) / 1000).toFixed(3) + ' 公里'
}

/** 精度条：把米数分成四档，界面上按档染色 */
export function accuracyGrade(meters) {
  const m = Number(meters)
  if (!isFinite(m) || m <= 0) return { key: 'unknown', name: '未知', note: '系统没给精度半径，位置只能当参考' }
  if (m <= 20) return { key: 'good', name: '很好', note: '二十米以内：室内靠窗或室外开阔处才有这个水平' }
  if (m <= 80) return { key: 'ok', name: '可用', note: '几十米：走导航够用，找具体门店会偏' }
  if (m <= 500) return { key: 'coarse', name: '粗糙', note: '百米级：多半是基站/Wi-Fi 定位，只到街区' }
  return { key: 'bad', name: '很差', note: '公里级：基本是 IP 或小区基站估的，别用来找路' }
}

/**
 * uni.getLocation 的返回整理成统一形状。
 * 各家 type 只有 gcj02 / wgs84 两种，BD-09 需要我们自己再换算。
 */
export function fromLocation(res, type) {
  const lat = checkLat(res && res.latitude)
  const lng = checkLng(res && res.longitude)
  const sys = type === 'wgs84' ? 'wgs84' : 'gcj02'
  return {
    lat,
    lng,
    sys,
    accuracy: Number(res && res.accuracy) || 0,
    altitude: res && res.altitude != null ? Number(res.altitude) : null,
    speed: res && res.speed != null ? Number(res.speed) : null,
    verticalAccuracy: res && res.verticalAccuracy != null ? Number(res.verticalAccuracy) : null,
    at: Date.now(),
  }
}
