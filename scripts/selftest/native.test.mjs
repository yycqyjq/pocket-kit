/**
 * native.js 自查断言（降级层本身也必须测）
 * ------------------------------------------------------------
 * Node 里既没有 uni 也没有 plus，所以这一整套接口在这台机器上永远走「最坏情况」分支。
 * 而这恰恰是最该测的：真机上缺接口时用户看到的每一句中文，都是这里产出的。
 * 判据是：不管缺什么，都不许抛 undefined、不许漏英文、必须给出可执行的下一步。
 * 真机分支（传感器真的动起来、闪光灯真的亮）只能在设备上验。
 */
import fs from 'node:fs'
import path from 'node:path'
import { useUtils, utilsDir } from './harness.mjs'

const N = await useUtils('native')

let ok = 0
let fail = 0
function is(a, b, m) {
  if (a === b) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b))
  }
}
function cn(s, m) {
  const v = String(s || '')
  if (/[一-龥]/.test(v) && !/undefined|not a function|is not defined|TypeError|\[object/.test(v)) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': 话术不合格 → ' + JSON.stringify(v))
  }
}
function noThrow(fn, m) {
  try {
    fn()
    ok++
  } catch (e) {
    fail++
    console.log('FAIL ' + m + ': 抛了 ' + ((e && e.message) || e))
  }
}
async function rejects(p, m) {
  try {
    await p
    fail++
    console.log('FAIL ' + m + ': 没有拒绝')
    return ''
  } catch (e) {
    const msg = (e && e.message) || String(e)
    cn(msg, m)
    return msg
  }
}

/* 六档降级程度，从最严重到只是单个接口不可用 */
const CASES = {
  noUni: { uni: false, sysInfo: false, plus: false, android: false, os: '', isAndroidApp: false, platform: '' },
  oldUni: { uni: true, sysInfo: false, plus: false, android: false, os: '', isAndroidApp: false, platform: '' },
  h5: { uni: true, sysInfo: true, plus: false, android: false, os: '', isAndroidApp: false, platform: 'web' },
  ios: { uni: true, sysInfo: true, plus: true, android: false, os: 'iOS', isAndroidApp: false, platform: 'ios' },
  noNative: { uni: true, sysInfo: true, plus: true, android: false, os: 'Android', isAndroidApp: true, platform: 'android' },
  ready: { uni: true, sysInfo: true, plus: true, android: true, os: 'Android', isAndroidApp: true, platform: 'android' },
}

/* ---------- 0. 导出面 ---------- */
{
  const want = [
    'apiName', 'probe', 'systemInfo', 'whyMissing', 'missText', 'hasApi', 'h5Has', 'failText',
    'uniCall', 'uniStart', 'uniStop', 'uniOn', 'uniOff', 'stopWav', 'playWav',
    'withAndroid', 'openExternal', 'startActivityAction', 'NATIVE_NOTES',
    'ANDROID_PERMS', 'permName', 'PERM_LOCATION', 'PERM_CAMERA', 'requestAndroidPermissions',
  ]
  for (const k of want) is(typeof N[k] !== 'undefined', true, '导出 ' + k)
}

/* ---------- 1. 接口中文名 ---------- */
{
  is(N.apiName('getLocation'), '定位', 'getLocation 的叫法')
  is(N.apiName('startAccelerometer'), '加速度传感器', '加速度计叫法')
  is(N.apiName('vibrateShort'), '短震动', '震动叫法')
  is(N.apiName('makePhoneCall'), '拨号', '拨号叫法')
  is(N.apiName('setKeepScreenOn'), '屏幕常亮', '常亮叫法')
  is(N.apiName('createInnerAudioContext'), '音频播放', '播放器叫法')
  is(N.apiName('whateverXyz'), 'whateverXyz', '没登记的名字原样回显，不编')
  is(N.apiName(''), '', '空名不抛')
}

