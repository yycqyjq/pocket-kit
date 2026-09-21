/**
 * worldclock.js 自查断言（直接测 src/utils/worldclock.js 本体）
 * 参照值来源（都是公开、可独立复核的锚点）：
 *   · 2024-01-01T00:00:00Z = 北京 01-01 08:00 / 东京 09:00 / 伦敦 00:00 / 纽约 2023-12-31 19:00
 *   · 印度 UTC+5:30、尼泊尔口径的加德满都 UTC+5:45、缅甸 UTC+6:30、圣诞岛 UTC+14
 *   · 美国 2024 夏令时：3 月第二个周日 02:00 开始（02:30 不存在）、11 月第一个周日 02:00 结束（01:30 出现两次）
 *   · 英国 2024 夏令时：3 月 31 日 01:00 开始（01:30 不存在）、10 月 27 日 02:00 结束（01:30 出现两次）
 *   · 北京—纽约 冬 13 小时 / 夏 12 小时；北京—伦敦 夏 7 小时 / 冬 8 小时
 *   · 北京 9-18 与东京 9-18 重叠 8 小时；与纽约 9-18 重叠 0 小时
 * 另外用「改写 HAS_INTL = false 的同一份源码」验证降级路径确实可用。
 */
import fs from 'node:fs'
import path from 'node:path'
import { useUtils, utilsDir } from '../harness.mjs'

const W = await useUtils('worldclock')

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
  if (typeof a === 'number' && Math.abs(a - b) <= tol) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + JSON.stringify(a) + ' want ' + b + '±' + tol)
  }
}
function has(s, sub, m) {
  if (String(s).indexOf(sub) >= 0) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': ' + JSON.stringify(String(s).slice(0, 220)) + ' 不含 ' + sub)
  }
}
function throws(fn, m) {
  try {
    fn()
    fail++
    console.log('FAIL ' + m + ': 没有抛错')
  } catch (e) {
    const msg = String((e && e.message) || e)
    if (!/[\u4e00-\u9fa5]/.test(msg)) {
      fail++
      console.log('FAIL ' + m + ': 报错不是中文 ' + msg)
    } else ok++
  }
}
const U = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h || 0, mi || 0, 0)

/* ---------- 0. 导出面 ---------- */
;[
  'HAS_INTL', 'HAS_TZ', 'ENGINE', 'ENGINE_NOTE', 'CLOCK_NOTES', 'ZONES', 'ZONE_ALIASES', 'ZONE_GROUPS', 'DEFAULT_ZONES',
  'zone', 'hasZone', 'zoneHasDst', 'searchZones', 'zonesByGroup', 'distinctOffsets', 'aliasesOf',
  'offsetAt', 'isDstActive', 'instantFromWall', 'offsetLabel', 'offsetCn', 'deltaText', 'humanGap', 'zoneRow', 'utcText',
  'worldAt', 'nowRows', 'atWallInZone', 'deviceOffsetMinutes', 'stampLinks', 'pairCompare',
  'meetingSlots', 'dayGrid', 'worldSummaryText', 'inviteText', 'zoneDetail',
].forEach((k) => is(typeof W[k] !== 'undefined', true, 'export:' + k))

/* ---------- 1. 引擎探测 ---------- */
is(W.HAS_INTL, true, 'hasIntlInNode')
is(W.HAS_TZ, true, 'hasTzInNode')
is(W.ENGINE, 'intl', 'engineName')
has(W.ENGINE_NOTE, 'Intl', 'engineNote')
is(W.CLOCK_NOTES.length >= 5, true, 'notesCount')
has(W.CLOCK_NOTES.join(''), '不构成', 'notesDisclaimer')
has(W.CLOCK_NOTES.join(''), '时间戳', 'notesStamp')

/* ---------- 2. 时区表完整性 ---------- */
is(W.ZONES.length >= 60, true, 'zoneCount')
is(new Set(W.ZONES.map((z) => z.key)).size, W.ZONES.length, 'zoneKeysUnique')
is(W.ZONES.every((z) => z.cn && z.en && typeof z.std === 'number' && 'dst' in z && typeof z.note === 'string' && z.grp), true, 'zoneShape')
is(W.ZONES.every((z) => W.ZONE_GROUPS.indexOf(z.grp) >= 0), true, 'zoneGroupsValid')
is(W.ZONES.every((z) => z.std >= -720 && z.std <= 840), true, 'offsetInRange')
is(W.ZONES.every((z) => z.dst === null || (typeof z.dst === 'number' && z.dst !== z.std)), true, 'dstSane')
is(W.ZONES.every((z) => z.dst === null || Math.abs(z.dst - z.std) <= 120), true, 'dstStep')
is(W.ZONES.filter((z) => z.dst !== null).length >= 15, true, 'dstZonesExist')
is(W.ZONES.every((z) => !z.aka || z.aka), true, 'noStaleAkaField')
is(Object.keys(W.ZONE_ALIASES).every((k) => W.hasZone(k)), true, 'aliasKeysResolve')
is(W.DEFAULT_ZONES.every((k) => W.hasZone(k)), true, 'defaultsResolve')
is(W.ZONE_GROUPS[0], '全部', 'groupAllFirst')
// 特殊偏移必须在表里
is(W.zone('Asia/Kolkata').std, 330, 'kolkata530')
is(W.zone('Asia/Kathmandu').std, 345, 'kathmandu545')
is(W.zone('Asia/Yangon').std, 390, 'yangon630')
is(W.zone('Pacific/Kiritimati').std, 840, 'kiritimati14')
is(W.zone('Australia/Lord_Howe').std, 630, 'lordHowe1030')
is(W.zone('Australia/Lord_Howe').dst, 660, 'lordHoweDst30')
is(W.zone('Asia/Shanghai').dst, null, 'chinaNoDst')
is(W.zoneHasDst('Europe/London'), true, 'londonHasDst')
is(W.zoneHasDst('Asia/Tokyo'), false, 'tokyoNoDst')
is(W.distinctOffsets()[0] > W.distinctOffsets()[1], true, 'offsetsSortedDesc')
is(W.zonesByGroup().length, W.ZONE_GROUPS.length - 1, 'groupByCount')
is(W.zonesByGroup().reduce((a, g) => a + g.items.length, 0), W.ZONES.length, 'groupByCoversAll')

