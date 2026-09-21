/**
 * X.509 证书解析（PEM / DER → 字段）
 * =====================================================================
 * 能力边界（很重要，视图层要原样提示给用户）：
 *   1. 只「读」不「判」：把 DER 里写着的字段解出来给人看，仅此而已。
 *   2. 不验签：没有实现 RSA / ECDSA / EdDSA 的签名验证，无法判断证书内容
 *      有没有被改过，也无法证明「这把公钥确实属于这个主体」。
 *   3. 不构建信任链：不比对任何根证书，给不出「受信 / 不受信」结论。
 *   4. 不查吊销：CRL 与 OCSP 都必须联网取数据，本项目全程离线。这里只把证书
 *      自己写明的 CRL 分发点与 OCSP 地址显示出来，不代表查询过状态。
 *   5. 私钥只读头部元信息（格式 / 算法 / 位数 / 是否加密），
 *      绝不实现口令解密，也绝不输出任何私钥字节。
 *
 * 实现约束：ASN.1 DER 读取器、PEM 解码、OID 表全部手写，零第三方依赖。
 * UTF-8 解码复用 base64.js，摘要复用 hash.js，时间格式化复用 date.js。
 *
 * 为什么没直接用 base64.js 的 base64Decode：它返回「UTF-8 解码后的字符串」，
 * 而 DER 是任意二进制（大量 ≥0x80 的字节不构成合法 UTF-8），过一遍字符串会被
 * 改字节。所以本文件内部用 b64FromBytes / b64ToBytes 做字节级互转；文本解码仍走
 * base64.js。同理没用它导出的 bytesToHex：那个实现靠 Array.prototype.map 再 join，
 * 传 Uint8Array 时 map 会把十六进制字符串重新塞回定长数组（"6b"→NaN→0），结果是
 * 错串的；本文件的字节都是 Uint8Array，故下方自备 hexBytes。纯函数：不碰 uni、不碰 DOM。
 */
import { bytesUtf8 } from './base64'
import { md5Bytes, sha1Bytes, sha256Bytes } from './hash'
import { formatDate } from './date'

const DAY = 86400000
const SOON_DAYS = 30

/** ASN.1 UNIVERSAL 标签号（tagNumber 只取低 5 位，SEQUENCE 是 16 不是 0x30） */
const T = {
  BOOLEAN: 1, INTEGER: 2, BITSTRING: 3, OCTETSTRING: 4, NULL: 5, OID: 6,
  UTF8: 12, SEQ: 16, SET: 17, NUMERIC: 18, PRINTABLE: 19, T61: 20,
  VIDEOTEX: 21, IA5: 22, UTC: 23, GENTIME: 24, GRAPHIC: 25, VISIBLE: 26,
  GENERAL: 27, UNIVERSAL: 28, CHAR: 29, BMP: 30,
}
const TAG_CN = {
  1: 'BOOLEAN', 2: 'INTEGER', 3: 'BIT STRING', 4: 'OCTET STRING', 5: 'NULL',
  6: 'OBJECT IDENTIFIER', 10: 'ENUMERATED', 12: 'UTF8String', 16: 'SEQUENCE',
  17: 'SET', 18: 'NumericString', 19: 'PrintableString', 20: 'T61String',
  21: 'VideotexString', 22: 'IA5String', 23: 'UTCTime', 24: 'GeneralizedTime',
  25: 'GraphicString', 26: 'VisibleString', 27: 'GeneralString',
  28: 'UniversalString', 30: 'BMPString',
}
const CLASS_CN = ['UNIVERSAL', 'APPLICATION', 'CONTEXT', 'PRIVATE']
const MAX_DEPTH = 48
const MAX_MULTI = 5

/* =====================================================================
 * 字节 / 十六进制 / Base64
 * ===================================================================== */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_LUT = (() => {
  const m = {}
  for (let i = 0; i < 64; i++) m[B64[i]] = i
  return m
})()

/** 任意输入 → Uint8Array（PEM 串自动解，十六进制串也认） */
export function toBytes(x) {
  if (x instanceof Uint8Array) return x
  if (Array.isArray(x)) {
    const out = new Uint8Array(x.length)
    for (let i = 0; i < x.length; i++) out[i] = x[i] & 0xff
    return out
  }
  if (typeof x === 'string') {
    const s = x.trim()
    if (s.indexOf('-----BEGIN') > -1) return pemDecode(s).bytes
    const hex = s.replace(/[\s:,_-]/g, '')
    if (hex && hex.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(hex)) {
      const out = new Uint8Array(hex.length / 2)
      for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
      return out
    }
    throw new Error('输入不是可识别的证书数据：既没有 -----BEGIN 起始行，也不是十六进制字节串')
  }
  throw new Error('输入类型不支持，请给 PEM 字符串、字节数组或 Uint8Array')
}

/** 字节 → 小写十六进制（认 Array / Uint8Array 两种，逐位拼，不用 map+join） */
function hexBytes(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += ((bytes[i] & 0xff) + 0x100).toString(16).slice(1)
  return out
}

/** 字节 → 大写冒号十六进制（对齐 openssl x509 -fingerprint 的输出） */
export function colonHex(bytes, sep) {
  return hexBytes(bytes).toUpperCase().replace(/(..)(?=.)/g, '$1' + (sep || ':'))
}

/** 字节 → 空格分组十六进制，方便读长串（模数） */
export function groupHex(bytes) {
  return hexBytes(bytes).replace(/(.{4})/g, '$1 ').trim()
}

/** 大端字节 → 十进制字符串（手写长除，不依赖 BigInt，环境无关） */
export function bytesToDecimal(bytes) {
  let digits = [0]
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i] & 0xff
    for (let j = digits.length - 1; j >= 0; j--) {
      const v = digits[j] * 256 + carry
      digits[j] = v % 10
      carry = Math.floor(v / 10)
    }
    while (carry > 0) {
      digits.unshift(carry % 10)
      carry = Math.floor(carry / 10)
    }
  }
  let k = 0
  while (k < digits.length - 1 && digits[k] === 0) k++
  return digits.slice(k).join('')
}

/** 字节 → Base64（lines 给了就折行） */
function b64FromBytes(bytes, lines) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : -1
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : -1
    out += B64[b0 >> 2]
    out += B64[((b0 & 3) << 4) | (b1 < 0 ? 0 : b1 >> 4)]
    out += b1 < 0 ? '=' : B64[((b1 & 15) << 2) | (b2 < 0 ? 0 : b2 >> 6)]
    out += b2 < 0 ? '=' : B64[b2 & 63]
  }
  if (!lines) return out
  let wrapped = ''
  for (let i = 0; i < out.length; i += lines) {
    wrapped += out.substr(i, lines) + (i + lines < out.length ? '\n' : '')
  }
  return wrapped
}

/** Base64 → 字节（容忍任意空白；非法字符带位置报错） */
function b64ToBytes(text) {
  const s = String(text).replace(/[\s　]+/g, '')
  const out = []
  let i = 0
  while (i < s.length) {
    let group = 0
    let n = 0 // 本组占用的槽位数（含 '='）
    let k = 0 // 本组真正的 Base64 字符数，决定位移量
    let pad = 0
    for (; n < 4 && i < s.length; n++) {
      const ch = s[i++]
      if (ch === '=') {
        pad++
        continue
      }
      if (pad) throw new Error('Base64 正文里「=」后面还有字符（第 ' + i + ' 个字符处），填充只能出现在最末尾')
      const v = B64_LUT[ch]
      if (v === undefined) {
        throw new Error('Base64 正文有非法字符「' + ch + '」（第 ' + i + ' 个字符），PEM 只允许 A-Z a-z 0-9 + / = 与空白')
      }
      group = ((group << 6) | v) >>> 0
      k++
    }
    if (k < 2) throw new Error('Base64 正文结尾多出 1 个字符，无法还原成完整字节')
    // 有填充时 group 只左对齐了 k*6 位，位移要按实际位数算
    const total = k * 6
    for (let j = 0; j < k - 1; j++) out.push((group >>> (total - 8 * (j + 1))) & 0xff)
  }
  return Uint8Array.from(out)
}

/* =====================================================================
 * PEM
 * ===================================================================== */

const PEM_TYPES = {
  CERTIFICATE: { key: 'certificate', cn: 'X.509 证书' },
  'TRUSTED CERTIFICATE': { key: 'trusted', cn: '受信任证书（openssl 扩展格式，含本地信任标记）' },
  'X509 CRL': { key: 'crl', cn: '证书吊销列表 CRL' },
  CRL: { key: 'crl', cn: '证书吊销列表 CRL' },
  'RSA PRIVATE KEY': { key: 'pkcs1-rsa', cn: 'RSA 私钥（PKCS#1 传统格式）' },
  'EC PRIVATE KEY': { key: 'secg-pkcs1-ec', cn: 'EC 私钥（SEC1 传统格式）' },
  'DSA PRIVATE KEY': { key: 'pkcs1-dsa', cn: 'DSA 私钥（传统格式）' },
  'OPENSSH PRIVATE KEY': { key: 'openssh', cn: 'OpenSSH 自有格式私钥（本工具不解析）' },
  'PRIVATE KEY': { key: 'pkcs8', cn: '私钥（PKCS#8 通用格式）' },
  'ENCRYPTED PRIVATE KEY': { key: 'pkcs8-encrypted', cn: '加密私钥（PKCS#8，带口令）' },
  'PUBLIC KEY': { key: 'spki', cn: '公钥（SubjectPublicKeyInfo）' },
  'RSA PUBLIC KEY': { key: 'pkcs1-rsa-public', cn: 'RSA 公钥（PKCS#1 传统格式）' },
  'CERTIFICATE REQUEST': { key: 'csr', cn: '证书签名请求（PKCS#10）' },
  'NEW CERTIFICATE REQUEST': { key: 'csr', cn: '证书签名请求（PKCS#10）' },
}

export const PEM_TYPE_LABELS = Object.keys(PEM_TYPES).map((label) => ({ label, cn: PEM_TYPES[label].cn }))

/** 这些 PEM 类型明确不是私钥，粘进私钥入口直接拒，不做无意义的结构猜测 */
const NOT_PRIVATE_KEY_TYPES = ['certificate', 'trusted', 'crl', 'csr', 'spki', 'pkcs1-rsa-public']

/**
 * 解 PEM。容忍 Windows 换行、BEGIN 之前的垃圾文本（curl / 日志前缀）、
 * base64 里混进的空白，以及 openssl 传统加密头的 Proc-Type / DEK-Info。
 * @returns {{label,type,typeCn,bytes,length,encrypted,pem}}
 */
export function pemDecode(text) {
  const raw = String(text == null ? '' : text)
  if (!raw.trim()) throw new Error('请先粘贴 PEM 内容（-----BEGIN ... ----- 那一段）')
  const src = raw.replace(/\r\n?/g, '\n')
  const m = src.match(/-----BEGIN ([A-Za-z0-9 ]+)-----/)
  if (!m) {
    const firstLine = src.split('\n')[0].slice(0, 40)
    throw new Error(
      '没找到 -----BEGIN ...----- 起始行（开头是「' + firstLine + '」）。' +
        '如果手上是 .der / .cer 二进制，先转成 PEM 再粘：openssl x509 -inform DER -outform PEM'
    )
  }
  const label = m[1].trim().toUpperCase()
  const bodyStart = src.indexOf(m[0]) + m[0].length
  const endTag = '-----END ' + m[1] + '-----'
  const endIdx = src.indexOf(endTag, bodyStart)
  if (endIdx < 0) throw new Error('缺少结束行 ' + endTag + '，PEM 被截断了（也可能是 BEGIN / END 的名字写得不一致）')
  let body = src.slice(bodyStart, endIdx)

  // MIME 风格头：传统加密 PEM 的口令算法就写在这里
  let encrypted = null
  const kept = []
  let inHeader = true
  body.split('\n').forEach((line) => {
    const t = line.trim()
    if (!t) {
      if (kept.length) inHeader = false
      return
    }
    if (inHeader) {
      const hm = t.match(/^(Proc-Type|DEK-Info|Headers|Mime-Version)\s*:\s*(.*)$/i)
      if (hm) {
        const k = hm[1].toLowerCase()
        if (k === 'proc-type' && /encrypted/i.test(hm[2])) encrypted = { procType: hm[2], dekInfo: '' }
        else if (k === 'dek-info' && encrypted) encrypted.dekInfo = hm[2]
        else if (k === 'dek-info') encrypted = { procType: 'ENCRYPTED', dekInfo: hm[2] }
        return
      }
      inHeader = false
    }
    kept.push(line)
  })

  const flat = kept.join('').replace(/[\s　]+/g, '')
  if (!flat) throw new Error('PEM 正文是空的（BEGIN 与 END 之间什么也没有）')
  if (flat.length % 4 === 1) {
    throw new Error('Base64 正文长度除 4 余 1（' + flat.length + ' 个字符），不可能由完整字节编出来，多半漏粘了字符')
  }
  const bytes = b64ToBytes(flat)
  if (!bytes.length) throw new Error('Base64 解出来是 0 字节，检查一下 PEM 正文')
  const info = PEM_TYPES[label] || null
  return {
    label,
    type: info ? info.key : 'unknown',
    typeCn: info ? info.cn : '未识别的 PEM 类型「' + label + '」',
    known: !!info,
    bytes,
    length: bytes.length,
    encrypted,
    pem: '-----BEGIN ' + label + '-----\n' + b64FromBytes(bytes, 64) + '\n' + endTag + '\n',
  }
}

/* =====================================================================
 * ASN.1 DER 最小读取器
 * ===================================================================== */

function derErr(msg, offset) {
  return new Error('ASN.1 解析失败：' + msg + (offset == null || offset < 0 ? '' : '（偏移 ' + offset + ' 字节处）'))
}

function describeNode(node) {
  if (!node) return '空'
  if (node.cls !== 0) return '[' + node.tagNumber + ']' + (node.constructed ? ' constructed' : ' primitive')
  return (TAG_CN[node.tagNumber] || 'TAG ' + node.tagNumber) + '（0x' + node.tag.toString(16) + '）'
}

