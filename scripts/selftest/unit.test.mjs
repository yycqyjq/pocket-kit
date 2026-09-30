/** 单位换算的自查。
 *  对照有三类：
 *  一是「由定义就该精确」的关系——1 英里 = 1760 码、1 公顷 = 15 亩、1 美制加仑 = 231 立方英寸、
 *      1 节 = 1 海里/时，这些不依赖本模块的任何实现，写错因子当场红；
 *  二是界面契约——ToolUnit 一律用 smartFormat(x, 6) 出数，所以关键的市制/亩/加仑关系直接断言
 *      那六个字符宽的字符串，因子退回截断小数时「10.000001」这种就会被抓到；
 *  三是表结构本身——11 个类别 / 100 个单位 / 每类别恰有一个因子为 1 的基准单位 / base 必须在单位表里。
 *  浮点余数（1 英尺 → 英寸给 12.000000000000002、1 克 → 毫克给 1000.0000000000001）按现状钉住，
 *  因为因子 0.3048 / 0.0254 / 0.001 都是定义上的精确值，误差来自二进制而不是表。 */
import { useUtils } from './harness.mjs'
const U = await useUtils('unit')

let ok = 0
let fail = 0
function is(a, b, m) {
  if (a === b) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b))
  }
}
function ok_(cond, m) {
  is(!!cond, true, m)
}
function close(a, b, eps, m) {
  if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + a + ' want ' + b + ' ±' + eps)
  }
}
/** 换算并拦住报错：断言的是数值 */
function c(v, g, a, b) {
  return U.convertUnit(v, g, a, b)
}
/** 换算并按界面那一档出字符串 */
function fmt(v, g, a, b) {
  return U.smartFormat(U.convertUnit(v, g, a, b), 6)
}
function throwsWith(args, re, m) {
  try {
    U.convertUnit.apply(null, args)
    fail++
    console.log('FAIL ' + m + ': 应该报错却没报错')
  } catch (e) {
    const msg = e && e.message ? e.message : String(e)
    if (!/[\u4e00-\u9fa5]/.test(msg)) {
      fail++
      console.log('FAIL ' + m + ': 报错不是中文 → ' + msg)
    } else if (re && !re.test(msg)) {
      fail++
      console.log('FAIL ' + m + ': 报错文字不对 → ' + msg)
    } else ok++
  }
}

const G = U.UNIT_GROUPS

/* ---------- 表结构：类别、单位、基准单位 ---------- */
{
  is(G.length, 11, '一共 11 个类别')
  is(G.reduce((n, g) => n + g.units.length, 0), 100, '一共 100 个单位')
  is(G.map((g) => g.id).join(','), 'length,area,volume,mass,data,speed,time,pressure,energy,angle,temp', '类别 id 与顺序')
  is(G.filter((g) => g.special).map((g) => g.id).join(','), 'temp', '只有温度走非线性分支')
  for (const g of G) {
    const keys = g.units.map((u) => u.key)
    is(keys.filter((k, i) => keys.indexOf(k) === i).length, keys.length, g.id + ' 的单位键不重复')
    ok_(g.units.every((u) => typeof u.name === 'string' && u.name.length > 0), g.id + ' 每个单位都有中文名')
    is(keys.indexOf(g.base) >= 0, true, g.id + ' 的 base（' + g.base + '）必须真的在单位表里')
    if (g.special) {
      is(g.units.every((u) => u.factor === undefined), true, g.id + ' 温度单位不带因子（非线性）')
    } else {
      is(g.units.filter((u) => u.factor === 1).length, 1, g.id + ' 恰好一个因子为 1 的基准单位')
      is(g.units.filter((u) => u.factor === 1).map((u) => u.key).join(''), g.base, g.id + ' 因子为 1 的那个就是 base')
      ok_(g.units.every((u) => Number.isFinite(u.factor) && u.factor > 0), g.id + ' 因子全是有限正数')
    }
  }
  is(G.map((g) => g.units.length).join(','), '14,10,12,11,12,6,8,9,8,6,4', '各类别单位数')
}

