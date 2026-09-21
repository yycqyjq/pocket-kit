/**
 * 临时：把 ToolDevice.vue 的 <script setup> 真身跑起来
 *   A. 裸 node（无 uni / 无 plus）—— 全降级
 *   B. 只有 uni（H5 预览近似）
 *   C. 伪造安卓 App（plus + Native.js）
 * 断言：读取与所有 computed 求值都不抛错，说明文案按分支出现。跑完删。
 */
import fs from 'node:fs'
import * as Vue from 'vue'
import { useUtils, makeTest } from '/Users/yjq/Desktop/pocket-kit/scripts/selftest/harness.mjs'
import { installUniOnly, installAndroidApp } from '/tmp/pkmock.mjs'

const T = makeTest('ToolDevice.vue 脚本层冒烟')
const eq = T.eq.bind(T)
const ok = T.ok.bind(T)

const FILE = '/Users/yjq/Desktop/pocket-kit/src/tools/components/ToolDevice.vue'
const src = fs.readFileSync(FILE, 'utf8')
const script = src.split('<script setup>')[1].split('</script>')[0]

const importRe = /^import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]\s*$/gm
const imports = []
let m
while ((m = importRe.exec(script))) {
  imports.push({ mod: m[2], names: m[1].split(',').map((s) => s.trim()).filter(Boolean) })
}
const code = script.replace(importRe, '')
const decls = [...code.matchAll(/^(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm)].map((x) => x[1])

const MODS = { vue: Vue, device: null, sys: null, clipboard: null }
MODS.device = await useUtils('device')
MODS.sys = await useUtils('sys')
MODS.clipboard = await useUtils('clipboard')

const missing = []
function instantiate() {
  const names = []
  const args = []
  const hooks = { mounted: [], unmounted: [] }
  for (const imp of imports) {
    const ns = MODS[imp.mod.replace('@/utils/', '')]
    for (const n of imp.names) {
      if (names.includes(n)) continue
      names.push(n)
      if (n === 'onMounted') args.push((fn) => hooks.mounted.push(fn))
      else if (n === 'onUnmounted') args.push((fn) => hooks.unmounted.push(fn))
      else if (ns && n in ns) args.push(ns[n])
      else {
        missing.push(imp.mod + ' → ' + n)
        args.push(undefined)
      }
    }
  }
  const factory = new Function(...names, code + '\nreturn {' + decls.concat(names).join(',') + '}')
  const st = factory(...args)
  return { st, hooks }
}

function touchAll(st) {
  // 模板里用到的每个表达式都求一遍值，抛错就是白屏
  const keys = ['caps', 'isApp', 'envLevel', 'envTitle', 'envDesc', 'nativeCount', 'ui', 'bi', 'st', 'cp', 'ms', 'se', 'ba', 'hasBat',
    'physText', 'logicText', 'dpiText', 'diagonal', 'statusBarText', 'safeBottomText', 'screenNote', 'uniNote', 'buildNote', 'versionNote',
    'cpuNote', 'ramPct', 'storagePct', 'memNote', 'batSourceText', 'batNote', 'sensNote', 'uptime', 'uptimeNote',
    'visibleSensors', 'fatal', 'loading', 'updatedAt', 'gb', 'pctOf', 'missText', 'why', 'TINT', 'SENSOR_LIMIT', 'statusBarHeight', 'safeBottom']
  const out = {}
  const errs = []
  for (const k of keys) {
    if (!(k in st)) {
      errs.push('缺绑定 ' + k)
      continue
    }
    try {
      const v = st[k]
      out[k] = Vue.isRef(v) ? v.value : v
    } catch (e) {
      errs.push(k + ' 求值抛错：' + (e && e.message))
    }
  }
  // 逐行 v-if 用到的取值路径也不能漏
  try {
    out.sensorRow = (out.visibleSensors || [])[0]
    out.coreRow = (out.cp.perCore || [])[0]
  } catch (e) {
    errs.push('列表项访问抛错：' + e.message)
  }
  return { out, errs }
}

/* ---------- A. 裸环境：全降级但不能崩 ---------- */
delete global.uni
delete global.plus
{
  const { st, hooks } = instantiate()
  hooks.mounted.forEach((f) => f())
  await new Promise((r) => setTimeout(r, 10))
  const { out, errs } = touchAll(st)
  ok('A 裸环境无抛错', errs.length === 0, errs.join(' ;; '))
  eq('A 环境判定为运行时未就绪', out.envTitle, '运行时未就绪')
  eq('A 降级级别', out.envLevel, 'bad')
  eq('A 原生分组计数归零', out.nativeCount, 0)
  ok('A 有 uni 缺失说明', out.uniNote.indexOf('当前环境读不到：uni 系统信息') === 0, out.uniNote)
  ok('A Build 缺失说明', out.buildNote.indexOf('当前环境读不到：Android Build') === 0, out.buildNote)
  ok('A 屏幕缺失说明', out.screenNote.indexOf('当前环境读不到：物理分辨率') === 0, out.screenNote)
  ok('A CPU 缺失说明', out.cpuNote.indexOf('当前环境读不到：CPU') === 0, out.cpuNote)
  ok('A 内存缺失说明', out.memNote.indexOf('当前环境读不到：内存与存储') === 0, out.memNote)
  ok('A 电池缺失说明', out.batNote.indexOf('当前环境读不到：电池') === 0, out.batNote)
  ok('A 传感器缺失说明', out.sensNote.indexOf('当前环境读不到：传感器清单') === 0, out.sensNote)
  ok('A 时长缺失说明', out.uptimeNote.indexOf('当前环境读不到：开机时长') === 0, out.uptimeNote)
  eq('A 无整体致命错', out.fatal, '')
  eq('A 电池快照为空', out.hasBat, false)
  eq('A 传感器列表为空', out.sensorRow, undefined)
  eq('A 逐核项为空', out.coreRow, undefined)
  eq('A 对角英寸为空串', out.diagonal, '')
  eq('A 存储百分比兜底 0', out.storagePct, 0)
}

/* ---------- B. 只有 uni（H5 预览近似） ---------- */
{
  const clean = installUniOnly()
  const { st, hooks } = instantiate()
  hooks.mounted.forEach((f) => f())
  await new Promise((r) => setTimeout(r, 10))
  const { out, errs } = touchAll(st)
  ok('B 仅 uni 环境无抛错', errs.length === 0, errs.join(' ;; '))
  eq('B 判定为 H5 预览', out.envTitle, 'H5 浏览器预览（无 plus 原生运行时）')
  eq('B 级别 warn', out.envLevel, 'warn')
  eq('B uni 层说明为空（读到了）', out.uniNote, '')
  ok('B Build 说明指向缺 plus', out.buildNote.indexOf('H5 预览') > 0, out.buildNote)
  eq('B 原生分组仍为 0', out.nativeCount, 0)
  eq('B 逻辑尺寸有值', out.logicText, '393 × 851 px')
  eq('B 物理分辨率空', out.physText, '')
  ok('B 电池说明提到 getBattery', out.batNote.length > 10, out.batNote)
  clean()
}

/* ---------- C. 伪造安卓 App ---------- */
{
  const clean = installAndroidApp()
  const { st, hooks } = instantiate()
  hooks.mounted.forEach((f) => f())
  await new Promise((r) => setTimeout(r, 10))
  const { out, errs } = touchAll(st)
  ok('C App 环境无抛错', errs.length === 0, errs.join(' ;; '))
  eq('C 判定为安卓 App', out.envTitle, '安卓 App 运行时（plus 可用）')
  eq('C 级别 ok', out.envLevel, 'ok')
  ok('C 全部说明行归空', [out.uniNote, out.buildNote, out.versionNote, out.screenNote, out.cpuNote, out.memNote, out.batNote, out.sensNote, out.uptimeNote].every((x) => x === ''), JSON.stringify([out.uniNote, out.versionNote, out.batNote]))
  eq('C 7 组原生都有数据', out.nativeCount + '/7', '7/7')
  eq('C 电量', out.ba.percent, 61)
  eq('C 充电状态', out.ba.status, '充电中')
  eq('C 温度文本', out.ba.temperature, '31.2 °C')
  eq('C 电压文本', out.ba.voltage, '3.90 V')
  eq('C 健康度', out.ba.health, '良好')
  eq('C 来源标注', out.batSourceText, 'App 粘性广播')
  eq('C 内存口径 1024', out.gb(out.ms.ramTotal), '7.55 GB')
  eq('C 存储口径 1024', out.gb(out.ms.storageTotal), '238.4 GB')
  eq('C 可用占比', out.ramPct, 40)
  eq('C 存储占比', out.storagePct, 36)
  eq('C 对角英寸', out.diagonal, '6.4')
  eq('C 物理分辨率', out.physText, '1440 × 3120')
  eq('C 刷新率', out.st.refreshRate, 120)
  eq('C 逐核第一行', out.coreRow.i + '/' + out.coreRow.text, '0/离线')
  eq('C 传感器折叠上限', out.visibleSensors.length, 2)
  eq('C 传感器项 meta', out.sensorRow.meta, 'STMicro · 0.003 mA')
  eq('C 开机时长', out.uptime, '2 天 5 小时 30 分')
  ok('C 已写读取时间戳', /^\d\d:\d\d:\d\d$/.test(out.updatedAt), out.updatedAt)
  // 卸载后点重新读取 / 异步回调都不应崩
  hooks.unmounted.forEach((f) => f())
  try {
    st.manualReload()
    ok('C 卸载后再读取不抛错', true)
  } catch (e) {
    ok('C 卸载后再读取不抛错', false, e.message)
  }
  clean()
  // 掉线后重读：plus 没了要退回降级说明
  const { st: st2, hooks: h2 } = instantiate()
  h2.mounted.forEach((f) => f())
  await new Promise((r) => setTimeout(r, 10))
  const r2 = touchAll(st2)
  ok('C→A 掉线后仍无抛错', r2.errs.length === 0, r2.errs.join(' ;; '))
  ok('C→A 掉线后给出原因', r2.out.buildNote.indexOf('当前环境读不到') === 0, r2.out.buildNote)
}

eq('所有 import 的导出都存在', missing.join(' | '), '')
ok('无第三方依赖（模板只用 Pk* 组件）', /from ['"](?!@\/utils|vue)/.test(script) === false)
T.done()
