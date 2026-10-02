/**
 * date.js 自查断言（直接测 src/utils/date.js 本体）
 * ------------------------------------------------------------
 * 判据分四类，每类的外部来源写清楚：
 *   1) 日历事实：格里高利历闰年规则、每月天数、ISO 周号、星期几，都是公开日历事实，
 *      直接写死已知答案（2024-02-29 是星期四 / 年内第 60 天 / ISO 第 9 周；1900 不是闰年、2000 是）。
 *   2) 外部裁判：用 Date.UTC 显式构造时间戳，再用 toISOString()（天然 UTC，不受本机时区影响）
 *      切出年-月-日与时分秒，拿它跟 formatDate / parseTimestamp 的输出对撞，不抄实现。
 *   3) 往返与性质：workdaysBetween 用测试里独立写的 UTC 逐日计数对撞；daysBetween 反对称；
 *      addDays 与 Date.UTC 的差值一致；ageFrom.totalDays 与 daysBetween 自洽。
 *   4) 边界与反例：空/非法日期、0、负数、2024-02-29 与 2023-02-29、世纪闰年。
 *
 * 时区：本机是 UTC+8、CI 是 UTC。这里把进程时区钉成 UTC（必须在动态装载模块之前生效），
 * 所有断言只用 Date.UTC 构造输入，不出现「今天/现在」这种依赖当前时刻的期望值；
 * 相对时间只用「相对偏移」来定桶，避免踩到分/时/天边界。
 */
import { useUtils, makeTest } from './harness.mjs'

// 钉时区：useUtils 是动态 import，会在这句之后才装载模块，因此一定生效。
process.env.TZ = 'UTC'

const D = await useUtils('date')
const T = makeTest('date')

/* 外部裁判：toISOString() 天然是 UTC，用切片当独立期望值 */
const iso = (ms) => new Date(ms).toISOString()
const expDateTime = (ms) => iso(ms).slice(0, 10) + ' ' + iso(ms).slice(11, 19)
const expYMD = (ms) => iso(ms).slice(0, 10)
const expHMS = (ms) => iso(ms).slice(11, 19)
const expMs3 = (ms) => iso(ms).slice(20, 23)

/* ---------- 1. pad2 ---------- */
T.eq('pad2 0', D.pad2(0), '00')
T.eq('pad2 9', D.pad2(9), '09')
T.eq('pad2 10', D.pad2(10), '10')
T.eq('pad2 三位', D.pad2(123), '123')

/* ---------- 2. formatDate：期望值由 toISOString 独立切出 ---------- */
const dt = Date.UTC(2024, 1, 29, 13, 5, 7, 9)
T.eq('formatDate 默认格式', D.formatDate(dt), expDateTime(dt))
T.eq('formatDate 默认格式=已知值', D.formatDate(dt), '2024-02-29 13:05:07')
T.eq('formatDate 日期段', D.formatDate(dt, 'YYYY/MM/DD'), expYMD(dt).replace(/-/g, '/'))
T.eq('formatDate 时间段', D.formatDate(dt, 'HH:mm:ss'), expHMS(dt))
T.eq('formatDate 毫秒段', D.formatDate(dt, 'SSS'), expMs3(dt))
T.eq('formatDate YY 两位年', D.formatDate(Date.UTC(2001, 0, 1), 'YY'), '01')
T.eq('formatDate 不补零变体', D.formatDate(Date.UTC(2024, 1, 9, 7, 5, 3), 'M/D H:m:s'), '2/9 7:5:3')
T.eq('formatDate 非法日期给空串', D.formatDate('不是日期'), '')
T.eq('formatDate NaN 时间戳给空串', D.formatDate(NaN), '')
T.ok('formatDate 形状正确', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(D.formatDate(dt)))
T.ok('formatDate 不出现 undefined/NaN', !/undefined|NaN/.test(D.formatDate(dt, 'YYYY-MM-DD HH:mm:ss SSS')))

/* ---------- 3. parseTimestamp：秒/毫秒自动判断 ---------- */
T.eq('parseTimestamp 10 位按秒', D.parseTimestamp('1700000000').unit, 's')
T.eq('parseTimestamp 10 位毫秒值（外部裁判）', D.parseTimestamp('1700000000').ms, Date.UTC(2023, 10, 14, 22, 13, 20))
T.eq('parseTimestamp 13 位按毫秒', D.parseTimestamp('1700000000000').unit, 'ms')
T.eq('parseTimestamp 13 位毫秒值', D.parseTimestamp('1700000000000').ms, 1700000000000)
T.eq('parseTimestamp 负数按秒', D.parseTimestamp('-1').unit, 's')
T.eq('parseTimestamp 非数字 unit 空', D.parseTimestamp('abc').unit, '')
T.ok('parseTimestamp 非数字给 NaN', Number.isNaN(D.parseTimestamp('abc').ms))
T.eq('parseTimestamp 11 位按秒', D.parseTimestamp('17000000000').unit, 's')
T.eq('parseTimestamp 14 位按毫秒', D.parseTimestamp('17000000000000').unit, 'ms')
T.eq('parseTimestamp 带空格也能解析', D.parseTimestamp('  1700000000  ').unit, 's')

