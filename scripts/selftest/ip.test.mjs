/** ip.js 的自查。对照全部独立于被测模块：
 *  一是自己另算一遍——点分↔整数走「移位」和「逐段乘 256」两条互不相干的路，掩码按
 *      32 位二进制字符串拼出来（不碰模块的 << 和 >>> 那行），于是因子/位移写错当场红；
 *  二是「由定义就该成立」的闭合：广播 - 网络 = 2^(32-p) - 1、反掩码 + 掩码 = 2^32 - 1、
 *      0..32 每个前缀的 maskFromPrefix ↔ prefixFromMask 往返回来自等、拆分的子网合计
 *      等于父段大小且首尾相接、区间合并的并集正好盖住区间（200 个随机区间）；
 *  三是界面契约：IP 计算器那几行字直接印在页面上——/32 说「不能配给主机」、
 *      255.255.255.255 说「保留地址」、010.1.1.1 悄悄换成 10.1.1.1、/100 报错指着 IP，
 *      这几处断的是页面上会出现的那句话；网段名逐个按 RFC 6890 的特殊用途登记表硬编码，
 *      速查表里写的「254 台 / 1022 个 / 约 1677 万」也拿去跟现算的 hostCount 对撞。
 *  跨模块收口：同一个写法在校验台和 IP 计算器必须同口径（末尾那段直接装载 validate）。 */
import { useUtils } from './harness.mjs'
const P = await useUtils('ip')
const V = await useUtils('validate')

let ok = 0
let fail = 0
function is(a, b, m) {
  if (a === b) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b))
  }
}
function ok_(cond, m) {
  is(!!cond, true, m)
}
/** 抛错且报错是中文（可选再对文案） */
function throwsWith(args, re, m) {
  try {
    P.ipToInt.apply(null, args)
    fail++
    console.log('FAIL ' + m + '：应该抛错却没抛')
  } catch (e) {
    const msg = e && e.message ? e.message : String(e)
    if (!/[\u4e00-\u9fa5]/.test(msg)) {
      fail++
      console.log('FAIL ' + m + '：报错不是中文 → ' + msg)
    } else if (re && !re.test(msg)) {
      fail++
      console.log('FAIL ' + m + '：报错文案不对 → ' + msg)
    } else ok++
  }
}
function pThrows(fn, re, m) {
  try {
    fn()
    fail++
    console.log('FAIL ' + m + '：应该抛错却没抛')
  } catch (e) {
    const msg = e && e.message ? e.message : String(e)
    if (!/[\u4e00-\u9fa5]/.test(msg)) {
      fail++
      console.log('FAIL ' + m + '：报错不是中文 → ' + msg)
    } else if (re && !re.test(msg)) {
      fail++
      console.log('FAIL ' + m + '：报错文案不对 → ' + msg)
    } else ok++
  }
}

/* ---------- 独立算的对照 ---------- */
/** 两条互不相干的路都算一遍，逼着模块跟它们一致 */
function refInt(a, b, c, d) {
  const shift = (((a << 24) | (b << 16) | (c << 8) | d) >>> 0)
  const mul = ((a * 256 + b) * 256 + c) * 256 + d
  is(shift, mul, '对照自身闭合 ' + a + '.' + b + '.' + c + '.' + d)
  return shift
}
/** 掩码按 32 位二进制串拼出来：先造串，再每 8 位切一段 */
function refMask(prefix) {
  const bin = '1'.repeat(prefix) + '0'.repeat(32 - prefix)
  const segs = []
  for (let i = 0; i < 32; i += 8) segs.push(parseInt(bin.slice(i, i + 8), 2))
  return { int: refInt(segs[0], segs[1], segs[2], segs[3]), str: segs.join('.') }
}

