/**
 * IPv4 计算：地址 ↔ 整数、CIDR 拆解、子网划分、区间合并
 */

const SPECIAL = [
  { cidr: '0.0.0.0/8', name: '本网络', note: '「this network」保留段' },
  { cidr: '10.0.0.0/8', name: '私有地址', note: 'A 类私网' },
  { cidr: '100.64.0.0/10', name: '运营商级 NAT', note: 'CGNAT，运营商给用户用的' },
  { cidr: '127.0.0.0/8', name: '环回地址', note: '本机自己' },
  { cidr: '169.254.0.0/16', name: '链路本地', note: 'DHCP 失败时自动分配（APIPA）' },
  { cidr: '172.16.0.0/12', name: '私有地址', note: 'B 类私网' },
  { cidr: '192.0.2.0/24', name: '文档示例', note: 'TEST-NET-1' },
  { cidr: '192.168.0.0/16', name: '私有地址', note: 'C 类私网，家用路由器默认' },
  { cidr: '198.18.0.0/15', name: '基准测试', note: '性能测试保留' },
  { cidr: '198.51.100.0/24', name: '文档示例', note: 'TEST-NET-2' },
  { cidr: '203.0.113.0/24', name: '文档示例', note: 'TEST-NET-3' },
  { cidr: '224.0.0.0/4', name: '组播地址', note: 'D 类' },
  { cidr: '240.0.0.0/4', name: '保留地址', note: 'E 类，预留' },
  { cidr: '255.255.255.255/32', name: '广播地址', note: '受限广播' },
]

const OCTET_LABEL = {
  addr: { why: 'IPv4 地址要写成四段', eg: '192.168.1.1' },
  mask: { why: '掩码要写成四段', eg: '255.255.255.0' },
}

/** 点分四段的唯一判据：段数、每段是不是数字、超不超 255、有没有前导 0。
 *  返回 { int } 或 { bad }；抛错的入口和不抛错的入口都走这一份，免得校验台和
 *  IP 计算器对同一个写法给相反结论（原来 010.1.1.1 这儿悄悄算成 10.1.1.1，
 *  校验台那边判「不应有前导 0」——010 到底按十进制还是八进制读，本来就不该猜）。 */
function parseOctets(v, kind) {
  const parts = String(v).trim().split('.')
  if (parts.length !== 4) return { bad: OCTET_LABEL[kind].why + '，当前 ' + parts.length + ' 段，例如 ' + OCTET_LABEL[kind].eg }
  let n = 0
  for (let i = 0; i < 4; i++) {
    const p = parts[i]
    if (!/^\d{1,3}$/.test(p)) return { bad: '第 ' + (i + 1) + ' 段「' + p + '」不是数字，每段只能是 0~255' }
    if (p.length > 1 && p[0] === '0') return { bad: '第 ' + (i + 1) + ' 段「' + p + '」有前导 0，请直接写 ' + Number(p) }
    const x = Number(p)
    if (x > 255) return { bad: '第 ' + (i + 1) + ' 段最大 255，你写了 ' + x }
    n = n * 256 + x
  }
  return { int: n >>> 0 }
}

function octetsOrThrow(v, kind) {
  const r = parseOctets(v, kind)
  if (r.bad) throw new Error(r.bad)
  return r.int
}

export function ipToInt(ip) {
  return octetsOrThrow(ip, 'addr')
}

/** 不抛错的版本，给要返回 { ok, tip } 的校验台用；成功时的话怎么说归调用方定 */
export function parseIpv4(v) {
  const r = parseOctets(v, 'addr')
  return r.bad ? { ok: false, tip: r.bad } : { ok: true, int: r.int }
}

/** 「长得像点分四段」的唯一判据：只看形状，不管每段合不合法（那要接着问 parseIpv4）。
 *  URL 拆解、校验台、证书 SAN 试算三处都得先问这一句才知道走 IP 那套还是域名那套规则，
 *  原来各自抄了一份正则——收一处口径就会剩下两处各说各话。
 *  这里故意不 trim：三个入口都在问之前就把空白挡掉了（校验台的正则不含 \s、URL 拆解先查
 *  hasBlankOrControl、证书试算先按「主机名里有空格」抛错），能走到这儿的不可能带空白。 */
export function looksLikeIpv4(v) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(String(v))
}

