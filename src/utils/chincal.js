/**
 * 农历 · 二十四节气 · 干支
 * ------------------------------------------------------------
 * 纯函数层：不碰 uni、不碰 DOM；所有日期都以「年月日三元组 + 儒略日序数」
 * 参与运算，不用本地时区的 Date 取值，避免手机改时区后算错天。
 *
 * 数据表
 *   LUNAR_INFO：1900—2100 共 201 个农历年，标准压缩编码。
 *     · 低 4 位（0x1）      —— 闰月月份，0 表示该年无闰月
 *     ·  bit 15 … bit 4     —— 正月至十二月的月大小，1 为 30 天（大月）、0 为 29 天
 *     ·  bit 16（0x10000）   —— 闰月的月大小，1 为 30 天
 *     这套编码源自公开的《农历数据（1900—2100）》表（紫金山天文台历年
 *     《中国天文年历》整理值），编码/解码逻辑本文件自行实现。
 *   节气用「通用寿星公式」近似，见 SOLAR_TERM_C。
 *
 * 精度声明：农历部分在 1900—2100 内与年历一致；节气为公式推算，
 * 个别年份与天文时刻可能相差 1 天；干支纪日的子时换日采用 23:00 口径。
 * 所有结果仅供日常参考，不构成命理、医疗或法律建议。
 */

import { daysInMonth, isLeapYear } from './date'

export const LUNAR_YEAR_FROM = 1900
export const LUNAR_YEAR_TO = 2100
export const LUNAR_DATA_SOURCE = '农历压缩数据表 1900—2100（据公开整理的《中国天文年历》数据）'

/** 1900—2100 农历压缩数据，每年一个 17 位十六进制数 */
export const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900-1909
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910-1919
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920-1929
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930-1939
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940-1949
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950-1959
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960-1969
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b5a0, 0x095b6, // 1970-1979
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980-1989
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0, // 1990-1999
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000-2009
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010-2019
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020-2029
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030-2039
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a5b7, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040-2049
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0, // 2050-2059
  0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, // 2060-2069
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, // 2070-2079
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, // 2080-2089
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252, // 2090-2099
  0x0d520, // 2100
]

/** 农历数据锚点：公历 1900-01-31 = 农历 1900 年正月初一 */
const BASE_UTC = Date.UTC(1900, 0, 31)

const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
const ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪']
const MONTH_CN = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊']
const DAY_1_10 = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十']
const DAY_11_19 = ['十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九']
const NUM_CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

/* ------------------------------------------------------------ 编码解码 */

function infoOfYear(y) {
  if (!(y >= LUNAR_YEAR_FROM && y <= LUNAR_YEAR_TO)) {
    throw new Error('农历数据只覆盖 ' + LUNAR_YEAR_FROM + '—' + LUNAR_YEAR_TO + ' 年')
  }
  return LUNAR_INFO[y - LUNAR_YEAR_FROM]
}

/** 该年的闰月月份（1—12），0 表示没有闰月 */
export function leapMonthOf(y) {
  return infoOfYear(y) & 0xf
}

/** 该年闰月的天数；没有闰月返回 0 */
export function leapMonthDaysOf(y) {
  const info = infoOfYear(y)
  if (!(info & 0xf)) return 0
  return info & 0x10000 ? 30 : 29
}

/** 该年某常规月的天数（bit15 对应正月，依次到低位） */
export function monthDaysOf(y, m) {
  if (!(m >= 1 && m <= 12)) throw new Error('农历月份要在 1—12 之间')
  return infoOfYear(y) & (0x10000 >> m) ? 30 : 29
}

/** 该农历年的总天数（12 或 13 个月相加） */
export function lunarYearDaysOf(y) {
  const info = infoOfYear(y)
  let sum = 348 // 12 × 29
  for (let bit = 0x8000; bit > 0x8; bit >>= 1) {
    if (info & bit) sum += 1
  }
  return sum + leapMonthDaysOf(y)
}

/** 列出该农历年实际包含的月（含闰月），用于遍历与校验 */
export function lunarMonthsOf(y) {
  const leap = leapMonthOf(y)
  const out = []
  for (let m = 1; m <= 12; m++) {
    out.push({ month: m, isLeap: false, days: monthDaysOf(y, m), name: lunarMonthName(m, false) })
    if (leap === m) {
      out.push({ month: m, isLeap: true, days: leapMonthDaysOf(y), name: lunarMonthName(m, true) })
    }
  }
  return out
}

