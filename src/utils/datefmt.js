/**
 * 日期格式串互转
 * 同一个格式在不同语言里的写法完全不同，这个工具负责翻译并给出示例结果
 */

/**
 * 各记法的 token 表。
 *
 * 数组顺序**不再是正确性的依赖** —— parsePattern 会按长度降序匹配，
 * 保证 `yyyy` 不会被 `yy` 先吃掉、`15` 不会被 `1` 先吃掉。
 * 这里仍按「长 → 短」书写，只是为了让同长度时（稳定排序）的先后可预期。
 *
 * 注意：单字符占位符必须齐全。曾经 java/moment 的 render 表里写着 month1='M'、
 * day1='d'，但 tokens 里没有 'M'/'d' —— 于是「译过去」的格式串再「译回来」时，
 * 那些字符被当成字面量，示例结果直接是错的。
 */
export const NOTATIONS = [
  {
    key: 'strftime',
    name: 'strftime',
    lang: 'C / Python / PHP / MySQL',
    signature: /%/,
    tokens: [
      ['%-m', 'month1'], ['%-d', 'day1'], ['%-H', 'hour24n'], ['%-I', 'hour12n'],
      ['%-M', 'minuten'], ['%-S', 'secondn'],
      ['%Y', 'year4'], ['%y', 'year2'], ['%m', 'month2'], ['%e', 'day1'], ['%d', 'day2'],
      ['%H', 'hour24'], ['%I', 'hour12'], ['%M', 'minute'], ['%S', 'second'], ['%f', 'ms'],
      ['%p', 'ampm'], ['%A', 'weekday'], ['%a', 'weekdayShort'],
      ['%B', 'monthName'], ['%b', 'monthShort'], ['%j', 'dayOfYear'],
      ['%z', 'tzOffset'], ['%%', 'literal'],
    ],
    render: {
      year4: '%Y', year2: '%y', month2: '%m', month1: '%-m', monthName: '%B',
      monthShort: '%b', day2: '%d', day1: '%-d', dayOfYear: '%j',
      hour24: '%H', hour24n: '%-H', hour12: '%I', hour12n: '%-I',
      minute: '%M', minuten: '%-M', second: '%S', secondn: '%-S',
      ms: '%f', ampm: '%p',
      weekday: '%A', weekdayShort: '%a', tzOffset: '%z',
    },
  },
  {
    key: 'java',
    name: 'Java / .NET',
    lang: 'SimpleDateFormat / DateTime.ToString',
    signature: /y{2,}|dd|HH|mm|ss/,
    tokens: [
      ['yyyy', 'year4'], ['yy', 'year2'], ['MMMM', 'monthName'], ['MMM', 'monthShort'],
      ['MM', 'month2'], ['M', 'month1'], ['dd', 'day2'], ['d', 'day1'], ['D', 'dayOfYearn'],
      ['HH', 'hour24'], ['H', 'hour24n'], ['hh', 'hour12'], ['h', 'hour12n'],
      ['mm', 'minute'], ['m', 'minuten'], ['ss', 'second'], ['s', 'secondn'],
      ['SSS', 'ms'], ['a', 'ampm'],
      ['EEEE', 'weekday'], ['EEE', 'weekdayShort'], ['XXX', 'tzOffset'], ['Z', 'tzOffset'],
    ],
    render: {
      year4: 'yyyy', year2: 'yy', month2: 'MM', month1: 'M', monthName: 'MMMM',
      monthShort: 'MMM', day2: 'dd', day1: 'd', dayOfYearn: 'D',
      hour24: 'HH', hour24n: 'H', hour12: 'hh', hour12n: 'h',
      minute: 'mm', minuten: 'm', second: 'ss', secondn: 's',
      ms: 'SSS', ampm: 'a',
      weekday: 'EEEE', weekdayShort: 'EEE', tzOffset: 'XXX',
    },
  },
  {
    key: 'moment',
    name: 'moment / dayjs',
    lang: 'JavaScript 日期库',
    signature: /YYYY|DD|dddd/,
    tokens: [
      ['YYYY', 'year4'], ['YY', 'year2'], ['MMMM', 'monthName'], ['MMM', 'monthShort'],
      ['MM', 'month2'], ['M', 'month1'], ['DDD', 'dayOfYear'], ['DD', 'day2'], ['D', 'day1'],
      ['dddd', 'weekday'], ['ddd', 'weekdayShort'],
      ['HH', 'hour24'], ['H', 'hour24n'], ['hh', 'hour12'], ['h', 'hour12n'],
      ['mm', 'minute'], ['m', 'minuten'], ['ss', 'second'], ['s', 'secondn'],
      ['SSS', 'ms'], ['A', 'ampm'], ['ZZ', 'tzOffset'],
    ],
    render: {
      year4: 'YYYY', year2: 'YY', month2: 'MM', month1: 'M', monthName: 'MMMM',
      monthShort: 'MMM', day2: 'DD', day1: 'D', dayOfYear: 'DDD',
      hour24: 'HH', hour24n: 'H', hour12: 'hh', hour12n: 'h',
      minute: 'mm', minuten: 'm', second: 'ss', secondn: 's',
      ms: 'SSS', ampm: 'A',
      weekday: 'dddd', weekdayShort: 'ddd', tzOffset: 'ZZ',
    },
  },
  {
    key: 'go',
    name: 'Go',
    lang: 'time.Format',
    // Go 用「参考时间」而不是占位符
    signature: /2006|15:04|01\/02/,
    tokens: [
      ['2006', 'year4'], ['06', 'year2'], ['January', 'monthName'], ['Jan', 'monthShort'],
      ['002', 'dayOfYear'], ['-0700', 'tzOffset'],
      ['01', 'month2'], ['1', 'month1'], ['02', 'day2'], ['2', 'day1'],
      ['15', 'hour24'], ['03', 'hour12'], ['3', 'hour12n'],
      ['04', 'minute'], ['4', 'minuten'], ['05', 'second'], ['5', 'secondn'],
      ['000', 'ms'], ['PM', 'ampm'],
      ['Monday', 'weekday'], ['Mon', 'weekdayShort'], ['MST', 'tzOffset'],
    ],
    render: {
      year4: '2006', year2: '06', month2: '01', month1: '1', monthName: 'January',
      monthShort: 'Jan', day2: '02', day1: '2', dayOfYear: '002',
      hour24: '15', hour12: '03', hour12n: '3',
      minute: '04', minuten: '4', second: '05', secondn: '5',
      ms: '000', ampm: 'PM',
      weekday: 'Monday', weekdayShort: 'Mon', tzOffset: '-0700',
    },
  },
]