/* ---------- 2. 当前环境探测 ---------- */
{
  const c = N.probe()
  is(typeof c, 'object', 'probe 给对象')
  is(c.uni, false, 'Node 里没有 uni')
  is(c.plus, false, 'Node 里没有 plus')
  is(c.android, false, '也就没有 plus.android')
  is(c.isAndroidApp, false, '不声称自己在安卓 App 里')
  is(typeof c.sysInfo, 'boolean', 'sysInfo 是布尔')
  is(typeof c.os, 'string', 'os 是字符串')
  is(typeof c.platform, 'string', 'platform 是字符串')
  // 每次探测都各自兜底，所以给全局塞个会抛的假 uni 也不会炸
  globalThis.uni = {
    get getSystemInfoSync() {
      throw new Error('坏掉了')
    },
  }
  const c2 = N.probe()
  is(c2.uni, true, '假 uni 仍然认得')
  is(c2.sysInfo, false, 'getSystemInfoSync 抛了要判为不可用，而不是把异常漏出去')
  delete globalThis.uni
  noThrow(() => N.probe(), '恢复后继续可探测')
  is(N.systemInfo(), null, 'Node 里拿不到系统信息时给 null')
  globalThis.uni = { getSystemInfoSync: () => ({ windowWidth: 360, windowHeight: 780, platform: 'android' }) }
  is(N.systemInfo().windowWidth, 360, '有接口时原样给出')
  globalThis.uni = {
    getSystemInfoSync() {
      throw new Error('坏了')
    },
  }
  is(N.systemInfo(), null, '抛错时给 null 而不是崩页面')
  delete globalThis.uni
}

/* ---------- 3. 六档降级话术 ---------- */
{
  cn(N.whyMissing(CASES.noUni), '连 uni 都没有')
  is(N.whyMissing(CASES.noUni).indexOf('uni') > -1, true, '第一句就点明缺 uni')
  cn(N.whyMissing(CASES.oldUni), 'uni 在但系统信息不可用')
  is(N.whyMissing(CASES.oldUni).indexOf('getSystemInfoSync') > -1, true, '说清是哪个接口')
  cn(N.whyMissing(CASES.h5), 'H5 预览')
  is(N.whyMissing(CASES.h5).indexOf('H5') > -1, true, 'H5 分支要点名')
  cn(N.whyMissing(CASES.ios), '非安卓')
  is(N.whyMissing(CASES.ios).indexOf('iOS') > -1, true, '把系统报告的实际值写进句子里')
  cn(N.whyMissing(CASES.noNative), '安卓 App 但没有 Native.js')
  is(N.whyMissing(CASES.noNative).indexOf('Native.js') > -1, true, '指到 plus.android')
  cn(N.whyMissing(CASES.ready), '一切都好在单个接口失败')
  is(N.whyMissing(CASES.ready).indexOf('这一个接口') > -1, true, '环境没问题时要落到接口本身')
  is(N.whyMissing(), '页面里连 uni 运行时都没有，处于最严重的降级状态', '不传参数按当前环境（Node）判')
  cn(N.missText('闪光灯', CASES.h5), 'missText 成句')
  is(N.missText('闪光灯', CASES.h5).indexOf('读不到「闪光灯」') === 0, true, '前缀固定：缺什么')
  is(N.missText('闪光灯', CASES.h5).indexOf('：') > -1, true, '冒号后接原因')
  cn(N.missText('', CASES.noUni), '标签为空也不留英文')
}

/* ---------- 4. 错误码翻译 ---------- */
{
  const cases = [
    [{ errCode: -14 }, '拒绝', '权限'],
    [{ errMsg: 'auth deny' }, '拒绝', '授权'],
    [{ errMsg: 'permission denied' }, '权限', '设置'],
    [{ errMsg: 'location timeout' }, '超时', '开阔'],
    [{ errMsg: 'network error' }, '网络', '网络'],
    [{ errMsg: 'not support' }, '没有提供', '设备'],
    [{ errMsg: 'user cancel' }, '取消了', '取消'],
    [{ errMsg: 'no cell' }, '蜂窝', '网络'],
    [{ message: '莫名其妙的错' }, '失败', '莫名其妙的错'],
    [{}, '定位失败', ''],
  ]
  for (const [err, must, extra] of cases) {
    const t = N.failText('getLocation', err)
    cn(t, 'failText ' + JSON.stringify(err))
    is(t.indexOf(must) > -1, true, JSON.stringify(err) + ' 要含「' + must + '」，实际：' + t)
    if (extra) is(t.indexOf(extra) > -1, true, JSON.stringify(err) + ' 要给出下一步「' + extra + '」，实际：' + t)
    is(t.indexOf('undefined') === -1, true, '不许漏 undefined：' + t)
  }
  is(N.failText('getLocation', null).indexOf('定位') === 0, true, 'null 错误对象也按接口名起句')
  is(N.failText('weirdApi', { errMsg: 'x' }).indexOf('weirdApi') > -1, true, '没登记的接口用原名')
  is(N.failText('vibrateShort', { code: '-14' }).indexOf('短震动') > -1, true, '按 code 也能认权限')
}

