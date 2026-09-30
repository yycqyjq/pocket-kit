/** punycode.js 的自查。判据全部独立于被测模块：
 *  一是手抄的 RFC 3492 冻结向量 19 条——每个 Unicode 标签的 xn-- 写法先跟 Node 内置那份纯 JS
 *      RFC 3492 实现（node:punycode 2.1.0，跟本模块、跟 ICU 都没血缘，也不随 ICU 版本变）
 *      交叉确认过再抄在这儿，编解码两头各钉一遍，模块以后偷偷改口径这里当场红；
 *  二是 node:url 的 domainToASCII / domainToUnicode——Node 自带的 UTS#46 整域名实现，不是项目依赖。
 *      它只当「有没有换成第三个名字」的判官，不当「收不收」的判官：同一串 ICU 78.2 判非法、
 *      78.3 却原样放过（'xn--a'、'xn--ib9b'、'١٢٣' 都在这批，CI 那台 Node 24 就是被这条
 *      版本差撞红的），所以「两边都收时答案一字不差」保持硬，
 *      「ICU 收不收」一律改钉成：要么整个拒、要么原样放过，不许折成第三个名字；
 *      16 条「两边都该收」的域名两个字段对撞；随机语料再钉一条更强的：
 *      两个都收的时候答案必须一模一样（除第三段写明的那两类口径差）；
 *  三是由定义就该成立的闭合：编码过的标签解回原样、解出来的再编回同一串、
 *      convert 幂等（把「可读形式」或「Punycode 形式」那两行喂回去结果不动）、
 *      产出标签一律 ≤63、整串一律 ≤253、产出必是可打印 ASCII、
 *      编码那头肯收的码点解码那头必还得回来（孤立代理与控制字符两头一起拒）；
 *  四是界面契约：direction 那三种说法、六个快捷样例、报错指着具体是哪一个标签、
 *      零宽字符报出码点，以及文案里「最长 63 / 最长 253 / 下划线只能出现在标签开头 /
 *      xn-- 必须能对上 / 大小写先折成小写」逐条真 enforce。
 *  本轮收口十一处：标签「a」编成「a」少了分隔符、解回来是 U+0080（标签级八条分歧）；
 *  自往返不闭合九条（「fiq228c」解出「中文」、70 个 a 印出 70 个看不见的字符）；
 *  「xn--ib9b」「xn--a」解出孤立代理与控制字符，照样印在「可读形式」那一行；
 *  编码那头收孤立代理，编出一个自己解不回的 xn--（编解码两头尺不一样）；
 *  「中 文.cn」编成中间带空格的 xn--——字符集一条没查；63 / 253 只写在文案里一条没 enforce；
 *  连字符的首、尾、第 3-4 位三条没查；空标签悄悄通过、末尾的根标签被丢；
 *  全角不折——「ａｐｐｌｅ．ｃｏｍ」转出来的 xn-- 跟 apple.com 是两个名字，钓鱼检查恰恰在这里给错答案；
 *  xn-- 解出来不折——「xn--ri7c4agaaa」自称解成「ｆｕｗｗｗｗ」，跟本模块编码同一条输入的结果对不上；
 *  报错不指是哪一个标签、零宽空格被说成「空格」。 */
import nodeUrl from 'node:url'
import { useUtils } from './harness.mjs'

const M = await useUtils('punycode')
const ICU_A = nodeUrl.domainToASCII
const ICU_U = nodeUrl.domainToUnicode

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

/* 第二实现判官：Node 内置那份纯 JS RFC 3492 实现（作者与本模块无关，也不读 ICU 的字符表，
   所以它对「这一段数据解出来是什么」的回答不随 ICU 版本变）。它挂着 DEP0040 但仍在；
   哪天真被删掉，这里必须红——判官没了只剩「跟自己比」，那不是自查。 */
let REF = null
try {
  REF = (await import('node:punycode')).default
} catch (e) {
  fail++
  console.log('FAIL 独立判官 node:punycode 加载不了：' + e.message)
}