function readNode(buf, pos, limit, depth, ctx) {
  const start = pos
  if (depth > MAX_DEPTH) throw derErr('嵌套深度超过 ' + MAX_DEPTH + ' 层，疑似构造出来的畸形数据', start)
  if (pos >= limit) {
    throw derErr(
      limit === buf.length
        ? '数据已经读完（共 ' + buf.length + ' 字节），但结构还没结束，DER 被截断了'
        : '父节点声明的范围已经读完，子结构却还没结束（长度字段与实际内容不符）',
      start
    )
  }
  const b0 = buf[pos]
  const cls = (b0 >> 6) & 3
  const constructed = !!(b0 & 0x20)
  let tagNumber = b0 & 0x1f
  pos++
  if (tagNumber === 0x1f) {
    // 多字节标签：后随若干 7 位组，最高位为续接标志
    tagNumber = 0
    let cont = 0
    let first = true
    for (;;) {
      if (pos >= limit) throw derErr('多字节标签还没读完就到数据结尾了', start)
      const c = buf[pos++]
      if (first && (c & 0x7f) === 0) {
        throw derErr('多字节标签的第二字节是 0x' + hexBytes([c]) + '，DER 要求最小编码，这里非法', pos - 1)
      }
      first = false
      if (tagNumber > 0x1ffffff) throw derErr('标签号超出可处理范围（>2^29）', pos - 1)
      tagNumber = tagNumber * 128 + (c & 0x7f)
      if (!(c & 0x80)) break
      if (++cont > MAX_MULTI) throw derErr('多字节标签超过 6 字节，超出可处理范围', pos - 1)
    }
  }

  if (pos >= limit) throw derErr('标签后面缺了长度字段', start)
  const l0 = buf[pos++]
  let len
  if (l0 === 0x80) {
    throw derErr('这里用了 BER 的不定长写法（长度字节 0x80）。X.509 用 DER，长度必须是确定的，无法解析', pos - 1)
  }
  if (l0 & 0x80) {
    const count = l0 & 0x7f
    if (count > MAX_MULTI) {
      throw derErr('长度字段声明后面还有 ' + count + ' 个字节，超过上限 ' + MAX_MULTI + '（数据损坏或被构造）', pos - 1)
    }
    if (pos + count > limit) {
      throw derErr('长度字段本身不完整：需要 ' + count + ' 字节，只剩 ' + (limit - pos) + ' 字节', pos - 1)
    }
    len = 0
    for (let i = 0; i < count; i++) {
      len = len * 256 + buf[pos++]
      if (len > 64 * 1024 * 1024) throw derErr('单个节点声明长度超过 64 MiB，拒绝继续（明显是假长度）', pos - 1)
    }
    if (len < 0x80) ctx.warn.push('偏移 ' + (pos - count) + ' 处用长格式长度表示 ' + len + ' 字节，DER 应写成短格式（非最小编码）')
  } else {
    len = l0
  }

  const valueStart = pos
  const end = valueStart + len
  if (end > limit) {
    throw derErr(
      '节点声明内容 ' + len + ' 字节，但从偏移 ' + valueStart + ' 起只剩 ' + (limit - valueStart) +
        ' 字节（总长 ' + buf.length + '）——长度字段在撒谎，或数据被截断',
      start
    )
  }

  const node = {
    start,
    end,
    cls,
    classCn: CLASS_CN[cls],
    tag: b0,
    tagNumber,
    tagCn: cls === 0 ? TAG_CN[tagNumber] || 'TAG ' + tagNumber : '[' + tagNumber + ']',
    constructed,
    len,
    valueStart,
    valueEnd: end,
    bytes: buf.subarray(start, end),
    value: buf.subarray(valueStart, end),
    children: null,
  }

  if (constructed) {
    const children = []
    let p = valueStart
    let broken = null
    while (p < end) {
      try {
        const c = readNode(buf, p, end, depth + 1, ctx)
        children.push(c)
        p = c.end
      } catch (e) {
        // 上下文 / 应用 / 私有标签里的内容可能只是本工具不认识的不透明字节，
        // 降级为「不展开」；UNIVERSAL 是真结构错误，必须抛出去。
        if (cls === 0) throw e
        broken = e
        break
      }
    }
    if (broken) {
      node.opaque = true
      node.opaqueReason = broken.message
    } else {
      node.children = children
      if (children.length && p !== end) ctx.warn.push('偏移 ' + p + ' 处：父节点末尾还有 ' + (end - p) + ' 字节没被解析')
    }
  }
  return node
}

/**
 * DER 读取入口。
 * @param {Uint8Array|number[]|string} bytes 字节数组、PEM 串（自动解）或十六进制串
 * @returns {object} 根节点（含 children / 偏移 / 长度 / warnings）
 */
export function readDer(bytes) {
  const buf = toBytes(bytes)
  if (!buf.length) throw new Error('输入是空的，没有任何字节可以解析')
  if (buf.length < 2) throw new Error('只有 ' + buf.length + ' 个字节，连一个完整的 ASN.1 头部都放不下')
  const ctx = { warn: [] }
  const root = readNode(buf, 0, buf.length, 0, ctx)
  if (root.end !== buf.length) ctx.warn.push('末尾多出 ' + (buf.length - root.end) + ' 个没用到的字节（从偏移 ' + root.end + ' 起）')
  root.warnings = ctx.warn
  return root
}

/* ---------------- 取值辅助 ---------------- */

function isType(node, tagNumber) {
  return !!node && node.cls === 0 && node.tagNumber === tagNumber
}

function expect(node, tagNumber, what) {
  if (!isType(node, tagNumber)) {
    throw derErr(what + '位置期望 ' + (TAG_CN[tagNumber] || 'TAG ' + tagNumber) + '，实际是 ' + describeNode(node), node ? node.start : -1)
  }
  return node
}

function kid(node, i) {
  if (!node.children || i >= node.children.length) {
    throw derErr('结构里缺少第 ' + (i + 1) + ' 个子节点（' + describeNode(node) + '）', node.valueStart)
  }
  return node.children[i]
}

/** 解码 OID 字节 → 点分十进制 */
function decodeOidBytes(v, offset) {
  if (!v.length) throw derErr('OID 内容为空', offset)
  const parts = [Math.floor(v[0] / 40), v[0] % 40]
  let arc = 0
  let open = false
  for (let i = 1; i < v.length; i++) {
    const c = v[i]
    if (!open && c === 0x80) throw derErr('OID 有非最小编码（多余的 0x80 前导组）', offset + i)
    open = true
    arc = arc * 128 + (c & 0x7f)
    if (arc > 4294967295) throw derErr('OID 子标识符超过 32 位，拒绝处理', offset + i)
    if (c & 0x80) continue
    parts.push(arc)
    arc = 0
    open = false
  }
  if (open) throw derErr('OID 最后一个子标识符缺少结束字节（续接位一直挂着）', offset)
  return parts.join('.')
}

function oidOf(node) {
  expect(node, T.OID, 'OID')
  return decodeOidBytes(node.value, node.valueStart)
}

/** 字符串类标签 → JS 字符串 */
function asnString(node) {
  const v = node.value
  if (node.cls !== 0) return bytesUtf8(v) // 隐式标签（如 SAN 里的 dNSName）按 IA5/UTF-8 处理
  switch (node.tagNumber) {
    case T.BMP: {
      let s = ''
      for (let i = 0; i + 1 < v.length; i += 2) s += String.fromCharCode((v[i] << 8) | v[i + 1])
      return s
    }
    case T.UTF8:
      return bytesUtf8(v)
    case T.PRINTABLE:
    case T.IA5:
    case T.NUMERIC:
    case T.T61:
    case T.VISIBLE:
    case T.GENERAL:
    case T.GRAPHIC:
    case T.UTC:
    case T.GENTIME: {
      let s = ''
      for (let i = 0; i < v.length; i++) s += String.fromCharCode(v[i] & 0xff)
      return s
    }
    default:
      throw derErr('不支持的字符串标签 ' + describeNode(node), node.start)
  }
}

function safeAsnString(node) {
  try {
    return asnString(node)
  } catch (e) {
    return hexBytes(node.value)
  }
}

/** INTEGER → 去掉 ASN.1 前导 0x00 的无符号字节 */
function uintBytes(node) {
  expect(node, T.INTEGER, 'INTEGER')
  const v = node.value
  let i = 0
  while (i < v.length - 1 && v[i] === 0) i++
  return v.subarray(i)
}

/** INTEGER → Number（位数、pathlen 这类小值） */
function smallInt(node, max) {
  const b = uintBytes(node)
  let n = 0
  for (let i = 0; i < b.length; i++) {
    n = n * 256 + b[i]
    if (max != null && n > max) return max + 1
  }
  return n
}

/** BIT STRING → 去掉首字节「未使用位数」的内容 */
function bitString(node) {
  expect(node, T.BITSTRING, 'BIT STRING')
  const v = node.value
  if (!v.length) throw derErr('BIT STRING 是空的，连「未使用位数」这个首字节都没有', node.start)
  const unused = v[0]
  if (unused > 7) throw derErr('BIT STRING 的未使用位数是 ' + unused + '，必须在 0~7 之间', node.start)
  return { bytes: v.subarray(1), unused }
}

/** EXPLICIT 上下文标签 → 里面那个值 */
function unwrapExplicit(node) {
  if (!node.children || !node.children.length) throw derErr('期望上下文标签 [' + node.tagNumber + '] 且内含一个值，实际是空的', node.valueStart)
  return node.children[0]
}

/** 有效位数（去掉前导零字节与前导零位） */
function bitLenOf(bytes) {
  let i = 0
  while (i < bytes.length - 1 && bytes[i] === 0) i++
  if (i >= bytes.length) return 0
  let b = (bytes.length - i) * 8
  let v = bytes[i]
  while (v && !(v & 0x80)) {
    b--
    v = (v << 1) & 0xff
  }
  return b
}

/* =====================================================================
 * OID 表
 * ===================================================================== */

/** 算法 / 曲线 / DN 属性 / CSR 属性等 OID → 名字与中文说明 */
export const OID_NAMES = {
  // PKCS#1 签名算法
  '1.2.840.113549.1.1.1': { name: 'rsaEncryption', cn: 'RSA（PKCS#1 v1.5）' },
  '1.2.840.113549.1.1.2': { name: 'md2WithRSAEncryption', cn: 'RSA + MD2（已废弃）' },
  '1.2.840.113549.1.1.3': { name: 'md4WithRSAEncryption', cn: 'RSA + MD4（已废弃）' },
  '1.2.840.113549.1.1.4': { name: 'md5WithRSAEncryption', cn: 'RSA + MD5（可构造碰撞，不要再信）' },
  '1.2.840.113549.1.1.5': { name: 'sha1WithRSAEncryption', cn: 'RSA + SHA-1（已实证碰撞，浏览器不信任）' },
  '1.2.840.113549.1.1.10': { name: 'rsassaPss', cn: 'RSA-PSS（更现代的填充方式）' },
  '1.2.840.113549.1.1.11': { name: 'sha256WithRSAEncryption', cn: 'RSA + SHA-256（目前最常见的 TLS 签名）' },
  '1.2.840.113549.1.1.12': { name: 'sha384WithRSAEncryption', cn: 'RSA + SHA-384' },
  '1.2.840.113549.1.1.13': { name: 'sha512WithRSAEncryption', cn: 'RSA + SHA-512' },
  '1.2.840.113549.1.1.14': { name: 'sha224WithRSAEncryption', cn: 'RSA + SHA-224' },
  // 摘要
  '1.2.840.113549.2.5': { name: 'md5', cn: 'MD5 摘要' },
  '1.3.14.3.2.26': { name: 'sha1', cn: 'SHA-1 摘要' },
  '2.16.840.1.101.3.4.2.1': { name: 'sha256', cn: 'SHA-256 摘要' },
  '2.16.840.1.101.3.4.2.2': { name: 'sha384', cn: 'SHA-384 摘要' },
  '2.16.840.1.101.3.4.2.3': { name: 'sha512', cn: 'SHA-512 摘要' },
  '2.16.840.1.101.3.4.2.8': { name: 'sha3-256', cn: 'SHA3-256 摘要' },
  // EC
  '1.2.840.10045.2.1': { name: 'id-ecPublicKey', cn: '椭圆曲线公钥（EC）' },
  '1.2.840.10045.1.2': { name: 'c-PrimeCurve', cn: 'EC 素数域参数（内联给出，极少见）' },
  '1.2.840.10045.4.1': { name: 'ecdsa-with-SHA1', cn: 'ECDSA + SHA-1（不要再用）' },
  '1.2.840.10045.4.3.1': { name: 'ecdsa-with-SHA224', cn: 'ECDSA + SHA-224' },
  '1.2.840.10045.4.3.2': { name: 'ecdsa-with-SHA256', cn: 'ECDSA + SHA-256' },
  '1.2.840.10045.4.3.3': { name: 'ecdsa-with-SHA384', cn: 'ECDSA + SHA-384' },
  '1.2.840.10045.4.3.4': { name: 'ecdsa-with-SHA512', cn: 'ECDSA + SHA-512' },
  '1.2.840.10045.3.1.1': { name: 'prime192v1', cn: 'P-192（强度不足）' },
  '1.2.840.10045.3.1.7': { name: 'prime256v1', cn: 'P-256 / secp256r1（最常用）' },
  '1.3.132.0.10': { name: 'secp256k1', cn: 'secp256k1（比特币用的那条曲线）' },
  '1.3.132.0.24': { name: 'secp384r1', cn: 'P-384 / secp384r1' },
  '1.3.132.0.25': { name: 'secp521r1', cn: 'P-521 / secp521r1' },
  '1.3.132.0.34': { name: 'secp384r1', cn: 'P-384 / secp384r1' },
  '1.3.132.0.35': { name: 'secp521r1', cn: 'P-521 / secp521r1' },
  // EdDSA / XDH
  '1.3.101.110': { name: 'Ed25519', cn: 'Ed25519 签名（Curve25519）' },
  '1.3.101.111': { name: 'Ed448', cn: 'Ed448 签名' },
  '1.3.101.112': { name: 'X25519', cn: 'X25519 密钥协商（不能用于签名）' },
  '1.3.101.113': { name: 'X448', cn: 'X448 密钥协商' },
  // DSA / DH
  '1.2.840.10040.4.1': { name: 'id-dsa', cn: 'DSA（正在被淘汰）' },
  '1.2.840.10040.4.3': { name: 'dsa-with-sha1', cn: 'DSA + SHA-1' },
  '2.16.840.1.101.3.4.3.2': { name: 'dsa-with-sha256', cn: 'DSA + SHA-256' },
  '1.2.840.113549.1.3.1': { name: 'dhKeyAgreement', cn: 'DH 密钥协商' },
  // 口令加密相关（只用于识别「这是加密的」，不做解密）
  '1.2.840.113549.1.5.13': { name: 'PBKDF2', cn: '口令派生密钥 PBKDF2' },
  '1.2.840.113549.1.5.12': { name: 'pbeWithSHAAnd128BitRC4', cn: 'PKCS#12 口令加密（RC4，已废弃）' },
  '2.16.840.1.101.3.4.1.2': { name: 'aes128-CBC', cn: 'AES-128-CBC' },
  '2.16.840.1.101.3.4.1.22': { name: 'aes192-CBC', cn: 'AES-192-CBC' },
  '2.16.840.1.101.3.4.1.42': { name: 'aes256-CBC', cn: 'AES-256-CBC' },
  // 国密
  '1.2.156.10197.1.301': { name: 'SM2', cn: 'SM2 椭圆曲线（国密）' },
  '1.2.156.10197.1.501': { name: 'SM3withSM2', cn: 'SM2 签名 + SM3 摘要（国密）' },
  '1.2.156.10197.1.401': { name: 'SM3', cn: 'SM3 摘要（国密）' },
  // DN 属性
  '2.5.4.3': { name: 'CN', cn: '通用名 commonName（服务器证书里就是域名）' },
  '2.5.4.4': { name: 'SN', cn: '姓氏 surname' },
  '2.5.4.5': { name: 'serialNumber', cn: '属性「序列号」（证件号之类，别和证书序列号混淆）' },
  '2.5.4.6': { name: 'C', cn: '国家 countryName（两位 ISO 3166 代码）' },
  '2.5.4.7': { name: 'L', cn: '城市 localityName' },
  '2.5.4.8': { name: 'ST', cn: '省份 stateOrProvinceName' },
  '2.5.4.9': { name: 'STREET', cn: '街道 streetAddress' },
  '2.5.4.10': { name: 'O', cn: '组织 organizationName' },
  '2.5.4.11': { name: 'OU', cn: '组织单位 organizationalUnitName' },
  '2.5.4.12': { name: 'T', cn: '职务 title' },
  '2.5.4.15': { name: 'businessCategory', cn: '业务类别（EV 证书会填 Private Organization）' },
  '2.5.4.16': { name: 'postalAddress', cn: '邮政地址' },
  '2.5.4.17': { name: 'postalCode', cn: '邮政编码' },
  '2.5.4.20': { name: 'telephoneNumber', cn: '电话' },
  '2.5.4.41': { name: 'name', cn: '名称' },
  '2.5.4.42': { name: 'GN', cn: '名 givenName（个人证书）' },
  '2.5.4.43': { name: 'SN', cn: '姓 surname（个人证书）' },
  '2.5.4.45': { name: 'x500UniqueIdentifier', cn: 'X.500 唯一标识' },
  '2.5.4.46': { name: 'dnQualifier', cn: 'DN 限定符' },
  '2.5.4.65': { name: 'pseudonym', cn: '化名' },
  '2.5.4.97': { name: 'organizationIdentifier', cn: '组织标识符（欧洲 EORI / 俄罗斯 OGRN）' },
  '0.9.2342.19200300.100.1.1': { name: 'UID', cn: '用户 ID uid（pilot 定义）' },
  '0.9.2342.19200300.100.1.25': { name: 'DC', cn: '域名组件 domainComponent（dc=corp,dc=example）' },
  '1.2.840.113549.1.9.1': { name: 'E', cn: '邮箱 emailAddress' },
  '1.2.840.113549.1.9.2': { name: 'unstructuredName', cn: '非结构化名称（CSR 常用）' },
  '1.2.840.113549.1.9.7': { name: 'challengePassword', cn: '挑战口令（CSR 里的可选字段）' },
  '1.2.840.113549.1.9.14': { name: 'extensionRequest', cn: 'CSR 里请求的扩展清单' },
  // 企业 / 地区专用
  '1.3.6.1.4.1.311.60.2.1.1': { name: 'jurisdictionLocality', cn: '注册地城市（EV 证书专用，微软定义）' },
  '1.3.6.1.4.1.311.60.2.1.2': { name: 'jurisdictionState', cn: '注册地省份（EV 证书专用）' },
  '1.3.6.1.4.1.311.60.2.1.3': { name: 'jurisdictionCountry', cn: '注册地国家（EV 证书专用）' },
  '1.3.6.1.4.1.311.20.2.3': { name: 'UPN', cn: 'userPrincipalName（微软 AD 的用户主体名）' },
  '1.3.6.1.4.1.311.21.7': { name: 'certificateTemplate', cn: '证书模板（微软 AD CS 内部编号）' },
  '1.3.6.1.4.1.11129.2.4.2': { name: 'signedCertificateTimestampList', cn: 'SCT 列表（证书透明度日志签名，需联网校验）' },
  '1.3.6.1.4.1.11129.2.4.3': { name: 'OCSPStatusRequest', cn: 'OCSP 状态请求（老写法）' },
  '1.2.643.100.1': { name: 'SNILS', cn: '俄罗斯自然人养老金编号' },
  '1.2.643.100.4': { name: 'OGRN', cn: '俄罗斯主登记号 OGRN' },
  '1.2.643.3.1.3.1': { name: 'INN', cn: '俄罗斯纳税人识别号 INN' },
}

