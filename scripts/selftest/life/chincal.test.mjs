/** 直接跑 src/utils/chincal.js 本体（harness 会把相对 import 在内存里改写掉），
 *  省掉 run.sh 那种「先 cp 一份 .mjs」的复制——复制会过期，测到的是旧代码。 */
import { useUtils } from '../harness.mjs'
const C = await useUtils('chincal')

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
    console.log('FAIL ' + m + ': should throw')
  } catch (e) {
    ok++
  }
}

/* ---------- 农历压缩数据解码 ---------- */
is(C.LUNAR_INFO.length, 201, 'dataLength')
is(C.leapMonthOf(2020), 4, 'leap2020')
is(C.leapMonthOf(2023), 2, 'leap2023')
is(C.leapMonthOf(2025), 6, 'leap2025')
is(C.leapMonthOf(2017), 6, 'leap2017')
is(C.leapMonthOf(2026), 0, 'leap2026')
is(C.leapMonthOf(1984), 10, 'leap1984')
is(C.monthDaysOf(2025, 1), 30, 'm1_2025')
is(C.lunarYearDaysOf(2025) > 354, true, 'year2025Long')
is(C.lunarYearDaysOf(2026) >= 353 && C.lunarYearDaysOf(2026) <= 355, true, 'year2026Normal')
is(C.lunarMonthsOf(2025).length, 13, 'months2025')
is(C.lunarMonthsOf(2026).length, 12, 'months2026')

/* ---------- 公历 → 农历（硬编码对照） ---------- */
const a = C.solarToLunar(2025, 1, 29)
is(a.lunarYear, 2025, '2025spring.year')
is(a.lunarMonth, 1, '2025spring.month')
is(a.lunarDay, 1, '2025spring.day')
is(a.ganzhiYear, '乙巳', '2025spring.gz')
is(a.zodiac, '蛇', '2025spring.zodiac')
is(a.text, '乙巳年正月初一', '2025spring.text')

const b = C.solarToLunar(2024, 2, 10)
is(b.lunarMonth, 1, '2024spring.month')
is(b.lunarDay, 1, '2024spring.day')
is(b.ganzhiYear, '甲辰', '2024spring.gz')
is(b.zodiac, '龙', '2024spring.zodiac')

const c = C.solarToLunar(2026, 9, 25)
is(c.lunarMonth, 8, '2026mid.month')
is(c.lunarDay, 15, '2026mid.day')
is(c.festival.indexOf('中秋') >= 0, true, '2026mid.festival')

const d = C.solarToLunar(2025, 1, 28)
is(d.lunarMonth, 12, '2025newyeve.month')
is(d.festival.indexOf('除夕') >= 0, true, '2025newyeve.festival')

// 2023 癸卯年春节 = 1 月 22 日
const e = C.solarToLunar(2023, 1, 22)
is(e.lunarMonth, 1, '2023spring.month')
is(e.lunarDay, 1, '2023spring.day')
is(e.ganzhiYear, '癸卯', '2023spring.gz')
is(e.zodiac, '兔', '2023spring.zodiac')

