/** 摘要与 HMAC 的自查，两重对照：
 *  一是手抄进文件的公开向量（RFC 1321 附录 A 的 MD5 全套、FIPS 180 的「abc」与 56 字节样例）；
 *  二是 Node 自带的 crypto——它是另一套实现，拿它对分组边界（56/64、112/128）、多字节 UTF-8、
 *  长密钥与长消息逐条撞。HMAC 没有可凭记忆的官方向量，全部以 Node 为对照。
 *  任何一条对不上，先怀疑我抄的向量，再怀疑实现。 */
import crypto from 'node:crypto'
import { useUtils } from './harness.mjs'
const H = await useUtils('hash')

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
function throwsWith(fn, re, m) {
  try {
    fn()
    fail++
    console.log('FAIL ' + m + ': 应该抛错却没抛')
  } catch (e) {
    const msg = e && e.message ? e.message : String(e)
    if (!/[\u4e00-\u9fa5]/.test(msg)) {
      fail++
      console.log('FAIL ' + m + ': 报错不是中文 → ' + msg)
    } else if (re && !re.test(msg)) {
      fail++
      console.log('FAIL ' + m + ': 文案不符 → ' + msg)
    } else ok++
  }
}
const nodeHash = (algo, buf) => crypto.createHash(algo).update(buf).digest('hex')
const u8 = (s) => Buffer.from(s, 'utf8')

/* ---------- RFC 1321 附录 A 的 MD5 测试套件 ---------- */
const MD5_RFC1321 = [
  ['', 'd41d8cd98f00b204e9800998ecf8427e'],
  ['a', '0cc175b9c0f1b6a831c399e269772661'],
  ['abc', '900150983cd24fb0d6963f7d28e17f72'],
  ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
  ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
  ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
  [
    '12345678901234567890123456789012345678901234567890123456789012345678901234567890',
    '57edf4a22be3c955ac49da2e2107b67a',
  ],
]
for (const [txt, want] of MD5_RFC1321) {
  is(H.hash('md5', txt), want, 'RFC 1321 向量 md5(' + JSON.stringify(txt.slice(0, 14)) + ')')
}