/* ------------------------------------------------------------ 日期底层 */

function isSolarValid(y, m, d) {
  if (!(y >= 1 && m >= 1 && m <= 12)) return false
  return d >= 1 && d <= daysInMonth(y, m)
}

function utcOf(y, m, d) {
  return Date.UTC(y, m - 1, d)
}

function dayDiff(aUtc, bUtc) {
  return Math.round((bUtc - aUtc) / 86400000)
}

/** 从 UTC 毫秒拆回年月日（不用本地时区） */
function partsOfUtc(ms) {
  const d = new Date(ms)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/** 儒略日序数（proleptic Gregorian），干支纪日用它，跨历法连续 */
export function julianDayNumber(y, m, d) {
  const a = Math.floor((14 - m) / 12)
  const yy = y + 4800 - a
  const mm = m + 12 * a - 3
  return (
    d +
    Math.floor((153 * mm + 2) / 5) +
    365 * yy +
    Math.floor(yy / 4) -
    Math.floor(yy / 100) +
    Math.floor(yy / 400) -
    32045
  )
}

/* ------------------------------------------------------------ 中文读法 */

/** 农历初几：1—30 → 初一…初十、十一…十九、二十、廿一…廿九、三十 */
export function lunarDayName(d) {
  const n = Math.round(Number(d))
  if (!(n >= 1 && n <= 30)) throw new Error('农历日要在 1—30 之间')
  if (n <= 10) return DAY_1_10[n - 1]
  if (n <= 19) return DAY_11_19[n - 11]
  if (n === 20) return '二十'
  if (n < 30) return '廿' + NUM_CN[n - 20]
  return '三十'
}

/** 农历月名：正月…十月、冬月、腊月；闰月加「闰」 */
export function lunarMonthName(m, isLeap) {
  const n = Math.round(Number(m))
  if (!(n >= 1 && n <= 12)) throw new Error('农历月份要在 1—12 之间')
  return (isLeap ? '闰' : '') + MONTH_CN[n - 1] + '月'
}

/** 1—99 的中文读法（口语「初几到几十」） */
export function cnNumber(n) {
  const v = Math.round(Number(n))
  if (!isFinite(v) || v < 0 || v > 99) throw new Error('只支持 0—99')
  if (v < 10) return NUM_CN[v]
  if (v === 10) return '十'
  if (v < 20) return '十' + NUM_CN[v - 10]
  const tens = Math.floor(v / 10)
  const ones = v % 10
  return NUM_CN[tens] + '十' + (ones ? NUM_CN[ones] : '')
}

/** 农历完整日期串，如「乙巳年正月初一」 */
export function lunarText(ly, lm, ld, isLeap) {
  return ganzhiOfYear(ly).ganzhi + '年' + lunarMonthName(lm, isLeap) + lunarDayName(ld)
}

/* ------------------------------------------------------------ 干支 */

/** 60 甲子表里取第 i 个（0 = 甲子） */
export function ganzhiOfIndex(i) {
  const k = ((Math.round(Number(i)) % 60) + 60) % 60
  return { index: k, ganzhi: GAN[k % 10] + ZHI[k % 12] }
}

export function ganzhiIndex(gz) {
  const s = String(gz).trim()
  if (s.length < 2) return -1
  const g = GAN.indexOf(s.charAt(0))
  const z = ZHI.indexOf(s.charAt(1))
  if (g < 0 || z < 0) return -1
  // 解同余：i ≡ g (mod 10)、i ≡ z (mod 12)
  for (let i = 0; i < 60; i++) if (i % 10 === g && i % 12 === z) return i
  return -1
}

/** 干支纪年：以农历年号（正月初一为界）计，(year − 4) 取模 */
export function ganzhiOfYear(ly) {
  const y = Math.round(Number(ly))
  const g = ((y - 4) % 10 + 10) % 10
  const z = ((y - 4) % 12 + 12) % 12
  return { year: y, gan: GAN[g], zhi: ZHI[z], ganzhi: GAN[g] + ZHI[z], zodiac: ZODIAC[z], index: ((y - 4) % 60 + 60) % 60 }
}

export function zodiacOfYear(ly) {
  return ganzhiOfYear(ly).zodiac
}

/** 干支纪日：儒略日 +49 后模 60（0 = 甲子）。已核对 2000-01-01 = 戊午（六十循环第 55 位） */
export function ganzhiOfDay(y, m, d) {
  const jdn = julianDayNumber(y, m, d)
  const idx = ((jdn + 49) % 60 + 60) % 60
  return { jdn, index: idx, ganzhi: GAN[idx % 10] + ZHI[idx % 12] }
}

/** 时辰序号：23—1 为子时…11 为亥时 */
export function doubleHourOf(hour) {
  const h = ((Math.round(Number(hour)) % 24) + 24) % 24
  return Math.floor(((h + 1) % 24) / 2)
}

export const SHICHEN = [
  { zhi: '子', range: '23:00–01:00' },
  { zhi: '丑', range: '01:00–03:00' },
  { zhi: '寅', range: '03:00–05:00' },
  { zhi: '卯', range: '05:00–07:00' },
  { zhi: '辰', range: '07:00–09:00' },
  { zhi: '巳', range: '09:00–11:00' },
  { zhi: '午', range: '11:00–13:00' },
  { zhi: '未', range: '13:00–15:00' },
  { zhi: '申', range: '15:00–17:00' },
  { zhi: '酉', range: '17:00–19:00' },
  { zhi: '戌', range: '19:00–21:00' },
  { zhi: '亥', range: '21:00–23:00' },
]

/**
 * 干支纪时（五鼠遁日起时：甲己还加甲、乙庚丙作初…）
 * @param {boolean} ziSwap 23:00 起算次日（默认）。false 则按夜子时不换日。
 */
export function ganzhiOfHour(y, m, d, hour, ziSwap) {
  const swap = ziSwap === undefined ? true : !!ziSwap
  const h = ((Math.round(Number(hour)) % 24) + 24) % 24
  let dayGz = ganzhiOfDay(y, m, d)
  if (swap && h >= 23) dayGz = ganzhiOfDay(...nextSolar(y, m, d, 1).slice(0, 3))
  const zi = doubleHourOf(h)
  const base = (Number('甲乙丙丁戊己庚辛壬癸'.indexOf(dayGz.ganzhi.charAt(0))) % 5) * 2
  const ganIdx = (base + zi) % 10
  return {
    shichen: SHICHEN[zi].zhi + '时',
    range: SHICHEN[zi].range,
    ganzhi: GAN[ganIdx] + ZHI[zi],
    dayGanzhi: dayGz.ganzhi,
    note: swap ? '按 23:00 换日（今日子时即作次日）' : '按夜子时不换日，日辰仍用当日',
  }
}

/**
 * 干支纪月（以节气中的「节」为界，五虎遁年起月）
 */
export function ganzhiOfMonth(y, m, d) {
  const jdn = julianDayNumber(y, m, d)
  const list = jieBoundaries(y)
  let hit = list[0]
  for (let i = 0; i < list.length; i++) if (list[i].jdn <= jdn) hit = list[i]
  const g = ((hit.cycleYear - 4) % 10 + 10) % 10
  const baseGan = ((g % 5) * 2 + 2) % 10
  const ganIdx = (baseGan + hit.monthIdx) % 10
  const zhiIdx = (2 + hit.monthIdx) % 12
  return {
    ganzhi: GAN[ganIdx] + ZHI[zhiIdx],
    term: hit.name,
    since: hit.text,
    monthFromYin: hit.monthIdx + 1,
    note: '以「节」为界：立春起寅月，此后每个节换一个月',
  }
}

/** 12 个「节」的边界（含前后各一年，保证任何日期都能落进区间） */
function jieBoundaries(y) {
  const out = []
  for (let yy = y - 1; yy <= y + 1; yy++) {
    if (yy < 1901 || yy > 2100) continue // 节气公式范围外，跳过（范围边缘仍可命中同侧边界）
    const terms = solarTermsOfYear(yy)
    // 小寒 → 上一干支年的丑月；立春起为当年的寅月，之后隔一个取一个
    for (const t of terms) {
      if (t.index % 2 !== 0) continue // 只取节，不取中气
      const jie = JIE_MAP[t.index]
      if (!jie) continue
      out.push({
        jdn: julianDayNumber(yy, t.month, t.day),
        cycleYear: yy + jie.yearOffset,
        monthIdx: jie.monthIdx,
        name: t.name,
        text: yy + '-' + pad2(t.month) + '-' + pad2(t.day),
      })
    }
  }
  out.sort((a, b) => a.jdn - b.jdn)
  return out
}

/**
 * 节气序号 → { 月序（0 = 寅月）, 干支年偏移 }
 * 0 小寒 1 大寒 2 立春 3 雨水 … 22 大雪 23 冬至
 */
const JIE_MAP = {
  0: { monthIdx: 11, yearOffset: -1 }, // 小寒起丑月，属上一个干支年
  2: { monthIdx: 0, yearOffset: 0 }, // 立春起寅月
  4: { monthIdx: 1, yearOffset: 0 },
  6: { monthIdx: 2, yearOffset: 0 },
  8: { monthIdx: 3, yearOffset: 0 },
  10: { monthIdx: 4, yearOffset: 0 },
  12: { monthIdx: 5, yearOffset: 0 },
  14: { monthIdx: 6, yearOffset: 0 },
  16: { monthIdx: 7, yearOffset: 0 },
  18: { monthIdx: 8, yearOffset: 0 },
  20: { monthIdx: 9, yearOffset: 0 },
  22: { monthIdx: 10, yearOffset: 0 },
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n
}

/* ------------------------------------------------------------ 互转 */

/**
 * 公历 → 农历
 * @returns 结构化结果 + 中文串 + 干支 + 生肖
 */
export function solarToLunar(y, m, d) {
  const yy = Math.round(Number(y))
  const mm = Math.round(Number(m))
  const dd = Math.round(Number(d))
  if (!isSolarValid(yy, mm, dd)) throw new Error('不是有效的公历日期（注意月份天数与闰年）')
  const t = utcOf(yy, mm, dd)
  let offset = dayDiff(BASE_UTC, t)
  if (offset < 0) throw new Error('早于 1900-01-31，超出农历数据范围')
  let ly = LUNAR_YEAR_FROM
  let days = lunarYearDaysOf(ly)
  while (offset >= days) {
    offset -= days
    ly++
    if (ly > LUNAR_YEAR_TO + 1) throw new Error('超出农历数据范围（' + LUNAR_YEAR_FROM + '—' + LUNAR_YEAR_TO + '）')
    days = lunarYearDaysOf(ly)
  }
  const months = lunarMonthsOf(ly)
  let lm = 1
  let isLeap = false
  let acc = 0
  for (let i = 0; i < months.length; i++) {
    if (offset < acc + months[i].days) {
      lm = months[i].month
      isLeap = months[i].isLeap
      break
    }
    acc += months[i].days
  }
  const ld = offset - acc + 1
  const gzYear = ganzhiOfYear(ly)
  const dayGz = ganzhiOfDay(yy, mm, dd)
  const monthGz = ganzhiOfMonth(yy, mm, dd)
  const term = solarTermOfDate(yy, mm, dd)
  const festival = festivalOf(ly, lm, ld, isLeap, yy, mm, dd)
  return {
    solar: { year: yy, month: mm, day: dd, text: yy + '-' + pad2(mm) + '-' + pad2(dd), weekday: weekdayOf(yy, mm, dd) },
    lunarYear: ly,
    lunarMonth: lm,
    lunarDay: ld,
    isLeapMonth: isLeap,
    monthDays: isLeap ? leapMonthDaysOf(ly) : monthDaysOf(ly, lm),
    yearDays: lunarYearDaysOf(ly),
    leapMonth: leapMonthOf(ly),
    monthName: lunarMonthName(lm, isLeap),
    dayName: lunarDayName(ld),
    text: lunarText(ly, lm, ld, isLeap),
    shortText: '农历' + ly + '年' + lunarMonthName(lm, isLeap) + lunarDayName(ld),
    ganzhiYear: gzYear.ganzhi,
    zodiac: gzYear.zodiac,
    ganzhiMonth: monthGz.ganzhi,
    ganzhiDay: dayGz.ganzhi,
    festival,
    solarTerm: term,
  }
}

function weekdayOf(y, m, d) {
  const w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return w[new Date(utcOf(y, m, d)).getUTCDay()]
}

function nextSolar(y, m, d, n) {
  const ms = utcOf(y, m, d) + n * 86400000
  const p = partsOfUtc(ms)
  return [p.year, p.month, p.day]
}

/**
 * 农历 → 公历
 * @param {boolean} isLeap 是否闰月
 */
export function lunarToSolar(ly, lm, ld, isLeap) {
  const y = Math.round(Number(ly))
  const m = Math.round(Number(lm))
  const d = Math.round(Number(ld))
  const months = lunarMonthsOf(y)
  const hit = months.filter((x) => x.month === m && x.isLeap === !!isLeap)[0]
  if (!hit) throw new Error(y + ' 年没有' + lunarMonthName(m, isLeap))
  if (!(d >= 1 && d <= hit.days)) {
    throw new Error(lunarMonthName(m, isLeap) + '只有 ' + hit.days + ' 天，没有' + lunarDayName(Math.min(d, 30)))
  }
  let offset = 0
  for (let i = LUNAR_YEAR_FROM; i < y; i++) offset += lunarYearDaysOf(i)
  for (const x of months) {
    if (x === hit) break
    offset += x.days
  }
  offset += d - 1
  const p = partsOfUtc(BASE_UTC + offset * 86400000)
  const solar = { year: p.year, month: p.month, day: p.day, text: p.year + '-' + pad2(p.month) + '-' + pad2(p.day), weekday: weekdayOf(p.year, p.month, p.day) }
  return {
    solar,
    lunar: { year: y, month: m, day: d, isLeap: !!isLeap, text: lunarText(y, m, d, isLeap) },
    offsetFromBase: offset,
    ganzhiYear: ganzhiOfYear(y).ganzhi,
    zodiac: zodiacOfYear(y),
    ganzhiDay: ganzhiOfDay(p.year, p.month, p.day).ganzhi,
  }
}

/** 某农历年的春节（正月初一）落在公历哪天 */
export function springFestivalOf(ly) {
  if (ly < LUNAR_YEAR_FROM || ly > LUNAR_YEAR_TO) return null
  return lunarToSolar(ly, 1, 1, false).solar
}

/** 该农历年的全部中文字段速查（用于「今年闰几月、共多少天」） */
export function lunarYearProfile(ly) {
  const leap = leapMonthOf(ly)
  return {
    year: ly,
    ganzhi: ganzhiOfYear(ly).ganzhi,
    zodiac: zodiacOfYear(ly),
    days: lunarYearDaysOf(ly),
    leapMonth: leap,
    leapMonthName: leap ? lunarMonthName(leap, true) : '无闰月',
    leapMonthDays: leap ? leapMonthDaysOf(ly) : 0,
    springFestival: springFestivalOf(ly),
    months: lunarMonthsOf(ly).map((x) => ({ name: x.name, days: x.days, isLeap: x.isLeap })),
  }
}

/* ------------------------------------------------------------ 二十四节气 */

/** 24 节气名与所属月份（1—12） */
export const SOLAR_TERMS = [
  { index: 0, name: '小寒', month: 1 },
  { index: 1, name: '大寒', month: 1 },
  { index: 2, name: '立春', month: 2 },
  { index: 3, name: '雨水', month: 2 },
  { index: 4, name: '惊蛰', month: 3 },
  { index: 5, name: '春分', month: 3 },
  { index: 6, name: '清明', month: 4 },
  { index: 7, name: '谷雨', month: 4 },
  { index: 8, name: '立夏', month: 5 },
  { index: 9, name: '小满', month: 5 },
  { index: 10, name: '芒种', month: 6 },
  { index: 11, name: '夏至', month: 6 },
  { index: 12, name: '小暑', month: 7 },
  { index: 13, name: '大暑', month: 7 },
  { index: 14, name: '立秋', month: 8 },
  { index: 15, name: '处暑', month: 8 },
  { index: 16, name: '白露', month: 9 },
  { index: 17, name: '秋分', month: 9 },
  { index: 18, name: '寒露', month: 10 },
  { index: 19, name: '霜降', month: 10 },
  { index: 20, name: '立冬', month: 11 },
  { index: 21, name: '小雪', month: 11 },
  { index: 22, name: '大雪', month: 12 },
  { index: 23, name: '冬至', month: 12 },
]

/**
 * 通用寿星公式常量 C：节气日期 = [Y × 0.2422 + C] − [（Y − 1）/ 4 或 Y / 4]
 * 来源：广泛流传的「寿星通用寿星公式」（原始整理年份约 2017 年），
 * 分别给出 20 世纪（1901—2000）与 21 世纪（2001—2100）两套常量。
 */
export const SOLAR_TERM_D = 0.2422
export const SOLAR_TERM_C = {
  20: [6.11, 20.84, 4.6295, 19.456, 6.3826, 21.414, 5.59, 20.888, 6.318, 21.86, 6.5, 22.2, 7.928, 23.65, 8.35, 23.95, 8.44, 23.94, 9.098, 24.218, 8.218, 23.08, 7.9, 22.6],
  21: [5.4055, 20.12, 3.87, 18.73, 5.63, 20.646, 4.81, 20.1, 5.52, 21.04, 5.678, 21.37, 7.108, 22.83, 7.5, 23.13, 7.646, 23.042, 8.318, 23.438, 7.438, 22.36, 7.18, 21.94],
}
export const SOLAR_TERM_SOURCE = '通用寿星公式（20 世纪 / 21 世纪各一套 C 值，整理自公开资料，约 2017 年版本）'

/**
 * 个别年份的经验修约（+1 / −1 天）。
 * 只收录流传较广、且与年历核对过的几条；其余年份直接用公式值。
 */
export const SOLAR_TERM_FIX = {
  '1982-0': 1, // 小寒
  '2019-0': -1, // 小寒
  '1985-2': 1, // 立春
  '2026-3': -1, // 雨水
}

function centuryOf(year) {
  return Math.floor((year - 1) / 100) + 1
}

/**
 * 某年第 index 个节气的公历日期（1—2 月的节用 (Y−1)/4，其余用 Y/4）
 */
export function solarTermDay(year, index) {
  const y = Math.round(Number(year))
  const i = Math.round(Number(index))
  if (i < 0 || i > 23) throw new Error('节气序号要在 0—23 之间')
  if (y < 1901 || y > 2100) throw new Error('节气公式只支持 1901—2100 年')
  const c = centuryOf(y)
  const table = SOLAR_TERM_C[c]
  if (!table) throw new Error('没有 ' + c + ' 世纪的节气常量表')
  const Y = y - (c - 1) * 100
  const months = SOLAR_TERMS[i].month
  const leapCount = months <= 2 ? Math.floor((Y - 1) / 4) : Math.floor(Y / 4)
  let day = Math.floor(Y * SOLAR_TERM_D + table[i]) - leapCount
  const fix = SOLAR_TERM_FIX[y + '-' + i]
  if (fix) day += fix
  return { year: y, month: months, day, fixed: !!fix }
}

/** 某年全部 24 节气 */
export function solarTermsOfYear(year) {
  const y = Math.round(Number(year))
  const out = []
  for (let i = 0; i < 24; i++) {
    const t = solarTermDay(y, i)
    out.push({
      index: i,
      name: SOLAR_TERMS[i].name,
      month: t.month,
      day: t.day,
      isJie: i % 2 === 0,
      date: y + '-' + pad2(t.month) + '-' + pad2(t.day),
      jdn: julianDayNumber(y, t.month, t.day),
      fixed: t.fixed,
    })
  }
  return out
}

/** 某一天所处的节气、以及到下一个节气的距离 */
export function solarTermOfDate(y, m, d) {
  const yy = Math.round(Number(y))
  if (yy < 1901 || yy > 2100) return { name: '', note: '超出节气公式范围' }
  const jdn = julianDayNumber(yy, m, d)
  const all = []
  for (const gy of [yy - 1, yy, yy + 1]) {
    if (gy < 1901 || gy > 2100) continue
    all.push.apply(all, solarTermsOfYear(gy))
  }
  all.sort((a, b) => a.jdn - b.jdn)
  let cur = null
  let next = null
  for (let i = 0; i < all.length; i++) {
    if (all[i].jdn <= jdn) cur = all[i]
    if (all[i].jdn > jdn) {
      next = all[i]
      break
    }
  }
  const daysToNext = next ? next.jdn - jdn : null
  const span = cur && next ? next.jdn - cur.jdn : 15
  return {
    name: cur ? cur.name : '—',
    since: cur ? cur.date : '',
    passedDays: cur ? jdn - cur.jdn : 0,
    next: next ? next.name : '',
    nextDate: next ? next.date : '',
    daysToNext,
    progress: daysToNext === null ? 0 : Math.round(((span - daysToNext) / span) * 100),
    source: SOLAR_TERM_SOURCE,
    note: '公式近似推算，个别年份与天文时刻可能相差 1 天',
  }
}

/** 下一个节气（含倒计时天数） */
export function nextSolarTerm(y, m, d) {
  const r = solarTermOfDate(y, m, d)
  if (!r.next) return null
  return { name: r.next, date: r.nextDate, daysAway: r.daysToNext }
}

/* ------------------------------------------------------------ 生日 / 倒计时 */

/**
 * 公历生日 → 农历生日，并给出下一个农历生日 / 下一个公历生日
 * @param {{year:number, month:number, day:number}} birth 出生日（公历）
 * @param {{year:number, month:number, day:number}} [now] 参照日（公历），不传就只返回农历生日本身
 */
export function birthdaySync(birth, now) {
  const b = solarToLunar(birth.year, birth.month, birth.day)
  const lunarBirth = { year: b.lunarYear, month: b.lunarMonth, day: b.lunarDay, isLeap: b.isLeapMonth }
  const next = now ? nextLunarBirthday(lunarBirth, now) : null
  const nextSolarBd = now ? nextSolarBirthday(birth, now) : null
  return {
    birthSolar: b.solar,
    birthLunar: { year: b.lunarYear, month: b.lunarMonth, day: b.lunarDay, isLeap: b.isLeapMonth, text: b.text },
    leapNote: b.isLeapMonth ? '出生在闰月，往后按同名平月过生日' : '',
    nextLunar: next,
    nextSolar: nextSolarBd,
  }
}

/**
 * 下一个（或今天）农历生日。
 * 目标：农历月日固定，逐年往后找第一个不早于 now 的日期；
 * 若该年没有三十（月小）则自动顺延到当年该月最后一天并提示。
 */
export function nextLunarBirthday(lunarBirth, now) {
  const lm = Math.round(Number(lunarBirth.month))
  const ld = Math.round(Number(lunarBirth.day))
  if (!(lm >= 1 && lm <= 12) || !(ld >= 1 && ld <= 30)) throw new Error('农历生日要有月份 1—12 与日期 1—30')
  const isLeap = !!lunarBirth.isLeap
  const n = solarToLunar(now.year, now.month, now.day)
  const targetJdn = julianDayNumber(n.solar.year, n.solar.month, n.solar.day)
  let ly = lunarBirth.year || n.lunarYear
  for (let i = 0; i < 130; i++, ly++) {
    if (ly > LUNAR_YEAR_TO) break
    let day = ld
    let fellBack = ''
    const months = lunarMonthsOf(ly)
    const hit = months.filter((x) => x.month === lm && x.isLeap === isLeap)[0]
    if (!hit) {
      // 闰月生日在平年没有对应闰月，退到同名平月
      const plain = months.filter((x) => x.month === lm && !x.isLeap)[0]
      if (!plain) continue
      day = Math.min(ld, plain.days)
      if (plain.isLeap === false && isLeap) fellBack = '今年没有' + lunarMonthName(lm, true) + '，按' + lunarMonthName(lm, false) + '过'
    } else {
      if (day > hit.days) {
        fellBack = lunarMonthName(lm, isLeap) + '今年只有 ' + hit.days + ' 天，改过' + lunarDayName(hit.days)
        day = hit.days
      }
    }
    const s = lunarToSolar(ly, lm, day, hit ? hit.isLeap : false)
    const jdn = julianDayNumber(s.solar.year, s.solar.month, s.solar.day)
    if (jdn >= targetJdn) {
      return {
        solar: s.solar,
        lunar: { year: ly, month: lm, day, isLeap: hit ? hit.isLeap : false, text: lunarText(ly, lm, day, hit ? hit.isLeap : false) },
        daysAway: jdn - targetJdn,
        weeksAway: Math.floor((jdn - targetJdn) / 7),
        weekday: s.solar.weekday,
        zodiac: zodiacOfYear(ly),
        note: fellBack,
      }
    }
  }
  return null
}

/** 下一个公历生日 */
export function nextSolarBirthday(birth, now) {
  const n = new Date(utcOf(now.year, now.month, now.day))
  let y = n.getUTCFullYear()
  let s = safeSolar(y, birth.month, birth.day)
  if (utcOf(s.year, s.month, s.day) < utcOf(now.year, now.month, now.day)) s = safeSolar(y + 1, birth.month, birth.day)
  const days = dayDiff(utcOf(now.year, now.month, now.day), utcOf(s.year, s.month, s.day))
  const l = solarToLunar(s.year, s.month, s.day)
  return { solar: { ...s, text: s.year + '-' + pad2(s.month) + '-' + pad2(s.day), weekday: weekdayOf(s.year, s.month, s.day) }, daysAway: days, lunarText: l.text, age: s.year - birth.year }
}

function safeSolar(y, m, d) {
  if (isSolarValid(y, m, d)) return { year: y, month: m, day: d }
  // 2 月 29 日在平年顺延到 2 月 28 日
  if (m === 2 && d === 29) return { year: y, month: 2, day: 28 }
  throw new Error('日期不合法')
}

/** 已经活了多少天 / 多少周 / 下一个节气倒计时 */
export function daysLived(birth, now) {
  const b = utcOf(birth.year, birth.month, birth.day)
  const n = utcOf(now.year, now.month, now.day)
  const d = dayDiff(b, n)
  if (d < 0) throw new Error('出生日期晚于参照日期')
  return {
    days: d,
    weeks: Math.floor(d / 7),
    months: Math.floor(d / 30.436875),
    years: d / 365.2425,
    tenThousand: Math.round((10000 - d) / 100) / 10,
  }
}

/* ------------------------------------------------------------ 节日 */

/** 常见农历节日 + 少数公历节日（不含法定节假日调休，仅作提示） */
const LUNAR_FESTIVALS = {
  '1-1': '春节',
  '1-15': '元宵节',
  '2-2': '龙抬头',
  '5-5': '端午节',
  '7-7': '七夕',
  '7-15': '中元节',
  '8-15': '中秋节',
  '9-9': '重阳节',
  '12-8': '腊八节',
  '12-23': '小年（北方）',
  '12-24': '小年（南方）',
  '12-30': '除夕',
}
const SOLAR_FESTIVALS = {
  '1-1': '元旦',
  '3-8': '国际妇女节',
  '5-1': '劳动节',
  '6-1': '儿童节',
  '9-10': '教师节',
  '10-1': '国庆节',
  '12-25': '圣诞节',
}

function festivalOf(ly, lm, ld, isLeap, sy, sm, sd) {
  const list = []
  const push = (name) => {
    if (list.indexOf(name) < 0) list.push(name)
  }
  if (!isLeap) {
    const key = lm + '-' + ld
    if (LUNAR_FESTIVALS[key]) push(LUNAR_FESTIVALS[key])
    // 除夕 = 腊月最后一天，可能是廿九也可能是三十，按实际月长判定
    if (lm === 12 && ld === monthDaysOf(ly, 12)) push('除夕')
  }
  const skey = sm + '-' + sd
  if (SOLAR_FESTIVALS[skey]) push(SOLAR_FESTIVALS[skey])
  return list.join('、')
}

/** 供视图直接用的农历节日表 */
export function festivalTable() {
  return Object.keys(LUNAR_FESTIVALS).map((k) => {
    const p = k.split('-')
    return { month: Number(p[0]), day: Number(p[1]), name: LUNAR_FESTIVALS[k], label: lunarMonthName(Number(p[0]), false) + lunarDayName(Number(p[1])) }
  })
}

/* ------------------------------------------------------------ 汇总 */

/** 一个日期的完整「历书」摘要 */
export function calendarSummary(y, m, d) {
  const l = solarToLunar(y, m, d)
  const gz = ganzhiOfDay(y, m, d)
  const week = ['日', '一', '二', '三', '四', '五', '六']
  const jdn = julianDayNumber(y, m, d)
  const jan1 = julianDayNumber(y, 1, 1)
  const nextYearJan1 = julianDayNumber(y + 1, 1, 1)
  return {
    ...l,
    dayGanzhiIndex: gz.index,
    dayOfYear: jdn - jan1 + 1,
    daysLeftInYear: nextYearJan1 - jdn - 1,
    leapYear: isLeapYear(y),
    weekdayCn: '星期' + week[new Date(utcOf(y, m, d)).getUTCDay()],
    lunarMonthsInYear: lunarMonthsOf(l.lunarYear).map((x) => x.name + x.days),
  }
}

/** 校验用：把两个方向的转换都跑一遍，看是否闭合 */
export function roundTripCheck(y, m, d) {
  const l = solarToLunar(y, m, d)
  const back = lunarToSolar(l.lunarYear, l.lunarMonth, l.lunarDay, l.isLeapMonth)
  return {
    solar: l.solar.text,
    lunar: l.text,
    back: back.solar.text,
    closed: back.solar.text === l.solar.text,
  }
}

export { GAN, ZHI, ZODIAC }
