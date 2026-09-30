/**
 * Punycode 与国际化域名（RFC 3492）
 * 中文域名在 DNS 里存的是 xn-- 开头的 ASCII 形式，这个工具负责互转。
 *
 * 编解码按 RFC 3492 那套算法，界面上讲的那些限制（标签里能有什么字符、连字符的
 * 位置、63/253 的长度、xn-- 必须能对上）由这个文件 enforce。
 * 原来这些只写在文案里，代码一条也没查：「中 文.cn」被编成一个中间带空格的
 * xn--，「xn--a」解出一个看不见的控制字符照样印成「可读形式」，
 * 编码后 508 个字符的域名也说照办。
 *
 * 这一份做的是编码转换，不是 UTS#46 的完整规范化：折叠按平台自带的 NFKC 走
 * （全角折半角、连字拆开、带圈变数字），大小写会折；但注册局那张「哪些码点允许
 * 出现在域名里」的表、以及逐脚本的混淆字符判定，这里没有，也不做。
 * 所以「这串能不能注册」「浏览器会不会把它显示成另一个名字」都不是本页能回答的，
 * 界面那行「不校验是否为合法的 TLD」说的就是这件事。
 */

const BASE = 36
const TMIN = 1
const TMAX = 26
const SKEW = 38
const DAMP = 700
const INITIAL_BIAS = 72
const INITIAL_N = 128

/** DNS 的硬限制：一个标签最多 63 字节、整个域名最多 253 字节（按 ASCII 形式算） */
const MAX_LABEL = 63
const MAX_DOMAIN = 253

const hex = (cp) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0')

/** IDNA 一律不许出现的码点。返回中文类别名，合法就返回空串。
 *  这里列的是「无论什么脚本都不许」的那几类（空白、控制、格式、代理、非字符、私用），
 *  上下文相关的连字（零宽不连字符那类）不在表里放宽，一律拒——工具不做脚本判定。 */
function badCharClass(s) {
  for (const c of String(s)) {
    const cp = c.codePointAt(0)
    if (cp < 0x20) return '控制字符 ' + hex(cp)
    if (cp === 0x7f) return '删除符 ' + hex(cp)
    if (cp >= 0x80 && cp <= 0x9f) return 'C1 控制符 ' + hex(cp)
    if (cp === 0xad) return '软连字符 ' + hex(cp)
    if (cp === 0x20) return '空格'
    if (cp === 0xa0 || cp === 0x1680 || (cp >= 0x2000 && cp <= 0x200b) || cp === 0x3000) return '空白字符 ' + hex(cp)
    if (cp >= 0x200c && cp <= 0x200f) return '零宽/方向控制符 ' + hex(cp)
    if (cp === 0x2028 || cp === 0x2029 || (cp >= 0x202a && cp <= 0x202e)) return '行或方向分隔符 ' + hex(cp)
    if (cp >= 0x2060 && cp <= 0x2064) return '不可见连接符 ' + hex(cp)
    if (cp === 0xfeff) return '字节序标记 ' + hex(cp)
    if (cp >= 0xd800 && cp <= 0xdfff) return '半个表情符号（孤立的代理字符）'
    if (cp > 0x10ffff) return '超出 Unicode 范围的码点 ' + hex(cp)
    if (cp === 0xfffe || cp === 0xffff) return '非字符 ' + hex(cp)
    if (cp >= 0xfdd0 && cp <= 0xfdef) return '非字符 ' + hex(cp)
    if (cp >= 0xe000 && cp <= 0xf8ff) return '私用区字符 ' + hex(cp)
  }
  return ''
}

/** 标签里的 ASCII 字符只许字母、数字、连字符（整串已经先小写过） */
/** 串里有没有 ASCII 之外的码点 */
function hasNonAscii(s) {
  for (const c of String(s)) if (c.codePointAt(0) >= 0x80) return true
  return false
}