function lcg(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s
  }
}

/* ---------------- 一、手抄的 RFC 3492 冻结向量 ---------------- */
const VECTORS = [
  ['中文', 'xn--fiq228c'],
  ['中国', 'xn--fiqs8s'],
  ['台湾', 'xn--kprw13d'],
  ['香港', 'xn--j6w193g'],
  ['测试', 'xn--0zwm56d'],
  ['例子', 'xn--fsqu00a'],
  ['公司', 'xn--55qx5d'],
  ['随身匣', 'xn--pjr589ke7e'],
  ['日本', 'xn--wgv71a'],
  ['例え', 'xn--r8jz45g'],
  ['テスト', 'xn--zckzah'],
  ['한국어', 'xn--3e0bk47br7k'],
  ['münchen', 'xn--mnchen-3ya'],
  ['рф', 'xn--p1ai'],
  ['пример', 'xn--e1afmkfd'],
  ['тест', 'xn--e1aybc'],
  ['файл', 'xn--80asg7a'],
  ['ночной', 'xn--i1ahadb6c'],
  ['١٢٣', 'xn--9hbcd'],
]
for (const [u, a] of VECTORS) {
  const payload = a.slice(4)
  // 抄本先跟第二实现（node:punycode）对一遍：编、解各钉一次，它跟本模块无血缘
  is(REF && REF.encode(u), payload, '第二实现编码交叉确认 ' + u)
  is(REF && REF.decode(payload), u, '第二实现解码交叉确认 ' + a)
  // ICU 那一头只钉「不许换成第三个名字」：78.2 收「١٢٣」，78.3 直接判非法，收不收不是判据
  const icu = ICU_A(u)
  is(icu === a || icu === '', true, 'ICU 对冻结向量 ' + u + ' 要么同结论要么整个拒：' + JSON.stringify(icu))
  is(M.punycodeEncode(u), payload, '编码冻结向量 ' + u)
  is(M.punycodeDecode(payload), u, '解码冻结向量 ' + a)
  is(M.domainToAscii(u).ascii, a, '整域编码 ' + u)
  is(M.domainToUnicode(a).unicode, u, '整域解码 ' + a)
  is(M.convert(u).direction, 'unicode→ascii', '方向：' + u + ' 是给人看的那一侧')
  is(M.convert(a).direction, 'ascii→unicode', '方向：' + a + ' 是给 DNS 用的那一侧')
  is(M.convert(u).unicode, u, '双向结果的可读行 ' + u)
  is(M.convert(a).ascii, a, '双向结果的 Punycode 行 ' + a)
}

/* ---------------- 二、整域名跟 Node 自带 ICU 对撞（两边都该收的） ---------------- */
const AGREE = [
  '中文.cn',
  'münchen.de',
  'пример.рф',
  '例え.テスト',
  '台湾.example',
  '香港.测试',
  '한국어.kr',
  '🎉.com',
  '随身匣.公司',
  '日本.测试',
  'a.com',
  '123.com',
  'xn--fiq228c.cn',
  'xn--mnchen-3ya.de',
  'xn--e1afmkfd.xn--p1ai',
  'xn--pjr589ke7e.xn--55qx5d',
]
for (const d of AGREE) {
  is(M.domainToAscii(d).ascii, ICU_A(d), 'ICU 对撞 ASCII 侧 ' + d)
  is(M.domainToUnicode(d).unicode, ICU_U(d), 'ICU 对撞 Unicode 侧 ' + d)
}
// 全角折完才看得出是同一个名字：这一条不是「差不多」，是必须跟 ICU 一字不差
is(M.domainToAscii('中文．公司.cn').ascii, ICU_A('中文．公司.cn'), '全角点折完跟 ICU 同结论')
is(M.domainToAscii('中文.公司.cn').ascii, M.domainToAscii('中文．公司.cn').ascii, '全角点与半角点转出来同一个名字')
is(M.domainToUnicode('xn--fiq228c．cn').unicode, '中文.cn', '全角点后面的 xn-- 照样解')