export function intToIp(n) {
  const v = Number(n) >>> 0
  return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join('.')
}

function toBin(n) {
  return (n >>> 0).toString(2).padStart(32, '0')
}

export function maskFromPrefix(prefix) {
  const p = Number(prefix)
  if (!(p >= 0 && p <= 32)) throw new Error('掩码位数要在 0~32 之间')
  return p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0
}

export function prefixFromMask(mask) {
  const m = octetsOrThrow(mask, 'mask')
  const bin = toBin(m)
  if (!/^1*0*$/.test(bin)) throw new Error('掩码不是连续的 1，例如 255.255.240.0 才合法')
  return bin.split('').filter((c) => c === '1').length
}

/** 命中多条时取前缀最长（最具体）的那条：255.255.255.255 既在 240/4 里也是受限广播，
 *  该说广播。原来按表里先后返回第一条，同一个地址在 IP 计算器印「保留地址」、
 *  在校验台印「广播地址」。 */
function matchSpecial(netInt, prefix) {
  let best = null
  let bestPrefix = -1
  for (const s of SPECIAL) {
    const [ip, p] = s.cidr.split('/')
    const pre = Number(p)
    // 只有当我们的网段完全落在该特殊段之内才算命中
    if (prefix < pre) continue
    const base = ipToInt(ip) >>> 0
    const m = maskFromPrefix(pre)
    if (((netInt & m) >>> 0) === ((base & m) >>> 0) && pre > bestPrefix) {
      best = s
      bestPrefix = pre
    }
  }
  return best
}

/** 单个地址属于哪个保留/特殊段。就是「把这个地址当 /32 网段问一遍」，
 *  所以跟上面共用一份判据和一张表——校验台用它，免得自己再抄一份网段表。 */
export function specialForIp(ip) {
  return matchSpecial(ipToInt(ip), 32)
}

function ipClass(firstOctet) {
  if (firstOctet === 0) return '保留'
  if (firstOctet < 127) return 'A 类'
  if (firstOctet === 127) return '环回'
  if (firstOctet < 192) return 'B 类'
  if (firstOctet < 224) return 'C 类'
  if (firstOctet < 240) return 'D 类（组播）'
  return 'E 类（保留）'
}

/** 斜杠（或空格）后面那一截：全是数字就当掩码位数，含点就当点分掩码。
 *  原来只认「1~2 位数字」，剩下的全丢给掩码解析，于是 10.0.0.0/100 明明是斜杠后
 *  写错了，报错却指着前面那个完全正确的地址：「IPv4 地址要写成四段」。 */
function prefixFromPart(part) {
  if (/^\d+$/.test(part)) {
    if (part.length > 1 && part[0] === '0') throw new Error('「' + part + '」有前导 0，掩码位数直接写 ' + Number(part))
    return Number(part)
  }
  if (part.includes('.')) return prefixFromMask(part)
  throw new Error('「' + part + '」既不是掩码位数也不是点分掩码，斜杠后写 /24 或 /255.255.255.0')
}

