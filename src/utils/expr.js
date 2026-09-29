/**
 * 表达式计算器
 * 递归下降解析，支持四则、幂、取余、阶乘、括号、常用数学函数与常量。
 * 角度制 / 弧度制可切换（三角函数与反三角函数跟随）。
 */

const CONSTS = {
  pi: Math.PI,
  π: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
  inf: Infinity,
}

const FUNCS = {
  sin: (x, deg) => Math.sin(deg ? (x * Math.PI) / 180 : x),
  cos: (x, deg) => Math.cos(deg ? (x * Math.PI) / 180 : x),
  tan: (x, deg) => Math.tan(deg ? (x * Math.PI) / 180 : x),
  asin: (x, deg) => (deg ? (Math.asin(x) * 180) / Math.PI : Math.asin(x)),
  acos: (x, deg) => (deg ? (Math.acos(x) * 180) / Math.PI : Math.acos(x)),
  atan: (x, deg) => (deg ? (Math.atan(x) * 180) / Math.PI : Math.atan(x)),
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  sign: Math.sign,
  floor: Math.floor,
  ceil: Math.ceil,
  trunc: Math.trunc,
  round: Math.round,
  ln: Math.log,
  log: Math.log10,
  log10: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  deg: (x) => (x * 180) / Math.PI,
  rad: (x) => (x * Math.PI) / 180,
}

const FUNC_ARITY2 = {
  pow: Math.pow,
  min: Math.min,
  max: Math.max,
  hypot: Math.hypot,
  atan2: (y, x) => Math.atan2(y, x),
}

// min/max/hypot 本来就是任意个参数；pow/atan2 多给一个就是写错了，不能悄悄丢掉
const FUNC_STRICT2 = ['pow', 'atan2']

/* ---------------- 词法 ---------------- */

function tokenize(src) {
  // 注意：不能把逗号一律删掉——它是函数参数分隔符（max(1,2)）。
  // 千分位逗号会在下面给出专门的报错提示，而不是猜。
  const raw = String(src)
  // 空格是要删掉的，但两个数字之间的空格一删就粘成一个字面量（2 3 变 23、2 .5 变 2.5），
  // 属于悄悄改答案，宁可报错让用户自己说清楚是要相乘还是要成一个数。
  const gap = raw.match(/([0-9.])\s+([0-9.])/)
  if (gap) {
    const shown = raw.slice(Math.max(0, gap.index - 8), gap.index + 9).replace(/\s+/g, ' ').trim()
    throw new Error('数字之间不能只隔空格：「' + shown + '」把空格去掉就粘成一个数，要相乘请用 *')
  }
  const s = raw
    .replace(/[×✕·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/，/g, ',')
    .replace(/\s+/g, '')
  const out = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < s.length && /[0-9.]/.test(s[j])) j++
      // 科学计数法，E 和 e 都要认——表格里抄出来常是大写，只认小写会把 1.5E-3 拆成 1.5×e−3
      if ((s[j] === 'e' || s[j] === 'E') && /[0-9+-]/.test(s[j + 1] || '')) {
        let k = j + 1
        if (s[k] === '+' || s[k] === '-') k++
        if (/[0-9]/.test(s[k] || '')) {
          while (k < s.length && /[0-9]/.test(s[k])) k++
          j = k
        }
      }
      const numStr = s.slice(i, j)
      if ((numStr.match(/\./g) || []).length > 1) throw new Error('数字里出现了多个小数点：' + numStr)
      out.push({ t: 'num', v: Number(numStr) })
      i = j
      continue
    }
    if (/[a-zA-Z_\u03c0]/.test(c)) {
      let j = i
      while (j < s.length && /[a-zA-Z0-9_\u03c0]/.test(s[j])) j++
      out.push({ t: 'name', v: s.slice(i, j).toLowerCase() })
      i = j
      continue
    }
    if ('+-*/^%!(),'.indexOf(c) > -1) {
      out.push({ t: c })
      i++
      continue
    }
    throw new Error('看不懂的字符：' + c)
  }
  return out
}

/* ---------------- 语法分析 ---------------- */