/* ---------- 5. 单个接口在不在 ---------- */
{
  for (const k of ['getLocation', 'startAccelerometer', 'makePhoneCall', 'setKeepScreenOn', 'createInnerAudioContext']) {
    is(N.hasApi(k), false, 'Node 里 ' + k + ' 判为不可用')
  }
  globalThis.uni = { makePhoneCall: () => {} }
  is(N.hasApi('makePhoneCall'), true, '挂了接口就认得')
  is(N.hasApi('startGyroscope'), false, '没挂的仍然不认')
  delete globalThis.uni
  is(N.hasApi('makePhoneCall'), false, '撤掉后回到不可用')
  noThrow(() => N.hasApi(''), '空名不抛')

  // build:h5 的产物里 window.uni 是个空壳（uni-app 按字面引用做按需注入）。
  // 反射拿不到时不许抛，也不许假装拿得到——这一条正是静态预览里那句
  // 「uni 在，但 getSystemInfoSync 不可用」的来源，字面量兜底表也必须在拿不到时如实返回不可用。
  globalThis.uni = {}
  is(N.hasApi('makePhoneCall'), false, '空壳 uni 上判为不可用')
  is(N.hasApi('getSystemInfoSync'), false, '空壳 uni 上系统信息也算拿不到')
  is(N.systemInfo(), null, '空壳 uni 时 systemInfo 给 null')
  const shell = N.probe()
  is(shell.uni, true, '空壳 uni 仍然算 uni 在')
  is(shell.sysInfo, false, '空壳 uni 的 sysInfo 位为 false')
  await rejects(N.uniCall('makePhoneCall'), '空壳 uni 调用要拒绝而不是抛')
  is(N.uniStart('makePhoneCall').started, false, '空壳 uni 的 start 系列也报没起来')
  is(N.uniStop('makePhoneCall'), false, '空壳 uni 的 stop 返回 false')
  is(N.uniOn('makePhoneCall', () => {}).started, false, '空壳 uni 的 on 系列报降级')
  is(N.uniOff('makePhoneCall'), false, '空壳 uni 的 off 返回 false')
  delete globalThis.uni
}

/* ---------- 6. 调用层：缺接口只拒绝，不抛裸错 ---------- */
{
  const calls = [
    ['uniCall 定位', () => N.uniCall('getLocation', {})],
    ['uniCall 拨号', () => N.uniCall('makePhoneCall', { phoneNumber: '10086' })],
    ['uniCall 常亮', () => N.uniCall('setKeepScreenOn', { keepScreenOn: true })],
    ['playWav 无播放器', () => N.playWav('data:audio/wav;base64,AAAA', 100)],
  ]
  for (const [label, f] of calls) await rejects(f(), label)
  const empty = await rejects(N.playWav('', 100), 'playWav 空串')
  is(empty.indexOf('没有可播放') > -1, true, '空音频说人话')
  await rejects(N.uniCall('getLocation'), 'uniCall 不传参数')

  const s = N.uniStart('startAccelerometer', { interval: 'game' })
  is(s.started, false, '缺接口时不会谎称启动了')
  cn(s.message, 'uniStart 话术')
  const o = N.uniOn('onAccelerometerChange', () => {})
  is(o.started, false, '缺接口时不会谎称挂上了回调')
  cn(o.message, 'uniOn 话术')
  is(N.uniOff('onAccelerometerChange'), false, '没有 off 接口时安静返回 false')
  is(N.uniStop('stopAccelerometer'), false, '没有 stop 接口时安静返回 false')
  is(N.stopWav(), false, '没有在播的东西时返回 false')

  globalThis.uni = {
    startAccelerometer(o2) {
      o2.success && o2.success({})
    },
  }
  is(N.uniStart('startAccelerometer').started, true, '接口在就报成功')
  is(N.uniStart('stopAccelerometer').started, false, '接口不在就报失败')
  globalThis.uni = {
    startAccelerometer() {
      throw new Error('系统不让用')
    },
  }
  const bad = N.uniStart('startAccelerometer')
  is(bad.started, false, '接口抛错也不能谎称启动')
  is(bad.message.indexOf('系统不让用') > -1, true, '原始错因要带上：' + bad.message)
  delete globalThis.uni
}

