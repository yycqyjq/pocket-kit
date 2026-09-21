/**
 * 设备信息采集 ——「搞机」页签的数据层
 * ------------------------------------------------------------
 * 三个环境分层：
 *   · 通用层：uni.getSystemInfoSync()，App / H5 都有；
 *   · Android 原生层：仅 App 端启用，走 plus.android（Native.js）：
 *       - android.os.Build / Build.VERSION / SystemProperties —— 机型与系统
 *       - ACTION_BATTERY_CHANGED 粘性广播 —— 电量/状态/健康/温度/电压/技术
 *       - ActivityManager.MemoryInfo + StatFs —— 内存与存储
 *       - Display.getRealMetrics —— 物理分辨率 / 密度 / 刷新率
 *       - SensorManager.getSensorList —— 传感器清单
 *       - Runtime.exec(cat) —— /sys cpufreq 逐核实时频率与调频策略
 *   · H5 层：navigator.getBattery / hardwareConcurrency 等，尽力而为。
 *
 * 约定：
 *   · 不申请任何新权限；/sys 只读 world-readable 路径，不做 root 探测
 *   · 每个采集各自 try/catch，拿不到的字段返回 ''，视图层统一显示 '—'
 *   · 顶层零副作用（node 可以直接 import），纯格式化函数单独导出供自测
 */

/* ============================================================
 * 纯格式化函数（可单测）
 * ============================================================ */

/** 字节 → GB 文本（三位小数内自动去尾零；无效返回 ''） */
export function fmtGB(bytes) {
  const g = Number(bytes) / 1073741824
  if (!isFinite(g) || g <= 0) return ''
  const s = g >= 1000 ? g.toFixed(0) : g >= 10 ? g.toFixed(1) : g.toFixed(2)
  return parseFloat(s) + ' GB'
}

/** 摄氏度×10 → 温度文本（Intent 里温度是 0.1°C 单位） */
export function fmtTemp(tenth) {
  const v = Number(tenth)
  if (!isFinite(v) || v < -300) return ''
  return (v / 10).toFixed(1) + ' °C'
}

/** 微伏 → 伏文本 */
export function fmtVoltage(uV) {
  const v = Number(uV)
  if (!isFinite(v) || v <= 0) return ''
  return (v / 1e6).toFixed(2) + ' V'
}

/** kHz → MHz 文本（cpufreq 单位是 kHz） */
export function fmtKHz(khz) {
  const v = Number(khz)
  if (!isFinite(v) || v <= 0) return ''
  return Math.round(v / 1000) + ' MHz'
}

/** 毫秒 → 「x 天 x 小时 x 分」 */
export function fmtUptime(ms) {
  const total = Math.floor(Number(ms) / 1000)
  if (!isFinite(total) || total <= 0) return ''
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const out = []
  if (d) out.push(d + ' 天')
  if (h) out.push(h + ' 小时')
  out.push(m + ' 分')
  return out.join(' ')
}

/** 物理像素 + 每英寸点数 → 对角线英寸（估算），失败返回 '' */
export function screenDiagonalIn(w, h, xdpi, ydpi) {
  const W = Number(w), H = Number(h), X = Number(xdpi), Y = Number(ydpi)
  if (!W || !H || !X || !Y) return ''
  const inW = W / X, inH = H / Y
  const d = Math.sqrt(inW * inW + inH * inH)
  if (!isFinite(d) || d <= 0 || d > 30) return ''
  return d.toFixed(1)
}

/** 电量 level/scale → 0-100 整数，无效返回 '' */
export function batteryPercent(level, scale) {
  const l = Number(level), s = Number(scale)
  if (!isFinite(l) || !isFinite(s) || l < 0 || s <= 0) return ''
  return Math.min(100, Math.max(0, Math.round((l / s) * 100)))
}

/** Java 数组/对象尽量转成 「a / b / c」 文本 */
function javaListToText(arr) {
  try {
    if (!arr) return ''
    if (typeof arr === 'string') return arr
    if (arr.length !== undefined) {
      const parts = []
      for (let i = 0; i < arr.length; i++) parts.push(String(arr[i]))
      return parts.filter(Boolean).join(' / ')
    }
    return String(arr)
  } catch (e) {
    return ''
  }
}

