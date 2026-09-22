/**
 * 安卓原生能力的统一入口：能力探测 + 回调式 API 的 Promise 包装 + 失败话术翻译。
 *
 * 这一层存在的理由只有一个：D 批那几件工具（传感器 / 硬件测试 / 定位 / 屏幕 / 快捷唤起）
 * 全靠 uni.* 与 plus.* 活着，而这些接口在 H5 预览里有一半根本不存在，真机上也会因为
 * 没给权限、厂商 ROM 阉割、模拟器没有硬件而局部失败。所以规矩是：
 *   · 先 typeof，再 try/catch，绝不裸调；
 *   · 缺什么就用人话说清楚缺什么，而不是抛 undefined is not a function 把页面搞崩；
 *   · 一个能力失败只能影响它自己那一行，不能连累整页。
 */

/** 接口名 → 中文叫法，报错时直接拼进句子里 */
const API_NAME = {
  getLocation: '定位',
  onLocationChange: '持续定位',
  offLocationChange: '停止持续定位',
  chooseLocation: '选点',
  openLocation: '打开地图查看位置',
  startAccelerometer: '加速度传感器',
  stopAccelerometer: '停止加速度传感器',
  onAccelerometerChange: '加速度回调',
  onGyroscopeChange: '陀螺仪回调',
  onLightIntensityChange: '光线回调',
  offLightIntensityChange: '停止光线监听',
  onProximityChange: '接近回调',
  offProximityChange: '停止接近监听',
  startGyroscope: '陀螺仪',
  stopGyroscope: '停止陀螺仪',
  startCompass: '指南针',
  stopCompass: '停止指南针',
  onCompassChange: '指南针回调',
  onDeviceMotionChange: '设备方向回调',
  startDeviceMotionListening: '设备方向监听',
  stopDeviceMotionListening: '停止设备方向监听',
  onNetworkStatusChange: '网络状态变化',
  getNetworkType: '网络类型',
  vibrateShort: '短震动',
  vibrateLong: '长震动',
  setScreenBrightness: '设置屏幕亮度',
  getScreenBrightness: '读取屏幕亮度',
  setKeepScreenOn: '屏幕常亮',
  makePhoneCall: '拨号',
  visitUrl: '打开网页',
  setClipboardData: '写剪贴板',
  getClipboardData: '读剪贴板',
  createInnerAudioContext: '音频播放',
  getSetting: '授权状态',
  authorize: '申请授权',
  request: '网络请求',
}

export function apiName(key) {
  return API_NAME[key] || key
}

function uniOf() {
  try {
    return typeof uni !== 'undefined' && uni ? uni : null
  } catch (e) {
    return null
  }
}

/**
 * 字面量把接口名再写一遍，只为让 build:h5 认得它。
 *
 * uni-app 打 H5 时是按「源码里字面出现过 uni.xxx」做按需注入的，产物里 window.uni 是个空壳，
 * 只有被字面引用过的接口才会挂上去。这一层全程用 u[key] 反射调用，于是静态预览里所有接口
 * 都显示「不存在」——开发模式（dev:h5）不会这样，真机也不会（App 端 uni 是完整全局对象）。
 * 表里只登记 H5 真有的那几项，缺的接口在浏览器预览里本来就该报缺失。
 *
 * 边界（拿 node_modules/@dcloudio/uni-h5 的产物逐个核过，scripts/selftest/native.test.mjs 会回查）：
 * 加速度计走 devicemotion、指南针走 deviceorientation、震动走 navigator.vibrate、
 * 常亮走 Wake Lock，这四项 H5 是真实现，所以要登记；亮度两项与陀螺仪两项在 H5 里是
 * createUnsupportedAsyncApi，光线 / 接近 / 设备方向三项干脆没有，这些都不许进表。
 * uniOff 会把 onXxxChange 换成 offXxxChange 再查一次表，所以 on/off 得成对登记。
 */