/* ---------- 1. 点分 ↔ 整数 ---------- */
{
  const t = [
    ['0.0.0.0', refInt(0, 0, 0, 0)],
    ['1.1.1.1', refInt(1, 1, 1, 1)],
    ['8.8.8.8', refInt(8, 8, 8, 8)],
    ['192.168.1.1', refInt(192, 168, 1, 1)],
    ['10.0.0.255', refInt(10, 0, 0, 255)],
    ['255.255.255.255', refInt(255, 255, 255, 255)],
  ]
  for (const [s, n] of t) {
    is(P.ipToInt(s), n, s + ' → 整数')
    is(P.intToIp(n), s, n + ' → 点分')
  }
  is(refInt(192, 168, 1, 1), 3232235777, '手算值 192.168.1.1')
  is(refInt(8, 8, 8, 8), 134744072, '手算值 8.8.8.8')
  is(refInt(1, 1, 1, 1), 16843009, '手算值 1.1.1.1')
  is(P.intToIp(0xffffffff), '255.255.255.255', '最大地址')
  throwsWith(['1.2.3'], /四段，当前 3 段/, '三段报段数')
  throwsWith(['1.2.3.4.5'], /四段，当前 5 段/, '五段报段数')
  throwsWith(['1.2.3.a'], /第 4 段「a」不是数字/, '非数字段点名第几段')
  throwsWith(['1.2.3.256'], /第 4 段最大 255，你写了 256/, '越界点名第几段')
  throwsWith(['1.2.03.4'], /第 3 段「03」有前导 0/, '前导 0 不收')
  throwsWith(['010.1.1.1'], /第 1 段「010」有前导 0，请直接写 10/, '010 不当十进制猜')
  throwsWith([''], /四段，当前 1 段/, '空串')
  throwsWith(['abc'], /四段/, '整串不是 IP')
  throwsWith(['::1'], /IPv4 地址要写成四段/, 'IPv6 明说是要 IPv4')
}

/* ---------- 2. 掩码 ↔ 前缀：0..32 全往返 ---------- */
{
  for (let p = 0; p <= 32; p++) {
    const r = refMask(p)
    is(P.maskFromPrefix(p), r.int, '/ ' + p + ' 的掩码整数')
    is(P.prefixFromMask(r.str), p, r.str + ' 反推位数')
  }
  is(P.maskFromPrefix(0), 0, '/0 掩码是 0')
  is(P.prefixFromMask('255.255.255.0'), 24, '常识掩码')
  is(P.prefixFromMask('255.255.240.0'), 20, '常识掩码 255.255.240.0')
  is(P.prefixFromMask('255.240.0.0'), 12, '常识掩码 255.240.0.0')
  is(P.prefixFromMask('255.255.254.0'), 23, '连续的 255.255.254.0 是 /23')
  is(P.prefixFromMask('255.255.255.254'), 31, '连续的 255.255.255.254 是 /31')
  pThrows(() => P.prefixFromMask('255.0.255.0'), /不是连续的 1/, '非连续掩码')
  pThrows(() => P.prefixFromMask('10.0.0.0'), /不是连续的 1/, '拿地址当掩码')
  pThrows(() => P.prefixFromMask('255.255.025.0'), /第 3 段「025」有前导 0/, '掩码也走同一份前导 0 判据')
  pThrows(() => P.maskFromPrefix(33), /0~32/, '位数越界')
  pThrows(() => P.maskFromPrefix(-1), /0~32/, '负位数')
}

