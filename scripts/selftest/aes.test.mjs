/**
 * 自查：AES 逻辑层（临时文件，跑完删）
 * 顺序：先用系统 openssl 当判官（最硬的外部参照），再跑 utils 自带 selfTest，最后补边界。
 */
import { execFileSync } from 'node:child_process'
import { useUtils, makeTest } from './harness.mjs'

const aes = await useUtils('aes')
const { selfTest, aesEncrypt, aesDecrypt, deriveKey, fromHex, randomHex, pkcs7Pad, VECTORS } = aes
const T = makeTest('aes.js')

/* ---------- 0) openssl 判官 ---------- */
function osslRaw(flag, keyHex, ivHex, dataHex) {
  const args = ['enc', flag, '-K', keyHex]
  if (ivHex) args.push('-iv', ivHex)
  args.push('-nopad')
  return execFileSync('openssl', args, { input: Buffer.from(dataHex, 'hex'), maxBuffer: 1 << 24 }).toString('hex')
}
function osslPadded(flag, keyHex, ivHex, text) {
  const args = ['enc', flag, '-K', keyHex]
  if (ivHex) args.push('-iv', ivHex)
  args.push('-nosalt')
  return execFileSync('openssl', args, { input: Buffer.from(text, 'utf8'), maxBuffer: 1 << 24 }).toString('hex')
}
console.log('== openssl 判官 ==')
for (const [name, key, pt, want] of [
  ['FIPS-197 §5.2', '2b7e151628aed2a6abf7158809cf4f3c', '3243f6a8885a308d313198a2e0370734', '3925841d02dc09fbdc118597196a0b32'],
  ['SP800-38A F.1.1 b1', '2b7e151628aed2a6abf7158809cf4f3c', '6bc1bee22e409f96e93d7e117393172a', '3ad77bb40d7a3660a89ecaf32466ef97'],
  ['FIPS-197 C.1', '000102030405060708090a0b0c0d0e0f', '00112233445566778899aabbccddeeff', '69c4e0d86a7b0430d8cdb78070b4c55a'],
]) {
  const mine = aesEncrypt({ algo: 'aes-128', mode: 'ecb', keyType: 'hex', key, input: pt, inputType: 'hex' }).blocks[0].outputHex
  let ref
  try {
    ref = osslRaw('-aes-128-ecb', key, '', pt)
  } catch (e) {
    ref = 'openssl 失败:' + e.message.slice(0, 60)
  }
  console.log('  ' + name + '\n    mine ' + mine + '\n    ossl ' + ref + '\n    spec ' + want)
  T.ok('openssl ECB · ' + name, mine === ref && ref === want, mine + ' / ' + ref + ' / ' + want)
}
for (const [flag, algo, keyHex] of [
  ['-aes-128-cbc', 'aes-128', '11'.repeat(16)],
  ['-aes-192-cbc', 'aes-192', '11'.repeat(24)],
  ['-aes-256-cbc', 'aes-256', '11'.repeat(32)],
  ['-aes-128-ecb', 'aes-128', '11'.repeat(16)],
  ['-aes-192-ecb', 'aes-192', '11'.repeat(24)],
  ['-aes-256-ecb', 'aes-256', '11'.repeat(32)],
]) {
  const mode = flag.includes('cbc') ? 'cbc' : 'ecb'
  const text = 'openssl 交叉验证 — 3 blocks of data!!'
  const ivHex = mode === 'cbc' ? '22'.repeat(16) : ''
  T.calc('openssl ' + flag + ' 整块密文一致（含 PKCS#7）', () => {
    const ref = osslPadded(flag, keyHex, ivHex, text)
    const mine = aesEncrypt({ algo, mode, keyType: 'hex', key: keyHex, iv: ivHex, input: text })
    return mine.outputHex === ref ? true : 'mine=' + mine.outputHex + ' ossl=' + ref
  }, true)
  T.calc('openssl ' + flag + ' 密文可被我方解开', () => {
    const ref = osslPadded(flag, keyHex, ivHex, text)
    return aesDecrypt({ algo, mode, keyType: 'hex', key: keyHex, iv: ivHex, input: ref, inputType: 'hex' }).plainText === text
  }, true)
}

/* ---------- 1) 内置 selfTest ---------- */
try {
  const st = selfTest()
  for (const r of st.results) T.ok('selfTest · ' + r.name, r.ok, '期望 ' + r.expected + '，实际 ' + r.actual)
  console.log('== 内置 selfTest: ' + st.pass + '/' + st.total + ' ==')
} catch (e) {
  T.ok('selfTest 未抛异常', false, e.message)
}

