/**
 * Cron 表达式解析与推算
 * 支持标准 5 段式：分 时 日 月 周
 * 支持 * / n / a-b / a-b/n / a,b,c / 月份与星期的英文缩写
 * 不支持 L W #（会明确提示，而不是算错）
 */

const MONTH_NAMES = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}
const DOW_NAMES = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
const DOW_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const MONTH_CN = ['', '1 月', '2 月', '3 月', '4 月', '5 月', '6 月', '7 月', '8 月', '9 月', '10 月', '11 月', '12 月']

export const FIELD_DEFS = [
  { key: 'min', name: '分钟', min: 0, max: 59 },
  { key: 'hour', name: '小时', min: 0, max: 23 },
  { key: 'dom', name: '日', min: 1, max: 31 },
  { key: 'month', name: '月', min: 1, max: 12, names: MONTH_NAMES },
  { key: 'dow', name: '星期', min: 0, max: 7, names: DOW_NAMES },
]

function resolveToken(tok, def) {
  const t = String(tok).trim().toLowerCase()
  if (def.names && def.names[t] !== undefined) return def.names[t]
  if (!/^\d+$/.test(t)) throw new Error(def.name + ' 段里有看不懂的内容「' + tok + '」')
  return Number(t)
}

/** 解析单段，返回去重排序后的数组 */
function parseField(raw, def) {
  const src = String(raw).trim()
  if (!src) throw new Error(def.name + ' 段是空的')
  const set = new Set()

  for (const part of src.split(',')) {
    const seg = part.trim()
    if (!seg) throw new Error(def.name + ' 段里有空的分段（多余的逗号？）')

    let body = seg
    let step = 1
    const slash = seg.indexOf('/')
    if (slash > -1) {
      body = seg.slice(0, slash)
      const stepStr = seg.slice(slash + 1)
      if (!/^\d+$/.test(stepStr) || Number(stepStr) < 1) {
        throw new Error(def.name + ' 段的步长「' + stepStr + '」必须是正整数')
      }
      step = Number(stepStr)
    }

    let lo
    let hi
    if (body === '*' || body === '?') {
      lo = def.min
      hi = def.max
    } else if (body.indexOf('-') > -1) {
      const [a, b] = body.split('-')
      lo = resolveToken(a, def)
      hi = resolveToken(b, def)
    } else {
      lo = resolveToken(body, def)
      hi = slash > -1 ? def.max : lo
    }

    if (lo < def.min || hi > def.max) {
      throw new Error(def.name + ' 段的取值范围是 ' + def.min + '~' + def.max + '，填的是 ' + (lo < def.min ? lo : hi))
    }

    if (lo <= hi) {
      for (let v = lo; v <= hi; v += step) set.add(v)
    } else {
      // 跨零点的区间，如 22-2（晚 10 点到凌晨 2 点）
      for (let v = lo; v <= def.max; v += step) set.add(v)
      for (let v = def.min; v <= hi; v += step) set.add(v)
    }
  }

  // 星期里的 7 等同于 0（周日）
  if (def.key === 'dow' && set.has(7)) {
    set.add(0)
    set.delete(7)
  }
  if (!set.size) throw new Error(def.name + ' 段没有匹配到任何值')
  return Array.from(set).sort((a, b) => a - b)
}

