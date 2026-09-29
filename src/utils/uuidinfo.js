/**
 * UUID 解析
 * 从 UUID 本身能读出版本、变体，v1/v6/v7 还能读出生成时间
 */

const hex = (n, pad) => n.toString(16).toUpperCase().padStart(pad, '0')

const VERSIONS = {
  1: { name: 'v1 时间戳 + MAC', note: '用时间与网卡 MAC 生成，能反推生成时间与机器，隐私性差，已不推荐' },
  2: { name: 'v2 DCE 安全', note: '很少见，实际几乎没人用' },
  3: { name: 'v3 MD5 命名空间', note: '由命名空间 + 名称做 MD5 得到，同样的输入永远得到同样的 UUID' },
  4: { name: 'v4 随机', note: '122 位随机，最常用。不可反推，适合绝大多数场景' },
  5: { name: 'v5 SHA-1 命名空间', note: '和 v3 同理，只是换成 SHA-1，碰撞概率更低' },
  6: { name: 'v6 重排时间戳', note: '把 v1 的时间戳挪到高位，让 UUID 按时间有序，同时避免 MAC 泄露' },
  7: { name: 'v7 时间有序', note: '前 48 位是毫秒时间戳，天然按生成时间排序，做数据库主键很合适' },
  8: { name: 'v8 自定义', note: '格式由实现自己定，前 48 位常放时间' },
}

/** 把 UUID 拆成 16 字节 */
function toBytes(uuid) {
  const s = String(uuid).trim().toLowerCase().replace(/^\{|\}$/g, '').replace(/^urn:uuid:/, '')
  const hexStr = s.replace(/-/g, '')
  if (!/^[0-9a-f]{32}$/.test(hexStr)) {
    if (!/^[0-9a-f-]{8,36}$/.test(s)) throw new Error('看起来不是 UUID：应该由十六进制字符与连字符组成')
    throw new Error('UUID 应该是 32 位十六进制（分 5 段：8-4-4-4-12），当前去掉连字符后有 ' + hexStr.length + ' 位')
  }
  const bytes = []
  for (let i = 0; i < 32; i += 2) bytes.push(parseInt(hexStr.slice(i, i + 2), 16))
  return { bytes, canonical: fmt(bytes) }
}

function fmt(b) {
  const h = b.map((x) => hex(x, 2).toLowerCase()).join('')
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20)
}

/** v1：60 位时间戳 = 100ns 间隔，从 1582-10-15 起算 */
function timeFromV1(bytes) {
  const hi = ((bytes[6] & 0x0f) << 8) | bytes[7]
  const mid = (bytes[4] << 8) | bytes[5]
  const lo = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]
  // 用 BigInt 避免 60 位精度丢失。
  // 注意：BigInt 没有无符号右移 >>>，要先把 Number 转成无符号再转 BigInt
  const ticks = (BigInt(hi) << 48n) | (BigInt(mid) << 32n) | BigInt(lo >>> 0)
  const unixMs = Number(ticks / 10000n) - 12219292800000
  return new Date(unixMs)
}

/** v6：时间戳在高位，同样是 100ns 精度 */
function timeFromV6(bytes) {
  const hi = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]
  const mid = (bytes[4] << 8) | bytes[5]
  const lo = ((bytes[6] & 0x0f) << 8) | bytes[7]
  const ticks = (BigInt(hi >>> 0) << 28n) | (BigInt(mid) << 12n) | BigInt(lo)
  const unixMs = Number(ticks / 10000n) - 12219292800000
  return new Date(unixMs)
}

/** v7：前 48 位是毫秒时间戳 */
function timeFromV7(bytes) {
  const ms = (BigInt(bytes[0]) << 40n) | (BigInt(bytes[1]) << 32n) | (BigInt(bytes[2]) << 24n) |
    (BigInt(bytes[3]) << 16n) | (BigInt(bytes[4]) << 8n) | BigInt(bytes[5])
  return new Date(Number(ms))
}

function variantOf(bytes) {
  const b = bytes[8]
  if ((b & 0x80) === 0) return 'NCS 向后兼容（已废弃）'
  if ((b & 0xc0) === 0x80) return 'RFC 4122 标准变体'
  if ((b & 0xe0) === 0xc0) return '微软 GUID 变体'
  return '保留（未来使用）'
}

/** 解析 */
export function parseUuid(input) {
  const { bytes, canonical } = toBytes(input)
  const version = (bytes[6] >> 4) & 0x0f
  const variant = variantOf(bytes)
  const info = VERSIONS[version] || { name: 'v' + version + ' 未知版本', note: '不在 RFC 4122 定义的范围内' }

  let time = null
  let timeNote = ''
  if (version === 1) {
    time = timeFromV1(bytes)
    timeNote = 'v1 用的是生成时刻的时间戳'
  } else if (version === 6) {
    time = timeFromV6(bytes)
    timeNote = 'v6 把时间戳重排到了高位'
  } else if (version === 7) {
    time = timeFromV7(bytes)
    timeNote = 'v7 的前 48 位就是毫秒级 Unix 时间戳'
  }

  const known = [1, 3, 4, 5, 6, 7, 8].indexOf(version) > -1

  return {
    input: String(input).trim(),
    canonical,
    compact: bytes.map((x) => hex(x, 2).toLowerCase()).join(''),
    upper: canonical.toUpperCase(),
    bytes,
    version,
    versionName: info.name,
    versionNote: info.note,
    variant,
    time,
    timeNote,
    isNil: bytes.every((b) => b === 0),
    isMax: bytes.every((b) => b === 255),
    known,
    warnings: isNil(input) ? ['全零 UUID，通常表示「没有值」'] : [],
    // v1 里含 MAC，可以读出节点
    node: version === 1 ? bytes.slice(10).map((x) => hex(x, 2)).join(':') : null,
    clockSeq: version === 1 ? (((bytes[8] & 0x3f) << 8) | bytes[9]).toString() : null,
  }
}

function isNil(s) {
  return /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(String(s).trim().toLowerCase())
}

export const UUID_SAMPLES = [
  { name: 'v4 随机（最常用）', value: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' },
  { name: 'v1 带时间戳', value: 'c232ab00-9414-11ec-b3c8-9f6bdeced846' },
  { name: 'v7 时间有序', value: '018f2c9e-1a2b-7c3d-8e4f-5a6b7c8d9e0f' },
  { name: '全零 UUID', value: '00000000-0000-0000-0000-000000000000' },
  { name: '全 F UUID', value: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
]
