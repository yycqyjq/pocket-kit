/**
 * cron.js 自查断言（直接测 src/utils/cron.js 本体）
 * ------------------------------------------------------------
 * 判据分四类，外部来源如下：
 *   1) 外部裁判（自写参考实现）：测试里按 cron 语义独立写了一份最小解析/推算实现
 *      （五字段展开：* ? a-b a,b /n、英文月/星期名、跨零点区间、星期 7→0、日与周的或/与规则），
 *      拿它逐条对撞 parseCron 的字段集合与 nextRuns 的时间序列。参考实现只按语义写，不抄源码结构。
 *   2) 性质验证：nextRuns 结果必须严格单调递增、秒/毫秒归零、都晚于起点；count 有夹取（默认 10、上限 50）。
 *   3) 字段事实：全通配展开成全域、斜杠步长每 5 分钟有 12 个点、1,4,7,10 是季度首月、22-2 跨零点、7 等同 0，这些是 cron 常识。
 *   4) 边界与反例：段数不对、越界、步长非正、空分段、看不懂的 token、L/W/# 都要给中文错；描述句不许出现 undefined/NaN。
 *
 * 时区：nextRuns/fmtDate 用本地 getter，本机 UTC+8 而 CI 是 UTC，所以把进程时区钉成 UTC，
 * 输入一律用 Date.UTC 构造，参考实现也走 UTC，两边才可逐毫秒对齐。
 */
import { useUtils, makeTest } from './harness.mjs'

process.env.TZ = 'UTC'

const C = await useUtils('cron')
const T = makeTest('cron')

/* ===== 自写参考实现：只按 cron 语义，不参考源码 ===== */
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
const DEFS = [
  { key: 'min', min: 0, max: 59 },
  { key: 'hour', min: 0, max: 23 },
  { key: 'dom', min: 1, max: 31 },
  { key: 'month', min: 1, max: 12, names: MON },
  { key: 'dow', min: 0, max: 7, names: DOW },
]
function refTok(v, names) {
  const t = String(v).trim().toLowerCase()
  return names && names[t] !== undefined ? names[t] : Number(t)
}
function refField(raw, def) {
  const set = new Set()
  for (const part of String(raw).trim().split(',')) {
    const seg = part.trim()
    let body = seg
    let step = 1
    const sl = seg.indexOf('/')
    if (sl > -1) { body = seg.slice(0, sl); step = Number(seg.slice(sl + 1)) }
    let lo
    let hi
    if (body === '*' || body === '?') { lo = def.min; hi = def.max }
    else if (body.indexOf('-') > -1) { const [a, b] = body.split('-'); lo = refTok(a, def.names); hi = refTok(b, def.names) }
    else { lo = refTok(body, def.names); hi = sl > -1 ? def.max : lo }
    if (lo <= hi) for (let v = lo; v <= hi; v += step) set.add(v)
    else { for (let v = lo; v <= def.max; v += step) set.add(v); for (let v = def.min; v <= hi; v += step) set.add(v) }
  }
  if (def.key === 'dow' && set.has(7)) { set.add(0); set.delete(7) }
  return [...set].sort((a, b) => a - b)
}
function refParse(expr) {
  const parts = String(expr).trim().replace(/\s+/g, ' ').split(' ')
  return {
    arrays: parts.map((p, i) => refField(p, DEFS[i])),
    domR: parts[2].trim() !== '*' && parts[2].trim() !== '?',
    dowR: parts[4].trim() !== '*' && parts[4].trim() !== '?',
  }
}
function refNext(expr, count, from) {
  const p = refParse(expr)
  const out = []
  const t0 = Math.floor(from.getTime() / 60000) * 60000 + 60000 // 下一分钟整
  const horizon = from.getTime() + 366 * 6 * 86400000
  for (let cur = t0; cur <= horizon && out.length < count; cur += 60000) {
    const dd = new Date(cur)
    if (!p.arrays[3].includes(dd.getUTCMonth() + 1)) continue
    const domOk = p.arrays[2].includes(dd.getUTCDate())
    const dowOk = p.arrays[4].includes(dd.getUTCDay())
    const dayOk = p.domR && p.dowR ? domOk || dowOk : domOk && dowOk
    if (!dayOk) continue
    if (!p.arrays[1].includes(dd.getUTCHours())) continue
    if (!p.arrays[0].includes(dd.getUTCMinutes())) continue
    out.push(new Date(cur))
  }
  return out
}

