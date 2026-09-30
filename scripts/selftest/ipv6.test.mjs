/** ipv6.js 的自查。判据全部另写一遍，不借模块的路子：
 *  一是严格语法参照——按 RFC 4291 的 hextet / :: / 内嵌 IPv4 三条自己写一个解析器（:: 两侧
 *      不许挂单冒号、:: 至少代表一组零、一出现点号就必须是合法四段），模块悄悄收下畸形
 *      输入并印出答案，就是这一节当场红；
 *  二是 128 位算术走 BigInt（逐组左移 16 位），跟模块那套「分组字符串」路子互不相干，
 *      于是 binary、网络前缀、接口标识、内嵌 IPv4 的低 32 位都能拿去对撞；
 *  三是由定义就该成立的闭合：0..128 每个前缀往返回自等、压缩写法再展开等于原地址、压缩幂等、
 *      只压长度 ≥2 的零串、等长并列取最靠左（RFC 5952 §4.2 的 7 条官例逐个手抄）；
 *  四是界面契约：报错文案就是页面「提示」那一行，7 个快捷样例点开的类型名逐条钉住，
 *      速查表里 fe80::/10、fc00::/7、2000::/3、ff00::/8、2001:db8::/32 的段边界按现算断。
 *  跨模块收口：内嵌 IPv4 的四段判据取自 ip.js，低 32 位换算拿去跟 intToIp 对撞。 */
import { useUtils } from './harness.mjs'

const M = await useUtils('ipv6')
const IP = await useUtils('ip')

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

/* ---------------- 参考判据 ---------------- */
const HEXTET = (s) => /^[0-9a-fA-F]{1,4}$/.test(s)
const QUAD = /^\d{1,3}(\.\d{1,3}){3}$/
const strictQuad = (q) => {
  const p = q.split('.')
  return p.length === 4 && p.every((x) => /^\d{1,3}$/.test(x) && !(x.length > 1 && x[0] === '0') && Number(x) <= 255)
}
/** 顺序：剥前缀 → 剥方括号端口 → 处理点分段 → 按 :: 或 8 组拆；返回 { groups, prefix, v4 } 或 { bad } */
function refParse(raw) {
  let s = String(raw).trim()
  if (!s) return { bad: '空' }
  let prefix = null
  const slash = s.indexOf('/')
  if (slash > -1) {
    const p = s.slice(slash + 1)
    if (!/^\d{1,3}$/.test(p) || (p.length > 1 && p[0] === '0') || Number(p) > 128) return { bad: '前缀写法' }
    prefix = Number(p)
    s = s.slice(0, slash)
  }
  const br = /^\[([^\]]+)\](?::\d+)?$/.exec(s)
  if (br) s = br[1]
  let v4 = null
  if (s.includes('.')) {
    const at = s.lastIndexOf(':')
    if (at < 0) return { bad: '整串是 IPv4' }
    const tail = s.slice(at + 1)
    if (!QUAD.test(tail)) return { bad: '点分段不是四段' }
    if (!strictQuad(tail)) return { bad: '内嵌 IPv4 越界或有前导 0' }
    v4 = tail
    const q = tail.split('.')
    s = s.slice(0, at + 1) + (Number(q[0]) * 256 + Number(q[1])).toString(16) + ':' + (Number(q[2]) * 256 + Number(q[3])).toString(16)
  }
  const dc = (s.match(/::/g) || []).length
  if (dc > 1) return { bad: ':: 出现多次' }
  let groups
  if (dc === 1) {
    const i = s.indexOf('::')
    const head = s.slice(0, i)
    const tt = s.slice(i + 2)
    const h = head === '' ? [] : head.split(':')
    const t = tt === '' ? [] : tt.split(':')
    if (!h.every(HEXTET) || !t.every(HEXTET)) return { bad: ':: 旁边的组不合法' }
    if (h.length + t.length > 7) return { bad: ':: 至少代表一组零' }
    groups = h.concat(new Array(8 - h.length - t.length).fill('0'), t)
  } else {
    groups = s.split(':')
    if (groups.length !== 8) return { bad: '组数 ' + groups.length }
    if (!groups.every(HEXTET)) return { bad: '有组不是 1~4 位十六进制' }
  }
  return { groups: groups.map((g) => g.toLowerCase().padStart(4, '0')), prefix, v4 }
}
/** 参考压缩（RFC 5952 §4.2.2 最长串、§4.2.3 并列取最靠左、长度 1 不许压） */
function refCompress(groups, prefix) {
  let bs = -1
  let bl = 0
  let cs = -1
  let cl = 0
  groups.forEach((g, i) => {
    if (g === '0000') {
      if (cs < 0) cs = i
      cl++
      if (cl > bl) {
        bl = cl
        bs = cs
      }
    } else {
      cs = -1
      cl = 0
    }
  })
  const trim = groups.map((g) => g.replace(/^0+/, '') || '0')
  const out = bl < 2 ? trim.join(':') : trim.slice(0, bs).join(':') + '::' + trim.slice(bs + bl).join(':')
  return prefix === null ? out : out + '/' + prefix
}
function to128(groups) {
  let v = 0n
  for (const g of groups) v = (v << 16n) + BigInt('0x' + g)
  return v
}
function from128(v) {
  const out = []
  for (let i = 7; i >= 0; i--) out.push(((v >> BigInt(i * 16)) & 0xffffn).toString(16).padStart(4, '0'))
  return out
}
const low32Dotted = (v) => {
  const n = Number(v & 0xffffffffn)
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}
/** 确定性伪随机：跑两遍要能对上，不接受 Math.random */
function lcg(seed) {
  let x = seed >>> 0
  return () => {
    x = (x * 1103515245 + 12345) >>> 0
    return x >>> 8
  }
}