/* ---------- 长度：定义级对撞 ---------- */
{
  is(c(1, 'length', 'km', 'm'), 1000, '1 千米 = 1000 米')
  is(c(1, 'length', 'm', 'cm'), 100, '1 米 = 100 厘米')
  is(c(1, 'length', 'm', 'mm'), 1000, '1 米 = 1000 毫米')
  is(c(1, 'length', 'cm', 'mm'), 10, '1 厘米 = 10 毫米')
  is(c(1, 'length', 'mi', 'yd'), 1760, '1 英里 = 1760 码（定义）')
  is(c(1, 'length', 'mi', 'ft'), 5280, '1 英里 = 5280 英尺（定义）')
  is(c(1, 'length', 'yd', 'ft'), 3, '1 码 = 3 英尺')
  is(c(1, 'length', 'nmi', 'm'), 1852, '1 海里 = 1852 米（定义）')
  is(c(1, 'length', 'li', 'm'), 500, '1 里 = 500 米')
  is(c(1, 'length', 'li', 'cun'), 15000, '1 里 = 150 丈 = 1500 尺 = 15000 寸，市制链必须整条闭合')
  is(c(1, 'length', 'zhang', 'cun'), 100, '1 丈 = 100 寸')
  is(fmt(1, 'length', 'li', 'zhang'), '150', '界面上 1 里 = 150 丈（截断因子会印成 150.000002）')
  is(fmt(1, 'length', 'zhang', 'chi'), '10', '界面上 1 丈 = 10 尺（截断因子会印成 10.000001）')
  is(fmt(1, 'length', 'chi', 'cun'), '10', '界面上 1 尺 = 10 寸（截断因子会印成 10.000009）')
  close(c(1, 'length', 'zhang', 'm'), 10 / 3, 1e-12, '1 丈 = 10/3 米')
  close(c(1, 'length', 'chi', 'm'), 1 / 3, 1e-12, '1 尺 = 1/3 米')
  close(c(1, 'length', 'cun', 'm'), 1 / 30, 1e-12, '1 寸 = 1/30 米')
  is(fmt(1, 'length', 'zhang', 'm'), '3.333333', '1 丈 → 米的显示档')
  // 英寸/英尺/码的因子按定义就是精确小数，剩下的 2e-16 是二进制浮点的余数，不是表的错
  close(c(1, 'length', 'ft', 'in'), 12, 1e-12, '1 英尺 = 12 英寸')
  is(fmt(1, 'length', 'ft', 'in'), '12', '界面上这条余数被 6 位档吃掉，仍印 12')
  close(c(1, 'length', 'in', 'cm'), 2.54, 1e-12, '1 英寸 = 2.54 厘米（国际定义）')
  is(c(1, 'length', 'ft', 'm'), 0.3048, '1 英尺 = 0.3048 米（国际定义）')
  is(c(1, 'length', 'yd', 'm'), 0.9144, '1 码 = 0.9144 米（国际定义）')
  is(c(1, 'length', 'mi', 'km'), 1.609344, '1 英里 = 1.609344 千米（国际定义）')
}

/* ---------- 面积 / 体积 ---------- */
{
  is(c(1, 'area', 'km2', 'm2'), 1000000, '1 平方千米 = 100 万平方米')
  is(c(1, 'area', 'ha', 'm2'), 10000, '1 公顷 = 1 万平方米（定义）')
  is(c(1, 'area', 'm2', 'cm2'), 10000, '1 平方米 = 1 万平方厘米')
  is(c(1, 'area', 'ft2', 'in2'), 144, '1 平方英尺 = 144 平方英寸')
  is(c(1, 'area', 'yd2', 'ft2'), 9, '1 平方码 = 9 平方英尺')
  is(c(1, 'area', 'ac', 'yd2'), 4840, '1 英亩 = 4840 平方码（定义）')
  is(c(1, 'area', 'ac', 'm2'), 4046.8564224, '1 英亩 = 4046.8564224 平方米（定义）')
  is(fmt(1, 'area', 'ha', 'mu'), '15', '界面上 1 公顷 = 15 亩（截断因子会印成 14.999999）')
  close(c(1, 'area', 'mu', 'm2'), 2000 / 3, 1e-9, '1 亩 = 2000/3 平方米')
  is(fmt(1, 'area', 'mu', 'm2'), '666.666667', '1 亩 → 平方米 的显示档')
  is(c(1, 'volume', 'm3', 'l'), 1000, '1 立方米 = 1000 升')
  is(c(1, 'volume', 'l', 'cm3'), 1000, '1 升 = 1000 立方厘米（定义）')
  is(c(1, 'volume', 'l', 'ml'), 1000, '1 升 = 1000 毫升')
  is(c(1, 'volume', 'ft3', 'in3'), 1728, '1 立方英尺 = 1728 立方英寸')
  is(c(1, 'volume', 'gal_us', 'in3'), 231, '1 美制加仑 = 231 立方英寸（美国法定定义）')
  is(c(1, 'volume', 'gal_us', 'l'), 3.785411784, '1 美制加仑 = 3.785411784 升（定义）')
  is(c(1, 'volume', 'qt', 'pt'), 2, '1 夸脱 = 2 品脱')
  is(c(1, 'volume', 'gal_us', 'qt'), 4, '1 加仑 = 4 夸脱')
  is(c(1, 'volume', 'gal_us', 'floz'), 128, '1 加仑 = 128 液盎司（截断因子会给 127.9999998）')
  is(c(1, 'volume', 'qt', 'floz'), 32, '1 夸脱 = 32 液盎司')
  is(c(1, 'volume', 'cup', 'ml'), 240, '本工具的「杯」按美制 240 毫升计')
  is(c(1, 'volume', 'gal_uk', 'l'), 4.54609, '1 英制加仑 = 4.54609 升（定义）')
}