/** 证书扩展 OID → 中文名 + 一句话说明 */
export const EXTENSION_NAMES = {
  '2.5.29.14': { name: 'subjectKeyIdentifier', cn: '主体密钥标识 SKI', doc: '这把公钥的短指纹（通常是 SHA-1 前 20 字节），用来在一堆证书里快速定位' },
  '2.5.29.15': { name: 'keyUsage', cn: '密钥用途 KU', doc: '限定这张/这把密钥允许干什么：签名、密钥加密、签发下级证书、签发 CRL……' },
  '2.5.29.16': { name: 'privateKeyUsagePeriod', cn: '私钥使用期', doc: '私钥只允许在这段时间内使用，可以比证书有效期更窄' },
  '2.5.29.17': { name: 'subjectAltName', cn: '主体备用名称 SAN', doc: '域名 / IP / 邮箱 / URI 列表。现代浏览器只看 SAN，不再看 CN' },
  '2.5.29.18': { name: 'issuerAltName', cn: '颁发者备用名称', doc: '给颁发者 DN 换一个写法，很少见' },
  '2.5.29.19': { name: 'basicConstraints', cn: '基本约束 BC', doc: '是不是 CA；是 CA 的话还允许再往下套几层（pathlen）' },
  '2.5.29.20': { name: 'nameConstraints', cn: '名称约束 NC', doc: '下级证书的主体名称只能落在 permitted 内，且不能落在 excluded 内' },
  '2.5.29.21': { name: 'policyConstraints', cn: '策略约束 PC', doc: '要求显式策略 / 限制策略映射，往下几层内生效' },
  '2.5.29.22': { name: 'policyMappings', cn: '策略映射', doc: 'CA 签发时把下级声明的策略 OID 换成另一个' },
  '2.5.29.23': { name: 'exKeyUsage', cn: '扩展密钥用途（旧 OID）', doc: '早期草案 OID，正规实现用的是 2.5.29.37' },
  '2.5.29.28': { name: 'issuingDistributionPoint', cn: '签发分发点 IDP', doc: '写在 CRL 里：这份 CRL 覆盖哪个分发点、哪些吊销原因' },
  '2.5.29.31': { name: 'cRLDistributionPoints', cn: 'CRL 分发点', doc: '去哪里下载吊销列表。本项目离线，只显示地址，不会去取' },
  '2.5.29.32': { name: 'certificatePolicies', cn: '证书策略 CP', doc: 'CA 声明的验证等级，例如 DV / OV / EV 的社区 OID' },
  '2.5.29.35': { name: 'authorityKeyIdentifier', cn: '颁发者密钥标识 AKI', doc: '该用哪把公钥来验这张证书的签名（只是信息，本工具不代验）' },
  '2.5.29.36': { name: 'policyMappings(旧)', cn: '策略映射（旧 OID）', doc: '早期草案 OID' },
  '2.5.29.37': { name: 'extendedKeyUsage', cn: '扩展密钥用途 EKU', doc: '更具体的用途：HTTPS 服务端 / 客户端、代码签名、时间戳、OCSP 签名……' },
  '2.5.29.46': { name: 'ocspNoCheck', cn: 'OCSP 响应免检', doc: '允许这张证书专门用于签 OCSP 响应，不再递归检查它' },
  '2.5.29.54': { name: 'inhibitAnyPolicy', cn: '禁止 anyPolicy', doc: '往下几层之内不许把策略当成 anyPolicy 蒙混过关' },
  '1.3.6.1.5.5.7.1.1': { name: 'authorityInfoAccess', cn: '颁发者信息访问 AIA', doc: 'OCSP 地址与上级 CA 证书下载地址。本项目离线，只显示不访问' },
  '1.3.6.1.5.5.7.1.14': { name: 'proxyCertInfo', cn: '代理证书信息', doc: 'RFC 3820 代理证书，用得很少' },
  '1.3.6.1.5.5.7.1.24': { name: 'tlsfeature', cn: 'TLS 特性（OCSP Must-Staple）', doc: '握手时必须带吊销状态，否则连接失败' },
  '2.5.29.12': { name: 'sMIMECapabilities', cn: 'S-MIME 能力', doc: '老扩展，邮件客户端用' },
  '2.5.29.32.0': { name: 'anyPolicy', cn: '任意策略 anyPolicy', doc: '相当于「策略不设限」，要配合 inhibitAnyPolicy 一起看' },
}

const POLICY_NAMES = {
  '2.23.140.1.1': { cn: 'EV（扩展验证）', note: 'CA/B 论坛定义的企业级严格验证' },
  '2.23.140.1.2.1': { cn: 'DV（域名验证）', note: '只验证域名控制权，最常见' },
  '2.23.140.1.2.2': { cn: 'OV（组织验证）', note: '验证了组织身份' },
  '2.23.140.1.2.3': { cn: 'IV（个人验证）', note: '验证了个人身份' },
  '2.5.29.32.0': { cn: 'anyPolicy', note: '任意策略，实际约束要看 inhibitAnyPolicy' },
}

const KEY_USAGE_BITS = [
  '数字签名 digitalSignature', '内容承诺 nonRepudiation', '密钥加密 keyEncipherment',
  '数据加密 dataEncipherment', '密钥协商 keyAgreement', '签发证书 keyCertSign',
  '签发 CRL cRLSign', '仅加密 encipherOnly', '仅解密 decipherOnly',
]

const EKU_NAMES = {
  '1.3.6.1.5.5.7.3.1': 'HTTPS 服务端 serverAuth',
  '1.3.6.1.5.5.7.3.2': 'HTTPS 客户端 clientAuth',
  '1.3.6.1.5.5.7.3.3': '代码签名 codeSigning',
  '1.3.6.1.5.5.7.3.4': '邮件保护 emailProtection',
  '1.3.6.1.5.5.7.3.5': 'IPSec 末端 ipsecEndSystem',
  '1.3.6.1.5.5.7.3.6': 'IPSec 隧道 ipsecTunnel',
  '1.3.6.1.5.5.7.3.7': 'IPSec 用户 ipsecUser',
  '1.3.6.1.5.5.7.3.8': '时间戳 timeStamping',
  '1.3.6.1.5.5.7.3.9': 'OCSP 签名 OCSPSigning',
  '2.5.29.37.0': '任意用途 anyExtendedKeyUsage',
}

const CURVE_BITS = {
  '1.2.840.10045.3.1.1': 192,
  '1.2.840.10045.3.1.7': 256,
  '1.3.132.0.10': 256,
  '1.3.132.0.24': 384,
  '1.3.132.0.25': 521,
  '1.3.132.0.34': 384,
  '1.3.132.0.35': 521,
  '1.2.156.10197.1.301': 256,
}

function oidInfo(oid) {
  const e = OID_NAMES[oid]
  if (e) return { oid, name: e.name, cn: e.cn, known: true }
  return { oid, name: '', cn: '未收录的 OID，原样显示', known: false }
}

/* =====================================================================
 * 时间
 * ===================================================================== */

const UTC_RE = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?([Zz]|[+-]\d{2}(\d{2})?)?$/
const GEN_RE = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?([Zz]|[+-]\d{2}(\d{2})?)?$/

/**
 * UTCTime（YYMMDDHHMM[SS]Z，YY<50 记 20xx）与 GeneralizedTime 都支持。
 * @returns {{raw,type,ms,local,utc,warn}}
 */
export function parseAsnTime(node) {
  const raw = asnString(node).trim()
  const type = node.tagNumber === T.UTC ? 'UTCTime' : node.tagNumber === T.GENTIME ? 'GeneralizedTime' : null
  if (!type) throw derErr('有效期里的时间应是 UTCTime 或 GeneralizedTime，实际是 ' + describeNode(node), node.start)
  const m = (type === 'UTCTime' ? UTC_RE : GEN_RE).exec(raw)
  if (!m) throw derErr('时间「' + raw + '」不是合法的 ' + type + '（应为 ' + (type === 'UTCTime' ? 'YYMMDDHHMM[SS]Z' : 'YYYYMMDDHHMM[SS]Z') + '）', node.start)
  let year = Number(m[1])
  if (type === 'UTCTime') year = year < 50 ? 2000 + year : 1900 + year
  const mm = Number(m[2])
  const dd = Number(m[3])
  const hh = Number(m[4])
  const mi = Number(m[5])
  const ss = Number(m[6] || 0)
  if (mm < 1 || mm > 12) throw derErr('时间「' + raw + '」的月份是 ' + mm + '，不在 1~12', node.start)
  if (dd < 1 || dd > 31) throw derErr('时间「' + raw + '」的日期是 ' + dd + '，不在 1~31', node.start)
  if (hh > 23 || mi > 59 || ss > 62) throw derErr('时间「' + raw + '」的时分秒越界', node.start)
  let warn = ''
  let offsetMin = 0
  const z = m[7] || ''
  if (!z) warn = '「' + raw + '」没写时区，这里按 UTC 理解'
  else if (z !== 'Z' && z !== 'z') offsetMin = (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5) || 0)) * (z[0] === '-' ? -1 : 1)
  const ms = Date.UTC(year, mm - 1, dd, hh, mi, ss) - offsetMin * 60000
  if (isNaN(ms)) throw derErr('时间「' + raw + '」换算失败，可能是越界日期', node.start)
  const back = new Date(ms)
  if (back.getUTCDate() !== dd) warn = warn || '「' + raw + '」里的日期在该月不存在，已按 ' + dd + ' 日落'
  return { raw, type, ms, local: formatDate(ms, 'YYYY-MM-DD HH:mm:ss'), utc: utcStamp(ms), warn }
}

function utcStamp(ms) {
  const d = new Date(ms)
  if (isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' +
    p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds()) + ' UTC'
  )
}

/** 本地时区的可读标注，例如 UTC+08:00 */
export function localTzLabel() {
  const off = -new Date().getTimezoneOffset()
  const sign = off < 0 ? '-' : '+'
  const a = Math.abs(off)
  return 'UTC' + sign + String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0')
}

/** 有效期整体状态：尚未生效 / 有效 / 即将过期（30 天内）/ 已过期 */
export function validityStatus(notBeforeMs, notAfterMs, nowMs) {
  const now = nowMs == null ? Date.now() : nowMs
  const total = Math.ceil((notAfterMs - notBeforeMs) / DAY)
  const daysLeft = Math.floor((notAfterMs - now) / DAY)
  const daysSinceStart = Math.floor((now - notBeforeMs) / DAY)
  if (now < notBeforeMs) {
    return { key: 'future', text: '尚未生效', daysLeft, daysUntilStart: Math.ceil((notBeforeMs - now) / DAY), total, daysSinceStart, tone: 'warn' }
  }
  if (now > notAfterMs) {
    return { key: 'expired', text: '已过期', daysLeft, daysSinceEnd: Math.ceil((now - notAfterMs) / DAY), total, daysSinceStart, tone: 'bad' }
  }
  if (daysLeft <= SOON_DAYS) {
    return { key: 'soon', text: '即将过期（还剩 ' + daysLeft + ' 天）', daysLeft, total, daysSinceStart, tone: 'warn' }
  }
  return { key: 'valid', text: '有效（还剩 ' + daysLeft + ' 天）', daysLeft, total, daysSinceStart, tone: 'ok' }
}