const VALID = [
  '::', '::1', '::0', '0::', '1::', '0:0:0:0:0:0:0:0', '0:0:0:0:0:0:0:1',
  '2001:db8::1', '2001:0db8:0000:0000:0000:ff00:0042:8329', '2001:DB8::FF00:42:8329',
  'fe80::1c2d:3e4f:5a6b:7c8d', 'fd12:3456:789a:1::1', '::ffff:192.168.1.1', '::ffff:c0a8:101',
  '64:ff9b::192.0.2.33', '2002:c0a8:101::1', 'ff02::1', '::1:2:3:4:5:6:7', '1:0:0:0:0:0:0:0',
  '2001:db8:0:1:1:1:1:1', '1:2:3:4:5:6:7:8', '2001:0db8:0000:0000:0001:0000:0000:0001',
  '0:0:0:0:0:ffff:192.168.1.1', '::192.168.1.1', '[::1]:8080', '[2001:db8::1]/32',
  '2001:db8::/32', '::1/128', 'fe80::1/64', '2001:db8::/0', '2001:db8::1/128',
]
const MALFORMED = [
  '2001:db8:::1', ':2001:db8::1', '2001:db8::1:', '1:2:3:4:5:6:7::8', '1:2:3:4:5:6:7:8:9',
  '1:2:3:4:5:6:7', '2001:db8:12345::1', '2001:db8:gg::1', '::ffff:192.168.1.256', '::ffff:010.1.1.1',
  '::ffff:1.2.3', '::ffff:1.2.3.4.5', '1.2.3.4', '1.2.3.4.5', '2001::db8::1', '::ffff:192.168.1.1:101',
  '::1::', 'fe80::1%eth0', ':', ':::', ':1', '1:', '', '   ', '2001:db8::/129', '2001:db8::/-1',
  '2001:db8::/abc', '2001:db8::/024', '2001:db8::/', '2001:db8::/064', '2001:db8::1/32/16',
]