/* ===== 1. parseCron 正常解析：与参考实现逐段对撞 ===== */
const okExprs = [
  '0 9 * * 1-5', '*/5 * * * *', '*/15 * * * *', '0 0 1 * *', '0 0 1 1,4,7,10 *',
  '* * * * 7', '0 0 * jan,dec *', '0 0 * * sun,mon', '0 22-2 * * *', '0 0-23/6 * * *',
  '0 9-17 * * 1-5', '30 2 29 2 *', '0 0 ? * ?', '15 10 1,15 * *',
]
for (const e of okExprs) {
  const got = C.parseCron(e)
  const want = refParse(e)
  T.eq('parseCron ok ' + e, got.ok, true)
  T.eq('parseCron 字段对撞 ' + e, [got.arrays.min, got.arrays.hour, got.arrays.dom, got.arrays.month, got.arrays.dow], want.arrays)
  T.eq('parseCron 日限定标记 ' + e, got.domRestricted, want.domR)
  T.eq('parseCron 周限定标记 ' + e, got.dowRestricted, want.dowR)
}

/* 几个字段事实，独立再钉一遍 */
T.eq('*/5 有 12 个点', C.parseCron('*/5 * * * *').arrays.min.length, 12)
T.eq('*/5 首尾是 0 与 55', [C.parseCron('*/5 * * * *').arrays.min[0], C.parseCron('*/5 * * * *').arrays.min[11]], [0, 55])
T.eq('季度首月', C.parseCron('0 0 1 1,4,7,10 *').arrays.month, [1, 4, 7, 10])
T.eq('星期 7 归一到 0', C.parseCron('* * * * 7').arrays.dow, [0])
T.eq('跨零点 22-2', C.parseCron('0 22-2 * * *').arrays.hour, [0, 1, 2, 22, 23])
T.eq('步长区间 0-23/6', C.parseCron('0 0-23/6 * * *').arrays.hour, [0, 6, 12, 18])
T.eq('? 等同 *（日）', C.parseCron('0 9 ? * ?').domRestricted, false)
T.eq('? 等同 *（周）', C.parseCron('0 9 ? * ?').dowRestricted, false)
T.eq('空白归一化', C.parseCron('  0   9  *  *  1-5 ').raw, '0 9 * * 1-5')
T.ok('fields 是 Set', C.parseCron('0 9 * * 1-5').fields.dow instanceof Set)
T.ok('fields 命中正确', C.parseCron('0 9 * * 1-5').fields.dow.has(3))
T.eq('FIELD_DEFS 五段', C.FIELD_DEFS.length, 5)
T.eq('FIELD_DEFS 顺序', C.FIELD_DEFS.map((f) => f.key), ['min', 'hour', 'dom', 'month', 'dow'])

/* ===== 2. nextRuns：与参考实现逐毫秒对撞 + 性质 ===== */
const runs = [
  ['* * * * *', Date.UTC(2024, 2, 1, 10, 0, 0), 5],
  ['*/15 * * * *', Date.UTC(2024, 2, 1, 10, 0, 0), 6],
  ['0 9 * * 1-5', Date.UTC(2024, 2, 1, 10, 0, 0), 5],
  ['0 0 1 * *', Date.UTC(2024, 2, 15, 0, 0, 0), 3],
  ['30 2 29 2 *', Date.UTC(2024, 2, 1, 0, 0, 0), 2],
  ['0 12 * * 0', Date.UTC(2024, 2, 1, 0, 0, 0), 3],
  ['15 10 1,15 * *', Date.UTC(2024, 2, 1, 0, 0, 0), 3],
  ['0 9-17 * * 1-5', Date.UTC(2024, 2, 2, 8, 0, 0), 4],
  ['0 22-2 * * *', Date.UTC(2024, 2, 1, 12, 0, 0), 5],
  ['0 0 * * 7', Date.UTC(2024, 2, 1, 0, 0, 0), 2],
  ['5 4 * * sun', Date.UTC(2024, 2, 1, 0, 0, 0), 2],
  ['0 0 1 1,4,7,10 *', Date.UTC(2024, 2, 15, 0, 0, 0), 3],
  ['0 0 1,15 * 1', Date.UTC(2024, 2, 1, 0, 0, 0), 6],
]
for (const [expr, from, count] of runs) {
  const got = C.nextRuns(expr, count, new Date(from))
  const want = refNext(expr, count, new Date(from))
  T.eq('nextRuns 条数 ' + expr, got.length, want.length)
  T.eq('nextRuns 时间戳 ' + expr, got.map((x) => x.getTime()), want.map((x) => x.getTime()))
}
for (const [expr, from, count] of runs) {
  const got = C.nextRuns(expr, count, new Date(from))
  T.ok('nextRuns 严格递增 ' + expr, got.every((x, i) => (i === 0 ? x.getTime() > from : x.getTime() > got[i - 1].getTime())))
  T.ok('nextRuns 秒毫秒归零 ' + expr, got.every((x) => x.getSeconds() === 0 && x.getMilliseconds() === 0))
}

