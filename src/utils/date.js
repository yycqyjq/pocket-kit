/**
 * 日期与时间
 */

export function pad2(n) {
  return String(n).padStart(2, '0')
}

export function formatDate(date, fmt) {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  const f = fmt || 'YYYY-MM-DD HH:mm:ss'
  const map = {
    YYYY: d.getFullYear(),
    YY: String(d.getFullYear()).slice(2),
    MM: pad2(d.getMonth() + 1),
    M: d.getMonth() + 1,
    DD: pad2(d.getDate()),
    D: d.getDate(),
    HH: pad2(d.getHours()),
    H: d.getHours(),
    mm: pad2(d.getMinutes()),
    m: d.getMinutes(),
    ss: pad2(d.getSeconds()),
    s: d.getSeconds(),
    SSS: String(d.getMilliseconds()).padStart(3, '0'),
  }
  return f.replace(/YYYY|YY|MM|DD|HH|mm|ss|SSS|M|D|H|m|s/g, (k) => map[k])
}

/**
 * 解析用户输入的时间戳：自动判断秒 / 毫秒
 * 返回 { ms, unit: 's' | 'ms' | '' }
 */
export function parseTimestamp(input) {
  const raw = String(input).trim()
  if (!/^-?\d+$/.test(raw)) return { ms: NaN, unit: '' }
  const n = Number(raw)
  const digits = raw.replace('-', '').length
  if (digits <= 10) return { ms: n * 1000, unit: 's' }
  if (digits === 13) return { ms: n, unit: 'ms' }
  // 其他位数按量级猜测
  if (digits < 13) return { ms: n * 1000, unit: 's' }
  return { ms: n, unit: 'ms' }
}

/** 一年中的第几天 / 第几周 */
export function dayOfYear(d) {
  const date = new Date(d)
  const start = new Date(date.getFullYear(), 0, 1)
  return Math.floor((date - start) / 86400000) + 1
}

/** ISO 周数 */
export function isoWeek(d) {
  const date = new Date(Date.UTC(new Date(d).getFullYear(), new Date(d).getMonth(), new Date(d).getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
}

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']

export function weekdayCN(d) {
  return '星期' + WEEK_CN[new Date(d).getDay()]
}

/** 相对时间：刚刚 / 3 分钟前 / 2 天前 ... */
export function relativeTime(target) {
  const now = Date.now()
  const t = typeof target === 'number' ? target : new Date(target).getTime()
  let diff = now - t
  const future = diff < 0
  diff = Math.abs(diff)
  const sec = Math.floor(diff / 1000)
  const min = Math.floor(sec / 60)
  const hour = Math.floor(min / 60)
  const day = Math.floor(hour / 24)

  let text
  if (sec < 45) text = '刚刚'
  else if (min < 60) text = min + ' 分钟' + (future ? '后' : '前')
  else if (hour < 24) text = hour + ' 小时' + (future ? '后' : '前')
  else if (day < 30) text = day + ' 天' + (future ? '后' : '前')
  else if (day < 365) text = Math.floor(day / 30) + ' 个月' + (future ? '后' : '前')
  else text = (day / 365).toFixed(1) + ' 年' + (future ? '后' : '前')
  return text
}

/** 是否闰年 */
export function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

/** 某年某月的天数 */
export function daysInMonth(y, m) {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
}

/** 两个日期之间的自然日差（忽略时分秒） */
export function daysBetween(a, b) {
  const d1 = new Date(a)
  const d2 = new Date(b)
  const u1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate())
  const u2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate())
  return Math.round((u2 - u1) / 86400000)
}

/** 是否法定休息日（仅按周末粗略判断，不含调休） */
export function isWeekend(d) {
  const w = new Date(d).getDay()
  return w === 0 || w === 6
}

/**
 * 区间内的工作日天数（不含周末）
 * @param {object} [opt] `{ inclusive }` —— 结束日是否算进去。
 *   默认 `false` 表示半开区间 `[a, b)`，回答「相隔多少个工作日」；
 *   `true` 表示闭区间 `[a, b]`，回答「这段时间占用多少个工作日」（请假、排期用这个）。
 */
export function workdaysBetween(a, b, opt) {
  // daysBetween 是带符号的差值，区间长度要取绝对值。
  // 曾经写成 Math.min(d, -d) —— 它恒等于 -|d|，循环一次都不跑，工作日永远返回 0。
  const d = daysBetween(a, b)
  const start = d >= 0 ? a : b
  // 闭区间首尾都算，所以是 span + 1 天
  const days = Math.abs(d) + (opt && opt.inclusive ? 1 : 0)
  let count = 0
  const cur = new Date(start)
  cur.setHours(0, 0, 0, 0)
  for (let i = 0; i < days; i++) {
    const day = new Date(cur.getTime() + i * 86400000).getDay()
    if (day !== 0 && day !== 6) count++
  }
  return count
}

/** 加天数 */
export function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

/** 精确年龄：返回 { years, months, days, totalDays } */
export function ageFrom(birth, now) {
  const b = new Date(birth)
  const n = now ? new Date(now) : new Date()
  if (isNaN(b.getTime())) return null
  let years = n.getFullYear() - b.getFullYear()
  let months = n.getMonth() - b.getMonth()
  let days = n.getDate() - b.getDate()
  if (days < 0) {
    months--
    const pm = new Date(n.getFullYear(), n.getMonth(), 0).getDate()
    days += pm
  }
  if (months < 0) {
    years--
    months += 12
  }
  return {
    years,
    months,
    days,
    totalDays: daysBetween(b, n),
    nextBirthdayIn: (() => {
      const next = new Date(n.getFullYear(), b.getMonth(), b.getDate())
      if (daysBetween(n, next) < 0) next.setFullYear(n.getFullYear() + 1)
      return daysBetween(n, next)
    })(),
  }
}

/** 中国时区（UTC+8）的偏移，用于展示 */
export const TZ_OFFSET_MINUTES = -new Date().getTimezoneOffset()