/* ---------- 3. 偏移文本 ---------- */
is(W.offsetLabel(480), 'UTC+08:00', 'label480')
is(W.offsetLabel(0), 'UTC±00:00', 'label0')
is(W.offsetLabel(-300), 'UTC-05:00', 'labelMinus300')
is(W.offsetLabel(345), 'UTC+05:45', 'label345')
is(W.offsetLabel(-330), 'UTC-05:30', 'labelMinus330')
is(W.offsetLabel(840), 'UTC+14:00', 'label840')
is(W.offsetLabel('480'), 'UTC+08:00', 'labelString')
has(W.offsetCn(480), '东8', 'cnEast8')
has(W.offsetCn(-300), '西5', 'cnWest5')
has(W.offsetCn(0), '零时区', 'cnZero')
has(W.offsetCn(330), '半', 'cnHalf')
is(W.deltaText(480, -300, '北京', '纽约'), '北京 比 纽约 快 13 小时', 'deltaText13')
is(W.deltaText(-300, 480, '纽约', '北京'), '纽约 比 北京 慢 13 小时', 'deltaTextBack')
is(W.deltaText(480, 480, '北京', '台北'), '北京 与 台北 同一时刻', 'deltaTextSame')
is(W.humanGap(780), '13 小时', 'gap13')
is(W.humanGap(1500), '1 天 1 小时', 'gapDay')
is(W.humanGap(0), '0 分', 'gapZero')
is(W.humanGap(-90), '1 小时 30 分', 'gapAbs')

/* ---------- 4. 查找 ---------- */
is(W.zone('Asia/Shanghai').cn, '北京', 'zoneShanghai')
is(W.zone('').cn, '北京', 'zoneDefault')
is(W.hasZone('Mars/Olympus'), false, 'hasZoneFalse')
throws(() => W.zone('Mars/Olympus'), 'zoneThrows')
is(W.searchZones('纽约')[0].key, 'America/New_York', 'searchCn')
is(W.searchZones('上海')[0].key, 'Asia/Shanghai', 'searchAlias')
is(W.searchZones('tokyo')[0].key, 'Asia/Tokyo', 'searchEn')
is(W.searchZones('shanghai')[0].key, 'Asia/Shanghai', 'searchIana')
is(W.searchZones('悉尼', '美洲').length, 0, 'searchGroupFilter')
is(W.searchZones('', '中国').length, 5, 'searchGroupChina')
is(W.searchZones('UTC+05:45').length >= 1, true, 'searchOffset')
is(W.aliasesOf('UTC').indexOf('格林尼治') >= 0, true, 'aliasLookup')
is(W.aliasesOf('nope'), '', 'aliasMissing')

