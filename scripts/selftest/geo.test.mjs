/**
 * geo.js 自查断言（直接测 src/utils/geo.js 本体）
 * ------------------------------------------------------------
 * 坐标系偏移是「公开算法 + 私有参数」，没有第三方标准答案可抄，所以这里的判据是三条：
 *   1) 边界：境外必须为零偏移，境内必须落在几百米这个公认量级；
 *   2) 往返：正变换着算回去要能在 1e-7 度（约 0.01 米）以内闭合，反向定点法才可信；
 *   3) 几何常识：一度经度在赤道上约 111.19 公里、北京到上海约一千公里、
 *      正东方位角是 90°——这些是不依赖本模块实现的独立事实。
 * 距离/方位/度分秒/解析这些纯函数部分另有向量断言。
 */
import { useUtils } from './harness.mjs'

const G = await useUtils('geo')

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
function throws(fn, m) {
  try {
    fn()
    fail++
    console.log('FAIL ' + m + ': should throw')
  } catch (e) {
    if (/[一-龥]/.test(String(e && e.message))) ok++
    else {
      fail++
      console.log('FAIL ' + m + ': 报错不是中文 ' + e.message)
    }
  }
}
function dist(a, b) {
  return G.distance(a.lat, a.lng, b.lat, b.lng)
}

/* ---------- 0. 导出面 ---------- */
for (const k of [
  'COORD_SYS', 'CONVERT_PATHS', 'GEO_SAMPLES', 'checkLat', 'checkLng', 'parsePair',
  'inChina', 'wgsToGcj', 'gcjToWgs', 'gcjToBd', 'bdToGcj', 'convert', 'triple',
  'toRad', 'distance', 'bearing', 'dirName', 'shiftOf', 'toDms', 'fmtDeg',
  'fmtDistance', 'accuracyGrade', 'fromLocation',
]) {
  is(G[k] !== undefined, true, '导出 ' + k)
}
is(G.COORD_SYS.length, 3, '三个坐标系')
is(G.COORD_SYS.map((c) => c.key).join('/'), 'wgs84/gcj02/bd09', '坐标系 key 顺序')
is(G.CONVERT_PATHS.length, 6, '换算方向 3×2 = 6 条')
is(G.GEO_SAMPLES.length >= 4, true, '速查样例够用')

/* ---------- 1. 数值边界 ---------- */
is(G.checkLat(0), 0, '纬度 0 合法')
is(G.checkLng(180), 180, '经度 180 合法')
throws(() => G.checkLat(90.1), '纬度越界')
throws(() => G.checkLng(-180.1), '经度越界')
throws(() => G.checkLat('abc'), '纬度不是数字')
throws(() => G.checkLng(''), '经度是空')

/* ---------- 2. 解析写法 ---------- */
{
  const a = G.parsePair('39.908722, 116.397499')
  near(a.lat, 39.908722, 1e-9, '十逗号写法 纬度')
  near(a.lng, 116.397499, 1e-9, '十逗号写法 经度')
  const b = G.parsePair('39.908722 116.397499')
  is(b.lat + '|' + b.lng, a.lat + '|' + a.lng, '空格分隔与逗号等价')
  const c = G.parsePair("39°54'31.4\"N, 116°23'51.0\"E")
  near(c.lat, 39.9087222, 1e-6, '度分秒 纬度')
  near(c.lng, 116.3975, 1e-6, '度分秒 经度')
  const d = G.parsePair('33.86 S, 151.21 E')
  near(d.lat, -33.86, 1e-9, '南纬要变负')
  near(d.lng, 151.21, 1e-9, '东经为正')
  const e2 = G.parsePair('51.5 N, 0.13 W')
  near(e2.lng, -0.13, 1e-9, '西经要变负')
  const f = G.parsePair('北纬 39.9，东经 116.4')
  near(f.lat, 39.9, 1e-9, '中文方位词 纬度')
  near(f.lng, 116.4, 1e-9, '中文方位词 经度')
  const g = G.parsePair('39 54 31.4, 116 23 51')
  near(g.lat, 39.9087222, 1e-6, '六个裸数字按度分秒')
  near(g.lng, 116.3975, 1e-6, '六个裸数字后半是经度')
  const h = G.parsePair('39 54, 116 23')
  near(h.lat, 39.9, 1e-9, '四个数字按度分 纬度')
  near(h.lng, 116.3833333, 1e-6, '四个数字按度分 经度')
  throws(() => G.parsePair(''), '空串')
  throws(() => G.parsePair('这里没有坐标'), '没有数字')
  throws(() => G.parsePair('39.9'), '只有一个数')
  throws(() => G.parsePair('1 2 3'), '三个数对不上格式')
  throws(() => G.parsePair('91, 10'), '解析完仍然越界')
}

