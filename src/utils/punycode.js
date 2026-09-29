/**
 * Punycode 与国际化域名（RFC 3492）
 * 中文域名在 DNS 里存的是 xn-- 开头的 ASCII 形式，这个工具负责互转。
 */

const BASE = 36
const TMIN = 1
const TMAX = 26
const SKEW = 38
const DAMP = 700
const INITIAL_BIAS = 72
const INITIAL_N = 128

function adapt(delta, numPoints, firstTime) {
  let d = firstTime ? Math.floor(delta / DAMP) : delta >> 1
  d += Math.floor(d / numPoints)
  let k = 0
  while (d > ((BASE - TMIN) * TMAX) >> 1) {
    d = Math.floor(d / (BASE - TMIN))
    k += BASE
  }
  return k + Math.floor(((BASE - TMIN + 1) * d) / (d + SKEW))
}

/** 数字 -> 字符（0-25 → a-z，26-35 → 0-9） */
function digitToChar(d) {
  return String.fromCharCode(d + 22 + (d < 26 ? 75 : 0))
}

/** 字符 -> 数字 */
function charToDigit(cp) {
  if (cp >= 48 && cp < 58) return cp - 22 // 0-9
  if (cp >= 65 && cp < 91) return cp - 65 // A-Z
  if (cp >= 97 && cp < 123) return cp - 97 // a-z
  return BASE
}

/** Punycode 编码（不含 xn-- 前缀） */
export function punycodeEncode(input) {
  const codePoints = [...String(input)].map((c) => c.codePointAt(0))
  const output = []
  const basic = codePoints.filter((cp) => cp < 0x80)
  let n = INITIAL_N
  let delta = 0
  let bias = INITIAL_BIAS
  let h = basic.length
  const b = h

  basic.forEach((cp) => output.push(String.fromCodePoint(cp)))
  if (b > 0 && h < codePoints.length) output.push('-')

  while (h < codePoints.length) {
    let m = Infinity
    for (const cp of codePoints) {
      if (cp >= n && cp < m) m = cp
    }
    if (m === Infinity) break
    if ((m - n) * (h + 1) > Number.MAX_SAFE_INTEGER) throw new Error('内容太长，超出可计算范围')
    delta += (m - n) * (h + 1)
    n = m

    for (const cp of codePoints) {
      if (cp < n) delta++
      else if (cp === n) {
        let q = delta
        for (let k = BASE; ; k += BASE) {
          const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias
          if (q < t) break
          output.push(digitToChar(t + ((q - t) % (BASE - t))))
          q = Math.floor((q - t) / (BASE - t))
        }
        output.push(digitToChar(q))
        bias = adapt(delta, h + 1, h === b)
        delta = 0
        h++
      }
    }
    delta++
    n++
  }
  return output.join('')
}

/** Punycode 解码 */
export function punycodeDecode(input) {
  const arr = [...String(input)]
  const output = []
  let n = INITIAL_N
  let i = 0
  let bias = INITIAL_BIAS

  const lastDash = input.lastIndexOf('-')
  let idx = 0
  if (lastDash > -1) {
    for (let j = 0; j < lastDash; j++) {
      const cp = arr[j].codePointAt(0)
      if (cp >= 0x80) throw new Error('Punycode 的基本段里不该出现非 ASCII 字符')
      output.push(arr[j])
    }
    idx = lastDash + 1
  }

  while (idx < arr.length) {
    const oldi = i
    let w = 1
    for (let k = BASE; ; k += BASE) {
      if (idx >= arr.length) throw new Error('Punycode 数据不完整')
      const digit = charToDigit(arr[idx++].codePointAt(0))
      if (digit >= BASE) throw new Error('Punycode 里出现了非法字符')
      i += digit * w
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias
      if (digit < t) break
      w *= BASE - t
      if (w > Number.MAX_SAFE_INTEGER) throw new Error('数值超出可计算范围')
    }
    bias = adapt(i - oldi, output.length + 1, oldi === 0)
    n += Math.floor(i / (output.length + 1))
    i %= output.length + 1
    if (n > 0x10ffff) throw new Error('解出的码点超出 Unicode 范围')
    output.splice(i, 0, String.fromCodePoint(n))
    i++
  }
  return output.join('')
}

