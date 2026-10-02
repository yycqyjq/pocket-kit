/**
 * sys.js 自查（直接测 src/utils/sys.js 本体）
 * ------------------------------------------------------------
 * sys.js 的常量在「import 那一刻」就由 uni.getSystemInfoSync() 算好了，且 harness
 * 对同一份源码只装载一次（data:URL 缓存）。所以判据分两条路：
 *   1) 主进程给桩一组真实值（statusBarHeight=44 / windowWidth=390 / safeAreaInsets.bottom=34），
 *      断言导出常量就是这组值，并核对 navTotalHeight = statusBarHeight + 44 这条恒等式；
 *   2) 默认值分支换不了桩，只能另起子进程（同源、空桩）再装载一次，分别验：
 *        - 桩返回 {} → statusBarHeight 20 / windowWidth 375 / safeBottom 0 / navTotalHeight 64；
 *        - 桩直接抛错 → try/catch 兜底，同样落到 20/375/64；
 *        - 桩返回 statusBarHeight:0、windowWidth:0 → 因源码用 `||` 兜底，0 也按「没取到」
 *          处理，回落到 20/375（属可接受的边界行为：真机上状态栏高度不会是 0）。
 * 期望依据：navContentHeight 是源码常量 44；默认值 20/375/0 也是源码里写死的兜底值。
 * 不在覆盖内：真机状态栏/安全区的实际像素（本项目没有 uni 运行环境，只能验取值逻辑）。
 */
import { execFileSync } from 'node:child_process'
import { useUtils, makeTest } from './harness.mjs'

const HARNESS = new URL('./harness.mjs', import.meta.url).href
const calls = []
globalThis.uni = {
  getSystemInfoSync() {
    calls.push('sys')
    return {
      statusBarHeight: 44,
      windowWidth: 390,
      windowHeight: 844,
      platform: 'ios',
      system: 'iOS 17.0',
      safeAreaInsets: { top: 47, bottom: 34 },
    }
  },
}

const S = await useUtils('sys')
const T = makeTest('sys')

/* ---------- 1. 真实桩值 ---------- */
T.eq('顶层只取一次系统信息', calls.length, 1)
T.ok('statusBarHeight 是数字', typeof S.statusBarHeight === 'number', typeof S.statusBarHeight)
T.eq('statusBarHeight 取桩值 44', S.statusBarHeight, 44)
T.ok('statusBarHeight 未落默认 20', S.statusBarHeight !== 20, S.statusBarHeight)
T.eq('navContentHeight 常量 44', S.navContentHeight, 44)
T.eq('navTotalHeight = 44 + 44 = 88', S.navTotalHeight, 88)
T.eq('navTotalHeight 恒等式', S.navTotalHeight, S.statusBarHeight + S.navContentHeight)
T.ok('navTotalHeight > statusBarHeight', S.navTotalHeight > S.statusBarHeight, S.navTotalHeight)
T.eq('windowWidth 取桩值 390', S.windowWidth, 390)
T.ok('windowWidth 未落默认 375', S.windowWidth !== 375, S.windowWidth)
T.eq('safeBottom 取 bottom（不是 top）', S.safeBottom, 34)
T.ok('safeBottom 不是 0', S.safeBottom !== 0, S.safeBottom)
T.eq('导出面恰好 5 个', Object.keys(S).sort(), ['navContentHeight', 'navTotalHeight', 'safeBottom', 'statusBarHeight', 'windowWidth'])
T.ok('五个导出全是数字', ['statusBarHeight', 'navContentHeight', 'navTotalHeight', 'safeBottom', 'windowWidth'].every((k) => typeof S[k] === 'number'))
T.ok('statusBarHeight 是整数', Number.isInteger(S.statusBarHeight), S.statusBarHeight)

/* ---------- 2. 默认值分支：另起子进程同源装载 ---------- */
function loadFresh(infoExpr) {
  const code = `
globalThis.uni = { getSystemInfoSync: ${infoExpr} }
const { useUtils } = await import(${JSON.stringify(HARNESS)})
const S = await useUtils('sys')
console.log(JSON.stringify({ statusBarHeight: S.statusBarHeight, navContentHeight: S.navContentHeight, navTotalHeight: S.navTotalHeight, safeBottom: S.safeBottom, windowWidth: S.windowWidth }))
`
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' })
  return JSON.parse(out.trim())
}

const empty = loadFresh('() => ({})')
T.eq('空桩：statusBarHeight 默认 20', empty.statusBarHeight, 20)
T.eq('空桩：windowWidth 默认 375', empty.windowWidth, 375)
T.eq('空桩：safeBottom 默认 0', empty.safeBottom, 0)
T.eq('空桩：navContentHeight 仍 44', empty.navContentHeight, 44)
T.eq('空桩：navTotalHeight = 20 + 44', empty.navTotalHeight, 64)

const boom = loadFresh("() => { throw new Error('no uni') }")
T.eq('抛错兜底：statusBarHeight 20', boom.statusBarHeight, 20)
T.eq('抛错兜底：windowWidth 375', boom.windowWidth, 375)
T.eq('抛错兜底：navTotalHeight 64', boom.navTotalHeight, 64)
T.eq('抛错兜底：safeBottom 0', boom.safeBottom, 0)

const zeros = loadFresh('() => ({ statusBarHeight: 0, windowWidth: 0, safeAreaInsets: { bottom: 0 } })')
T.eq('0 值也按未取到：statusBarHeight 20', zeros.statusBarHeight, 20)
T.eq('0 值也按未取到：windowWidth 375', zeros.windowWidth, 375)
T.eq('0 值也按未取到：navTotalHeight 64', zeros.navTotalHeight, 64)

T.done()