/* ---------- 7. uniCall 的成功与 complete 转发 ---------- */
{
  globalThis.uni = {
    getLocation(o) {
      o.success({ latitude: 31.2, longitude: 121.4, accuracy: 20 })
      o.complete({ ok: true })
      o.success({ latitude: 0, longitude: 0 })
    },
    chooseLocation(o) {
      o.fail({ errMsg: 'chooseLocation:fail auth deny' })
    },
  }
  const r = await N.uniCall('getLocation', { type: 'gcj02' }).catch((e) => ({ err: e }))
  is(r.latitude, 31.2, '成功回调的值原样给出')
  is(typeof r.err, 'undefined', '重复回调不会二次 settle')
  const f = await N.uniCall('chooseLocation', {}).then(() => null).catch((e) => e.message)
  cn(f, '失败回调翻成中文')
  is(f.indexOf('选点') > -1, true, '用登记过的中文名说话：' + f)
  globalThis.uni = {
    getLocation(o) {
      o.success({ a: 1 })
      o.fail({ errMsg: 'again' })
    },
  }
  const once = await N.uniCall('getLocation').catch(() => ({ settled: false }))
  is(once.a, 1, '先成功的就以成功为准')
  globalThis.uni = {
    getLocation() {
      throw new Error('直接炸了')
    },
  }
  const thrown = await N.uniCall('getLocation').then(() => '').catch((e) => e.message)
  is(thrown.indexOf('直接炸了') > -1, true, '同步抛错也要变成拒绝：' + thrown)
  delete globalThis.uni
}

/* ---------- 8. 安卓分支与外部唤起 ---------- */
{
  const r = N.withAndroid(() => '不该执行', '闪光灯')
  is(r.ok, false, 'Node 里进不了安卓分支')
  cn(r.message, 'withAndroid 话术')
  is(r.message.indexOf('闪光灯') > -1, true, '要说清楚是哪个能力：' + r.message)
  const a = N.startActivityAction('android.settings.WIFI_SETTINGS')
  is(a.ok, false, '没有 plus 时打不开设置页')
  cn(a.message, 'startActivityAction 话术')
  const o = N.openExternal('tel:10086')
  is(o.ok, false, 'Node 里没有可唤起的宿主')
  cn(o.message, 'openExternal 话术')
  noThrow(() => N.openExternal(''), '空串也不抛')

  globalThis.plus = {
    os: { name: 'Android' },
    android: { importClass: () => {} },
    runtime: {
      openURL(u) {
        globalThis.__opened = u
      },
    },
  }
  const p = N.probe()
  is(p.android, true, 'plus.android 在就认得')
  is(p.isAndroidApp, true, 'plus.os.name 为 Android 时认作安卓 App')
  const r2 = N.openExternal('geo:1,2')
  is(r2.ok, true, '有 plus.runtime 时递给系统')
  is(globalThis.__opened, 'geo:1,2', '递出去的串不能被改动')
  is(r2.via.indexOf('plus') > -1, true, '说明走的哪条路：' + r2.via)
  globalThis.plus.runtime.openURL = () => {
    throw new Error('没有 App 认领')
  }
  const r3 = N.openExternal('market://details?id=a.b')
  is(r3.ok, false, '唤起失败要报回来')
  is(r3.message.indexOf('没有 App 认领') > -1, true, '原始错因保留：' + r3.message)
  delete globalThis.__opened
  delete globalThis.plus
}