/* 已知的日历锚点，独立钉一遍 */
T.eq('工作日 9 点下一次是周一', C.nextRuns('0 9 * * 1-5', 1, new Date(Date.UTC(2024, 2, 1, 10, 0, 0)))[0].getTime(), Date.UTC(2024, 2, 4, 9, 0, 0))
T.eq('2/29 下一次是 2028 闰年', C.nextRuns('30 2 29 2 *', 1, new Date(Date.UTC(2024, 2, 1, 0, 0, 0)))[0].getTime(), Date.UTC(2028, 1, 29, 2, 30, 0))
T.eq('跨零点顺序', C.nextRuns('0 22-2 * * *', 3, new Date(Date.UTC(2024, 2, 1, 12, 0, 0))).map((x) => x.getUTCHours()), [22, 23, 0])

/* count 夹取 */
T.eq('count 0 取默认 10', C.nextRuns('* * * * *', 0, new Date(Date.UTC(2024, 2, 1, 0, 0, 0))).length, 10)
T.eq('count 上限 50', C.nextRuns('* * * * *', 100, new Date(Date.UTC(2024, 2, 1, 0, 0, 0))).length, 50)

/* ===== 3. 非法表达式：必须给中文错 ===== */
const bads = [
  ['', '请输入'],
  ['* * * *', '5 段'],
  ['* * * * * *', '5 段'],
  ['60 * * * *', '分钟'],
  ['* 24 * * *', '小时'],
  ['0 0 0 * *', '日'],
  ['0 0 * 13 *', '月'],
  ['* * * * 8', '星期'],
  ['*/0 * * * *', '正整数'],
  ['a * * * *', '看不懂'],
  ['1,,2 * * * *', '空的分段'],
  ['0 0 L * *', 'L / W / #'],
  ['0 0 * * 1#2', 'L / W / #'],
  ['0 0 * * W', 'L / W / #'],
]
for (const [e, frag] of bads) {
  const r = C.parseCron(e)
  T.eq('parseCron 拒绝 ' + JSON.stringify(e), r.ok, false)
  T.ok('parseCron 报错是中文 ' + JSON.stringify(e), /[\u4e00-\u9fa5]/.test(r.error))
  T.ok('parseCron 报错含「' + frag + '」', r.error.indexOf(frag) > -1, r.error)
}
T.throws('nextRuns 非法表达式抛中文', () => C.nextRuns('bad'), /5 段/)
T.throws('nextRuns 越界抛中文', () => C.nextRuns('60 * * * *'), /分钟/)

/* ===== 4. fmtDate / describeField / describe ===== */
T.eq('fmtDate', C.fmtDate(new Date(Date.UTC(2024, 1, 29, 9, 5, 0))), '2024-02-29 09:05 周四')
T.eq('fmtDate 周日', C.fmtDate(new Date(Date.UTC(2024, 2, 3, 0, 0, 0))), '2024-03-03 00:00 周日')
T.eq('describeField 分钟全量', C.describeField('min', Array.from({ length: 60 }, (_, i) => i), '*'), '每分钟')
T.eq('describeField 工作日', C.describeField('dow', [1, 2, 3, 4, 5], '1-5'), '工作日')
T.eq('describeField 周末', C.describeField('dow', [0, 6], '0,6'), '周末')
T.eq('describeField 月份', C.describeField('month', [1], '1'), '1 月')
T.eq('describeField 小时补零', C.describeField('hour', [9], '9'), '09')
T.eq('describeField 分钟列表', C.describeField('min', [0, 30], '0,30'), '00、30')
T.eq('describeField 日不补零', C.describeField('dom', [1, 15], '1,15'), '1、15')

const de1 = C.describe('0 9 * * 1-5')
T.eq('describe ok', de1.ok, true)
T.eq('describe 汇总带工作日', de1.summary, '工作日 09:00')
T.eq('describe lines 五段', de1.lines.length, 5)
T.eq('describe 每分钟', C.describe('* * * * *').summary, '每分钟执行一次')
T.eq('describe 每天 0 点', C.describe('0 0 * * *').summary, '每天 00:00')
T.eq('describe 每小时整点', C.describe('0 * * * *').summary, '每小时的 00 分执行')
T.eq('describe parallel（日周都限定）', C.describe('0 0 1 * 1').parallel, true)
T.eq('describe parallel（只限周）', C.describe('0 0 * * 1').parallel, false)
T.eq('describe 非法给 ok:false', C.describe('bad').ok, false)
T.ok('describe lines 字段齐全', de1.lines.every((l) => l.name && l.raw && l.text))
T.ok('describe 无 undefined/NaN', de1.lines.every((l) => !/undefined|NaN/.test(l.text)) && !/undefined|NaN/.test(de1.summary))

/* ===== 5. 预置表达式 ===== */
T.eq('presets 数量 12', C.CRON_PRESETS.length, 12)
T.ok('presets 都能解析', C.CRON_PRESETS.every((p) => C.parseCron(p.expr).ok))
T.ok('presets 名字唯一', new Set(C.CRON_PRESETS.map((p) => p.name)).size === 12)
T.ok('presets 表达式唯一', new Set(C.CRON_PRESETS.map((p) => p.expr)).size === 12)
T.ok('presets 名字非空', C.CRON_PRESETS.every((p) => p.name.length > 1))

T.done()