/* =====================================================================
 * DN（区分名）
 * ===================================================================== */

function nameFromChildren(children, offset) {
  const attrs = []
  for (let i = 0; i < children.length; i++) {
    const rdn = children[i]
    if (!isType(rdn, T.SET)) {
      throw derErr('DN 的第 ' + (i + 1) + ' 个 RDN 应该是 SET，实际是 ' + describeNode(rdn), rdn.start)
    }
    const items = rdn.children || []
    if (!items.length) throw derErr('第 ' + (i + 1) + ' 个 RDN 是空集合，至少要有 1 个属性', rdn.start)
    for (let j = 0; j < items.length; j++) {
      const atv = items[j]
      expect(atv, T.SEQ, '属性 AttributeTypeAndValue')
      const oid = oidOf(kid(atv, 0))
      const vnode = kid(atv, 1)
      const info = oidInfo(oid)
      let value
      try {
        value = asnString(vnode)
      } catch (e) {
        value = hexBytes(vnode.value)
      }
      attrs.push({
        oid,
        short: info.known ? info.name : oid,
        name: info.name,
        cn: info.known ? info.cn : '未收录的 OID，原样显示',
        known: info.known,
        value,
        valueTag: TAG_CN[vnode.tagNumber] || describeNode(vnode),
        rdn: i,
        multiValued: items.length > 1,
      })
    }
  }
  const map = {}
  attrs.forEach((a) => {
    if (!map[a.short]) map[a.short] = a.value
  })
  return {
    attrs,
    text: attrs.map((a) => a.short + '=' + a.value).join(', '),
    map,
    hex: '',
    offset,
  }
}

/**
 * Name ::= SEQUENCE OF SET OF SEQUENCE { OID, 值 }
 * 多值 RDN（一个 SET 里放两个以上属性）会全部展开成独立行。
 */
export function parseName(node) {
  expect(node, T.SEQ, 'DN')
  const r = nameFromChildren(node.children || [], node.start)
  r.hex = hexBytes(node.bytes)
  r.der = node.bytes
  return r
}

/** [4] directoryName：不同实现有 EXPLICIT / IMPLICIT 两种写法，都兼容 */
function parseEmbeddedName(node) {
  if (node.children && node.children.length === 1 && isType(node.children[0], T.SEQ)) return parseName(node.children[0])
  const r = nameFromChildren(node.children || [], node.start)
  r.hex = hexBytes(node.value)
  return r
}

/* =====================================================================
 * GeneralName
 * ===================================================================== */

function ipToString(bytes) {
  if (bytes.length === 4) return [bytes[0], bytes[1], bytes[2], bytes[3]].join('.')
  if (bytes.length === 16) {
    const g = []
    for (let i = 0; i < 8; i++) g.push(((bytes[i * 2] << 8) | bytes[i * 2 + 1]).toString(16))
    // 找最长的一段连续 0 组（RFC 5952：长度 1 的 0 组不压缩，::1 与 :: 例外）
    let best = -1
    let bestLen = 0
    let cur = -1
    for (let i = 0; i <= 8; i++) {
      const zero = i < 8 && g[i] === '0'
      if (zero) {
        if (cur < 0) cur = i
      } else if (cur >= 0) {
        if (i - cur > bestLen) {
          bestLen = i - cur
          best = cur
        }
        cur = -1
      }
    }
    if (bestLen === 1 && best !== 0 && best !== 7) bestLen = 0
    if (bestLen < 1) return g.join(':')
    return g.slice(0, best).join(':') + '::' + g.slice(best + bestLen).join(':')
  }
  return hexBytes(bytes) + '（' + bytes.length + ' 字节，既不是 4 也不是 16，不是合法 IP）'
}

function generalNameLabel(node) {
  if (node.cls !== 2) return { type: '其他写法', key: 'other', value: safeAsnString(node) }
  switch (node.tagNumber) {
    case 0: {
      let oid = ''
      let val = ''
      try {
        const inner = unwrapExplicit(node)
        oid = oidOf(kid(inner, 0))
        const v = kid(inner, 1)
        val = v.children && v.children.length ? hexBytes(v.children[0].value) : hexBytes(v.value)
      } catch (e) {
        val = hexBytes(node.value)
      }
      const info = oid ? oidInfo(oid) : null
      return { type: 'otherName' + (info && info.known ? '（' + info.name + '）' : ''), key: 'other', value: (oid ? oid + ' ' : '') + val }
    }
    case 1:
      return { type: '邮箱 rfc822Name', key: 'email', value: safeAsnString(node) }
    case 2:
      return { type: '域名 dNSName', key: 'dns', value: safeAsnString(node) }
    case 3:
      return { type: 'X.400 地址', key: 'other', value: hexBytes(node.value) }
    case 4:
      return { type: '目录名 directoryName', key: 'dn', value: parseEmbeddedName(node).text }
    case 5:
      return { type: 'EDI 当事人名称', key: 'other', value: hexBytes(node.value) }
    case 6:
      return { type: 'URI', key: 'uri', value: safeAsnString(node) }
    case 7: {
      const s = ipToString(node.value)
      return { type: node.value.length === 4 ? 'IPv4 地址' : 'IPv6 地址', key: node.value.length === 4 ? 'ip' : 'ip6', value: s }
    }
    case 8: {
      let oid = ''
      try {
        oid = decodeOidBytes(unwrapExplicit(node).value, node.valueStart)
      } catch (e) {
        oid = decodeOidBytes(node.value, node.valueStart)
      }
      return { type: '注册 ID registeredID', key: 'other', value: oid }
    }
    default:
      return { type: '[' + node.tagNumber + ']', key: 'other', value: hexBytes(node.value) }
  }
}

/** node 已经是 GeneralNames 那一层（SEQUENCE OF GeneralName，或隐式构造的内容） */
function generalNamesAt(node) {
  const items = node.children || []
  const list = []
  const buckets = { dns: [], ip: [], ip6: [], email: [], uri: [], dn: [], other: [] }
  for (let i = 0; i < items.length; i++) {
    const g = generalNameLabel(items[i])
    list.push(g)
    if (buckets[g.key]) buckets[g.key].push(g.value)
  }
  return { list, buckets }
}

function emptyBuckets() {
  return { dns: [], ip: [], ip6: [], email: [], uri: [], dn: [], other: [] }
}

/* =====================================================================
 * 扩展
 * ===================================================================== */

function parseKeyUsageBits(node) {
  const bs = bitString(node)
  const names = []
  const bytes = bs.bytes
  const used = bytes.length * 8 - bs.unused
  for (let i = 0; i < used; i++) {
    if (bytes[i >> 3] & (0x80 >> (i & 7))) names.push(KEY_USAGE_BITS[i] || '第 ' + i + ' 位（规范里未定义）')
  }
  return { names, hex: hexBytes(bytes) }
}

/** 解一个扩展的 extnValue（OCTET STRING 里再套一层 DER） */
function decodeExtensionValue(octetNode, oid) {
  const node = readDer(octetNode.value)
  switch (oid) {
    case '2.5.29.17':
    case '2.5.29.18':
    case '2.5.29.31': {
      if (oid !== '2.5.29.31') {
        const g = generalNamesAt(node)
        return { kind: oid === '2.5.29.17' ? 'san' : 'ian', list: g.list, buckets: g.buckets }
      }
      // CRLDistributionPoints ::= SEQUENCE OF DistributionPoint
      const urls = []
      const points = []
      ;(node.children || []).forEach((dp) => {
        const item = { urls: [], relative: false, reasons: '', crlIssuer: [] }
        ;(dp.children || []).forEach((k) => {
          if (k.cls !== 2) return
          if (k.tagNumber === 0) {
            const choice = k.children && k.children[0]
            if (choice && choice.cls === 2 && choice.tagNumber === 0) {
              generalNamesAt(choice).list.forEach((g) => {
                item.urls.push(g.value)
                urls.push(g.value)
              })
            } else if (choice && choice.cls === 2 && choice.tagNumber === 1) {
              item.relative = true
            }
          } else if (k.tagNumber === 1) {
            try {
              item.reasons = hexBytes(bitString(k.children && k.children.length ? k.children[0] : k).bytes)
            } catch (e) { /* 忽略 */ }
          } else if (k.tagNumber === 2) {
            try {
              item.crlIssuer = generalNamesAt(k).list.map((g) => g.value)
            } catch (e) { /* 忽略 */ }
          }
        })
        points.push(item)
      })
      return { kind: 'cdp', urls, points }
    }
    case '2.5.29.19': {
      let ca = false
      let pathLen = null
      ;(node.children || []).forEach((k) => {
        if (isType(k, T.BOOLEAN)) ca = k.value[0] !== 0
        else if (isType(k, T.INTEGER)) pathLen = smallInt(k, 255)
      })
      return { kind: 'bc', ca, pathLen }
    }
    case '2.5.29.15': {
      const f = parseKeyUsageBits(node)
      return { kind: 'ku', names: f.names, hex: f.hex }
    }
    case '2.5.29.37':
    case '2.5.29.23': {
      const oids = (node.children || []).map((k) => oidOf(k))
      return { kind: 'eku', oids, names: oids.map((o) => EKU_NAMES[o] || (OID_NAMES[o] ? OID_NAMES[o].name + '（' + o + '）' : o + '（未收录）')) }
    }
    case '1.3.6.1.5.5.7.1.1': {
      const rows = []
      const ocsp = []
      const issuers = []
      ;(node.children || []).forEach((k) => {
        try {
          const method = oidOf(kid(k, 0))
          const loc = generalNameLabel(kid(k, 1))
          const isOcsp = method === '1.3.6.1.5.5.7.48.1'
          const isIssuers = method === '1.3.6.1.5.5.7.48.2'
          const label = isOcsp ? 'OCSP' : isIssuers ? 'CA Issuers' : oidInfo(method).name || method
          rows.push({ method, methodName: label, type: loc.type, uri: loc.value })
          if (isOcsp) ocsp.push(loc.value)
          if (isIssuers) issuers.push(loc.value)
        } catch (e) {
          rows.push({ method: '?', methodName: '解析失败', type: '', uri: hexBytes(k.value) })
        }
      })
      return { kind: 'aia', rows, ocsp, issuers }
    }
    case '2.5.29.14':
      return { kind: 'ski', hex: colonHex(node.value) }
    case '2.5.29.35': {
      const out = { kind: 'aki', keyid: '', issuerDn: '', serial: '' }
      ;(node.children || []).forEach((k) => {
        if (k.cls !== 2) return
        const inner = k.children && k.children.length ? k.children[0] : k
        try {
          if (k.tagNumber === 0) out.keyid = colonHex(inner.value)
          else if (k.tagNumber === 1) out.issuerDn = generalNamesAt(isType(inner, T.SEQ) ? inner : k).list.map((g) => g.value).join(' / ')
          else if (k.tagNumber === 2) out.serial = colonHex(uintBytes(inner))
        } catch (e) { /* 单项失败不影响其他 */ }
      })
      return out
    }
    case '2.5.29.32': {
      const policies = []
      ;(node.children || []).forEach((p) => {
        try {
          const oid = oidOf(kid(p, 0))
          const info = POLICY_NAMES[oid]
          const cps = []
          const q = p.children && p.children[1]
          if (q) {
            const inner = q.children && q.children.length ? q.children[0] : q
            ;(inner.children || []).forEach((one) => {
              try {
                const e = one.children && one.children[0]
                if (e && e.cls === 2 && e.tagNumber === 0) {
                  const c = e.children && e.children.length ? e.children[0] : e
                  cps.push(safeAsnString(c))
                }
              } catch (err) { /* 忽略 */ }
            })
          }
          policies.push({ oid, cn: info ? info.cn : oidInfo(oid).name || '未收录的策略 OID', note: info ? info.note : '', cps })
        } catch (e) { /* 忽略 */ }
      })
      return { kind: 'cp', policies }
    }
    case '2.5.29.21': {
      const out = { kind: 'pc', requireExplicit: null, inhibitMapping: null, inheritable: null }
      ;(node.children || []).forEach((k) => {
        if (k.cls !== 2) return
        try {
          const inner = k.children && k.children.length ? k.children[0] : k
          const v = smallInt(inner, 65535)
          if (k.tagNumber === 0) out.requireExplicit = v
          else if (k.tagNumber === 1) out.inhibitMapping = v
          else if (k.tagNumber === 2) out.inheritable = v
        } catch (e) { /* 忽略 */ }
      })
      return out
    }
    case '2.5.29.20': {
      const permitted = []
      const excluded = []
      const read = (k, into) => {
        const inner = k.children && k.children.length ? k.children[0] : k
        ;(inner.children || []).forEach((sub) => {
          try {
            const baseNode = sub.children && sub.children[0]
            if (baseNode) into.push(generalNameLabel(baseNode).value)
          } catch (e) { /* 忽略 */ }
        })
      }
      ;(node.children || []).forEach((k) => {
        if (k.cls !== 2) return
        if (k.tagNumber === 0) read(k, permitted)
        else if (k.tagNumber === 1) read(k, excluded)
      })
      return { kind: 'nc', permitted, excluded }
    }
    case '2.5.29.16': {
      const out = { kind: 'pkup', notBefore: '', notAfter: '' }
      ;(node.children || []).forEach((k) => {
        if (k.cls !== 2) return
        try {
          const inner = k.children && k.children.length ? k.children[0] : k
          const t = parseAsnTime(inner)
          if (k.tagNumber === 0) out.notBefore = t.local
          else if (k.tagNumber === 1) out.notAfter = t.local
        } catch (e) { /* 忽略 */ }
      })
      return out
    }
    case '2.5.29.22': {
      const rows = []
      ;(node.children || []).forEach((k) => {
        try {
          rows.push(oidOf(kid(k, 0)) + ' → ' + oidOf(kid(k, 1)))
        } catch (e) { /* 忽略 */ }
      })
      return { kind: 'pm', rows }
    }
    case '2.5.29.54':
      return { kind: 'plain', text: '往下 ' + smallInt(node, 65535) + ' 层内不得把策略当作 anyPolicy' }
    case '1.3.6.1.5.5.7.1.24': {
      const names = (node.children || []).map((k) => (k.value[0] === 5 ? 'status_request（OCSP Must-Staple：握手必须带吊销状态）' : 'feature ' + k.value[0]))
      return { kind: 'tlsfeature', names }
    }
    case '2.5.29.46':
      return { kind: 'plain', text: 'noCheck：这张证书可专用于签 OCSP 响应，跳过对它自身的用途检查' }
    case '1.3.6.1.4.1.11129.2.4.2':
      return { kind: 'sct', note: '内容是 SCT 的 DER 列表（要联网向透明度日志校验），本工具只给原始字节' }
    default:
      return { kind: 'raw' }
  }
}

