/**
 * IPv6 地址规范化
 * 支持完整展开、压缩（::）、类型判断、内嵌 IPv4、按前缀取网络号
 */
import { parseIpv4 } from './ip'

const hex4 = (s) => /^[0-9a-fA-F]{1,4}$/.test(s)
/** 「::」某一侧的写法：若干组十六进制，组之间恰好一个冒号，首尾都不许挂冒号 */
const HEXTET_RUN = /^[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4})*$/

/** 前缀长度要不要跟着地址一起输出 */
function withPrefix(text, prefix) {
  return prefix === null ? text : text + '/' + prefix
}

/** 展开成 8 组 4 位十六进制 */
export function expandIpv6(input) {
  let s = String(input || '').trim()
  if (!s) throw new Error('请输入 IPv6 地址')

  // 去掉前缀长度（先剥前缀再剥方括号，[2001:db8::1]/32 这种写法才拆得干净）
  let prefix = null
  const slash = s.indexOf('/')
  if (slash > -1) {
    const p = s.slice(slash + 1)
    // 原来直接 Number(p)，/064 这种带前导 0 的悄悄按十进制收下了
    if (!/^\d{1,3}$/.test(p) || (p.length > 1 && p[0] === '0') || Number(p) > 128) {
      throw new Error('前缀长度要写成 0~128 的数字，例如 /64，你写了「' + p + '」')
    }
    prefix = Number(p)
    s = s.slice(0, slash)
  }

  // 去掉可能的方括号与端口： [::1]:8080
  const bracket = /^\[([^\]]+)\](?::(\d+))?$/.exec(s)
  if (bracket) s = bracket[1]

  if ((s.match(/::/g) || []).length > 1) throw new Error('一个地址里只能出现一次 ::')

  // 处理内嵌 IPv4，如 ::ffff:192.168.1.1
  const v4m = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s)
  if (v4m) {
    // 四段的判据只在 ip.js 有一份：原来这里只查「有没有超过 255」，
    // 于是 ::ffff:010.1.1.1 被悄悄换算成 10.1.1.1，校验台那边却判它不合法
    if (!s.includes(':')) {
      throw new Error('这看起来是 IPv4 地址「' + v4m[1] + '」，IPv6 里没有这种写法；要嵌进 IPv6 得用 ::ffff: 开头的形式，例如 ::ffff:192.168.1.1')
    }
    const r = parseIpv4(v4m[1])
    if (!r.ok) throw new Error('内嵌的 IPv4 不合法：' + r.tip)
    const hi = (r.int >>> 16).toString(16)
    const lo = (r.int & 0xffff).toString(16)
    s = s.slice(0, s.length - v4m[1].length) + hi + ':' + lo
  }

  let groups
  if (s.indexOf('::') > -1) {
    const at = s.indexOf('::')
    const head = s.slice(0, at)
    const tail = s.slice(at + 2)
    // 原来两侧是按冒号拆开再把空组 filter 掉，于是 2001:db8:::1、:2001:db8::1、
    // 2001:db8::1: 这些畸形写法都被悄悄当成 2001:db8::1 印到界面上
    if (head && !HEXTET_RUN.test(head)) throw new Error('「::」左边的「' + head + '」不是合法的分组写法')
    if (tail && !HEXTET_RUN.test(tail)) throw new Error('「::」右边的「' + tail + '」不是合法的分组写法')
    const h = head ? head.split(':') : []
    const t = tail ? tail.split(':') : []
    // :: 必须真的代表至少一组零，否则它就是个多余的冒号对
    if (h.length + t.length > 7) {
      throw new Error('「::」至少要省略一组零，你这两边已经有 ' + (h.length + t.length) + ' 组了')
    }
    groups = h.concat(new Array(8 - h.length - t.length).fill('0'), t)
  } else {
    groups = s.split(':')
    if (groups.length !== 8) {
      throw new Error('IPv6 要有 8 组（或用 :: 省略连续的零组），现在有 ' + groups.length + ' 组')
    }
  }

  groups.forEach((g) => {
    if (!hex4(g)) throw new Error('「' + g + '」不是合法的十六进制分组（1~4 位，0-9 a-f）')
  })

  const padded = groups.map((g) => g.toLowerCase().padStart(4, '0'))
  return { groups: padded, prefix }
}

/** 压缩写法：把最长的连续零组换成 :: */
export function compressIpv6(input) {
  const { groups, prefix } = expandIpv6(input)
  let bestStart = -1
  let bestLen = 0
  let curStart = -1
  let curLen = 0
  groups.forEach((g, i) => {
    if (g === '0000') {
      if (curStart < 0) curStart = i
      curLen++
      if (curLen > bestLen) {
        bestLen = curLen
        bestStart = curStart
      }
    } else {
      curStart = -1
      curLen = 0
    }
  })

  const trim = groups.map((g) => g.replace(/^0+/, '') || '0')
  let out
  if (bestLen < 2) {
    out = trim.join(':')
  } else {
    out = trim.slice(0, bestStart).join(':') + '::' + trim.slice(bestStart + bestLen).join(':')
  }
  return withPrefix(out, prefix)
}