function parse(tokens, deg) {
  let pos = 0
  const peek = () => tokens[pos]
  const eat = (t) => {
    const tk = tokens[pos]
    if (!tk || tk.t !== t) throw new Error('表达式不完整，缺少 ' + t)
    pos++
    return tk
  }

  const isAtomStart = (tk) =>
    tk && (tk.t === 'num' || tk.t === 'name' || tk.t === '(')

  function expr() {
    let left = term()
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = tokens[pos++].t
      const right = term()
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  function term() {
    let left = unary()
    for (;;) {
      const tk = peek()
      if (tk && (tk.t === '*' || tk.t === '/' || tk.t === '%')) {
        pos++
        const right = unary()
        if (tk.t === '*') left = left * right
        else if (tk.t === '/') left = left / right
        else left = left % right
        continue
      }
      // 隐式乘：2pi、3(4+5)、2sqrt(9)
      if (isAtomStart(tk)) {
        const right = unary()
        left = left * right
        continue
      }
      break
    }
    return left
  }

  function unary() {
    const tk = peek()
    if (tk && (tk.t === '-' || tk.t === '+')) {
      pos++
      const v = unary()
      return tk.t === '-' ? -v : v
    }
    return power()
  }

  function power() {
    const base = postfix()
    if (peek() && peek().t === '^') {
      pos++
      const exp = unary() // 右结合
      return Math.pow(base, exp)
    }
    return base
  }

  function postfix() {
    let v = atom()
    while (peek() && peek().t === '!') {
      pos++
      v = factorial(v)
    }
    return v
  }

  function factorial(n) {
    if (n < 0 || !Number.isInteger(n)) throw new Error('阶乘只支持非负整数')
    if (n > 170) return Infinity
    let r = 1
    for (let i = 2; i <= n; i++) r *= i
    return r
  }

  function atom() {
    const tk = peek()
    if (!tk) throw new Error('表达式不完整')
    if (tk.t === 'num') {
      pos++
      return tk.v
    }
    if (tk.t === '(') {
      pos++
      const v = expr()
      eat(')')
      return v
    }
    if (tk.t === 'name') {
      pos++
      const name = tk.v
      // 双参函数
      if (FUNC_ARITY2[name]) {
        const args = readArgs()
        if (args.length < 2) throw new Error(name + ' 需要至少两个参数')
        if (args.length > 2 && FUNC_STRICT2.indexOf(name) > -1) {
          throw new Error(name + ' 只接受两个参数，这里给了 ' + args.length + ' 个')
        }
        const v = FUNC_ARITY2[name].apply(null, args)
        // atan2 返回弧度，角度制下要换算
        return name === 'atan2' && deg ? (v * 180) / Math.PI : v
      }
      if (FUNCS[name]) {
        const args = readArgs()
        if (args.length !== 1) throw new Error(name + ' 需要 1 个参数')
        return FUNCS[name](args[0], deg)
      }
      if (name in CONSTS) return CONSTS[name]
      throw new Error('未知的名称：' + name)
    }
    throw new Error('表达式不完整')
  }

  function readArgs() {
    const args = []
    if (peek() && peek().t === '(') {
      pos++
      if (peek() && peek().t === ')') {
        pos++
        return args
      }
      // 有括号：按逗号拆分
      for (;;) {
        args.push(expr())
        if (peek() && peek().t === ',') {
          pos++
          continue
        }
        eat(')')
        break
      }
      return args
    }
    // 无括号：吃一个 term。走得到这里的情况只有函数名后面紧跟运算符或括号（sin-30），
    // 因为词法里名字是会吃掉数字的，sin30、sin2pi 会被切成一个未知名称并报出来。
    args.push(term())
    return args
  }

  const value = expr()
  if (pos < tokens.length) {
    const tk = tokens[pos]
    if (tk.t === ',') {
      throw new Error('逗号只能写在函数参数之间（如 max(1,2)）；数字里的千分位逗号请先去掉')
    }
    throw new Error('表达式里有多余的内容，检查一下运算符：' + (tk.v !== undefined ? tk.v : tk.t))
  }
  return value
}

/** 计算表达式，返回数值 */
export function evaluate(input, useDegrees) {
  const src = String(input).trim()
  if (!src) throw new Error('请输入表达式')
  const tokens = tokenize(src)
  if (!tokens.length) throw new Error('请输入表达式')
  const v = parse(tokens, useDegrees !== false)
  if (typeof v !== 'number' || Number.isNaN(v)) throw new Error('结果不是一个有效数字')
  return v
}

/** 计算并给出便于展示的结果 */
export function calc(input, useDegrees) {
  const value = evaluate(input, useDegrees)
  let display
  if (!isFinite(value)) {
    // 到这里只可能是 ±∞：NaN 在 evaluate 里就拦掉了
    display = value > 0 ? '∞ 无穷大' : '-∞ 负无穷大'
  } else if (Number.isInteger(value)) {
    // 整数结果一律 String(value) 逐位印全。整数值的双精度数本身就是精确整数，
    // String 走的是「能读回同一个数」的最短十进制，多印不出假数字。
    // 原来这里卡着 1e15、再往下走 12 位有效数字，于是 2^50 印成 1125899906840000、
    // 20! 印成 2432902008180000000——末尾几位是被精度截断编出来的，
    // 而同页的十六进制行还给得出 2^50 的 0x4000000000000，两行自相矛盾。
    display = String(value)
  } else {
    // 保留 12 位有效数字，去掉多余的零
    display = Number(value.toPrecision(12)).toString()
  }
  return {
    value,
    display,
    scientific: isFinite(value) && Math.abs(value) >= 1e15 ? value.toExponential(6) : '',
    hex: Number.isInteger(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER && value >= 0 ? '0x' + value.toString(16) : '',
  }
}

/** 键盘/示例用的常用片段 */
export const SAMPLE_EXPRS = [
  { name: '圆面积 r=5', expr: 'pi*5^2' },
  { name: '复利 1.05^30', expr: '1.05^30' },
  { name: '三角函数', expr: 'sin(30)+cos(60)' },
  { name: '对数', expr: 'log(1000)+ln(e^2)' },
  { name: '阶乘', expr: '10!' },
  { name: '勾股', expr: 'hypot(3,4)' },
  { name: '取余', expr: '1024 % 37' },
  { name: '组合数 C(10,3)', expr: '10!/(3!*7!)' },
]