function extSummary(oid, d) {
  switch (d.kind) {
    case 'san':
    case 'ian': {
      const b = d.buckets
      const parts = []
      if (b.dns.length) parts.push(b.dns.length + ' 个域名')
      if (b.ip.length) parts.push(b.ip.length + ' 个 IPv4')
      if (b.ip6.length) parts.push(b.ip6.length + ' 个 IPv6')
      if (b.email.length) parts.push(b.email.length + ' 个邮箱')
      if (b.uri.length) parts.push(b.uri.length + ' 个 URI')
      if (b.dn.length) parts.push(b.dn.length + ' 个目录名')
      if (b.other.length) parts.push(b.other.length + ' 项其他')
      const wild = b.dns.filter((x) => x.indexOf('*') > -1)
      if (wild.length) parts.push(wild.length + ' 个通配符')
      return parts.join('、') || '空的 GeneralNames'
    }
    case 'bc':
      return d.ca ? '这是 CA 证书' + (d.pathLen == null ? '，未限制下钻层数' : '，最多再往下套 ' + d.pathLen + ' 层') : '终端实体证书（不能签发下级）'
    case 'ku':
      return d.names.length ? d.names.join('、') : '没有任何位被置上（等于禁止一切用途）'
    case 'eku':
      return d.names.join('、') || '空的（等于不声明任何用途）'
    case 'aia':
      return ((d.ocsp.length ? 'OCSP：' + d.ocsp.join(' / ') : '') + (d.issuers.length ? (d.ocsp.length ? '；' : '') + '上级证书：' + d.issuers.join(' / ') : '')) || '没有可识别的访问方式'
    case 'cdp':
      return d.urls.length ? d.urls.join(' / ') : d.points.length ? '共 ' + d.points.length + ' 个分发点（没有 URI 形式）' : '空'
    case 'ski':
      return d.hex
    case 'aki':
      return [d.keyid && 'keyid ' + d.keyid, d.issuerDn && '颁发者 ' + d.issuerDn, d.serial && '序列号 ' + d.serial].filter(Boolean).join('；') || '空'
    case 'cp':
      return d.policies.map((p) => p.oid + (p.cn ? '（' + p.cn + '）' : '') + (p.cps.length ? ' CPS: ' + p.cps.join(' ') : '')).join('、') || '空'
    case 'pc':
      return [
        d.requireExplicit != null ? '要求显式策略：往下 ' + d.requireExplicit + ' 层内不得用 anyPolicy' : '',
        d.inhibitMapping != null ? '限制策略映射：往下 ' + d.inhibitMapping + ' 层内不得映射' : '',
        d.inheritable != null ? '可继承映射数：' + d.inheritable : '',
      ].filter(Boolean).join('；') || '两个约束都省略（等价于 0 层）'
    case 'nc':
      return '允许 ' + d.permitted.length + ' 项[' + d.permitted.join(', ') + ']；禁止 ' + d.excluded.length + ' 项[' + d.excluded.join(', ') + ']'
    case 'pkup':
      return '私钥可用区间 ' + (d.notBefore || '?') + ' ~ ' + (d.notAfter || '?')
    case 'pm':
      return d.rows.join('、') || '空'
    case 'plain':
      return d.text
    case 'tlsfeature':
      return d.names.join('、')
    case 'sct':
      return d.note
    default:
      return ''
  }
}

/* =====================================================================
 * 公钥
 * ===================================================================== */

/** SubjectPublicKeyInfo → 可读的公钥信息 */
export function parsePublicKey(node) {
  expect(node, T.SEQ, '公钥信息 SubjectPublicKeyInfo')
  const algoNode = kid(node, 0)
  expect(algoNode, T.SEQ, '算法标识')
  const oid = oidOf(kid(algoNode, 0))
  const info = oidInfo(oid)
  const params = algoNode.children && algoNode.children[1] ? algoNode.children[1] : null
  const pub = bitString(kid(node, 1))
  const out = {
    oid,
    name: info.name,
    cn: info.cn,
    known: info.known,
    algo: '未知',
    bits: 0,
    rows: [{ k: '算法 OID', v: oid + (info.name ? '（' + info.name + '）' : '（未收录）') }],
    note: '',
  }

  if (oid === '1.2.840.113549.1.1.1') {
    out.algo = 'RSA'
    try {
      const seq = expect(readDer(pub.bytes), T.SEQ, 'RSAPublicKey')
      const n = uintBytes(kid(seq, 0))
      out.bits = bitLenOf(n)
      out.exponent = smallInt(kid(seq, 1), 4294967295)
      out.modulusHex = groupHex(n)
      out.modulusDec = bytesToDecimal(n)
      out.rows.push(
        { k: '密钥长度', v: out.bits + ' 位', big: true },
        { k: '公钥指数 e', v: String(out.exponent) + (out.exponent === 65537 ? '（标准值）' : '（不是 65537，注意兼容性）') },
        { k: '模数 n（十六进制）', v: out.modulusHex, mono: true, stack: true },
        { k: '模数 n（十进制）', v: out.modulusDec, mono: true, stack: true }
      )
      out.note = '位数按模数 n 的有效位计算；2048 是当前底线，低于 2048 视为不安全'
    } catch (e) {
      out.note = 'RSA 公钥内层结构解析失败：' + e.message
    }
  } else if (oid === '1.2.840.10045.2.1') {
    out.algo = 'EC'
    let curveOid = ''
    let curve = null
    if (params && isType(params, T.OID)) {
      curveOid = oidOf(params)
      curve = oidInfo(curveOid)
    } else if (params && isType(params, T.SEQ)) {
      out.note = '这里内联给出了曲线参数（极少见的写法），本工具不展开参数值'
    } else {
      out.note = '公钥里没写曲线 OID（RFC 5758 允许省略），位数按点长度推算'
    }
    const point = pub.bytes
    const head = point.length ? point[0] : 0
    const pointType = head === 0x04 ? '非压缩点（0x04 前缀）' : head === 0x02 || head === 0x03 ? '压缩点（0x0' + head + ' 前缀）' : head === 0x00 ? '无穷远点' : '未知编码'
    const cb = curveOid ? CURVE_BITS[curveOid] || 0 : 0
    out.bits = cb || (head === 0x04 && point.length > 1 ? ((point.length - 1) / 2) * 8 : point.length * 8)
    out.curve = curve
    out.curveOid = curveOid
    out.rows.push(
      { k: '密钥长度', v: out.bits + ' 位', big: true },
      { k: '曲线', v: curve ? curve.name + ' — ' + curve.cn : curveOid || '（未给出）' },
      { k: '曲线 OID', v: curveOid || '（省略）' },
      { k: '点编码', v: pointType + '，共 ' + point.length + ' 字节' },
      { k: '公钥点', v: groupHex(point), mono: true, stack: true }
    )
    if (!out.note) out.note = 'EC 的实际强度约为位数的一半（P-256 ≈ 128 位安全强度）'
  } else if (oid === '1.3.101.110' || oid === '1.3.101.111') {
    out.algo = oid === '1.3.101.110' ? 'Ed25519' : 'Ed448'
    out.bits = oid === '1.3.101.110' ? 255 : 448
    out.rows.push(
      { k: '密钥长度', v: out.bits + ' 位（现代签名，短且快）', big: true },
      { k: '公钥字节', v: groupHex(pub.bytes), mono: true, stack: true }
    )
    out.note = 'EdDSA 没有「曲线 OID」这一层，位数由算法本身决定'
  } else if (oid === '1.2.840.10040.4.1') {
    out.algo = 'DSA'
    if (params && isType(params, T.SEQ) && params.children) {
      try {
        out.bits = bitLenOf(uintBytes(kid(params, 0)))
        out.rows.push({ k: '参数', v: 'p / q / g 内联给出（DSA 的传统做法）' })
      } catch (e) { /* 忽略 */ }
    }
    out.rows.push({ k: '密钥长度', v: out.bits ? out.bits + ' 位（按 p 的长度）' : '未能取出参数', big: true })
    out.note = 'DSA 正在被淘汰，新证书基本见不到'
  } else if (oid === '1.3.101.112' || oid === '1.3.101.113') {
    out.algo = oid === '1.3.101.112' ? 'X25519' : 'X448'
    out.bits = oid === '1.3.101.112' ? 255 : 448
    out.rows.push({ k: '密钥长度', v: out.bits + ' 位' })
    out.note = '这是密钥协商公钥，不能直接拿来签名'
  } else if (oid === '1.2.156.10197.1.301') {
    out.algo = 'SM2'
    out.bits = 256
    out.rows.push(
      { k: '密钥长度', v: '256 位（国密曲线）', big: true },
      { k: '公钥点', v: groupHex(pub.bytes), mono: true, stack: true }
    )
    out.note = '国密算法：验签要 SM2 + SM3，本工具不做'
  } else {
    out.algo = info.known ? info.name : '未知'
    out.bits = pub.bytes.length * 8
    out.rows.push(
      { k: '密钥长度', v: '按原始字节估算约 ' + out.bits + ' 位' },
      { k: '公钥字节', v: groupHex(pub.bytes).slice(0, 4000), mono: true, stack: true }
    )
    out.note = '未收录的公钥算法，只能给出字节长度，无法解释结构'
  }
  out.rawBytes = pub.bytes
  out.spkiBase64 = b64FromBytes(node.bytes, 64)
  return out
}

/** 签名算法标识：SEQUENCE { OID, 参数 ANY } */
function parseAlgId(node, what) {
  const seq = expect(node, T.SEQ, what)
  const oid = oidOf(kid(seq, 0))
  const info = oidInfo(oid)
  let paramsText = '（没有参数字段）'
  const p = seq.children && seq.children[1]
  if (p) {
    if (isType(p, T.NULL)) paramsText = 'NULL（RSA 惯例，必须写 NULL）'
    else if (isType(p, T.OID)) paramsText = 'OID ' + oidOf(p)
    else if (isType(p, T.SEQ)) paramsText = 'SEQUENCE（如 RSA-PSS 参数 / DSA 参数），' + p.len + ' 字节'
    else paramsText = describeNode(p) + '，' + p.len + ' 字节'
  }
  const a = (info.name || oid).toLowerCase()
  let hash = ''
  if (/sha384|384/.test(a)) hash = 'SHA-384'
  else if (/sha512|512/.test(a)) hash = 'SHA-512'
  else if (/sha224|224/.test(a)) hash = 'SHA-224'
  else if (/sha256|256/.test(a) && !/ecdsa/.test(a)) hash = 'SHA-256'
  else if (/sha1|sha-1/.test(a)) hash = 'SHA-1'
  else if (/md5/.test(a)) hash = 'MD5'
  else if (/md4/.test(a)) hash = 'MD4'
  else if (/md2/.test(a)) hash = 'MD2'
  else if (/sm3/.test(a)) hash = 'SM3'
  let family = '未识别'
  if (/sm2/.test(a)) family = 'SM2（国密）'
  else if (/ecdsa/.test(a)) family = 'ECDSA'
  else if (/eddsa/.test(a)) family = 'EdDSA'
  else if (/rsa/.test(a)) family = 'RSA'
  else if (/dsa/.test(a)) family = 'DSA'
  return { oid, name: info.name, cn: info.cn, known: info.known, paramsText, hash, family }
}

/* =====================================================================
 * 证书
 * ===================================================================== */

/**
 * 解析一张证书。
 * @param {Uint8Array|number[]|string} input DER 字节、PEM 串或十六进制串
 */