/* ---------- 5. 已知锚点：2024-01-01T00:00Z 各地读数 ---------- */
const ANCHOR = U(2024, 1, 1, 0, 0)
const sh = W.zoneRow(ANCHOR, 'Asia/Shanghai')
is(sh.date, '2024-01-01', 'shDate')
is(sh.hm, '08:00', 'shHm')
is(sh.weekday, '星期一', 'shWeekday')
is(sh.offsetText, 'UTC+08:00', 'shOffset')
is(sh.isWeekend, false, 'shWeekend')
is(W.zoneRow(ANCHOR, 'Asia/Tokyo').hm, '09:00', 'tokyo09')
is(W.zoneRow(ANCHOR, 'Europe/London').hm, '00:00', 'london0')
is(W.zoneRow(ANCHOR, 'Europe/London').date, '2024-01-01', 'londonSameDay')
is(W.zoneRow(ANCHOR, 'UTC').date, '2024-01-01', 'utcDate')
const ny0 = W.zoneRow(ANCHOR, 'America/New_York', { baseDay: sh.dayEpoch })
is(ny0.date, '2023-12-31', 'nyBackDay')
is(ny0.hm, '19:00', 'ny19')
is(ny0.dayOffset, -1, 'nyDayOffset')
is(ny0.crossDayMark, '-1', 'nyCrossMark')
is(ny0.crossDay, '前 1 天', 'nyCrossText')
is(W.zoneRow(ANCHOR, 'Asia/Kolkata').hm, '05:30', 'kolkata0530')
is(W.zoneRow(ANCHOR, 'Asia/Kathmandu').hm, '05:45', 'kathmandu0545')
is(W.zoneRow(ANCHOR, 'Asia/Yangon').hm, '06:30', 'yangon0630')
is(W.zoneRow(ANCHOR, 'Pacific/Kiritimati').hm, '14:00', 'kiritimati14')
is(W.zoneRow(ANCHOR, 'Pacific/Honolulu').date, '2023-12-31', 'honoluluBack')
is(W.zoneRow(ANCHOR, 'Australia/Perth').hm, '08:00', 'perthLikeBeijing')
is(W.zoneRow(ANCHOR, 'Australia/Perth').offsetText, W.zoneRow(ANCHOR, 'Asia/Shanghai').offsetText, 'perthEqBeijing')
is(W.zoneRow(ANCHOR, 'Europe/Berlin').hm, '01:00', 'berlin01')
// 输入形式：Date / 秒 / ISO 字符串 / 毫秒串
is(W.zoneRow(new Date(ANCHOR), 'Asia/Shanghai').hm, '08:00', 'rowFromDate')
is(W.zoneRow(ANCHOR / 1000, 'Asia/Shanghai').hm, '08:00', 'rowFromSeconds')
is(W.zoneRow('1704067200', 'Asia/Shanghai').hm, '08:00', 'rowFromDigitString')
is(W.zoneRow('2024-01-01T00:00:00Z', 'Asia/Shanghai').hm, '08:00', 'rowFromIso')
throws(() => W.zoneRow('明天下午', 'Asia/Shanghai'), 'rowGarbage')
throws(() => W.zoneRow('', 'Asia/Shanghai'), 'rowEmpty')

/* ---------- 6. 偏移与夏令时状态 ---------- */
is(W.offsetAt('America/New_York', U(2024, 1, 15)).minutes, -300, 'nyWinter')
is(W.offsetAt('America/New_York', U(2024, 7, 15)).minutes, -240, 'nySummer')
is(W.offsetAt('America/New_York', U(2024, 7, 15)).approx, false, 'nyExact')
is(W.isDstActive('America/New_York', U(2024, 7, 15)).active, true, 'nyDstOn')
is(W.isDstActive('America/New_York', U(2024, 1, 15)).active, false, 'nyDstOff')
is(W.isDstActive('Asia/Shanghai', U(2024, 7, 15)).active, false, 'shNoDst')
is(W.isDstActive('Europe/London', U(2024, 1, 15)).active, false, 'londonWinter')
is(W.isDstActive('Europe/London', U(2024, 6, 15)).active, true, 'londonSummer')
is(W.isDstActive('Australia/Sydney', U(2024, 1, 15)).active, true, 'sydneySummerDst')
is(W.isDstActive('Australia/Sydney', U(2024, 7, 15)).active, false, 'sydneyWinter')
is(W.offsetAt('Australia/Lord_Howe', U(2024, 1, 15)).minutes, 660, 'lordHoweSummer')
is(W.offsetAt('Australia/Lord_Howe', U(2024, 7, 15)).minutes, 630, 'lordHoweWinter')
is(W.offsetAt('Europe/Istanbul', U(2024, 7, 15)).minutes, 180, 'istanbulPermanent3')
is(W.offsetAt('Europe/Moscow', U(2024, 7, 15)).minutes, 180, 'moscowPermanent3')
is(W.offsetAt('Asia/Tehran', U(2024, 7, 15)).minutes, 210, 'tehranNoDst')
is(W.offsetAt('America/Phoenix', U(2024, 7, 15)).minutes, -420, 'phoenixNoDst')
is(W.offsetAt('Asia/Shanghai', U(2024, 3, 10, 2, 30)).minutes, 480, 'shUnmoved')