/* ============================================================
 * 环境判断
 * ============================================================ */

/** 是否运行在安卓 App（plus 可用且平台是 Android） */
export function isAndroidApp() {
  try {
    if (typeof plus === 'undefined' || !plus.os) return false
    return plus.os.name === 'Android'
  } catch (e) {
    return false
  }
}

function androidActivity() {
  try {
    if (typeof plus === 'undefined' || !plus.android) return null
    return plus.android.runtimeMainActivity()
  } catch (e) {
    return null
  }
}

/** 读系统属性（隐藏 API，Native.js 反射可调） */
function sysProp(key) {
  try {
    // #ifdef APP-PLUS
    const SP = plus.android.importClass('android.os.SystemProperties')
    return String(SP.get(key, '') || '')
    // #endif
    // #ifndef APP-PLUS
    return ''
    // #endif
  } catch (e) {
    return ''
  }
}

/** exec cat 一个 /sys 文件，返回首行文本；失败返回 '' */
function execCat(path) {
  try {
    // #ifdef APP-PLUS
    const RT = plus.android.importClass('java.lang.Runtime')
    const proc = RT.getRuntime().exec('cat ' + path)
    const ISR = plus.android.importClass('java.io.InputStreamReader')
    const BR = plus.android.importClass('java.io.BufferedReader')
    const reader = new BR(new ISR(proc.getInputStream()))
    const line = reader.readLine()
    reader.close()
    proc.destroy()
    return line == null ? '' : String(line).trim()
    // #endif
    // #ifndef APP-PLUS
    return ''
    // #endif
  } catch (e) {
    return ''
  }
}

/* ============================================================
 * 通用层：uni 系统信息（App / H5 都有）
 * ============================================================ */

export function readSystemBase() {
  try {
    const s = uni.getSystemInfoSync() || {}
    return {
      brand: s.brand || '',
      model: s.model || '',
      system: s.system || '',
      platform: s.platform || '',
      screenWidth: s.screenWidth || 0,
      screenHeight: s.screenHeight || 0,
      pixelRatio: s.pixelRatio || 0,
      devicePixelRatio: s.devicePixelRatio || s.pixelRatio || 0,
    }
  } catch (e) {
    return {}
  }
}

/* ============================================================
 * Android 原生层
 * ============================================================ */

/** 机型与系统（Build / VERSION / SystemProperties / 内核） */
export function readBuildInfo() {
  // #ifdef APP-PLUS
  try {
    if (!isAndroidApp()) return null
    const Build = plus.android.importClass('android.os.Build')
    const Sys = plus.android.importClass('java.lang.System')
    return {
      manufacturer: String(Build.MANUFACTURER || ''),
      brand: String(Build.BRAND || ''),
      model: String(Build.MODEL || ''),
      device: String(Build.DEVICE || ''),
      product: String(Build.PRODUCT || ''),
      board: String(Build.BOARD || ''),
      hardware: String(Build.HARDWARE || ''),
      soc: sysProp('ro.soc.model') || sysProp('ro.board.platform'),
      socVendor: sysProp('ro.soc.manufacturer'),
      abis: javaListToText(Build.SUPPORTED_ABIS),
      androidRelease: String(Build.VERSION.RELEASE || ''),
      sdkInt: Number(Build.VERSION.SDK_INT || 0),
      securityPatch: String(Build.VERSION.SECURITY_PATCH || ''),
      buildDisplay: String(Build.DISPLAY || ''),
      kernel: String(Sys.getProperty('os.version') || ''),
    }
  } catch (e) {
    return null
  }
  // #endif
  // #ifndef APP-PLUS
  return null
  // #endif
}