/** 解析 192.168.1.10/24 或 192.168.1.10 255.255.255.0 */
export function parseCidr(input) {
  const s = String(input || '').trim()
  if (!s) throw new Error('请输入 IP 或 CIDR，例如 192.168.1.10/24')

  let ipPart = s
  let prefix

  // 允许用空格或 / 分隔掩码
  const bySlash = s.split('/')
  if (bySlash.length === 2) {
    ipPart = bySlash[0].trim()
    prefix = prefixFromPart(bySlash[1].trim())
  } else {
    const bySpace = s.split(/\s+/)
    if (bySpace.length === 2) {
      ipPart = bySpace[0]
      prefix = prefixFromPart(bySpace[1])
    } else {
      prefix = 32
    }
  }

  const ipInt = ipToInt(ipPart)
  if (!(prefix >= 0 && prefix <= 32)) throw new Error('掩码位数要在 0~32 之间')

  const mask = maskFromPrefix(prefix)
  const wildcard = (~mask >>> 0)
  const network = (ipInt & mask) >>> 0
  const broadcast = (network | wildcard) >>> 0
  const size = Math.pow(2, 32 - prefix)
  const hostCount = prefix >= 31 ? size : Math.max(0, size - 2)

  let firstHost = network
  let lastHost = broadcast
  if (prefix <= 30) {
    firstHost = (network + 1) >>> 0
    lastHost = (broadcast - 1) >>> 0
  }

  const firstOctet = (ipInt >>> 24) & 255

  return {
    input: s,
    ip: intToIp(ipInt),
    ipInt,
    ipBin: toBin(ipInt),
    prefix,
    mask: intToIp(mask),
    maskInt: mask,
    maskBin: toBin(mask),
    wildcard: intToIp(wildcard),
    network: intToIp(network),
    networkInt: network,
    networkBin: toBin(network),
    broadcast: intToIp(broadcast),
    broadcastInt: broadcast,
    firstHost: intToIp(firstHost),
    lastHost: intToIp(lastHost),
    size,
    hostCount,
    cidr: intToIp(network) + '/' + prefix,
    ipClass: ipClass(firstOctet),
    special: matchSpecial(network, prefix),
    /** 「网络号/广播号不能配给主机」这件事只在 /30 及更短的前缀下存在。
     *  /31 是点对点链路（RFC 3021）、/32 是单地址，两个都能配——原来不分前缀
     *  一律比 ipInt === network，于是 8.8.8.8/32 界面印着「这就是网络地址本身，
     *  不能配给主机」，同页另一行却说它有 1 个可用地址。 */
    isNetworkAddress: prefix <= 30 && ipInt === network,
    isBroadcastAddress: prefix <= 30 && ipInt === broadcast,
    hex: '0x' + ipInt.toString(16).toUpperCase().padStart(8, '0'),
  }
}

/** 把一个网段按更长前缀拆成子网 */
export function splitSubnet(cidr, newPrefix) {
  const info = parseCidr(cidr)
  const np = Number(newPrefix)
  if (!(np > info.prefix && np <= 32)) {
    throw new Error('新掩码要大于原掩码（' + info.prefix + '）且不超过 32')
  }
  const count = Math.pow(2, np - info.prefix)
  if (count > 1024) throw new Error('会拆出 ' + count + ' 个子网，太多了（上限 1024）')
  const step = Math.pow(2, 32 - np)
  const out = []
  for (let i = 0; i < count; i++) {
    const net = (info.networkInt + i * step) >>> 0
    const bc = (net + step - 1) >>> 0
    out.push({
      index: i + 1,
      network: intToIp(net),
      broadcast: intToIp(bc),
      cidr: intToIp(net) + '/' + np,
      range: intToIp(np <= 30 ? net + 1 : net) + ' ~ ' + intToIp(np <= 30 ? bc - 1 : bc),
      hosts: np >= 31 ? step : Math.max(0, step - 2),
    })
  }
  return out
}

/** 把起始~结束地址尽量合并成最少的 CIDR 段 */
export function rangeToCidrs(startIp, endIp) {
  let start = ipToInt(startIp)
  let end = ipToInt(endIp)
  if (start > end) {
    const t = start
    start = end
    end = t
  }
  const out = []
  let guard = 0
  while (start <= end && guard++ < 4096) {
    // start 能被 2 整除的次数，决定这块最大能对齐到多大（块首必须对齐）
    let maxSize = 32
    if (start !== 0) {
      maxSize = 0
      let s = start
      while (s % 2 === 0 && maxSize < 32) {
        s /= 2
        maxSize++
      }
    }
    // 在不越过 end 的前提下尽量取大的块
    let size = 0
    while (size < maxSize) {
      const blockEnd = start + Math.pow(2, size + 1) - 1
      if (blockEnd > end) break
      size++
    }
    out.push(intToIp(start) + '/' + (32 - size))
    start = start + Math.pow(2, size)
    if (!isFinite(start)) break
  }
  return out
}

/** 常见内网网段的速查 */
export const COMMON_SUBNETS = [
  { cidr: '10.0.0.0/8', note: 'A 类私网，大企业常用，约 1677 万个地址' },
  { cidr: '172.16.0.0/12', note: 'B 类私网，Docker 默认网桥常用' },
  { cidr: '192.168.0.0/16', note: 'C 类私网，家用路由器默认' },
  { cidr: '192.168.1.0/24', note: '最常见的家用网段，254 台设备' },
  { cidr: '10.0.0.0/24', note: '云主机内网常见切法' },
  { cidr: '192.168.0.0/22', note: '监控/NVR 常用，1022 个地址' },
]