/* ---------- 重量 ---------- */
{
  is(c(1, 'mass', 't', 'kg'), 1000, '1 吨 = 1000 千克')
  is(c(1, 'mass', 'kg', 'g'), 1000, '1 千克 = 1000 克')
  is(c(1, 'mass', 'jin', 'kg'), 0.5, '1 斤 = 0.5 千克')
  is(c(1, 'mass', 'jin', 'liang'), 10, '1 斤 = 10 两')
  is(c(1, 'mass', 'dan', 'jin'), 100, '1 担 = 100 斤')
  is(c(1, 'mass', 'dan', 'kg'), 50, '1 担 = 50 千克')
  is(c(1, 'mass', 'g', 'ct'), 5, '1 克 = 5 克拉（定义）')
  is(c(1, 'mass', 'lb', 'kg'), 0.45359237, '1 磅 = 0.45359237 千克（国际磅定义）')
  is(c(1, 'mass', 'lb', 'oz'), 16, '1 磅 = 16 盎司')
  is(c(1, 'mass', 'oz', 'g'), 28.349523125, '1 盎司 = 28.349523125 克（= 磅/16）')
  is(c(1, 'mass', 'stone', 'lb'), 14, '1 英石 = 14 磅')
  close(c(1, 'mass', 'g', 'mg'), 1000, 1e-9, '1 克 = 1000 毫克')
  is(fmt(1, 'mass', 'g', 'mg'), '1000', '界面档吃掉 0.001/0.000001 的二进制余数（原值 1000.0000000000001）')
  is(c(1, 'mass', 'liang', 'g'), 50, '1 两 = 50 克')
}