/** 电池：粘性广播一次拿全（电量/状态/供电/健康/温度/电压/技术） */
export function readBattery() {
  // #ifdef APP-PLUS
  try {
    if (!isAndroidApp()) return null
    const activity = androidActivity()
    if (!activity) return null
    const IntentFilter = plus.android.importClass('android.content.IntentFilter')
    const filter = new IntentFilter('android.intent.action.BATTERY_CHANGED')
    const intent = activity.registerReceiver(null, filter)
    if (!intent) return null
    const g = (name, def) => {
      try { return intent.getIntExtra(name, def) } catch (e) { return def }
    }
    let tech = ''
    try { tech = String(intent.getStringExtra('technology') || '') } catch (e) {}
    const statusMap = { 1: '未知', 2: '充电中', 3: '放电中', 4: '未充电', 5: '已充满' }
    const plugMap = { 0: '电池供电', 1: '交流电源', 2: 'USB', 4: '无线充电', 8: '底座' }
    const healthMap = { 1: '未知', 2: '良好', 3: '过热', 4: '已损坏', 5: '过压', 6: '低温', 7: '未知' }
    return {
      supported: true,
      percent: batteryPercent(g('level', -1), g('scale', -1)),
      status: statusMap[g('status', -1)] || '',
      plugged: plugMap[g('plugged', 0)] || '',
      health: healthMap[g('health', -1)] || '',
      temperature: fmtTemp(g('temperature', -1000)),
      voltage: fmtVoltage(g('voltage', -1)),
      tech: tech,
    }
  } catch (e) {
    return null
  }
  // #endif
  // #ifndef APP-PLUS
  return null
  // #endif
}

/** H5 电池：navigator.getBattery（Chrome 系可用，异步） */
export function readBatteryH5() {
  return new Promise((resolve) => {
    try {
      // #ifdef H5
      if (typeof navigator !== 'undefined' && navigator.getBattery) {
        navigator
          .getBattery()
          .then((b) => {
            resolve({
              supported: true,
              percent: Math.round((Number(b.level) || 0) * 100),
              status: b.charging ? '充电中' : '放电中',
              plugged: b.charging ? '电源供电' : '电池供电',
              health: '',
              temperature: '',
              voltage: '',
              tech: '',
            })
          })
          .catch(() => resolve(null))
        return
      }
      // #endif
      resolve(null)
    } catch (e) {
      resolve(null)
    }
  })
}

/** 屏幕：物理分辨率 / 密度 / 当前刷新率（高刷机型的核心参数） */
export function readScreen() {
  const base = readSystemBase()
  const out = {
    physW: 0,
    physH: 0,
    densityDpi: 0,
    xdpi: 0,
    ydpi: 0,
    refreshRate: 0,
    refreshModes: '',
    logicW: base.screenWidth,
    logicH: base.screenHeight,
    pixelRatio: base.pixelRatio || base.devicePixelRatio,
  }
  // #ifdef APP-PLUS
  try {
    const activity = androidActivity()
    if (activity) {
      const wm = activity.getSystemService('window')
      const disp = wm.getDefaultDisplay()
      const DM = plus.android.importClass('android.util.DisplayMetrics')
      const dm = new DM()
      disp.getRealMetrics(dm)
      out.physW = Number(dm.widthPixels) || 0
      out.physH = Number(dm.heightPixels) || 0
      out.densityDpi = Number(dm.densityDpi) || 0
      out.xdpi = Number(dm.xdpi) || 0
      out.ydpi = Number(dm.ydpi) || 0
      out.refreshRate = Math.round(Number(disp.getRefreshRate()) * 10) / 10
      try {
        const Mode = plus.android.importClass('android.view.Display$Mode')
        const modes = disp.getSupportedModes()
        const list = []
        if (modes && modes.length !== undefined) {
          for (let i = 0; i < modes.length; i++) {
            const hz = Math.round(Number(modes[i].getRefreshRate()) * 10) / 10
            if (hz > 0 && list.indexOf(hz) < 0) list.push(hz)
          }
        }
        list.sort(function (a, b) { return a - b })
        out.refreshModes = list.map(function (h) { return h + ' Hz' }).join(' / ')
      } catch (e) {}
    }
  } catch (e) {}
  // #endif
  // #ifdef H5
  try {
    if (typeof screen !== 'undefined') {
      out.physW = out.physW || Math.round((screen.width || 0) * (out.pixelRatio || 1))
      out.physH = out.physH || Math.round((screen.height || 0) * (out.pixelRatio || 1))
    }
  } catch (e) {}
  // #endif
  return out
}

