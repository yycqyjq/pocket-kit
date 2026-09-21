/** bases.js 自查：RFC 4648 官方向量 + Base58 已知向量 + 降级路径交叉验证 */
import { useUtils, makeTest } from '../harness.mjs'

const T = makeTest('bases')
const {
  ALPHABETS,
  encode,
  decode,
  roundTrip,
  scanInvalid,
  alphabetRows,
  encodeAll,
  hexToBytes,
  bytesToHex,
  supportsBigInt,
  B32_ALPHABET,
  B32HEX_ALPHABET,
  B58_ALPHABET,
  B62_ALPHABET,
  B64URL_ALPHABET,
  BASES_NOTES,
  BASES_SAMPLES,
} = await useUtils('bases')

/* ---------- 字母表本身 ---------- */
T.eq('Base32 字母表 32 个不重复字符', new Set(B32_ALPHABET).size, 32)
T.eq('base32hex 字母表 32 个', new Set(B32HEX_ALPHABET).size, 32)
T.eq('Base58 字母表 58 个', new Set(B58_ALPHABET).size, 58)
T.eq('Base62 字母表 62 个', new Set(B62_ALPHABET).size, 62)
T.eq('Base64url 字母表 64 个', new Set(B64URL_ALPHABET).size, 64)
T.ok('Base58 剔掉 0OIl 四个易混字符', !/[0OlI]/.test(B58_ALPHABET))
T.ok('Base58 不含小写 l', B58_ALPHABET.indexOf('l') < 0)
T.ok('Base32 只含大写字母与 2-7', /^[A-Z2-7]+$/.test(B32_ALPHABET))
T.eq('Base64url 末两位是 - 与 _', B64URL_ALPHABET.slice(62), '-_')
T.eq('字母表条目数', ALPHABETS.length, 5)
T.eq('当前环境有 BigInt', supportsBigInt, true)

/* ---------- RFC 4648 §10 官方 Base32 向量 ---------- */
const rfc32 = [['', ''], ['f', 'MY======'], ['fo', 'MZXQ===='], ['foo', 'MZXW6==='], ['foob', 'MZXW6YQ='], ['fooba', 'MZXW6YTB'], ['foobar', 'MZXW6YTBOI======']]
let r32bad = []
for (const [plain, enc] of rfc32) {
  if (encode(plain, 'base32') !== enc) r32bad.push(plain + '→' + encode(plain, 'base32'))
  if (decode(enc, 'base32').text !== plain) r32bad.push(enc + '→' + JSON.stringify(decode(enc, 'base32').text))
}
T.eq('RFC 4648 Base32 七组向量正反', r32bad.join(' ; '), '')
T.eq('base32hex 换表不换分组', encode('foobar', 'base32hex'), 'CPNMUOJ1E8======')
T.eq('base32hex 反解', decode('CPNMUOJ1E8======', 'base32hex').text, 'foobar')
T.eq('不补 = 的 Base32', encode('foobar', 'base32', { pad: false }), 'MZXW6YTBOI')
T.eq('Base32 大小写不敏感', decode('mzxw6ytboi', 'base32').text, 'foobar')
T.eq('Base32 忽略换行空白', decode('MZXW6Y\nTBOI ======', 'base32').text, 'foobar')

/* ---------- Base64url ---------- */
T.eq('RFC 4648 Base64url foobar', encode('foobar', 'base64url'), 'Zm9vYmFy')
T.eq('fb ff → -_8（+ / 已替换）', encode(hexToBytes('fbff'), 'base64url'), '-_8')
T.eq('反解 -_8', decode('-_8', 'base64url').hex, 'fbff')
T.eq('标准 Base64 的 + / 也认', decode('+/8=', 'base64url').hex, 'fbff')
T.eq('base64url 反解文本', decode('Zm9vYmFy', 'base64url').text, 'foobar')
T.eq('空串编解码', [encode('', 'base64url'), decode('', 'base64url').byteLen].join('|'), '|0')

/* ---------- Base58（Bitcoin 已知向量） ---------- */
T.eq('Base58 "Hello World!"', encode('Hello World!', 'base58'), '2NEpo7TZRRrLZSi2U')
T.eq('Base58 反解 "Hello World!"', decode('2NEpo7TZRRrLZSi2U', 'base58').text, 'Hello World!')
T.eq('Base58 "test"', encode('test', 'base58'), '3yZe7d')
T.eq('前导零逐字节写成 1', encode(hexToBytes('00000001'), 'base58'), '1112')
T.eq('反解 1112 找回前导零', decode('1112', 'base58').hex, '00000001')
T.eq('全零字节', encode(hexToBytes('0000'), 'base58'), '11')
T.eq('单零字节', [encode(hexToBytes('00'), 'base58'), decode('1', 'base58').hex].join('|'), '1|00')
T.eq('空字节 → 空串', encode(new Uint8Array(0), 'base58'), '')
/* 手算可验证的小大数：58 = 1*58+0 → "21"；255 = 4*58+23，商 4 余 23 → 下标 4 是字符 5，下标 23 是 Q → "5Q" */
T.eq('Base58 0x3a → 21', encode(new Uint8Array([0x3a]), 'base58'), '21')
T.eq('Base58 0xff → 5Q', encode(new Uint8Array([0xff]), 'base58'), '5Q')