// 端午 2025 = 5 月 31 日
const duanwu = C.lunarToSolar(2025, 5, 5, false).solar.text
is(duanwu, '2025-05-31', 'duanwu2025')
// 七夕 2024 = 8 月 10 日
is(C.lunarToSolar(2024, 7, 7, false).solar.text, '2024-08-10', 'qixi2024')
// 反向锚点：这些公历日必须命中对应节日（全部来自公开年历）
is(C.solarToLunar(2024, 2, 24).festival.indexOf('元宵') >= 0, true, 'yuanxiao2024')
is(C.solarToLunar(2023, 6, 22).festival.indexOf('端午') >= 0, true, 'duanwu2023')
is(C.solarToLunar(2025, 10, 6).festival.indexOf('中秋') >= 0, true, 'zhongqiu2025')
is(C.solarToLunar(2025, 10, 29).festival.indexOf('重阳') >= 0, true, 'chongyang2025')
is(C.solarToLunar(2026, 1, 26).festival.indexOf('腊八') >= 0, true, 'laba2026')
is(C.solarToLunar(2026, 2, 10).festival.indexOf('小年（北方）') >= 0, true, 'xiaonian2026')
is(C.solarToLunar(2026, 2, 11).festival.indexOf('小年（南方）') >= 0, true, 'xiaonianSouth2026')
is(C.solarToLunar(2026, 2, 16).festival.indexOf('除夕') >= 0, true, 'chuxi2026')
is(C.lunarToSolar(2023, 1, 1, false).solar.text, '2023-01-22', 'spring2023l2s')
is(C.lunarToSolar(2027, 1, 1, false).solar.text, '2027-02-06', 'spring2027l2s')
// 史实锚点：开国大典 = 己丑年八月初十；民国元年 = 壬子年正月初一；农历数据起点 = 庚子年正月初一
is(C.solarToLunar(1949, 10, 1).text, '己丑年八月初十', 'guoqing1949')
is(C.solarToLunar(1912, 2, 18).text, '壬子年正月初一', 'minguo1912')
is(C.solarToLunar(1900, 1, 31).text, '庚子年正月初一', 'base1900')
is(C.solarToLunar(1900, 1, 31).lunarDay, 1, 'base1900day')
throws(() => C.solarToLunar(1900, 1, 30), 'beforeBaseDay')
// 2025 闰六月初一 = 公历 7 月 25 日（闰六月小月 29 天，八月朔为 8 月 23 日）
is(C.solarToLunar(2025, 7, 25).isLeapMonth, true, 'leap6start')
is(C.solarToLunar(2025, 7, 25).lunarMonth, 6, 'leap6month')
is(C.solarToLunar(2025, 7, 25).lunarDay, 1, 'leap6day')
is(C.solarToLunar(2025, 8, 23).lunarMonth, 7, 'leap6endNext')
is(C.solarToLunar(2025, 8, 23).lunarDay, 1, 'leap6endNextDay')
is(C.solarToLunar(2025, 8, 29).festival.indexOf('七夕') >= 0, true, 'qixi2025')

/* ---------- 双向闭合 ---------- */
let closed = 0
let checked = 0
for (let ms = Date.UTC(1901, 0, 1); ms <= Date.UTC(2099, 11, 31); ms += 86400000 * 7) {
  const p = new Date(ms)
  const r = C.roundTripCheck(p.getUTCFullYear(), p.getUTCMonth() + 1, p.getUTCDate())
  checked++
  if (r.closed) closed++
  else if (closed + 3 > checked) console.log('NOT CLOSED', r.solar, r.lunar, r.back)
}
is(closed, checked, 'roundTripAll(' + checked + ')')

/* ---------- 农历 → 公历 ---------- */
is(C.lunarToSolar(2025, 1, 1, false).solar.text, '2025-01-29', 'l2s2025')
is(C.lunarToSolar(2024, 2, 10, false).solar.text, '2024-03-19', 'l2s2024-2-10')
throws(() => C.lunarToSolar(2026, 1, 31, false), 'no31')
throws(() => C.lunarToSolar(2026, 13, 1, false), 'badMonth')
throws(() => C.lunarToSolar(2025, 2, 30, false), 'dayTooBig')
throws(() => C.solarToLunar(2023, 2, 30), 'invalidSolar')
throws(() => C.solarToLunar(1899, 12, 31), 'beforeBase')
throws(() => C.solarToLunar(2200, 1, 1), 'afterRange')
is(C.springFestivalOf(2026).text, '2026-02-17', 'spring2026')
is(C.springFestivalOf(2023).text, '2023-01-22', 'spring2023')

