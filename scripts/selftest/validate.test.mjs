/** 校验台的自查。
 *  对照全部独立于被测模块：
 *  一是校验位用「闭合性质」现算——身份证按 GB11643 的 (加权和 + 校验值) mod 11 === 1、
 *      统一社会信用代码按 GB32100 的 (加权和 + 校验值) mod 31 === 0、银行卡与 IMEI 按 Luhn
 *      的 sum mod 10 === 0。测试里自己解出校验位再喂给模块，模块那两张映射表写错就红。
 *  二是「由定义就该成立」的边界——端口 1-65535、域名标签不许连字符开头结尾、用户名
 *      的点不能首尾或连续、出生日期不能在未来、号牌末位可以是挂/学/警。
 *  三是界面契约：这轮修的八处里，有四处原本会把错话直接印到界面上——
 *      未来的出生日期印「-1 岁」、138 号段印「运营商：联通/电信」、0.0.0.0 印「公网地址」、
 *      京A1234学 印「格式不正确」。所以这些分支断的是 tip 和 extra 的字面内容。
 *  IPv4 的类型名取自 ip.js 那张网段表（校验台不再自己抄一份），但本套件只 useUtils('validate')，
 *  ip.js 作为依赖被顺带装载——网段表本身仍算欠账，别在这里冒充它已经测过。 */
import { useUtils } from './harness.mjs'
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
/** 校验通过，并且 tip 与 extra 全等（extra 按模块里的键序写） */
function pass(r, tip, extra, m) {
  is(r.ok, true, m)
  is(r.tip, tip, m + ' 的 tip')
  is(JSON.stringify(r.extra || {}), JSON.stringify(extra), m + ' 的 extra')
}
/** 校验不通过，钉住报错文案——界面原样印这一句 */
/** 取解析行：被拒时给空对象，让断言报成一条 FAIL 而不是崩栈 */
function row(r) {
  return r.extra || {}
}
function bad(r, tipRe, m) {
  is(r.ok, false, m)
  if (!tipRe.test(r.tip)) {
    fail++
    console.log('FAIL ' + m + ': tip 不符 → ' + JSON.stringify(r.tip))
  } else ok++
}

