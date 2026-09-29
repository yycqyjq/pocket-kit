/** TOTP / HOTP 的自查：期望值取自 RFC 4226 与 RFC 6238 附录 B 的公开测试向量，
 *  不是从本仓库实现里算出来的——这样才对得上一句「手机验证器算出来的码一定一致」。 */
import { useUtils } from './harness.mjs'
const T = await useUtils('totp')

let ok = 0
let fail = 0
function is(a, b, m) {
  if (a === b) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b))
  }
}
function throws(fn, m) {
  try {
    fn()
    fail++
    console.log('FAIL ' + m + ': should throw')
  } catch (e) {
    ok++
  }
}

const ascii = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)))
// RFC 4226 / 6238 的共用密钥：ASCII "12345678901234567890"
const K1 = ascii('12345678901234567890')
const S1 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

/* ---------- Base32（RFC 4648 附录 B 的官方向量）---------- */
is(T.base32Encode(K1), S1, 'RFC 4226 密钥的 Base32')
is(String.fromCharCode(...T.base32Decode(S1)), '12345678901234567890', '解回来')
is(T.base32Decode('gezdgnbvgy3tqojqgezdgnbvgy3tqojq').length, 20, '小写也收')
is(T.base32Decode('GEZDGNBV GY3TQOJQ GEZDGNBV GY3TQOJQ').length, 20, '空格丢掉')
is(T.base32Decode('GEZDGNBV-GY3TQOJQ-GEZDGNBV-GY3TQOJQ').length, 20, '连字符丢掉')
is(T.base32Encode(ascii('')), '', '空输入')
is(T.base32Encode(ascii('a')), 'ME======', '1 字节补六个等号')
is(T.base32Encode(ascii('ab')), 'MFRA====', '2 字节')
is(T.base32Encode(ascii('abc')), 'MFRGG===', '3 字节')
is(T.base32Encode(ascii('abcd')), 'MFRGGZA=', '4 字节')
is(T.base32Encode(ascii('abcde')), 'MFRGGZDF', '5 字节')
for (const s of ['a', 'ab', 'abc', 'abcd', 'abcde', '12345678901234567890']) {
  is(String.fromCharCode(...T.base32Decode(T.base32Encode(ascii(s)))), s, '编解码往返 ' + s.length + ' 字节')
}
is(T.base32Decode('MFRGG===').length, 3, 'padding 丢掉后长度对')
is(T.base32Decode('MFRX').length, 2, '不成组的尾巴按整字节出')
throws(() => T.base32Decode(''), '空密钥报错')
throws(() => T.base32Decode('ABC1'), '非法字符（数字 1）报错')
throws(() => T.base32Decode('ABCD=X'), '等号后面不能再跟字符')

/* ---------- RFC 4226 HOTP 十个向量 ---------- */
const RFC4226 = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489']
RFC4226.forEach((code, counter) => is(T.hotp(K1, counter, 6, 'SHA1'), code, 'HOTP 计数 ' + counter))
is(T.hotp(T.base32Decode(S1), 3, 6), '969429', 'hotp 吃 Base32 解出来的字节')
is(T.hotp(K1, 0, 8).length, 8, '8 位补零')

/* ---------- RFC 6238 附录 B 表 1（at 用毫秒，和界面一致）---------- */
const V6238 = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
]
for (const [sec, code] of V6238) {
  is(T.totp(S1, { digits: 8, at: sec * 1000 }).code, code, 'SHA1 T=' + sec)
}
const V256 = [
  [59, '46119246'],
  [1111111109, '68084774'],
  [1111111111, '67062674'],
  [1234567890, '91819424'],
  [2000000000, '90698825'],
]
const K256 = ascii('12345678901234567890123456789012')
for (const [sec, code] of V256) {
  is(T.totp(T.base32Encode(K256), { digits: 8, algo: 'SHA256', at: sec * 1000 }).code, code, 'SHA256 T=' + sec)
}
const V512 = [
  [59, '90693936'],
  [1111111109, '25091201'],
  [1111111111, '99943326'],
  [1234567890, '93441116'],
  [2000000000, '38618901'],
]
const K512 = ascii('1234567890123456789012345678901234567890123456789012345678901234')
for (const [sec, code] of V512) {
  is(T.totp(T.base32Encode(K512), { digits: 8, algo: 'SHA512', at: sec * 1000 }).code, code, 'SHA512 T=' + sec)
}
// 表里还有一行 T=20000000000（计数器 666666666），一起钉住大计数不进位
is(T.totp(S1, { digits: 8, at: 20000000000 * 1000 }).code, '65353130', 'SHA1 T=20000000000')
is(
  T.totp(T.base32Encode(K256), { digits: 8, algo: 'SHA256', at: 20000000000 * 1000 }).code,
  '77737706',
  'SHA256 T=20000000000'
)
is(
  T.totp(T.base32Encode(K512), { digits: 8, algo: 'SHA512', at: 20000000000 * 1000 }).code,
  '47863826',
  'SHA512 T=20000000000'
)