/* ---------- 速度 / 时间 / 压力 / 能量 / 角度 ---------- */
{
  close(c(1, 'speed', 'kmh', 'mps'), 1 / 3.6, 1e-15, '1 千米/时 = 1/3.6 米/秒')
  close(c(1, 'speed', 'mps', 'kmh'), 3.6, 1e-9, '1 米/秒 = 3.6 千米/时')
  is(fmt(1, 'speed', 'mps', 'kmh'), '3.6', '界面上 1 米/秒 = 3.6 千米/时')
  close(c(1, 'speed', 'kn', 'mps'), 1852 / 3600, 1e-15, '1 节 = 1 海里/时 = 1852/3600 米/秒')
  close(c(1000, 'speed', 'kn', 'mps'), 514.4444444444445, 1e-9, '1000 节 → 米/秒，截断因子在这里会漂')
  is(c(1, 'speed', 'mph', 'mps'), 0.44704, '1 英里/时 = 0.44704 米/秒（定义）')
  is(c(1, 'speed', 'ftps', 'mps'), 0.3048, '1 英尺/秒 = 0.3048 米/秒')
  is(c(1, 'speed', 'kn', 'kmh'), 1.852, '1 节 = 1.852 千米/时')
  is(c(1, 'time', 'min', 's'), 60, '1 分钟 = 60 秒')
  is(c(1, 'time', 'h', 'min'), 60, '1 小时 = 60 分钟')
  is(c(1, 'time', 'd', 'h'), 24, '1 天 = 24 小时')
  is(c(1, 'time', 'wk', 'd'), 7, '1 周 = 7 天')
  is(c(1, 'time', 'mo', 'd'), 30, '本工具的「月」按 30 天')
  is(c(1, 'time', 'yr', 'd'), 365, '本工具的「年」按 365 天')
  is(c(1, 'time', 'h', 's'), 3600, '1 小时 = 3600 秒')
  is(c(1, 'pressure', 'kpa', 'pa'), 1000, '1 千帕 = 1000 帕')
  is(c(1, 'pressure', 'mpa', 'kpa'), 1000, '1 兆帕 = 1000 千帕')
  is(c(1, 'pressure', 'bar', 'pa'), 100000, '1 巴 = 10 万帕（定义）')
  is(c(1, 'pressure', 'mbar', 'pa'), 100, '1 毫巴 = 100 帕')
  is(c(1, 'pressure', 'atm', 'pa'), 101325, '1 标准大气压 = 101325 帕（定义）')
  is(c(1, 'pressure', 'kgfcm2', 'pa'), 98066.5, '1 公斤力/平方厘米 = 98066.5 帕（定义）')
  is(c(1, 'pressure', 'psi', 'pa'), 6894.757293168, '1 磅/平方英寸 = 6894.757293168 帕（定义）')
  close(c(1, 'pressure', 'psi', 'kpa'), 6.894757293168, 1e-12, '同一条除以 1000 有二进制余数，断言只看定义那一档')
  is(c(1, 'pressure', 'atm', 'mmhg'), 760, '1 标准大气压 = 760 毫米汞柱（定义闭合）')
  is(c(1, 'pressure', 'mmhg', 'pa'), 101325 / 760, '毫米汞柱的因子就是大气压除以 760')
  is(fmt(1, 'pressure', 'atm', 'mmhg'), '760', '界面上 1 大气压 印整 760；换成水银 ρgh 那档 133.322387415 就印 759.999892')
  is(c(1, 'energy', 'kj', 'j'), 1000, '1 千焦 = 1000 焦')
  is(c(1, 'energy', 'kcal', 'cal'), 1000, '1 千卡 = 1000 卡')
  is(c(1, 'energy', 'cal', 'j'), 4.184, '1 卡（热化学）= 4.184 焦（定义）')
  is(c(1, 'energy', 'wh', 'j'), 3600, '1 瓦时 = 3600 焦（定义）')
  is(c(1, 'energy', 'kwh', 'kj'), 3600, '1 度 = 3600 千焦')
  is(c(1, 'energy', 'btu', 'j'), 1055.05585262, '1 英热单位 = 1055.05585262 焦（ISO）')
  close(c(1, 'energy', 'j', 'ev'), 1 / 1.602176634e-19, 1e10, '1 焦 = 6.2415e18 电子伏')
  is(c(1, 'angle', 'turn', 'deg'), 360, '1 周 = 360 度')
  is(c(1, 'angle', 'turn', 'grad'), 400, '1 周 = 400 百分度')
  is(c(1, 'angle', 'deg', 'arcmin'), 60, '1 度 = 60 角分')
  is(c(1, 'angle', 'deg', 'arcsec'), 3600, '1 度 = 3600 角秒')
  is(c(1, 'angle', 'rad', 'deg'), 180 / Math.PI, '1 弧度 = 180/π 度')
  close(c(1, 'angle', 'turn', 'rad'), 2 * Math.PI, 1e-12, '1 周 = 2π 弧度')
}

/* ---------- 数据：全 2 的幂，逐位精确 ---------- */
{
  is(c(1, 'data', 'B', 'bit'), 8, '1 字节 = 8 比特')
  is(c(1, 'data', 'KB', 'B'), 1024, '1 KB = 1024 字节（本表大写走二进制口径）')
  is(c(1, 'data', 'KiB', 'B'), 1024, '1 KiB = 1024 字节')
  is(c(1, 'data', 'KB', 'KiB'), 1, 'KB 与 KiB 在这张表里同值，是有意按日常口径写的')
  is(c(1, 'data', 'TB', 'GB'), 1024, '1 TB = 1024 GB')
  is(c(1, 'data', 'MB1000', 'kB1000'), 1000, '十进制那一档 1 MB(10⁶) = 1000 kB(10³)')
  is(c(1, 'data', 'MB1000', 'B'), 1000000, '1 MB(10⁶) = 100 万字节')
  is(c(1, 'data', 'GB', 'B'), Math.pow(1024, 3), '1 GB = 1073741824 字节，一位不差')
  is(c(1, 'data', 'PB', 'bit'), 8 * Math.pow(1024, 5), '1 PB = 8×1024^5 比特 = 2^53')
  is(c(9007199254740992, 'data', 'bit', 'PB'), 1, '反向也精确（全是 2 的幂，二进制浮点不产生余数）')
  is(c(1.5, 'data', 'MiB', 'KiB'), 1536, '非整数入参也逐位准')
}