/* ---------- 独立对照：三种校验位的闭合性质 ---------- */
const ID_W = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
/** 解出第 18 位：加权和 + 校验值 ≡ 1 (mod 11)，10 写成 X */
function idFull(body17) {
  let s = 0
  for (let i = 0; i < 17; i++) s += Number(body17[i]) * ID_W[i]
  const v = ((1 - s) % 11 + 11) % 11
  return body17 + (v === 10 ? 'X' : String(v))
}
const USCC_CHARS = '0123456789ABCDEFGHJKLMNPQRTUWXY'
const USCC_W = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28]
/** 解出第 18 位：加权和 + 校验值 ≡ 0 (mod 31) */
function usccFull(body17) {
  let s = 0
  for (let i = 0; i < 17; i++) s += USCC_CHARS.indexOf(body17[i]) * USCC_W[i]
  return body17 + USCC_CHARS[(31 - (s % 31)) % 31]
}
/** 独立实现的 Luhn：从右数第偶数位翻倍，超过 9 减 9 */
function luhnSum(s) {
  let sum = 0
  for (let i = 0; i < s.length; i++) {
    let n = Number(s[i])
    if ((s.length - i) % 2 === 0) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  return sum
}
function luhnFull(body) {
  for (let d = 0; d <= 9; d++) {
    if (luhnSum(body + String(d)) % 10 === 0) return body + String(d)
  }
  throw new Error('补不出 Luhn 校验位：' + body)
}
/** 把 Date 拼成身份证里的八位生日 */
const ymd = (d) =>
  String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0')
const dashYmd = (d) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')

/* ---------- 清单本身：12 条、示例必须过自己的校验器 ---------- */
{
  const L = V.VALIDATORS
  is(L.length, 12, '校验台有 12 类')
  is(new Set(L.map((x) => x.key)).size, 12, 'key 不重复')
  is(L.every((x) => x.name && x.placeholder && x.sample && typeof x.fn === 'function'), true, '每条都齐 name/placeholder/sample/fn')
  for (const x of L) {
    const r = x.fn(x.sample)
    ok_(r.ok, x.key + ' 的示例值必须能通过自己的校验：' + x.sample + ' → ' + r.tip)
    ok_(Object.keys(r.extra || {}).length > 0, x.key + ' 通过时要给出解析信息')
    is(V.findValidator(x.key), x, 'findValidator 回到本条：' + x.key)
  }
  is(V.findValidator('没有这个类型').key, 'phone', '找不到类型时退回第一项（只供渲染兜底）')
}

/* ---------- 出参契约：任何入参都得返回 {ok, tip}，tip 是中文 ---------- */
{
  const junk = ['', '  ', 'x', 'null', '0', '-1', 'A'.repeat(80), '  hello@world  ', '12345678901234567890']
  for (const x of V.VALIDATORS) {
    for (const j of junk) {
      const r = x.fn(j)
      ok_(r && typeof r.ok === 'boolean' && typeof r.tip === 'string', x.key + ' 对垃圾输入仍返回 {ok,tip}：' + JSON.stringify(j))
      if (!r.ok) ok_(/[\u4e00-\u9fa5]/.test(r.tip), x.key + ' 的报错得是中文：' + r.tip)
      else ok_(r.tip === '格式正确' || r.tip === '校验通过', x.key + ' 通过时的 tip 固定：' + r.tip)
    }
  }
}

/* ---------- 手机号：只报号段，不猜运营商 ---------- */
{
  const f = V.checkPhone
  pass(f('13800138000'), '格式正确', { 号段: '138' }, '手机号通过')
  ok_(!('运营商' in f('13800138000').extra), '不再凭第二位猜运营商（138 是中国移动，原来印成「联通/电信」）')
  ok_(!('运营商' in f('14512345678').extra), '145 同样不报运营商')
  is(f('138 0013 8000').ok, true, '空格分隔照收')
  is(f('138-0013-8000').ok, true, '横线分隔照收')
  bad(f(''), /请输入手机号/, '空输入')
  bad(f('1380013800a'), /只能包含数字/, '含字母')
  bad(f('1380013800'), /长度应为 11 位，当前 10 位/, '10 位')
  bad(f('138001380001'), /长度应为 11 位，当前 12 位/, '12 位')
  bad(f('23800138000'), /应以 1 开头/, '不是 1 开头')
  bad(f('12800138000'), /号段不存在/, '12 号段不存在')
  bad(f('10800138000'), /号段不存在/, '10 号段不存在')
  is(f('19912345678').ok, true, '199 号段通过')
  is(row(f('13912345678')).号段, '139', '号段取前三位')
}

/* ---------- 身份证：校验位闭合、出生日期不许在未来 ---------- */
{
  const f = V.checkIdCard
  const now = new Date()
  const ex = (v) => row(f(v))
  // 30 年前的同一个日子：不管哪天跑，周岁都正好 30
  const b30 = new Date(now.getFullYear() - 30, now.getMonth(), now.getDate())
  const id30 = idFull('110101' + ymd(b30) + '001')
  pass(f(id30), '校验通过', {
    出生日期: dashYmd(b30),
    性别: '男',
    年龄: '30 岁',
    顺序码: '001',
    校验位: id30[17],
    归属地码: '110101',
  }, '30 岁整的身份证全条解析')
  is(f(id30.toLowerCase()).ok, true, '末位小写 x 照样认')
  // 本轮修的：只卡「年不超过今年」会放过还没到的日子，界面上印「-1 岁」
  const future = idFull('110101' + ymd(new Date(now.getTime() + 400 * 86400000)) + '001')
  bad(f(future), /出生日期还在未来/, '出生日期在未来要拦')
  ok_(!('年龄' in row(f(future))), '被拦下时不输出年龄')
  const todayId = idFull('110101' + ymd(now) + '001')
  is(ex(todayId).年龄, '0 岁', '今天出生算 0 岁，不是 -1 也不是 1')
  is(f(idFull('110101' + ymd(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())) + '001')).ok, true, '上个月出生通过')
  is(f('110101199003077213').ok, true, '清单里的示例号仍通过')
  const wrong = id30.slice(0, 17) + (id30[17] === '1' ? '2' : '1')
  bad(f(wrong), /校验位不匹配，应为 /, '校验位错')
  ok_(f(wrong).tip.includes('实际为'), '报错里点出实际那一位')
  bad(f(idFull('11010118991231001')), /出生年份不合理/, '1899 年出生不合理')
  bad(f(idFull('11010119901301001')), /出生月份不合理/, '13 月')
  bad(f(idFull('11010120230229001')), /出生日期不合理/, '2023 年没有 2 月 29 日')
  is(f(idFull('11010120240229001')).ok, true, '2024 年 2 月 29 日是真的')
  bad(f('1101011990030772101'), /应为 18 位，当前 19 位/, '19 位')
  bad(f('11010119900307721A'), /格式应为 17 位数字/, '末位是别的字母')
  is(ex(idFull('11010119900307002')).性别, '女', '顺序码偶数是女')
  is(ex(idFull('11010119900307001')).性别, '男', '顺序码奇数是男')
  is(ex(idFull('44030519900307001')).归属地码, '440305', '归属地码取前六位')
  const pin18 = idFull('11010119900307721')
  is(f(pin18).ok, true, '独立闭合算出的第 18 位与模块那张表同解：' + pin18)
  is(ex(pin18).校验位, pin18[17], '校验位回显第 18 位')
}