/* ---------- 1 合法写法：展开与严格参照逐组对撞 ---------- */
for (const s of VALID) {
  const r = refParse(s)
  const e = M.expandIpv6(s)
  is(r.bad, undefined, s + ' 参照判据该收')
  is(e.groups.join(' '), r.groups.join(' '), s + ' 展开成 8 组')
  is(e.prefix, r.prefix, s + ' 前缀长度')
  is(e.groups.length, 8, s + ' 恰好 8 组')
  ok_(e.groups.every((g) => /^[0-9a-f]{4}$/.test(g)), s + ' 每组是 4 位小写十六进制')
  const p = M.parseIpv6(s)
  is(p.groups.join(' '), e.groups.join(' '), s + ' parseIpv6 与 expandIpv6 同源')
  is(p.groupCount, 8, s + ' 分组数固定 8')
  is(p.full, r.groups.join(':') + (r.prefix === null ? '' : '/' + r.prefix), s + ' 完整写法')
  is(p.input, s.trim(), s + ' 原样回显')
  const v = to128(r.groups)
  is(p.networkPart, from128((v >> 64n) << 64n).slice(0, 4).join(':'), s + ' 网络前缀 = 高 64 位')
  is(p.interfacePart, from128(v & ((1n << 64n) - 1n)).slice(4).join(':'), s + ' 接口标识 = 低 64 位')
  is(p.networkPart + ':' + p.interfacePart, r.groups.join(':'), s + ' 两半拼回原址')
  const bits = p.binary.split(' ')
  is(bits.length, 8, s + ' 二进制 8 段')
  ok_(bits.every((b) => /^[01]{16}$/.test(b)), s + ' 二进制每段 16 位')
  is(BigInt('0b' + bits.join('')) === v, true, s + ' 二进制拼回同一个 128 位整数')
  is(from128(v).join(':'), r.groups.join(':'), s + ' BigInt 路子自身可逆')
  // 收口：这两个字段以前各说各话，别悄悄长回来
  is(p.effectivePrefix, undefined, s + ' 不再有 effectivePrefix，前缀只有一个来源')
  is(p.embeddedV4, undefined, s + ' 不再有 embeddedV4，内嵌 IPv4 只看 mapped')
}

/* ---------- 2 非法写法：五个入口都不许给答案 ---------- */
for (const s of MALFORMED) {
  is(!!refParse(s).bad, true, JSON.stringify(s) + ' 参照判据说它非法')
  pThrows(() => M.expandIpv6(s), null, 'expandIpv6 拒 ' + JSON.stringify(s))
  pThrows(() => M.compressIpv6(s), null, 'compressIpv6 拒 ' + JSON.stringify(s))
  pThrows(() => M.classifyIpv6(s), null, 'classifyIpv6 拒 ' + JSON.stringify(s))
  pThrows(() => M.toIpv4Mapped(s), null, 'toIpv4Mapped 拒 ' + JSON.stringify(s))
  pThrows(() => M.parseIpv6(s), null, 'parseIpv6 拒 ' + JSON.stringify(s))
}
// 文案就是页面上那一行「提示」，逐条钉住
pThrows(() => M.expandIpv6(''), /请输入 IPv6 地址/, '空输入')
pThrows(() => M.expandIpv6('   '), /请输入 IPv6 地址/, '只有空格')
pThrows(() => M.expandIpv6('2001:db8:::1'), /「::」右边的「:1」不是合法的分组写法/, '三连冒号要点出右侧那截')
pThrows(() => M.expandIpv6(':2001:db8::1'), /「::」左边的「:2001:db8」不是合法的分组写法/, ':: 前面又挂一个单冒号')
pThrows(() => M.expandIpv6('2001:db8::1:'), /「::」右边的「1:」不是合法的分组写法/, '尾巴挂单冒号')
pThrows(() => M.expandIpv6(':::'), /「::」右边的「:」不是合法的分组写法/, '三个冒号')
pThrows(() => M.expandIpv6('1:2:3:4:5:6:7::8'), /「::」至少要省略一组零，你这两边已经有 8 组了/, ':: 一组零都没省')
pThrows(() => M.expandIpv6('1:2:3:4:5:6:7:8:9'), /IPv6 要有 8 组（或用 :: 省略连续的零组），现在有 9 组/, '9 组')
pThrows(() => M.expandIpv6('1:2:3:4:5:6:7'), /IPv6 要有 8 组（或用 :: 省略连续的零组），现在有 7 组/, '7 组')
pThrows(() => M.expandIpv6('2001::db8::1'), /一个地址里只能出现一次 ::/, '两个 ::')
pThrows(() => M.expandIpv6('2001:db8:12345::1'), /不是合法的分组写法/, '一组写了 5 位')
pThrows(() => M.expandIpv6('2001:db8:gg:1:1:1:1:1'), /「gg」不是合法的十六进制分组/, '非十六进制')
pThrows(() => M.expandIpv6('fe80::1%eth0'), /不是合法的分组写法/, '区域号 %eth0 不收')
pThrows(() => M.expandIpv6('2001:db8::/129'), /前缀长度要写成 0~128 的数字，例如 \/64，你写了「129」/, '前缀越界')
pThrows(() => M.expandIpv6('2001:db8::/-1'), /你写了「-1」/, '负前缀')
pThrows(() => M.expandIpv6('2001:db8::/024'), /你写了「024」/, '前缀带前导 0，不许按十进制悄悄收下')
pThrows(() => M.expandIpv6('2001:db8::/abc'), /你写了「abc」/, '前缀不是数字')
pThrows(() => M.expandIpv6('2001:db8::/'), /你写了「」/, '斜杠后面空着')
pThrows(() => M.expandIpv6('2001:db8::1/32/16'), /你写了「32\/16」/, '两个斜杠')
pThrows(() => M.expandIpv6('::ffff:192.168.1.256'), /内嵌的 IPv4 不合法：第 4 段最大 255，你写了 256/, '内嵌 IPv4 越界，判据来自 ip.js')
pThrows(() => M.expandIpv6('::ffff:010.1.1.1'), /内嵌的 IPv4 不合法：第 1 段「010」有前导 0/, '内嵌 IPv4 前导 0，不再悄悄换算成 10.1.1.1')
pThrows(() => M.expandIpv6('::ffff:1.2.3'), /不是合法的分组写法/, '半截点分写法')
pThrows(() => M.expandIpv6('::ffff:1.2.3.4.5'), /不是合法的分组写法/, '五段点分写法')
pThrows(() => M.expandIpv6('::ffff:192.168.1.1:101'), /不是合法的分组写法/, '内嵌段后面还挂一组')
pThrows(() => M.expandIpv6('1.2.3.4'), /这看起来是 IPv4 地址「1\.2\.3\.4」，IPv6 里没有这种写法；要嵌进 IPv6 得用 ::ffff: 开头的形式/, '光给 IPv4 时指出去哪写')