/* ---------------- 三、口径差：这里严于 ICU 的每一条都写明理由 ---------------- */
const CALIBER = [
  ['a..b.com', /第 2 个标签是空的/, 'ICU 留着空标签；DNS 里长度为 0 的标签只有末尾那个根标签允许'],
  ['.b.com', /第 1 个标签是空的/, '同上，开头的点不是分隔符而是空标签'],
  ['-abc.com', /不能以「-」开头/, 'RFC 5891 的连字符位置规则，ICU 在这里不查'],
  ['abc-.com', /不能以「-」结尾/, '同上'],
  ['ab--cd.com', /第 3、4 位不能都是「-」/, '那两个位置是 xn-- 专用，ICU 照收'],
  ['a'.repeat(64) + '.com', /最多 63 个/, '一个标签就是一个长度字节，ICU 的 ToASCII 不查长度'],
  ['中文'.repeat(41), /的 ASCII 形式有 93 个字符/, '编码后才算长度：原文 82 个字符，转出来 93'],
  ['中文.cn/path', /「\/」不能出现在域名里/, '这是域名输入框，不是地址；带斜杠得去 URL 拆解那一页'],
  ['中文.cn:8080', /「:」不能出现在域名里/, '同上，端口不属于域名'],
  ['user@example.com', /「@」不能出现在域名里/, '同上，凭证不属于域名'],
  ['中文_search.cn', /「_」不能出现在域名里/, '下划线只许出现在标签开头（_dmarc 那一类），中间和结尾 ICU 收了 DNS 不收'],
  ['_x中文.com', /「_」不能出现在域名里/, '下划线跟非 ASCII 混在一个标签里，编出来是「xn--_x-…」这种自家解析器不认的串，所以必须在这儿就拦'],
  ['_a_b.com', /「_」不能出现在域名里/, '一个标签里只许开头那一个下划线'],
  ['xn--fiq228c-.com', /全是 ASCII/, '数据段带尾分隔符的写法解出来是纯 ASCII 标签，DNS 里不会有'],
]
for (const [d, re, why] of CALIBER) {
  pThrows(() => M.convert(d), re, '口径：' + d.slice(0, 24) + ' —— ' + why)
}
// 反过来：粘进来的地址两端带空白，这里照收，ICU 判非法。剪贴板里出来的地址本来就带空格
is(M.convert(' 中文.cn ').ascii, 'xn--fiq228c.cn', '口径：两端空白先 trim（ICU 在这儿判非法）')

