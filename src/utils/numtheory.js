/**
 * 数论工具箱
 * ------------------------------------------------------------
 * 纯函数层：素性判定、质因数分解、约数、GCD/LCM、欧拉函数、
 * 素数表、数位与数字根、完全数 / 亲和数、罗马数字。
 *
 * 大数策略（参照 src/utils/radix.js 的写法）：
 *   优先用 BigInt 做精确计算；运行环境没有 BigInt 时降级为 Number，
 *   并在超过安全整数范围时抛出可读的提示，而不是悄悄丢精度。
 *
 * 素性判定：先试除小素数，再走 Miller–Rabin。
 *   基底取 2,3,5,7,11,13,17,19,23,29,31,37 —— 按 Feitsma–Galway /
 *   CRC Handbook 的结论，该基底组对 n < 3,317,044,064,679,887,385,961,981
 *   （约 3.3×10²⁴）是**确定性**的，不是概率性。
 * 分解用「小素数试除 + Pollard–Rho」，纯数学结果，不构成任何密码学建议。
 */

const HAS_BIGINT = (() => {
  try {
    return typeof BigInt === 'function' && BigInt(1) === BigInt('1')
  } catch (e) {
    return false
  }
})()

export const hasBigInt = HAS_BIGINT

/** Miller–Rabin 确定性基底 */
export const MR_BASES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]
export const MR_LIMIT_NOTE =
  '基底 2…37 共 12 个，对 n < 3.317×10²⁴ 为确定性判定（Feitsma–Galway 2008 结论）'

/** 小素数试除表，用于快速排除与分解的前段 */
const SMALL_PRIMES = (() => {
  const limit = 1000
  const sieve = []
  const out = []
  for (let i = 2; i <= limit; i++) {
    if (!sieve[i]) {
      out.push(i)
      for (let j = i * i; j <= limit; j += i) sieve[j] = true
    }
  }
  return out
})()

/** 分解过程中最多记录的步数，避免视图卡死 */
export const STEP_LIMIT = 120
/** 约数列表最多列出多少个 */
export const DIVISOR_LIST_LIMIT = 2000
/** 素数筛的最大上限（内存保护） */
export const SIEVE_LIMIT = 5000000
/** nthPrime 能精确算到的最大序号，就是 π(SIEVE_LIMIT)；再大要换分段筛 */
export const MAX_NTH_PRIME = 348513

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'

/** 0 的字面量随内核类型而变：BigInt 与 Number 用 === 永远不相等，必须统一取 */
const ZERO = HAS_BIGINT ? 0n : 0
const ONE = HAS_BIGINT ? 1n : 1

/**
 * 把用户输入规整成整数。
 * @returns {{big:(bigint|null), num:number, str:string, neg:boolean}}
 */
export function toInt(value) {
  if (HAS_BIGINT && typeof value === 'bigint') {
    return { big: value, num: Number(value), str: value.toString(), neg: value < 0n }
  }
  const s = String(value === null || value === undefined ? '' : value)
    .trim()
    .replace(/[\s,_]/g, '')
  if (!s) throw new Error('请输入一个整数')
  if (!/^[+-]?\d+$/.test(s)) throw new Error('只接受整数，不能有小数点或其他字符')
  const body = s.replace(/^[+-]/, '')
  const num = Number(body)
  const neg = s.charAt(0) === '-'
  if (!isFinite(num)) throw new Error('数字过大，无法处理')
  if (!HAS_BIGINT && num > Number.MAX_SAFE_INTEGER) {
    throw new Error('当前环境不支持 BigInt，请输入不超过 9007199254740991 的整数')
  }
  const big = HAS_BIGINT ? BigInt(neg ? '-' + body : body) : null
  return { big, num, str: (neg ? '-' : '') + body, neg }
}

/** 正整数部分；0 / 负数按需要各自处理，这里只返回绝对值 */
function absInt(value) {
  const t = toInt(value)
  if (HAS_BIGINT) return { big: t.big < 0n ? -t.big : t.big, str: t.str.replace(/^-/, ''), neg: t.neg, zero: t.big === 0n }
  const n = Math.abs(t.num)
  return { big: null, str: String(n), neg: t.neg, zero: n === 0, num: n }
}

/* ------------------------------------------------------------ BigInt 内核 */

function bigModPow(base, exp, mod) {
  let result = 1n
  let b = base % mod
  let e = exp
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod
    b = (b * b) % mod
    e >>= 1n
  }
  return result
}