/* ---------- 3 压缩写法 ---------- */
const RFC5952 = [
  ['2001:0db8:0000:0000:0000:ff00:0042:8329', '2001:db8::ff00:42:8329'],
  ['2001:0db8:0000:0000:0001:0000:0000:0001', '2001:db8::1:0:0:1'],
  ['2001:db8:0:1:1:1:1:1', '2001:db8:0:1:1:1:1:1'],
  ['2001:0000:0000:0000:0001:0000:0001:0001', '2001::1:0:1:1'],
  ['0000:0000:0000:0000:0000:0000:0000:0001', '::1'],
  ['0000:0000:0000:0000:0000:0000:0000:0000', '::'],
  ['fe80:0000:0000:0000:0204:61ff:fe9d:f156', 'fe80::204:61ff:fe9d:f156'],
]
for (const [src, want] of RFC5952) is(M.compressIpv6(src), want, 'RFC 5952 官例 ' + src)
// §4.2.2 只有一组零不许压；§4.2.3 等长并列取最靠左
is(M.compressIpv6('2001:db8:0:1:1:1:1:1'), '2001:db8:0:1:1:1:1:1', '单组零保持原样')
is(M.compressIpv6('1:0:0:1:0:0:1:1'), '1::1:0:0:1:1', '等长两段压最靠左那段')
is(M.compressIpv6('0:0:1:0:0:0:1:0'), '0:0:1::1:0', '压较长的那段')
is(M.compressIpv6('1:0:0:0:1:0:0:0'), '1::1:0:0:0', '等长且靠左：尾部那串留着')
is(M.compressIpv6('0:0:0:0:0:0:0:0'), '::', '整串零')
is(M.compressIpv6('0:0:0:0:0:0:0:1'), '::1', '末尾一组零也并进 ::')
for (const s of VALID) {
  const r = refParse(s)
  const c = M.compressIpv6(s)
  const o = M.parseIpv6(s)
  is(c, refCompress(r.groups, r.prefix), '压缩与参照一致 ' + s)
  is((c.match(/::/g) || []).length <= 1, true, ':: 至多一次 ' + s)
  ok_(/^[0-9a-f:]+$|^[0-9a-f:]+\/\d{1,3}$/.test(c), '压缩写法只有小写十六进制、冒号和可选前缀 ' + s)
  is(M.compressIpv6(c), c, '压缩幂等 ' + s)
  is(M.expandIpv6(c).groups.join(' '), r.groups.join(' '), '压缩再展开回得来 ' + s)
  is(M.expandIpv6(c).prefix, r.prefix, '压缩再展开前缀也回得来 ' + s)
  is(o.full.split('/')[0].split(':').length, 8, '完整写法是 8 组 4 位 ' + s)
  ok_(o.full.split('/')[0].split(':').every((g) => g.length === 4), '完整写法每组补齐 4 位 ' + s)
  // 同一页那两行的前缀必须同进同出
  is(o.full.includes('/') && c.includes('/'), r.prefix !== null, '两行的前缀同进同出 ' + s)
  is(o.full.split('/')[1] || '', r.prefix === null ? '' : String(r.prefix), '完整写法带的前缀 ' + s)
  is(M.compressIpv6(o.full), c, '从完整写法再压一次一样 ' + s)
  is(M.expandIpv6(o.full).groups.join(' '), r.groups.join(' '), '从完整写法再展开一样 ' + s)
}