const UNI_LITERAL = {
  getSystemInfoSync: () => uni.getSystemInfoSync,
  getLocation: () => uni.getLocation,
  openLocation: () => uni.openLocation,
  makePhoneCall: () => uni.makePhoneCall,
  getClipboardData: () => uni.getClipboardData,
  setClipboardData: () => uni.setClipboardData,
  createInnerAudioContext: () => uni.createInnerAudioContext,
  getNetworkType: () => uni.getNetworkType,
  onNetworkStatusChange: () => uni.onNetworkStatusChange,
  vibrateShort: () => uni.vibrateShort,
  vibrateLong: () => uni.vibrateLong,
  setKeepScreenOn: () => uni.setKeepScreenOn,
  startAccelerometer: () => uni.startAccelerometer,
  stopAccelerometer: () => uni.stopAccelerometer,
  onAccelerometerChange: () => uni.onAccelerometerChange,
  offAccelerometerChange: () => uni.offAccelerometerChange,
  startCompass: () => uni.startCompass,
  stopCompass: () => uni.stopCompass,
  onCompassChange: () => uni.onCompassChange,
  offCompassChange: () => uni.offCompassChange,
}

/** 接口函数本体：先反射拿（App 与开发模式），拿不到再试字面量表（H5 生产包） */
function apiOf(key) {
  const u = uniOf()
  try {
    if (u && typeof u[key] === 'function') return u[key].bind(u)
  } catch (e) {
    /* 属性访问本身抛了（部分运行时用 getter 拦），落到字面量表再试一次 */
  }
  const lit = UNI_LITERAL[key]
  if (!lit) return null
  try {
    const f = lit()
    return typeof f === 'function' ? f : null
  } catch (e) {
    /* Node 自查里没有 uni 这个全局，ReferenceError 就按接口不可用处理 */
    return null
  }
}
function plusOf() {
  try {
    return typeof plus !== 'undefined' && plus ? plus : null
  } catch (e) {
    return null
  }
}

/** 当前环境到底有什么：每个探测都单独兜底，返回的是可以直接上屏的布尔表 */
export function probe() {
  const u = uniOf()
  const p = plusOf()
  const c = {
    uni: !!u,
    sysInfo: false,
    plus: !!p,
    android: false,
    os: '',
    isAndroidApp: false,
    platform: '',
  }
  try {
    const f = apiOf('getSystemInfoSync')
    c.sysInfo = !!f
    if (f) {
      const s = f() || {}
      c.platform = String(s.platform || '')
      c.os = String(s.osName || s.platform || '')
    }
  } catch (e) {
    c.sysInfo = false
  }
  try {
    c.android = !!(p && p.android && typeof p.android.importClass === 'function')
  } catch (e) {
    c.android = false
  }
  try {
    if (p && p.os) {
      c.os = String(p.os.name || c.os)
      c.isAndroidApp = c.os === 'Android'
    }
  } catch (e) {
    c.isAndroidApp = false
  }
  return c
}

/** 系统信息（逻辑分辨率、缩放比等）；拿不到就返回 null，视图里不出现裸 getSystemInfoSync */
export function systemInfo() {
  const f = apiOf('getSystemInfoSync')
  if (!f) return null
  try {
    return f() || null
  } catch (e) {
    return null
  }
}

/** 为什么原生分支没跑起来——按探测结果给一句人话 */
export function whyMissing(c) {
  const p = c || probe()
  if (!p.uni) return '页面里连 uni 运行时都没有，处于最严重的降级状态'
  if (!p.sysInfo) return 'uni 在，但 getSystemInfoSync 不可用，多半是运行时版本过旧'
  if (!p.plus) return '当前是浏览器 H5 预览，没有 plus 原生运行时，碰不到安卓 API'
  if (!p.isAndroidApp) return 'plus 在，但系统报告的是 ' + (p.os || '未知') + '，安卓分支不会执行'
  if (!p.android) return '安卓 App 已就绪，但 plus.android（Native.js）不可用'
  return '已在安卓 App 里，是这一个接口本身不可用或被系统拒绝'
}

export function missText(label, c) {
  return '读不到「' + label + '」：' + whyMissing(c)
}

/** 单个接口在不在 */
export function hasApi(key) {
  return !!apiOf(key)
}