/* ---------- 3. parseCidr：每个前缀的自洽 + 界面会用到的字段 ---------- */
{
  for (let p = 0; p <= 32; p++) {
    const i = P.parseCidr('10.0.0.0/' + p)
    const size = Math.pow(2, 32 - p)
    const r = refMask(p)
    is(i.size, size, '/ ' + p + ' 总地址数')
    is(i.mask, r.str, '/ ' + p + ' 掩码写法')
    is(i.maskBin, ('1'.repeat(p) + '0'.repeat(32 - p)), '/ ' + p + ' 掩码二进制')
    is(i.prefix, p, '/ ' + p + ' 位数回显')
    is(i.hostCount, p >= 31 ? size : size - 2, '/ ' + p + ' 可用地址')
    is(P.intToIp((i.maskInt + P.ipToInt(i.wildcard)) >>> 0), '255.255.255.255', '/ ' + p + ' 掩码+反掩码闭合')
    is(i.broadcastInt - i.networkInt, size - 1, '/ ' + p + ' 广播减网络')
    if (p <= 30) {
      is(i.firstHost, P.intToIp(i.networkInt + 1), '/ ' + p + ' 第一个可用')
      is(i.lastHost, P.intToIp(i.broadcastInt - 1), '/ ' + p + ' 最后一个可用')
    } else {
      is(i.firstHost, i.network, '/ ' + p + ' 没有网络号，第一个可用就是网络地址')
      is(i.lastHost, i.broadcast, '/ ' + p + ' 没有广播号')
    }
  }
}
{
  const a = P.parseCidr('192.168.1.130/26')
  is(a.cidr, '192.168.1.128/26', '主机地址要吸到网络号')
  is(a.broadcast, '192.168.1.191', '手算广播')
  is(a.firstHost, '192.168.1.129', '手算第一个可用')
  is(a.lastHost, '192.168.1.190', '手算最后一个可用')
  is(a.wildcard, '0.0.0.63', '手算反掩码')
  is(a.hostCount, 62, '/26 可用 62')
  is(a.hex, '0xC0A80182', '十六进制')
  is(a.ipBin, '11000000101010000000000110000010', '二进制')
  const b = P.parseCidr('10.0.0.32/27')
  is(b.network, '10.0.0.32', '/27 起点')
  is(b.broadcast, '10.0.0.63', '/27 终点')
  is(b.hostCount, 30, '/27 可用 30')
  const c = P.parseCidr('172.16.0.0/12')
  is(c.mask, '255.240.0.0', '/12 掩码')
  is(c.broadcast, '172.31.255.255', '/12 广播')
  is(c.size, 1048576, '/12 总数')
  const d = P.parseCidr('192.168.1.10 255.255.255.0')
  is(d.cidr, '192.168.1.0/24', '空格写掩码也认')
  is(P.parseCidr('192.168.1.10/255.255.255.0').cidr, '192.168.1.0/24', '斜杠写点分掩码')
  is(P.parseCidr('192.168.1.10').cidr, '192.168.1.10/32', '光给地址当 /32')
  is(P.parseCidr('  192.168.1.10/24  ').cidr, '192.168.1.0/24', '两头空白')
}

/* ---------- 4. /31 与 /32 不许说「不能配给主机」（界面上那行警告） ---------- */
{
  const h = P.parseCidr('8.8.8.8/32')
  is(h.isNetworkAddress, false, '/32 不是「不能配主机的网络号」')
  is(h.isBroadcastAddress, false, '/32 不是「不能配主机的广播号」')
  is(h.hostCount, 1, '/32 有一个可用地址')
  const r = P.parseCidr('10.0.0.0/31')
  is(r.isNetworkAddress, false, '/31 两端都能配（RFC 3021）')
  is(r.isBroadcastAddress, false, '/31 没有广播号')
  is(r.hostCount, 2, '/31 有两个可用地址')
  const n = P.parseCidr('192.168.1.0/24')
  is(n.isNetworkAddress, true, '/24 的网络号仍然要标出来')
  const bc = P.parseCidr('192.168.1.255/24')
  is(bc.isBroadcastAddress, true, '/24 的广播号仍然要标出来')
  is(bc.isNetworkAddress, false, '广播号不是网络号')
  const mid = P.parseCidr('192.168.1.50/24')
  is(mid.isNetworkAddress || mid.isBroadcastAddress, false, '普通主机地址两条警告都不该出现')
}