/* ---------- 4 前缀长度 0..128 往返 ---------- */
for (let p = 0; p <= 128; p++) {
  const s = '2001:db8::1/' + p
  const e = M.expandIpv6(s)
  is(e.prefix, p, '前缀 ' + p + ' 读得回来')
  const o = M.parseIpv6(s)
  ok_(o.full.endsWith('/' + p), '前缀 ' + p + ' 印在完整写法里')
  ok_(o.compressed.endsWith('/' + p), '前缀 ' + p + ' 印在压缩写法里')
  is(M.compressIpv6(o.full), o.compressed, '前缀 ' + p + ' 从完整写法再压一次一样')
  is(M.expandIpv6(o.compressed).groups.join(' '), e.groups.join(' '), '前缀 ' + p + ' 往返 groups')
}

/* ---------- 5 内嵌 IPv4 ---------- */
const EMBED = [
  ['::ffff:192.168.1.1', '192.168.1.1', 'IPv4 映射地址'],
  ['::ffff:c0a8:101', '192.168.1.1', 'IPv4 映射地址'],
  ['0:0:0:0:0:ffff:192.168.1.1', '192.168.1.1', 'IPv4 映射地址'],
  ['::ffff:0.0.0.0', '0.0.0.0', 'IPv4 映射地址'],
  ['::ffff:255.255.255.255', '255.255.255.255', 'IPv4 映射地址'],
  ['::192.168.1.1', '192.168.1.1', 'IPv4 兼容地址'],
  ['0:0:0:0:0:0:c0a8:101', '192.168.1.1', 'IPv4 兼容地址'],
  ['::ffff:8.8.8.8', '8.8.8.8', 'IPv4 映射地址'],
]
for (const [src, want, kind] of EMBED) {
  const v = to128(refParse(src).groups)
  is(M.toIpv4Mapped(src), want, src + ' 认得出等价 IPv4')
  is(M.classifyIpv6(src).name, kind, src + ' 类型')
  is(M.parseIpv6(src).mapped, want, src + ' parseIpv6 里的 mapped')
  is(M.parseIpv6(src).kind.name, kind, src + ' parseIpv6 里的 kind')
  is(low32Dotted(v), want, src + ' 期望值本身与 BigInt 低 32 位对得上')
  is(M.toIpv4Mapped(src), IP.intToIp(Number(v & 0xffffffffn)), src + ' 与 ip.js 的 intToIp 同口径')
  is(IP.parseIpv4(M.toIpv4Mapped(src)).ok, true, src + ' 报出来的 IPv4 拿去 ip.js 必须算合法')
  ok_(M.classifyIpv6(src).name.includes('IPv4'), src + ' 类型名里提到 IPv4')
}
// 落在「高 96 位全是 0」里却各有名字的写法：不许说成等价 IPv4
for (const s of ['::', '::1', '::0', '0:0:0:0:0:0:0:1', '0:0:0:0:0:0:0:0']) {
  is(M.toIpv4Mapped(s), null, s + ' 不是内嵌 IPv4，别报 0.0.0.1')
  is(M.parseIpv6(s).mapped, null, s + ' mapped 为空')
}
// NAT64 / 6to4 的低 32 位看着像 IPv4，但它们不属于 ::ffff/96 或 ::/96，不报
for (const s of ['2001:db8::1', 'fe80::1', '64:ff9b::192.0.2.33', '2002:c0a8:101::1', 'ffff::1', '1:2:3:4:5:6:7:8']) {
  is(M.toIpv4Mapped(s), null, s + ' 不报等价 IPv4')
}
is(low32Dotted(to128(refParse('64:ff9b::192.0.2.33').groups)), '192.0.2.33', 'NAT64 那条低 32 位确实是 192.0.2.33，但类型不是内嵌')
// 「mapped 有值」与「类型是内嵌那两种」必须同时成立——判据只有一份
for (const s of [...EMBED.map((x) => x[0]), '::', '::1', '2001:db8::1', 'fe80::1', 'ff02::1', '64:ff9b::192.0.2.33']) {
  const mp = M.toIpv4Mapped(s)
  const kind = M.classifyIpv6(s).name
  is(mp !== null, kind === 'IPv4 映射地址' || kind === 'IPv4 兼容地址', s + ' mapped 与类型不打架')
}