/* ---------- 银行卡：Luhn + BIN + 卡组织 ---------- */
{
  const f = V.checkBankCard
  const ex = (v) => row(f(v))
  is(luhnSum('6222021234567890128') % 10, 0, '官方向量：清单示例的 Luhn 和是 10 的倍数')
  const card = luhnFull('622588123456789')
  pass(f(card), '校验通过', { 归属行: '招商银行', 卡组织: '银联', 卡号长度: '16 位' }, '622588 招行银联')
  const broken = card.slice(0, 15) + (card[15] === '0' ? '1' : '0')
  bad(f(broken), /Luhn 校验未通过/, '末位改一笔 Luhn 就不过')
  is(luhnSum(broken) % 10 !== 0, true, '独立实现也认为它不闭合')
  is(ex(luhnFull('621700000000000000')).归属行, '建设银行', '621700 建行')
  is(ex(luhnFull('9558800000000000')).归属行, '工商银行', '955880 工行')
  is(ex(luhnFull('6228480000000000')).归属行, '农业银行', '622848 农行')
  is(ex(luhnFull('6222600000000000')).归属行, '交通银行', '622260 交行（表里只留一行）')
  is(ex(luhnFull('3568850000000000')).卡组织, 'JCB', '356885 JCB')
  is(ex(luhnFull('4367420000000000')).卡组织, 'Visa', '4 开头 Visa')
  is(ex(luhnFull('5112340000000000')).卡组织, 'MasterCard', '51-55 MasterCard')
  is(ex(luhnFull('371234000000000')).卡组织, 'American Express', '34/37 Amex')
  is(ex(luhnFull('6299990000000000')).归属行, '未识别', '表里没有的 62 段说未识别，不硬编一家银行')
  is(f('62 2202-1234 5678 9012 8').ok, true, '空格横线混着写也收（顺便压到 19 位上界）')
  bad(f(''), /请输入银行卡号/, '空输入')
  bad(f('622202abc'), /只能包含数字/, '含字母')
  bad(f(luhnFull('6222020000')), /长度通常在 12-19 位之间/, '11 位太短')
  bad(f(luhnFull('6222020000000000000')), /长度通常在 12-19 位之间/, '20 位太长')
  is(ex(luhnFull('622202000000000000')).卡号长度, '19 位', '19 位是上界，能过')
  is(ex(luhnFull('62220200000000')).卡号长度, '15 位', '15 位卡号也收')
}