/* ---------- 5. 斜杠后写错，报错要指着斜杠后 ---------- */
{
  // 原来斜杠后只认 1~2 位数字，多出来的全丢给掩码解析，于是 /100 的报错
  // 说的是前面那个完全正确的 10.0.0.0：「IPv4 地址要写成四段」。
  pThrows(() => P.parseCidr('10.0.0.0/100'), /掩码位数要在 0~32 之间/, '/100 说位数越界')
  pThrows(() => P.parseCidr('10.0.0.0/64'), /掩码位数要在 0~32 之间/, '/64 说位数越界')
  pThrows(() => P.parseCidr('10.0.0.0/-1'), /既不是掩码位数也不是点分掩码/, '负号不当位数')
  pThrows(() => P.parseCidr('10.0.0.0/abc'), /「abc」/, '报错点名写错的那截')
  pThrows(() => P.parseCidr('10.0.0.0/abc'), /不是掩码位数也不是点分掩码/, '/abc 说清两种写法')
  pThrows(() => P.parseCidr('10.0.0.0/024'), /「024」有前导 0，掩码位数直接写 24/, '/024 不当八进制猜')
  pThrows(() => P.parseCidr('10.0.0.0/8.8.8.8.8'), /掩码要写成四段，当前 5 段/, '五段掩码报段数')
  pThrows(() => P.parseCidr('10.0.0.0/255.0.255.0'), /掩码不是连续的 1/, '非连续掩码')
  pThrows(() => P.parseCidr('10.0.0.0 abc'), /「abc」/, '空格分隔的掩码同一条判据')
  pThrows(() => P.parseCidr(''), /请输入 IP 或 CIDR/, '空输入给例子')
  pThrows(() => P.parseCidr('   '), /请输入 IP 或 CIDR/, '全是空白')
  pThrows(() => P.parseCidr('::1'), /IPv4 地址要写成四段/, '塞 IPv6 明说要 IPv4')
  pThrows(() => P.parseCidr('1.2.3.4/24/16'), /不是数字/, '两个斜杠不许静默按 /24 算')
  is(P.parseCidr('10.0.0.0/0').cidr, '0.0.0.0/0', '/0 合法：整份地址空间')
  is(P.parseCidr('10.0.0.0/0').hostCount, 4294967294, '/0 可用数')
  is(P.parseCidr('10.0.0.0/32').cidr, '10.0.0.0/32', '/32 吸不住')
}