function bigGcd(a, b) {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

function bigIsPrimeMr(n) {
  if (n < 2n) return false
  for (let i = 0; i < SMALL_PRIMES.length; i++) {
    const p = BigInt(SMALL_PRIMES[i])
    if (n === p) return true
    if (n % p === 0n) return false
  }
  // 写 n - 1 = d · 2^s
  let d = n - 1n
  let s = 0n
  while ((d & 1n) === 0n) {
    d >>= 1n
    s++
  }
  for (let i = 0; i < MR_BASES.length; i++) {
    const a = BigInt(MR_BASES[i])
    if (a >= n) continue
    let x = bigModPow(a, d, n)
    if (x === 1n || x === n - 1n) continue
    let cont = false
    for (let r = 1n; r < s; r++) {
      x = (x * x) % n
      if (x === n - 1n) {
        cont = true
        break
      }
    }
    if (!cont) return false
  }
  return true
}

function bigPollard(n) {
  if (n % 2n === 0n) return 2n
  let x = 2n
  let y = 2n
  let d = 1n
  let c = 1n
  const f = (v, cc) => (v * v + cc) % n
  while (d === 1n) {
    x = f(x, c)
    y = f(f(y, c), c)
    const diff = x > y ? x - y : y - x
    d = bigGcd(diff, n)
    if (d === n) {
      c++
      x = 2n
      y = 2n
      d = 1n
      if (c > 40n) return n
    }
  }
  return d
}

function bigFactor(n, out, steps) {
  if (n <= 1n) return
  // 前段用试除，过程对用户可读
  for (let i = 0; i < SMALL_PRIMES.length; i++) {
    const p = BigInt(SMALL_PRIMES[i])
    if (p * p > n) break
    while (n % p === 0n) {
      out.push(p)
      if (steps && steps.length < STEP_LIMIT) steps.push(fmtBig(n * p) + ' ÷ ' + fmtBig(p) + ' = ' + fmtBig(n))
      n = n / p
    }
  }
  if (n <= 1n) return
  if (bigIsPrimeMr(n)) {
    out.push(n)
    if (steps && steps.length < STEP_LIMIT) steps.push(fmtBig(n * n) + ' = ' + fmtBig(n) + ' × ' + fmtBig(n) + '（剩下的是素数）')
    return
  }
  // Pollard–Rho 递归
  const stack = [n]
  let guard = 0
  while (stack.length) {
    const m = stack.pop()
    if (m <= 1n) continue
    if (bigIsPrimeMr(m)) {
      out.push(m)
      if (steps && steps.length < STEP_LIMIT) steps.push(fmtBig(m) + ' 是素数，作为末级因子')
      continue
    }
    if (guard++ > 400) {
      out.push(m)
      if (steps) steps.push('分解层数过多，' + fmtBig(m) + ' 作为合数残留下')
      continue
    }
    const d = bigPollard(m)
    if (d <= 1n || d >= m) {
      out.push(m)
      if (steps) steps.push(fmtBig(m) + ' 未能继续分解（按合数保留）')
      continue
    }
    if (steps && steps.length < STEP_LIMIT) steps.push(fmtBig(m) + ' = ' + fmtBig(d) + ' × ' + fmtBig(m / d) + '（Pollard–Rho）')
    stack.push(d)
    stack.push(m / d)
  }
}

function fmtBig(b) {
  return b.toString()
}

/* ------------------------------------------------------------ Number 降级内核 */

function numMulmod(a, b, m) {
  // 双倍相加避免溢出：要求 m < 2^52
  let r = 0
  let x = a % m
  let y = b
  while (y > 0) {
    if (y & 1) r = (r + x) % m
    x = (x * 2) % m
    y = Math.floor(y / 2)
  }
  return r
}

function numPowmod(base, exp, mod) {
  let r = 1
  let b = base % mod
  let e = exp
  while (e > 0) {
    if (e & 1) r = numMulmod(r, b, mod)
    b = numMulmod(b, b, mod)
    e = Math.floor(e / 2)
  }
  return r
}

function numIsPrime(n) {
  if (n < 2) return false
  if (n > 1e15) return false // 降级路径不承诺超大数
  if (n % 2 === 0) return n === 2
  for (let i = 3; i * i <= n && i < 100000; i += 2) if (n % i === 0) return false
  let d = n - 1
  let s = 0
  while (d % 2 === 0) {
    d /= 2
    s++
  }
  for (let i = 0; i < MR_BASES.length; i++) {
    const a = MR_BASES[i]
    if (a >= n) continue
    let x = numPowmod(a, d, n)
    if (x === 1 || x === n - 1) continue
    let ok = false
    for (let r = 1; r < s; r++) {
      x = numMulmod(x, x, n)
      if (x === n - 1) {
        ok = true
        break
      }
    }
    if (!ok) return false
  }
  return true
}

function numFactor(n, out, steps) {
  for (let i = 0; i < SMALL_PRIMES.length; i++) {
    const p = SMALL_PRIMES[i]
    if (p * p > n) break
    while (n % p === 0) {
      out.push(p)
      if (steps && steps.length < STEP_LIMIT) steps.push(n * p + ' ÷ ' + p + ' = ' + n)
      n = n / p
    }
  }
  if (n <= 1) return
  if (numIsPrime(n)) {
    out.push(n)
    if (steps && steps.length < STEP_LIMIT) steps.push(n * n + ' = ' + n + ' × ' + n + '（剩下的是素数）')
    return
  }
  // 剩余的是个大合数，只能继续试除；给出提示而不是死循环
  let guard = 0
  for (let p = 1001; p * p <= n; p += 2) {
    if (guard++ > 3000000) break
    while (n % p === 0) {
      out.push(p)
      if (steps && steps.length < STEP_LIMIT) steps.push(n * p + ' ÷ ' + p + ' = ' + n)
      n = n / p
    }
  }
  if (n > 1) out.push(n)
}

/* ------------------------------------------------------------ 对外接口 */

/** 素性判定，只返回 true / false */
export function isPrime(value) {
  const r = primeTest(value)
  return r.prime
}

/**
 * 素性判定（带过程）
 * @returns {{n:string, prime:boolean, method:string, reason:string, divisor:(string|null),
 *            exact?:boolean}} — small / exact 曾在旧注释里，实现从不返回 small，
 *            仅「命中小素数表」分支返回 exact=true；全项目无人读取这两个字段，
 *            故 JSDoc 对齐实现（去掉 small、补可选 exact），不动实现。
 */
export function primeTest(value) {
  const a = absInt(value)
  const n = HAS_BIGINT ? a.big : a.num
  if (n < 2) {
    return {
      n: a.str,
      prime: false,
      method: '定义',
      reason: a.str + ' 小于 2，按定义既不是素数也不是合数',
      divisor: null,
    }
  }
  if (HAS_BIGINT) {
    for (let i = 0; i < SMALL_PRIMES.length; i++) {
      const p = BigInt(SMALL_PRIMES[i])
      if (n === p) return { n: a.str, prime: true, method: '试除命中素数表', reason: a.str + ' 本身在小素数表内', divisor: null, exact: true }
      if (n % p === 0n) {
        return { n: a.str, prime: false, method: '试除', reason: a.str + ' = ' + p + ' × ' + n / p, divisor: String(p) }
      }
    }
    return {
      n: a.str,
      prime: bigIsPrimeMr(n),
      method: 'Miller–Rabin（确定性基底 2…37）',
      reason: MR_LIMIT_NOTE,
      divisor: null,
    }
  }
  return {
    n: a.str,
    prime: numIsPrime(n),
    method: 'Miller–Rabin（Number 降级实现，乘法用双倍取模避免溢出）',
    reason: '当前环境无 BigInt，超过 10¹⁵ 的数不保证',
    divisor: null,
  }
}

/**
 * 质因数分解。
 * @returns {{n:string, factors:Array<{prime:string,exp:number,primeNum:number}>, steps:string[],
 *            expression:string, divisorCount:string, divisorCountNum:number, sumDivisors:string,
 *            squareFree:boolean, radical:string, distinctCount:number, totalFactors:number,
 *            display:string}}
 */
export function factorize(value) {
  const a = absInt(value)
  const n = HAS_BIGINT ? a.big : a.num
  const steps = []
  const raw = []
  const isZero = n === ZERO
  if (n <= 1) {
    return {
      n: a.str,
      factors: [],
      display: a.str,
      steps: [isZero ? '0 没有质因数分解（任何素数的 0 次幂乘积都不等于 0）' : '1 是单位，不是素数也没有质因数'],
      expression: a.str,
      divisorCount: isZero ? '∞' : '1',
      sumDivisors: isZero ? '—' : '1',
      squareFree: false,
      radical: a.str,
      distinctCount: 0,
      totalFactors: 0,
      zero: isZero,
    }
  }
  if (HAS_BIGINT) bigFactor(n, raw, steps)
  else numFactor(n, raw, steps)

  raw.sort(HAS_BIGINT ? (x, y) => (x < y ? -1 : x > y ? 1 : 0) : (x, y) => x - y)
  const merged = []
  for (let i = 0; i < raw.length; i++) {
    const f = raw[i]
    const last = merged[merged.length - 1]
    if (last && String(last.prime) === String(f)) last.exp++
    else merged.push({ prime: String(f), primeNum: Number(f), exp: 1 })
  }
  const isPrimeOnly = merged.length === 1 && merged[0].exp === 1
  if (isPrimeOnly) steps.unshift(a.str + ' 本身就是素数，无需分解')

  let divisorCount = HAS_BIGINT ? 1n : 1
  let sumDiv = HAS_BIGINT ? 1n : 1
  let radical = HAS_BIGINT ? 1n : 1
  let totalExp = 0
  for (let i = 0; i < merged.length; i++) {
    const m = merged[i]
    totalExp += m.exp
    if (HAS_BIGINT) {
      const p = BigInt(m.prime)
      divisorCount *= BigInt(m.exp + 1)
      sumDiv *= bigGeoSum(p, m.exp)
      radical *= p
    } else {
      divisorCount *= m.exp + 1
      let g = 1
      let term = 1
      for (let k = 0; k < m.exp; k++) {
        term *= m.primeNum
        g += term
      }
      sumDiv *= g
      radical *= m.primeNum
    }
  }
  return {
    n: a.str,
    negative: a.neg,
    factors: merged,
    steps,
    expression: merged.map((m) => (m.exp === 1 ? m.prime : m.prime + '^' + m.exp)).join(' × '),
    display: merged.map((m) => (m.exp === 1 ? m.prime : m.prime + '^' + m.exp)).join(' × '),
    divisorCount: String(divisorCount),
    divisorCountNum: Number(divisorCount),
    sumDivisors: String(sumDiv),
    squareFree: merged.every((m) => m.exp === 1),
    radical: String(radical),
    distinctCount: merged.length,
    totalFactors: totalExp,
    prime: isPrimeOnly,
  }
}

/** 1 + p + p² + … + p^e */
function bigGeoSum(p, e) {
  let term = 1n
  let sum = 1n
  for (let i = 0; i < e; i++) {
    term *= p
    sum += term
  }
  return sum
}

/**
 * 约数列表 / 个数 / 约数和 + 完全数（盈数、亏数）判定。
 * 列表元素超过 DIVISOR_LIST_LIMIT 时只给个数与和，避免撑爆视图。
 */
export function divisors(value) {
  const a = absInt(value)
  const n = HAS_BIGINT ? a.big : a.num
  if (n === ZERO) throw new Error('0 的约数有无穷多个，换个非零整数')
  const f = factorize(a.str)
  let list
  if (HAS_BIGINT) {
    list = buildDivisorsBig(BigInt(f.n), f.factors)
  } else {
    list = buildDivisorsNum(Math.round(n), f.factors)
  }
  const count = Number(f.divisorCount)
  const truncated = list.length > DIVISOR_LIST_LIMIT
  if (truncated) list = list.slice(0, DIVISOR_LIST_LIMIT)
  const sumAll = f.sumDivisors
  // 真约数和 = 约数和 − 自身；用 BigInt 精确比，避免 1e17 级别判错
  let proper
  let kind
  if (HAS_BIGINT) {
    const p = BigInt(sumAll) - BigInt(f.n)
    proper = p.toString()
    const self = BigInt(f.n)
    kind = p === self ? 'perfect' : p > self ? 'abundant' : 'deficient'
  } else {
    proper = String(Number(sumAll) - Number(f.n))
    kind = Number(proper) === Number(f.n) ? 'perfect' : Number(proper) > Number(f.n) ? 'abundant' : 'deficient'
  }
  return {
    n: f.n,
    list: list.map(String),
    count: f.divisorCount,
    countNum: count,
    sumAll,
    sumProper: proper,
    truncated,
    kind,
    kindName: { perfect: '完全数', abundant: '盈数（真约数和超过自身）', deficient: '亏数（真约数和小于自身）' }[kind],
    factorization: f.display,
  }
}

function buildDivisorsBig(n, factors) {
  let acc = [1n]
  for (let i = 0; i < factors.length; i++) {
    const p = BigInt(factors[i].prime)
    const e = factors[i].exp
    const grown = []
    for (let k = 0; k < acc.length; k++) {
      let mul = 1n
      for (let j = 0; j <= e; j++) {
        grown.push(acc[k] * mul)
        mul *= p
      }
    }
    acc = grown
    if (acc.length > DIVISOR_LIST_LIMIT * 8) break
  }
  acc.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))
  return acc
}

