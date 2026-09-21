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

const FUNC_NAMES = Object.keys(FUNCS)
const FUNC2_NAMES = Object.keys(FUNC_ARITY2)

/* ---------------- 词法 ---------------- */

function tokenize(src) {
  // 注意：不能把逗号一律删掉——它是函数参数分隔符（max(1,2)）。
  // 千分位逗号会在下面给出专门的报错提示，而不是猜。
  const s = String(src)
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
      // 科学计数法
      if (s[j] === 'e' && /[0-9+-]/.test(s[j + 1] || '')) {
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
    // 无括号：吃一个 term（这样 sin2pi 等价于 sin(2*pi)）
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
    display = value > 0 ? '∞ 无穷大' : value < 0 ? '-∞ 负无穷大' : '未定义'
  } else if (Number.isInteger(value) && Math.abs(value) < 1e15) {
    display = String(value)
  } else {
    // 保留 12 位有效数字，去掉多余的零
    display = Number(value.toPrecision(12)).toString()
  }
  return {
    value,
    display,
    scientific: isFinite(value) && Math.abs(value) >= 1e15 ? value.toExponential(6) : '',
    hex: Number.isInteger(value) && Math.abs(value) < Number.MAX_SAFE_INTEGER && value >= 0 ? '0x' + value.toString(16) : '',
    fraction: '',
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