/* ---------- 3. 中国范围与零偏移 ---------- */
is(G.inChina(39.9, 116.4), true, '北京在境内')
is(G.inChina(22.3, 114.2), true, '深圳在境内')
is(G.inChina(25.03, 121.57), true, '台北在境内')
is(G.inChina(35.66, 139.74), false, '东京在境外')
is(G.inChina(51.5, -0.13), false, '伦敦在境外')
is(G.inChina(-33.86, 151.21), false, '悉尼在境外')
{
  const t = G.wgsToGcj(35.658581, 139.745433)
  is(t.shifted, false, '境外标记为未偏移')
  is(t.lat, 35.658581, '境外纬度原样')
  is(t.lng, 139.745433, '境外经度原样')
  is(dist({ lat: 35.658581, lng: 139.745433 }, t), 0, '境外位移为零')
  const bj = G.wgsToGcj(39.908722, 116.397499)
  is(bj.shifted, true, '境内标记为已偏移')
  is(G.distance(39.908722, 116.397499, bj.lat, bj.lng) > 0, true, '境内确实动了')
}

/* ---------- 4. 偏移量级（公认几百米）与方向自洽 ---------- */
{
  const pts = [
    [39.908722, 116.397499],
    [31.239703, 121.490316],
    [23.106428, 113.324474],
    [29.657892, 91.117299],
    [45.750999, 126.64167],
    [22.3193, 114.1694],
  ]
  for (const [la, ln] of pts) {
    const m = dist({ lat: la, lng: ln }, G.wgsToGcj(la, ln))
    inRange(m, 50, 1200, 'WGS→GCJ 偏移量级 ' + la + ',' + ln)
    const b = G.gcjToBd(la, ln)
    inRange(dist({ lat: la, lng: ln }, b), 400, 1500, 'GCJ→BD 偏移量级 ' + la + ',' + ln)
  }
}

/* ---------- 5. 往返闭合 ---------- */
// BD-09 的反向公式本身就是个近似解（公开资料给的就是那一条），残差到分米级；
// GCJ 的反向用定点迭代，残差能压到厘米级。两个量级分别卡上界。
{
  const pts = []
  for (let i = 0; i < 60; i++) {
    pts.push([2 + Math.random() * 50, 75 + Math.random() * 60])
  }
  for (const [la, ln] of pts) {
    const g = G.wgsToGcj(la, ln)
    const back = G.gcjToWgs(g.lat, g.lng)
    near(back.lat, la, 1e-7, 'WGS→GCJ→WGS 纬度闭合 ' + la.toFixed(3))
    near(back.lng, ln, 1e-7, 'WGS→GCJ→WGS 经度闭合 ' + ln.toFixed(3))
    inRange(dist({ lat: la, lng: ln }, back), 0, 0.05, 'GPS 往返残差（厘米级）')
    const b = G.gcjToBd(la, ln)
    const b2 = G.bdToGcj(b.lat, b.lng)
    inRange(dist({ lat: la, lng: ln }, b2), 0, 2, 'GCJ→BD→GCJ 残差（分米到米级）')
    const w = G.convert(la, ln, 'wgs84', 'bd09')
    const w2 = G.convert(w.lat, w.lng, 'bd09', 'wgs84')
    inRange(dist({ lat: la, lng: ln }, w2), 0, 2, 'GPS→百度→GPS 残差')
  }
  // 同一点走两条路到第三个系，结果必须一致
  for (const [la, ln] of pts.slice(0, 20)) {
    const g = G.wgsToGcj(la, ln)
    const viaGcj = G.gcjToBd(g.lat, g.lng)
    const direct = G.convert(la, ln, 'wgs84', 'bd09')
    near(viaGcj.lat, direct.lat, 1e-12, '两段路径与直达一致 纬度')
    near(viaGcj.lng, direct.lng, 1e-12, '两段路径与直达一致 经度')
  }
}

/* ---------- 6. convert 入口 ---------- */
is(G.convert(39.9, 116.4, 'gcj02', 'gcj02').lat, 39.9, '同系不换算')
throws(() => G.convert(0, 0, 'wgs84', 'utm'), '不支持的方向')
throws(() => G.convert(0, 0, 'nihao', 'wgs84'), '不认识的来源')
{
  const t = G.triple(39.908722, 116.397499, 'wgs84')
  is(Object.keys(t).sort().join(','), 'bd09,gcj02,wgs84', '三系全表三个键')
  near(t.wgs84.lat, 39.908722, 1e-9, '全表里 GPS 就是原值')
  is(t.gcj02.lat !== t.wgs84.lat, true, '全表里国测局与 GPS 不同')
  is(t.bd09.lng !== t.gcj02.lng, true, '全表里百度与国测局不同')
  const o = G.triple(39.908722, 116.397499, 'gcj02')
  is(o.gcj02.lat, 39.908722, '来源系那一行保持原值')
}