// 这五种 xn-- 写法本模块都拒。拒的理由不拿 ICU 的取舍当尺（78.2 全拒、78.3 全原样放过，
// CI 那轮就是被这条版本差撞红的），改钉两条跨版本稳的：
// 第二实现解出来的确实是那一串东西（看不见的控制字符、半个表情、折完只剩 ASCII、带大写、空的），
// 而 ICU 那一头不许把它换成第三个名字——要么整个拒，要么原样放过。
const XN_BAD = [
  ['xn--a.com', '\u0080', /C1 控制符 U\+0080/, '解出来是 U+0080，看不见也不是字符'],
  ['xn--ib9b.com', '\ud800', /半个表情符号/, '解出来是孤立代理，连一个字符都算不上'],
  ['xn--ri7c4agaaa.com', 'ｆｕｗｗｗｗ', /全是 ASCII/, '折完是 fuwwww，纯 ASCII 的标签不该带 xn--'],
  ['xn--zzz-zzz.com', 'z\u1F49zz', /还带着大写/, '解出来是 zὉzz，U+1F49 是带变音的大写字母'],
  ['xn--.com', '', /后面没有内容/, 'xn-- 后面是空的'],
]
for (const [d, dec, re, why] of XN_BAD) {
  const payload = d.slice(4, d.indexOf('.'))
  is(REF && REF.decode(payload), dec, '第二实现在 ' + d + ' 上解出同一串')
  const icu = ICU_A(d)
  is(icu === '' || icu === d, true, 'ICU 对 ' + d + ' 要么拒要么原样放过，不许换成别的名字：' + JSON.stringify(icu))
  pThrows(() => M.convert(d), re, '本模块拒 ' + d + ' —— ' + why)
}
// 大写 ẞ：本模块按 JS toLowerCase 折成 ß。ICU 这一头自己就在两个答案之间跳过（78.2 全折叠成
// ss，78.3 折成 ß），所以判据只钉自己那个值，ICU 那边钉「必须是这两个之一，不许有第三种」
is(M.domainToAscii('ẞ.de').ascii, 'xn--zca.de', '口径：大写 ẞ 按小写折成 ß')
const icuSs = ICU_A('ẞ.de')
is(icuSs === 'ss.de' || icuSs === 'xn--zca.de' || icuSs === '', true, 'ICU 对 ẞ.de 只可能是 ss 或 ß 那两种历史答案：' + JSON.stringify(icuSs))
is(M.domainToAscii('ß.de').ascii, ICU_A('ß.de'), '口径：ß 本身跟 ICU 同结论')
is(M.convert('１２３').ascii, '123', '口径：纯数字整串不换写成 IPv4 简写，只折完照印')
is(M.convert('１２３').notes.some((n) => n.includes('NFKC')), true, '纯数字那串也得说清折了什么')