/* ---------- 6. 拆分子网 ---------- */
/** 本地随机数（固定种子，保证每次跑 Same 结果） */
function lcg(seed) {
  let x = seed >>> 0
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0
    return x / 4294967296
  }
}
/** 自己的点分→整数：只用乘法那条路 */
function d2i(s) {
  const p = s.split('.')
  return ((Number(p[0]) * 256 + Number(p[1])) * 256 + Number(p[2])) * 256 + Number(p[3])
}
/** 整数→点分：自己按 256 进制逐位减出来，跟模块的移位那条路不同 */
function i2d(n) {
  let x = n >>> 0
  const out = []
  for (const w of [16777216, 65536, 256, 1]) {
    out.push(Math.floor(x / w))
    x = x % w
  }
  return out.join('.')
}
{
  const s = P.splitSubnet('192.168.1.0/24', 26)
  is(s.length, 4, '/24 拆 /26 四块')
  is(s.map((x) => x.cidr).join(' '), '192.168.1.0/26 192.168.1.64/26 192.168.1.128/26 192.168.1.192/26', '四个网络号手算')
  is(s.every((x) => x.hosts === 62), true, '每块 62 台')
  is(s[0].range, '192.168.1.1 ~ 192.168.1.62', '第一块可用区间')
  is(s[3].range, '192.168.1.193 ~ 192.168.1.254', '末块可用区间')
  is(s[3].broadcast, '192.168.1.255', '末块广播等于父段广播')
  is(s.map((x) => x.index).join(''), '1234', '序号从 1 开始')
  const t = P.splitSubnet('10.0.0.0/30', 32)
  is(t.length, 4, '/30 拆 /32 四块')
  is(t.every((x) => x.hosts === 1), true, '/32 每块 1 台')
  is(t[2].range, '10.0.0.2 ~ 10.0.0.2', '/32 区间首尾同址')
  is(P.splitSubnet('10.0.0.0/30', 31).map((x) => x.hosts).join(','), '2,2', '/31 两端都可配')
  pThrows(() => P.splitSubnet('192.168.1.0/24', 24), /新掩码要大于原掩码（24）/, '不变更长要报错')
  pThrows(() => P.splitSubnet('192.168.1.0/24', 23), /新掩码要大于原掩码（24）/, '变短要报错')
  pThrows(() => P.splitSubnet('192.168.1.0/24', 33), /不超过 32/, '超过 32')
  pThrows(() => P.splitSubnet('0.0.0.0/0', 11), /会拆出 2048 个子网，太多了/, '超上限要说会拆出多少')
  is(P.splitSubnet('0.0.0.0/0', 10).length, 1024, '刚好 1024 允许')
}
{
  // 闭合：拆出来的块首尾相接、盖满父段、主机数不超过父段
  const rand = lcg(20260930)
  for (let k = 0; k < 60; k++) {
    const p = 4 + Math.floor(rand() * 26)
    const q = p + 1 + Math.floor(rand() * Math.min(4, 32 - p))
    const base = [Math.floor(rand() * 256), Math.floor(rand() * 256), Math.floor(rand() * 256), Math.floor(rand() * 256)]
    // 父段自己算：地址整数 & 自己拼的掩码整数，不借模块的与运算
    const netInt = (d2i(base.join('.')) & refMask(p).int) >>> 0
    const cidr = P.parseCidr(i2d(netInt) + '/' + p)
    const list = P.splitSubnet(cidr.cidr, q)
    const m = '拆 ' + cidr.cidr + ' → /' + q
    is(list.length, Math.pow(2, q - p), m + ' 块数')
    is(list[0].network, cidr.network, m + ' 首块等于父段起点')
    is(list[list.length - 1].broadcast, cidr.broadcast, m + ' 末块等于父段终点')
    let sum = 0
    let gap = true
    for (let i = 0; i < list.length; i++) {
      const so = d2i(list[i].network)
      const eo = d2i(list[i].broadcast)
      const size = eo - so + 1
      sum += size
      is(P.parseCidr(list[i].cidr).broadcast, list[i].broadcast, m + ' 第 ' + i + ' 块的 cidr 自洽')
      is(so % size, 0, m + ' 第 ' + i + ' 块首地址对齐')
      if (i > 0 && d2i(list[i].network) !== d2i(list[i - 1].broadcast) + 1) gap = false
      is(list[i].hosts, q >= 31 ? size : Math.max(0, size - 2), m + ' 第 ' + i + ' 块主机数')
    }
    is(gap, true, m + ' 块与块首尾相接')
    is(sum, cidr.size, m + ' 合计覆盖父段')
    is(list[list.length - 1].index, list.length, m + ' 序号收口')
  }
}

