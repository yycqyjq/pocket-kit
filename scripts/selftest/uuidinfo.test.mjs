/**
 * uuidinfo.js 自查断言（直接测 src/utils/uuidinfo.js 本体）
 * ------------------------------------------------------------
 * 判据分四类：
 *   1) 外部裁判：node:crypto 的 randomUUID() 生成的必是 v4，解析结果必须与之吻合；
 *      版本位另用「字符串第 13 个十六进制位」独立读一遍，不抄实现的字节移位；
 *   2) 已知向量：RFC 4122 的版本位（第 7 字节高 4 位）与变体位（第 9 字节高位模式）；
 *      v1 示例 c232ab00-9414-11ec-… 解析出 2022-02-22T19:22:22.000Z，且它的 v6 重排
 *      1ec9414c-232a-6b00-… 必须落在同一毫秒；v7 前 48 位即毫秒时间戳，用 BigInt 独立算；
 *   3) 往返性质：canonical 去连字符 == compact，upper == canonical 大写，bytes 与
 *      字符串十六进制逐字节一致；
 *   4) 边界与反例：全零/全 F、花括号与 urn 写法、大小写、缺位/非十六进制必须拒。
 */
import { useUtils, makeTest } from './harness.mjs'
import { randomUUID } from 'node:crypto'

const U = await useUtils('uuidinfo')
const T = makeTest('uuidinfo')

const compactOf = (uuid) => uuid.replace(/[-{}]/g, '').replace(/^urn:uuid:/i, '').toLowerCase()
const hexAt = (uuid, i) => parseInt(compactOf(uuid)[i], 16)

/* ---------- 1. v4（外部裁判：crypto.randomUUID 必是 v4） ---------- */
for (let i = 0; i < 5; i++) {
  const r = U.parseUuid(randomUUID())
  T.eq('crypto v4 版本 ' + i, r.version, 4)
  T.eq('crypto v4 变体 ' + i, r.variant, 'RFC 4122 标准变体')
  T.eq('crypto v4 known ' + i, r.known, true)
  T.eq('crypto v4 无时间 ' + i, r.time, null)
}

/* ---------- 2. 版本位独立读法 ---------- */
for (const s of U.UUID_SAMPLES) {
  T.eq('版本位 ' + s.name, U.parseUuid(s.value).version, hexAt(s.value, 12))
}
T.eq('样例表 5 条', U.UUID_SAMPLES.length, 5)
T.ok('样例都能解析', U.UUID_SAMPLES.every((s) => { try { U.parseUuid(s.value); return true } catch (e) { return false } }))

/* ---------- 3. canonical / compact / upper / bytes 一致性 ---------- */
const base = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
const v4 = U.parseUuid('F47AC10B-58CC-4372-A567-0E02B2C3D479')
T.eq('canonical 小写带连字符', v4.canonical, base)
T.eq('upper 大写', v4.upper, 'F47AC10B-58CC-4372-A567-0E02B2C3D479')
T.eq('compact 无连字符', v4.compact, 'f47ac10b58cc4372a5670e02b2c3d479')
T.eq('bytes 16 个', v4.bytes.length, 16)
T.ok('bytes 与字符串逐字节一致', v4.bytes.every((b, i) => b === parseInt(v4.compact.slice(i * 2, i * 2 + 2), 16)))
T.eq('canonical 去连字符 = compact', v4.canonical.replace(/-/g, ''), v4.compact)

/* ---------- 4. 花括号 / urn / 无连字符 / 空格 ---------- */
T.eq('花括号写法', U.parseUuid('{' + base + '}').canonical, base)
T.eq('urn 写法', U.parseUuid('urn:uuid:' + base).canonical, base)
T.eq('无连字符写法', U.parseUuid(base.replace(/-/g, '')).canonical, base)
T.eq('前后空格被裁掉', U.parseUuid('  ' + base + '  ').canonical, base)
T.eq('input 保留去空格原样', U.parseUuid('  ' + base + '  ').input, base)

