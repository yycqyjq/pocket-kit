/**
 * theme.js 自查（直接测 src/utils/theme.js 本体）
 * ------------------------------------------------------------
 * theme.js 引了 vue 的 reactive/computed。harness 把源码改成 data:URL 再 import，
 * 而 data:URL 里的裸模块 'vue' 无法解析（node 会直接报错）。这里不碰源码、也不改
 * harness，只在测试进程内用 module.registerHooks 把 'vue' 解析到一个最小桩
 * （reactive 原样返回、computed 返回带 getter 的 { value }）。因此本套测的是
 * theme.js 自己的决策逻辑，不测 Vue 响应式的实现细节。
 *
 * 判据分四类：
 *   1) 语义色表：themeColors 随 theme.dark 切换；两表键都恰为 accent/danger/warn；
 *      每个值都是 #rrggbb；深/浅两表不完全相同（用「切回来应与初始浅表一致」验往返）。
 *   2) toggle/set 契约：toggleTheme 翻转；setTheme(true/false) 幂等；setTheme 用
 *      !! 归一（1/'x' 为真、0/'' 为假）；返回值 undefined。
 *   3) 落盘：setTheme 会把 'dark'/'light' 写进 pk.theme（经真实 storage 层，Map 桩）。
 *   4) 原生 UI 同步：setNavigationBarColor 被调用；深色用白图标 #ffffff、浅色用黑
 *      图标 #000000（与源码注释「深色用浅色图标」一致）；深/浅背景色不同。
 *   5) initTheme：无存档时跟随系统 theme 并落盘；有存档时以存档为准（不被系统覆盖）；
 *      系统信息抛错时回落 light。
 * 不在覆盖内：plus.navigator / plus.webview 的 APP-PLUS 分支（node 里没有 plus），
 * 以及 Vue 响应式本身（已用最小桩替换）。
 */
import { registerHooks } from 'node:module'
import { useUtils, makeTest } from './harness.mjs'

const VUE_STUB = 'data:text/javascript;base64,' + Buffer.from(
  'export function reactive(o){ return o }\n' +
  'export function computed(fn){ return { get value(){ return fn() } } }\n'
).toString('base64')

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'vue') return { url: VUE_STUB, shortCircuit: true }
    return nextResolve(specifier, context)
  },
})

const mem = new Map()
const navCalls = []
let sysTheme = 'light'
let sysThrows = false
globalThis.uni = {
  getStorageSync: (k) => (mem.has(k) ? mem.get(k) : ''),
  setStorageSync: (k, v) => { mem.set(k, v) },
  removeStorageSync: (k) => { mem.delete(k) },
  getSystemInfoSync: () => {
    if (sysThrows) throw new Error('no sys')
    return { theme: sysTheme }
  },
  setNavigationBarColor: (o) => navCalls.push(o),
}

const M = await useUtils('theme')
const T = makeTest('theme')
const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
const tableKeys = (t) => Object.keys(t).sort()
const KEYS = ['accent', 'danger', 'warn']
const lightOf = (o) => JSON.parse(JSON.stringify(o))

/* ---------- 1. 初始态与浅色表 ---------- */
T.eq('初始 theme.dark=false', M.theme.dark, false)
T.eq('初始 theme.ready=false', M.theme.ready, false)
T.ok('themeColors 有 .value', typeof M.themeColors.value === 'object', typeof M.themeColors.value)
T.eq('浅色表键集合', tableKeys(M.themeColors.value), KEYS)
T.ok('accent 是 #rrggbb', isHex(M.themeColors.value.accent), M.themeColors.value.accent)
T.ok('danger 是 #rrggbb', isHex(M.themeColors.value.danger), M.themeColors.value.danger)
T.ok('warn 是 #rrggbb', isHex(M.themeColors.value.warn), M.themeColors.value.warn)
const lightColors = lightOf(M.themeColors.value)