/* ---------- 温度：非线性分支 ---------- */
{
  is(c(0, 'temp', 'c', 'f'), 32, '0 ℃ = 32 ℉（冰点）')
  is(c(100, 'temp', 'c', 'f'), 212, '100 ℃ = 212 ℉（沸点）')
  is(c(-40, 'temp', 'c', 'f'), -40, '-40 是摄氏华氏的交点，正反都得是自己')
  is(c(-40, 'temp', 'f', 'c'), -40, '同上，反向')
  close(c(37, 'temp', 'c', 'f'), 98.6, 1e-9, '37 ℃ = 98.6 ℉')
  is(c(25, 'temp', 'c', 'f'), 77, '25 ℃ = 77 ℉')
  is(c(0, 'temp', 'k', 'c'), -273.15, '0 K = -273.15 ℃（绝对零度）')
  is(c(-273.15, 'temp', 'c', 'k'), 0, '反向')
  is(c(273.15, 'temp', 'k', 'c'), 0, '273.15 K = 0 ℃')
  is(c(0, 'temp', 'r', 'k'), 0, '0 °R = 0 K，兰氏度的零点和开尔文重合')
  close(c(0, 'temp', 'r', 'f'), -459.67, 1e-9, '绝对零度 = -459.67 ℉')
  is(c(491.67, 'temp', 'r', 'f'), 32, '491.67 °R = 32 °F（冰点）')
  close(c(1, 'temp', 'c', 'r'), 493.47, 1e-9, '1 ℃ = 493.47 °R')
  for (const k of ['c', 'f', 'k', 'r']) is(c(123.4, 'temp', k, k), 123.4, '温度同单位往返是本身（' + k + '）')
  close(c(c(36.6, 'temp', 'c', 'f'), 'temp', 'f', 'c'), 36.6, 1e-9, '℃→℉→℃ 回得来')
  close(c(c(300, 'temp', 'k', 'r'), 'temp', 'r', 'k'), 300, 1e-9, 'K→°R→K 回得来')
  throwsWith(['1', 'temp', 'x', 'f'], /没有这个单位/, '温度写了不存在的单位：报错而不是当成摄氏度')
}

/* ---------- 严格查表：不许换个类别照样算 ---------- */
{
  throwsWith([1, 'masss', 'kg', 'g'], /没有这个单位类别/, '类别名写错')
  throwsWith([1, 'length', 'lightyear', 'm'], /没有这个单位/, '长度类别里没有光年，退回首项等于把 1 光年当 1 毫米')
  throwsWith([1, 'length', 'm', 'furlong'], /没有这个单位/, '目标单位不存在')
  throwsWith([1, 'area', 'm', 'cm2'], /没有这个单位/, '把长度的键写到面积类别里')
  throwsWith([1, 'data', 'GB', 'Gbps'], /没有这个单位/, '带宽不是容量')
  throwsWith([1, 'nope', 'bit', 'B'], /没有这个单位类别/, '类别完全不存在')
  // 渲染用的宽松查表要保持兜底（界面拉框永远有东西可画），但只有它能兜
  is(U.getGroup('nope').id, 'length', 'getGroup 是渲染兜底，不参与算术')
  is(U.getGroup('angle').name, '角度', 'getGroup 命中时给真的')
}

/* ---------- 入参拦不住的那些 ---------- */
{
  throwsWith(['abc', 'length', 'm', 'cm'], /有效数字/, '非数字')
  throwsWith(['1e999', 'length', 'm', 'cm'], /有效数字/, '溢出成 Infinity')
  throwsWith([NaN, 'length', 'm', 'cm'], /有效数字/, 'NaN')
  throwsWith([Infinity, 'length', 'm', 'cm'], /有效数字/, 'Infinity')
  is(c('2', 'length', 'm', 'cm'), c(2, 'length', 'm', 'cm'), '字符串数字与数字入参等价')
  is(c('25', 'temp', 'c', 'f'), 77, '温度也一样')
  is(c('', 'length', 'm', 'cm'), 0, '空串按 JS 语义是 0，界面另有挡住（value === “” 时不叫到这里）')
  is(c(0, 'length', 'km', 'm'), 0, '0 换算还是 0')
  is(c(-1, 'length', 'km', 'm'), -1000, '负数照常')
  is(c(0.5, 'length', 'km', 'm'), 500, '小数照常')
}