function buildDivisorsNum(n, factors) {
  let acc = [1]
  for (let i = 0; i < factors.length; i++) {
    const p = factors[i].primeNum
    const e = factors[i].exp
    const grown = []
    for (let k = 0; k < acc.length; k++) {
      let mul = 1
      for (let j = 0; j <= e; j++) {
        grown.push(acc[k] * mul)
        mul *= p
      }
    }
    acc = grown
    if (acc.length > DIVISOR_LIST_LIMIT * 8) break
  }
  acc.sort((x, y) => x - y)
  return acc
}

/** 欧几里得算法求 GCD（两两归约，支持任意多个数） */
export function gcdAll(values) {
  const list = toList(values)
  if (!list.length) throw new Error('请至少输入两个整数')
  if (list.length === 1) return { result: String(absInt(list[0]).str), inputs: [absInt(list[0]).str], steps: ['只有一个数，GCD 就是它本身'] }
  let g = HAS_BIGINT ? BigInt(absInt(list[0]).str) : absInt(list[0]).num
  const steps = []
  for (let i = 1; i < list.length; i++) {
    const b = HAS_BIGINT ? BigInt(absInt(list[i]).str) : absInt(list[i]).num
    const before = g
    g = HAS_BIGINT ? bigGcd(g, b) : numGcd(g, b)
    steps.push('gcd(' + before + ', ' + b + ') = ' + g)
  }
  return { result: String(g), inputs: list.map((v) => absInt(v).str), steps }
}

