/** url.js 的自查。判据全部独立于被测模块：
 *  一是 Node 自带的 WHATWG 实现 new URL()——收不收、主机/路径/查询/锚点/用户名密码/来源
 *      逐字段对撞（端口那一栏不跟它比，见下面第四段的说明）；
 *  二是 node:querystring.parse 当查询参数表的参照，外加「同一把尺」的对撞：
 *      同一个端口写法在 URL 拆解和校验台 checkUrl 必须同结论、同一句话；
 *      主机位里的 IPv6 问 ipv6.js、IPv4 问 ip.js，URL 这边不许有自己的判据；
 *  三是无害化的「词」级判据与往返：协议名那个词在结果里必须消失（原来只比「http:」，
 *      被 [:]// 那一换就糊过去了）、编码→解码回到原文、无害化点两次跟点一次一样、
 *      还原(无害化(x)) === x（含协议名大写、一句话里多个链接）；
 *  四是界面契约：拆解表格那九行印在页面上的原话（这一轮起组件把每行的注释也印出来，
 *      注释就成了判据——所以「—（只在本页内跳转）」这种两行打架的写法要被抓出来）、
 *      报错指着端口而不是 IP、「没有查询参数」这句话只在真没有参数时才说。
 *  本轮修的：IPv6 字面量主机被拆成「[」、端口越界照印（校验台却拒）、:abc 塞进路径、
 *  来源里带着 user:pw@、伪协议的 ? 参数整段落进路径、主机带空格照样印、
 *  空主机给全套答案、纯数字主机不说浏览器会换算、折行链接不吭声、
 *  解码偷吃字面「+」、编码遇半个表情符号抛英文且界面不吭声、
 *  无害化只查串首且点两次叠成 [[.]]、还原丢大小写、空路径凭空补「/」、
 *  表格每行算好的注释组件从来只取前两列、清空后结果行还声称「解析完成」。 */
import qs from 'node:querystring'
import { useUtils } from './harness.mjs'