/** 处理器：核心数 / 架构 / SOC / governor / 逐核实时频率 */
export function readCpu() {
  const out = { cores: 0, abis: '', soc: '', hardware: '', governor: '', governors: '', minMhz: '', maxMhz: '', perCore: [] }
  // #ifdef APP-PLUS
  try {
    if (!isAndroidApp()) return out
    const Build = plus.android.importClass('android.os.Build')
    const RT = plus.android.importClass('java.lang.Runtime')
    out.cores = Number(RT.getRuntime().availableProcessors()) || 0
    out.abis = javaListToText(Build.SUPPORTED_ABIS)
    out.soc = sysProp('ro.soc.model') || sysProp('ro.board.platform')
    out.hardware = sysProp('ro.hardware')
    const govRoot = '/sys/devices/system/cpu'
    out.governor = execCat(govRoot + '/cpu0/cpufreq/scaling_governor')
    out.governors = execCat(govRoot + '/cpu0/cpufreq/scaling_available_governors')
    out.minMhz = fmtKHz(execCat(govRoot + '/cpu0/cpufreq/cpuinfo_min_freq'))
    out.maxMhz = fmtKHz(execCat(govRoot + '/cpu0/cpufreq/cpuinfo_max_freq'))
    for (let i = 0; i < out.cores; i++) {
      const raw = execCat(govRoot + '/cpu' + i + '/cpufreq/scaling_cur_freq')
      out.perCore.push({ i: i, text: raw ? fmtKHz(raw) : '离线' })
    }
  } catch (e) {}
  // #endif
  // #ifdef H5
  try {
    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
      out.cores = Number(navigator.hardwareConcurrency) || 0
    }
  } catch (e) {}
  // #endif
  return out
}

/** 内存与存储：运行内存 / 应用堆上限 / 用户存储 */
export function readMemoryStorage() {
  const out = { ramTotal: 0, ramAvail: 0, heapMB: 0, storageTotal: 0, storageAvail: 0 }
  // #ifdef APP-PLUS
  try {
    if (!isAndroidApp()) return out
    const activity = androidActivity()
    if (!activity) return out
    const am = activity.getSystemService('activity')
    const MI = plus.android.newObject('android.app.ActivityManager$MemoryInfo')
    am.getMemoryInfo(MI)
    out.ramTotal = Number(MI.totalMem) || 0
    out.ramAvail = Number(MI.availMem) || 0
    out.heapMB = Number(am.getMemoryClass()) || 0
    const StatFs = plus.android.importClass('android.os.StatFs')
    const dir = plus.android.invoke('android.os.Environment', 'getExternalStorageDirectory')
    const stat = new StatFs(dir.getAbsolutePath())
    out.storageTotal = Number(stat.getTotalBytes()) || 0
    out.storageAvail = Number(stat.getAvailableBytes()) || 0
  } catch (e) {}
  // #endif
  // #ifdef H5
  try {
    if (typeof navigator !== 'undefined' && navigator.deviceMemory) {
      out.ramTotal = Number(navigator.deviceMemory) * 1073741824
    }
  } catch (e) {}
  // #endif
  return out
}

/** 传感器清单（名称 / 厂商 / 功耗） */
export function readSensors() {
  const out = { list: [], count: 0 }
  // #ifdef APP-PLUS
  try {
    if (!isAndroidApp()) return out
    const activity = androidActivity()
    if (!activity) return out
    const sm = activity.getSystemService('sensor')
    const list = sm.getSensorList(-1)
    const n = plus.android.invoke(list, 'size')
    for (let i = 0; i < n; i++) {
      const s = plus.android.invoke(list, 'get', i)
      const name = String(s.getName() || '')
      const vendor = String(s.getVendor() || '')
      let power = ''
      try {
        const p = Number(s.getPower())
        if (isFinite(p) && p > 0) power = p + ' mA'
      } catch (e) {}
      out.list.push({ key: i + '-' + name, name: name, meta: [vendor, power].filter(Boolean).join(' · ') })
    }
    out.count = n
  } catch (e) {}
  // #endif
  return out
}

/** 开机时长（不含休眠的累计运行时间） */
export function readUptime() {
  // #ifdef APP-PLUS
  try {
    if (!isAndroidApp()) return ''
    const SC = plus.android.importClass('android.os.SystemClock')
    return fmtUptime(Number(SC.elapsedRealtime()))
  } catch (e) {}
  // #endif
  return ''
}