/* ---------- 2. 原生 UI：浅色 ---------- */
M.syncNativeUI()
const lightNav = navCalls[navCalls.length - 1]
T.ok('syncNativeUI 调了 setNavigationBarColor', !!lightNav)
T.eq('浅色用黑图标 #000000', lightNav.frontColor, '#000000')
T.ok('浅色背景是 #rrggbb', isHex(lightNav.backgroundColor), lightNav.backgroundColor)

/* ---------- 3. 切深色 ---------- */
T.eq('setTheme 返回 undefined', M.setTheme(true), undefined)
T.eq('setTheme(true) → dark=true', M.theme.dark, true)
M.setTheme(true)
T.eq('setTheme(true) 幂等', M.theme.dark, true)
const darkColors = lightOf(M.themeColors.value)
T.ok('深色表键集合一致', JSON.stringify(tableKeys(darkColors)) === JSON.stringify(KEYS), JSON.stringify(tableKeys(darkColors)))
T.ok('深色 accent 是 #rrggbb', isHex(darkColors.accent), darkColors.accent)
T.ok('深色 danger 是 #rrggbb', isHex(darkColors.danger), darkColors.danger)
T.ok('深色 warn 是 #rrggbb', isHex(darkColors.warn), darkColors.warn)
T.ok('深/浅两表不完全相同', JSON.stringify(darkColors) !== JSON.stringify(lightColors))
T.eq('切深色写入 pk.theme=dark', mem.get('pk.theme'), 'dark')
const darkNav = navCalls[navCalls.length - 1]
T.eq('深色用白图标 #ffffff', darkNav.frontColor, '#ffffff')
T.ok('深色背景也是 #rrggbb', isHex(darkNav.backgroundColor), darkNav.backgroundColor)
T.ok('深/浅背景色不同', darkNav.backgroundColor !== lightNav.backgroundColor, darkNav.backgroundColor + ' vs ' + lightNav.backgroundColor)

/* ---------- 4. 切回浅色 / 往返 ---------- */
M.setTheme(false)
T.eq('setTheme(false) → dark=false', M.theme.dark, false)
T.eq('切回浅色写 pk.theme=light', mem.get('pk.theme'), 'light')
T.ok('切回浅色得到与初始相同的表', JSON.stringify(lightOf(M.themeColors.value)) === JSON.stringify(lightColors))

/* ---------- 5. toggle 与归一 ---------- */
M.setTheme(false)
M.toggleTheme()
T.eq('toggleTheme 从浅→深', M.theme.dark, true)
M.toggleTheme()
T.eq('toggleTheme 从深→浅', M.theme.dark, false)
M.setTheme(1)
T.eq('setTheme(1) 视为真', M.theme.dark, true)
M.setTheme(0)
T.eq('setTheme(0) 视为假', M.theme.dark, false)
M.setTheme('')
T.eq("setTheme('') 视为假", M.theme.dark, false)
M.setTheme('x')
T.eq("setTheme('x') 视为真", M.theme.dark, true)

/* ---------- 6. initTheme ---------- */
mem.clear()
sysTheme = 'dark'
sysThrows = false
T.eq('initTheme 返回 undefined', M.initTheme(), undefined)
T.eq('无存档时跟随系统 dark', M.theme.dark, true)
T.eq('initTheme 后 ready=true', M.theme.ready, true)
T.eq('跟随系统后落盘 dark', mem.get('pk.theme'), 'dark')

mem.set('pk.theme', 'light')
sysTheme = 'dark'
M.initTheme()
T.eq('有存档 light 时不被系统 dark 覆盖', M.theme.dark, false)

mem.set('pk.theme', 'dark')
sysTheme = 'light'
M.initTheme()
T.eq('有存档 dark 时保持 dark', M.theme.dark, true)

mem.clear()
sysThrows = true
M.initTheme()
T.eq('系统信息抛错时回落 light', M.theme.dark, false)
T.eq('抛错回落时也落盘 light', mem.get('pk.theme'), 'light')

T.done()
