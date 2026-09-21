/**
 * IPv6 地址规范化
 * 支持完整展开、压缩（::）、类型判断、内嵌 IPv4、按前缀取网络号
 */

const hex4 = (s) => /^[0-9a-fA-F]{1,4}$/.test(s)

/** 展开成 8 组 4 位十六进制 */
export function expandIpv6(input) {
  let s = String(input || '').trim()
  if (!s) throw new Error('请输入 IPv6 地址')

  // 去掉可能的方括号与端口： [::1]:8080
  const bracket = /^\[([^\]]+)\](?::(\d+))?$/.exec(s)
  if (bracket) s = bracket[1]

  // 去掉前缀长度
  let prefix = null
  const slash = s.indexOf('/')
  if (slash > -1) {
    prefix = Number(s.slice(slash + 1))
    s = s.slice(0, slash)
    if (!(prefix >= 0 && prefix <= 128)) throw new Error('前缀长度要在 0~128 之间')
  }

  if ((s.match(/::/g) || []).length > 1) throw new Error('一个地址里只能出现一次 ::')

  let groups = []
  let embeddedV4 = ''

  // 处理内嵌 IPv4，如 ::ffff:192.168.1.1
  const v4m = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s)
  if (v4m) {
    const v4 = v4m[1].split('.').map(Number)
    if (v4.some((n) => n > 255)) throw new Error('内嵌的 IPv4 地址不合法')
    embeddedV4 = v4m[1]
    const h1 = ((v4[0] << 8) | v4[1]).toString(16)
    const h2 = ((v4[2] << 8) | v4[3]).toString(16)
    s = s.slice(0, s.length - v4m[1].length) + h1 + ':' + h2
  }

  if (s.indexOf('::') > -1) {
    const [head, tail] = s.split('::')
    const h = head ? head.split(':').filter((x) => x !== '') : []
    const t = tail ? tail.split(':').filter((x) => x !== '') : []
    if (h.length + t.length > 8) throw new Error('地址里的分组超过 8 组了')
    groups = h.concat(new Array(8 - h.length - t.length).fill('0'), t)
  } else {
    groups = s.split(':')
    if (groups.length !== 8) {
      throw new Error('IPv6 要有 8 组（或用 :: 省略连续的零组），现在有 ' + groups.length + ' 组')
    }
  }

  if (groups.length !== 8) throw new Error('解析出来的分组不是 8 组')
  groups.forEach((g) => {
    if (!hex4(g)) throw new Error('「' + g + '」不是合法的十六进制分组（1~4 位，0-9 a-f）')
  })

  const padded = groups.map((g) => g.toLowerCase().padStart(4, '0'))
  return { groups: padded, prefix, embeddedV4 }
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

  let out
  if (bestLen < 2) {
    out = groups.map((g) => g.replace(/^0+/, '') || '0').join(':')
  } else {
    const head = groups.slice(0, bestStart).map((g) => g.replace(/^0+/, '') || '0')
    const tail = groups.slice(bestStart + bestLen).map((g) => g.replace(/^0+/, '') || '0')
    out = head.join(':') + '::' + tail.join(':')
  }
  return prefix === null ? out : out + '/' + prefix
}

/** 内嵌 IPv4 的写法，如 ::ffff:192.168.1.1 */
export function toIpv4Mapped(input) {
  const { groups } = expandIpv6(input)
  if (groups.slice(0, 5).some((g) => g !== '0000') || groups[5] !== 'ffff') return null
  const b = []
  groups.slice(6).forEach((g) => {
    const n = parseInt(g, 16)
    b.push((n >> 8) & 0xff, n & 0xff)
  })
  return b.join('.')
}

/** 判断地址类型 */
export function classifyIpv6(input) {
  const { groups } = expandIpv6(input)
  const g0 = parseInt(groups[0], 16)
  const allZero = groups.every((g) => g === '0000')
  const isV4Mapped = groups.slice(0, 5).every((g) => g === '0000') && groups[5] === 'ffff'
  const isV4Compat = groups.slice(0, 6).every((g) => g === '0000')

  if (allZero) return { name: '未指定地址', note: ':: 相当于 IPv4 的 0.0.0.0，表示「本机还没有地址」', tag: 'warn' }
  if (groups.slice(0, 7).every((g) => g === '0000') && groups[7] === '0001') {
    return { name: '环回地址', note: '::1 就是 IPv6 的 127.0.0.1', tag: 'ok' }
  }
  if (isV4Mapped) return { name: 'IPv4 映射地址', note: '::ffff:a.b.c.d，用来在 IPv6 栈里表示 IPv4 地址', tag: 'warn' }
  if (isV4Compat && !allZero) return { name: 'IPv4 兼容地址', note: '已废弃的写法，现在应该用 ::ffff: 形式', tag: 'warn' }
  if ((g0 & 0xfe00) === 0xfc00) return { name: '唯一本地地址 ULA', note: 'fc00::/7，相当于 IPv4 的内网地址', tag: 'ok' }
  if ((g0 & 0xffc0) === 0xfe80) return { name: '链路本地地址', note: 'fe80::/10，只在本链路有效，不会路由出去', tag: 'ok' }
  if ((g0 & 0xff00) === 0xff00) return { name: '组播地址', note: 'ff00::/8，一对多通信', tag: 'info' }
  if (g0 === 0x2001 && parseInt(groups[1], 16) === 0x0db8) return { name: '文档示例地址', note: '2001:db8::/32 专门留给文档用', tag: 'info' }
  if ((g0 & 0xe000) === 0x2000) return { name: '全球单播地址', note: '2000::/3，可以在公网路由的地址', tag: 'ok' }
  return { name: '其他/保留', note: '不属于常见前缀范围', tag: 'info' }
}

/** 完整解析 */
export function parseIpv6(input) {
  const { groups, prefix, embeddedV4 } = expandIpv6(input)
  const kind = classifyIpv6(input)
  const compressed = compressIpv6(input)
  const mapped = toIpv4Mapped(input)
  return {
    input: String(input).trim(),
    groups,
    full: groups.join(':'),
    compressed,
    prefix,
    effectivePrefix: prefix === null ? 64 : prefix,
    embeddedV4,
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