/** 把 uni 的错误码翻译成人话：权限、无服务、无硬件、用户取消各说各的 */
export function failText(key, err) {
  const name = apiName(key)
  const e = err || {}
  const code = String(e.errCode !== undefined ? e.errCode : e.code !== undefined ? e.code : '')
  const msg = String(e.errMsg || e.message || '')
  if (/auth deny|denied|permission|无权限|授权/i.test(msg) || code === '-14') {
    return name + '被系统拒绝：没有拿到定位权限。请到系统设置里给本应用授权后重试'
  }
  if (/timeout|超时/i.test(msg)) return name + '超时了：卫星信号或网络没跟上，到开阔处再试一次'
  if (/network/i.test(msg)) return name + '失败：需要网络协助定位，检查网络后再试'
  if (/unavailable|not support|不支持|not available/i.test(msg)) return '这台设备没有提供' + name + '的能力'
  if (/cancel/i.test(msg)) return '取消了' + name
  if (/no cell|no service|无服务/i.test(msg)) return name + '失败：当前没有可用蜂窝网络'
  return name + '失败' + (msg ? '：' + msg : '')
}

/**
 * 回调式 uni API → Promise。接口不存在时不抛 undefined，而是给出降级说明。
 * 只用于「点一下要一个结果」的场景（定位、拨号、震动这些），持续监听另走 start/stop。
 */
export function uniCall(key, opts) {
  return new Promise((resolve, reject) => {
    const fn = apiOf(key)
    if (!fn) {
      reject(new Error(missText(apiName(key), probe())))
      return
    }
    let settled = false
    const o = Object.assign({}, opts || {}, {
      success: (r) => {
        if (settled) return
        settled = true
        resolve(r)
      },
      fail: (e) => {
        if (settled) return
        settled = true
        reject(new Error(failText(key, e)))
      },
    })
    if (typeof o.complete === 'function') {
      const outer = o.complete
      o.complete = (r) => {
        try {
          outer(r)
        } catch (x) {
          /* 用户的 complete 不能影响主流程 */
        }
      }
    }
    try {
      fn(o)
    } catch (e) {
      if (settled) return
      settled = true
      reject(new Error(apiName(key) + '调用直接抛了：' + ((e && e.message) || e)))
    }
  })
}

/**
 * 持续监听的开关包装：start 系列同样先探测。
 * 返回 { started, message }，视图按这个决定要不要挂回调。
 */
export function uniStart(key, opts) {
  const fn = apiOf(key)
  if (!fn) {
    return { started: false, message: missText(apiName(key), probe()) }
  }
  try {
    fn(Object.assign({}, opts || {}))
    return { started: true, message: '' }
  } catch (e) {
    return { started: false, message: apiName(key) + '启动失败：' + ((e && e.message) || e) }
  }
}

export function uniStop(key) {
  const fn = apiOf(key)
  if (!fn) return false
  try {
    fn()
    return true
  } catch (e) {
    return false
  }
}

/**
 * 挂持续回调（onXxxChange 系列）。同样先探测，接口缺失时返回降级说明而不是抛。
 * 回调本身包一层 try/catch：视图里的渲染错误不能把系统的分发链路搞断。
 */
export function uniOn(key, cb) {
  const fn = apiOf(key)
  if (!fn) {
    return { started: false, message: missText(apiName(key), probe()) }
  }
  try {
    fn((res) => {
      try {
        cb(res)
      } catch (e) {
        /* 渲染层报错到此为止 */
      }
    })
    return { started: true, message: '' }
  } catch (e) {
    return { started: false, message: apiName(key) + '注册失败：' + ((e && e.message) || e) }
  }
}

/** 摘掉回调（offXxxChange 系列）。老版本没有 off 接口时静略过，靠 stop 系列收尾。 */
export function uniOff(key) {
  const fn = apiOf('off' + String(key).slice(2))
  if (!fn) return false
  try {
    fn()
    return true
  } catch (e) {
    return false
  }
}

/** 当前播放的停止句柄；同一时刻只可能有一段声音在放 */
let activeStop = null

/** 中断当前播放；没有在播的东西时静默返回 */
export function stopWav() {
  const f = activeStop
  activeStop = null
  if (typeof f !== 'function') return false
  try {
    f()
    return true
  } catch (e) {
    return false
  }
}

