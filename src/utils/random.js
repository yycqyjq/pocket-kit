/**
 * 随机数与随机生成
 * 说明：运行环境不保证有 crypto.getRandomValues，
 * 因此用「时间戳 + 计数器 + Math.random」混合播种，
 * 足以满足抽签/密码这类日常用途；若要用于生产密钥请自行接更安全的源。
 */

let seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0
let counter = 0

function nextUint32() {
  counter = (counter + 1) >>> 0
  // xorshift32
  seed ^= seed << 13
  seed >>>= 0
  seed ^= seed >>> 17
  seed ^= seed << 5
  seed >>>= 0
  const mixed = (seed ^ (Math.floor(Math.random() * 0xffffffff) >>> 0) ^ counter) >>> 0
  return mixed
}

/** [0, 1) 的浮点 */
export function random() {
  return nextUint32() / 4294967296
}

/** [min, max] 闭区间整数 */
export function randomInt(min, max) {
  const lo = Math.ceil(Math.min(min, max))
  const hi = Math.floor(Math.max(min, max))
  return lo + (nextUint32() % (hi - lo + 1))
}

export function pickOne(arr) {
  if (!arr || !arr.length) return undefined
  return arr[randomInt(0, arr.length - 1)]
}

/** 从数组里不重复地取 n 个 */
export function pickMany(arr, n) {
  return shuffle(arr).slice(0, Math.max(0, Math.min(n, arr.length)))
}

/** Fisher-Yates 洗牌，不改原数组 */
export function shuffle(arr) {
  const a = (arr || []).slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i)
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

const CHARSET = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digit: '0123456789',
  symbol: '!@#$%^&*()-_=+[]{};:,.?/~',
  similar: 'il1Lo0O',
  ambiguous: '{}[]()/\\\'"`~,;:.<>',
}

/**
 * 生成密码
 * opts: { length, upper, lower, digit, symbol, excludeSimilar, excludeAmbiguous, mustEach }
 */
export function generatePassword(opts) {
  const o = Object.assign(
    {
      length: 16,
      upper: true,
      lower: true,
      digit: true,
      symbol: false,
      excludeSimilar: true,
      excludeAmbiguous: false,
      mustEach: true,
    },
    opts || {}
  )
  const len = Math.max(1, Math.min(128, o.length | 0))
  let pools = []
  if (o.upper) pools.push([CHARSET.upper, 'upper'])
  if (o.lower) pools.push([CHARSET.lower, 'lower'])
  if (o.digit) pools.push([CHARSET.digit, 'digit'])
  if (o.symbol) pools.push([CHARSET.symbol, 'symbol'])
  if (!pools.length) pools = [[CHARSET.lower, 'lower']]

  const clean = (s) => {
    let r = s
    if (o.excludeSimilar) {
      r = r
        .split('')
        .filter((c) => CHARSET.similar.indexOf(c) === -1)
        .join('')
    }
    if (o.excludeAmbiguous) {
      r = r
        .split('')
        .filter((c) => CHARSET.ambiguous.indexOf(c) === -1)
        .join('')
    }
    return r
  }

  const usable = pools.map((p) => clean(p[0])).filter((s) => s.length)
  if (!usable.length) usable.push(CHARSET.lower)
  const all = usable.join('')

  const out = []
  if (o.mustEach && len >= usable.length) {
    // 先保证每类至少一个
    for (const pool of shuffle(usable)) {
      out.push(pool[randomInt(0, pool.length - 1)])
    }
  }
  while (out.length < len) {
    out.push(all[randomInt(0, all.length - 1)])
  }
  // 打乱位置，避免前几位固定类别
  const result = shuffle(out).join('')
  return { password: result, poolSize: all.length }
}