const WEEK_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** 猜这段格式串是哪种记法 */
export function detect(pattern) {
  const p = String(pattern)
  if (/%[A-Za-z%]/.test(p)) return 'strftime'
  if (/2006|15:04|01\/02|Jan 2/.test(p)) return 'go'
  if (/YYYY|DDD|dddd|Do/.test(p)) return 'moment'
  if (/y{4}|yyyy/.test(p)) return 'java'
  if (/HH|mm|ss/.test(p)) return 'java'
  return null
}

/** 按名称取记法定义 */
export function getNotation(key) {
  return NOTATIONS.find((n) => n.key === key) || NOTATIONS[0]
}

/** 把格式串切成 token 序列 */
export function parsePattern(pattern, notationKey) {
  const n = getNotation(notationKey)
  const p = String(pattern)
  const out = []
  let i = 0
  let literalBuf = ''

  const flushLiteral = () => {
    if (literalBuf) {
      out.push({ type: 'literal', raw: literalBuf })
      literalBuf = ''
    }
  }

  // 长 token 优先匹配。这不能依赖手写数组顺序 —— 一旦补进单字符占位符，
  // Go 的 `1`（月）就会抢走 `15`（小时）的开头，把 `15:04` 拆成 `1`+`5`+`:`+`0`+`4`。
  // 每次调用排一遍代价很小（token 表最多二十来条），换顺序免疫。
  const ordered = n.tokens.slice().sort((a, b) => b[0].length - a[0].length)

  while (i < p.length) {
    let matched = null
    for (const [raw, type] of ordered) {
      if (p.startsWith(raw, i)) {
        matched = { raw, type }
        break
      }
    }
    if (matched) {
      flushLiteral()
      out.push({ type: matched.type, raw: matched.raw, rawLength: matched.raw.length })
      i += matched.raw.length
      continue
    }
    literalBuf += p[i]
    i++
  }
  flushLiteral()
  return out
}

