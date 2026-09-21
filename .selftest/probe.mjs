/** 定位用探针（临时）：三方对照 —— 我的实现 / 记忆中的标准值 / openssl */
import { execFileSync } from 'node:child_process'
import { useUtils } from './harness.mjs'
const a = await useUtils('aes')

function ecb1(key, ptHex) {
  const r = a.aesEncrypt({ algo: 'aes-128', mode: 'ecb', keyType: 'hex', key, input: ptHex, inputType: 'hex' })
  return r.blocks[0].outputHex
}
function osslEcb(key, ptHex) {
  return execFileSync('openssl', ['enc', '-aes-128-ecb', '-K', key, '-nopad'], { input: Buffer.from(ptHex, 'hex') }).toString('hex')
}

const cases = [
  ['FIPS-197 §5.2', '2b7e151628aed2a6abf7158809cf4f3c', '3243f6a8885a308d313198a2e0370734', '3925841d02dc09fbdc118597196a0b32'],
  ['SP800-38A F.1.1 b1', '2b7e151628aed2a6abf7158809cf4f3c', '6bc1bee22e409f96e93d7e117393172a', '3ad77bb40d7a3660a89ecdf346ef7e22'],
  ['FIPS-197 C.1', '000102030405060708090a0b0c0d0e0f', '00112233445566778899aabbccddeeff', '69c4e0d86a7b0430d8cdb78070b4c55a'],
  ['随机', '730f1d1d1d1d1d1d1d1d1d1d1d1d1d1d', '55aa55aa55aa55aa55aa55aa55aa55aa', ''],
]
for (const [name, key, pt, want] of cases) {
  console.log(name, '\n  mine  ', ecb1(key, pt), '\n  ossl  ', osslEcb(key, pt), want ? '\n  spec  ' + want : '')
}