/** 密码强度评估 */
export function passwordStrength(pw) {
  const s = String(pw || '')
  if (!s) {
    return { score: 0, label: '空', entropy: 0, tips: ['请输入密码'], crack: '-' }
  }
  let poolSize = 0
  if (/[a-z]/.test(s)) poolSize += 26
  if (/[A-Z]/.test(s)) poolSize += 26
  if (/[0-9]/.test(s)) poolSize += 10
  if (/[^A-Za-z0-9]/.test(s)) poolSize += 33
  const entropy = s.length * Math.log2(poolSize || 1)

  const tips = []
  if (s.length < 12) tips.push('长度不足 12 位')
  if (!/[A-Z]/.test(s)) tips.push('缺少大写字母')
  if (!/[a-z]/.test(s)) tips.push('缺少小写字母')
  if (!/[0-9]/.test(s)) tips.push('缺少数字')
  if (!/[^A-Za-z0-9]/.test(s)) tips.push('缺少符号')
  if (/^(.)\1+$/.test(s)) tips.push('整串为同一字符')
  if (/(012|123|234|345|456|567|678|789|890|abc|qwe|asd|zxc|password|admin)/i.test(s)) {
    tips.push('包含常见弱模式')
  }
  if (!tips.length) tips.push('看起来不错')

  let score = 0
  if (entropy >= 28) score = 1
  if (entropy >= 45) score = 2
  if (entropy >= 65) score = 3
  if (entropy >= 90) score = 4
  const labels = ['很弱', '弱', '一般', '强', '很强']

  // 粗略估算离线爆破时间（1e10 次/秒）
  const seconds = Math.pow(2, entropy - 1) / 1e10
  let crack
  if (seconds < 1) crack = '瞬间'
  else if (seconds < 60) crack = Math.round(seconds) + ' 秒'
  else if (seconds < 3600) crack = Math.round(seconds / 60) + ' 分钟'
  else if (seconds < 86400) crack = Math.round(seconds / 3600) + ' 小时'
  else if (seconds < 31536000) crack = Math.round(seconds / 86400) + ' 天'
  else if (seconds / 31536000 < 1e6) crack = Math.round(seconds / 31536000) + ' 年'
  else crack = '远超宇宙年龄'

  return {
    score,
    label: labels[score],
    entropy: Math.round(entropy * 10) / 10,
    tips,
    crack,
  }
}

const HEX = '0123456789abcdef'

/** 标准 UUID v4 */
export function uuidV4() {
  let out = ''
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-'
    } else if (i === 14) {
      out += '4'
    } else if (i === 19) {
      out += HEX[(randomInt(0, 15) & 0x3) | 0x8]
    } else {
      out += HEX[randomInt(0, 15)]
    }
  }
  return out
}

/** 短 ID（类似 nanoid，默认 21 位） */
const ID_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict'
export function shortId(len, alphabet) {
  const a = alphabet || ID_ALPHABET
  const n = len || 21
  let out = ''
  for (let i = 0; i < n; i++) out += a[randomInt(0, a.length - 1)]
  return out
}

/** 24 位十六进制（形如 MongoDB ObjectId） */
export function objectIdLike() {
  let ts = Math.floor(Date.now() / 1000).toString(16)
  ts = ts.padStart(8, '0')
  let rest = ''
  for (let i = 0; i < 16; i++) rest += HEX[randomInt(0, 15)]
  return ts + rest
}

/** 32 位无符号十进制 ID */
export function uintId() {
  return String(nextUint32())
}

/** 类似雪花 ID：时间戳(41) + 随机(22)，共 19 位十进制 */
export function snowflakeLike() {
  const ts = BigInt(Date.now() - 1288834974657)
  const rnd = BigInt(randomInt(0, 4194303))
  return ((ts << 22n) | rnd).toString()
}

/**
 * 抽签 / 掷骰
 * kinds: 'coin' 硬币, 'dice' 骰子, 'lot' 抽签
 */
export function roll(kind, count) {
  const n = Math.max(1, Math.min(100, count || 1))
  const out = []
  if (kind === 'coin') {
    for (let i = 0; i < n; i++) out.push(randomInt(0, 1) ? '正' : '反')
  } else if (kind === 'dice') {
    for (let i = 0; i < n; i++) out.push(randomInt(1, 6))
  } else {
    for (let i = 0; i < n; i++) out.push(randomInt(1, 100))
  }
  return out
}