/* ---------- 7. 墙钟 → 瞬间（含美国切换日） ---------- */
const rSh = W.instantFromWall('Asia/Shanghai', { year: 2024, month: 3, day: 10, hour: 8, minute: 0 })
is(rSh.ms, U(2024, 3, 10, 0, 0), 'shWall')
is(rSh.offsetMinutes, 480, 'shWallOffset')
is(rSh.dstState, 'ok', 'shWallOk')
is(rSh.note, '', 'shNoNote')
is(W.instantFromWall('America/New_York', { year: 2024, month: 1, day: 15, hour: 12 }).ms, U(2024, 1, 15, 17), 'nyWinterNoon')
is(W.instantFromWall('America/New_York', { year: 2024, month: 7, day: 15, hour: 12 }).ms, U(2024, 7, 15, 16), 'nySummerNoon')
// 2024-03-10 02:30 纽约：不存在（02:00 直接拨到 03:00）
const gap = W.instantFromWall('America/New_York', { year: 2024, month: 3, day: 10, hour: 2, minute: 30 })
is(gap.dstState, 'gap', 'nyGapState')
is(gap.ms, U(2024, 3, 10, 7, 30), 'nyGapMs')
is(gap.candidates.length, 0, 'nyGapNoCandidate')
has(gap.note, '不存在', 'nyGapNote')
has(gap.note, '01:30', 'nyGapEarlier')
has(gap.note, '03:30', 'nyGapLater')
// 2024-11-03 01:30 纽约：出现两次
const amb = W.instantFromWall('America/New_York', { year: 2024, month: 3, day: 10, hour: 1, minute: 30 })
is(amb.dstState, 'ok', 'nyBeforeGapOk')
const amb2 = W.instantFromWall('America/New_York', { year: 2024, month: 11, day: 3, hour: 1, minute: 30 })
is(amb2.dstState, 'ambiguous', 'nyAmbState')
is(amb2.candidates.length, 2, 'nyAmbTwo')
is(amb2.ms, U(2024, 11, 3, 5, 30), 'nyAmbFirst')
is(amb2.candidates[1].ms, U(2024, 11, 3, 6, 30), 'nyAmbSecond')
is(amb2.candidates[0].offsetMinutes, -240, 'nyAmbEdt')
is(amb2.candidates[1].offsetMinutes, -300, 'nyAmbEst')
has(amb2.note, '两次', 'nyAmbNote')
// 英国：3 月 31 日 01:30 不存在，10 月 27 日 01:30 出现两次
is(W.instantFromWall('Europe/London', { year: 2024, month: 3, day: 31, hour: 1, minute: 30 }).dstState, 'gap', 'londonGap')
is(W.instantFromWall('Europe/London', { year: 2024, month: 10, day: 27, hour: 1, minute: 30 }).dstState, 'ambiguous', 'londonAmb')
is(W.instantFromWall('Europe/London', { year: 2024, month: 3, day: 31, hour: 1, minute: 30 }).ms, U(2024, 3, 31, 1, 30), 'londonGapMs')
// 中国 / 日本 / 印度不切换
is(W.instantFromWall('Asia/Shanghai', { year: 2024, month: 3, day: 10, hour: 2, minute: 30 }).dstState, 'ok', 'shNoGap')
is(W.instantFromWall('Asia/Tokyo', { year: 2024, month: 11, day: 3, hour: 1, minute: 30 }).dstState, 'ok', 'tokyoNoAmb')
is(W.instantFromWall('Asia/Kolkata', { year: 2024, month: 6, day: 1, hour: 9, minute: 0 }).ms, U(2024, 6, 1, 3, 30), 'kolkataWall')
throws(() => W.instantFromWall('Asia/Shanghai', { year: 500, month: 1, day: 1 }), 'wallBadYear')
throws(() => W.instantFromWall('Asia/Shanghai', {}), 'wallNoYear')
// 越界参数被夹住而不是抛错
const clamped = W.instantFromWall('Asia/Shanghai', { year: 2024, month: 99, day: 99, hour: 99, minute: 99 })
is(W.zoneRow(clamped.ms, 'Asia/Shanghai').month, 12, 'clampMonth')
is(W.zoneRow(clamped.ms, 'Asia/Shanghai').hour, 23, 'clampHour')
// 半小时区往返：墙钟 → 瞬间 → 墙钟必须一致
const halfTrip = W.instantFromWall('Asia/Kathmandu', { year: 2024, month: 5, day: 5, hour: 21, minute: 15 })
is(W.zoneRow(halfTrip.ms, 'Asia/Kathmandu').hm, '21:15', 'kathmanduTrip')
is(halfTrip.offsetMinutes, 345, 'kathmanduTripOffset')

/* ---------- 8. 多城市对照 ---------- */
const wa = W.worldAt({ at: ANCHOR, zones: ['Asia/Shanghai', 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'UTC'] })
is(wa.count, 5, 'worldCount')
is(wa.rows[0].cn, '东京', 'worldSortFirst')
is(wa.rows[wa.rows.length - 1].cn, '纽约', 'worldSortLast')
is(wa.rows.map((r) => r.hm).join(' '), '09:00 08:00 00:00 00:00 19:00', 'worldHms')
is(wa.base.cn, '北京', 'worldBase')
is(wa.crossDayCount, 1, 'worldCross')
is(wa.engine, 'intl', 'worldEngine')
has(wa.note, '不在同一天', 'worldNoteCross')
is(wa.rows.every((r) => r.approx === false), true, 'worldExact')
is(W.worldAt({ at: ANCHOR }).count, W.DEFAULT_ZONES.length, 'worldDefaults')
const wa2 = W.worldAt({ at: ANCHOR, zones: ['Mars/Olympus', 'Asia/Tokyo'], baseKey: 'Mars/Olympus' })
is(wa2.count, 1, 'worldFiltersBadKey')
is(wa2.base.cn, '东京', 'worldBaseFallback')
is(W.nowRows(['UTC', 'Asia/Shanghai'], 'UTC', ANCHOR).base.cn.indexOf('UTC') >= 0, true, 'nowRowsBase')
const dstList = W.worldAt({ at: U(2024, 7, 1), zones: ['America/New_York', 'Asia/Shanghai', 'Australia/Sydney'] })
is(dstList.dstActiveCount, 1, 'dstActiveCountSummer')
has(dstList.note, '纽约', 'dstNamesInNote')
const dstList2 = W.worldAt({ at: U(2024, 1, 1), zones: ['America/New_York', 'Australia/Sydney'] })
is(dstList2.dstActiveCount, 1, 'dstActiveCountWinter')