/* ---------- 7. 区间合并成网段 ---------- */
/** 一段 cidr 自己算起止整数：不借模块的掩码运算 */
function cidrSpan(c) {
  const [ip, pre] = c.split('/')
  const n = Number(pre)
  const size = Math.pow(2, 32 - n)
  const start = d2i(ip)
  is(start % size, 0, c + ' 块首对齐')
  return { start, end: start + size - 1, size }
}
{
  is(P.rangeToCidrs('10.0.0.0', '10.0.0.5').join(' '), '10.0.0.0/30 10.0.0.4/31', '手算 6 个地址')
  is(P.rangeToCidrs('10.0.0.7', '10.0.0.7').join(' '), '10.0.0.7/32', '单地址')
  is(P.rangeToCidrs('10.0.0.5', '10.0.0.0').join(' '), '10.0.0.0/30 10.0.0.4/31', '起止写反要自己换回来')
  is(P.rangeToCidrs('0.0.0.0', '255.255.255.255').join(' '), '0.0.0.0/0', '整份空间合成一段')
  is(P.rangeToCidrs('192.168.1.0', '192.168.1.255').join(' '), '192.168.1.0/24', '对齐区间一段搞定')
  // 192.168.1.1~254 手算的最少切法：1/32、2-3、4-7、8-15、16-31、32-63、64-127、
  // 128-191、192-223、224-239、240-247、248-251、252-253、254/32 —— 共 14 段
  is(P.rangeToCidrs('192.168.1.1', '192.168.1.254').length, 14, '掐头去尾要拆成 14 段')
  is(P.rangeToCidrs('192.168.1.1', '192.168.1.254').reduce((n, c) => n + cidrSpan(c).size, 0), 254, '14 段合计盖住 254 个地址')
  pThrows(() => P.rangeToCidrs('10.0.0.1', '10.0.0.999'), /第 4 段最大 255/, '区间里也用同一份段判据')
  pThrows(() => P.rangeToCidrs('', '10.0.0.1'), /四段/, '空起点')
}
{
  const rand = lcg(987654321)
  let over = 0
  for (let k = 0; k < 200; k++) {
    const a = Math.floor(rand() * 4294967296)
    const len = Math.floor(rand() * 4096)
    const b = Math.min(4294967295, a + len)
    const list = P.rangeToCidrs(i2d(a), i2d(b))
    const m = '区间 ' + i2d(a) + '~' + i2d(b)
    is(P.intToIp(a), i2d(a), m + ' 起点写法两路一致')
    is(list.length <= 4096, true, m + ' 不撞 guard')
    let cur = a
    for (const c of list) {
      const sp = cidrSpan(c)
      is(sp.start, cur, m + ' 段间接续无缺口')
      cur = sp.end + 1
    }
    is(cur - 1, b, m + ' 并集正好盖住区间')
    if (list.length > 32) over++
  }
  is(over, 0, '随机 200 段里不该有超过 32 段的合并结果')
}

/* ---------- 8. 保留/特殊用途网段表 ---------- */
{
  const table = [
    ['0.1.2.3', '本网络'],
    ['10.1.2.3', '私有地址'],
    ['100.64.1.1', '运营商级 NAT'],
    ['100.127.255.255', '运营商级 NAT'],
    ['127.0.0.1', '环回地址'],
    ['169.254.10.20', '链路本地'],
    ['172.16.5.5', '私有地址'],
    ['172.31.255.255', '私有地址'],
    ['192.0.2.1', '文档示例'],
    ['192.168.1.1', '私有地址'],
    ['198.18.0.0', '基准测试'],
    ['198.19.255.255', '基准测试'],
    ['198.51.100.7', '文档示例'],
    ['203.0.113.7', '文档示例'],
    ['224.0.0.5', '组播地址'],
    ['239.255.255.255', '组播地址'],
    ['240.0.0.1', '保留地址'],
    ['255.255.255.255', '广播地址'],
  ]
  for (const [ip, name] of table) {
    const sp = P.specialForIp(ip)
    is(sp ? sp.name : '（查不到段）', name, ip + ' 归类')
    // 同一条地址在 IP 计算器那页也必须是同一个名字（原来两处一张表按先后、一处按最长前缀）
    const ov = P.parseCidr(ip + '/32').special
    is(ov ? ov.name : '（查不到段）', name, ip + ' 概览页与单点表同名')
  }
  is(P.specialForIp('255.255.255.255') && P.specialForIp('255.255.255.255').note, '受限广播', '末位广播的备注')
  is(P.specialForIp('198.51.100.7') && P.specialForIp('198.51.100.7').note, 'TEST-NET-2', 'RFC 5737 第二段点名')
  is(P.specialForIp('203.0.113.7') && P.specialForIp('203.0.113.7').note, 'TEST-NET-3', 'RFC 5737 第三段点名')
  const none = ['1.1.1.1', '8.8.8.8', '100.63.255.255', '100.128.0.0', '169.253.255.255', '172.15.255.255', '172.32.0.0', '192.167.255.255', '192.0.1.255', '198.17.255.255', '198.20.0.0', '223.255.255.255', '11.0.0.1', '1.0.0.0']
  for (const ip of none) is(P.specialForIp(ip), null, ip + ' 是公网，不该硬套一段')
  // 边界：CGNAT 与文档段的上下沿
  is(P.specialForIp('100.63.255.255') === null, true, 'CGNAT 下沿外一格')
  is(P.specialForIp('192.0.2.255') && P.specialForIp('192.0.2.255').name, '文档示例', '文档段末址仍在内')
  is(P.specialForIp('192.0.3.0'), null, '文档段过界一格')
}