/* ---------- 4. 年内第几天 / ISO 周 / 星期：日历事实 ---------- */
T.eq('dayOfYear 闰日 2/29', D.dayOfYear(Date.UTC(2024, 1, 29)), 60)
T.eq('dayOfYear 平年 3/1 也是第 60 天', D.dayOfYear(Date.UTC(2023, 2, 1)), 60)
T.eq('dayOfYear 闰年最后一天', D.dayOfYear(Date.UTC(2024, 11, 31)), 366)
T.eq('dayOfYear 平年最后一天', D.dayOfYear(Date.UTC(2023, 11, 31)), 365)
T.eq('dayOfYear 元旦', D.dayOfYear(Date.UTC(2023, 0, 1)), 1)

const weeks = [
  [Date.UTC(2024, 0, 1), 1], [Date.UTC(2024, 0, 7), 1], [Date.UTC(2024, 0, 8), 2],
  [Date.UTC(2024, 1, 29), 9], [Date.UTC(2024, 11, 29), 52], [Date.UTC(2024, 11, 30), 1],
  [Date.UTC(2023, 0, 1), 52], [Date.UTC(2021, 0, 1), 53], [Date.UTC(2021, 0, 4), 1],
  [Date.UTC(2020, 11, 31), 53],
]
for (const [ms, w] of weeks) T.eq('isoWeek ' + iso(ms).slice(0, 10), D.isoWeek(ms), w)

T.eq('weekdayCN 闰日', D.weekdayCN(Date.UTC(2024, 1, 29)), '星期四')
T.eq('weekdayCN 周日', D.weekdayCN(Date.UTC(2024, 2, 3)), '星期日')
T.eq('weekdayCN 周一', D.weekdayCN(Date.UTC(2024, 0, 1)), '星期一')

/* ---------- 5. 相对时间：只用相对偏移定桶，不依赖当前时刻 ---------- */
const now = Date.now()
T.eq('相对 刚刚', D.relativeTime(now - 5000), '刚刚')
T.eq('相对 3 分钟前', D.relativeTime(now - (3 * 60000 + 30000)), '3 分钟前')
T.eq('相对 2 小时后', D.relativeTime(now + (2 * 3600000 + 30000)), '2 小时后')
T.eq('相对 2 天前', D.relativeTime(now - (2 * 86400000 + 3600000)), '2 天前')
T.eq('相对 2 个月前', D.relativeTime(now - 61 * 86400000), '2 个月前')
T.eq('相对 1.1 年前', D.relativeTime(now - 401 * 86400000), '1.1 年前')
T.eq('相对 字符串入参', D.relativeTime(new Date(now - (3 * 60000 + 30000)).toISOString()), '3 分钟前')

/* ---------- 6. 闰年 / 每月天数 ---------- */
for (const [y, v] of [[2024, true], [2023, false], [1900, false], [2000, true], [2100, false], [1600, true]]) {
  T.eq('isLeapYear ' + y, D.isLeapYear(y), v)
}
for (const [y, m, v] of [[2024, 2, 29], [2023, 2, 28], [2000, 2, 29], [1900, 2, 28], [2024, 4, 30], [2023, 1, 31], [2024, 12, 31]]) {
  T.eq('daysInMonth ' + y + '-' + m, D.daysInMonth(y, m), v)
}

/* ---------- 7. daysBetween ---------- */
T.eq('daysBetween 闰年 2/28→3/1', D.daysBetween(Date.UTC(2024, 1, 28), Date.UTC(2024, 2, 1)), 2)
T.eq('daysBetween 平年 2/28→3/1', D.daysBetween(Date.UTC(2023, 1, 28), Date.UTC(2023, 2, 1)), 1)
T.eq('daysBetween 同一天为 0', D.daysBetween(Date.UTC(2024, 0, 1), Date.UTC(2024, 0, 1)), 0)
T.eq('daysBetween 2024 整年 366 天', D.daysBetween(Date.UTC(2024, 0, 1), Date.UTC(2025, 0, 1)), 366)
T.eq('daysBetween 忽略时分秒', D.daysBetween(Date.UTC(2024, 0, 1, 23), Date.UTC(2024, 0, 2, 1)), 1)
T.eq('daysBetween 反对称', D.daysBetween(Date.UTC(2024, 2, 1), Date.UTC(2024, 1, 28)), -2)

