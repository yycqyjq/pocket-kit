/**
 * 单位换算
 * 结构：每个类别一个基准单位，其余单位给出「1 该单位 = factor 个基准单位」
 * 温度不满足线性关系，单独处理
 */

export const UNIT_GROUPS = [
  {
    id: 'length',
    name: '长度',
    base: 'm',
    units: [
      { key: 'mm', name: '毫米', factor: 0.001 },
      { key: 'cm', name: '厘米', factor: 0.01 },
      { key: 'dm', name: '分米', factor: 0.1 },
      { key: 'm', name: '米', factor: 1 },
      { key: 'km', name: '千米', factor: 1000 },
      { key: 'in', name: '英寸', factor: 0.0254 },
      { key: 'ft', name: '英尺', factor: 0.3048 },
      { key: 'yd', name: '码', factor: 0.9144 },
      { key: 'mi', name: '英里', factor: 1609.344 },
      { key: 'nmi', name: '海里', factor: 1852 },
      { key: 'li', name: '里', factor: 500 },
      { key: 'zhang', name: '丈', factor: 3.3333333 },
      { key: 'chi', name: '尺', factor: 0.3333333 },
      { key: 'cun', name: '寸', factor: 0.0333333 },
    ],
  },
  {
    id: 'area',
    name: '面积',
    base: 'm2',
    units: [
      { key: 'mm2', name: '平方毫米', factor: 0.000001 },
      { key: 'cm2', name: '平方厘米', factor: 0.0001 },
      { key: 'm2', name: '平方米', factor: 1 },
      { key: 'km2', name: '平方千米', factor: 1000000 },
      { key: 'ha', name: '公顷', factor: 10000 },
      { key: 'mu', name: '亩', factor: 666.6667 },
      { key: 'ft2', name: '平方英尺', factor: 0.09290304 },
      { key: 'in2', name: '平方英寸', factor: 0.00064516 },
      { key: 'yd2', name: '平方码', factor: 0.83612736 },
      { key: 'ac', name: '英亩', factor: 4046.8564224 },
    ],
  },
  {
    id: 'volume',
    name: '体积',
    base: 'l',
    units: [
      { key: 'ml', name: '毫升', factor: 0.001 },
      { key: 'l', name: '升', factor: 1 },
      { key: 'm3', name: '立方米', factor: 1000 },
      { key: 'cm3', name: '立方厘米', factor: 0.001 },
      { key: 'gal_us', name: '美制加仑', factor: 3.785411784 },
      { key: 'gal_uk', name: '英制加仑', factor: 4.54609 },
      { key: 'qt', name: '夸脱(美)', factor: 0.946352946 },
      { key: 'pt', name: '品脱(美)', factor: 0.473176473 },
      { key: 'floz', name: '液盎司(美)', factor: 0.0295735296 },
      { key: 'cup', name: '杯(美,240ml)', factor: 0.24 },
      { key: 'ft3', name: '立方英尺', factor: 28.316846592 },
      { key: 'in3', name: '立方英寸', factor: 0.016387064 },
    ],
  },
  {
    id: 'mass',
    name: '重量',
    base: 'kg',
    units: [
      { key: 'mg', name: '毫克', factor: 0.000001 },
      { key: 'g', name: '克', factor: 0.001 },
      { key: 'kg', name: '千克', factor: 1 },
      { key: 't', name: '吨', factor: 1000 },
      { key: 'liang', name: '两', factor: 0.05 },
      { key: 'jin', name: '斤', factor: 0.5 },
      { key: 'dan', name: '担', factor: 50 },
      { key: 'lb', name: '磅', factor: 0.45359237 },
      { key: 'oz', name: '盎司', factor: 0.028349523125 },
      { key: 'ct', name: '克拉', factor: 0.0002 },
      { key: 'stone', name: '英石', factor: 6.35029318 },
    ],
  },
  {
    id: 'data',
    name: '数据',
    base: 'b',
    units: [
      { key: 'bit', name: '比特', factor: 1 },
      { key: 'B', name: '字节', factor: 8 },
      { key: 'KB', name: 'KB', factor: 8 * 1024 },
      { key: 'MB', name: 'MB', factor: 8 * 1024 * 1024 },
      { key: 'GB', name: 'GB', factor: 8 * 1024 * 1024 * 1024 },
      { key: 'TB', name: 'TB', factor: 8 * 1024 * 1024 * 1024 * 1024 },
      { key: 'PB', name: 'PB', factor: 8 * Math.pow(1024, 5) },
      { key: 'KiB', name: 'KiB', factor: 8 * 1024 },
      { key: 'MiB', name: 'MiB', factor: 8 * 1024 * 1024 },
      { key: 'GiB', name: 'GiB', factor: 8 * 1024 * 1024 * 1024 },
      { key: 'kB1000', name: 'kB(10³)', factor: 8000 },
      { key: 'MB1000', name: 'MB(10⁶)', factor: 8000000 },
    ],
  },
  {
    id: 'speed',
    name: '速度',
    base: 'mps',
    units: [
      { key: 'mps', name: '米/秒', factor: 1 },
      { key: 'kmh', name: '千米/时', factor: 0.277777778 },
      { key: 'mph', name: '英里/时', factor: 0.44704 },
      { key: 'kn', name: '节', factor: 0.514444444 },
      { key: 'ftps', name: '英尺/秒', factor: 0.3048 },
      { key: 'mach', name: '马赫(约)', factor: 340.3 },
    ],
  },
  {
    id: 'time',
    name: '时间',
    base: 's',
    units: [
      { key: 'ms', name: '毫秒', factor: 0.001 },
      { key: 's', name: '秒', factor: 1 },
      { key: 'min', name: '分钟', factor: 60 },
      { key: 'h', name: '小时', factor: 3600 },
      { key: 'd', name: '天', factor: 86400 },
      { key: 'wk', name: '周', factor: 604800 },
      { key: 'mo', name: '月(30天)', factor: 2592000 },
      { key: 'yr', name: '年(365天)', factor: 31536000 },
    ],
  },
  {
    id: 'pressure',
    name: '压力',
    base: 'pa',
    units: [
      { key: 'pa', name: '帕斯卡', factor: 1 },
      { key: 'kpa', name: '千帕', factor: 1000 },
      { key: 'mpa', name: '兆帕', factor: 1000000 },
      { key: 'bar', name: '巴', factor: 100000 },
      { key: 'mbar', name: '毫巴', factor: 100 },
      { key: 'atm', name: '标准大气压', factor: 101325 },
      { key: 'mmhg', name: '毫米汞柱', factor: 133.322387415 },
      { key: 'psi', name: '磅/平方英寸', factor: 6894.757293168 },
      { key: 'kgfcm2', name: '公斤力/平方厘米', factor: 98066.5 },
    ],
  },
  {
    id: 'energy',
    name: '能量',
    base: 'j',
    units: [
      { key: 'j', name: '焦耳', factor: 1 },
      { key: 'kj', name: '千焦', factor: 1000 },
      { key: 'cal', name: '卡', factor: 4.184 },
      { key: 'kcal', name: '千卡(大卡)', factor: 4184 },
      { key: 'wh', name: '瓦时', factor: 3600 },
      { key: 'kwh', name: '千瓦时(度)', factor: 3600000 },
      { key: 'btu', name: '英热单位', factor: 1055.05585262 },
      { key: 'ev', name: '电子伏', factor: 1.602176634e-19 },
    ],
  },
  {
    id: 'angle',
    name: '角度',
    base: 'deg',
    units: [
      { key: 'deg', name: '度', factor: 1 },
      { key: 'rad', name: '弧度', factor: 57.29577951308232 },
      { key: 'grad', name: '百分度', factor: 0.9 },
      { key: 'turn', name: '周', factor: 360 },
      { key: 'arcmin', name: '角分', factor: 1 / 60 },
      { key: 'arcsec', name: '角秒', factor: 1 / 3600 },
    ],
  },
  {
    id: 'temp',
    name: '温度',
    base: 'c',
    special: true,
    units: [
      { key: 'c', name: '摄氏度' },
      { key: 'f', name: '华氏度' },
      { key: 'k', name: '开尔文' },
      { key: 'r', name: '兰氏度' },
    ],
  },
]