/* ---------- 邮箱：域名标签与用户名的点 ---------- */
{
  const f = V.checkEmail
  pass(f('hello@example.com'), '格式正确', { 用户名: 'hello', 域名: 'example.com' }, '普通邮箱')
  is(f('a+b@sub.example.com').ok, true, '加号做标签、子域都通过')
  is(f('u.s_e-r%1@x-y.cn').ok, true, '点下划线横线百分号、连字符夹在中间')
  // 本轮修的：域名标签以连字符开头/结尾、用户名的点在首尾或连续，原来全都放过
  bad(f('a@-abc.com'), /域名格式不正确/, '域名标签不能以连字符开头')
  bad(f('a@abc-.com'), /域名格式不正确/, '域名标签不能以连字符结尾')
  bad(f('a..b@example.com'), /用户名里的点/, '用户名不能有点相连')
  bad(f('.a@example.com'), /用户名里的点/, '用户名不能以点开头')
  bad(f('a.@example.com'), /用户名里的点/, '用户名不能以点结尾')
  bad(f('a@abc..com'), /域名格式不正确/, '域名不能有空标签')
  bad(f('a@b.c'), /域名格式不正确/, '顶级域至少两个字母')
  bad(f('@example.com'), /格式不正确/, '缺用户名')
  bad(f('a@b@c.com'), /用户名只能含/, '两个 @ 时前一段被用户名规则挡掉')
  bad(f('a b@example.com'), /用户名只能含/, '用户名不许空格')
  bad(f(''), /请输入邮箱/, '空输入')
  bad(f('x'.repeat(65) + '@a.com'), /用户名最长 64 个字符，当前 65 个/, '用户名 65 字符超上限')
  is(f('x'.repeat(64) + '@a.com').ok, true, '用户名 64 字符正好')
  is(f('x'.repeat(250) + '@a.com').tip, '过长', '整串超 254 说过长')
  is(f('a@192.168.1.1').ok, false, '邮箱不接 IP 字面量域名')
}

/* ---------- 网址：端口范围与协议 ---------- */
{
  const f = V.checkUrl
  pass(f('https://example.com'), '格式正确', { 协议: 'https', 主机: 'example.com', 端口: '默认', 路径: '/' }, '只有主机')
  is(row(f('https://a.example.com:8080/p?q=1#f')).端口, ':8080', '带端口')
  // 本轮修的：端口原来只按「有冒号有数字」放过，:0 和 :99999 都印格式正确
  bad(f('https://example.com:0/'), /端口应在 1-65535 之间，当前 0/, '端口 0 不行')
  bad(f('https://example.com:99999/x'), /端口应在 1-65535 之间，当前 99999/, '端口 99999 不行')
  bad(f('https://example.com:99999999999/'), /端口应在 1-65535 之间/, '位数超了也拦，别让 Number 溢出')
  is(f('https://example.com:65535/').ok, true, '65535 是上界')
  is(f('https://example.com:1/').ok, true, '1 是下界')
  is(row(f('HTTPS://Example.COM/Path')).协议, 'HTTPS', '协议按用户写的样子回显')
  is(row(f('HTTPS://Example.COM/Path')).主机, 'Example.COM', '主机同样原样回显')
  is(row(f('http://localhost:3000/x')).主机, 'localhost', 'localhost 免点号')
  bad(f('http://intranet/'), /域名格式不正确/, '只有一段的主机名不收（localhost 之外）')
  is(row(f('http://192.168.1.10:8080/')).主机, '192.168.1.10', 'IP 主机')
  bad(f('http://300.1.1.1/'), /IP 段超出 255/, 'IP 段越界')
  bad(f('ftp://example.com/'), /建议以 http/, '别的协议先劝一下')
  bad(f('example.com'), /建议以 http/, '缺协议')
  bad(f(''), /请输入网址/, '空输入')
  bad(f('https://example.com:8080/a b'), /格式不正确/, '路径里有空格')
  is(row(f('https://sub.example.co.uk/a/b/c')).路径, '/a/b/c', '多级路径')
  is(row(f('https://example.com/')).路径, '/', '只有斜杠')
}

