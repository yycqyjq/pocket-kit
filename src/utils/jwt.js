/**
 * JWT 解析（只解码，不验签）
 */
import { base64Decode } from './base64'
import { formatDate, relativeTime } from './date'

const CLAIM_DOC = {
  iss: '签发者（issuer）',
  sub: '主体（subject），通常是用户 ID',
  aud: '受众（audience），谁可以接受这个令牌',
  exp: '过期时间（expiration），Unix 秒',
  nbf: '生效时间（not before），此时间之前无效',
  iat: '签发时间（issued at），Unix 秒',
  jti: '唯一编号（JWT ID），用于防重放',
  scope: '授权范围',
  scp: '授权范围',
  name: '姓名',
  nickname: '昵称',
  email: '邮箱',
  picture: '头像地址',
  roles: '角色列表',
  role: '角色',
  uid: '用户 ID',
  user_id: '用户 ID',
  tenant: '租户',
  azp: '授权方',
  client_id: '客户端 ID',
  sid: '会话 ID',
  nonce: '随机数',
  at_hash: 'access_token 摘要',
  auth_time: '认证时间',
}

const TIME_CLAIMS = { exp: 1, nbf: 1, iat: 1, auth_time: 1 }

function b64urlToText(part, label) {
  const s = String(part || '').trim()
  if (!s) throw new Error(label + '是空的')
  let txt
  try {
    txt = base64Decode(s, true)
  } catch (e) {
    throw new Error(label + '不是合法的 Base64URL 编码', { cause: e })
  }
  if (txt.indexOf('\uFFFD') > -1) {
    throw new Error(label + '解出来不是合法的 UTF-8 文本')
  }
  return txt
}

function normalizePem(txt, label) {
  let v
  try {
    v = JSON.parse(txt)
  } catch (e) {
    throw new Error(label + '不是合法 JSON：' + (e.message || '').replace(/^JSON\.parse:\s*/, ''), { cause: e })
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(label + '解析出来不是一个对象')
  return v
}

/** 算法家族说明 */
function describeAlg(alg) {
  if (!alg) return { family: '未知', symmetric: null, note: '头部里没有 alg 字段' }
  const a = String(alg).toUpperCase()
  if (a === 'NONE') return { family: '无签名', symmetric: null, note: '⚠️ alg 为 none，任何人都能伪造，绝不能用于生产' }
  if (a.startsWith('HS')) return { family: 'HMAC 对称签名', symmetric: true, note: '用同一个密钥签发和验证，密钥泄露即可伪造令牌' }
  if (a.startsWith('RS')) return { family: 'RSA 非对称签名', symmetric: false, note: '私钥签发、公钥验证，适合多方场景' }
  if (a.startsWith('PS')) return { family: 'RSA-PSS 非对称签名', symmetric: false, note: '比 RS 更现代的填充方式' }
  if (a.startsWith('ES')) return { family: 'ECDSA 非对称签名', symmetric: false, note: '签名短、性能好' }
  if (a.startsWith('ED')) return { family: 'EdDSA 签名', symmetric: false, note: '现代椭圆曲线签名' }
  return { family: '未识别的算法', symmetric: null, note: '' }
}

/**
 * @param {string} token 可带 "Bearer " 前缀
 */
export function decodeJwt(token) {
  const raw = String(token || '').trim().replace(/^Bearer\s+/i, '')
  if (!raw) throw new Error('请粘贴 JWT')

  const parts = raw.split('.')
  if (parts.length !== 3) {
    throw new Error(
      parts.length < 3
        ? 'JWT 应该有三段（头部.载荷.签名），现在只有 ' + parts.length + ' 段'
        : 'JWT 应该只有三段，现在有 ' + parts.length + ' 段'
    )
  }

  const header = normalizePem(b64urlToText(parts[0], '头部'), '头部')
  const payload = normalizePem(b64urlToText(parts[1], '载荷'), '载荷')
  const sigRaw = parts[2]

  const alg = header.alg
  const algInfo = describeAlg(alg)

  // 时间类声明
  const now = Math.floor(Date.now() / 1000)
  const claims = Object.keys(payload).map((k) => {
    const v = payload[k]
    const item = {
      key: k,
      doc: CLAIM_DOC[k] || '',
      raw: typeof v === 'object' ? JSON.stringify(v) : String(v),
      isTime: !!TIME_CLAIMS[k] && typeof v === 'number',
      time: '',
      tone: '',
      badge: '',
    }
    if (item.isTime) {
      item.time = formatDate(v * 1000, 'YYYY-MM-DD HH:mm:ss')
      if (k === 'exp') {
        if (v < now) {
          item.badge = '已过期'
          item.tone = 'bad'
          item.time += '（' + relativeTime(v * 1000) + '）'
        } else {
          item.badge = '有效'
          item.tone = 'ok'
          item.time += '（还有 ' + humanLeft(v - now) + '）'
        }
      } else {
        item.time += '（' + relativeTime(v * 1000) + '）'
      }
    }
    return item
  })

  const exp = typeof payload.exp === 'number' ? payload.exp : null
  const nbf = typeof payload.nbf === 'number' ? payload.nbf : null

  const warnings = []
  if (String(alg).toUpperCase() === 'NONE') warnings.push('alg 是 none，签名形同虚设')
  if (!exp) warnings.push('载荷里没有 exp，意味着这个令牌永不过期')
  else if (exp < now) warnings.push('令牌已经过期')
  if (nbf && nbf > now) warnings.push('令牌尚未生效（nbf 在未来）')

  return {
    ok: true,
    header,
    payload,
    claims,
    alg: String(alg || '(未指定)'),
    algInfo,
    hasSignature: !!sigRaw,
    sigBytes: sigRaw ? Math.floor((sigRaw.replace(/=+$/, '').length * 3) / 4) : 0,
    exp,
    nbf,
    expired: exp ? exp < now : null,
    warnings,
    headerText: JSON.stringify(header, null, 2),
    payloadText: JSON.stringify(payload, null, 2),
    status: exp ? (exp < now ? '已过期' : '有效') : '无有效期',
    statusTone: exp ? (exp < now ? 'bad' : 'ok') : 'warn',
  }
}

function humanLeft(sec) {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d) return d + ' 天 ' + h + ' 小时'
  if (h) return h + ' 小时 ' + m + ' 分'
  return m + ' 分'
}

/** 常用 JWT 声明速查 */
export const JWT_CLAIMS_REF = [
  { key: 'iss', desc: '签发者，一般填服务方域名' },
  { key: 'sub', desc: '主体，通常放用户唯一标识' },
  { key: 'aud', desc: '受众，声明这个令牌发给谁' },
  { key: 'exp', desc: '过期时间，Unix 秒。没有它等于永不过期' },
  { key: 'nbf', desc: '生效时间，早于此刻不接受' },
  { key: 'iat', desc: '签发时间，可用于判断令牌新旧' },
  { key: 'jti', desc: '唯一编号，配合黑名单防止重放' },
]