/* ---------- FIPS 180 的公开样例 ---------- */
is(H.hash('sha1', ''), 'da39a3ee5e6b4b0d3255bfef95601890afd80709', 'SHA-1 空串')
is(H.hash('sha1', 'abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d', 'SHA-1 abc')
is(H.hash('sha1', 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), '84983e441c3bd26ebaae4aa1f95129e5e54670f1', 'SHA-1 的 56 字节样例')
is(H.hash('sha256', ''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'SHA-256 空串')
is(H.hash('sha256', 'abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'SHA-256 abc')
is(
  H.hash('sha256', 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
  '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  'SHA-256 的 56 字节样例（这一串我第一次抄成了 …6b8b57c1…，是本文件唯一被 Node 纠正的常量）'
)
is(
  H.hash('sha512', 'abc'),
  'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
  'SHA-512 abc'
)
is(H.hash('sha1', 'abc').length, 40, 'SHA-1 出 160 位')
is(H.hash('sha256', 'abc').length, 64, 'SHA-256 出 256 位')
is(H.hash('sha512', 'abc').length, 128, 'SHA-512 出 512 位')
is(H.hash('md5', 'abc').length, 32, 'MD5 出 128 位')
ok_(/^[0-9a-f]+$/.test(H.hash('sha256', 'abc')), '十六进制一律小写，没有大写也没有分隔符')

/* ---------- 与 Node 逐长度对撞：填充换段的那几刀 ---------- */
const body = 'abcdefghijklmnopqrstuvwxyz'
const ALGOS = [
  ['md5', 'md5'],
  ['sha1', 'sha1'],
  ['sha256', 'sha256'],
  ['sha512', 'sha512'],
]
const BOUNDARY = [0, 1, 3, 54, 55, 56, 57, 62, 63, 64, 65, 71, 72, 110, 111, 112, 119, 120, 127, 128, 129, 135, 136, 200, 500, 1000, 4096]
for (const n of BOUNDARY) {
  let s = ''
  for (let i = 0; i < n; i++) s += body[i % body.length]
  for (const [key, nodeAlgo] of ALGOS) {
    is(H.hash(key, s), nodeHash(nodeAlgo, u8(s)), key + ' 在 ' + n + ' 字节上等于 Node')
  }
}
{
  let big = ''
  for (let i = 0; i < 65536; i++) big += String.fromCharCode(97 + (i % 26))
  for (const [key, nodeAlgo] of ALGOS) {
    is(H.hash(key, big), nodeHash(nodeAlgo, u8(big)), key + ' 的 64KB 输入等于 Node')
  }
}

/* ---------- 多字节 UTF-8：走的是 base64.js 的 utf8Bytes ---------- */
const UTF8_CASES = ['中', '中文口袋工具', 'é', 'ümlaut', '😀', 'a😀b中c', 'tab\t换行\n回车\r', '0', ' ', '　']
for (const txt of UTF8_CASES) {
  for (const [key, nodeAlgo] of ALGOS) {
    is(H.hash(key, txt), nodeHash(nodeAlgo, u8(txt)), key + ' 把 ' + JSON.stringify(txt) + ' 当 UTF-8 字节摘要')
  }
}
{
  const bytes = H.sha256Bytes(u8('中文'))
  is(bytes.length, 32, '字节接口出 32 字节')
  is(
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
    nodeHash('sha256', u8('中文')),
    '字节接口和字符串接口对同一份 UTF-8 结果一致'
  )
  const src = u8('abc')
  const before = Array.from(src)
  H.md5Bytes(src)
  H.sha1Bytes(src)
  H.sha256Bytes(src)
  H.sha512Bytes(src)
  is(JSON.stringify(Array.from(src)), JSON.stringify(before), '四个字节接口都不改动传进来的数组')
}

/* ---------- 算法表与错误口径 ---------- */
{
  is(H.ALGOS.map((a) => a.key).join(','), 'md5,sha1,sha256,sha512', '支持四种')
  is(H.ALGOS.map((a) => a.bits).join(','), '128,160,256,512', '位数标得住')
  is(H.ALGOS.filter((a) => a.weak).map((a) => a.key).join(','), 'md5,sha1', '弱的那两个要标出来')
  ok_(H.ALGOS.every((a) => /[\u4e00-\u9fa5]/.test(a.note)), '每种算法的说法是中文')
  ok_(H.ALGOS.find((a) => a.key === 'md5').note.includes('碰撞'), 'MD5 要说清能被构造碰撞')
  ok_(H.ALGOS.find((a) => a.key === 'sha1').note.includes('碰撞'), 'SHA-1 要点出 SHAttered')
  throwsWith(() => H.hash('sha0', 'abc'), /不支持的算法/, '不认识的算法')
  throwsWith(() => H.hmac('bogus', 'k', 'm'), /不支持的算法/, 'HMAC 同理')
  throwsWith(() => H.hmacBytes('bogus', u8('k'), u8('m')), /不支持的算法/, 'HMAC 字节接口同理')
  is(H.supportsSHA512, true, 'Node 里有 BigInt，SHA-512 可用')
}

/* ---------- hashAll ---------- */
{
  const all = H.hashAll('abc')
  is(Object.keys(all).join(','), 'md5,sha1,sha256,sha512', '一次算全四种')
  is(all.md5, H.hash('md5', 'abc'), '批量与单算一致')
  is(all.sha512, H.hash('sha512', 'abc'), '批量里也有 512')
  is(H.hashAll('').sha256, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '空串的批量结果')
}

/* ---------- HMAC：以 Node 为对照 ---------- */
const nodeHmac = (algo, key, msg) => crypto.createHmac(algo, key).update(msg).digest('hex')
const HMAC_CASES = [
  ['Jefe', 'what do ya want for nothing?'],
  ['', ''],
  ['', 'empty key'],
  ['k', 'm'],
  ['密钥', '消息内容'],
  ['key', '😀'],
]
for (const [key, msg] of HMAC_CASES) {
  for (const [algo, nodeAlgo] of ALGOS) {
    is(H.hmac(algo, key, msg), nodeHmac(nodeAlgo, u8(key), u8(msg)), 'HMAC-' + algo + ' 字符串接口等于 Node')
  }
}
{
  /* RFC 2104 的两条硬规矩：长密钥先压成摘要；短密钥补零到分组长度 */
  const longKey = Buffer.alloc(200, 0x61)
  const msg = Buffer.from('Hi There', 'utf8')
  for (const [algo, nodeAlgo] of ALGOS) {
    is(
      Array.from(H.hmacBytes(algo, longKey, msg)).map((b) => b.toString(16).padStart(2, '0')).join(''),
      nodeHmac(nodeAlgo, longKey, msg),
      'HMAC-' + algo + ' 的 200 字节长密钥等于 Node'
    )
  }
  const blockKey = Buffer.alloc(64, 0x0b)
  is(
    H.hmac('sha256', blockKey.toString('latin1'), ''),
    nodeHmac('sha256', blockKey, Buffer.alloc(0)),
    '正好一个分组（64 字节）的密钥不补也不压'
  )
  const blockKey128 = Buffer.alloc(128, 0x0b)
  is(
    Array.from(H.hmacBytes('sha512', blockKey128, Buffer.alloc(0))).map((b) => b.toString(16).padStart(2, '0')).join(''),
    nodeHmac('sha512', blockKey128, Buffer.alloc(0)),
    'SHA-512 的 128 字节分组密钥'
  )
}
{
  /* 字节接口的存在理由：≥0x80 的字节不能被 UTF-8 改写 */
  const raw = Uint8Array.from([0x00, 0x01, 0xfe, 0xff, 0x80])
  const asText = String.fromCharCode.apply(null, Array.from(raw))
  const got = Array.from(H.hmacBytes('sha1', raw, raw)).map((b) => b.toString(16).padStart(2, '0')).join('')
  is(got, nodeHmac('sha1', Buffer.from(raw), Buffer.from(raw)), 'HMAC 字节接口按原始字节算')
  ok_(got !== H.hmac('sha1', asText, asText), '所以它和字符串接口不是一回事——这正是 TOTP 走字节接口的原因')
}

/* ---------- 稳定性 ---------- */
{
  const t = '同一个输入重复摘要'
  is(H.hash('sha256', t), H.hash('sha256', t), '两次结果一致（纯函数，没有内部状态漂移）')
  is(H.hmac('sha256', 'k', t), H.hmac('sha256', 'k', t), 'HMAC 同样稳')
  ok_(H.hash('sha256', t) !== H.hash('sha256', t + '！'), '改一个字节结果面目全非')
  is(H.hash('sha1', 'a') === H.hash('sha1', 'b'), false, '不同输入不撞（这一对至少）')
}

/* ---------- utf8ByteLen：界面「共 N 字节」的单一来源 ---------- */
const B = await useUtils('base64')
{
  // 分段阈值的四个边界，以及代理对
  const samples = [
    '', 'a', 'z', '\x7f', '\x80', '\u07ff', '\u0800', '\uffff', '\u{10000}', '\u{1f600}',
    '中文', '中文 abc', '😀', '😀😀', 'a😀中', '你好，随身匣', '\ud800a',
    'x'.repeat(1000), '中'.repeat(333),
  ]
  for (const s of samples) {
    is(B.utf8ByteLen(s), B.utf8Bytes(s).length, '字节数和真编码一致：' + JSON.stringify(s).slice(0, 24))
  }
  // 合法串再拿 Node 的 Buffer 撞一次；孤立代理不给它进这一环——Node 会换成替换字符，是另一套规则
  for (const s of samples.filter((x) => x !== '\ud800a')) {
    is(B.utf8ByteLen(s), Buffer.byteLength(s, 'utf8'), '与 Buffer.byteLength 一致：' + JSON.stringify(s).slice(0, 24))
  }
  is(B.utf8ByteLen('中文 abc'), 10, '两个汉字 6 + 空格 + 三个字母')
  is(B.utf8ByteLen('😀'), 4, '一个 emoji 是 4 字节，不是 2 个字符各 1')
}

console.log('== hash pass=' + ok + '/' + (ok + fail))
if (fail) process.exitCode = 1