/* ---------- 6 类型判断与段边界 ---------- */
const KINDS = [
  ['::', '未指定地址'],
  ['::1', '环回地址'],
  ['::ffff:192.168.1.1', 'IPv4 映射地址'],
  ['::192.168.1.1', 'IPv4 兼容地址'],
  ['fc00::', '唯一本地地址 ULA'],
  ['fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', '唯一本地地址 ULA'],
  ['fe00::1', '其他/保留'],
  ['fe80::', '链路本地地址'],
  ['febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff', '链路本地地址'],
  ['fec0::1', '其他/保留'],
  ['ff00::', '组播地址'],
  ['ff02::1', '组播地址'],
  ['ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', '组播地址'],
  ['2001:db8::', '文档示例地址'],
  ['2001:db8:ffff:ffff:ffff:ffff:ffff:ffff', '文档示例地址'],
  ['2001:dbf::1', '全球单播地址'],
  ['2000::', '全球单播地址'],
  ['2002:c0a8:400::', '全球单播地址'],
  ['3fff::1', '全球单播地址'],
  ['1fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', '其他/保留'],
  ['4000::', '其他/保留'],
  ['100::1', '其他/保留'],
]
for (const [s, want] of KINDS) {
  const k = M.classifyIpv6(s)
  is(k.name, want, s + ' 类型')
  ok_(/[\u4e00-\u9fa5]/.test(k.note), s + ' 说明是中文')
  ok_(k.note.length > 8, s + ' 说明不是空话')
  is(M.parseIpv6(s).kind.name, want, s + ' parseIpv6 的类型同一份')
}
// 段边界按 128 位现算，跟界面「地址段速查」那几行的口径对撞
const RANGES = [
  ['fe80::/10', 'fe80::', 'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff', '链路本地地址'],
  ['fc00::/7', 'fc00::', 'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', '唯一本地地址 ULA'],
  ['2000::/3', '2000::', '3fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', '全球单播地址'],
  ['ff00::/8', 'ff00::', 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', '组播地址'],
  ['2001:db8::/32', '2001:db8::', '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff', '文档示例地址'],
]
for (const [label, first, last, want] of RANGES) {
  const v = to128(refParse(first).groups)
  const n = Number(label.split('/')[1])
  const next = v + (1n << BigInt(128 - n))
  is(from128(next - 1n).join(':'), refParse(last).groups.join(':'), label + ' 段尾按 128 位算出来就是 ' + last)
  is(M.classifyIpv6(first).name, want, label + ' 段首')
  is(M.classifyIpv6(from128(next - 1n).join(':')).name, want, label + ' 段尾')
  is(M.classifyIpv6(from128(next).join(':')).name === want, false, label + ' 段尾下一个地址就出段了')
}

/* ---------- 7 界面契约：快捷样例与说明文案 ---------- */
const SAMPLE_KINDS = [
  ['环回', '环回地址'],
  ['完整未压缩', '文档示例地址'],
  ['标准压缩', '文档示例地址'],
  ['链路本地', '链路本地地址'],
  ['内网 ULA', '唯一本地地址 ULA'],
  ['IPv4 映射', 'IPv4 映射地址'],
  ['组播', '组播地址'],
]
is(M.IPV6_SAMPLES.length, SAMPLE_KINDS.length, '快捷样例条数与页面一致')
M.IPV6_SAMPLES.forEach((s, i) => {
  const [wantName, wantKind] = SAMPLE_KINDS[i]
  is(s.name, wantName, '第 ' + (i + 1) + ' 个样例的名字（页面上那颗芯片）')
  const o = M.parseIpv6(s.value)
  is(o.kind.name, wantKind, s.name + ' 点开的类型')
  is(refParse(s.value).bad, undefined, s.name + ' 样例本身合法')
  is(o.compressed, refCompress(refParse(s.value).groups, null), s.name + ' 样例的压缩写法与参照一致')
})
is(M.IPV6_SAMPLES[5].value, '::ffff:192.168.1.1', 'IPv4 映射那颗给的是点分写法')
is(M.parseIpv6(M.IPV6_SAMPLES[5].value).mapped, '192.168.1.1', '那颗样例点开后「等价 IPv4」那行有值')
is(M.IPV6_NOTES.length, 4, '说明文案条数')
M.IPV6_NOTES.forEach((n, i) => {
  ok_(/[\u4e00-\u9fa5]/.test(n), '第 ' + (i + 1) + ' 条说明是中文')
  ok_(n.endsWith('。'), '第 ' + (i + 1) + ' 条说明是完整一句话')
})

/* ---------- 8 随机闭合：300 个地址的三趟往返 ---------- */
const rnd = lcg(20260930)
for (let i = 0; i < 300; i++) {
  const groups = []
  for (let j = 0; j < 8; j++) groups.push((rnd() % 0x10000).toString(16).padStart(4, '0'))
  const full = groups.join(':')
  const compressed = refCompress(groups, null)
  const pv = rnd() % 129
  const withPrefix = refCompress(groups, pv)
  for (const s of [full, compressed, full + '/' + pv, withPrefix]) {
    const e = M.expandIpv6(s)
    is(e.groups.join(' '), groups.join(' '), '随机 ' + i + ' 展开 ' + s)
    is(e.prefix, s.includes('/') ? Number(s.split('/')[1]) : null, '随机 ' + i + ' 前缀 ' + s)
    const o = M.parseIpv6(s)
    is(o.compressed, refCompress(groups, s.includes('/') ? pv : null), '随机 ' + i + ' 压缩 ' + s)
    is(o.binary.split(' ').join(''), groups.map((g) => parseInt(g, 16).toString(2).padStart(16, '0')).join(''), '随机 ' + i + ' 二进制 ' + s)
    is(BigInt('0b' + o.binary.split(' ').join('')) === to128(groups), true, '随机 ' + i + ' 二进制与 BigInt 同值 ' + s)
    is(o.networkPart + ':' + o.interfacePart, groups.join(':'), '随机 ' + i + ' 两半拼回 ' + s)
    is(M.compressIpv6(o.full), o.compressed, '随机 ' + i + ' 从完整写法再压一次 ' + s)
  }
  // 随机内嵌 IPv4：点分写法 ↔ 低 32 位 ↔ ip.js
  const q = [rnd() % 256, rnd() % 256, rnd() % 256, rnd() % 256]
  const dottedV4 = q.join('.')
  const src = '::ffff:' + dottedV4
  const e = M.expandIpv6(src)
  is(e.groups[5], 'ffff', '随机内嵌 ' + dottedV4 + ' 第 6 组是 ffff')
  is(M.toIpv4Mapped(src), dottedV4, '随机内嵌 ' + dottedV4 + ' 认得回来')
  is(low32Dotted(to128(e.groups)), dottedV4, '随机内嵌 ' + dottedV4 + ' 低 32 位闭合')
  is(IP.intToIp(IP.parseIpv4(dottedV4).int), dottedV4, '随机内嵌 ' + dottedV4 + ' 与 ip.js 往返')
  is(M.classifyIpv6(src).name, 'IPv4 映射地址', '随机内嵌 ' + dottedV4 + ' 类型')
}

console.log('ipv6 自查：' + ok + ' 通过 / ' + fail + ' 失败')
if (fail) process.exit(1)