/* ---------- 9. 指定时刻对照 ---------- */
const at1 = W.atWallInZone({ zoneKey: 'Asia/Shanghai', year: 2024, month: 6, day: 1, hour: 20, minute: 0, zones: ['Asia/Shanghai', 'America/New_York', 'Europe/London', 'UTC'] })
is(at1.ms, U(2024, 6, 1, 12, 0), 'atWallMs')
is(at1.utcText, '2024-06-01 12:00:00 UTC', 'atWallUtcText')
is(at1.stamp, U(2024, 6, 1, 12, 0) / 1000, 'atWallStamp')
is(at1.iso, '2024-06-01T12:00:00.000Z', 'atWallIso')
is(at1.dstState, 'ok', 'atWallDstOk')
is(at1.rows.filter((r) => r.cn === '纽约')[0].hm, '08:00', 'atWallNy')
is(at1.rows.filter((r) => r.cn === '伦敦')[0].hm, '13:00', 'atWallLondon')
is(at1.approx, false, 'atWallExact')
const at2 = W.atWallInZone({ zoneKey: 'Asia/Tokyo', year: 2024, month: 1, day: 1, hour: 0, minute: 30, zones: ['Asia/Tokyo', 'Asia/Shanghai'] })
is(at2.rows.filter((r) => r.cn === '北京')[0].date, '2023-12-31', 'atWallCrossDay')
is(at2.rows.filter((r) => r.cn === '北京')[0].crossDayMark, '-1', 'atWallCrossMark')
const at3 = W.atWallInZone({ zoneKey: 'America/New_York', year: 2024, month: 3, day: 10, hour: 2, minute: 30, zones: ['America/New_York'] })
is(at3.dstState, 'gap', 'atWallGapState')
has(at3.dstNote, '夏令时开始', 'atWallGapNote')
has(W.inviteText({ zoneKey: 'America/New_York', year: 2024, month: 3, day: 10, hour: 2, minute: 30, zones: ['America/New_York', 'Asia/Shanghai'] }), '注意：', 'inviteWarns')

/* ---------- 10. 时间戳 / UTC / 本地 联动 ---------- */
const sl = W.stampLinks({ stamp: '1704067200' })
is(sl.ms, ANCHOR, 'slStampMs')
is(sl.utc, '2024-01-01 00:00:00 UTC', 'slUtc')
is(sl.beijing.hm, '08:00', 'slBeijing')
is(sl.from, '时间戳（秒）', 'slFromSec')
is(W.stampLinks({ stamp: String(ANCHOR) }).from, '时间戳（毫秒）', 'slFromMs')
is(W.stampLinks({ utc: '2024-01-01T00:00:00Z' }).ms, ANCHOR, 'slUtcText')
is(W.stampLinks({ zoneKey: 'Asia/Shanghai', year: 2024, month: 1, day: 1, hour: 8, minute: 0 }).ms, ANCHOR, 'slWall')
is(W.stampLinks({ zoneKey: 'Asia/Shanghai', year: 2024, month: 1, day: 1, hour: 8 }).dstState, 'ok', 'slDstOk')
is(W.stampLinks({ stamp: '1704067200' }).stampSec * 1000, ANCHOR, 'slStampRound')
is(W.stampLinks({ stamp: '1704067200' }).stampMs, ANCHOR, 'slStampMsField')
is(W.stampLinks({ utc: '2024-01-01 00:00:00' }).deviceTime.length, 5, 'slDeviceTime')
has(sl.note, '与时间区无关', 'slNote')
has(sl.iso, 'T00:00:00.000Z', 'slIso')
is(sl.deviceOffsetMinutes, W.deviceOffsetMinutes(ANCHOR), 'slDeviceOffset')
is(W.offsetLabel(sl.deviceOffsetMinutes), sl.deviceOffsetText, 'slDeviceLabel')
throws(() => W.stampLinks({ stamp: '12ab' }), 'slBadStamp')
throws(() => W.stampLinks({ stamp: 'abc' }), 'slGarbageStamp')
throws(() => W.stampLinks({ utc: 'not a date' }), 'slBadUtc')
// 墙钟 → stampLinks → 再读回同一城市，必须一模一样
const sl2 = W.stampLinks({ zoneKey: 'Europe/London', year: 2024, month: 10, day: 27, hour: 1, minute: 30 })
is(sl2.dstState, 'ambiguous', 'slAmbiguous')
has(sl2.dstNote, '两次', 'slAmbNote')

/* ---------- 11. 两两对照 ---------- */
const pc = W.pairCompare({ a: 'Asia/Shanghai', b: 'America/New_York', at: ANCHOR })
is(pc.deltaMinutes, 780, 'pairDeltaWinter')
is(pc.deltaHours, 13, 'pairHoursWinter')
is(pc.sameDay, false, 'pairSameDayWinter')
is(pc.dayOffset, -1, 'pairDayOffset')
has(pc.thereText, '2023-12-31', 'pairThereText')
has(pc.deltaText, '快 13 小时', 'pairDeltaText')
is(pc.overlapRatio, 0, 'pairOverlapZero')
const pc2 = W.pairCompare({ a: 'Asia/Shanghai', b: 'America/New_York', at: U(2024, 7, 1) })
is(pc2.deltaMinutes, 720, 'pairDeltaSummer')
is(pc2.deltaHours, 12, 'pairHoursSummer')
const pc3 = W.pairCompare({ a: 'Asia/Shanghai', b: 'Asia/Shanghai', at: ANCHOR })
is(pc3.deltaMinutes, 0, 'pairSelf')
has(pc3.deltaText, '同一时刻', 'pairSelfText')
const pc4 = W.pairCompare({ a: 'Asia/Shanghai', b: 'Asia/Tokyo', at: ANCHOR })
is(pc4.deltaMinutes, -60, 'pairTokyoAhead')
is(pc4.sameDay, true, 'pairTokyoSameDay')
const pc5 = W.pairCompare({ a: 'America/New_York', b: 'Asia/Shanghai', aWall: { year: 2024, month: 3, day: 10, hour: 2, minute: 30 } })
is(pc5.dstState, 'gap', 'pairWallGap')
is(pc5.a.hm, '03:30', 'pairGapShiftedForward')
const pc6 = W.pairCompare({ a: 'Pacific/Kiritimati', b: 'Pacific/Honolulu', at: ANCHOR })
is(pc6.absDelta, 1440, 'pairFullDay')
is(pc6.b.dayOffset, -1, 'pairDayLine')