/* ---------- IPv4：分类只在 ip.js 一张表里 ---------- */
{
  const f = V.checkIPv4
  const type = (s) => row(f(s)).类型
  // 本轮修的：这里原来自己抄了一份首位判断，0.0.0.0 和 CGNAT 都被报成「公网地址」
  is(type('0.0.0.0'), '本网络', '0/8 不是公网')
  is(type('100.64.0.0'), '运营商级 NAT', 'CGNAT 段起点')
  is(type('100.127.255.255'), '运营商级 NAT', 'CGNAT 段终点')
  is(type('100.63.255.255'), '公网地址', 'CGNAT 前一个地址是公网')
  is(type('100.128.0.0'), '公网地址', 'CGNAT 后一个地址是公网')
  is(type('255.255.255.255'), '广播地址', '受限广播不是「保留地址」')
  is(type('255.255.255.254'), '保留地址', '240/4 里除广播那条外都算保留')
  is(type('192.0.2.1'), '文档示例', 'TEST-NET-1')
  is(type('198.18.0.0'), '基准测试', '性能测试保留段')
  is(type('8.8.8.8'), '公网地址', '普通公网')
  for (const s of ['10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1']) {
    is(type(s), '私有地址', s + ' 私有')
  }
  is(type('172.15.0.1'), '公网地址', '172.16/12 之外不算私有')
  is(type('172.32.0.1'), '公网地址', '同上，右边界外')
  is(type('127.0.0.1'), '环回地址', '环回')
  is(type('169.254.1.1'), '链路本地', 'DHCP 失败自动分配')
  is(type('224.0.0.1'), '组播地址', 'D 类')
  is(type('239.255.255.255'), '组播地址', '组播上界')
  is(type('240.0.0.1'), '保留地址', 'E 类')
  bad(f('1.2.3'), /应为 4 段，当前 3 段/, '三段')
  bad(f('1.2.3.4.5'), /应为 4 段，当前 5 段/, '五段')
  bad(f('1.2.3.a'), /第 4 段不是数字/, '非数字段')
  bad(f('1.2.3.256'), /第 4 段超出 255/, '超 255')
  bad(f('010.1.1.1'), /第 1 段不应有前导 0/, '前导 0')
  bad(f(''), /请输入 IP/, '空输入')
}

/* ---------- MAC ---------- */
{
  const f = V.checkMac
  pass(f('a0:b1:c2:d3:e4:f5'), '格式正确', {
    标准写法: 'A0:B1:C2:D3:E4:F5',
    类型: '单播地址',
    范围: '全球唯一 (OUI)',
    厂商前缀: 'A0B1C2',
  }, '小写冒号分隔')
  is(row(f('A0-B1-C2-D3-E4-F5')).标准写法, 'A0:B1:C2:D3:E4:F5', '横线分隔统一成冒号')
  is(row(f('01:00:5E:00:00:01')).类型, '组播地址', '首字节最低位是 1 → 组播')
  is(row(f('02:00:00:00:00:00')).范围, '本地管理', '首字节次低位是 1 → 本地管理')
  is(row(f('FF:FF:FF:FF:FF:FF')).类型, '组播地址', '广播地址的组播位也是 1')
  bad(f('a0:b1:c2:d3:e4'), /应为 12 位十六进制/, '少一组')
  bad(f('g0:11:22:33:44:55'), /应为 12 位十六进制/, '不是十六进制')
  bad(f(''), /应为 12 位十六进制/, '空输入')
}

/* ---------- IMEI ---------- */
{
  const f = V.checkImei
  const imei = luhnFull('86012345678901')
  pass(f(imei), '校验通过', { TAC: imei.slice(0, 8), 序列号: imei.slice(8, 14), 校验位: imei[14] }, '自己补出的 IMEI 通过')
  is(luhnSum(imei) % 10, 0, '闭合性质成立')
  bad(f(imei.slice(0, 14) + (imei[14] === '9' ? '8' : '9')), /Luhn 校验未通过/, '末位改一笔就不通过')
  bad(f('86012345678901'), /IMEI 应为 15 位数字/, '14 位')
  bad(f('86012345678901A'), /IMEI 应为 15 位数字/, '含字母')
  is(f('86 01 23 45 67 89 014').ok, true, '空格分隔照收')
}

/* ---------- 统一社会信用代码 ---------- */
{
  const f = V.checkUSCC
  const code = usccFull('91110108MA01ABCDE')
  is(code, '91110108MA01ABCDEN', '独立算出的校验位与清单示例同一位')
  pass(f(code), '校验通过', {
    登记管理部门: '工商',
    机构类别: '1',
    行政区划: '110108',
    主体标识码: 'MA01ABCDE',
  }, '全条解析')
  const wrong = code.slice(0, 17) + (code[17] === 'N' ? 'M' : 'N')
  bad(f(wrong), /校验位不匹配，应为 /, '校验位错')
  bad(f('91110108MA01ABCDI0'), /包含非法字符 I/, 'I 不在字符集里')
  bad(f('91110108MA01ABCDOS'), /包含非法字符/, 'O、S 同样不收')
  bad(f('9111010'), /应为 18 位/, '位数不足')
  is(row(f(usccFull('51110108MA01ABCDE'))).登记管理部门, '民政', '首位 5 是民政')
  is(row(f(usccFull('11110108MA01ABCDE'))).登记管理部门, '机构编制', '首位 1 是机构编制')
  is(row(f(usccFull('Y1110108MA01ABCDE'))).登记管理部门, '其他', '首位 Y 是其他')
  is(row(f(usccFull('91110108MA01ABCDE'))).主体标识码, 'MA01ABCDE', '主体标识码取 9-17 位')
}