/** 渲染示例结果 */
export function renderSample(tokens, date) {
  const d = date || new Date()
  const pad = (v) => String(v).padStart(2, '0')
  // 带 n 后缀的是「不补零」变体。Java 的 H:m:s 在 14:05:09 输出的是 14:5:9，
  // 若一律按补零渲染，示例值就是错的。
  const map = {
    year4: String(d.getFullYear()),
    year2: String(d.getFullYear()).slice(2),
    month2: pad(d.getMonth() + 1),
    month1: String(d.getMonth() + 1),
    monthName: MONTH_EN[d.getMonth()],
    monthShort: MONTH_EN[d.getMonth()].slice(0, 3),
    day2: pad(d.getDate()),
    day1: String(d.getDate()),
    dayOfYear: String(Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000)).padStart(3, '0'),
    dayOfYearn: String(Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000)),
    hour24: pad(d.getHours()),
    hour24n: String(d.getHours()),
    hour12: pad(d.getHours() % 12 || 12),
    hour12n: String(d.getHours() % 12 || 12),
    minute: pad(d.getMinutes()),
    minuten: String(d.getMinutes()),
    second: pad(d.getSeconds()),
    secondn: String(d.getSeconds()),
    ms: String(d.getMilliseconds()).padStart(3, '0'),
    ampm: d.getHours() < 12 ? 'AM' : 'PM',
    weekday: WEEK_EN[d.getDay()],
    weekdayShort: WEEK_EN[d.getDay()].slice(0, 3),
    tzOffset: tzString(d),
  }
  return tokens
    .map((t) => {
      if (t.type === 'literal') return t.raw
      return map[t.type] !== undefined ? map[t.type] : t.raw
    })
    .join('')
}

const pad = (v) => String(v).padStart(2, '0')

function tzString(d) {
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const a = Math.abs(off)
  return sign + pad(Math.floor(a / 60)) + ':' + pad(a % 60)
}

/**
 * 补零 / 不补零两个变体之间互相兜底。
 * 例：Go 的 24 小时制只有 `15`（恒两位），没有不补零形式；Java 的年内第几天只有 `D`（不补零）。
 * 宁可多一个 0、或示例短一位，也不能让字段变成空串 —— 那会让译出来的格式串凭空少一段。
 */
const RENDER_FALLBACK = {
  hour24n: ['hour24'], hour24: ['hour24n'],
  hour12n: ['hour12'], hour12: ['hour12n'],
  minuten: ['minute'], minute: ['minuten'],
  secondn: ['second'], second: ['secondn'],
  dayOfYearn: ['dayOfYear'], dayOfYear: ['dayOfYearn'],
}

/**
 * 主入口：把一种记法的格式串翻译成其它记法
 */
export function convert(pattern, notationKey, date) {
  const src = notationKey === 'auto' ? detect(pattern) : notationKey
  if (!src) {
    throw new Error('认不出这是哪种记法的格式串，请在下面手动指定来源')
  }
  const tokens = parsePattern(pattern, src)
  if (!tokens.length) throw new Error('格式串是空的')

  const results = NOTATIONS.map((n) => {
    const text = tokens
      .map((t) => {
        // 只有 strftime 需要把字面量里的 % 写成 %%
        if (t.type === 'literal') return n.key === 'strftime' ? t.raw.replace(/%/g, '%%') : t.raw
        if (n.render[t.type] !== undefined) return n.render[t.type]
        // 该记法没有这个变体，退回另一个变体，避免整段字段丢失
        for (const alt of RENDER_FALLBACK[t.type] || []) {
          if (n.render[alt] !== undefined) return n.render[alt]
        }
        return ''
      })
      .join('')
    return {
      key: n.key,
      name: n.name,
      lang: n.lang,
      pattern: text,
      sample: renderSample(parsePattern(text, n.key), date),
      isSource: n.key === src,
    }
  })

  return {
    source: src,
    sourceName: getNotation(src).name,
    tokens: tokens.filter((t) => t.type !== 'literal'),
    results,
    sourceSample: renderSample(tokens, date),
  }
}

export const FMT_SAMPLES = [
  { name: '常见日期时间', value: '%Y-%m-%d %H:%M:%S' },
  { name: '中文年月日带星期', value: '%Y年%m月%d日 %A' },
  { name: '12 小时制', value: '%Y/%m/%d %I:%M:%S %p' },
  { name: '紧凑', value: '%Y%m%d%H%M%S' },
  { name: 'ISO 8601 带时区', value: '%Y-%m-%dT%H:%M:%S%z' },
]