/** 标签里的 ASCII 字符只许字母、数字、连字符；下划线例外地允许出现在标签开头——
 *  「_dmarc.example.com」「_smtp._tcp.example.com」这类服务记录名是真在用的。
 *  但这个例外只给纯 ASCII 的标签：下划线一旦跟非 ASCII 混在一个标签里，
 *  编出来的 A 标签是「xn--_x-8dc」这种下划线跑到 xn-- 后面的写法，
 *  自家解析器按同一条规则就得拒——编出一个自己认不回的串是不能接受的。 */
function badAsciiChar(label) {
  const asciiOnly = !hasNonAscii(label)
  for (let i = 0; i < label.length; i++) {
    const c = label[i]
    if (c.codePointAt(0) >= 0x80) continue
    if (c === '_' && i === 0 && asciiOnly) continue
    if (!/[a-z0-9-]/.test(c)) return c
  }
  return ''
}

/** RFC 5891 的连字符位置规则 */
function hyphenProblem(label) {
  if (label[0] === '-') return '不能以「-」开头'
  if (label[label.length - 1] === '-') return '不能以「-」结尾'
  if (label.length > 3 && label[2] === '-' && label[3] === '-' && !label.startsWith('xn--')) return '第 3、4 位不能都是「-」，那两个位置是 xn-- 专用'
  return ''
}

/** 一个标签合不合法，返回中文毛病，合法返回空串 */
function labelProblem(label) {
  const cls = badCharClass(label)
  if (cls) return '里有' + cls
  const bad = badAsciiChar(label)
  if (bad) return '里的字符「' + bad + '」不能出现在域名里'
  return hyphenProblem(label)
}

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
  const s = String(input)
  // 编码这头不许产出解码那头认不回去的东西：孤立代理、控制字符那些，
  // 算法照样能压出一个 xn--，可这串没有对应域名，印出来还编不回原样
  const bad = badCharClass(s)
  if (bad) throw new Error('要编码的内容里有' + bad + '，它进不了域名标签')
  const codePoints = [...s].map((c) => c.codePointAt(0))
  const output = []
  const basic = codePoints.filter((cp) => cp < 0x80)
  let n = INITIAL_N
  let delta = 0
  let bias = INITIAL_BIAS
  let h = basic.length
  const b = h

  basic.forEach((cp) => output.push(String.fromCodePoint(cp)))
  // 分隔符的条件是「有基本码点」，不是「基本码点只是一部分」：
  // 全是基本码点时也要留那个「-」，否则解的人找不到分隔符，会把整串当扩展数据
  // 解出一串看不见的控制字符——「a」编成「a」再解回 U+0080 就是这么来的。
  if (b > 0) output.push('-')

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
  // 算法跑得通不等于结果能用：xn--a 解出 U+0080、xn--ib9b 解出孤立代理，
  // 这两种字符串印在界面上就是一个也看不见、还编不回原样的东西
  const out = output.join('')
  const cls = badCharClass(out)
  if (cls) throw new Error('解出来的内容里有' + cls + '，这个 xn-- 写法不对应任何可注册的域名')
  return out
}