/* ---------- 9. 速查表里的数量口径 ---------- */
{
  is(P.COMMON_SUBNETS.length, 6, '速查条数')
  const claimed = {
    '10.0.0.0/8': 16777214,
    '192.168.1.0/24': 254,
    '192.168.0.0/22': 1022,
  }
  for (const c of P.COMMON_SUBNETS) {
    const i = P.parseCidr(c.cidr)
    is(i.prefix >= 8, true, c.cidr + ' 能解析')
    ok_(/[一-龥]/.test(c.note), c.cidr + ' 的备注是中文')
    const n = claimed[c.cidr]
    if (n !== undefined) {
      is(i.hostCount, n, c.cidr + ' 实际可用地址')
      ok_(c.note.includes(String(n).slice(0, 4)) || c.note.includes(String(n)), c.cidr + ' 备注里的数字对得上现算值：' + c.note)
    }
    // 速查卡片和概览卡片用的是同一张表
    const one = P.specialForIp(c.cidr.split('/')[0])
    is(i.special ? i.special.name : '公网地址', one ? one.name : '（查不到段）', c.cidr + ' 与单点表同名')
  }
}

/* ---------- 10. 跨模块：校验台与 IP 计算器必须同口径 ---------- */
{
  const bads = ['1.2.3', '1.2.3.4.5', '1.2.3.a', '1.2.3.256', '010.1.1.1', '1.2.03.4', '::1', '300.1.1.1']
  for (const b of bads) {
    const a = P.parseIpv4(b)
    const c = V.checkIPv4(b)
    is(a.ok, false, b + ' 单点解析判不合法')
    is(c.ok, false, b + ' 校验台同判不合法')
    is(c.tip, a.tip, b + ' 两处报错一字不差')
  }
  // 空输入是唯一的例外：校验台自己那句「请输入 IP」是给界面看的占位提示
  is(V.checkIPv4('').ok, false, '空输入不合法')
  is(V.checkIPv4('').tip, '请输入 IP', '空输入说人话')
  const goods = ['8.8.8.8', '0.0.0.0', '255.255.255.255', '198.51.100.7', '10.0.0.1']
  const type = (x) => {
    const r = V.checkIPv4(x)
    return r.ok ? r.extra.类型 : '（判不通过：' + r.tip + '）'
  }
  for (const g of goods) {
    is(P.parseIpv4(g).ok, true, g + ' 合法')
    const c = V.checkIPv4(g)
    is(c.ok, true, g + ' 校验台也合法')
    const sp = P.parseCidr(g + '/32').special
    is(c.extra ? c.extra.类型 : '（没给类型）', sp ? sp.name : '公网地址', g + ' 校验台的类型名来自同一张表')
  }
  is(type('255.255.255.255'), '广播地址', '末位广播不叫保留地址')
  is(type('0.0.0.0'), '本网络', '0.0.0.0 不叫公网地址')
  is(type('8.8.8.8'), '公网地址', '公网就是公网')
  is(V.checkUrl('http://010.1.1.1/').ok, false, '主机写成带前导 0 的 IP 要拦')
  ok_(/前导 0/.test(V.checkUrl('http://010.1.1.1/').tip), 'URL 那页也指向前导 0：' + V.checkUrl('http://010.1.1.1/').tip)
  is(V.checkUrl('http://300.1.1.1/').ok, false, '主机段越界要拦')
  ok_(/第 1 段最大 255/.test(V.checkUrl('http://300.1.1.1/').tip), 'URL 那页复用四段判据：' + V.checkUrl('http://300.1.1.1/').tip)
  is(V.checkUrl('http://10.0.0.1:8080/x').ok, true, '主机写成合法 IP 放行')
}

console.log('ip 自查：' + ok + ' 通过 / ' + fail + ' 失败')
if (fail) process.exit(1)