/* ---------- 7. 距离与方位（独立几何事实） ---------- */
{
  near(G.toRad(180), Math.PI, 1e-12, 'toRad 180')
  near(G.toRad(90), Math.PI / 2, 1e-12, 'toRad 90')
  const oneDeg = G.distance(0, 0, 0, 1) / 1000
  inRange(oneDeg, 110.5, 112, '赤道上一度经度约 111.19 公里')
  const meridian = G.distance(0, 0, 1, 0) / 1000
  inRange(meridian, 110.5, 112.5, '一度子午线约 111 公里')
  const bjsh = G.distance(39.9042, 116.4074, 31.2304, 121.4737) / 1000
  inRange(bjsh, 1050, 1090, '北京到上海约一千公里')
  is(G.distance(10, 20, 10, 20), 0, '同点距离为零')
  near(G.distance(0, 0, 0, 90), G.distance(0, 90, 0, 180), 1, '球面对称：两段 90 度等长')
  near(G.bearing(0, 0, 0, 1), 90, 1e-9, '正东方位角 90')
  near(G.bearing(0, 0, 1, 0), 0, 1e-9, '正北方位角 0')
  near(G.bearing(0, 0, 0, -1), 270, 1e-9, '正西方位角 270')
  near(G.bearing(0, 0, -1, 0), 180, 1e-9, '正南方位角 180')
  const brg = G.bearing(39.9042, 116.4074, 31.2304, 121.4737)
  inRange(brg, 145, 160, '上海在北京的东南方向')
  throws(() => G.distance(91, 0, 0, 0), '距离里纬度越界')
  throws(() => G.bearing(0, 181, 0, 0), '方位里经度越界')
}

/* ---------- 8. 16 方位 ---------- */
is(G.dirName(0), '北', '0° 北')
is(G.dirName(90), '东', '90° 东')
is(G.dirName(180), '南', '180° 南')
is(G.dirName(270), '西', '270° 西')
is(G.dirName(45), '东北', '45° 东北')
is(G.dirName(135), '东南', '135° 东南')
is(G.dirName(315), '西北', '315° 西北')
is(G.dirName(225), '西南', '225° 西南')
is(G.dirName(359.9), '北', '359.9° 仍算北')
is(G.dirName(-90), '西', '负角先归一化成 270°')
is(G.dirName(450), '东', '超过 360 要取模')

/* ---------- 9. shiftOf 描述 ---------- */
{
  const s = G.shiftOf(39.908722, 116.397499, 'wgs84', 'gcj02')
  inRange(s.meters, 50, 1200, '偏移描述米数量级')
  is(G.dirName(s.bearing), s.dir, '方向名与方位角自洽')
  const z = G.shiftOf(35.658581, 139.745433, 'wgs84', 'gcj02')
  is(z.meters, 0, '境外偏移为零')
  is(z.dir, '没动', '境外描述为没动')
  const same = G.shiftOf(39.9, 116.4, 'gcj02', 'gcj02')
  is(same.dir, '没动', '同系不换算')
}

/* ---------- 10. 写法与格式化 ---------- */
is(G.toDms(39.908722, true), '39°54\'31.4" N', '北纬度分秒')
is(G.toDms(-33.865, false), '33°51\'54.0" W', '西经度分秒')
is(G.toDms(0, true), '0°00\'00.0" N', '零度')
is(G.toDms(39.9999999, true), '40°00\'00.0" N', '秒要能进位到分和度')
is(G.toDms(116.3975, false), '116°23\'51.0" E', '东经度分秒')
is(G.toDms(31.239703, true), '31°14\'22.9" N', '上海纬度')
is(G.fmtDeg(39.908722), '39.908722', '默认六位小数')
is(G.fmtDeg(39.9087226, 2), '39.91', '指定位数')
is(G.fmtDeg('x'), '—', '非数字显示成破折号')
is(G.fmtDistance(0), '0.0 米', '零距离')
is(G.fmtDistance(999.44), '999.4 米', '不到一公里用米')
is(G.fmtDistance(1000), '1.000 公里', '刚好一公里')
is(G.fmtDistance(1067890), '1067.890 公里', '公里三位小数')
{
  const grades = [5, 50, 300, 5000].map((m) => G.accuracyGrade(m).key)
  is(grades.join('/'), 'good/ok/coarse/bad', '精度四档')
  is(G.accuracyGrade(0).key, 'unknown', '没有精度值')
  is(G.accuracyGrade('x').key, 'unknown', '精度不是数字')
  is(/[一-龥]/.test(G.accuracyGrade(15).note), true, '每档都有中文说明')
}

/* ---------- 11. 定位结果整理 ---------- */
{
  const r = G.fromLocation({ latitude: 39.9087, longitude: 116.3975, accuracy: 12, altitude: 44.2, speed: 1.3, verticalAccuracy: 5 }, 'gcj02')
  is(r.sys, 'gcj02', 'type=gcj02 时按国测局')
  is(r.accuracy, 12, '精度半径透出')
  is(r.altitude, 44.2, '高度透出')
  is(typeof r.at, 'number', '带时间戳')
  is(G.fromLocation({ latitude: 1, longitude: 2 }, 'wgs84').sys, 'wgs84', 'type=wgs84')
  is(G.fromLocation({ latitude: 1, longitude: 2 }).accuracy, 0, '没给精度记 0')
  is(G.fromLocation({ latitude: 1, longitude: 2 }).altitude, null, '没给高度是 null 而不是 0')
  throws(() => G.fromLocation({ latitude: 95, longitude: 2 }, 'gcj02'), '定位结果越界')
  throws(() => G.fromLocation(null, 'gcj02'), '定位结果为空')
}

console.log('geo 全绿 ' + ok + '/' + (ok + fail))
if (fail) process.exit(1)
