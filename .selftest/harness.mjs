/**
 * 自查用微型 ESM 装载器 + 断言器（临时文件，跑完删）
 * ------------------------------------------------------------
 * 项目没有 "type": "module"，且 src/utils/*.js 里的相对 import 省略了扩展名，
 * node 直接 import 会 ERR_MODULE_NOT_FOUND。这里把真实源码在内存里
 * 递归改写成 data: URL 模块再 import —— **不复制、不修改任何项目文件**，
 * 测的就是 src/utils 下的本体。
 */
import fs from 'node:fs'
import path from 'node:path'

const UTILS = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'utils')
const cache = new Map()

function toDataUrl(src) {
  return 'data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64')
}

async function build(file) {
  if (cache.has(file)) return cache.get(file)
  const raw = fs.readFileSync(file, 'utf8')
  const specs = new Set()
  const re = /['"](\.\/[A-Za-z0-9_.-]+)['"]/g
  let m
  while ((m = re.exec(raw))) specs.add(m[1].slice(2))
  const urls = new Map()
  for (const s of specs) {
    const dep = path.join(path.dirname(file), s.endsWith('.js') ? s : s + '.js')
    urls.set(s, await build(dep))
  }
  const src = raw.replace(/(['"])\.\/([A-Za-z0-9_.-]+)\1/g, (all, q, p) => "'" + urls.get(p) + "'")
  const url = toDataUrl(src)
  cache.set(file, url)
  return url
}

/** 载入 src/utils/<name>.js 的真实源码 */
export async function useUtils(name) {
  const file = path.join(UTILS, name + '.js')
  try {
    return await import(await build(file))
  } catch (e) {
    const msg = String(e && e.message ? e.message : e)
    const loc = msg.match(/:(\d+):(\d+)/)
    console.log('[load-fail]', name, e && e.constructor && e.constructor.name)
    if (loc) {
      const ln = Number(loc[1])
      const lines = fs.readFileSync(file, 'utf8').split('\n')
      console.log('  源码附近：')
      for (let i = Math.max(0, ln - 4); i < Math.min(lines.length, ln + 2); i++) console.log('  ' + (i + 1) + '| ' + lines[i])
    } else {
      console.log('  ' + msg.slice(0, 400))
    }
    throw e
  }
}

/** 顺带载入依赖（例如 bases.js 想复用 totp.js 的对照实现） */
export function utilsDir() {
  return UTILS
}

/** 极简断言 */
export function makeTest(label) {
  const state = { pass: 0, total: 0, fails: [] }
  const ok = (name, cond, extra) => {
    state.total++
    if (cond) state.pass++
    else state.fails.push(name + (extra === undefined ? '' : '  → ' + extra))
  }
  const eq = (name, actual, expected) => {
    const a = typeof actual === 'object' ? JSON.stringify(actual) : String(actual)
    const e = typeof expected === 'object' ? JSON.stringify(expected) : String(expected)
    ok(name, a === e, '期望 ' + e + '，实际 ' + a)
  }
  /** 计算型断言：fn 抛错也算失败而不是崩掉整个测试 */
  const calc = (name, fn, expected) => {
    state.total++
    let got
    try {
      got = fn()
    } catch (err) {
      state.fails.push(name + '  → 抛了：' + (err && err.message ? err.message : err))
      return
    }
    const a = typeof got === 'object' ? JSON.stringify(got) : String(got)
    const e = typeof expected === 'object' ? JSON.stringify(expected) : String(expected)
    if (a === e) state.pass++
    else state.fails.push(name + '  → 期望 ' + e + '，实际 ' + a)
  }
  const throws = (name, fn, re) => {
    state.total++
    try {
      fn()
      state.fails.push(name + '  → 没有抛错')
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      const isChinese = /[\u4e00-\u9fa5]/.test(msg)
      if (!isChinese) state.fails.push(name + '  → 报错不是中文：' + msg)
      else if (re && !re.test(msg)) state.fails.push(name + '  → 报错文案不符：' + msg)
      else state.pass++
    }
  }
  const done = () => {
    if (state.fails.length) {
      console.log('\n' + label + ' FAIL ' + state.fails.length + '/' + state.total + '\n  ' + state.fails.join('\n  '))
      process.exitCode = 1
    } else {
      console.log(label + ' 全绿：' + state.pass + '/' + state.total + ' 条断言')
    }
    return state
  }
  return { ok, eq, calc, throws, done, state }
}