/** xn-- 标签的数据部分能不能解成一个真能用的标签 */
function decodeXnLabel(payload, shown) {
  if (!payload) throw new Error('「xn--」后面没有内容，像 xn--fiq228c 这样，你写了「' + shown + '」')
  // 解出来也按同一条尺折一次：注册局存的是折后的形式，折完全是 ASCII 的标签
  // 本来就不该带 xn--（「xn--ri7c4agaaa」解出「ｆｕｗｗｗｗ」就是这种），
  // 折完跟原来的码点对不上，那这串 xn-- 就不是任何域名在 DNS 里的那一个
  // 报错要指着是哪一个标签：域名可以有几十段，只说「解出来的内容有 C1 控制符」没人知道改哪儿
  let dec
  try {
    dec = punycodeDecode(payload).normalize('NFKC')
  } catch (e) {
    throw new Error('「' + shown + '」解不出来：' + e.message, { cause: e })
  }
  if (!dec) throw new Error('「' + shown + '」解出来是空的')
  if (dec.startsWith('xn--')) throw new Error('「' + shown + '」解出来自己又带 xn-- 前缀，这种写法没有对应的域名')
  if (!hasNonAscii(dec)) throw new Error('「' + shown + '」解出来是「' + dec + '」，全是 ASCII，这种标签本来就不该带 xn--')
  if (dec !== dec.toLowerCase()) throw new Error('「' + shown + '」解出来是「' + dec + '」，还带着大写，不是任何可注册域名的规范形式')
  const prob = labelProblem(dec)
  if (prob) throw new Error('「' + shown + '」解出来的标签' + prob)
  const again = punycodeEncode(dec)
  if (again !== payload.toLowerCase()) {
    throw new Error('「' + shown + '」解出来再编回去是「xn--' + again + '」，跟你写的这一串对不上')
  }
  return dec
}

/** 规范化一个域名：小写 + NFKC 折叠 + 去掉两端空白。末尾的点是根标签，留着，但要知道发生过什么。
 *  NFKC 这一步不能省：全角「．」（U+FF0E）折完才是分隔符，「ａｐｐｌｅ．ｃｏｍ」
 *  在浏览器眼里就是 apple.com。不折的话这一串会被当成一个超长标签，
 *  转出来的 xn-- 跟 DNS 里存的根本不是同一个名字——钓鱼检查恰恰死在这种地方。
 *  折了必须说出来（foldedFrom 带回 convert 的备注），不能悄悄改用户写的东西。 */
function normalizeDomain(d) {
  const raw = String(d).trim()
  const compat = raw.normalize('NFKC').trim()
  const s = compat.toLowerCase()
  return {
    domain: s.replace(/\.$/, ''),
    trailingDot: /\.$/.test(s),
    foldedFrom: compat === raw ? '' : raw,
  }
}

/** 编码后的标签长度也在这查：DNS 里一个标签就是一个长度字节 */
function checked(row, label) {
  if (row.output.length > MAX_LABEL) {
    throw new Error('标签「' + label + '」的 ASCII 形式有 ' + row.output.length + ' 个字符，DNS 一个标签最多 ' + MAX_LABEL + ' 个')
  }
  return row
}

function eachLabel(domain, fn) {
  if (!domain) throw new Error('请输入域名')
  const out = []
  domain.split('.').forEach((label, i, all) => {
    if (!label) {
      const where = i === all.length - 1 ? '末尾' : '第 ' + (i + 1) + ' 个'
      throw new Error('域名「' + domain + '」' + where + '标签是空的，标签之间要点开一段内容')
    }
    out.push(fn(label, i))
  })
  return out
}

/**
 * 域名 -> ASCII（xn-- 形式）
 * @returns {{ labels: Array, ascii: string, trailingDot: boolean }}
 */
export function domainToAscii(domain) {
  const { domain: d, trailingDot, foldedFrom } = normalizeDomain(domain)
  const labels = eachLabel(d, (label) => {
    // xn-- 开头先按 A 标签验：这类标签的毛病（空数据、非法字符、对不上）
    // 都由解码那套判据说，比「不能以「-」结尾」这种沾不到边的话有用
    const isXn = label.startsWith('xn--')
    if (isXn) decodeXnLabel(label.slice(4), label)
    const prob = labelProblem(label)
    if (prob) throw new Error('标签「' + label + '」' + prob)
    if (isXn) {
      return checked({ input: label, output: label, encoded: false, note: '本来就是 Punycode 形式' }, label)
    }
    if (!hasNonAscii(label)) {
      return checked({ input: label, output: label, encoded: false, note: '纯 ASCII，无需转换' }, label)
    }
    const enc = punycodeEncode(label)
    return checked({ input: label, output: 'xn--' + enc, encoded: true, note: '本地部分编码为 ' + enc }, label)
  })
  let ascii = labels.map((l) => l.output).join('.')
  if (trailingDot) ascii += '.'
  if (ascii.replace(/\.$/, '').length > MAX_DOMAIN) {
    throw new Error('整个域名编码后是 ' + ascii.length + ' 个字符，DNS 最多 ' + MAX_DOMAIN + ' 个')
  }
  return { labels, ascii, trailingDot, foldedFrom }
}