export function gcd(a, b) {
  return gcdAll([a, b]).result
}

function numGcd(a, b) {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

/** 最小公倍数：lcm = |a·b| / gcd，多数时两两累加 */
export function lcmAll(values) {
  const list = toList(values)
  if (!list.length) throw new Error('请至少输入两个整数')
  if (list.length === 1) return { result: absInt(list[0]).str, inputs: [absInt(list[0]).str], steps: ['只有一个数，LCM 就是它本身'] }
  let l = HAS_BIGINT ? BigInt(absInt(list[0]).str) : absInt(list[0]).num
  const steps = []
  for (let i = 1; i < list.length; i++) {
    const b = HAS_BIGINT ? BigInt(absInt(list[i]).str) : absInt(list[i]).num
    if (l === ZERO || b === ZERO) {
      l = ZERO
      steps.push('出现 0，任何数与 0 的 LCM 定义为 0')
      continue
    }
    const g = HAS_BIGINT ? bigGcd(l, b) : numGcd(l, b)
    const before = l
    l = HAS_BIGINT ? (l / g) * b : (l / g) * b
    if (!HAS_BIGINT && !isFinite(l)) throw new Error('结果过大，当前环境无法精确表示')
    steps.push('lcm(' + before + ', ' + b + ') = ' + l)
  }
  return { result: String(l), inputs: list.map((v) => absInt(v).str), steps }
}

export function lcm(a, b) {
  return lcmAll([a, b]).result
}

/** 互质判定：GCD 为 1 */
export function coprime(a, b) {
  const g = gcdAll([a, b])
  const set = toList([a, b]).map((v) => absInt(v))
  const fa = factorize(set[0].str)
  const fb = factorize(set[1].str)
  const shared = fa.factors.filter((x) => fb.factors.some((y) => y.prime === x.prime))
  return {
    yes: g.result === '1',
    gcd: g.result,
    a: set[0].str,
    b: set[1].str,
    sharedFactors: shared.map((x) => x.prime),
    note: g.result === '1' ? '最大公因数只有 1，两者互质' : '最大公因数是 ' + g.result + '，两者不互质',
  }
}

function toList(values) {
  let arr = values
  if (typeof values === 'string') arr = values.split(/[\s,，;；、]+/)
  if (!Array.isArray(arr)) arr = arr === null || arr === undefined || arr === '' ? [] : [arr]
  return arr
    .map((v) => (typeof v === 'string' ? v.trim() : v))
    .filter((v) => v !== '' && v !== null && v !== undefined)
}

/**
 * 欧拉函数 φ(n)：n 中与 n 互质的正整数个数。
 * φ(n) = n · ∏(1 - 1/p)
 */
export function phi(value) {
  const a = absInt(value)
  const n = HAS_BIGINT ? a.big : a.num
  if (n === ZERO) throw new Error('φ(0) 没有定义')
  if (n === ONE) return { n: '1', result: '1', formula: 'φ(1) = 1（约定）', primes: [] }
  const f = factorize(a.str)
  let r = HAS_BIGINT ? n : n
  const primes = []
  for (let i = 0; i < f.factors.length; i++) {
    const p = f.factors[i].prime
    primes.push(p)
    if (HAS_BIGINT) {
      const bp = BigInt(p)
      r = (r / bp) * (bp - 1n)
    } else {
      const bp = Number(p)
      r = (r / bp) * (bp - 1)
    }
  }
  return {
    n: a.str,
    result: String(r),
    primes,
    formula: 'φ(' + a.str + ') = ' + a.str + f.factors.map((x) => ' × (1 − 1/' + x.prime + ')').join('') + ' = ' + r,
    factorization: f.display,
  }
}

/** 相邻素数：上/下一个素数与间隔，并判断是否孪生素数 */
export function primeNeighbors(value) {
  const a = absInt(value)
  if (HAS_BIGINT) {
    const n = a.big
    if (n <= 2n) {
      return { n: a.str, prev: null, next: '3', gap: null, self: bigIsPrimeMr(n), twin: false }
    }
    let p = n - 1n
    while (p > 1n && !bigIsPrimeMr(p)) p--
    let q = n + 1n
    let guard = 0
    while (!bigIsPrimeMr(q) && guard++ < 100000n) q++
    const prev = p > 1n ? String(p) : null
    const self = bigIsPrimeMr(n)
    const gapUp = Number(q - n)
    const gapDown = prev ? Number(n - BigInt(prev)) : null
    return {
      n: a.str,
      prev,
      next: String(q),
      gap: prev ? String(gapUp + gapDown) : null,
      self,
      twin: self && (gapUp === 2 || gapDown === 2),
    }
  }
  let p = Math.floor(a.num) - 1
  while (p > 1 && !numIsPrime(p)) p--
  let q = Math.ceil(a.num) + 1
  let guard = 0
  while (!numIsPrime(q) && guard++ < 100000) q++
  return { n: a.str, prev: p > 1 ? String(p) : null, next: String(q), gap: p > 1 ? String(q - p) : null, self: numIsPrime(Math.round(a.num)), twin: false }
}

/**
 * 第 n 个素数（n 从 1 开始，1→2、2→3、3→5）。
 * 上限用 p_n < n(ln n + ln ln n) 估算后筛。
 */
export function nthPrime(n) {
  const k = Math.round(Number(n))
  if (!(k >= 1)) throw new Error('请输入不小于 1 的序号')
  if (k > MAX_NTH_PRIME) throw new Error('序号过大：受筛数上限 ' + SIEVE_LIMIT + ' 限制，最多支持第 ' + MAX_NTH_PRIME + ' 个素数')
  if (k < 6) return [2, 3, 5, 7, 11][k - 1]
  const estimate = k * (Math.log(k) + Math.log(Math.log(k))) + 6
  const primes = sievePrimes(Math.min(SIEVE_LIMIT, Math.ceil(estimate)))
  if (primes.length < k) throw new Error('估算区间不足，请减小序号')
  return primes[k - 1]
}

/** 素数筛（埃氏筛），返回不超过 limit 的全部素数 */
export function sievePrimes(limit) {
  let n = Math.floor(Number(limit))
  if (!isFinite(n) || n < 2) return []
  if (n > SIEVE_LIMIT) n = SIEVE_LIMIT
  const composite = new Uint8Array(n + 1)
  const out = []
  for (let i = 2; i <= n; i++) {
    if (!composite[i]) {
      out.push(i)
      if (i * i <= n) for (let j = i * i; j <= n; j += i) composite[j] = 1
    }
  }
  return out
}

/**
 * π(x)：不超过 x 的素数个数。
 * x 在筛范围内给出精确值，否则用 x/ln x 近似并标注。
 */
export function primeCountUpTo(x) {
  const a = absInt(x)
  const n = HAS_BIGINT ? Number(a.big) : a.num
  if (!isFinite(n) || n < 2) return { count: 0, exact: true, note: '小于 2 没有素数' }
  if (n <= SIEVE_LIMIT) return { count: sievePrimes(Math.floor(n)).length, exact: true, note: '用埃氏筛精确计数' }
  const approx = n / Math.log(n)
  return { count: Math.round(approx), exact: false, note: '超过筛上限 ' + SIEVE_LIMIT + '，用 x/ln x 近似，仅供参考' }
}

/** 某个进制下的表示、位数、数位和、数字根 */
export const DIGIT_BASES = [
  { key: '2', name: '二进制' },
  { key: '8', name: '八进制' },
  { key: '10', name: '十进制' },
  { key: '12', name: '十二进制' },
  { key: '16', name: '十六进制' },
  { key: '36', name: '三十六进制' },
]

/**
 * @param {string|number|bigint} value 整数
 * @param {number} base 2~36
 */
export function digitInfo(value, base) {
  const b = Math.round(Number(base)) || 10
  if (b < 2 || b > 36) throw new Error('进制要在 2 到 36 之间')
  const a = absInt(value)
  let repr
  if (HAS_BIGINT) {
    repr = bigToBase(a.big, b)
  } else {
    repr = a.num.toString(b)
  }
  const digits = repr.length
  const sum = digitSumOfString(repr, b)
  const steps = []
  let cur = repr
  let guard = 0
  while (cur.length > 1 && guard++ < 200) {
    const s = digitSumOfString(cur, b)
    steps.push(cur + ' → 数位和 ' + (HAS_BIGINT ? bigToBase(BigInt(s), b) : s.toString(b)))
    cur = HAS_BIGINT ? bigToBase(BigInt(s), b) : s.toString(b)
  }
  return {
    base: b,
    repr: (a.neg ? '-' : '') + repr,
    digitCount: digits,
    digitSum: HAS_BIGINT ? bigToBase(BigInt(sum), b) : sum.toString(b),
    digitSumDecimal: sum,
    digitalRoot: HAS_BIGINT ? bigToBase(BigInt(digitalRootOf(sum, b)), b) : String(digitalRootOf(sum, b)),
    steps,
    // 数字根 = 1 + (n-1) mod (b-1)（n > 0 时），这里顺带校验一次
    rootByFormula: a.zero ? '0' : HAS_BIGINT ? bigToBase(BigInt(1) + ((a.big - 1n) % BigInt(b - 1)), b) : String(1 + ((a.num - 1) % (b - 1))),
    note: '数字根即不断求数位和直到剩一位；b 进制下等价于 1 + (n − 1) mod (b − 1)',
  }
}

function bigToBase(v, b) {
  if (v === 0n) return '0'
  const base = BigInt(b)
  let n = v < 0n ? -v : v
  let s = ''
  while (n > 0n) {
    s = DIGITS[Number(n % base)] + s
    n = n / base
  }
  return s
}

function digitSumOfString(repr, base) {
  let sum = 0
  for (let i = 0; i < repr.length; i++) {
    const d = DIGITS.indexOf(repr[i].toLowerCase())
    if (d > -1) sum += d
  }
  return sum
}

function digitalRootOf(sum, base) {
  let s = sum
  let guard = 0
  while (s >= base && guard++ < 500) s = digitSumOfString(s.toString(base), base)
  return s
}

/* ------------------------------------------------------------ 完全数 / 亲和数 */

/** 前 8 个已知完全数（欧几里得–欧拉定理：偶完全数 = 2^(p−1)(2^p−1)，2^p−1 为梅森素数） */
export const KNOWN_PERFECT = [
  { index: 1, value: '6', p: 2 },
  { index: 2, value: '28', p: 3 },
  { index: 3, value: '496', p: 5 },
  { index: 4, value: '8128', p: 7 },
  { index: 5, value: '33550336', p: 13 },
  { index: 6, value: '8589869104', p: 17 },
  { index: 7, value: '137438691328', p: 19 },
  { index: 8, value: '2305843008139952128', p: 31 },
]

/** 完全数判定：真约数和是否等于自身 */
export function isPerfectNumber(value) {
  const d = divisors(value)
  return { n: d.n, perfect: d.kind === 'perfect', properSum: d.sumProper, kind: d.kindName }
}

/**
 * 亲和数（伴侣数）判定：σ(a)−a = b 且 σ(b)−b = a 且 a ≠ b。
 */
export function amicablePair(a, b) {
  const x = absInt(a)
  const y = absInt(b)
  const da = divisors(x.str)
  const db = divisors(y.str)
  const yes = da.sumProper === y.str && db.sumProper === x.str && x.str !== y.str
  return {
    a: x.str,
    b: y.str,
    yes,
    aProperSum: da.sumProper,
    bProperSum: db.sumProper,
    note: yes ? '两者互为亲和数' : x.str === y.str ? 'a = b，这是完全数的情况，不算亲和数对' : '真约数和不互相咬合，不是亲和数对',
  }
}

/** 列出 limit 以内的亲和数对（用筛法求约数和，limit 上限 20 万） */
export function amicablePairsUpTo(limit) {
  let n = Math.floor(Number(limit))
  if (!isFinite(n) || n < 10) return []
  if (n > 200000) n = 200000
  const sum = new Float64Array(n + 1)
  for (let i = 1; i <= n / 2; i++) {
    for (let j = i * 2; j <= n; j += i) sum[j] += i
  }
  const out = []
  for (let a = 2; a <= n; a++) {
    const b = sum[a]
    if (b > a && b <= n && sum[b] === a) out.push({ a, b })
    if (out.length > 200) break
  }
  return out
}

/* ------------------------------------------------------------ 罗马数字 */

export const ROMAN_TABLE = [
  { value: 1000, sym: 'M' },
  { value: 900, sym: 'CM' },
  { value: 500, sym: 'D' },
  { value: 400, sym: 'CD' },
  { value: 100, sym: 'C' },
  { value: 90, sym: 'XC' },
  { value: 50, sym: 'L' },
  { value: 40, sym: 'XL' },
  { value: 10, sym: 'X' },
  { value: 9, sym: 'IX' },
  { value: 5, sym: 'V' },
  { value: 4, sym: 'IV' },
  { value: 1, sym: 'I' },
]

export const ROMAN_RANGE_NOTE =
  '标准罗马数字只能表 1–3999（4000 以上古人用上划线表示 ×1000，本工具不做）'

/** 十进制 → 罗马数字 */
export function toRoman(value) {
  const a = absInt(value)
  const n = HAS_BIGINT ? Number(a.big) : a.num
  if (n < 1 || n > 3999) throw new Error(ROMAN_RANGE_NOTE)
  let rest = n
  let s = ''
  for (let i = 0; i < ROMAN_TABLE.length; i++) {
    const t = ROMAN_TABLE[i]
    while (rest >= t.value) {
      rest -= t.value
      s += t.sym
    }
  }
  return { n, roman: s, breakdown: buildBreakdown(n) }
}

function buildBreakdown(n) {
  let rest = n
  const out = []
  for (let i = 0; i < ROMAN_TABLE.length; i++) {
    const t = ROMAN_TABLE[i]
    const q = Math.floor(rest / t.value)
    if (q > 0) {
      out.push({ value: t.value * q, sym: repeat(t.sym, q), note: t.sym + ' × ' + q })
      rest -= t.value * q
    }
  }
  return out
}

function repeat(s, n) {
  let r = ''
  for (let i = 0; i < n; i++) r += s
  return r
}

/**
 * 罗马数字 → 十进制。
 * 严格校验：解码后再编码一次，与原式比对（能挡掉 IIII、VX、IC 这类畸形写法）。
 */
export function fromRoman(text) {
  const raw = String(text === null || text === undefined ? '' : text)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  if (!raw) throw new Error('请输入罗马数字')
  if (!/^[MDCLXVI]+$/.test(raw)) {
    throw new Error('含有非罗马数字字符，只允许 M D C L X V I')
  }
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }
  let total = 0
  const steps = []
  for (let i = 0; i < raw.length; i++) {
    const cur = map[raw[i]]
    const nxt = i + 1 < raw.length ? map[raw[i + 1]] : 0
    if (nxt > cur) {
      total += nxt - cur
      steps.push(raw[i] + raw[i + 1] + ' = ' + (nxt - cur) + '（小在大前作减法）')
      i++
    } else {
      total += cur
      steps.push(raw[i] + ' = +' + cur)
    }
  }
  const back = total >= 1 && total <= 3999 ? toRoman(total).roman : ''
  const strict = back === raw
  return {
    input: raw,
    value: total,
    canonical: back,
    strict,
    steps,
    note: strict
      ? '写法规范'
      : back
        ? '这是非规范写法，标准写法应为 ' + back + '（罗马数字同方向最多连写 3 个）'
        : '超出 1–3999，无法回推标准写法',
  }
}