export function parseCertificate(input) {
  const isPem = typeof input === 'string' && input.indexOf('-----BEGIN') > -1
  const pemInfo = isPem ? pemDecode(input) : null
  const der = pemInfo ? pemInfo.bytes : toBytes(input)

  const root = readDer(der)
  expect(root, T.SEQ, 'Certificate 最外层')
  const warnings = (root.warnings || []).slice()

  let cert = root
  let hadTrustBag = false
  if (root.children && root.children.length >= 2 && root.children[1].cls === 2 && root.children[1].tagNumber === 0) {
    cert = root.children[0]
    hadTrustBag = true
    warnings.push('这是 openssl 的 TRUSTED CERTIFICATE：除证书本身还带本地信任标记，那部分本工具忽略')
    expect(cert, T.SEQ, 'Certificate')
  }

  const tbs = expect(kid(cert, 0), T.SEQ, 'TBSCertificate')
  const sigAlgNode = kid(cert, 1)
  const sigNode = kid(cert, 2)
  expect(sigNode, T.BITSTRING, '签名值')

  const kids = tbs.children || []
  let i = 0
  let version = 1
  const first = kids[0]
  if (first && first.cls === 2 && first.tagNumber === 0) {
    try {
      version = smallInt(unwrapExplicit(first), 16) + 1
      if (version > 3) warnings.push('版本号写的是 v' + version + '，X.509 只定义到 v3')
    } catch (e) {
      warnings.push('版本号字段解析失败：' + e.message)
    }
    i++
  } else if (first && isType(first, T.INTEGER)) {
    version = smallInt(first, 16) + 1
    i++
  }

  const serial = uintBytes(expect(kid(tbs, i), T.INTEGER, '序列号'))
  i++
  const innerSigAlg = parseAlgId(kid(tbs, i), '签名算法（TBSCertificate 内）')
  i++
  const issuer = parseName(expect(kid(tbs, i), T.SEQ, '颁发者 DN'))
  i++
  const validity = expect(kid(tbs, i), T.SEQ, '有效期')
  const notBefore = parseAsnTime(kid(validity, 0))
  const notAfter = parseAsnTime(kid(validity, 1))
  if (notBefore.warn) warnings.push(notBefore.warn)
  if (notAfter.warn) warnings.push(notAfter.warn)
  if (notAfter.ms <= notBefore.ms) warnings.push('⚠️ notAfter 不晚于 notBefore，这张证书的有效期是空的')
  i++
  const subject = parseName(expect(kid(tbs, i), T.SEQ, '主体 DN'))
  i++
  const spki = parsePublicKey(kid(tbs, i))
  i++

  let extNodes = []
  kids.slice(i).forEach((n) => {
    if (n.cls === 2 && (n.tagNumber === 1 || n.tagNumber === 2)) return // uniqueID
    if (n.cls === 2 && n.tagNumber === 3) {
      const seq = n.children && n.children[0]
      extNodes = (seq && seq.children) || []
      return
    }
    warnings.push('TBSCertificate 里出现意料之外的 ' + describeNode(n) + '（偏移 ' + n.start + '），已跳过')
  })

  const extensions = []
  const byOid = {}
  extNodes.forEach((en) => {
    try {
      expect(en, T.SEQ, '扩展项')
      const oid = oidOf(kid(en, 0))
      let critical = false
      let valueNode = null
      ;(en.children || []).slice(1).forEach((c) => {
        if (isType(c, T.BOOLEAN)) critical = c.value[0] !== 0
        else if (isType(c, T.OCTETSTRING)) valueNode = c
      })
      if (!valueNode) throw derErr('扩展缺少 extnValue（OCTET STRING）', en.start)
      const meta = EXTENSION_NAMES[oid] || null
      const item = {
        oid,
        name: meta ? meta.name : oidInfo(oid).name,
        cn: meta ? meta.cn : '未收录的扩展',
        doc: meta ? meta.doc : '本工具没有这个扩展的解码器，只显示原始字节',
        critical,
        known: !!meta,
        valueHex: hexBytes(valueNode.value),
        valueLen: valueNode.len,
      }
      try {
        item.decoded = decodeExtensionValue(valueNode, oid)
        item.summary = extSummary(oid, item.decoded)
      } catch (e) {
        item.parseError = e.message
        item.summary = '扩展内容解析失败：' + e.message
      }
      extensions.push(item)
      byOid[oid] = item
    } catch (e) {
      extensions.push({ oid: '（读不出）', name: '', cn: '无法读取的扩展', doc: e.message, critical: false, known: false, valueHex: '', summary: e.message, parseError: e.message })
    }
  })

  const outerSigAlg = parseAlgId(sigAlgNode, '签名算法（证书层）')
  if (outerSigAlg.oid !== innerSigAlg.oid) {
    warnings.push('⚠️ TBSCertificate 内写的签名算法与证书层的算法不一致（' + innerSigAlg.oid + ' vs ' + outerSigAlg.oid + '）')
  }

  const sig = bitString(sigNode)
  const selfSigned = issuer.hex === subject.hex
  const bc = byOid['2.5.29.19']
  const isCa = bc && bc.decoded ? !!bc.decoded.ca : null
  const san = byOid['2.5.29.17']
  const buckets = san && san.decoded ? san.decoded.buckets : emptyBuckets()
  const ku = byOid['2.5.29.15']
  const eku = byOid['2.5.29.37'] || byOid['2.5.29.23']
  const aia = byOid['1.3.6.1.5.5.7.1.1']
  const cdp = byOid['2.5.29.31']
  const ski = byOid['2.5.29.14']
  const aki = byOid['2.5.29.35']
  const nc = byOid['2.5.29.20']
  const pc = byOid['2.5.29.21']
  const cp = byOid['2.5.29.32']
  const status = validityStatus(notBefore.ms, notAfter.ms)

  if (status.key === 'expired') warnings.push('证书已过期（' + status.daysSinceEnd + ' 天前）。本工具只按系统时间比日期，不做任何有效性判定')
  if (status.key === 'future') warnings.push('证书的 notBefore 还在未来，多半是系统时间或证书日期有一个不对')
  if (status.key === 'soon') warnings.push('还剩 ' + status.daysLeft + ' 天就过期了，记得续签')
  if (!san) warnings.push('没有 SAN 扩展：现代浏览器只看 SAN 匹配域名，这张证书大概率会被拒')
  if (spki.algo === 'RSA' && spki.bits && spki.bits < 2048) warnings.push('RSA 只有 ' + spki.bits + ' 位，低于当前 2048 位底线')
  if (innerSigAlg.hash === 'SHA-1') warnings.push('签名用的是 SHA-1，公网证书已被淘汰')
  if (/^MD/.test(innerSigAlg.hash)) warnings.push('签名摘要用的是 ' + innerSigAlg.hash + '，已被证明可碰撞，任何时候都不该信任')
  if (isCa === null) warnings.push('没有 basicConstraints 扩展：按 RFC 5280 这就是一张终端实体证书（不能签发下级）')

  const fingerprints = {
    md5: colonHex(md5Bytes(der)),
    sha1: colonHex(sha1Bytes(der)),
    sha256: colonHex(sha256Bytes(der)),
  }

  return {
    kind: 'certificate',
    kindCn: 'X.509 证书',
    pem: pemInfo ? pemInfo.pem : '-----BEGIN CERTIFICATE-----\n' + b64FromBytes(der, 64) + '\n-----END CERTIFICATE-----\n',
    pemLabel: pemInfo ? pemInfo.label : 'CERTIFICATE',
    derLength: der.length,
    version,
    versionText: 'v' + version + (version === 3 ? '（X.509 现行版本，扩展位才有意义）' : ''),
    serial: { dec: bytesToDecimal(serial), hex: hexBytes(serial).toUpperCase(), colon: colonHex(serial), bytes: serial.length },
    sigAlg: outerSigAlg,
    innerSigAlg,
    issuer,
    subject,
    selfSigned,
    ca: isCa,
    pathLen: bc && bc.decoded ? bc.decoded.pathLen : null,
    validity: { notBefore, notAfter, status, tz: localTzLabel(), daysLeft: status.daysLeft, text: status.text, tone: status.tone },
    publicKey: spki,
    signature: { hex: hexBytes(sig.bytes), bytes: sig.bytes.length, unusedBits: sig.unused },
    extensions,
    extByOid: byOid,
    san: {
      present: !!san,
      critical: san ? san.critical : false,
      dns: buckets.dns,
      ip: buckets.ip.concat(buckets.ip6),
      ipv4: buckets.ip,
      ipv6: buckets.ip6,
      email: buckets.email,
      uri: buckets.uri,
      dn: buckets.dn,
      other: buckets.other,
      hosts: buckets.dns.concat(buckets.ip).concat(buckets.ip6),
      wildcard: buckets.dns.filter((x) => x.indexOf('*') > -1),
      list: san && san.decoded ? san.decoded.list : [],
    },
    keyUsage: ku && ku.decoded ? ku.decoded.names : [],
    eku: eku && eku.decoded ? eku.decoded.names : [],
    ocsp: aia && aia.decoded ? aia.decoded.ocsp : [],
    caIssuers: aia && aia.decoded ? aia.decoded.issuers : [],
    crlUrls: cdp && cdp.decoded ? cdp.decoded.urls : [],
    ski: ski && ski.decoded ? ski.decoded.hex : '',
    aki: aki && aki.decoded ? aki.decoded : null,
    nameConstraints: nc && nc.decoded ? nc.decoded : null,
    policyConstraints: pc && pc.decoded ? pc.decoded : null,
    policies: cp && cp.decoded ? cp.decoded.policies : [],
    fingerprints,
    warnings,
    hadTrustBag,
    unrecognized: extensions.filter((x) => !x.known).map((x) => x.oid),
  }
}

/* =====================================================================
 * CSR（PKCS#10）
 * ===================================================================== */

/** 证书签名请求：读主体、公钥与「请求的扩展」 */
export function parseCsr(input) {
  const der = toBytes(input)
  const root = readDer(der)
  expect(root, T.SEQ, 'CertificationRequest')
  const info = expect(kid(root, 0), T.SEQ, 'certificationRequestInfo')
  const sigAlg = parseAlgId(kid(root, 1), '签名算法')
  const kids = info.children || []
  let idx = 0
  if (kids[0] && isType(kids[0], T.INTEGER)) idx = 1
  const subject = parseName(expect(kid(info, idx), T.SEQ, '主体 DN'))
  idx++
  const spki = parsePublicKey(kid(info, idx))
  idx++
  const requested = []
  const warnings = (root.warnings || []).slice()
  const attrNode = kids[idx]
  if (attrNode && attrNode.cls === 2 && attrNode.tagNumber === 0) {
    ;(attrNode.children || []).forEach((attr) => {
      try {
        const oid = oidOf(kid(attr, 0))
        if (oid !== '1.2.840.113549.1.9.14') return
        const setNode = kid(attr, 1)
        const raw = setNode.children && setNode.children[0]
        let seqNode = null
        if (raw) {
          if (isType(raw, T.OCTETSTRING)) seqNode = readDer(raw.value)
          else if (isType(raw, T.SEQ)) seqNode = raw
        }
        if (!seqNode) throw derErr('extensionRequest 的值结构不认识', attr.start)
        ;(seqNode.children || []).forEach((en) => {
          try {
            const eoid = oidOf(kid(en, 0))
            let critical = false
            let valueNode = null
            ;(en.children || []).slice(1).forEach((c) => {
              if (isType(c, T.BOOLEAN)) critical = c.value[0] !== 0
              else if (isType(c, T.OCTETSTRING)) valueNode = c
            })
            const meta = EXTENSION_NAMES[eoid] || null
            const item = { oid: eoid, name: meta ? meta.name : '', cn: meta ? meta.cn : '未收录的扩展', critical, doc: meta ? meta.doc : '', summary: '' }
            if (valueNode) {
              try {
                item.decoded = decodeExtensionValue(valueNode, eoid)
                item.summary = extSummary(eoid, item.decoded)
              } catch (e) {
                item.summary = '内容解析失败：' + e.message
              }
            }
            requested.push(item)
          } catch (e) { /* 单个扩展失败不影响其他 */ }
        })
      } catch (e) {
        warnings.push('CSR 里有个属性读不出来：' + e.message)
      }
    })
  }
  warnings.push('CSR 是「请求」而不是证书：没有有效期、没有签发者，内容还没被任何 CA 签名背书')
  return {
    kind: 'csr',
    kindCn: '证书签名请求 CSR（PKCS#10）',
    subject,
    publicKey: spki,
    sigAlg,
    requested,
    san: { present: false, dns: [], ip: [], email: [], uri: [], dn: [], other: [], hosts: [], wildcard: [], list: [] },
    derLength: der.length,
    fingerprints: { md5: colonHex(md5Bytes(der)), sha1: colonHex(sha1Bytes(der)), sha256: colonHex(sha256Bytes(der)) },
    warnings,
  }
}

/* =====================================================================
 * 私钥：只读头部，绝不解密、绝不输出私钥字节
 * ===================================================================== */

const KEY_HEAD_REFUSAL = '这是带口令的私钥，本工具不解密。'

function refusedHead(extra) {
  return Object.assign({
    kind: 'private-key',
    kindCn: '带口令的私钥（拒绝解密）',
    encrypted: true,
    bits: 0,
    rows: [],
    message: KEY_HEAD_REFUSAL,
    warnings: ['本工具没有、也不会加入任何私钥解密或导出功能；连私钥字节本身都不显示'],
  }, extra || {})
}

/**
 * 私钥头部元信息：区分 PKCS#1 / PKCS#8 / SEC1、算法、位数、是否加密。
 * 刻意不实现任何口令解密，也不显示 d / p / q 等私钥分量。
 * @param {string|Uint8Array|number[]} input
 */