/** 高 96 位全零（已废弃的 IPv4 兼容式）或 前 80 位全零 + 第 6 组是 ffff（映射式）时，
 *  低 32 位就是一个 IPv4。:: 和 ::1 虽然也落在「高 96 位全零」里，但它们各有名字
 *  （未指定、环回），把它们说成「等价 IPv4 0.0.0.1」是错的。
 *  判据只有这一份：toIpv4Mapped 与 classifyIpv6 都从这里取，免得一个说有、一个说没有。 */
function embeddedV4Of(groups) {
  const zero = (g) => g === '0000'
  const headZero = (n) => groups.slice(0, n).every(zero)
  const low = (parseInt(groups[6], 16) << 16) | parseInt(groups[7], 16)
  const text = [(low >>> 24) & 255, (low >>> 16) & 255, (low >>> 8) & 255, low & 255].join('.')
  if (headZero(5) && groups[5] === 'ffff') return { kind: 'mapped', text }
  if (headZero(6) && !(groups[6] === '0000' && (groups[7] === '0000' || groups[7] === '0001'))) {
    return { kind: 'compat', text }
  }
  return null
}

/** 地址里嵌着的 IPv4，映射式与兼容式都算 */
export function toIpv4Mapped(input) {
  const { groups } = expandIpv6(input)
  const e = embeddedV4Of(groups)
  return e ? e.text : null
}

/** 判断地址类型 */
export function classifyIpv6(input) {
  const { groups } = expandIpv6(input)
  const g0 = parseInt(groups[0], 16)
  const embedded = embeddedV4Of(groups)

  if (groups.every((g) => g === '0000')) return { name: '未指定地址', note: ':: 相当于 IPv4 的 0.0.0.0，表示「本机还没有地址」', tag: 'warn' }
  if (groups.slice(0, 7).every((g) => g === '0000') && groups[7] === '0001') {
    return { name: '环回地址', note: '::1 就是 IPv6 的 127.0.0.1', tag: 'ok' }
  }
  if (embedded && embedded.kind === 'mapped') {
    return { name: 'IPv4 映射地址', note: '::ffff:a.b.c.d，用来在 IPv6 栈里表示 IPv4 地址', tag: 'warn' }
  }
  if (embedded && embedded.kind === 'compat') {
    return { name: 'IPv4 兼容地址', note: '已废弃的写法，现在应该用 ::ffff: 形式', tag: 'warn' }
  }
  if ((g0 & 0xfe00) === 0xfc00) return { name: '唯一本地地址 ULA', note: 'fc00::/7，相当于 IPv4 的内网地址', tag: 'ok' }
  if ((g0 & 0xffc0) === 0xfe80) return { name: '链路本地地址', note: 'fe80::/10，只在本链路有效，不会路由出去', tag: 'ok' }
  if ((g0 & 0xff00) === 0xff00) return { name: '组播地址', note: 'ff00::/8，一对多通信', tag: 'info' }
  if (g0 === 0x2001 && parseInt(groups[1], 16) === 0x0db8) return { name: '文档示例地址', note: '2001:db8::/32 专门留给文档用', tag: 'info' }
  if ((g0 & 0xe000) === 0x2000) return { name: '全球单播地址', note: '2000::/3，可以在公网路由的地址', tag: 'ok' }
  return { name: '其他/保留', note: '不属于常见前缀范围', tag: 'info' }
}

/** 完整解析 */
export function parseIpv6(input) {
  const { groups, prefix } = expandIpv6(input)
  const kind = classifyIpv6(input)
  const compressed = compressIpv6(input)
  const mapped = toIpv4Mapped(input)
  return {
    input: String(input).trim(),
    groups,
    // 完整写法也要带上前缀长度：原来带 /32 的输入在「压缩写法」里带着 /32、
    // 在「完整写法」里却丢了，同一页两行说的是两个东西，抄走完整写法的人少了个 /32
    full: withPrefix(groups.join(':'), prefix),
    compressed,
    prefix,
    mapped,
    kind,
    groupCount: 8,
    // 前 64 位是网络前缀，后 64 位是接口标识（标准子网划分）
    networkPart: groups.slice(0, 4).join(':'),
    interfacePart: groups.slice(4).join(':'),
    binary: groups.map((g) => parseInt(g, 16).toString(2).padStart(16, '0')).join(' '),
  }
}

export const IPV6_NOTES = [
  'IPv6 地址是 128 位，写成 8 组、每组 4 位十六进制。',
  '连续的零组可以用一次 :: 省略，但一个地址里只能出现一次。',
  '前 64 位通常是网络前缀，后 64 位是接口标识——这也是为什么默认按 /64 划子网。',
  '没有子网掩码的概念，前缀长度直接写在地址后面，如 2001:db8::/32。',
]

export const IPV6_SAMPLES = [
  { name: '环回', value: '::1' },
  { name: '完整未压缩', value: '2001:0db8:0000:0000:0000:ff00:0042:8329' },
  { name: '标准压缩', value: '2001:db8::ff00:42:8329' },
  { name: '链路本地', value: 'fe80::1c2d:3e4f:5a6b:7c8d' },
  { name: '内网 ULA', value: 'fd12:3456:789a:1::1' },
  { name: 'IPv4 映射', value: '::ffff:192.168.1.1' },
  { name: '组播', value: 'ff02::1' },
]