/** 独立参考实现（测试文件内另写一遍 BigInt 长除，与 utils 无关） */
function refBase(hex, alphabet) {
  const bytes = []
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16))
  let n = 0n
  for (const b of bytes) n = n * BigInt(256) + BigInt(b)
  const radix = BigInt(alphabet.length)
  let zeros = 0
  for (const b of bytes) { if (b === 0) zeros++; else break }
  let s = ''
  while (n > 0n) { s = alphabet[Number(n % radix)] + s; n /= radix }
  return alphabet[0].repeat(zeros) + s
}
T.eq('Base58 20 字节公钥哈希（与参考实现一致）', encode(hexToBytes('00010966bcfdc97ffd02eff598bb8a4ba864ecd30d'), 'base58'), refBase('00010966bcfdc97ffd02eff598bb8a4ba864ecd30d', B58_ALPHABET))
T.eq('Base58 32 字节私钥（与参考实现一致）', encode(hexToBytes('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'), 'base58'), refBase('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', B58_ALPHABET))
T.eq('Base62 同一大数（与参考实现一致）', encode(hexToBytes('00010966bcfdc97ffd02eff598bb8a4ba864ecd30d'), 'base62'), refBase('00010966bcfdc97ffd02eff598bb8a4ba864ecd30d', B62_ALPHABET))

/* ---------- Base62 ---------- */
T.eq('Base62 前导零写成 0', encode(hexToBytes('0031'), 'base62'), '0n')
T.eq('Base62 反解', decode('0n', 'base62').hex, '0031')
T.eq('Base62 单字节 255 → 47', encode(new Uint8Array([255]), 'base62'), '47')
T.eq('Base62 反解 47', decode('47', 'base62').hex, 'ff')
T.eq('Base62 中文往返', decode(encode('随身匣', 'base62'), 'base62').text, '随身匣')

/* ---------- 降级路径（无 BigInt）交叉验证 ---------- */
const longHex = '00' + 'de0f6c5a8b3e9f77c2d1e0f1a2b3c4d5e6f70819' 
let softBad = []
for (const key of ['base58', 'base62']) {
  for (const src of ['', '00', '0000', '0102030405060708090a0b0c0d0e0f', longHex, 'ffffffffffffffffffffffffffffffff']) {
    const b = hexToBytes(src)
    const fast = encode(b, key)
    const slow = encode(b, key, { noBigInt: true })
    if (fast !== slow) softBad.push(key + '/' + src + ' → ' + fast + ' vs ' + slow)
    if (decode(fast, key).hex !== bytesToHex(b)) softBad.push(key + ' 反解 ' + src + ' → ' + decode(fast, key).hex)
    if (decode(fast, key, { noBigInt: true }).hex !== bytesToHex(b)) softBad.push(key + ' 降级反解 ' + src + ' → ' + decode(fast, key, { noBigInt: true }).hex)
  }
}
T.eq('BigInt 与长除法降级结果一致（含反解）', softBad.join(' ; '), '')

/* ---------- 往返（全部字母表 × 多种输入） ---------- */
const rtBad = []
for (const a of ALPHABETS) {
  for (const t of ['', 'a', 'ab', 'abc', 'abcd', 'abcde', '随身匣🧰工具箱', String.fromCharCode(0, 1, 255)]) {
    const r = roundTrip(t, a.key)
    if (!r.same || r.issues.length) rtBad.push(a.key + ' ' + JSON.stringify(t) + ' → ' + r.hex + ' ' + r.issues.join('/'))
  }
}
T.eq('五种编码 × 九种输入 全部往返一致', rtBad.join(' ; '), '')