export function parsePrivateKeyHead(input) {
  let der = null
  let pemInfo = null
  if (typeof input === 'string' && input.indexOf('-----BEGIN') > -1) {
    pemInfo = pemDecode(input)
    der = pemInfo.bytes
    if (pemInfo.encrypted) {
      return refusedHead({
        format: 'PEM 传统加密（头部带 DEK-Info）',
        algorithm: '未知（整体被口令加密）',
        dekInfo: pemInfo.encrypted.dekInfo || '',
        detail: 'DEK-Info: ' + (pemInfo.encrypted.dekInfo || '（未给出）') + '。解出口令需要额外实现，本工具刻意不做。',
        pemLabel: pemInfo.label,
      })
    }
    if (pemInfo.type === 'pkcs8-encrypted') {
      return refusedHead({
        format: 'PKCS#8 EncryptedPrivateKeyInfo',
        algorithm: '未知（整体被口令加密）',
        detail: 'PEM 类型是 ENCRYPTED PRIVATE KEY，内层密钥被口令派生的密钥加密了。',
        pemLabel: pemInfo.label,
      })
    }
    if (pemInfo.type === 'openssh') {
      return refusedHead({
        format: 'OpenSSH 自有格式',
        algorithm: '未知',
        message: 'OpenSSH 私钥用的是自己的二进制格式（不是 ASN.1），本工具不解析。',
        detail: '要用 PKCS#8 承载：ssh-keygen -p -m PKCS8 -f 文件名（会改写文件，谨慎操作）',
        pemLabel: pemInfo.label,
      })
    }
    if (NOT_PRIVATE_KEY_TYPES.indexOf(pemInfo.type) > -1) {
      throw new Error(
        '粘贴的是「' + pemInfo.label + '」（' + pemInfo.typeCn + '），不是私钥，没有可读的私钥头部。' +
          '证书请直接粘贴即可走证书解析；公钥本身不含口令，也不存在解密一说'
      )
    }
  } else {
    der = toBytes(input)
  }

  const root = readDer(der)
  expect(root, T.SEQ, '私钥最外层')
  const kids = root.children || []
  if (!kids.length) throw derErr('私钥结构是空的', root.start)

  const out = {
    kind: 'private-key',
    kindCn: '私钥（仅头部元信息）',
    encrypted: false,
    format: '',
    algorithm: '',
    algorithmCn: '',
    bits: 0,
    rows: [],
    message: '',
    detail: '',
    warnings: [],
  }
  const finish = () => {
    out.rows.push({ k: 'DER 长度', v: der.length + ' 字节' })
    out.rows.push({ k: '能力边界', v: '只读头部与公钥侧字段：不导出、不转换、不解密，也不显示任何私钥字节' })
    out.derLength = der.length
    if (pemInfo) out.pemLabel = pemInfo.label
    out.warnings = out.warnings.concat([
      '私钥要当作口令级敏感信息：不要粘进聊天工具、不要提交进仓库、不要贴到任何在线网站',
      '本工具不会输出私钥内容，但粘贴动作本身已经让密钥离开了你的控制范围',
    ])
    return out
  }

  // PKCS#8：SEQUENCE { INTEGER version, AlgorithmIdentifier, OCTET STRING privateKey }
  if (isType(kids[0], T.INTEGER) && isType(kids[1], T.SEQ) && isType(kids[2], T.OCTETSTRING)) {
    const alg = parseAlgId(kids[1], 'PKCS#8 算法标识')
    out.format = 'PKCS#8（version ' + smallInt(kids[0], 8) + '）'
    out.algorithm = alg.name || alg.oid
    out.algorithmCn = alg.cn
    out.rows.push(
      { k: '格式', v: out.format },
      { k: '算法', v: out.algorithm + ' — ' + alg.cn },
      { k: '算法 OID', v: alg.oid }
    )
    let sub = null
    try {
      sub = readDer(kids[2].value)
    } catch (e) {
      out.warnings.push('内层结构读不出来（' + e.message + '），只能报告外层算法')
    }
    if (sub) {
      const sc = sub.children || []
      if (alg.oid === '1.2.840.113549.1.1.1' && sc.length >= 9) {
        out.algorithm = 'RSA'
        out.bits = bitLenOf(uintBytes(sc[1]))
        out.rows.push(
          { k: '密钥长度', v: out.bits + ' 位（按模数 n）', big: true },
          { k: '公钥指数 e', v: String(smallInt(sc[2], 4294967295)) },
          { k: '内层结构', v: 'PKCS#1 RSAPrivateKey：n / e / d / p / q / dp / dq / qInv，其中 d、p、q 属于私钥部分，一律不显示' }
        )
      } else if (alg.oid === '1.2.840.10045.2.1') {
        out.algorithm = 'EC'
        const curveNode = sc.filter((k) => k.cls === 2 && k.tagNumber === 0)[0]
        const pubNode = sc.filter((k) => k.cls === 2 && k.tagNumber === 1)[0]
        let curveOid = ''
        if (curveNode && curveNode.children && curveNode.children[0]) curveOid = oidOf(curveNode.children[0])
        let bits = CURVE_BITS[curveOid] || 0
        if (!bits && pubNode && pubNode.children && pubNode.children[0]) {
          const bs = bitString(unwrapExplicit(pubNode))
          bits = bs.bytes.length > 1 ? ((bs.bytes.length - 1) / 2) * 8 : bs.bytes.length * 8
        }
        out.bits = bits
        out.rows.push(
          { k: '密钥长度', v: bits ? bits + ' 位' : '未知', big: true },
          { k: '曲线', v: curveOid ? (oidInfo(curveOid).name || curveOid) + '（' + curveOid + '）' : '内层未给出' },
          { k: '内层结构', v: 'SEC1 ECPrivateKey：含私钥标量 d，不显示' }
        )
      } else if (alg.oid === '1.3.101.110' || alg.oid === '1.3.101.111') {
        out.algorithm = alg.oid === '1.3.101.110' ? 'Ed25519' : 'Ed448'
        out.bits = alg.oid === '1.3.101.110' ? 256 : 456
        out.rows.push({ k: '密钥长度', v: out.bits + ' 位', big: true }, { k: '内层结构', v: 'OCTET STRING 里的裸私钥标量，不显示' })
      } else {
        out.rows.push({ k: '内层结构', v: '未识别的私钥内层，本工具不展开字段' })
      }
    }
    out.detail = 'PKCS#8 是个「包装壳」，真正的密钥在 OCTET STRING 里；这里只读壳与公钥侧元信息。'
    return finish()
  }

  // EncryptedPrivateKeyInfo（DER 层面就加密了，没有 PEM 头可看）
  if (isType(kids[0], T.SEQ) && (isType(kids[1], T.OCTETSTRING) || (kids[1] && kids[1].cls === 2))) {
    const alg = parseAlgId(kids[0], '加密算法标识')
    return refusedHead({
      format: 'PKCS#8 EncryptedPrivateKeyInfo（DER 层加密）',
      algorithm: (alg.name || alg.oid) + ' — ' + alg.cn,
      detail: '外层加密算法是 ' + (alg.name || alg.oid) + '；本工具不解密。',
      pemLabel: pemInfo ? pemInfo.label : 'DER',
    })
  }

  // PKCS#1 RSA：version 0 + 8 个以上 INTEGER
  if (isType(kids[0], T.INTEGER) && smallInt(kids[0], 8) === 0 && kids.length >= 9 && isType(kids[1], T.INTEGER)) {
    out.format = 'PKCS#1（RSA 传统格式）'
    out.algorithm = 'RSA'
    out.algorithmCn = oidInfo('1.2.840.113549.1.1.1').cn
    out.bits = bitLenOf(uintBytes(kids[1]))
    out.rows.push(
      { k: '格式', v: out.format },
      { k: '算法', v: 'RSA' },
      { k: '密钥长度', v: out.bits + ' 位（按模数 n）', big: true },
      { k: '公钥指数 e', v: String(smallInt(kids[2], 4294967295)) },
      { k: '字段', v: '共 ' + kids.length + ' 个 INTEGER：n / e / d / p / q / dp / dq / qInv，其中 d、p、q 属于私钥部分，一律不显示' }
    )
    out.detail = 'PKCS#1 是 RSA 专用老格式，字段顺序固定；跨语言场景建议转 PKCS#8。'
    return finish()
  }

  // SEC1 ECPrivateKey：version 1 + OCTET STRING d + [0] curve + [1] pub
  if (isType(kids[0], T.INTEGER) && smallInt(kids[0], 8) === 1 && isType(kids[1], T.OCTETSTRING)) {
    const curveNode = kids.filter((k) => k.cls === 2 && k.tagNumber === 0)[0]
    const pubNode = kids.filter((k) => k.cls === 2 && k.tagNumber === 1)[0]
    let curveOid = ''
    if (curveNode) {
      try {
        curveOid = oidOf(curveNode.children && curveNode.children.length ? curveNode.children[0] : curveNode)
      } catch (e) { /* 忽略 */ }
    }
    let bits = CURVE_BITS[curveOid] || 0
    if (!bits && pubNode && pubNode.children && pubNode.children[0]) {
      try {
        const bs = bitString(unwrapExplicit(pubNode))
        bits = bs.bytes.length > 1 ? ((bs.bytes.length - 1) / 2) * 8 : bs.bytes.length * 8
      } catch (e) { /* 忽略 */ }
    }
    out.format = 'SEC1 / PKCS#1（EC 传统格式）'
    out.algorithm = 'EC'
    out.algorithmCn = oidInfo('1.2.840.10045.2.1').cn
    out.bits = bits
    out.rows.push(
      { k: '格式', v: out.format },
      { k: '算法', v: 'EC' },
      { k: '曲线', v: curveOid ? (oidInfo(curveOid).name || curveOid) + '（' + curveOid + '）' : '未给出' },
      { k: '密钥长度', v: bits ? bits + ' 位' : '未知', big: true },
      { k: '字段', v: 'version / 私钥标量 d（不显示）/ 曲线 OID / 公钥点' }
    )
    out.detail = 'SEC1 是 openssl 早期 ec 命令的默认输出，PKCS#8 更通用。'
    return finish()
  }

  // PKCS#1 DSA：version 1 + p q g y x
  if (isType(kids[0], T.INTEGER) && smallInt(kids[0], 8) === 1 && kids.length >= 6 && isType(kids[1], T.INTEGER)) {
    out.format = 'PKCS#1（DSA 传统格式）'
    out.algorithm = 'DSA'
    out.algorithmCn = oidInfo('1.2.840.10040.4.1').cn
    out.bits = bitLenOf(uintBytes(kids[1]))
    out.rows.push(
      { k: '格式', v: out.format },
      { k: '算法', v: 'DSA' },
      { k: '密钥长度', v: out.bits + ' 位（按素数 p）', big: true },
      { k: '字段', v: 'version / p / q / g / y / x，其中 x 是私钥，不显示' }
    )
    return finish()
  }

  out.format = (pemInfo ? pemInfo.label : 'DER') + '（未识别的私钥结构）'
  out.algorithm = '未知'
  out.rows.push({ k: '格式', v: out.format })
  out.detail = '结构不符合 PKCS#1 / PKCS#8 / SEC1 的常见形状。本工具不猜测私钥字段，也不显示任何密钥内容。'
  out.warnings.push('未识别的私钥格式：可能是 OpenSSH 自有格式或 PKCS#8v2，本工具不支持')
  return finish()
}

/** 单独的公钥（PUBLIC KEY / RSA PUBLIC KEY PEM） */
export function parsePublicKeyPem(input) {
  const der = toBytes(input)
  const root = readDer(der)
  if (isType(root, T.SEQ) && root.children && root.children.length === 2 && isType(root.children[0], T.SEQ) && isType(root.children[1], T.BITSTRING)) {
    const spki = parsePublicKey(root)
    return {
      kind: 'public-key',
      kindCn: '公钥（SubjectPublicKeyInfo）',
      publicKey: spki,
      rows: spki.rows,
      derLength: der.length,
      fingerprints: { md5: colonHex(md5Bytes(der)), sha1: colonHex(sha1Bytes(der)), sha256: colonHex(sha256Bytes(der)) },
      warnings: (root.warnings || []).concat(['公钥按设计可以公开，但指纹仍要与可信渠道比对过才算数']),
    }
  }
  // PKCS#1 RSAPublicKey
  const wrapped = {
    kind: 'public-key',
    kindCn: 'RSA 公钥（PKCS#1 传统格式）',
    publicKey: { rows: [], algo: 'RSA', bits: 0, note: 'PKCS#1 公钥没有算法标识外壳，本工具只按 RSAPublicKey 结构读' },
    rows: [],
    derLength: der.length,
    fingerprints: { md5: colonHex(md5Bytes(der)), sha1: colonHex(sha1Bytes(der)), sha256: colonHex(sha256Bytes(der)) },
    warnings: ['RSA PUBLIC KEY 是比 PUBLIC KEY 更老的形式，跨语言场景建议转成 SubjectPublicKeyInfo'],
  }
  try {
    const n = uintBytes(kid(root, 0))
    const e = smallInt(kid(root, 1), 4294967295)
    wrapped.publicKey.bits = bitLenOf(n)
    wrapped.publicKey.modulusHex = groupHex(n)
    wrapped.rows = [
      { k: '算法', v: 'RSA' },
      { k: '密钥长度', v: wrapped.publicKey.bits + ' 位', big: true },
      { k: '公钥指数 e', v: String(e) + (e === 65537 ? '（标准值）' : '') },
      { k: '模数 n（十六进制）', v: wrapped.publicKey.modulusHex, mono: true, stack: true },
    ]
  } catch (err) {
    wrapped.warnings.push('结构既不符合 SubjectPublicKeyInfo 也不符合 RSAPublicKey：' + err.message)
  }
  return wrapped
}

/* =====================================================================
 * CRL（只读头部，诚实说明不查吊销）
 * ===================================================================== */

function parseCrl(input) {
  const der = toBytes(input)
  const root = readDer(der)
  const rows = []
  const warnings = [
    '这里只是把 CRL 自己写的内容读出来：不验签、不比对序列号，也不判断某张证书是否已被吊销',
    '要判断吊销状态必须联网取 CRL / OCSP 数据，本项目全程离线',
  ]
  try {
    const tbs = expect(kid(root, 0), T.SEQ, 'TBSCertList')
    const kids = tbs.children || []
    let i = 0
    if (isType(kids[i], T.INTEGER)) i++
    i++ // sigAlg
    const issuer = parseName(expect(kid(tbs, i), T.SEQ, '颁发者 DN'))
    i++
    const tu = parseAsnTime(kid(tbs, i))
    i++
    let nu = null
    try {
      nu = parseAsnTime(kid(tbs, i))
    } catch (e) { /* 新版 CRL 里 nextUpdate 可选 */ }
    let entryCount = 0
    if (kids[i + (nu ? 1 : 0)] && isType(kids[i + (nu ? 1 : 0)], T.SEQ)) entryCount = (kids[i + (nu ? 1 : 0)].children || []).length
    rows.push(
      { k: '颁发者', v: issuer.text },
      { k: '本次更新', v: tu.local + '（' + tu.utc + '）' },
      { k: '下次更新', v: nu ? nu.local + '（' + nu.utc + '）' : '未给出' },
      { k: '条目数', v: entryCount ? String(entryCount) + ' 个被吊销序列号（本工具不逐条展开）' : '0 个或未展开' }
    )
  } catch (e) {
    warnings.push('CRL 结构不完全符合预期，只给出部分信息：' + e.message)
  }
  rows.push({ k: 'DER 长度', v: der.length + ' 字节' })
  rows.push({ k: '指纹 SHA-256', v: colonHex(sha256Bytes(der)) })
  return { kind: 'crl', kindCn: '证书吊销列表 CRL', rows, derLength: der.length, warnings }
}

/* =====================================================================
 * 统一入口
 * ===================================================================== */

/**
 * 粘一段文本，自动判断类型并解析。
 * @returns {object} 带 kind 的结果，附 pemLabel / typeCn
 */
export function parseAny(text) {
  const s = String(text == null ? '' : text)
  if (!s.trim()) throw new Error('请先粘贴证书 / 公钥 / 私钥 / CSR 的 PEM 内容')
  if (s.indexOf('-----BEGIN') < 0) {
    const head = s.replace(/\r/g, '').split('\n').filter((x) => x.trim())[0]
    throw new Error(
      '这看起来不是 PEM：没有 -----BEGIN 起始行（开头是「' + String(head || '').slice(0, 40) + '」）。' +
        '二进制 DER 请先转换：openssl x509 -inform DER -outform PEM'
    )
  }
  const pem = pemDecode(s)
  const base = { pemLabel: pem.label, typeCn: pem.typeCn, derLength: pem.length, encryptedHeader: !!pem.encrypted }
  switch (pem.type) {
    case 'certificate':
    case 'trusted':
      return Object.assign(base, parseCertificate(pem.bytes))
    case 'csr':
      return Object.assign(base, parseCsr(pem.bytes))
    case 'spki':
    case 'pkcs1-rsa-public':
      return Object.assign(base, parsePublicKeyPem(pem.bytes))
    case 'pkcs1-rsa':
    case 'secg-pkcs1-ec':
    case 'pkcs8':
    case 'pkcs8-encrypted':
    case 'pkcs1-dsa':
    case 'openssh':
      return Object.assign(base, parsePrivateKeyHead(s))
    case 'crl':
      return Object.assign(base, parseCrl(pem.bytes))
    default:
      if (pem.encrypted) return Object.assign(base, parsePrivateKeyHead(s))
      throw new Error('PEM 类型「' + pem.label + '」本工具不支持（支持：证书 / 公钥 / 私钥头部 / CSR / CRL）')
  }
}

/* =====================================================================
 * 域名匹配试算
 * ===================================================================== */

function normalizeHost(h) {
  return String(h == null ? '' : h).trim().toLowerCase().replace(/\.$/, '')
}

/**
 * 判断证书能否用在这个主机名上 —— 纯字符串匹配（RFC 6125 的实用子集）。
 * 规则：
 *   · 大小写不敏感；结尾的根点忽略；
 *   · 有 SAN 只看 SAN（现代浏览器早就不看 CN）；没有 SAN 才回退看 CN，并标注这是历史行为；
 *   · 通配符只能出现在最左侧标签，且只吃掉一级标签：
 *     *.example.test 命中 a.example.test，不命中 example.test，也不命中 a.b.example.test；
 *   · 标签级比较，绝不跨点号；
 *   · IP 只按字面相等比较（IPv6 统一小写）。
 * 再次强调：这只是本地字符串匹配，不代表证书可信 —— 验签 / 信任链 / 吊销状态本工具都不做。
 * @param {object|string|Uint8Array} cert parseCertificate/parseAny 的结果，或证书 PEM
 * @param {string} hostname 要试算的域名或 IP
 */