/** 温度换算：先转摄氏度再转目标 */
function tempToC(v, from) {
  switch (from) {
    case 'c':
      return v
    case 'f':
      return (v - 32) / 1.8
    case 'k':
      return v - 273.15
    case 'r':
      return (v - 491.67) / 1.8
    default:
      return v
  }
}

function cToTemp(c, to) {
  switch (to) {
    case 'c':
      return c
    case 'f':
      return c * 1.8 + 32
    case 'k':
      return c + 273.15
    case 'r':
      return (c + 273.15) * 1.8
    default:
      return c
  }
}

export function getGroup(id) {
  return UNIT_GROUPS.find((g) => g.id === id) || UNIT_GROUPS[0]
}

export function getUnit(group, key) {
  return group.units.find((u) => u.key === key) || group.units[0]
}

/** 核心换算，返回数值 */
export function convertUnit(value, groupId, fromKey, toKey) {
  const g = getGroup(groupId)
  const v = Number(value)
  if (!isFinite(v)) throw new Error('请输入有效数字')
  if (g.special) {
    if (fromKey === toKey) return v
    return cToTemp(tempToC(v, fromKey), toKey)
  }
  const f = getUnit(g, fromKey)
  const t = getUnit(g, toKey)
  return (v * f.factor) / t.factor
}

/** 一次性换算到该类别下所有单位 */
export function convertToAll(value, groupId, fromKey) {
  const g = getGroup(groupId)
  const v = Number(value)
  if (!isFinite(v)) return []
  return g.units.map((u) => ({
    key: u.key,
    name: u.name,
    value: convertUnit(v, groupId, fromKey, u.key),
  }))
}

/** 数字格式化：保留有效位但去掉多余 0 */
export function smartFormat(n, digits) {
  if (!isFinite(n)) return '-'
  const d = digits === undefined ? 6 : digits
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1e15 || abs < 1e-6) return n.toExponential(4)
  let s = n.toFixed(Math.max(0, Math.min(12, d)))
  if (s.indexOf('.') > -1) s = s.replace(/0+$/, '').replace(/\.$/, '')
  return s
}