/* ------------------------------------------------------------ 杂项 */

/** 数位拆解：把十进制数拆成「几个千、几个百…」 */
export function placeValue(value) {
  const a = absInt(value)
  const s = a.str.replace(/^-/, '')
  const rows = []
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i])
    const pow = s.length - 1 - i
    if (d === 0) continue
    rows.push({ digit: d, place: pow, unit: pow === 0 ? '一' : cnUnit(pow), value: d * Math.pow(10, pow) })
  }
  return { n: a.str, digits: s.length, rows, sumOfDigits: digitSumOfString(s, 10) }
}

function cnUnit(pow) {
  const u = ['', '十', '百', '千', '万', '十万', '百万', '千万', '亿', '十亿', '百亿', '千亿', '万亿']
  return u[pow] || '10^' + pow
}

/** 快速判断一个数是不是 2 的幂 / 10 的幂 */
export function powerCheck(value) {
  const a = absInt(value)
  if (HAS_BIGINT) {
    const n = a.big
    if (n < 1n) return { n: a.str, powerOf2: false, powerOf10: false, note: '小于 1 不讨论幂' }
    const p2 = (n & (n - 1n)) === 0n
    let m = n
    let e10 = 0
    while (m % 10n === 0n) {
      m /= 10n
      e10++
    }
    return {
      n: a.str,
      powerOf2: p2,
      exponentOf2: p2 ? String(log2Big(n)) : null,
      powerOf10: m === 1n && e10 > 0,
      exponentOf10: m === 1n && e10 > 0 ? e10 : null,
    }
  }
  const n = a.num
  if (n < 1) return { n: a.str, powerOf2: false, powerOf10: false, note: '小于 1 不讨论幂' }
  let d = n
  let e2 = 0
  while (d % 2 === 0 && d > 1) {
    d /= 2
    e2++
  }
  let m = n
  let e10 = 0
  while (m % 10 === 0 && m > 1) {
    m /= 10
    e10++
  }
  return {
    n: a.str,
    powerOf2: d === 1,
    exponentOf2: d === 1 ? String(e2) : null,
    powerOf10: m === 1 && e10 > 0,
    exponentOf10: m === 1 && e10 > 0 ? e10 : null,
  }
}

function log2Big(n) {
  let c = 0
  let x = n
  while (x > 1n) {
    x >>= 1n
    c++
  }
  return c
}