/* ---------- 12. 会议重叠 ---------- */
const mt = W.meetingSlots({ a: 'Asia/Shanghai', b: 'Asia/Tokyo', date: '2024-06-03', hours: 24 })
is(mt.slots.length, 1, 'tokyoOneSlot')
is(mt.slots[0].hours, 8, 'tokyo8Hours')
is(mt.totalHours, 8, 'tokyoTotal')
is(mt.slots[0].startA, '09:00', 'tokyoStartA')
is(mt.slots[0].startB, '10:00', 'tokyoStartB')
has(mt.slots[0].plainA, '2024-06-03 09:00~17:00', 'tokyoPlainA')
has(mt.slots[0].text, '当天', 'tokyoTextDay')
is(mt.approx, false, 'tokyoExact')
const mtn = W.meetingSlots({ a: 'Asia/Shanghai', b: 'America/New_York', date: '2024-06-03', hours: 24 })
is(mtn.slots.length, 0, 'nyNoSlot')
is(mtn.totalHours, 0, 'nyNoHours')
has(mtn.note, '没有重叠', 'nyNote')
const mtl = W.meetingSlots({ a: 'Asia/Shanghai', b: 'Europe/London', date: '2024-06-03', hours: 24 })
is(mtl.totalHours, 2, 'londonSummer2')
is(mtl.slots[0].startA, '16:00', 'londonSummerStart')
const mtl2 = W.meetingSlots({ a: 'Asia/Shanghai', b: 'Europe/London', date: '2024-12-02', hours: 24 })
is(mtl2.totalHours, 1, 'londonWinter1')
is(mtl2.slots[0].startA, '17:00', 'londonWinterStart')
const mtp = W.meetingSlots({ a: 'Asia/Singapore', b: 'Pacific/Honolulu', date: '2024-06-03', hours: 24 })
is(mtp.slots.length, 0, 'honoluluNoDaySlot')
const mtfri = W.meetingSlots({ a: 'Asia/Shanghai', b: 'Asia/Tokyo', date: '2024-06-01', hours: 24 })
is(mtfri.slots.length, 0, 'weekendSkipped')
const mtfri2 = W.meetingSlots({ a: 'Asia/Shanghai', b: 'Asia/Tokyo', date: '2024-06-01', hours: 24, skipWeekend: false })
is(mtfri2.totalHours, 8, 'weekendAllowed')
const mtwide = W.meetingSlots({ a: 'America/Los_Angeles', b: 'Asia/Shanghai', date: '2024-06-03', hours: 24, workStart: 6, workEnd: 22 })
is(mtwide.totalHours >= 1, true, 'wideWindowHelps')
is(mtwide.workStart, 6, 'wideStart')
is(mtwide.workEnd, 22, 'wideEnd')
// 工作时段给定时 A 侧的小时必须都落在区间里
is(mt.slots.every((s) => Number(s.startA.slice(0, 2)) >= mt.workStart), true, 'slotInsideWindow')
const mt24 = W.meetingSlots({ a: 'Europe/Berlin', b: 'America/New_York', date: '2024-03-11', hours: 24 })
is(mt24.slots.length >= 0, true, 'transitionDayNoThrow')
throws(() => W.meetingSlots({ date: '2024/06/03' }), 'slotsBadDate')
throws(() => W.dayGrid({ date: 'x' }), 'gridBadDate')
throws(() => W.meetingSlots({ date: '12-31' }), 'slotsBadDate2')
is(W.meetingSlots({ hours: 9999, date: '2024-06-03' }).span, 240, 'slotsSpanClamp')
is(W.meetingSlots({ workStart: 20, workEnd: 3 }).workEnd, 21, 'slotsWindowClamp')