export function matchesHost(cert, hostname) {
  const c = typeof cert === 'string' || cert instanceof Uint8Array || Array.isArray(cert) ? parseCertificate(cert) : cert
  if (!c || c.kind !== 'certificate') throw new Error('域名匹配需要一张证书，请先解析证书')
  const host = normalizeHost(hostname)
  if (!host) throw new Error('请输入要试算的域名或 IP')
  if (host.indexOf('*') > -1) throw new Error('试算输入应该是具体域名，不能带通配符')
  if (/\s/.test(host)) throw new Error('主机名里有空格，检查一下是不是粘多了内容')

  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.indexOf(':') > -1
  const hasSan = !!(c.san && c.san.present)
  const candidates = hasSan
    ? isIp ? (c.san.ip || []).concat(c.san.dns) : (c.san.dns || []).concat(c.san.ip)
    : c.subject && c.subject.map.CN ? [c.subject.map.CN] : []
  const source = hasSan ? 'SAN' : 'CN（历史回退：现代浏览器不再看 CN）'
  const checked = []

  for (let i = 0; i < candidates.length; i++) {
    const raw = String(candidates[i] || '')
    const pattern = normalizeHost(raw)
    if (!pattern) continue
    let hit = false
    let why = ''
    if (isIp) {
      hit = pattern === host
      why = hit ? 'IP 字面相等' : '与证书里的「' + pattern + '」不等'
    } else {
      const pl = pattern.split('.')
      const hl = host.split('.')
      if (pl.length !== hl.length) {
        why = '段数不同（证书 ' + pl.length + ' 段，输入 ' + hl.length + ' 段）：通配符只吃掉一级标签'
      } else {
        let bad = -1
        for (let k = 1; k < pl.length; k++) {
          if (pl[k] !== hl[k]) {
            bad = k
            break
          }
        }
        if (bad > 0) {
          why = '第 ' + (bad + 1) + ' 段「' + pl[bad] + '」与「' + hl[bad] + '」不等'
        } else if (pl[0] === hl[0]) {
          hit = true
          why = '全名逐段相等'
        } else if (pl[0].indexOf('*') < 0) {
          why = '最左段「' + pl[0] + '」与「' + hl[0] + '」不等'
        } else if (pl[0][0] !== '*' || pl[0].length === 1) {
          if (pl[0] === '*') {
            hit = hl[0].length > 0
            why = hit ? '*. 吃掉一级标签「' + hl[0] + '」' : '通配符不接受空标签'
          } else {
            why = '通配符写法不受支持（只允许整个最左标签为 *，或 * 出现在最左侧标签的任意位置之一，且一个标签里只能有一个 *）'
            if (/^\*[^*]+$/.test(pl[0])) {
              const suffix = pl[0].slice(1)
              hit = hl[0].length > suffix.length && hl[0].slice(-suffix.length) === suffix
              why = hit ? '前缀通配命中「' + hl[0] + '」' : '最左段「' + hl[0] + '」不以「' + suffix + '」结尾'
            }
          }
        } else {
          const suffix = pl[0].slice(1)
          hit = hl[0].length > suffix.length && hl[0].slice(-suffix.length) === suffix
          why = hit ? '前缀通配「' + pl[0] + '」命中「' + hl[0] + '」' : '最左段「' + hl[0] + '」不符合「' + pl[0] + '」'
        }
      }
    }
    checked.push({ name: raw, hit, why })
    if (hit) {
      return {
        matched: true,
        method: isIp ? 'ip' : 'dns',
        source,
        matchedName: raw,
        detail: why,
        note: '只是本地字符串匹配：不代表证书可信，也不代表它没被吊销（验签 / 信任链 / 吊销状态本工具都不做）',
        checked,
      }
    }
  }
  return {
    matched: false,
    method: isIp ? 'ip' : 'dns',
    source,
    matchedName: '',
    detail: candidates.length ? '把证书里的 ' + candidates.length + ' 个名称都比了一遍，没有一个匹配' : '证书里没有可比对的名称',
    note: hasSan ? 'SAN 里没有这个名称。浏览器会直接报名称不匹配' : '这张证书没有 SAN，只有 CN 可看；现代浏览器不接受只靠 CN 匹配的证书',
    checked,
  }
}

/* =====================================================================
 * 视图用的静态说明
 * ===================================================================== */

export const X509_LIMITS = [
  { k: '不验签', v: '没有实现 RSA / ECDSA / EdDSA 签名验证：改过内容的假证书在这里和真证书长得一样' },
  { k: '不建信任链', v: '不比对任何根证书，所以给不出「受信 / 不受信」的结论。是否受信由操作系统的信任库决定' },
  { k: '不查吊销', v: 'CRL 与 OCSP 都要联网取数据，本项目全程离线。这里只显示证书自己写明的下载地址，不代表查过状态' },
  { k: '私钥只读头', v: '只报格式 / 算法 / 位数 / 是否加密。带口令的私钥直接拒绝，不解密、不导出、不显示任何密钥字节' },
  { k: '域名匹配只是字符串比对', v: 'matchesHost 只看 SAN / CN 里的名字像不像，不看这张证书能不能信、有没有被吊销' },
  { k: '未收录的 OID 原样显示', v: '碰到没见过的 OID 与扩展会写「未收录」并给出原始字节，不会瞎猜含义' },
]

/** 视图里「扩展是什么意思」的速查（只挑最常碰到的几条） */
export const X509_EXT_REF = [
  { k: 'SAN 2.5.29.17', v: '域名清单。浏览器只认 SAN，CN 早就不看了；通配符 *.a.com 只管一层' },
  { k: 'BasicConstraints 2.5.29.19', v: 'CA:TRUE 才能签发下级证书；pathlen 限制还能往下套几层' },
  { k: 'KeyUsage 2.5.29.15', v: '这把密钥的用途上限：keyCertSign 是签发证书，cRLSign 是签发 CRL' },
  { k: 'EKU 2.5.29.37', v: '更具体的用途：1.3.6.1.5.5.7.3.1 是 HTTPS 服务端，3.3 是代码签名' },
  { k: 'AIA 1.3.6.1.5.5.7.1.1', v: 'OCSP 与上级 CA 证书的下载地址（本项目离线，只显示不访问）' },
  { k: 'CRLDP 2.5.29.31', v: '吊销列表的下载地址（同上，只显示不访问）' },
  { k: 'SKI / AKI 2.5.29.14 / .35', v: '公钥短指纹与「该用哪把公钥验签」，用来在链里定位证书' },
  { k: 'critical 位', v: '标了 critical 的扩展，验证方如果不认识就必须拒绝整张证书' },
]

/* =====================================================================
 * 内置样例（本地自签的测试证书，只用来演示字段长什么样）
 * ---------------------------------------------------------------------
 * 这三张都是用 openssl 现做现生成的自签测试证书，对应的私钥没有、也不会
 * 出现在本文件里；不含任何公网 CA 证书或可用凭据。示例日期会随时间推移
 * 变成「已过期」，那正好演示过期状态，属于预期行为。
 * ===================================================================== */

/** 样例一：RSA 2048 自签测试证书（含 C/ST/L/O/OU/CN 与三条 SAN） */
export const SAMPLE_RSA_PEM = `-----BEGIN CERTIFICATE-----
MIID6DCCAtCgAwIBAgIULmWs4pKLt0Q2MJrYEs8tvLZPyqkwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCQ04xCzAJBgNVBAgMAlpKMREwDwYDVQQHDAhIYW5nemhv
dTEXMBUGA1UECgwOUG9ja2V0S2l0IFRlc3QxDDAKBgNVBAsMA0RldjEVMBMGA1UE
AwwMZXhhbXBsZS50ZXN0MB4XDTI2MDkyMTA1NTM0MVoXDTI3MTAyNjA1NTM0MVow
azELMAkGA1UEBhMCQ04xCzAJBgNVBAgMAlpKMREwDwYDVQQHDAhIYW5nemhvdTEX
MBUGA1UECgwOUG9ja2V0S2l0IFRlc3QxDDAKBgNVBAsMA0RldjEVMBMGA1UEAwwM
ZXhhbXBsZS50ZXN0MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqac5
4QvtkaILb/KZskUpBsGv3/WoOtLvpQhNHaoVyj7g7p7OTBjanpWDbitGpviPbDCz
jKM30u39QpETQPCl5vzBR59QEW1HtpzthLB+73xd/eDfDvQ8MYMj75n3zT21wZvx
gRWMqyuugAyMKAo9j0pLtLIpmQ1DlcYwCk+/fhJfQTHEJKvhFbwpez7goLfjMC5l
sP4tnrT+bps5jz3I4LARkyeSB+3kE81c8LV1wW/vPb58LWnxk10ADs9NNumxfbpq
bmF6JKAOMF+z0A8iIXpMGPpc0j1s7n6xELJJA8tP8m3UV7A8+aiudkZcosUC6oIx
sj2Dfx6kLr4jMl81MwIDAQABo4GDMIGAMB0GA1UdDgQWBBSmocnK/1yTKEJOWEMG
ip34LyAFOzAfBgNVHSMEGDAWgBSmocnK/1yTKEJOWEMGip34LyAFOzAPBgNVHRMB
Af8EBTADAQH/MC0GA1UdEQQmMCSCDGV4YW1wbGUudGVzdIIOKi5leGFtcGxlLnRl
c3SHBH8AAAEwDQYJKoZIhvcNAQELBQADggEBAAJ4a8VrGlCApRW7smXbGhKYeUib
8DKq8xCkpbuQ37rv+2FSBQkGU66PeS7gY8omcUvjUOiYNyUFzz2bSniMNDuaNsed
93e31B7RRptuEExz3WcErj6gB4ww4PFlM9woJJ61j+U75TiIby2RHcsHDPR9DDJ/
+r596qjQAbFQHG8ucncNRJQsSWHNADMMYAQ0znthXh34l7FK+Lc6dsics3gmiVZr
CKwcGUxLzhmvSnyGQpcZDsdJgws6nB/BfdiqJm+uWoqNmlBXj3KHCLzO4G88sTsa
YP0mOmlfrLJhsx858fiQU+Vlnj45wk/LnVUvuJ2oE5GtbWMFL4D2C1pzX44=
-----END CERTIFICATE-----
`

/** 样例二：ECDSA P-256 + SHA-384，扩展最丰富（IPv6 / 邮箱 / URI / CRLDP / AIA / EKU / 策略） */
export const SAMPLE_EC_PEM = `-----BEGIN CERTIFICATE-----
MIIDXjCCAwWgAwIBAgIUJXkOs/NVS72jCaXfhPvUdbo2+/8wCgYIKoZIzj0EAwMw
OzELMAkGA1UEBhMCQ04xGjAYBgNVBAoMEVBvY2tldEtpdCBFQyBUZXN0MRAwDgYD
VQQDDAdlYy50ZXN0MB4XDTI2MDkyMTA1NTEwMFoXDTI2MTIyMDA1NTEwMFowOzEL
MAkGA1UEBhMCQ04xGjAYBgNVBAoMEVBvY2tldEtpdCBFQyBUZXN0MRAwDgYDVQQD
DAdlYy50ZXN0MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEbXqGOLoOQh5H5YTJ
2RDnCtRhhcYgC1BGnnVq8ZofYQrl/Mhu7N1suAv9nFJ+aRkaL7YUL3Z4GqEy9PKB
xcgbdKOCAeUwggHhMA8GA1UdEwEB/wQFMAMCAQEwDgYDVR0PAQH/BAQDAgWgMCcG
A1UdJQQgMB4GCCsGAQUFBwMBBggrBgEFBQcDAgYIKwYBBQUHAwMwWQYDVR0RBFIw
UIIHZWMudGVzdIIJKi5lYy50ZXN0hwQKAAAHhxAgAQ24AAAAAAAAAAAAAABCgQtv
cHNAZWMudGVzdIYVaHR0cHM6Ly9zdmMuZWMudGVzdC94MC8GA1UdHwQoMCYwJKAi
oCCGHmh0dHA6Ly9jcmwuZXhhbXBsZS50ZXN0L2VjLmNybDBfBggrBgEFBQcBAQRT
MFEwJAYIKwYBBQUHMAGGGGh0dHA6Ly9vY3NwLmV4YW1wbGUudGVzdDApBggrBgEF
BQcwAoYdaHR0cDovL2NhLmV4YW1wbGUudGVzdC9lYy5kZXIwHQYDVR0OBBYEFL1i
HAkEk/zF1cOtbnf35IyM5NVOMHYGA1UdIwRvMG2AFL1iHAkEk/zF1cOtbnf35IyM
5NVOoT+kPTA7MQswCQYDVQQGEwJDTjEaMBgGA1UECgwRUG9ja2V0S2l0IEVDIFRl
c3QxEDAOBgNVBAMMB2VjLnRlc3SCFCV5DrPzVUu9owml34T71HW6Nvv/MBEGA1Ud
IAQKMAgwBgYEVR0gADAKBggqhkjOPQQDAwNHADBEAiBFXc6/5nxNvmwchzYxgWLA
5aaF0MgZlak1a91VNGSFjwIgY8CZ1iMUloazeSsnR8hzUZthXDiwaY+THl1QXuJU
O/0=
-----END CERTIFICATE-----
`

/** 样例三：ECDSA P-384 的过期自签测试证书（专门用来演示「已过期」状态） */
export const SAMPLE_EXPIRED_PEM = `-----BEGIN CERTIFICATE-----
MIICMDCCAbagAwIBAgITaysodp+X49LeEV1b15RObJAy1jAKBggqhkjOPQQDAjBB
MQswCQYDVQQGEwJDTjEXMBUGA1UECgwOUG9ja2V0S2l0IFRlc3QxGTAXBgNVBAMM
EG9sZC5leGFtcGxlLnRlc3QwHhcNMjMwMTAxMDAwMDAwWhcNMjQwMTAxMDAwMDAw
WjBBMQswCQYDVQQGEwJDTjEXMBUGA1UECgwOUG9ja2V0S2l0IFRlc3QxGTAXBgNV
BAMMEG9sZC5leGFtcGxlLnRlc3QwdjAQBgcqhkjOPQIBBgUrgQQAIgNiAATYJDtZ
TwpVxhqbmhkXUCBlEM6PZ4AfFNsb2paKHLV6JewvsJMhrMXhefpAr0C2yvX++Kdo
dmYuMLre6bwd/CeXw5Hg6hrIMVQriBPvQIFJyC5D4wZQQ2Jw0EUn0gCFqAujcDBu
MB0GA1UdDgQWBBQB/U3M96EioImVzUZXU7WStCk+XTAfBgNVHSMEGDAWgBQB/U3M
96EioImVzUZXU7WStCk+XTAPBgNVHRMBAf8EBTADAQH/MBsGA1UdEQQUMBKCEG9s
ZC5leGFtcGxlLnRlc3QwCgYIKoZIzj0EAwIDaAAwZQIwB0rP+VEV+/6ys/biBrol
lBbb34yz8YLWTzLC1svnxngR/hl+uyBzce8JHn0AldgsAjEA8cAvtBqFjkxrybfs
SbTn15zbLnnbVcRSpj/Bayo3STn+YOd+6FWjtKQ0ojjgeRuq
-----END CERTIFICATE-----
`

/** 「载入示例」按钮的清单 */
export const X509_SAMPLES = [
  { key: 'rsa', name: 'RSA 自签示例', hint: '2048 位 RSA + SHA-256，含 C/ST/L/O/OU/CN 与三条 SAN', pem: SAMPLE_RSA_PEM },
  { key: 'ec', name: 'EC 富扩展示例', hint: 'P-256 + ECDSA-SHA-384，扩展最全：IPv6 / 邮箱 / URI / CRLDP / AIA', pem: SAMPLE_EC_PEM },
  { key: 'expired', name: '已过期示例', hint: 'P-384，2024 年 1 月就到期了，用来看过期状态怎么显示', pem: SAMPLE_EXPIRED_PEM },
]

export function samplePem(key) {
  const s = X509_SAMPLES.filter((x) => x.key === key)[0]
  if (!s) throw new Error('没有这个示例：' + key + '（可选 rsa / ec / expired）')
  return s.pem
}

/** parseAny 的别名，视图里用它更符合语义 */
export const parseCertInput = parseAny