/** 规范化一个域名：小写 + 去掉两端空白 + 去掉末尾的点 */
function normalizeDomain(d) {
  return String(d).trim().toLowerCase().replace(/\.$/, '')
}

/**
 * 域名 -> ASCII（xn-- 形式）
 * @returns {{ labels: Array, ascii: string }}
 */
export function domainToAscii(domain) {
  const d = normalizeDomain(domain)
  if (!d) throw new Error('请输入域名')
  const labels = d.split('.').map((label) => {
    if (!label) return { input: '', output: '', encoded: false, note: '空标签' }
    // 已经是一部分 xn-- 的标签直接保留
    if (/^xn--/i.test(label)) {
      return { input: label, output: label, encoded: false, note: '本来就是 Punycode 形式' }
    }
    // 「纯 ASCII」判定：\x00-\x7f 本来就覆盖 ASCII 全集（含控制字符），语义正确
    // eslint-disable-next-line no-control-regex
    if (/^[\x00-\x7f]+$/.test(label)) {
      return { input: label, output: label, encoded: false, note: '纯 ASCII，无需转换' }
    }
    const enc = punycodeEncode(label)
    return {
      input: label,
      output: 'xn--' + enc,
      encoded: true,
      note: '本地部分编码为 ' + enc,
    }
  })
  return { labels, ascii: labels.map((l) => l.output).join('.') }
}

/**
 * ASCII（xn--）-> Unicode 域名
 */
export function domainToUnicode(domain) {
  const d = normalizeDomain(domain)
  if (!d) throw new Error('请输入域名')
  const labels = d.split('.').map((label) => {
    if (!label) return { input: '', output: '', decoded: false, note: '空标签' }
    if (!/^xn--/i.test(label)) {
      return { input: label, output: label, decoded: false, note: '不是 xn-- 开头，原样保留' }
    }
    try {
      const dec = punycodeDecode(label.slice(4))
      return { input: label, output: dec, decoded: true, note: '解出「' + dec + '」' }
    } catch (e) {
      return { input: label, output: label, decoded: false, note: '解码失败：' + e.message }
    }
  })
  return { labels, unicode: labels.map((l) => l.output).join('.') }
}

/** 一次给出双向结果 */
export function convert(domain) {
  const s = String(domain).trim()
  if (!s) throw new Error('请输入域名')
  // 与上面同一语义：ASCII 之外的字符才算「需要转换」
  // eslint-disable-next-line no-control-regex
  const hasNonAscii = /[^\x00-\x7f]/.test(s)
  const hasPuny = /(^|\.)xn--/i.test(s)
  const toA = domainToAscii(s)
  const toU = domainToUnicode(s)
  return {
    input: s,
    direction: hasNonAscii ? 'unicode→ascii' : hasPuny ? 'ascii→unicode' : 'ascii（本就不需要转换）',
    ascii: toA.ascii,
    unicode: toU.unicode,
    asciiLabels: toA.labels,
    unicodeLabels: toU.labels,
    changed: hasNonAscii || hasPuny,
  }
}

export const PUNY_NOTES = [
  'DNS 只认 ASCII，所以中文、日文、德文变音域名都要先转成 xn-- 开头的 Punycode 形式才能注册与解析。',
  'xn-- 是 ACE 前缀，表示「后面这串是 Punycode 编码的国际化域名」。',
  '浏览器地址栏会显示成可读的原语言，但复制出来的链接往往是 xn-- 形式——这两种写法是同一个域名。',
  '安全提示：同形异义（homograph）钓鱼常用这招——用西里尔字母「а」冒充拉丁字母「a」，肉眼几乎分不出。看到 xn-- 开头的域名要多留个心眼。',
  '长度限制按 ACE 形式算：一个标签最多 63 个字符，整个域名最多 253 个。',
]

export const PUNY_SAMPLES = [
  { name: '中文 .cn', value: '中文.cn' },
  { name: '中文 .公司', value: '随身匣.公司' },
  { name: '日文', value: '例え.テスト' },
  { name: '德文变音', value: 'münchen.de' },
  { name: '俄文', value: 'пример.рф' },
  { name: 'Punycode 形式', value: 'xn--fiq228c.cn' },
]