const M = await useUtils('url')
const V = await useUtils('validate')
const IP = await useUtils('ip')
const V6 = await useUtils('ipv6')

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
/** 拆解成功时的 parsed；失败直接判负，不让后面炸掉 */
function seg(s) {
  try {
    return M.urlSegments(s)
  } catch (e) {
    fail++
    console.log('FAIL 本该收下 ' + JSON.stringify(s) + ' → 拒：' + e.message)
    return null
  }
}
/** 应当拒，且报错是中文（可再对文案） */
function rejects(s, re, m) {
  try {
    M.urlSegments(s)
    fail++
    console.log('FAIL ' + m + '：应该拒却没拒 ' + JSON.stringify(s))
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
function row(r, label) {
  const x = r.rows.find((k) => k[0] === label)
  return x ? x[1] : '<没有这一行>'
}
function rowNote(r, label) {
  const x = r.rows.find((k) => k[0] === label)
  return x ? x[2] : ''
}
/** 确定性伪随机，不用 Math.random */
function lcg(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
const ri = (r, n) => Math.floor(r() * n)

/* ---------------- 一、跟 WHATWG 逐字段对撞 ---------------- */
/* 只收 http/https/ftp/ws 这类「有来源概念」的绝对地址：
   伪协议（mailto:/magnet:）和 blob: 的 origin 在规范里是 opaque（Node 印 null），
   本页对它们明说「谈不上来源」，不跟规范争这句话，参数那条走第三段。
   端口 0 与超出 1-65535 的写法也不在这里比：规范放 :0 过，本项目跟校验台同一把尺拒。 */
const WHATWG_PORT_OK = (p) => p !== '' && Number(p) >= 1 && Number(p) <= 65535
const ABS = [
  'https://user:pw@api.example.com:8443/v2/items?page=2&size=20&tag=%E5%B7%A5%E5%85%B7&tag=dev#section-3',
  'http://example.com',
  'http://example.com/',
  'http://example.com:65535/',
  'http://[::1]:8080/x',
  'http://[2001:db8::1]:80/path?q=1',
  'https://[fe80::1]/',
  'http://[::1]/',
  'http://8.8.8.8/',
  'http://127.0.0.1:3000/x',
  'https://a.com:443/x',
  'http://a.com:80/',
  'http://a.com:080/',
  'ftp://files.example.com/pub/x.txt',
  'ws://a.com/socket',
  'wss://a.com/socket',
  'http://a.com/p?a+b=c',
  'http://a.com/p?a=1&&b=2',
  'http://a.com/p?a&b=2',
  'http://a.com/p?%E4%B8%AD=%E6%96%87&a=1',
  'http://a.com/p?bad=%ZZ',
  'http://a.com/%20path%2F',
  'http://a.com/#a?b',
  'http://us:@a.com/',
  'http://@a.com/',
  'http://a.com:8080',
  'http://a.com./x',
  'http://a.com:80@evil.com/x',
]
/* 中文域名（IDN）不在这儿比：规范要去转 punycode，项目零依赖没有 IDNA 表，
   本页选择原样印你写的字——单独在第二节末句话明说。 */
console.log('=== 一 逐字段对撞 new URL() ===')
for (const s of ABS) {
  let u
  try {
    u = new URL(s)
  } catch (e) {
    // 参照拒的，先看模块是不是也拒（:0 那种本项目故意更严的走第四段）
    rejects(s, null, '参照拒 ' + s)
    continue
  }
  const r = seg(s)
  if (!r) continue
  const p = r.parsed
  is(p.host.toLowerCase(), u.hostname, s + ' 主机')
  is(p.username, u.username, s + ' 用户名')
  is(p.password, u.password, s + ' 密码')
  is(p.path, u.pathname, s + ' 路径')
  is(p.query, u.search.replace(/^\?/, ''), s + ' 查询串')
  is(p.hash, u.hash.replace(/^#/, ''), s + ' 锚点')
  if (WHATWG_PORT_OK(p.port)) is(String(Number(p.port)), u.port === '' ? String(Number(u.port || defaultPortOf(u))) : u.port, s + ' 端口号值')
  if (u.protocol === 'http:' || u.protocol === 'https:') is(p.origin, u.origin, s + ' 来源')
}
function defaultPortOf(u) {
  return { 'http:': '80', 'https:': '443', 'ftp:': '21', 'ws:': '80', 'wss:': '443' }[u.protocol] || ''
}

/* 没写协议的：模块自己说了「按 https 补一个，浏览器地址栏也是这么处理的」，那就跟补完的比 */
console.log('=== 一·B 没写协议时补 https ===')
const BARE = ['www.example.com', 'example.com:8080', 'localhost:3000/x', 'a.com/a/b?q=1#f', '[::1]:8080/p', '127.0.0.1:5000']
for (const s of BARE) {
  const r = seg(s)
  if (!r) continue
  const u = new URL('https://' + s)
  is(r.parsed.schemeAdded, true, s + ' 承认是补出来的')
  is(r.parsed.scheme, 'https', s + ' 补的是 https')
  is(r.parsed.host.toLowerCase(), u.hostname, s + ' 补完后主机')
  is(r.parsed.path, u.pathname, s + ' 补完后路径')
  ok_(r.parsed.warnings.some((w) => w.includes('没写协议')), s + ' 安全提醒里说了补协议这回事')
}

/* ---------------- 二、主机位：判据只有一份 ---------------- */
console.log('=== 二 主机位 ===')
const V6_HOSTS = ['[::1]', '[2001:db8::1]', '[fe80::1]', '[::ffff:192.168.1.1]', '[1:2:3:4:5:6:7:8]', '[2001:DB8::FF00:42:8329]']
for (const h of V6_HOSTS) {
  const s = 'http://' + h + '/p'
  const r = seg(s)
  if (!r) continue
  const inner = h.slice(1, -1)
  is(row(r, '主机'), h, h + ' 主机行原样印')
  is(row(r, '主机').toLowerCase(), h.toLowerCase(), h + ' 主机行不改大小写')
  is(r.parsed.hostKind, 'IPv6 地址（方括号写法）', h + ' 类型说是 IPv6')
  ok_(r.parsed.isIpHost, h + ' 算 IP 字面量')
  // 「是不是环回」这句话只能问 ipv6.js，URL 这边不许自己认
  is(r.parsed.hostLoopback, V6.classifyIpv6(inner).name === '环回地址', h + ' 环回判断跟 ipv6.js 一致')
  is(r.parsed.origin, 'http://' + h.toLowerCase() + (h === '[::1]' ? '' : ''), h + ' 来源里带方括号')
}
for (const [bad, re] of [
  ['[::1', /方括号包住整段/],
  ['[:1]', /方括号里不是.*合法的 IPv6 主机/],
  ['[::1/64]', /不是合法的 IPv6 主机|前缀长度/],
  ['[1.2.3.4]', /IPv6|不是合法/],
  ['[::1]x', /方括号包住整段.*你写了「\[::1\]x」/],
]) {
  rejects('http://' + bad + '/p', re, '坏主机 ' + bad)
}
/* IPv4 主机：跟 ip.js 同结论，前导 0 那种歧义写法不许悄悄换算 */
for (const h of ['8.8.8.8', '127.0.0.1', '192.168.1.1', '1.2.3.4', '255.255.255.255', '0.0.0.0']) {
  const s = 'http://' + h + '/'
  const r = seg(s)
  if (!r) continue
  const sp = IP.specialForIp(h)
  is(r.parsed.hostKind, 'IPv4 地址', h + ' 类型说是 IPv4')
  is(r.parsed.hostLoopback, !!sp && sp.name === '环回地址', h + ' 环回判断跟 ip.js 一致')
  const warned = r.parsed.warnings.some((w) => w.includes('直接写 IP'))
  is(warned, !r.parsed.hostLoopback, h + ' 钓鱼提醒只在非环回时说')
}
for (const h of ['010.1.1.1', '256.1.1.1', '1.2.3.4.5', '999.1.1.1']) {
  rejects('http://' + h + '/', /四段|IPv4|最多四段/, '数字主机 ' + h + ' 该拒')
}
/* 纯数字主机：浏览器会换算成另一个地址（http://300 其实是 0.0.1.44），
   这里不换算法，只把「会换算」这件事说出来——换算就是悄悄改你写的地址 */
for (const h of ['300', '1.2.3', '0x7f.1', '127']) {
  const r = seg('http://' + h + '/p')
  if (!r) continue
  ok_(r.parsed.hostKind.includes('IPv4 简写'), h + ' 主机类型说清是简写')
  ok_(r.parsed.warnings.some((w) => w.includes('IPv4 简写')), h + ' 提醒里说了浏览器会换算')
  is(row(r, '主机'), h, h + ' 主机行还是印原文，没换算')
  is(r.parsed.origin, 'http://' + h, h + ' 来源也用原文')
  ok_(new URL('http://' + h + '/p').hostname !== h, h + ' 参照确实验实了会换算（不然这条断言是摆设）')
}
/* 空格与控制字符：折行按地址栏规则删掉，真·空格主机拒掉 */
for (const [s, wantHost, wantPath] of [
  ['http://exa\tmple.com/', 'example.com', '/'],
  ['http://exa\nmple.com/', 'example.com', '/'],
  ['http://a.com/\r\nx', 'a.com', '/x'],
  ['http://a.com/x\ty', 'a.com', '/xy'],
]) {
  const r = seg(s)
  if (!r) continue
  const u = new URL(s)
  is(r.parsed.host, wantHost, JSON.stringify(s) + ' 折行删掉后主机')
  is(r.parsed.host, u.hostname, JSON.stringify(s) + ' 折行删掉后主机跟 WHATWG')
  is(r.parsed.path, wantPath, JSON.stringify(s) + ' 折行删掉后路径')
  is(r.parsed.path, u.pathname, JSON.stringify(s) + ' 折行后的路径跟 WHATWG')
  ok_(r.parsed.warnings.some((w) => w.includes('换行或制表符')), JSON.stringify(s) + ' 说了删过折行')
}
/* IDN 不转 punycode，原样印——但主机行跟来源行得说同一个主机 */
const rIdn = seg('https://例え.jp/p')
if (rIdn) {
  is(row(rIdn, '主机'), '例え.jp', '中文域名主机行原样印')
  is(row(rIdn, '来源'), 'https://例え.jp', '中文域名来源也用它，两处不打架')
}
rejects('http://a b.com/', /主机位里有空格/, '主机里有空格')
rejects('http://a\x01b.com/', /主机位里有空格|控制字符/, '主机里有控制字符')
rejects('http://', /后面要跟域名或 IP/, '光一个 http:// 不给整套答案')
rejects('http:///', /后面要跟域名或 IP/, 'http:/// 三斜杠也不给')
rejects('http://?a=1', /后面要跟域名或 IP/, '主机空着直接写查询串也不给')
/* file 的空主机是规范允许的，别一起拒了 */
const fileR = seg('file:///etc/hosts')
if (fileR) {
  is(fileR.parsed.host, '', 'file 允许空主机')
  is(row(fileR, '来源'), '—', 'file 的来源说不上来')
  is(rowNote(fileR, '来源'), '本地文件没有来源', 'file 的来源注释')
}

/* ---------------- 三、来源 origin 的口径 ---------------- */
console.log('=== 三 来源 ===')
for (const [s, want] of [
  ['https://user:pw@api.example.com:8443/x', 'https://api.example.com:8443'],
  ['https://user:pw@api.example.com/x', 'https://api.example.com'],
  ['http://a.com:80/x', 'http://a.com'],
  ['https://a.com:443/x', 'https://a.com'],
  ['http://a.com:080/', 'http://a.com'],
  ['HTTP://Example.COM/Path', 'http://example.com'],
  ['http://a.com:8080/', 'http://a.com:8080'],
  ['http://[::1]:8080/x', 'http://[::1]:8080'],
  ['http://[::1]/x', 'http://[::1]'],
]) {
  const r = seg(s)
  if (!r) continue
  is(row(r, '来源'), want, s + ' 来源行')
  ok_(!row(r, '来源').includes('@'), s + ' 来源里不带用户名密码')
}

/* ---------------- 四、端口：跟校验台同一把尺 ---------------- */
console.log('=== 四 端口 ===')
rejects('http://a.com:99999/', /端口应在 1-65535 之间，当前 99999/, '端口 99999')
rejects('http://a.com:0/', /端口应在 1-65535 之间，当前 0/, '端口 0')
rejects('http://a.com:65536/', /端口应在 1-65535 之间，当前 65536/, '端口 65536')
rejects('http://a.com:000080/', /端口最多 5 位数字，你写的是 000080/, '端口位数超了——点名原文，不许印成 Number 后的 80')
rejects('http://a.com:abc/', /「abc」不是端口号/, '端口不是数字')
rejects('http://a.com:808 0/', /不是端口号/, '端口里有空格')
rejects('http://[::1]:99999/x', /端口应在 1-65535 之间/, 'IPv6 主机的端口越界')
const r80 = seg('http://a.com:080/')
if (r80) {
  is(row(r80, '端口'), '080', '端口行印原文，不偷偷换算')
  is(rowNote(r80, '端口'), '跟 http 的默认端口是同一个', '080 说明它跟默认端口是一回事')
}
const r1 = seg('http://a.com:8080/x')
if (r1) is(rowNote(r1, '端口'), '显式指定', '8080 是显式指定')
const r2 = seg('http://a.com/x')
if (r2) {
  is(row(r2, '端口'), '80', '没写端口时印协议默认')
  is(rowNote(r2, '端口'), '协议默认', '没写端口说明是协议默认')
}
// 校验台同一句话、同一结论：两个页面不能一个印 99999 一个说越界
// 'abc' 与 ''（空端口）是这轮补的：校验台原来把 :abc 整段丢给路径并印「格式正确」，
// 拆解页却在抛错——两页结论相反；空端口要求两页都按「没写端口」收。
for (const p of ['1', '80', '443', '1024', '65535', '0', '65536', '99999', '080', '000080', '99999999999', 'abc', '']) {
  const s = 'https://example.com:' + p + '/x'
  const v = V.checkUrl(s)
  let msg = ''
  try {
    M.urlSegments(s)
  } catch (e) {
    msg = e.message
  }
  is(v.ok, !msg, '端口 :' + p + ' 两页同结论（校验台 ' + (v.ok ? '收' : v.tip) + '｜拆解 ' + (msg || '收') + '）')
  if (!v.ok) is(msg, v.tip, '端口 :' + p + ' 两页同一句话')
}

/* ---------------- 五、伪协议的 ? 和 # ---------------- */
console.log('=== 五 伪协议切参数 ===')
const PSEUDO = [
  ['magnet:?xt=urn:btih:abc&tr=http://t/', 2],
  ['mailto:me@example.com?subject=hi%20there&cc=x', 2],
  ['data:text/plain,a?b#c', 1],
  ['tel:+8613800000000?context=1', 1],
  ['geo:39.9,116.4?q=l', 1],
  ['javascript:alert(1)?x=1#f', 1],
  ['mailto:me@example.com', 0],
  ['about:blank', 0],
]
for (const [s, n] of PSEUDO) {
  const r = seg(s)
  if (!r) continue
  const u = new URL(s)
  is(r.parsed.params.length, n, s + ' 参数个数')
  is(r.parsed.path, u.pathname, s + ' 伪协议路径跟 WHATWG')
  is(r.parsed.query, u.search.replace(/^\?/, ''), s + ' 伪协议查询串跟 WHATWG')
  is(r.parsed.hash, u.hash.replace(/^#/, ''), s + ' 伪协议锚点跟 WHATWG')
  is(row(r, '查询串'), u.search.replace(/^\?/, '') || '—', s + ' 查询串行')
  if (n) ok_(row(r, '查询串') !== '—', s + ' 带着参数，查询串那行不许说没有')
  else is(row(r, '查询串'), '—', s + ' 真没参数才印 —')
  is(row(r, '来源'), '—', s + ' 伪协议没有来源')
}
const rData = seg('data:text/html,<html><script>alert(1)</script>')
if (rData) ok_(rData.parsed.warnings.some((w) => w.includes('钓鱼页')), 'data: 内联内容要提醒')
const rJs = seg('javascript:alert(document.cookie)')
if (rJs) ok_(rJs.parsed.warnings.some((w) => w.includes('执行脚本')), 'javascript: 要提醒')

/* ---------------- 六、查询参数表 vs node:querystring ---------------- */
console.log('=== 六 查询参数 ===')
function qsLike(params) {
  const out = {}
  for (const p of params) {
    if (out[p.key] === undefined) out[p.key] = p.value
    else out[p.key] = Array.isArray(out[p.key]) ? out[p.key].concat(p.value) : [out[p.key], p.value]
  }
  return out
}
const QUERIES = [
  'a=1',
  'a=1&b=2',
  'a+b=c',
  'a=1&&b=2',
  'a&b=2',
  '=v',
  'k=',
  '%E4%B8%AD=%E6%96%87',
  'bad=%ZZ',
  'tag=x&tag=y&tag=z',
  'q=a%26b&q=c+d',
  'x=%E4%B8%AD',
  'k=%2B',
  'url=http%3A%2F%2Fa.com%2Fp%3Fb%3D1',
]
for (const qy of QUERIES) {
  const r = seg('http://a.com/p?' + qy)
  if (!r) continue
  is(JSON.stringify(qsLike(r.parsed.params)), JSON.stringify(qs.parse(qy)), '参数表跟 querystring：' + qy)
  is(r.parsed.params.map((p) => p.raw).join('&'), qy.split('&').filter((x) => x !== '').join('&'), '参数原文保序：' + qy)
}
/* 「+」在两处两种处理，各自说清楚：表里按表单规则算空格，编解码框里按字面 */
const rPlus = seg('http://a.com/?a+b=c+d')
if (rPlus) is(rPlus.parsed.params[0].key, 'a b', '查询参数表里 + 按表单规则算空格')
is(M.decodeUrl('Q+c='), 'Q+c=', '解码不吃字面 +（base64 不被改坏）')
is(M.decodeUrl('a%2Bb'), 'a+b', '解码认 %2B')
is(M.decodeUrl('a%20b'), 'a b', '解码认 %20')

/* ---------------- 七、编码 ↔ 解码 ---------------- */
console.log('=== 七 编解码 ===')
const CODEC = ['a b', 'a+b', '中文&=<>"\'', '%41', '%ZZ', '100%', 'path/to?q=1#f', 'ünïcøde', '🎉 emoji', 'a%2Bb', '', ' ', 'null', 'Q+c=/=', '0123456789', '%', '%%%']
for (const s of CODEC) {
  is(M.decodeUrl(M.encodeUrl(s)), s, '编码再解码回到原文 ' + JSON.stringify(s))
  is(M.encodeUrl(s), encodeURIComponent(s), '编码就是 encodeURIComponent：' + JSON.stringify(s))
  is(M.encodeUrl(s, true), encodeURI(s), '保留结构字符那档就是 encodeURI：' + JSON.stringify(s))
}
/* 坏的百分号编码不报错、原样留着（这是本页写明的契约） */
for (const s of ['%ZZ', '100%', '%E4%B8', '%%%a b', '%', '%2 0']) {
  is(typeof M.decodeUrl(s), 'string', '解码坏百分号不炸：' + s)
}
is(M.decodeUrl('%E4%B8%AD'), '中', '三段连着的百分号正常解')
/* 孤立代理字符：报错得是中文，还得留着 cause（preserve-caught-error 那条规则） */
for (const s of ['\uD800', 'a\uD800b', '\uDFFF']) {
  try {
    M.encodeUrl(s)
    fail++
    console.log('FAIL 孤立代理字符 ' + JSON.stringify(s) + ' 该报错却没报错')
  } catch (e) {
    ok_(/[\u4e00-\u9fa5]/.test(e.message), '孤立代理字符报错是中文：' + JSON.stringify(s))
    ok_(!!e.cause, '孤立代理字符报错留着 cause：' + JSON.stringify(s))
  }
}
is(M.encodeUrl('%ED%A0%80'), encodeURIComponent('%ED%A0%80'), '百分号字面量当普通文本编码，不掺假')

/* ---------------- 八、无害化 / 还原 ---------------- */
console.log('=== 八 无害化 ===')
const DEFANG = [
  'http://a.com/x',
  'https://evil.example.com/a?x=1',
  'ftp://a.com/',
  'http://1.2.3.4/x',
  'user@a.com',
  'HTTP://A.COM',
  'Https://Example.COM/P',
  'Visit http://a.com and https://b.com now',
  'plain text',
  'my.domain.example',
  'http://a.com/./x',
  '多个：ftp://x.com、http://y.com/z',
]
for (const s of DEFANG) {
  const d = M.defang(s)
  is(M.defang(d), d, '无害化点两次跟点一次一样：' + JSON.stringify(s))
  is(M.refang(d), s, '还原回去一字不差：' + JSON.stringify(s))
  ok_(!/hxxps?|fxp/i.test(M.refang(d)) || /hxxp/i.test(s), '还原后不留 hxxp 残骸：' + JSON.stringify(s))
  /* 无害化的目的：聊天软件认不出链接。协议名、点、@、:// 都得拆掉。
   * 判据看的是协议名那个「词」还在不在——只看「http:」会被 [:]// 那一换给糊过去 */
  if (/\b(https?|ftp)\b/i.test(s)) {
    ok_(!/\b(https?|ftp)\b/i.test(d), '每个链接的协议名都被拆开：' + JSON.stringify(s))
    ok_(!/\b(https?|ftp):/i.test(d), '无害化里没有 http: 这种能被点开的写法：' + JSON.stringify(s))
    ok_(!/[:]\s*\/\//.test(d.replace(/\[:\]\/\//g, '')), '无害化后没有裸 ://：' + JSON.stringify(s))
  }
  if (/\d\.\d\.\d\.\d/.test(s)) ok_(d.includes('[.]'), 'IP 也点了方括号：' + JSON.stringify(s))
}
/* 已经是无害化写法的，别二次破坏（原来是 a[.]com → a[[.]]com） */
for (const s of ['hxxp[:]//a[.]com', 'a[.]b', 'hxxps[:]//b[.]com/x']) {
  is(M.defang(s), s, '已经是无害化样子的不再动：' + JSON.stringify(s))
}
/* 期望是手写的，不来自模块：粘的是一整句话时，句中的每个链接都要拆，不是只拆串首那个 */
is(M.defang('Visit http://a.com and https://b.com now'),
  'Visit hxxp[:]//a[.]com and hxxps[:]//b[.]com now', '整句话里两个链接都拆开')
is(M.defang('多个：ftp://x.com、http://y.com/z'),
  '多个：fxp[:]//x[.]com、hxxp[:]//y[.]com/z', '中文句子里两个链接都拆开')
is(M.refang('hxxp[:]//evil[.]com'), 'http://evil.com', 'hxxp 还原')
is(M.refang('hxxps[:]//evil[.]com'), 'https://evil.com', 'hxxps 还原')
is(M.refang('fxp[:]//evil[.]com'), 'ftp://evil.com', 'fxp 还原')
is(M.refang('user[@]a[.]com'), 'user@a.com', '还原 @')

/* ---------------- 九、表格与界面的原话 ---------------- */
console.log('=== 九 界面契约 ===')
const rSample = seg(M.SAMPLE_URL)
if (rSample) {
  is(rSample.rows.length, 9, '拆解表格 9 行')
  is(rSample.rows.map((k) => k[0]).join('/'), '协议/用户名/密码/主机/端口/路径/查询串/锚点/来源', '表格行名与顺序')
  is(row(rSample, '协议'), 'https', '示例协议')
  is(row(rSample, '主机'), 'api.example.com', '示例主机')
  is(row(rSample, '端口'), '8443', '示例端口')
  is(row(rSample, '路径'), '/v2/items', '示例路径')
  is(row(rSample, '来源'), 'https://api.example.com:8443', '示例来源不含凭证')
  is(row(rSample, '查询串'), 'page=2&size=20&tag=%E5%B7%A5%E5%85%B7&tag=dev', '示例查询串')
  is(rowNote(rSample, '查询串'), '4 个参数', '示例参数个数写在注释里')
  is(row(rSample, '密码'), '（有）', '示例密码只说「有」')
  is(rSample.parsed.params[2].value, '工具', '示例里的 %E5%B7%A5%E5%85%B7 解出「工具」')
  ok_(rSample.parsed.warnings.some((w) => w.includes('用户名密码')), '示例提醒凭证')
}
/* 报错要指着出错的那一栏，别让端口错去怪 IP */
try {
  M.urlSegments('http://a.com:99999/')
  fail++
  console.log('FAIL 端口越界该报错')
} catch (e) {
  ok_(/端口/.test(e.message) && !/IP/.test(e.message), '端口越界的报错只说端口：' + e.message)
}
/* 伪协议带参数时，「没有查询参数」这句话不许出现在数据里（界面按 params.length 决定说不说） */
const rMag = seg('magnet:?xt=urn:btih:abc')
if (rMag) ok_(rMag.parsed.params.length === 1, 'magnet 的参数看得见，界面才不会说没有')
/* 空路径：有来源概念的协议才是「/」，其余没写就是没写 */
const rSsh = seg('ssh://user@a.com')
if (rSsh) {
  is(rSsh.parsed.path, '', 'ssh 没写路径就是空')
  is(row(rSsh, '路径'), '—', 'ssh 路径行印 —')
  is(rowNote(rSsh, '路径'), '原文没写路径', 'ssh 路径注释')
}
const rHttpBare = seg('http://a.com')
if (rHttpBare) is(row(rHttpBare, '路径'), '/', 'http 没写路径按规范算 /')
/* 协议说明：常见协议都得有话说，未知协议直说是未知 */
for (const [s, want] of [
  ['http://a.com/', '明文 HTTP，默认端口 80'],
  ['https://a.com/', '加密 HTTP，默认端口 443'],
  ['ftp://a.com/', '文件传输，默认端口 21'],
  ['data:text/plain,hi', '内联数据（base64 或文本直接写在 URL 里）'],
  ['magnet:?xt=1', '磁力链接'],
  ['htp://a.com/', '未知协议'],
]) {
  const r = seg(s)
  if (r) is(rowNote(r, '协议'), want, s + ' 协议说明')
}
/* 来源只剩一个字段：原来那个带着凭证的 authority 不许长回来 */
if (rSample) is(rSample.parsed.authority, undefined, 'authority 这个字段已经没了')
/* 锚点里带 ? 时不许把 ? 后面的当查询串（规范：# 先切） */
const rHashQ = seg('http://a.com/x#frag?ment=1')
if (rHashQ) {
  is(rHashQ.parsed.hash, 'frag?ment=1', '锚点里的 ? 不算查询串')
  is(rHashQ.parsed.query, '', '锚点里的 ? 不算查询串（查询串为空）')
}
/* 界面把注释跟在值后面一起印，所以「—（只在本页内跳转，不会发给服务器）」是两句打架的话：
 *  没有锚点的那一行不许再讲锚点的行为 */
if (rHttpBare) is(rowNote(rHttpBare, '锚点'), '', '没有锚点时锚点那行不许有注释')
if (rSample) is(rowNote(rSample, '锚点'), '只在本页内跳转，不会发给服务器', '有锚点才讲锚点的事')

/* ---------------- 十、随机对撞 ---------------- */
console.log('=== 十 随机对撞 ===')
const rnd = lcg(20260930)
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'
function randLabel() {
  const n = 1 + ri(rnd, 8)
  let s = ''
  for (let i = 0; i < n; i++) s += LETTERS[ri(rnd, 26)]
  return s
}
for (let i = 0; i < 300; i++) {
  const host = randLabel() + '.' + randLabel()
  const port = 1 + ri(rnd, 65535)
  const segs = []
  for (let k = 0, n = ri(rnd, 4); k <= n; k++) segs.push(encodeURIComponent(randLabel() + (ri(rnd, 3) === 0 ? ' 中' : '')))
  const path = '/' + segs.join('/')
  const qp = []
  for (let k = 0, n = ri(rnd, 4); k < n; k++) qp.push(encodeURIComponent(randLabel()) + '=' + encodeURIComponent(randLabel() + (ri(rnd, 4) === 0 ? ' a+b' : '')))
  const url = 'https://' + host + ':' + port + path + (qp.length ? '?' + qp.join('&') : '')
  const u = new URL(url)
  const r = seg(url)
  if (!r) continue
  is(r.parsed.host, host, '随机 ' + url + ' 主机')
  is(r.parsed.port, String(port), '随机 ' + url + ' 端口')
  is(r.parsed.effectivePort, String(port), '随机 ' + url + ' 有效端口')
  is(r.parsed.path, u.pathname, '随机 ' + url + ' 路径')
  is(r.parsed.query, u.search.replace(/^\?/, ''), '随机 ' + url + ' 查询串')
  is(r.parsed.origin, u.origin, '随机 ' + url + ' 来源')
  is(JSON.stringify(qsLike(r.parsed.params)), JSON.stringify(qs.parse(u.search.replace(/^\?/, ''))), '随机 ' + url + ' 参数表')
  is(r.parsed.params.length, qp.length, '随机 ' + url + ' 参数个数')
  // 参数个数决定了界面说不说「没有查询参数」
  if (qp.length) ok_(row(r, '查询串') !== '—', '随机 ' + url + ' 查询串行不为空')
}
/* 随机端口：1-65535 收、其余拒，且跟校验台同结论 */
for (let i = 0; i < 200; i++) {
  const p = ri(rnd, 70000)
  const s = 'http://a.com:' + p + '/x'
  const v = V.checkUrl(s)
  let msg = ''
  try {
    M.urlSegments(s)
  } catch (e) {
    msg = e.message
  }
  is(v.ok, !msg, '随机端口 ' + p + ' 两页同结论')
  is(msg === '', p >= 1 && p <= 65535 && String(p).length <= 5, '随机端口 ' + p + ' 结论本身就是 1-65535')
}
/* 随机无害化文本：只在协议名和点里混，往返必须闭合 */
for (let i = 0; i < 200; i++) {
  const scheme = ['http', 'https', 'ftp', 'HTTP', 'Https', 'FTP'][ri(rnd, 6)]
  const host = randLabel() + '.' + ['com', 'cn', 'net'][ri(rnd, 3)]
  const text = (ri(rnd, 2) ? '看这里 ' : '') + scheme + '://' + host + '/' + randLabel() + (ri(rnd, 2) ? ' 完' : '')
  const d = M.defang(text)
  is(M.defang(d), d, '随机无害化幂等：' + text)
  is(M.refang(d), text, '随机无害化可逆：' + text)
  ok_(!/\[\.]\[\.]/.test(d), '随机无害化没有叠加的 [.]：' + text)
}
/* 随机百分号串：解码不许炸 */
for (let i = 0; i < 200; i++) {
  let s = ''
  for (let k = 0, n = ri(rnd, 12); k < n; k++) s += ['%', 'a', '1', '4', 'e', 'd', '+', ' ', '中', '%20', '%E4%B8%AD', '%ZZ', '%2'][ri(rnd, 13)]
  const out = M.decodeUrl(s)
  is(typeof out, 'string', '随机解码不炸：' + JSON.stringify(s))
  is(M.decodeUrl(M.encodeUrl(s)), s, '随机编码→解码闭合：' + JSON.stringify(s))
}

console.log('url 自查：' + ok + ' 通过 / ' + fail + ' 失败')
if (fail) process.exit(1)