/* ---------- 5. v1：已知时间戳（RFC 4122 起算 1582-10-15） ---------- */
const v1 = U.parseUuid('c232ab00-9414-11ec-b3c8-9f6bdeced846')
T.eq('v1 版本', v1.version, 1)
T.eq('v1 变体', v1.variant, 'RFC 4122 标准变体')
T.eq('v1 版本名', v1.versionName, 'v1 时间戳 + MAC')
T.eq('v1 时间（已知向量）', v1.time.toISOString(), '2022-02-22T19:22:22.000Z')
T.eq('v1 节点 = 后 6 字节 MAC', v1.node, '9F:6B:DE:CE:D8:46')
T.eq('v1 时钟序列', v1.clockSeq, '13256')
T.ok('v1 时间说明', v1.timeNote.indexOf('v1') > -1)
const c1 = compactOf('c232ab00-9414-11ec-b3c8-9f6bdeced846')
const tLow = BigInt('0x' + c1.slice(0, 8))
const tMid = BigInt('0x' + c1.slice(8, 12))
const tHi = BigInt('0x' + c1.slice(12, 16)) & 0xfffn
const ticks = (tHi << 48n) | (tMid << 32n) | tLow
T.eq('v1 按 RFC 公式 BigInt 复算', v1.time.getTime(), Number(ticks / 10000n) - 12219292800000)

/* ---------- 6. v6：同一时间戳的重排写法 ---------- */
const v6 = U.parseUuid('1ec9414c-232a-6b00-b3c8-9f6bdeced846')
T.eq('v6 版本', v6.version, 6)
T.eq('v6 时间与 v1 相同', v6.time.getTime(), v1.time.getTime())
T.ok('v6 时间说明', v6.timeNote.indexOf('v6') > -1)
T.eq('v6 变体', v6.variant, 'RFC 4122 标准变体')

/* ---------- 7. v7：前 48 位即毫秒时间戳（BigInt 独立算） ---------- */
const v7 = U.parseUuid('018f2c9e-1a2b-7c3d-8e4f-5a6b7c8d9e0f')
T.eq('v7 版本', v7.version, 7)
T.eq('v7 时间 = 前 48 位', v7.time.getTime(), Number(BigInt('0x' + compactOf('018f2c9e-1a2b-7c3d-8e4f-5a6b7c8d9e0f').slice(0, 12))))
T.eq('v7 年份', v7.time.getUTCFullYear(), 2024)
T.ok('v7 时间说明', v7.timeNote.indexOf('前 48 位') > -1)

/* ---------- 8. v3 / v5（RFC 4122 命名空间示例） ---------- */
const v3 = U.parseUuid('6fa459ea-ee8a-3ca4-894e-db77e160355e')
T.eq('v3 版本', v3.version, 3)
T.eq('v3 版本名', v3.versionName, 'v3 MD5 命名空间')
T.eq('v3 无时间', v3.time, null)
T.eq('v5 版本', U.parseUuid('886313e1-3b8a-5372-9b90-0c9aee199e5d').version, 5)

/* ---------- 9. 变体（第 9 字节高位模式） ---------- */
T.eq('NCS 变体', U.parseUuid('00000000-0000-4000-0000-000000000000').variant, 'NCS 向后兼容（已废弃）')
T.eq('微软 GUID 变体', U.parseUuid('00000000-0000-4000-c000-000000000000').variant, '微软 GUID 变体')
T.eq('保留变体', U.parseUuid('ffffffff-ffff-ffff-ffff-ffffffffffff').variant, '保留（未来使用）')

/* ---------- 10. 全零 / 全 F ---------- */
const nil = U.parseUuid('00000000-0000-0000-0000-000000000000')
T.eq('全零 isNil', nil.isNil, true)
T.eq('全零 isMax', nil.isMax, false)
T.ok('全零给告警', nil.warnings.length === 1 && nil.warnings[0].indexOf('全零') > -1)
T.eq('全零版本 0', nil.version, 0)
T.eq('全零不是已知版本', nil.known, false)
const max = U.parseUuid('ffffffff-ffff-ffff-ffff-ffffffffffff')
T.eq('全 F isMax', max.isMax, true)
T.eq('全 F isNil', max.isNil, false)
T.eq('普通 UUID 无告警', v4.warnings.length, 0)

/* ---------- 11. 反例 ---------- */
T.throws('非十六进制', () => U.parseUuid('not-a-uuid'), /看起来不是 UUID/)
T.throws('缺位', () => U.parseUuid('f47ac10b-58cc-4372-a567-0e02b2c3d47'), /31 位/)
T.throws('空串', () => U.parseUuid(''), /看起来不是 UUID/)
T.throws('太短', () => U.parseUuid('abcd'), /看起来不是 UUID/)

T.done()