/* ---------- 干支纪日 / 纪月 / 纪时 ---------- */
is(C.ganzhiOfDay(2000, 1, 1).ganzhi, '戊午', 'gz20000101')
is(C.ganzhiOfDay(1949, 10, 1).ganzhi, '甲子', 'gz19491001')
is(C.julianDayNumber(2000, 1, 1), 2451545, 'jdn2000')
is(C.ganzhiOfDay(2024, 2, 10).index, (C.julianDayNumber(2024, 2, 10) + 49) % 60, 'gzIdx')
is(C.ganzhiOfIndex(0).ganzhi, '甲子', 'gz0')
is(C.ganzhiOfIndex(59).ganzhi, '癸亥', 'gz59')
is(C.ganzhiIndex('癸亥'), 59, 'gzBack')
is(C.ganzhiOfYear(2025).ganzhi, '乙巳', 'gzy2025')
is(C.ganzhiOfYear(1984).ganzhi, '甲子', 'gzy1984')
is(C.ganzhiOfYear(4).ganzhi, '甲子', 'gzy4')
is(C.ganzhiOfMonth(2025, 2, 10).ganzhi, '戊寅', 'gzm2025yin')
is(C.ganzhiOfMonth(2025, 12, 20).ganzhi, '戊子', 'gzm2025zi')
is(C.ganzhiOfMonth(2026, 1, 10).ganzhi, '己丑', 'gzm2026chou')
is(C.ganzhiOfMonth(2026, 2, 20).ganzhi, '庚寅', 'gzm2026yin')
is(C.ganzhiOfHour(2000, 1, 1, 23).ganzhi, '甲子', 'gzh23')
is(C.ganzhiOfHour(2000, 1, 2, 0).ganzhi, '甲子', 'gzh0ofNextDay')
is(C.ganzhiOfHour(2000, 1, 1, 0).ganzhi, '壬子', 'gzh0')
is(C.ganzhiOfHour(2000, 1, 1, 0, false).ganzhi, '壬子', 'gzh0noSwap')
is(C.ganzhiOfHour(2000, 1, 1, 23, false).ganzhi, '壬子', 'gzh23noSwap')
is(C.ganzhiOfHour(2000, 1, 1, 12).ganzhi, '戊午', 'gzh12')
is(C.doubleHourOf(23), 0, 'dh23')
is(C.doubleHourOf(1), 1, 'dh1')
is(C.doubleHourOf(2), 1, 'dh2')

/* ---------- 二十四节气 ---------- */
is(C.SOLAR_TERMS.length, 24, 'terms24')
const lichun2025 = C.solarTermDay(2025, 2)
is(lichun2025.year, 2025, 'lichun2025y')
is(lichun2025.month, 2, 'lichun2025m')
is(lichun2025.day, 3, 'lichun2025d')
is(lichun2025.fixed, false, 'lichun2025fix')
is(C.solarTermDay(2024, 5).day, 20, 'chunfen2024')
is(C.solarTermDay(2024, 5).month, 3, 'chunfen2024m')
is(C.solarTermDay(2025, 23).day, 21, 'dongzhi2025')
is(C.solarTermDay(2024, 6).day, 4, 'qingming2024')
is(C.solarTermDay(2026, 3).day, 18, 'yushui2026fixed')
is(C.solarTermDay(2021, 0).day, 5, 'xiaohan2021')
is(C.solarTermDay(1980, 2).month, 2, 'lichun1980m')
is(C.solarTermDay(1980, 2).day, 5, 'lichun1980')
is(C.solarTermDay(1980, 23).day, 21, 'dongzhi1980')
is(C.solarTermsOfYear(2025).length, 24, 'termsOfYear')
is(C.solarTermsOfYear(2025)[0].date, '2025-01-05', 'term0')
is(C.solarTermOfDate(2025, 1, 29).name, '大寒', 'termOf1-29')
is(C.nextSolarTerm(2025, 1, 29).name, '立春', 'nextTerm')
is(C.nextSolarTerm(2025, 1, 29).date, '2025-02-03', 'nextTermDate')
is(C.nextSolarTerm(2025, 1, 29).daysAway, 5, 'nextTermDays')
throws(() => C.solarTermDay(1800, 0), 'termOutOfRange')
throws(() => C.solarTermDay(2025, 99), 'termBadIdx')
// 节气按时间单调递增
const ty = C.solarTermsOfYear(2025)
let mono = true
for (let i = 1; i < 24; i++) if (ty[i].jdn <= ty[i - 1].jdn) mono = false
is(mono, true, 'termsMonotonic')

