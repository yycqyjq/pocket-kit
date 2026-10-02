/**
 * clipboard.js 自查（直接测 src/utils/clipboard.js 本体）
 * ------------------------------------------------------------
 * 给 uni.showToast / setClipboardData / vibrateShort 打桩，用 calls 数组按顺序核对
 * 「发生了什么」而不是只看返回值。判据分三类：
 *   1) copyText 空输入契约：''/null/undefined 一律不碰剪贴板，只弹
 *      '没有可复制的内容' 的 toast，返回 false（calls 里必须没有 copy）。
 *   2) copyText 正常/失败契约：非空 → 先 copy 且 data 等于原文（含 '0'、' ' 这类
 *      「非空但看着空」的输入，源码只做 String 不做 trim），success 回调后弹 tip 或
 *      '已复制'（duration 1200）；fail 回调弹 '复制失败' 且仍返回 true；
 *      setClipboardData 抛错时 catch 弹 '复制失败' 并返回 false。
 *   3) toast / haptic：toast 补默认 icon='none'、duration 1500；haptic 跟随
 *      readSettings().haptic 开关，开则 vibrateShort，关则不调。
 * 不在覆盖内：真机剪贴板写入与震动马达（H5 端本就没有震动，源码里是条件编译跳过）。
 */
import { useUtils, makeTest } from './harness.mjs'

const calls = []
const mem = new Map()
let clipboardMode = 'success' // success | fail | throw
globalThis.uni = {
  getStorageSync: (k) => (mem.has(k) ? mem.get(k) : ''),
  setStorageSync: (k, v) => { mem.set(k, v) },
  removeStorageSync: (k) => { mem.delete(k) },
  showToast: (o) => calls.push(['toast', o]),
  setClipboardData: (o) => {
    calls.push(['copy', o])
    if (clipboardMode === 'throw') throw new Error('boom')
    if (clipboardMode === 'fail') return o.fail && o.fail()
    return o.success && o.success()
  },
  vibrateShort: () => calls.push(['vibrate']),
}

const C = await useUtils('clipboard')
const T = makeTest('clipboard')
const reset = () => { calls.length = 0; clipboardMode = 'success' }
const hasCopy = () => calls.some((c) => c[0] === 'copy')

/* ---------- 1. 空输入 ---------- */
reset()
T.eq('copyText("") 返回 false', C.copyText(''), false)
T.eq('copyText("") 只弹一条 toast', calls.length, 1)
T.eq('copyText("") toast 文案', calls[0][1].title, '没有可复制的内容')
T.ok('copyText("") 不碰剪贴板', !hasCopy())

reset()
T.eq('copyText(null) 返回 false', C.copyText(null), false)
T.eq('copyText(null) toast 文案', calls[0][1].title, '没有可复制的内容')
T.ok('copyText(null) 不碰剪贴板', !hasCopy())

reset()
T.eq('copyText(undefined) 返回 false', C.copyText(undefined), false)
T.ok('copyText(undefined) 不碰剪贴板', !hasCopy())

/* ---------- 2. 正常复制 ---------- */
reset()
T.eq('copyText("hello") 返回 true', C.copyText('hello'), true)
T.eq('先发生 copy', calls[0][0], 'copy')
T.eq('copy 的 data 等于原文', calls[0][1].data, 'hello')
T.eq('copy 时 showToast 关掉（自带 toast）', calls[0][1].showToast, false)
T.eq('success 后弹 toast', calls[1][0], 'toast')
T.eq('默认提示为「已复制」', calls[1][1].title, '已复制')
T.eq('默认提示 icon 为 none', calls[1][1].icon, 'none')
T.eq('默认提示 duration 1200', calls[1][1].duration, 1200)
T.eq('正常复制共 2 次调用', calls.length, 2)

reset()
C.copyText('hi', '已复制到剪贴板')
T.eq('自定义 tip 覆盖默认文案', calls[1][1].title, '已复制到剪贴板')

// 数字 0 经 String 后是 '0'，非空 → 应复制而不是当空
reset()
T.eq('copyText(0) 返回 true', C.copyText(0), true)
T.eq('copyText(0) 复制 "0"', calls[0][1].data, '0')

// 源码不做 trim：纯空格算非空
reset()
T.eq('copyText(" ") 返回 true', C.copyText(' '), true)
T.eq('copyText(" ") 原样复制空格', calls[0][1].data, ' ')

/* ---------- 3. 失败路径 ---------- */
reset()
clipboardMode = 'fail'
T.eq('fail 回调时 copyText 仍返回 true', C.copyText('x'), true)
T.eq('fail 回调弹「复制失败」', calls[1][1].title, '复制失败')
T.eq('fail 时没有「已复制」toast', calls[1][1].title !== '已复制', true)

reset()
clipboardMode = 'throw'
T.eq('setClipboardData 抛错 → 返回 false', C.copyText('x'), false)
T.eq('抛错时弹「复制失败」', calls[calls.length - 1][1].title, '复制失败')

/* ---------- 4. toast ---------- */
reset()
C.toast('提示')
T.eq('toast 传文案', calls[0][1].title, '提示')
T.eq('toast 默认 icon=none', calls[0][1].icon, 'none')
T.eq('toast duration 1500', calls[0][1].duration, 1500)
reset()
C.toast('提示', 'success')
T.eq('toast 可指定 icon', calls[0][1].icon, 'success')
reset()
C.toast(123)
T.eq('toast 数字转字符串', calls[0][1].title, '123')

/* ---------- 5. haptic ---------- */
reset()
mem.delete('pk.settings') // 默认 haptic=true
C.haptic()
T.eq('haptic 默认开启 → 调 vibrateShort', calls.length, 1)
T.eq('haptic 调用的是 vibrateShort', calls[0][0], 'vibrate')

reset()
mem.set('pk.settings', { haptic: false })
C.haptic()
T.eq('haptic 关闭 → 不震动', calls.length, 0)

reset()
mem.set('pk.settings', { haptic: true })
C.haptic()
T.eq('haptic 重新开启 → 再震动', calls.length, 1)

reset()
const realVibrate = globalThis.uni.vibrateShort
delete globalThis.uni.vibrateShort
T.ok('vibrateShort 缺失时不抛错', (() => { try { C.haptic(); return true } catch (e) { return false } })())
globalThis.uni.vibrateShort = realVibrate

T.done()