/* ---------------- 四、由定义就该成立的闭合 ---------------- */
// 4.1 编码 ↔ 解码互逆：编码那头能收的，解码那头必还得回来
const RT = [
  'a', 'ab', 'abc', '中文', '例子', '测试', '随身匣', 'münchen', 'пример', '한국어', '١٢٣', '🎉',
  'a-b', '中-b', '中文-b', 'a'.repeat(70), '中文'.repeat(40), 'ß', '日本测试', 'xn--fiq228c',
  'ﬁ', '𝕏', '中文.cn', 'file1', 'Ωω',
]
for (const s of RT) {
  let enc
  try {
    enc = M.punycodeEncode(s)
  } catch (e) {
    fail++
    console.log('FAIL 闭合：编码拒了正当输入 ' + JSON.stringify(s) + ' → ' + e.message)
    continue
  }
  is(M.punycodeDecode(enc), s, '闭合 编→解 自等 ' + JSON.stringify(s))
  is(M.punycodeEncode(M.punycodeDecode(enc)), enc, '闭合 解→编 对得上 ' + JSON.stringify(s))
}
// 4.2 编码那头不许编出一个自己解不回的 xn--：两头用的是同一张坏字符表
const BAD_CODEPOINTS = [
  ['\uD800', /半个表情符号/],
  ['\uDFFF', /半个表情符号/],
  ['\u0001', /控制字符 U\+0001/],
  ['\u007f', /删除符 U\+007F/],
  ['\u0080', /C1 控制符 U\+0080/],
  ['\u00ad', /软连字符 U\+00AD/],
  ['\u200b', /空白字符 U\+200B/],
  ['\ufeff', /字节序标记 U\+FEFF/],
  ['\uE000', /私用区字符 U\+E000/],
  ['\uFFFE', /非字符 U\+FFFE/],
  ['\uFFFF', /非字符 U\+FFFF/],
]
for (const [cp, re] of BAD_CODEPOINTS) {
  pThrows(() => M.punycodeEncode('中' + cp + '文'), re, '编码那头拒 ' + JSON.stringify(cp))
  // 坏码点编不出来，也就没法拿「编出来的那一串」去问解码；两头各自钉一遍
  pThrows(() => M.convert('a' + cp + '.com'), re, '整域名拒 ' + JSON.stringify(cp))
}
is(M.punycodeEncode('中文'), 'fiq228c', '坏码点表没把正常中文一起拒了')
// 4.3 转换幂等 + 长度不变式 + 产出必是可打印 ASCII：随机语料
const rnd = lcg(20260930)
const POOL = [
  ...'abcdefghijklmnopqrstuvwxyz0123456789',
  ...'-_',
  ...'中文测试公司随身匣例子語',
  ...'мünchenпример',
  ...'日本語한국어',
  ...'０１２３４５６７８９',
  ...'ﬁ①Ⅻ',
  ...'🎉𝕏Ωωß',
  ...' ＀/：．　',
]
const pick = () => POOL[rnd() % POOL.length]
// 这两类是第三段写明的口径差，随机对撞时跳过，别把它当成新分歧
const SKIP_FULLFOLD = (s) => /ß|ẞ|İ/.test(s)
const isAllNumeric = (s) => /^[0-9.]+$/.test(s)
let accepted = 0
let fuzzDif = 0
for (let i = 0; i < 1200; i++) {
  const segs = []
  const n = 1 + (rnd() % 3)
  for (let j = 0; j < n; j++) {
    let l = ''
    const len = 1 + (rnd() % 7)
    for (let k = 0; k < len; k++) l += pick()
    segs.push(l)
  }
  const d = segs.join('.')
  let r
  try {
    r = M.convert(d)
  } catch (e) {
    if (!/[\u4e00-\u9fa5]/.test(e.message)) {
      fail++
      console.log('FAIL 随机 ' + i + ' 报错不是中文：' + JSON.stringify(d) + ' → ' + e.message)
    } else ok++
    continue
  }
  accepted++
  const body = r.ascii.replace(/\.$/, '')
  ok_(body.length <= 253, '随机 ' + i + ' 整串 ≤253：' + body.length)
  ok_([...body].every((c) => c.codePointAt(0) >= 0x20 && c.codePointAt(0) < 0x7f), '随机 ' + i + ' 产出是可打印 ASCII：' + JSON.stringify(body))
  ok_(body === body.toLowerCase(), '随机 ' + i + ' 产出全小写：' + body)
  for (const l of r.labels) ok_(l.output.length <= 63, '随机 ' + i + ' 标签 ≤63：' + l.output)
  // 幂等：把界面上那两行任意一行喂回去，结果不许动
  let againA
  let againU
  try {
    againA = M.convert(r.ascii).ascii
    againU = M.convert(r.unicode)
  } catch (e) {
    fail++
    console.log('FAIL 随机 ' + i + ' 自己转出来的结果自己不认：' + JSON.stringify(d) + ' → ' + e.message)
    continue
  }
  is(againA, r.ascii, '随机 ' + i + ' 幂等（Punycode 行喂回去）' + JSON.stringify(d))
  is(againU.ascii, r.ascii, '随机 ' + i + ' 幂等（可读行喂回去）' + JSON.stringify(d))
  is(againU.unicode, r.unicode, '随机 ' + i + ' 可读行再转一次还是它')
  // 跟 ICU 的同结论性：两个都收，答案必须一字不差（除上面声明的口径差）
  if (!SKIP_FULLFOLD(d) && !isAllNumeric(r.unicode)) {
    const his = ICU_A(d)
    if (his !== '' && his !== r.ascii) {
      fuzzDif++
      if (fuzzDif <= 5) console.log('FAIL 随机 ' + i + ' 与 ICU 答案不同：' + JSON.stringify(d) + ' 我们=' + JSON.stringify(r.ascii) + ' ICU=' + JSON.stringify(his))
    } else ok++
  }
  // 折叠绝不可能悄悄发生：这台 Node 的 NFKC 动了原文，备注里就必须有一条说清
  const raw = d.trim()
  const compat = raw.normalize('NFKC').trim()
  is(r.notes.some((x) => x.includes('NFKC')), compat !== raw, '随机 ' + i + ' 折叠与备注同步 ' + JSON.stringify(d))
}
ok_(accepted > 300, '随机语料里有 ' + accepted + ' 条被收下（太少说明判据收得太狠）')
is(fuzzDif, 0, '随机语料与 ICU 同结论（两个都收的那些）')
// 4.4 自产的 xn-- 一定自洽：编→解→编 三趟不动
const CLEAN = [...'abcdefghijklmnopqrstuvwxyz0123456789中文测试公司随身匣語例еßﬁ１８']
for (let i = 0; i < 200; i++) {
  let l = ''
  const len = 1 + (rnd() % 8)
  for (let k = 0; k < len; k++) l += CLEAN[rnd() % CLEAN.length]
  let a
  try {
    a = M.domainToAscii(l).ascii
  } catch (e) {
    continue
  }
  if (!/^xn--/.test(a)) continue
  const folded = l.trim().normalize('NFKC').trim().toLowerCase()
  is(M.domainToUnicode(a).unicode, folded, '随机标签 ' + JSON.stringify(l) + ' 编完再解回折后的那一串')
  is(M.domainToAscii(M.domainToUnicode(a).unicode).ascii, a, '随机标签 ' + JSON.stringify(l) + ' 解出来再编回去是同一串')
  is(M.domainToUnicode(M.domainToUnicode(a).unicode).unicode, folded, '随机标签 ' + JSON.stringify(l) + ' 可读行再解一次还是它')
}