/* ---------- 中文读法 ---------- */
is(C.lunarDayName(1), '初一', 'd1')
is(C.lunarDayName(10), '初十', 'd10')
is(C.lunarDayName(11), '十一', 'd11')
is(C.lunarDayName(20), '二十', 'd20')
is(C.lunarDayName(21), '廿一', 'd21')
is(C.lunarDayName(29), '廿九', 'd29')
is(C.lunarDayName(30), '三十', 'd30')
throws(() => C.lunarDayName(31), 'd31')
is(C.lunarMonthName(1, false), '正月', 'm1')
is(C.lunarMonthName(11, false), '冬月', 'm11')
is(C.lunarMonthName(12, true), '闰腊月', 'm12leap')
is(C.cnNumber(0), '零', 'cn0')
is(C.cnNumber(15), '十五', 'cn15')
is(C.cnNumber(20), '二十', 'cn20')
is(C.cnNumber(42), '四十二', 'cn42')
is(C.cnNumber(99), '九十九', 'cn99')

/* ---------- 生日 / 倒计时 ---------- */
const bs = C.birthdaySync({ year: 1990, month: 6, day: 15 }, { year: 2026, month: 9, day: 1 })
is(bs.birthLunar.text, '庚午年五月廿三', 'birthLunar')
is(!!bs.nextLunar, true, 'hasNextLunar')
is(bs.nextLunar.solar.year >= 2026, true, 'nextYearOk')
const nl = C.nextLunarBirthday({ year: 2025, month: 1, day: 1, isLeap: false }, { year: 2027, month: 1, day: 1 })
is(nl.solar.text, '2027-02-06', 'nextLunarBd')
is(nl.lunar.text, '丁未年正月初一', 'nextLunarText')
is(nl.daysAway, 36, 'nextLunarDaysAway')
// 生日在腊月三十，遇到小月腊月要顺延提示（2021 年腊月只有 29 天）
const no30 = C.nextLunarBirthday({ year: 2021, month: 12, day: 30, isLeap: false }, { year: 2025, month: 1, day: 1 })
is(no30.solar.text, '2025-01-28', 'la30Solar')
is(no30.lunar.day, 29, 'la30Day')
is(no30.note.indexOf('廿九') >= 0, true, 'la30Note')
const nsb = C.nextSolarBirthday({ year: 2000, month: 2, day: 29 }, { year: 2026, month: 3, day: 1 })
is(nsb.solar.text, '2027-02-28', 'feb29fallback')
const dl = C.daysLived({ year: 2000, month: 1, day: 1 }, { year: 2000, month: 1, day: 11 })
is(dl.days, 10, 'daysLived')
throws(() => C.daysLived({ year: 2030, month: 1, day: 1 }, { year: 2020, month: 1, day: 1 }), 'bornFuture')

/* ---------- 汇总 ---------- */
const sm = C.calendarSummary(2026, 9, 25)
is(sm.lunarMonth, 8, 'sum.month')
is(sm.dayOfYear, 268, 'sum.doy')
is(sm.daysLeftInYear, 97, 'sum.left')
is(sm.leapYear, false, 'sum.leap')
is(C.calendarSummary(2024, 12, 31).daysLeftInYear, 0, 'sumDec31')
is(C.calendarSummary(2024, 3, 1).dayOfYear, 61, 'sumDoyLeap')
is(C.lunarYearProfile(2025).months.length, 13, 'profile2025')
is(C.festivalTable().length >= 10, true, 'festivalTable')
is(C.festivalTable().filter((f) => f.name === '中秋节')[0].label, '八月十五', 'festivalLabel')

console.log('== chincal pass=' + ok + '/' + (ok + fail))
if (fail) process.exitCode = 1