/**
 * 播一段本机合成的音频（data URL WAV）。
 * 先走 uni 的播放器，拿不到就退到 webview 的 Audio；两条路都没有才报缺失。
 * 播完（onEnded）与超时兜底都会 resolve，页面不会卡在「正在播放」。
 */
export function playWav(url, ms) {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('没有可播放的音频'))
      return
    }
    let settled = false
    let mine = null
    const clear = () => {
      if (mine && activeStop === mine) activeStop = null
    }
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      clear()
      resolve(false)
    }, Math.max(1000, Number(ms) || 1000) + 6000)
    const done = (v) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clear()
      resolve(v)
    }
    const bad = (m) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clear()
      reject(new Error(m))
    }
    const mk = apiOf('createInnerAudioContext')
    if (mk) {
      let ctx = null
      try {
        ctx = mk({ useWebAudioImplement: false })
      } catch (e) {
        try {
          ctx = mk()
        } catch (x) {
          ctx = null
        }
      }
      if (ctx) {
        try {
          ctx.onEnded(() => {
            try {
              ctx.stop()
            } catch (e) {
              /* 已经结束了，stop 失败无所谓 */
            }
            try {
              ctx.destroy()
            } catch (e) {
              /* 同上 */
            }
            done(true)
          })
          ctx.onError((err) => {
            try {
              ctx.destroy()
            } catch (e) {
              /* 忽略 */
            }
            bad(
              '播放器报错：' +
                ((err && (err.errMsg || err.message)) || '未知') +
                '。这台机器可能不吃本机合成的 data URL 音频，先确认媒体音量没静音，再换一个预设试试'
            )
          })
          ctx.src = url
          mine = () => {
            try {
              ctx.stop()
            } catch (x) {
              /* 已经停了 */
            }
            try {
              ctx.destroy()
            } catch (x) {
              /* 已经销毁了 */
            }
          }
          activeStop = mine
          ctx.play()
          return
        } catch (e) {
          try {
            ctx.destroy()
          } catch (x) {
            /* 忽略 */
          }
        }
      }
    }
    try {
      if (typeof Audio !== 'undefined') {
        const a = new Audio(url)
        a.addEventListener('ended', () => done(true))
        a.addEventListener('error', () => bad('渲染内核放不出这段 WAV，可能是解码器不认 PCM'))
        mine = () => {
          try {
            a.pause()
            a.src = ''
          } catch (x) {
            /* 已经停了 */
          }
        }
        activeStop = mine
        const p = a.play()
        if (p && typeof p.catch === 'function') {
          p.catch((e) => bad('系统不让自动播放：' + ((e && e.name) || e)))
          return
        }
        return
      }
    } catch (e) {
      /* 落到下面的缺失说明 */
    }
    bad(missText('音频播放', probe()))
  })
}

/** 能拿到安卓 Context 时才做的事，统一从这里走，视图里不出现 plus.android */
export function withAndroid(fn, fallbackLabel) {
  const p = plusOf()
  const c = probe()
  if (!c.android) return { ok: false, message: missText(fallbackLabel || '安卓原生接口', c) }
  try {
    return { ok: true, value: fn(p) }
  } catch (e) {
    return { ok: false, message: (fallbackLabel || '原生调用') + '失败：' + ((e && e.message) || e) }
  }
}

/**
 * 把一个 URI 交给系统去唤起别的 App。真机走 plus.runtime.openURL，H5 预览退回地址栏。
 * 协议白名单由调用方（utils/shortcut.js 的 urlAllowed）把关，这里只负责递出去和翻译失败。
 */
export function openExternal(url) {
  const p = plusOf()
  if (p && p.runtime && typeof p.runtime.openURL === 'function') {
    try {
      p.runtime.openURL(url)
      return { ok: true, via: 'plus.runtime.openURL' }
    } catch (e) {
      return { ok: false, message: '系统没接这个地址：' + ((e && e.message) || e) + '。多半是这台机上没有一个 App 认领该协议' }
    }
  }
  try {
    if (typeof window !== 'undefined' && window.location) {
      window.location.href = url
      return { ok: true, via: 'H5 地址栏' }
    }
  } catch (e) {
    /* 落到下面的缺失说明 */
  }
  return { ok: false, message: missText('唤起外部应用', probe()) }
}