/* ---------- 非法字符定位 ---------- */
const oneBad = decode('MZXW6YTBOI!', 'base32')
T.ok('Base32 第 11 个字符被点名', oneBad.issues.some((i) => /第 11 个字符「!」/.test(i)))
T.ok('Base32 里出现 1 会说明只用 2-7', decode('11111111', 'base32').issues.some((i) => /只用 2-7/.test(i)))
T.eq('Base32 余 1 个字符不可能', decode('M', 'base32').issues.length > 0, true)
T.ok('Base64url 余 1 报错', decode('Z', 'base64url').issues.some((i) => /不可能由完整字节/.test(i)))
T.ok('非规范补位被指出', decode('MZXW6YTBOJ', 'base32').issues.some((i) => /不是 0/.test(i)))
T.ok('= 之后还有内容被指出', decode('MY=Z', 'base32').issues.some((i) => /填充只能放在最末尾/.test(i)))
T.ok('Base58 里的 0 有专门提示', decode('0OIl', 'base58').issues.some((i) => /Base58 剔掉了/.test(i)))
T.eq('Base58 合法字符数为 0 时不报错', decode('', 'base58').byteLen, 0)
T.eq('scanInvalid 找出两个非法字符', scanInvalid('MZXW6!=(', 'base32').bad.map((b) => b.ch + '@' + b.index).join(','), '!@6,(@8')
T.eq('scanInvalid 对合法串说 ok', scanInvalid('MZXW6YTBOI======', 'base32').ok, true)
T.eq('scanInvalid 放行 Base32 小写', scanInvalid('mzxw6ytboi', 'base32').ok, true)
T.eq('scanInvalid 对 Base58 标出行号', scanInvalid('abc\n1O', 'base58').bad[0].line, 2)
T.eq('未知编码名报中文错', (() => { try { encode('x', 'base99'); return 'no-throw' } catch (e) { return /未知的编码/.test(e.message) } })(), true)

/* ---------- 非 UTF-8 字节 ---------- */
const notText = decode(encode(hexToBytes('fffe'), 'base32'), 'base32')
T.eq('非文本字节仍能给出十六进制', notText.hex, 'fffe')
T.eq('非文本字节 textOk=false', notText.textOk, false)
T.ok('非文本字节有中文提示', notText.issues.some((i) => /不是合法 UTF-8/.test(i)))
/* UTF-8 合法性的四种坑（RFC 3629）：过长编码 / 代理区 / 截断 / 超范围 */
T.eq('过长编码 C0 80 判非法', decode(encode(hexToBytes('c080'), 'base64url'), 'base64url').textOk, false)
T.eq('代理区 ED A0 80 判非法', decode(encode(hexToBytes('eda080'), 'base64url'), 'base64url').textOk, false)
T.eq('截断的 F0 9F 判非法', decode(encode(hexToBytes('f09f'), 'base64url'), 'base64url').textOk, false)
T.eq('超范围 F5 80 80 80 判非法', decode(encode(hexToBytes('f5808080'), 'base64url'), 'base64url').textOk, false)
T.eq('四字节 emoji 判合法', decode(encode('🧰', 'base64url'), 'base64url').text, '🧰')
T.eq('两字节中文判合法', decode(encode('匣', 'base32'), 'base32').text, '匣')

/* ---------- matchesInput（页面「重新编码是否等于输入」） ---------- */
T.eq('规范写法 matchesInput=true', decode('MZXW6YTBOI======', 'base32').matchesInput, true)
T.eq('省略填充仍算等于输入', decode('MZXW6YTBOI', 'base32').matchesInput, true)
T.eq('小写 Base32 算等于输入', decode('mzxw6ytboi', 'base32').matchesInput, true)
T.eq('标准 Base64 写法在 base64url 下算等于', decode('+/8=', 'base64url').matchesInput, true)
T.eq('有非法字符时 matchesInput=false', decode('MZXW6YTBO!', 'base32').matchesInput, false)
T.eq('= 放在中间时 matchesInput=false', decode('MY=Z', 'base32').matchesInput, false)

/* ---------- 辅助输出 ---------- */
const rows = alphabetRows('base32')
T.eq('Base32 字母表分两行', rows.rows.length, 2)
T.eq('首格是 A=0', [rows.rows[0].cells[0].ch, rows.rows[0].cells[0].index].join('='), 'A=0')
T.eq('末格是 7=31', (() => { const last = rows.rows[1].cells[rows.rows[1].cells.length - 1]; return last.ch + '=' + last.index })(), '7=31')
T.eq('encodeAll 给全五种', encodeAll('Hi').length, 5)
T.ok('encodeAll 每一项都有值', encodeAll('Hi').every((x) => x.value.length > 0))
T.eq('样例都能编', BASES_SAMPLES.every((s) => encode(s.hex ? hexToBytes(s.hex) : s.text, 'base58') !== undefined), true)
T.ok('说明条目 ≥ 4', BASES_NOTES.length >= 4)
T.eq('十六进制互逆', bytesToHex(hexToBytes('De:Ad-BE EF')), 'deadbeef')
T.throws('奇数十六进制报错', () => hexToBytes('abc'))

T.done()