/** 解析整条表达式 */
export function parseCron(expr) {
  const raw = String(expr || '').trim().replace(/\s+/g, ' ')
  if (!raw) return { ok: false, error: '请输入 Cron 表达式' }
  const parts = raw.split(' ')
  if (parts.length !== 5) {
    return {
      ok: false,
      error: '需要 5 段（分 时 日 月 周），现在有 ' + parts.length + ' 段。秒级表达式请去掉最前面的秒段',
    }
  }
  if (/[LW#]/i.test(raw)) {
    return { ok: false, error: '暂不支持 L / W / # 这类特殊符号（它们不是所有系统都认），请改用等价写法' }
  }
  try {
    const out = { ok: true, raw, fields: {}, arrays: {} }
    FIELD_DEFS.forEach((def, i) => {
      const arr = parseField(parts[i], def)
      out.arrays[def.key] = arr
      out.fields[def.key] = new Set(arr)
    })
    out.domRestricted = parts[2].trim() !== '*' && parts[2].trim() !== '?'
    out.dowRestricted = parts[4].trim() !== '*' && parts[4].trim() !== '?'
    return out
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/** 日/周匹配：两者都限定时间用「或」，否则用「与」（标准 cron 规则） */
function dayMatches(p, date) {
  const domOk = p.fields.dom.has(date.getDate())
  const dowOk = p.fields.dow.has(date.getDay())
  if (p.domRestricted && p.dowRestricted) return domOk || dowOk
  return domOk && dowOk
}

/**
 * 推算接下来的执行时间
 * @returns {Date[]} 按时间升序，最多 count 条（消费方按 Date 直接用，如 fmtDate）
 */
export function nextRuns(expr, count, from) {
  const p = parseCron(expr)
  if (!p.ok) throw new Error(p.error)

  const n = Math.max(1, Math.min(50, count || 10))
  const start = new Date(from ? new Date(from) : Date.now())
  start.setSeconds(0, 0)
  start.setMinutes(start.getMinutes() + 1)

  const out = []
  const maxDays = 366 * 6
  for (let d = 0; d < maxDays && out.length < n; d++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d)
    if (!p.fields.month.has(day.getMonth() + 1)) continue
    if (!dayMatches(p, day)) continue
    for (const h of p.arrays.hour) {
      for (const mi of p.arrays.min) {
        if (out.length >= n) break
        const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, mi, 0, 0)
        if (t.getTime() < start.getTime()) continue
        out.push(t)
      }
    }
  }
  return out
}

const pad = (v) => String(v).padStart(2, '0')

export function fmtDate(d) {
  return (
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' ' + DOW_CN[d.getDay()]
  )
}

/** 把每段翻译成人话 */
export function describeField(key, arr, raw) {
  const def = FIELD_DEFS.find((f) => f.key === key)
  const isAll = arr.length === def.max - def.min + 1
  if (isAll) return '每' + def.name
  if (key === 'dow') {
    if (arr.length === 5 && arr.join() === '1,2,3,4,5') return '工作日'
    if (arr.length === 2 && arr.join() === '0,6') return '周末'
    return arr.map((v) => DOW_CN[v]).join('、')
  }
  if (key === 'month') return arr.map((v) => MONTH_CN[v]).join('、')
  if (arr.length > 20) return '每 ' + (arr[1] - arr[0]) + ' 个' + def.name
  return arr.map((v) => (key === 'hour' || key === 'min' ? pad(v) : v)).join('、')
}

/**
 * 日期范围的自然语言前缀：月 / 日 / 星期。
 * 汇总句必须带上它 —— 只用「时:分」拼出来的句子，会把 `0 9 * * 1-5`
 * 说成「每天 09:00」，而它其实只在工作日跑。
 */
function describeScope(p) {
  // 1-31 / 0-6 这种「写全了」的区间，语义上等于 *，不该逐个列出来
  const monthAll = p.arrays.month.length === 12
  const domAll = !p.domRestricted || p.arrays.dom.length === 31
  const dowAll = !p.dowRestricted || p.arrays.dow.length === 7

  let dayText
  if (domAll && dowAll) {
    dayText = '每天'
  } else if (!domAll && dowAll) {
    dayText = (monthAll ? '每月 ' : '') + p.arrays.dom.map((v) => v + ' 日').join('、')
  } else if (domAll && !dowAll) {
    dayText = describeField('dow', p.arrays.dow, p.raw)
  } else {
    // 日与星期都限定时，标准 cron 取「或」
    dayText = (monthAll ? '每月 ' : '') + p.arrays.dom.map((v) => v + ' 日').join('、') +
      '或' + describeField('dow', p.arrays.dow, p.raw)
  }

  if (monthAll) return dayText + ' '
  const monthText = p.arrays.month.map((v) => MONTH_CN[v]).join('、')
  return monthText + (dayText === '每天' ? ' ' : ' 的 ') + dayText + ' '
}

/** 整条表达式的自然语言描述 */
export function describe(expr) {
  const p = parseCron(expr)
  if (!p.ok) return { ok: false, error: p.error }
  const minArr = p.arrays.min
  const hourArr = p.arrays.hour
  const lines = FIELD_DEFS.map((def) => ({
    name: def.name,
    raw: p.raw.split(' ')[FIELD_DEFS.indexOf(def)],
    text: describeField(def.key, p.arrays[def.key], p.raw),
  }))

  // 汇总一句。范围前缀（日/月/星期）不能省。
  const scope = describeScope(p)
  const plainDaily = scope === '每天 '

  let summary
  const everyMin = minArr.length === 60
  const everyHour = hourArr.length === 24
  if (everyMin && everyHour) {
    summary = (plainDaily ? '' : scope) + '每分钟执行一次'
  } else if (!everyMin && everyHour && minArr.length === 1) {
    summary = (plainDaily ? '' : scope) + '每小时的 ' + pad(minArr[0]) + ' 分执行'
  } else {
    const times = []
    const cap = 6
    outer: for (const h of hourArr) {
      for (const m of minArr) {
        times.push(pad(h) + ':' + pad(m))
        if (times.length >= cap) break outer
      }
    }
    summary = scope + times.join('、') + (hourArr.length * minArr.length > cap ? ' 等 ' + hourArr.length * minArr.length + ' 个时间点' : '')
  }
  return { ok: true, lines, summary, parallel: p.domRestricted && p.dowRestricted }
}

export const CRON_PRESETS = [
  { name: '每分钟', expr: '* * * * *' },
  { name: '每 5 分钟', expr: '*/5 * * * *' },
  { name: '每 30 分钟', expr: '*/30 * * * *' },
  { name: '每小时整点', expr: '0 * * * *' },
  { name: '每天 0 点', expr: '0 0 * * *' },
  { name: '每天 9 点', expr: '0 9 * * *' },
  { name: '工作日 9 点', expr: '0 9 * * 1-5' },
  { name: '每周一 8 点', expr: '0 8 * * 1' },
  { name: '每月 1 号 0 点', expr: '0 0 1 * *' },
  { name: '每季度首日', expr: '0 0 1 1,4,7,10 *' },
  { name: '每年 1 月 1 日', expr: '0 0 1 1 *' },
  { name: '工作时间每 10 分钟', expr: '*/10 9-18 * * 1-5' },
]
