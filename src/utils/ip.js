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
  { cidr: '224.0.0.0/4', name: '组播地址', note: 'D 类' },
  { cidr: '240.0.0.0/4', name: '保留地址', note: 'E 类，预留' },
  { cidr: '255.255.255.255/32', name: '广播地址', note: '受限广播' },
]

export function ipToInt(ip) {
  const parts = String(ip).trim().split('.')
  if (parts.length !== 4) throw new Error('IPv4 地址要写成四段，例如 192.168.1.1')
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) throw new Error('「' + p + '」不是合法的段，每段只能是 0~255 的数字')
    const v = Number(p)
    if (v > 255) throw new Error('每段最大 255，你写了 ' + v)
    n = n * 256 + v
  }
  return n >>> 0
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
  const m = ipToInt(mask)
  const bin = toBin(m)
  if (!/^1*0*$/.test(bin)) throw new Error('掩码不是连续的 1，例如 255.255.240.0 才合法')
  return bin.split('').filter((c) => c === '1').length
}

function matchSpecial(netInt, prefix) {
  for (const s of SPECIAL) {
    const [ip, p] = s.cidr.split('/')
    const pre = Number(p)
    // 只有当我们的网段完全落在该特殊段之内才算命中
    if (prefix < pre) continue
    const base = ipToInt(ip) >>> 0
    const m = maskFromPrefix(pre)
    if (((netInt & m) >>> 0) === ((base & m) >>> 0)) return s
  }
  return null
}

/** 单个地址属于哪个保留/特殊段，命中多条时取前缀最长（最具体）的那条。
 *  跟上面 matchSpecial 不是一回事：那个判「整个网段被特殊段完整包住」，
 *  这个只问一个地址落在哪儿。校验台用它，免得自己再抄一份网段表。 */
export function specialForIp(ip) {
  const n = ipToInt(ip)
  let best = null
  let bestPrefix = -1
  for (const s of SPECIAL) {
    const [base, p] = s.cidr.split('/')
    const pre = Number(p)
    const m = maskFromPrefix(pre)
    if (((n & m) >>> 0) === ((ipToInt(base) & m) >>> 0) && pre > bestPrefix) {
      best = s
      bestPrefix = pre
    }
  }
  return best
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
    const m = bySlash[1].trim()
    if (/^\d{1,2}$/.test(m)) prefix = Number(m)
    else prefix = prefixFromMask(m)
  } else {
    const bySpace = s.split(/\s+/)
    if (bySpace.length === 2) {
      ipPart = bySpace[0]
      prefix = prefixFromMask(bySpace[1])
    } else {
      prefix = 32
    }
  }

  const ipInt = ipToInt(ipPart)
  if (prefix === null) prefix = 32
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
    isNetworkAddress: ipInt === network,
    isBroadcastAddress: ipInt === broadcast,
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