/** 按 settings action 直接打开系统设置里的某一页 */
export function startActivityAction(action) {
  return withAndroid((p) => {
    const main = p.android.runtimeMainActivity()
    const it = p.android.newObject('android.content.Intent', action)
    main.startActivity(it)
    return action
  }, '系统设置页')
}

/** 安卓权限常量 → 中文叫法，弹窗前后的解释文案都用它，避免视图里各写一份 */
export const ANDROID_PERMS = {
  'android.permission.ACCESS_FINE_LOCATION': '精确定位',
  'android.permission.ACCESS_COARSE_LOCATION': '粗略位置',
  'android.permission.CAMERA': '相机',
}

export function permName(permission) {
  const key = String(permission || '')
  return ANDROID_PERMS[key] || key.replace('android.permission.', '')
}

/** 定位与相机这两组危险权限，视图里从这里取，不要各自复制字符串 */
export const PERM_LOCATION = ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION']
export const PERM_CAMERA = ['android.permission.CAMERA']

/**
 * 安卓危险权限的运行时申请。没有 plus、或运行时没给这个入口时不报错，
 * 只回 skipped:true，让调用方照常去调真正的接口——那边的失败话术更准。
 * 调用方只该看 ok / skipped / noneGranted / message，不要把权限全名再抄一遍。
 */
export function requestAndroidPermissions(list, label) {
  const want = (list || []).filter((x) => typeof x === 'string' && x)
  return new Promise((resolve) => {
    const p = plusOf()
    const done = (r) =>
      resolve(Object.assign({ ok: false, granted: [], denied: [], noneGranted: false, skipped: false, message: '' }, r))
    if (!want.length) return done({ skipped: true })
    if (!p || !p.android || typeof p.android.requestPermissions !== 'function') {
      return done({ skipped: true })
    }
    const names = want.map(permName).join('、')
    const fallback = (why) => done({ message: (label || names) + '没有申请到：' + why })
    let settled = false
    try {
      p.android.requestPermissions(
        want,
        (res) => {
          if (settled) return
          settled = true
          const r = res || {}
          const granted = (r.granted || []).map(String)
          const always = (r.deniedAlways || []).map(String)
          const present = (r.deniedPresent || []).map(String)
          const denied = always.concat(present)
          if (granted.length === want.length) return done({ ok: true, granted, denied: [] })
          const why = always.length
            ? '系统已经永久拒绝过' + always.map(permName).join('、') + '，要到「系统设置 → 应用 → 权限」里手动放行'
            : present.length
              ? '这一次没点允许'
              : '系统没有给出结果'
          return done({ granted, denied, noneGranted: granted.length === 0, message: (label || names) + '没申请到：' + why })
        },
        (e) => {
          if (settled) return
          settled = true
          fallback(((e && e.message) || '权限申请接口报错'))
        }
      )
    } catch (e) {
      if (settled) return
      settled = true
      fallback(((e && e.message) || e))
    }
  })
}

export const NATIVE_NOTES = [
  { t: '为什么要能力探测', d: '同一份代码要跑在 H5 预览和安卓 App 上，而这两边有的接口完全不同；不探测就是一次 undefined 报错，整页白屏。这里所有原生调用都先 typeof 再 try/catch。' },
  { t: '权限口径', d: '一共声明 7 项权限，其中 3 项是运行时才弹的危险权限：精确定位与粗略位置（定位与坐标页）、相机（只用于手电筒开关和镜头清单，不拍照、不录像、不落盘、不读相册）。拨号、发短信、唤起地图与商店都走系统界面，不需要额外权限；震动、改亮度、常亮都不涉及危险权限。' },
  { t: '读不到不代表工具坏了', d: '模拟器常常没有传感器和闪光灯，部分定制 ROM 会屏蔽亮度接口，H5 预览更是连 plus 都没有。这些都会写成一行中文提示，其余部分照常可用。' },
  { t: '不联网', d: '本组工具只读设备本身，定位结果只停留在页面上，不发请求、不上传。' },
]