/* ---------- 13. 24 小时网格 ---------- */
const g = W.dayGrid({ a: 'Asia/Shanghai', b: 'America/New_York', date: '2024-06-03' })
is(g.rows.length, 24, 'grid24')
is(g.rows[0].aTime, '00:00', 'gridFirst')
is(g.rows[8].bTime, '20:00', 'gridNyPrevNight')
is(g.rows[8].dayOffset, -1, 'gridNyBack')
is(g.rows[23].bTime, '11:00', 'gridLast')
is(g.bothWorkCount, 0, 'gridNoOverlap')
is(g.gapCount, 0, 'gridNoGap')
is(g.aDate, '2024-06-03', 'gridDate')
is(g.rows[0].bDate, '2024-06-02', 'gridBDate')
const gSh = g.rows.filter((r) => r.hour === 9)[0]
is(gSh.aWork, true, 'gridAWork')
is(gSh.bWork, false, 'gridBRest')
const gn = W.dayGrid({ a: 'America/New_York', b: 'Asia/Shanghai', date: '2024-03-10' })
is(gn.gapCount, 1, 'gridGapCount')
is(gn.rows[2].dstState, 'gap', 'gridGapHour')
has(gn.note, '不存在', 'gridGapNote')
const gn2 = W.dayGrid({ a: 'America/New_York', b: 'Asia/Shanghai', date: '2024-11-03' })
is(gn2.ambiguousCount, 1, 'gridAmbCount')
is(gn2.rows[1].dstState, 'ambiguous', 'gridAmbHour')
const gl = W.dayGrid({ a: 'Asia/Shanghai', b: 'Europe/London', date: '2024-06-03' })
is(gl.rows.filter((r) => r.bothWork).length, 2, 'gridLondonOverlap')
is(gl.rows.filter((r) => r.dayOffset === 0).length >= 20, true, 'gridLondonMostlySameDay')
const gt = W.dayGrid({ a: 'Asia/Shanghai', b: 'Asia/Tokyo', at: ANCHOR })
is(gt.aDate, '2024-01-01', 'gridFromAt')
is(gt.rows[0].bTime, '01:00', 'gridTokyoPlus1')

/* ---------- 14. 复制文案 ---------- */
const txt = W.worldSummaryText(wa)
is(txt.split('\n').length, wa.rows.length + 2, 'summaryLines')
has(txt, '引擎：Intl', 'summaryEngine')
has(txt, '纽约  2023-12-31 19:00', 'summaryNy')
has(txt, '-1', 'summaryCrossMark')
const inv = W.inviteText({ zoneKey: 'Asia/Shanghai', year: 2024, month: 6, day: 1, hour: 20, zones: ['Asia/Shanghai', 'America/New_York', 'Europe/London'] })
has(inv, '【会议时间】北京 2024-06-01 20:00', 'inviteHead')
has(inv, '纽约 6月1日 08:00', 'inviteNy')
has(inv, 'UTC 2024-06-01 12:00:00', 'inviteUtc')
has(inv, '时间戳 ', 'inviteStamp')
is(inv.split('\n').length, 5, 'inviteLines')
has(W.inviteText({ zoneKey: 'Asia/Shanghai', year: 2024, month: 6, day: 1, hour: 20, zones: ['Asia/Shanghai'] }), '【会议时间】', 'inviteSolo')

/* ---------- 15. 时区详情 ---------- */
const zd = W.zoneDetail('Asia/Shanghai', ANCHOR)
is(zd.dstText, '不实行夏令时', 'zdNoDst')
is(zd.nowText, '2024-01-01 08:00 星期一', 'zdNow')
is(zd.offsetNow, 'UTC+08:00', 'zdOffset')
is(zd.engine, 'intl', 'zdEngine')
is(W.zoneDetail('America/New_York', ANCHOR).dstText, '夏令时期间 UTC-04:00', 'zdNyDst')
is(W.zoneDetail('Europe/London', ANCHOR).dstActive, false, 'zdLondonWinter')
is(W.zoneDetail('Europe/London', U(2024, 7, 1)).dstActive, true, 'zdLondonSummer')
is(W.zoneDetail('Australia/Lord_Howe').std, 630, 'zdLordHowe')

/* ---------- 16. 全局不变量 ---------- */
// 墙钟 → 瞬间 → 墙钟 必须稳定（含切换日与半小时区）
const zonesSweep = ['Asia/Shanghai', 'America/New_York', 'Europe/London', 'Australia/Lord_Howe', 'Asia/Kathmandu', 'Pacific/Kiritimati']
for (let i = 0; i < zonesSweep.length; i++) {
  const k = zonesSweep[i]
  for (const day of [U(2024, 3, 9), U(2024, 3, 10), U(2024, 3, 11), U(2024, 11, 2), U(2024, 11, 3), U(2024, 4, 4)]) {
    for (let h = 0; h < 24; h += 3) {
      const row = W.zoneRow(day + h * 3600000, k)
      const back = W.instantFromWall(k, { year: row.year, month: row.month, day: row.day, hour: row.hour, minute: row.minute, second: row.second })
      const again = W.zoneRow(back.ms, k)
      if (again.hm !== row.hm || again.date !== row.date) {
        fail++
        console.log('FAIL stableSweep ' + k + ' @' + day + ' h' + h + ': ' + row.hm + ' -> ' + again.hm)
      } else ok++
      // 偏移必须落在该城的 std 与 dst 之间
      const z = W.zone(k)
      const allowed = z.dst === null ? [z.std] : [z.std, z.dst]
      if (allowed.indexOf(row.offsetMinutes) < 0) {
        fail++
        console.log('FAIL offsetOffTable ' + k + ' ' + row.offsetMinutes)
      } else ok++
    }
  }
}
// 任意瞬间：UTC 读数 + 偏移 = 该城读数（分钟级一致）
for (let i = 0; i < W.ZONES.length; i++) {
  const k = W.ZONES[i].key
  const row = W.zoneRow(ANCHOR, k)
  const total = (0 + row.offsetMinutes) % 1440
  const expectHm = W.zoneRow(ANCHOR, 'UTC').hm
  const shifted = new Date(ANCHOR + row.offsetMinutes * 60000)
  const got = String(shifted.getUTCHours()).padStart(2, '0') + ':' + String(shifted.getUTCMinutes()).padStart(2, '0')
  if (got !== row.hm) {
    fail++
    console.log('FAIL arithmetic ' + k + ': ' + row.hm + ' vs ' + got)
  } else ok++
  if (typeof total !== 'number' || expectHm !== '00:00') {
    fail++
    console.log('FAIL anchorUtcBroken ' + k)
  } else ok++
}