/* ---------- 9. 运行时权限申请 ---------- */
{
  is(N.permName('android.permission.CAMERA'), '相机', '相机的叫法')
  is(N.permName('android.permission.ACCESS_FINE_LOCATION'), '精确定位', '精确定位的叫法')
  is(N.permName('android.permission.ACCESS_COARSE_LOCATION'), '粗略位置', '粗略位置')
  is(N.permName('android.permission.READ_LOGS'), 'READ_LOGS', '没登记的权限剥掉前缀，别露出整串')
  is(N.permName(''), '', '空权限不抛')
  is(N.permName(null), '', 'null 不抛')
  is(N.PERM_LOCATION.length, 2, '定位这一组两项')
  is(N.PERM_CAMERA.length, 1, '相机这一组一项')
  is(N.PERM_LOCATION.every((x) => x.indexOf('android.permission.') === 0), true, '常量写成安卓权限全名')
  is(N.PERM_CAMERA.every((x) => x.indexOf('android.permission.') === 0), true, '相机常量同上')
  is(Object.keys(N.ANDROID_PERMS).length, N.PERM_LOCATION.length + N.PERM_CAMERA.length, '叫法表与申请组一一对应，没有登记了却不申请的权限')
  for (const x of N.PERM_LOCATION.concat(N.PERM_CAMERA)) {
    is(typeof N.ANDROID_PERMS[x], 'string', x + ' 有中文名')
    is(/[一-龥]/.test(N.ANDROID_PERMS[x]), true, x + ' 的名字是中文')
  }

  // 没有 plus：静默跳过，让真正的接口去报更准的失败话术
  const s1 = await N.requestAndroidPermissions(N.PERM_CAMERA, '闪光灯')
  is(s1.skipped, true, '无 plus 时算跳过')
  is(s1.ok, false, '跳过不算授权成功')
  is(s1.message, '', '跳过时不该往页面上倒一句多余的话')
  is(s1.denied.length, 0, '跳过时没有拒绝记录')
  const s2 = await N.requestAndroidPermissions([], '闪光灯')
  is(s2.skipped, true, '空清单直接跳过')
  const s3 = await N.requestAndroidPermissions(null)
  is(s3.skipped, true, 'null 清单不抛')
  globalThis.plus = { os: { name: 'Android' }, android: {} }
  const s4 = await N.requestAndroidPermissions(N.PERM_LOCATION, '定位')
  is(s4.skipped, true, '老运行时没有 requestPermissions 也照样跳过')
  delete globalThis.plus

  const stub = (fn) => {
    globalThis.plus = { os: { name: 'Android' }, android: { importClass: () => {}, requestPermissions: fn } }
  }

  stub((list, ok1) => ok1({ granted: list, deniedPresent: [], deniedAlways: [] }))
  const g1 = await N.requestAndroidPermissions(N.PERM_LOCATION, '定位')
  is(g1.ok, true, '全部允许时算成功')
  is(g1.skipped, false, '真给了就不算跳过')
  is(g1.message, '', '成功不写错误')
  is(g1.granted.length, 2, '允许的清单项数')
  is(g1.denied.length, 0, '没有拒绝项')
  delete globalThis.plus

  stub((list, ok1) => ok1({ granted: [list[0]], deniedPresent: [list[1]], deniedAlways: [] }))
  const g2 = await N.requestAndroidPermissions(N.PERM_LOCATION, '定位')
  is(g2.ok, false, '只给一半不算全授权')
  is(g2.denied.length, 1, '记下一个拒绝项')
  is(g2.message.indexOf('这一次没点允许') > -1, true, '临时拒绝话术：' + g2.message)
  cn(g2.message, '临时拒绝话术')
  delete globalThis.plus

  stub((list, ok1) => ok1({ granted: [], deniedPresent: [], deniedAlways: [list[1]] }))
  const g3 = await N.requestAndroidPermissions(N.PERM_LOCATION, '定位')
  is(g3.ok, false, '永久拒绝不算成功')
  is(g3.message.indexOf('系统设置') > -1, true, '永久拒绝要给出下一步：' + g3.message)
  is(g3.message.indexOf('粗略位置') > -1, true, '话术里用中文名：' + g3.message)
  is(g3.message.indexOf('android.permission') === -1, true, '不把常量串甩给用户')
  cn(g3.message, '永久拒绝话术')
  delete globalThis.plus

  stub((list, ok1) => ok1({}))
  const g4 = await N.requestAndroidPermissions(N.PERM_CAMERA, '闪光灯')
  is(g4.ok, false, '空结果不算授权')
  is(g4.message.indexOf('系统没有给出结果') > -1, true, '系统没回话也要说一句：' + g4.message)
  delete globalThis.plus

  stub((list, ok1, errCb) => errCb({ message: '权限申请接口报错' }))
  const g5 = await N.requestAndroidPermissions(N.PERM_CAMERA, '闪光灯')
  is(g5.ok, false, '失败回调算没授权')
  cn(g5.message, '失败回调话术')
  is(g5.message.indexOf('闪光灯') > -1, true, '说清楚是哪一项要的权限：' + g5.message)
  delete globalThis.plus

  stub(() => {
    throw new Error('boom')
  })
  const g6 = await N.requestAndroidPermissions(N.PERM_CAMERA, '闪光灯')
  is(g6.ok, false, '同步抛错也要吞掉')
  cn(g6.message, '同步抛错话术')
  delete globalThis.plus

  // 回调乱回（非数组、null）也不能让页面挂住
  stub((list, ok1) => ok1(null))
  const g7 = await N.requestAndroidPermissions(N.PERM_CAMERA)
  is(g7.ok, false, 'null 结果不抛')
  is(Array.isArray(g7.granted) && Array.isArray(g7.denied), true, '字段始终是数组')
  delete globalThis.plus
  stub((list, ok1) => ok1({ granted: [1, 2], deniedPresent: null, deniedAlways: undefined }))
  const g8 = await N.requestAndroidPermissions(N.PERM_CAMERA, '闪光灯')
  is(g8.granted.length, 2, '脏结果照数量读')
  is(g8.granted.every((x) => typeof x === 'string'), true, 'granted 一律转成字符串')
  is(g8.denied.length, 0, '缺字段按没有处理')
  delete globalThis.plus
  // 没给 label 时用权限中文名拼句，不能留下 undefined
  stub((list, ok1) => ok1({ granted: [], deniedPresent: list }))
  const g9 = await N.requestAndroidPermissions(N.PERM_CAMERA)
  is(g9.message.indexOf('undefined') === -1, true, '缺 label 也不露 undefined：' + g9.message)
  is(g9.message.indexOf('相机') > -1, true, '缺 label 时拿权限名顶上：' + g9.message)
  delete globalThis.plus
  // noneGranted 是视图里唯一的「要不要就此打住」判据，权限全名不许再抄一遍
  is(s1.noneGranted, false, '没 plus 时不算一项没给，让接口去说更准的话')
  is(g1.noneGranted, false, '全给了一项没落')
  is(g2.noneGranted, false, '给了一半就继续试，剩下的接口自己会报')
  is(g3.noneGranted, true, '一项没给（永久拒绝）')
  is(g4.noneGranted, true, '系统空回按一项没给处理')
  is(g5.noneGranted, false, '失败回调走 message，不判成一项没给')
  is(g6.noneGranted, false, '同步抛错同上')
  is(g9.noneGranted, true, '缺 label 那次确实一项没给')
  for (const f of ['ToolGeo.vue', 'ToolShortcut.vue', 'ToolHardware.vue']) {
    const vue = fs.readFileSync(path.join(utilsDir(), '..', 'tools', 'components', f), 'utf8')
    is(vue.indexOf('android.permission.') === -1, true, f + ' 里不该再抄权限全名')
    is(/requestAndroidPermissions\((N\.|)PERM_(LOCATION|CAMERA)/.test(vue) || vue.indexOf('PERM_') === -1, true, f + ' 的申请组取自 native 常量')
  }
  // manifest 与代码必须对得上：申请了却没声明的权限，真机上永远拿不到
  const manifestRaw = fs.readFileSync(path.join(utilsDir(), '..', 'manifest.json'), 'utf8')
  const man = JSON.parse(manifestRaw.replace(/\/\*[\s\S]*?\*\//g, ''))
  const declared = (man['app-plus'].distribute.android.permissions || [])
    .map((s) => (s.match(/android:name="([^"]+)"/) || [])[1])
    .filter(Boolean)
  is(declared.length, 7, '打包权限声明是 7 项：' + declared.join(','))
  is(new Set(declared).size, declared.length, '权限声明没有重复')
  for (const x of N.PERM_LOCATION.concat(N.PERM_CAMERA)) {
    is(declared.indexOf(x) > -1, true, x + ' 在 manifest 里声明过，否则运行时永远弹不出授权框')
  }
  // 危险权限只有这三项，其余四项是普通权限，装了即生效
  is(['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.CAMERA'].filter((x) => declared.indexOf(x) > -1).length, 3, '危险权限三项')
  for (const x of ['INTERNET', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'READ_PHONE_STATE', 'GET_ACCOUNTS', 'RECORD_AUDIO']) {
    is(declared.indexOf('android.permission.' + x) === -1, true, x + ' 不该出现：工具全部离线，没有理由要它')
  }
  is(!!man['app-plus'].modules.Geolocation, true, 'uni.getLocation 依赖 Geolocation 模块，缺了打包后定位必失败')
  is(!!man['app-plus'].modules.Vibrate, true, '震动测试依赖 Vibrate 模块')
  const sdk = man['app-plus'].distribute.sdkConfigs || {}
  is(Object.keys(sdk).join(','), 'geolocation', 'SDK 配置只有定位一项（系统 provider，不引三方）')
  is(JSON.stringify(sdk).indexOf('system') > -1, true, '定位走系统 provider')
  is(/amap|baidu|tencent|gaode/i.test(JSON.stringify(sdk)), false, '没有引第三方定位 SDK')
  is(man['app-plus'].distribute.android.minSdkVersion >= 21, true, 'minSdk 不早于 21')
  is(man.description.indexOf('79 件') > -1, true, 'manifest 描述里的件数要与注册表同步：' + man.description)
}

/* ---------- 10. 口径说明 ---------- */
{
  is(Array.isArray(N.NATIVE_NOTES), true, 'NOTES 是数组')
  is(N.NATIVE_NOTES.length >= 3, true, '至少三条')
  for (const n of N.NATIVE_NOTES) {
    is(n.t.length > 1, true, '标题成词：' + n.t)
    is(n.d.length > 20, true, n.t + ' 正文够长')
  }
  is(new Set(N.NATIVE_NOTES.map((n) => n.t)).size, N.NATIVE_NOTES.length, '标题不重复')
  is(N.NATIVE_NOTES.some((n) => n.d.indexOf('权限') > -1), true, '权限口径要写明白')
  is(N.NATIVE_NOTES.some((n) => n.d.indexOf('不联网') > -1 || n.t.indexOf('不联网') > -1), true, '说清楚数据不出本机')
}

/* ---------- 11. H5 按需注入对账：字面量表必须与 uni-h5 的真实现一致 ---------- */
{
  // 表内容从源码里读，不给模块加只为测试用的导出
  const nativeSrc = fs.readFileSync(path.join(utilsDir(), 'native.js'), 'utf8')
  const block = nativeSrc.slice(nativeSrc.indexOf('const UNI_LITERAL = {'), nativeSrc.indexOf('\n}', nativeSrc.indexOf('const UNI_LITERAL = {')))
  const entries = [...block.matchAll(/^ {2}([A-Za-z0-9_]+): \(\) => uni\.([A-Za-z0-9_]+),/gm)]
  const table = entries.map((m) => m[1])
  is(entries.length >= 20, true, '字面量表读到 ' + entries.length + ' 项，解析失败要查格式')
  for (const [k, v] of entries.map((m) => [m[1], m[2]])) is(k === v, true, k + ' 的表项必须指向同名接口 uni.' + v)

  const h5File = path.join(utilsDir(), '..', '..', 'node_modules', '@dcloudio', 'uni-h5', 'dist', 'uni-h5.es.js')
  let h5 = ''
  try {
    h5 = fs.readFileSync(h5File, 'utf8')
  } catch (e) {
    is(false, true, '读不到 uni-h5 产物，先 npm install 再跑自测：' + h5File)
  }
  /** real=H5 真做了，unsupported=占位桩，absent=产物里根本没有 */
  const h5State = (k) => {
    const m = h5.match(new RegExp('const ' + k + ' = [\\s\\S]{0,200}?\\);'))
    if (!m) return 'absent'
    return /createUnsupported|notSupport/.test(m[0]) ? 'unsupported' : 'real'
  }
  is(h5State('getSystemInfoSync'), 'real', '判据本身要能认出真实现')
  is(h5State('getScreenBrightness'), 'unsupported', '判据本身要能认出占位桩')
  is(h5State('onProximityChange'), 'absent', '判据本身要能认出根本没有')

  // 视图层反射用到的接口清单：传感器的三件套从 sensor.js 现取，避免两处各写一遍
  const S = await useUtils('sensor')
  const reflective = new Set(['getSystemInfoSync', 'getLocation', 'openLocation', 'makePhoneCall', 'getClipboardData', 'setClipboardData', 'createInnerAudioContext', 'getNetworkType', 'onNetworkStatusChange', 'vibrateShort', 'vibrateLong', 'setKeepScreenOn', 'getScreenBrightness', 'setScreenBrightness'])
  for (const k of S.SENSOR_KINDS) for (const x of [k.start, k.stop, k.api, 'off' + String(k.api).slice(2)]) reflective.add(x)

  for (const k of reflective) {
    const st = h5State(k)
    if (st === 'real') {
      is(table.indexOf(k) > -1, true, 'uni-h5 真实现了 ' + k + '，字面量表里必须登记，否则 build:h5 会谎报「读不到」')
    } else {
      is(table.indexOf(k) === -1, true, k + ' 在 uni-h5 里' + (st === 'unsupported' ? '是占位桩' : '根本不存在') + '，不许进表（进了就是假称可用）')
    }
  }
  for (const k of table) {
    is(reflective.has(k), true, '表里的 ' + k + ' 视图层根本没用到，是死登记')
  }
  // 传感器 kinds 一旦新增，必须同时决定「H5 有没有」，不能默默漏掉
  for (const k of S.SENSOR_KINDS) {
    is(typeof k.start === 'string' && typeof k.api === 'string', true, k.key + ' 的接口名要写全')
    is(/^(start|on)/.test(k.start) && /^on/.test(k.api), true, k.key + ' 的命名要和 uni 一致')
  }
  // h5Has 是这张表对外的只读判据，文案要从它推，不许再手写一句「H5 里没有」
  is(N.h5Has('startAccelerometer'), true, '加计在 H5 有，判据要说有')
  is(N.h5Has('startCompass'), true, '指南针同上')
  is(N.h5Has('startGyroscope'), false, '陀螺仪在 H5 是占位桩，判据不能说有')
  is(N.h5Has('onProximityChange'), false, '接近传感器 H5 根本没有')
  is(N.h5Has(''), false, '空名不抛')
  is(N.h5Has(null), false, 'null 不抛')
  const sensorVue = fs.readFileSync(path.join(utilsDir(), '..', 'tools', 'components', 'ToolSensor.vue'), 'utf8')
  is(sensorVue.indexOf('h5Has(') > -1, true, '传感器页的 H5 口径要由 h5Has 推出来')
  is(sensorVue.indexOf('H5 预览里没有这些接口') === -1, true, '不许再写死那句「H5 预览里没有这些接口」')
}

console.log('native ' + (fail ? 'FAIL ' + fail : '全绿') + ' ' + ok + '/' + (ok + fail))
process.exit(fail ? 1 : 0)