/* ---------- convertToAll：界面那张「该类别全部单位」 ---------- */
{
  const all = U.convertToAll(1, 'length', 'zhang')
  is(all.length, 14, '长度给全 14 行')
  is(all.map((r) => r.key).join(','), U.getGroup('length').units.map((u) => u.key).join(','), '行序跟单位表一致')
  ok_(all.every((r) => r.key && r.name && typeof r.value === 'number'), '每行都有 key/name/数值')
  is(all.filter((r) => r.key === 'zhang')[0].value, 1, '自己那行就是入参')
  is(all.filter((r) => r.key === 'chi')[0].value, c(1, 'length', 'zhang', 'chi'), '全表与逐个换算给同一个数')
  is(all.filter((r) => r.key === 'cun')[0].value, 100, '1 丈 = 100 寸')
  is(U.convertToAll(1, 'temp', 'c').length, 4, '温度也有全表，走非线性分支')
  is(U.convertToAll(100, 'temp', 'c').filter((r) => r.key === 'f')[0].value, 212, '温度全表里的华氏')
  is(JSON.stringify(U.convertToAll('abc', 'length', 'm')), '[]', '非法数字给空表，界面据此不画行')
  is(U.convertToAll('', 'length', 'm').length, 14, '空串按 0 出一整表（界面自己挡住空输入）')
  throwsWith([1, 'nope', 'm', 'm'], /没有这个单位类别/, '全表也不许换个类别画出来')
  try {
    U.convertToAll(1, 'length', 'nope')
    fail++
    console.log('FAIL 全表遇到不存在的源单位应该报错')
  } catch (e) {
    ok_(/类别里没有这个单位/.test(e.message), '全表遇到不存在的源单位：' + e.message)
  }
  const again = U.convertToAll(1, 'length', 'zhang')
  is(JSON.stringify(again), JSON.stringify(all), '重复调用结果一样（纯函数，没写表）')
  is(G.length, 11, '算过一轮之后类别数没变')
  is(U.getGroup('length').units.filter((u) => u.key === 'zhang')[0].factor, 10 / 3, '单位表的因子没被写坏')
}

/* ---------- smartFormat：界面上那串字符 ---------- */
{
  const f = U.smartFormat
  is(f(0, 6), '0', '0 就是 0，不是一串小数点')
  is(f(-0, 6), '0', '负零也印 0')
  is(f(NaN, 6), '-', 'NaN')
  is(f(Infinity, 6), '-', 'Infinity')
  is(f(-Infinity, 6), '-', '负 Infinity')
  is(f(1 / 3, 6), '0.333333', '六位档')
  is(f(2 / 3, 6), '0.666667', '该进位的进位')
  is(f(100, 6), '100', '整数不带小数点')
  is(f(1.5, 6), '1.5', '尾零去掉')
  is(f(1234567.8, 6), '1234567.8', '大数照旧定点')
  is(f(0.000001, 6), '0.000001', '1e-6 刚好在定点这一侧')
  is(f(5e-7, 6), '5.0000e-7', '再小一位就换科学计数')
  is(f(-5e-7, 6), '-5.0000e-7', '负数同样')
  is(f(1e15, 6), '1.0000e+15', '1e15 起换科学计数')
  is(f(999999999900000, 6), '999999999900000', '差一点到界还是定点')
  is(f(-1e16, 6), '-1.0000e+16', '负的大数')
  is(f(1e21, 6), '1.0000e+21', '极大')
  is(f(1 / 3), '0.333333', '第二个参数不传就是 6 位')
  is(f(0.6666666, 0), '1', 'digits=0 走整数档')
  is(f(1 / 7, 20), '0.142857142857', 'digits 超过 12 被夹到 12')
  is(f(1 / 7, -3), '0', 'digits 为负被夹到 0')
  is(f(999999.9999995, 6), '999999.999999', 'toFixed 的进位边界按现状钉住')
  ok_(!f(1 / 3, 6).endsWith('.'), '不会留一个孤零零的小数点')
  ok_(!f(5, 2).includes('.'), '整数配小数档也不留尾点（5.00 → 5）')
  is(f(c(1, 'length', 'cun', 'km'), 6), '0.000033', '小值走定点')
  is(f(c(1, 'length', 'cun', 'km'), 3), '0', '三位档把它压成 0——界面上用的是 6 位档')
}

console.log('== unit pass=' + ok + '/' + (ok + fail))
if (fail) process.exit(1)