/**
 * ASCII（xn--）-> Unicode 域名
 */
export function domainToUnicode(domain) {
  const { domain: d, trailingDot, foldedFrom } = normalizeDomain(domain)
  const labels = eachLabel(d, (label) => {
    const isXn = label.startsWith('xn--')
    if (isXn) {
      return { input: label, output: decodeXnLabel(label.slice(4), label), decoded: true }
    }
    const prob = labelProblem(label)
    if (prob) throw new Error('标签「' + label + '」' + prob)
    return { input: label, output: label, decoded: false }
  })
  let unicode = labels.map((l) => l.output).join('.')
  if (trailingDot) unicode += '.'
  return { labels, unicode, trailingDot, foldedFrom }
}

/** 一次给出双向结果 */
export function convert(domain) {
  const s = String(domain).trim()
  if (!s) throw new Error('请输入域名')
  const { domain: inFolded, foldedFrom } = normalizeDomain(s)
  const needsAscii = hasNonAscii(inFolded)
  const hasPuny = /(^|\.)xn--/i.test(inFolded)
  // 折过以后再报错，得说清毛病出在折完的那一串上，不然用户对着全角原文找不出那个点
  const foldLead = foldedFrom ? '这串里有全角/兼容字符，先按 NFKC 折成「' + inFolded + '」，下面说的是折完这一串：' : ''
  const run = (fn) => {
    try {
      return fn(s)
    } catch (e) {
      if (!foldLead) throw e
      throw new Error(foldLead + e.message, { cause: e })
    }
  }
  const toA = run(domainToAscii)
  const toU = run(domainToUnicode)
  // 逐标签那一屏：哪一侧真做了事就印哪一侧。原来组件只取编码侧，
  // 于是粘 xn--fiq228c.cn 进来时表上全是「本来就是 Punycode 形式」，
  // 真正有用的「解出「中文」」算完没人印
  const labels = toA.labels.map((l, i) => {
    const u = toU.labels[i]
    if (l.encoded) return { input: l.input, output: l.output, note: '编码为 ' + l.output }
    if (u.decoded) return { input: l.input, output: u.output, note: '解出「' + u.output + '」' }
    return { input: l.input, output: l.input, note: '纯 ASCII，本来就是这种写法' }
  })
  const notes = []
  if (foldedFrom) {
    notes.push('这串里有全角/兼容字符，注册局（以及浏览器）会先按 NFKC 折成基本形式再存，'
      + '这里同一条尺：「' + foldedFrom + '」折成「' + inFolded + '」再转。'
      + '折这一步会丢信息，两种写法都要看')
  }
  if (toA.trailingDot) notes.push('末尾的点是 DNS 的根标签，已原样留着')
  if (hasPuny && needsAscii) notes.push('这串里既有 xn-- 又有非 ASCII 字符，两种写法混在一起，检查时两种都要看')
  return {
    direction: needsAscii ? 'unicode→ascii' : hasPuny ? 'ascii→unicode' : 'ascii（本就不需要转换）',
    ascii: toA.ascii,
    unicode: toU.unicode,
    labels,
    notes,
  }
}

export const PUNY_SAMPLES = [
  { name: '中文 .cn', value: '中文.cn' },
  { name: '中文 .公司', value: '随身匣.公司' },
  { name: '日文', value: '例え.テスト' },
  { name: '德文变音', value: 'münchen.de' },
  { name: '俄文', value: 'пример.рф' },
  { name: 'Punycode 形式', value: 'xn--fiq228c.cn' },
]