/* ---------------- 五、界面契约 ---------------- */
// 5.1 direction 三种说法
is(M.convert('中文.cn').direction, 'unicode→ascii', '说法：给人看的进 DNS')
is(M.convert('xn--fiq228c.cn').direction, 'ascii→unicode', '说法：DNS 的还成人看的')
is(M.convert('abc.com').direction, 'ascii（本就不需要转换）', '说法：本来就是同一种写法')
is(M.convert('xn--fiq228c.中文').direction, 'unicode→ascii', '说法：两种混在一起时按编码那一侧报')
ok_(M.convert('xn--fiq228c.中文').notes.some((n) => /混在一起/.test(n)), '混着写必须提醒（检查时两种都要看）')
// 5.2 六个快捷样例：每条都能转，且两侧结果钉住
const SAMPLES = [
  ['中文.cn', 'xn--fiq228c.cn', '中文.cn'],
  ['随身匣.公司', 'xn--pjr589ke7e.xn--55qx5d', '随身匣.公司'],
  ['例え.テスト', 'xn--r8jz45g.xn--zckzah', '例え.テスト'],
  ['münchen.de', 'xn--mnchen-3ya.de', 'münchen.de'],
  ['пример.рф', 'xn--e1afmkfd.xn--p1ai', 'пример.рф'],
  ['xn--fiq228c.cn', 'xn--fiq228c.cn', '中文.cn'],
]
is(M.PUNY_SAMPLES.length, SAMPLES.length, '快捷样例还是 ' + SAMPLES.length + ' 个')
M.PUNY_SAMPLES.forEach((s, i) => {
  is(s.value, SAMPLES[i][0], '样例 ' + i + ' 还是那一条')
  const r = M.convert(s.value)
  is(r.ascii, SAMPLES[i][1], '样例 ' + s.name + ' 的 Punycode 行')
  is(r.unicode, SAMPLES[i][2], '样例 ' + s.name + ' 的可读行')
  is(r.notes.length, 0, '样例 ' + s.name + ' 不该有备注（都是干净写法）')
})
// 5.3 逐标签拆解：编码侧与解码侧都得有，不能一面倒
is(M.convert('中文.cn').labels.map((l) => l.input + '→' + l.output).join(' '), '中文→xn--fiq228c cn→cn', '拆解行（编码方向）')
ok_(M.convert('中文.cn').labels[0].note.includes('xn--fiq228c'), '拆解行要说清编成了什么')
ok_(M.convert('中文.cn').labels[1].note.includes('纯 ASCII'), '没动的那一段得说没动')
is(M.convert('xn--fiq228c.cn').labels.map((l) => l.input + '→' + l.output).join(' '), 'xn--fiq228c→中文 cn→cn', '拆解行（解码方向）')
ok_(M.convert('xn--fiq228c.cn').labels[0].note.includes('中文'), '粘 xn-- 进来时表上得印「解出」，不许全是「本来就是」')
is(M.convert('xn--fiq228c.cn').labels.length, 2, '拆解行数跟段数一致')
// 5.4 报错指着具体标签，零宽字符报码点
pThrows(() => M.convert('xn--a.com'), /^「xn--a」解不出来/, '报错点名是哪一个标签')
pThrows(() => M.convert('中文.xn--ib9b.com'), /「xn--ib9b」/, '多段域名要点出问题那一段')
pThrows(() => M.convert('中\u200b文.cn'), /空白字符 U\+200B/, '零宽空格要说码点，不能只说「空格」')
pThrows(() => M.convert('xn--'), /后面没有内容/, '光一个 xn-- 得说后面空的')
pThrows(() => M.convert('xn--中-x.com'), /基本段里不该出现非 ASCII/, 'xn-- 的基本段里塞汉字')
pThrows(() => M.convert('xn--fiq228.com'), /数据不完整/, '扩展数据只剩半截')
pThrows(() => M.convert('xn--9999999999999999999999999999.com'), /超出可计算范围/, '数字大到算不动也得说人话')
pThrows(() => M.convert('xn--xn---.com'), /又带 xn-- 前缀/, 'xn-- 套 xn--')
pThrows(() => M.convert('xn---fiq228c.com'), /再编回去是「xn--fiq228c」，跟你写的这一串对不上/, '解得出但回编对不上（多一个减号那种写法）')
pThrows(() => M.convert('xn--zzz-zzz.com'), /还带着大写/, '解出来带大写不是规范形式')
pThrows(() => M.convert('xn--ri7c4agaaa.com'), /全是 ASCII，这种标签本来就不该带 xn--/, '折完全是 ASCII 的 xn-- 要拒')
pThrows(() => M.convert('中文\u3000.cn'), /NFKC.*折完这一串/, '全角空格折成普通空格以后报的毛病，得说清指的是折完那一串')
// 5.5 文案里那些承诺真的 enforce 了
pThrows(() => M.convert('a'.repeat(64) + '.com'), /DNS 一个标签最多 63 个/, '文案「最长 63 个字符」是真的在查')
pThrows(() => M.convert(Array(5).fill('a'.repeat(60)).join('.')), /DNS 最多 253 个/, '文案「最长 253 个字符」是真的在查')
is(M.convert('_dmarc.example.com').ascii, '_dmarc.example.com', '文案「下划线开头能转」')
is(M.convert('_smtp._tcp.example.com').ascii, '_smtp._tcp.example.com', '文案「_smtp._tcp 这类服务记录名」')
pThrows(() => M.convert('a_.example.com'), /「_」不能出现在域名里/, '文案「下划线只在开头」')
is(M.convert('WWW.Baidu.COM').ascii, 'www.baidu.com', '文案「整串先折成小写」')
is(M.convert('München.de').unicode, 'münchen.de', '文案「大小写不区分」——大写变音也折小写')
ok_(!M.convert('WWW.Baidu.COM').notes.some((n) => /NFKC/.test(n)), '只折大小写不开 NFKC 备注（那是另一件事）')
pThrows(() => M.convert(''), /请输入域名/, '空输入')
pThrows(() => M.convert('   '), /请输入域名/, '只有空白')
// 5.6 根标签：留着，并且说出来
is(M.convert('中文.cn.').ascii, 'xn--fiq228c.cn.', '末尾的点原样留着')
ok_(M.convert('中文.cn.').notes.some((n) => /根标签/.test(n)), '末尾的点是根标签得说出来')
is(M.convert('中文.cn.').unicode, '中文.cn.', '可读行也留着根标签')

console.log('punycode 自查：' + ok + ' 通过 / ' + fail + ' 失败')
if (fail) process.exit(1)