/* ---------- 车牌：末位挂/学/警 ---------- */
{
  const f = V.checkPlate
  const kind = (s) => row(f(s)).类型
  // 本轮修的：新能源那条正则里就写着这三个字，普通牌却不收，真车牌被判「格式不正确」
  pass(f('京A1234学'), '格式正确', { 类型: '教练车号牌' }, '教练车')
  pass(f('京A0123警'), '格式正确', { 类型: '警车号牌' }, '警车')
  pass(f('京A1234挂'), '格式正确', { 类型: '挂车号牌' }, '挂车')
  pass(f('京A12345'), '格式正确', { 类型: '普通号牌' }, '普通七位')
  is(f('粤B12345').ok, true, '另一个省份')
  is(kind('京AD12345'), '新能源', '小型新能源：D + 四位 + 位')
  is(kind('京A12345D'), '新能源', '大型新能源：五位 + D')
  is(kind('京AB123学'), '教练车号牌', '第二位是字母的教练车')
  bad(f('沪AB12345'), /普通号牌应为 7 位/, '八位又不是合法新能源')
  bad(f('京A1234I'), /格式不正确/, 'I 不出现在号牌里')
  bad(f('京A1234O'), /格式不正确/, 'O 同样不收')
  bad(f('使12345A'), /格式不正确/, '使领馆牌不在这套规则里')
  bad(f('京A1234'), /普通号牌应为 7 位/, '6 位')
  bad(f(''), /普通号牌应为 7 位/, '空输入')
  is(f(' 京 A 1 2 3 4 学 ').ok, true, '空格清掉再判')
}

/* ---------- 邮编 ---------- */
{
  const f = V.checkPostcode
  pass(f('100000'), '格式正确', { 邮区: '10', 省份码: '1' }, '六位邮编')
  bad(f('010000'), /首位不应为 0/, '首位为 0')
  bad(f('10000'), /邮政编码应为 6 位数字/, '五位')
  bad(f('1000000'), /邮政编码应为 6 位数字/, '七位')
  bad(f('10000a'), /邮政编码应为 6 位数字/, '含字母')
  bad(f(''), /邮政编码应为 6 位数字/, '空输入')
  is(row(f('518000')).邮区, '51', '邮区取前两位')
}

/* ---------- 中文姓名：间隔号位置 ---------- */
{
  const f = V.checkChineseName
  pass(f('张三'), '格式正确', { 字数: 2 }, '两字名')
  is(f('买买提·阿吾江').ok, true, '间隔号在中间断词')
  is(row(f('欧阳娜娜')).字数, 4, '字数按码点数')
  // 本轮修的：首尾的间隔号原来也判「格式正确」
  bad(f('·张三'), /间隔号不能在首尾或连续/, '不能以间隔号开头')
  bad(f('张三·'), /间隔号不能在首尾或连续/, '不能以间隔号结尾')
  bad(f('张··三'), /间隔号不能在首尾或连续/, '不能连着两个间隔号')
  bad(f('张'), /应为 2-15 位中文/, '单字')
  bad(f(''), /应为 2-15 位中文/, '空输入')
  bad(f('张三abc'), /应为 2-15 位中文/, '夹拉丁字母')
  is(f('王'.repeat(15)).ok, true, '15 字是上界')
  bad(f('王'.repeat(16)), /应为 2-15 位中文/, '16 字超了')
  is(row(f('李四')).常见姓氏, '是', '李在姓氏表里')
  ok_(!('常见姓氏' in f('张三').extra), '不在表里的姓不硬说「常见」')
}

console.log('== validate pass=' + ok + '/' + (ok + fail))
if (fail) process.exit(1)