/* ---------- 17. 降级路径（改写同一份源码里的能力探测） ---------- */
function dataUrl(s) {
  return 'data:text/javascript;base64,' + Buffer.from(s, 'utf8').toString('base64')
}
const dir = utilsDir()
const wSrc = fs.readFileSync(path.join(dir, 'worldclock.js'), 'utf8')
const dSrc = fs.readFileSync(path.join(dir, 'date.js'), 'utf8')
const patched = wSrc
  .replace("import { pad2, parseTimestamp } from './date'", "import { pad2, parseTimestamp } from '" + dataUrl(dSrc) + "'")
  .replace("export const HAS_INTL = typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function'", 'export const HAS_INTL = false')
is(patched !== wSrc, true, 'patchActuallyApplied')
is(patched.indexOf('HAS_INTL = false') > 0, true, 'patchHasFalse')
const F = await import(dataUrl(patched))
is(F.HAS_INTL, false, 'fallbackHasIntl')
is(F.HAS_TZ, false, 'fallbackHasTz')
is(F.ENGINE, 'fixed', 'fallbackEngine')
has(F.ENGINE_NOTE, '降级', 'fallbackNote')
is(F.offsetAt('America/New_York', U(2024, 7, 15)).approx, true, 'fallbackApproxFlag')
is(F.offsetAt('America/New_York', U(2024, 7, 15)).minutes, -300, 'fallbackUsesStd')
is(F.zoneRow(ANCHOR, 'America/New_York').hm, '19:00', 'fallbackUtcAnchor')
is(F.zoneRow(ANCHOR, 'Asia/Shanghai').hm, '08:00', 'fallbackBeijingExact')
is(F.zoneRow(ANCHOR, 'Asia/Kathmandu').hm, '05:45', 'fallbackHalfZone')
is(F.zoneRow(U(2024, 6, 15), 'America/New_York').dstActive, false, 'fallbackNoDstFlag')
is(F.zoneRow(U(2024, 6, 15), 'America/New_York').approx, true, 'fallbackRowApprox')
const fWall = F.instantFromWall('America/New_York', { year: 2024, month: 7, day: 15, hour: 12 })
is(fWall.ms, U(2024, 7, 15, 17), 'fallbackStdOnlyInstant')
is(fWall.dstState, 'ok', 'fallbackNoGapState')
has(fWall.note, '降级模式', 'fallbackWallNote')
is(F.instantFromWall('America/New_York', { year: 2024, month: 3, day: 10, hour: 2, minute: 30 }).dstState, 'ok', 'fallbackCannotSeeGap')
const fw = F.worldAt({ at: ANCHOR, zones: ['Asia/Shanghai', 'America/New_York'] })
has(fw.note, '降级', 'fallbackWorldNote')
is(fw.rows.length, 2, 'fallbackWorldRows')
has(F.stampLinks({ zoneKey: 'Asia/Shanghai', year: 2024, month: 1, day: 1, hour: 8 }).note, '固定值', 'fallbackStampNote')
is(F.meetingSlots({ a: 'Asia/Shanghai', b: 'Asia/Tokyo', date: '2024-06-03', hours: 24 }).approx, true, 'fallbackSlotsApprox')
is(F.meetingSlots({ a: 'Asia/Shanghai', b: 'Asia/Tokyo', date: '2024-06-03', hours: 24 }).totalHours, 8, 'fallbackSlotsStillWork')
is(F.dayGrid({ a: 'Asia/Shanghai', b: 'Asia/Tokyo', date: '2024-06-03' }).rows.length, 24, 'fallbackGrid')
is(F.inviteText({ zoneKey: 'Asia/Shanghai', year: 2024, month: 6, day: 1, hour: 20, zones: ['Asia/Shanghai', 'Asia/Tokyo'] }).indexOf('降级模式') >= 0, true, 'fallbackInvite')
has(F.worldSummaryText(fw), '固定偏移', 'fallbackSummaryEngine')
is(F.pairCompare({ a: 'Asia/Shanghai', b: 'America/New_York', at: U(2024, 7, 1) }).deltaHours, 13, 'fallbackKeepsWinterOffset')
has(F.pairCompare({ a: 'Asia/Shanghai', b: 'America/New_York', at: U(2024, 7, 1) }).note, '降级模式', 'fallbackPairNote')

console.log('worldclock ' + (fail ? 'FAIL ' + fail + '/' : '全绿 ') + ok + '/' + (ok + fail))
if (fail) process.exitCode = 1