/* ---------- 界面要用的派生字段 ---------- */
const t = T.totp(S1, { at: 59000 })
is(t.ok, true, '默认参数能出码')
is(t.counter, 1, 'T=59 落在第 1 个 30 秒窗')
is(t.code.length, 6, '默认 6 位')
is(t.pretty, t.code.slice(0, 3) + ' ' + t.code.slice(3), '六位拆成 3+3')
is(t.remain, 1, '窗内剩余秒')
is(t.progress, 29 / 30, 'T=59 已经走完这个窗的 29/30')
is(t.keyBytes, 20, '密钥字节数')
is(t.expiresAt, 60000, '到期毫秒')
const t8 = T.totp(S1, { digits: 8, at: 59000 })
is(t8.pretty, t8.code, '八位不拆')
is(T.totp('@@@', { at: 59000 }).ok, false, '坏密钥返回 ok=false 而不是抛')
is(typeof T.totp('@@@', { at: 59000 }).error, 'string', '坏密钥带中文原因')

/* ---------- 校验与时间窗 ---------- */
const v = T.verifyTotp(S1, t.code, { at: 59000 })
is(v.ok, true, '校验本身没出错')
is(v.matched, true, '当前窗命中')
is(v.offset, 0, '偏移 0')
is(v.explain, '正好是当前时间窗', '命中说明')
// 上一个窗的码（T=29 时算出来的）在 T=59 仍应被接受，偏移 −1
const prev = T.totp(S1, { at: 29000 }).code
const vp = T.verifyTotp(S1, prev, { at: 59000 })
is(vp.matched, true, '上一窗容许')
is(vp.offset, -1, '偏移 −1')
is(vp.explain, '属于上一个时间窗（可能刚过期）', '过期说明')
const next = T.totp(S1, { at: 89000 }).code
const vn = T.verifyTotp(S1, next, { at: 59000 })
is(vn.offset, 1, '下一窗偏移 +1')
is(vn.explain, '属于下一个时间窗（设备时钟偏快）', '偏快说明')
// T=0 的码（计数器 0）拿到 at=119000（base=3）时差三个窗，默认 ±1 不该匹配
const old = T.totp(S1, { at: 0 }).code
is(old, '755224', '计数器 0 就是 RFC 4226 的第一条')
is(T.verifyTotp(S1, old, { at: 119000 }).matched, false, '差三窗不匹配')
is(T.verifyTotp(S1, old, { at: 119000, window: 2 }).matched, false, '±2 仍不匹配')
const wide = T.verifyTotp(S1, old, { at: 119000, window: 3 })
is(wide.matched, true, '窗口放到 ±3 才收下')
is(wide.offset, -3, '偏移 −3')
is(T.verifyTotp(S1, 'abc', { at: 59000 }).error, '验证码只能是数字', '非数字输入')
is(T.verifyTotp(S1, ' 12 34 56 ', { at: 59000 }).matched, false, '带空格的六位不匹配但不报错')
is(T.verifyTotp('@@@', '123456', { at: 59000 }).matched, false, '坏密钥不匹配')

/* ---------- otpauth:// 链接与随机密钥 ---------- */
is(T.secretFromUri('otpauth://totp/ACME:alice?secret=' + S1 + '&issuer=ACME&period=30&digits=6'), S1, '从链接取密钥')
is(T.secretFromUri('otpauth://totp/X?issuer=ACME&secret=' + S1), S1, '参数顺序无关')
is(T.secretFromUri('otpauth://totp/X?issuer=SECRETNOTHERE'), '', '没有 secret 参数返回空')
is(T.secretFromUri(''), '', '空链接')
const rs = T.randomSecret()
is(rs.length, 32, '默认 20 字节 → 32 个 Base32 字符')
is(/^[A-Z2-7]+$/.test(rs), true, '出来的确实是 Base32')
is(T.base32Decode(rs).length, 20, '能解回 20 字节')
is(T.base32Decode(T.randomSecret(10)).length, 10, '指定字节数')
is(T.randomSecret() !== T.randomSecret(), true, '两次不一样')
is(T.TOTP_NOTES.length >= 4, true, '界面说明还在')

console.log('== totp pass=' + ok + '/' + (ok + fail))
if (fail) process.exitCode = 1