/* ---------- 8. 周末 / 工作日：独立 UTC 逐日计数当裁判 ---------- */
const refWorkdays = (a, b, inclusive) => {
  const d1 = new Date(a)
  const d2 = new Date(b)
  const s = d1 <= d2 ? d1 : d2
  const e = d1 <= d2 ? d2 : d1
  const start = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate())
  const end = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate())
  const last = inclusive ? end : end - 86400000
  let c = 0
  for (let t = start; t <= last; t += 86400000) {
    const w = new Date(t).getUTCDay()
    if (w !== 0 && w !== 6) c++
  }
  return c
}
T.eq('workdays 半开区间一周', D.workdaysBetween(Date.UTC(2024, 0, 1), Date.UTC(2024, 0, 8)), 5)
T.eq('workdays 闭区间一周零一天', D.workdaysBetween(Date.UTC(2024, 0, 1), Date.UTC(2024, 0, 8), { inclusive: true }), 6)
T.eq('workdays 反向一致', D.workdaysBetween(Date.UTC(2024, 0, 8), Date.UTC(2024, 0, 1)), 5)
T.eq('workdays 单天周六为 0', D.workdaysBetween(Date.UTC(2024, 0, 6), Date.UTC(2024, 0, 6), { inclusive: true }), 0)
T.eq('workdays 单天周一为 1', D.workdaysBetween(Date.UTC(2024, 0, 8), Date.UTC(2024, 0, 8), { inclusive: true }), 1)
T.eq('workdays 整周含周日', D.workdaysBetween(Date.UTC(2024, 0, 1), Date.UTC(2024, 0, 7), { inclusive: true }), 5)
T.eq('workdays 独立参考（半开）', D.workdaysBetween(Date.UTC(2024, 1, 1), Date.UTC(2024, 2, 1)), refWorkdays(Date.UTC(2024, 1, 1), Date.UTC(2024, 2, 1), false))
T.eq('workdays 独立参考（闭区间）', D.workdaysBetween(Date.UTC(2024, 5, 1), Date.UTC(2024, 5, 30), { inclusive: true }), refWorkdays(Date.UTC(2024, 5, 1), Date.UTC(2024, 5, 30), true))

/* ---------- 9. addDays ---------- */
T.eq('addDays 闰年 2/28+1', D.addDays(Date.UTC(2024, 1, 28), 1).getTime(), Date.UTC(2024, 1, 29))
T.eq('addDays 闰日+1', D.addDays(Date.UTC(2024, 1, 29), 1).getTime(), Date.UTC(2024, 2, 1))
T.eq('addDays 平年 2/28+1', D.addDays(Date.UTC(2023, 1, 28), 1).getTime(), Date.UTC(2023, 2, 1))
T.eq('addDays 跨年 -1', D.addDays(Date.UTC(2024, 0, 1), -1).getTime(), Date.UTC(2023, 11, 31))
T.eq('addDays +0 不变', D.addDays(Date.UTC(2024, 5, 15), 0).getTime(), Date.UTC(2024, 5, 15))
T.ok('addDays 返回 Date 实例', D.addDays(Date.UTC(2024, 0, 1), 1) instanceof Date)

/* ---------- 10. ageFrom ---------- */
const a1 = D.ageFrom(Date.UTC(2000, 0, 1), Date.UTC(2024, 0, 1))
T.eq('age 生日当天 years', a1.years, 24)
T.eq('age 生日当天 months', a1.months, 0)
T.eq('age 生日当天 days', a1.days, 0)
T.eq('age 生日当天 nextBirthdayIn 0', a1.nextBirthdayIn, 0)
T.eq('age totalDays 与 daysBetween 自洽', a1.totalDays, D.daysBetween(Date.UTC(2000, 0, 1), Date.UTC(2024, 0, 1)))

const a2 = D.ageFrom(Date.UTC(2000, 0, 1), Date.UTC(2024, 1, 29))
T.eq('age 闰日 years', a2.years, 24)
T.eq('age 闰日 months', a2.months, 1)
T.eq('age 闰日 days', a2.days, 28)
T.eq('age 下次生日还有 307 天', a2.nextBirthdayIn, 307)

const a3 = D.ageFrom(Date.UTC(2000, 1, 29), Date.UTC(2024, 2, 1))
T.eq('age 2/29 出生 years', a3.years, 24)
T.eq('age 2/29 出生 months', a3.months, 0)
T.eq('age 2/29 出生 days', a3.days, 1)

const a4 = D.ageFrom(Date.UTC(2000, 1, 29), Date.UTC(2024, 1, 28))
T.eq('age 差一天不满 24 岁', a4.years, 23)
T.ok('age 月/日分解非负', a4.months >= 0 && a4.days >= 0)
T.eq('age 非法生日给 null', D.ageFrom('不是日期', Date.UTC(2024, 0, 1)), null)

/* ---------- 11. 时区已钉死 + UI 契约 ---------- */
T.eq('时区已钉成 UTC（偏移 0）', D.TZ_OFFSET_MINUTES, 0)
T.ok('格式串不含 undefined', !/undefined/.test(D.formatDate(dt, 'YYYY-MM-DD HH:mm:ss')))
T.ok('格式串不含 NaN', !/NaN/.test(D.formatDate(dt, 'YYYY-MM-DD HH:mm:ss')))

T.done()