/* ---------- 2) 边界 ---------- */
const uni = '🔐 随身匣 — ünïcödé\n\t多行 with symbols #[]{}<>&'
T.calc('unicode + 换行往返', () => {
  const e1 = aesEncrypt({ algo: 'aes-256', mode: 'cbc', keyType: 'hex', key: '11'.repeat(32), iv: '22'.repeat(16), input: uni })
  return aesDecrypt({ algo: 'aes-256', mode: 'cbc', keyType: 'hex', key: '11'.repeat(32), iv: e1.ivHex, input: e1.outputBase64, inputType: 'base64' }).plainText
}, uni)
T.calc('明文 1 块 + 1 字节 → 补 15', () => {
  return aesEncrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '11'.repeat(16), iv: '22'.repeat(16), input: 'a'.repeat(17) }).padBytes
}, 15)
T.calc('70000 字节往返', () => {
  const eb = aesEncrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '33'.repeat(16), iv: '44'.repeat(16), input: 'Q'.repeat(70000) })
  return aesDecrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '33'.repeat(16), iv: eb.ivHex, input: eb.outputBase64, inputType: 'base64' }).plainText.length
}, 70000)
T.throws('超过 20 万字节拒绝', () => aesEncrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '33'.repeat(16), input: 'x'.repeat(200001) }), /上限/)
T.throws('明文为空报错', () => aesEncrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '33'.repeat(16), input: '' }), /空的/)
T.throws('十六进制含非法字符', () => fromHex('deadBeef zz'), /非法字符/)
T.throws('十六进制奇数位', () => fromHex('abc'), /奇数/)
T.throws('AES-256 只给 16 字节密钥', () => aesEncrypt({ algo: 'aes-256', mode: 'cbc', keyType: 'hex', key: '11'.repeat(16), input: 'a' }), /64 个十六进制字符/)
T.throws('未知算法', () => aesEncrypt({ algo: 'aes-512', mode: 'cbc', keyType: 'hex', key: '11'.repeat(32), input: 'a' }), /不支持的密钥长度/)
T.throws('GCM 明确不支持', () => aesEncrypt({ algo: 'aes-128', mode: 'gcm', keyType: 'hex', key: '11'.repeat(16), input: 'a' }), /CBC 与 ECB/)
T.throws('CBC 解密漏 IV（勾了随机 IV 也算漏）', () => aesDecrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '11'.repeat(16), iv: '00'.repeat(16), ivAuto: true, input: 'AAAAAAAAAAAAAAAAAAAAAA==', inputType: 'base64' }), /IV/)
T.throws('CBC 解密完全没填 IV', () => aesDecrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '11'.repeat(16), input: 'AAAAAAAAAAAAAAAAAAAAAA==', inputType: 'base64' }), /IV/)
// CBC 的 IV 只参与首个块的异或，IV 错并不会撞上末尾的填充校验，
// 而是静默地把首块 16 字节搞乱、其余块照常 —— 所以「漏 IV」只能在入口处直接报错。
T.calc('错 IV 只乱首块，后面的块照常解出来', () => {
  const enc = aesEncrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '11'.repeat(16), iv: '22'.repeat(16), input: 'hello world 1234good luck!' })
  const d = aesDecrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '11'.repeat(16), iv: '33'.repeat(16), input: enc.outputBase64, inputType: 'base64' })
  return d.plainHex.slice(32) === '676f6f64206c75636b21' && d.plainHex.slice(0, 32) !== '68656c6c6f20776f726c642031323334'
}, true)
T.throws('未知派生哈希', () => deriveKey('a', { hash: 'whirlpool' }), /不支持的派生哈希/)
T.eq('派生轮数下限', deriveKey('a', { keyBytes: 16, iterations: 0 }).iterations, 5000)
T.eq('派生轮数上限', deriveKey('a', { keyBytes: 16, iterations: 99999999 }).iterations, 200000)
T.calc('ECB 暴露重复明文块', () => {
  const r = aesEncrypt({ algo: 'aes-128', mode: 'ecb', keyType: 'hex', key: '11'.repeat(16), input: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })
  return r.blocks[0].outputHex === r.blocks[1].outputHex
}, true)
T.calc('CBC 随机 IV 使密文不同', () => {
  const a1 = aesEncrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '11'.repeat(16), input: 'same-plaintext' })
  const b1 = aesEncrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '11'.repeat(16), input: 'same-plaintext' })
  return a1.outputHex !== b1.outputHex
}, true)
T.calc('二进制明文标为不可打印', () => {
  const enc = aesEncrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '11'.repeat(16), iv: '22'.repeat(16), input: '000102030405060708ff', inputType: 'hex' })
  return aesDecrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '11'.repeat(16), iv: enc.ivHex, input: enc.outputBase64, inputType: 'base64' }).printable
}, false)
T.calc('密文自动识别 Base64 与十六进制', () => {
  const enc = aesEncrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '11'.repeat(16), input: 'auto detect' })
  const x1 = aesDecrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '11'.repeat(16), iv: enc.ivHex, input: enc.outputBase64 }).plainText
  const x2 = aesDecrypt({ algo: 'aes-128', mode: 'cbc', keyType: 'hex', key: '11'.repeat(16), iv: enc.ivHex, input: enc.outputHex }).plainText
  return x1 === 'auto detect' && x2 === 'auto detect'
}, true)
T.calc('口令派生固定盐往返', () => {
  const enc = aesEncrypt({ algo: 'aes-256', mode: 'cbc', keyType: 'pass', key: '口令 abc', saltHex: '0a0b', iterations: 50, input: 'hello' })
  return aesDecrypt({ algo: 'aes-256', mode: 'cbc', keyType: 'pass', key: '口令 abc', saltHex: '0a0b', iterations: 50, iv: enc.ivHex, input: enc.outputBase64, inputType: 'base64' }).plainText
}, 'hello')
T.eq('NIST 向量条数 >= 7', VECTORS.length >= 7, true)
T.eq('随机 IV 字符数', randomHex(16).length, 32)
T.eq('空输入的填充长度', pkcs7Pad(new Uint8Array(0)).length, 16)

T.done()
