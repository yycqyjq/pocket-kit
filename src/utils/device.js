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
      voltageUv: g('voltage', -1),
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
        // 只为了把类引进运行时（返回的 Mode 本身用不上，模式列表是从 disp 取的）
        plus.android.importClass('android.view.Display$Mode')
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


/* ============================================================
 * 搞机扩展：身份与安全 / 图形与生态 / 摄像头 / 充电功率 / Swap
 * 全部走系统 API 与 world-readable 路径，不申请任何新权限
 * ============================================================ */

/** 多行读取（/proc/meminfo 用），最多 max 行 */
function execHeadLines(path, max) {
  try {
    // #ifdef APP-PLUS
    const RT = plus.android.importClass('java.lang.Runtime')
    const proc = RT.getRuntime().exec('cat ' + path)
    const ISR = plus.android.importClass('java.io.InputStreamReader')
    const BR = plus.android.importClass('java.io.BufferedReader')
    const reader = new BR(new ISR(proc.getInputStream()))
    const out = []
    let line
    while ((line = reader.readLine()) != null && out.length < max) out.push(String(line))
    reader.close()
    proc.destroy()
    return out
    // #endif
    // #ifndef APP-PLUS
    return []
    // #endif
  } catch (e) {
    return []
  }
}

/** 系统属性 → 中文文本的小映射 */
function mapProp(raw, table) {
  const v = String(raw || '').trim()
  return table[v] || ''
}

/**
 * 身份与安全：Project Treble / 动态分区 / 无缝更新 / 验证启动（引导锁）/ 加密。
 * 刷机人群的判定项全部来自只读系统属性（Treble Info 的判定口径）。
 */
export function readSecurityInfo() {
  const out = { treble: '', dynamicPartitions: '', seamlessUpdates: '', verifiedBoot: '', cryptoType: '' }
  // #ifdef APP-PLUS
  try {
    if (!isAndroidApp()) return out
    const treble = sysProp('ro.treble.enabled')
    out.treble = treble === 'true' ? '支持' : treble === 'false' ? '不支持' : ''
    const dp = sysProp('ro.boot.dynamic_partitions') || sysProp('ro.dynamic_partitions')
    out.dynamicPartitions = dp === 'true' ? '支持（动态分区）' : dp === 'false' ? '不支持' : ''
    const ab = sysProp('ro.boot.virtual_ab.enabled') || sysProp('ro.virtual_ab.enabled')
    out.seamlessUpdates = ab === 'true' ? '支持（虚拟 AB，OTA 不停机）' : ab === 'false' ? '不支持（A/B 之外的传统分区）' : ''
    const vb = mapProp(sysProp('ro.boot.verifiedbootstate'), {
      green: '已锁定（绿色，官方系统）',
      orange: '已解锁（橙色，可刷第三方系统）',
      yellow: '自签证书（黄色）',
      red: '已损坏（红色）',
    })
    out.verifiedBoot = vb
    const ct = mapProp(sysProp('ro.crypto.type'), { file: '文件级加密', block: '全盘加密' })
    out.cryptoType = ct
  } catch (e) {}
  // #endif
  return out
}

/** 图形与生态：GLES 版本 / Vulkan 支持 / WebView 与 Play 服务版本 */
export function readGraphicsEco() {
  const out = { gles: '', vulkan: '', vulkanCompute: '', webView: '', gms: '' }
  // #ifdef APP-PLUS
  try {
    if (!isAndroidApp()) return out
    const activity = androidActivity()
    if (!activity) return out
    const am = activity.getSystemService('activity')
    const ci = am.getDeviceConfigurationInfo()
    const v = Number(ci.reqGlEsVersion) || 0
    if (v) out.gles = 'GLES ' + (v >> 16) + '.' + (v & 0xffff)
    const pm = activity.getPackageManager()
    out.vulkan = pm.hasSystemFeature('android.hardware.vulkan.version') ? '支持' : ''
    out.vulkanCompute = pm.hasSystemFeature('android.hardware.vulkan.compute') ? '支持硬件计算' : ''
    const ver = (pkg) => {
      try {
        const pi = pm.getPackageInfo(pkg, 0)
        return String(pi.versionName || '')
      } catch (e) {
        return ''
      }
    }
    out.webView = ver('com.google.android.webview')
    out.gms = ver('com.google.android.gms')
  } catch (e) {}
  // #endif
  return out
}

/** Widevine DRM 安全级别：L1 才能流媒体高清，L3 只能软解标清（DRM Info 的核心判定） */
export function readDrmInfo() {
  const out = { widevine: '', note: '' }
  // #ifdef APP-PLUS
  try {
    if (!isAndroidApp()) return out
    const MediaDrm = plus.android.importClass('android.media.MediaDrm')
    const UUID = plus.android.importClass('java.util.UUID')
    const uuid = UUID.fromString('edef8ba9-79d6-4ace-a3c8-27dcd51d21ed')
    const drm = new MediaDrm(uuid)
    const sec = String(drm.getPropertyString('securityLevel') || '')
    out.widevine = sec.toUpperCase().indexOf('L1') > -1 ? 'L1（硬件级，可流媒体高清）' : sec ? sec + '（软解，流媒体高清受限）' : ''
    try { drm.release() } catch (e) {}
  } catch (e) {
    out.note = '这台设备读不出 Widevine 信息'
  }
  // #endif
  return out
}

/** 摄像头清单（Camera2）：前后置、传感器分辨率、硬件级别、闪光灯 */
export function readCameras() {
  const out = { list: [], count: 0 }
  // #ifdef APP-PLUS
  try {
    if (!isAndroidApp()) return out
    const activity = androidActivity()
    if (!activity) return out
    const CM = plus.android.importClass('android.hardware.camera2.CameraCharacteristics')
    const mgr = activity.getSystemService('camera')
    const ids = mgr.getCameraIdList()
    const facingMap = { 0: '前置', 1: '后置', 2: '外接' }
    const levelMap = { 3: 'LEGACY（最基础）', 1: 'LIMITED（基础）', 2: 'FULL（完整）', 4: 'EXTERNAL（外接）' }
    const n = ids && ids.length !== undefined ? ids.length : 0
    for (let i = 0; i < n; i++) {
      try {
        const ch = mgr.getCameraCharacteristics(String(ids[i]))
        const facing = Number(ch.get(CM.LENS_FACING))
        const size = ch.get(CM.SENSOR_INFO_PIXEL_ARRAY_SIZE)
        const lvl = Number(ch.get(CM.INFO_SUPPORTED_HARDWARE_LEVEL))
        let flash = ''
        try {
          flash = ch.get(CM.FLASH_INFO_AVAILABLE) ? ' · 闪光灯' : ''
        } catch (e) {}
        const w = size ? Number(size.getWidth()) : 0
        const h = size ? Number(size.getHeight()) : 0
        out.list.push({
          key: 'cam' + i,
          name: (facingMap[facing] || '摄像头 ' + i) + (w ? '（' + w + ' × ' + h + '）' : ''),
          meta: [levelMap[lvl] || '', flash].filter(Boolean).join(' · '),
        })
      } catch (e) {}
    }
    out.count = out.list.length
  } catch (e) {}
  // #endif
  return out
}

/** 电池加算：实时电流（µA）与剩余电量（µAh），配合电压算充电功率 */
export function readBatteryPower() {
  const out = { currentUa: 0, chargeUah: 0 }
  // #ifdef APP-PLUS
  try {
    if (!isAndroidApp()) return out
    const activity = androidActivity()
    if (!activity) return out
    const bm = activity.getSystemService('batterymanager')
    const BM = plus.android.importClass('android.os.BatteryManager')
    out.currentUa = Number(bm.getLongProperty(BM.BATTERY_PROPERTY_CURRENT_NOW)) || 0
    out.chargeUah = Number(bm.getLongProperty(BM.BATTERY_PROPERTY_CHARGE_COUNTER)) || 0
  } catch (e) {}
  // #endif
  return out
}

/** 充电功率：电压(µV) × 电流(µA) → 瓦（电流符号因机型而异，取绝对值） */
export function fmtWatts(voltageUv, currentUa) {
  const v = Number(voltageUv) / 1e6
  const a = Math.abs(Number(currentUa)) / 1e6
  if (!isFinite(v) || !isFinite(a) || v <= 0 || a <= 0) return ''
  const w = v * a
  if (w < 0.5) return ''
  return (w >= 10 ? w.toFixed(0) : w.toFixed(1)) + ' W'
}

/** Swap / ZRAM：从 /proc/meminfo 提取 */
export function readSwap() {
  const out = { swapTotal: '', swapFree: '' }
  // #ifdef APP-PLUS
  try {
    if (!isAndroidApp()) return out
    const lines = execHeadLines('/proc/meminfo', 60)
    const pick = (key) => {
      const l = lines.find((x) => x.indexOf(key) === 0)
      if (!l) return ''
      const kb = Number(l.replace(/[^0-9]/g, ''))
      return kb ? fmtGB(kb * 1024) : ''
    }
    out.swapTotal = pick('SwapTotal')
    out.swapFree = pick('SwapFree')
  } catch (e) {}
  // #endif
  return out
}


/** 温度探针：/sys/class/thermal 全量温区（连续缺号 3 次即停，最多扫 48 个） */
export function readThermal() {
  const out = { zones: [], count: 0 }
  // #ifdef APP-PLUS
  try {
    if (!isAndroidApp()) return out
    let miss = 0
    for (let i = 0; i < 48 && miss < 3; i++) {
      const type = execCat('/sys/class/thermal/thermal_zone' + i + '/type')
      const raw = execCat('/sys/class/thermal/thermal_zone' + i + '/temp')
      if (!type && !raw) {
        miss++
        continue
      }
      miss = 0
      const t = Number(raw)
      const c = isFinite(t) && t > -300 ? t / 1000 : null
      out.zones.push({
        key: 'tz' + i,
        type: type || 'zone' + i,
        temp: c != null ? c.toFixed(1) + ' °C' : '',
        hot: c != null && c >= 45,
      })
    }
    out.count = out.zones.length
  } catch (e) {}
  // #endif
  return out
}

/**
 * Wi-Fi 链路：速率 / 频段 / 信号 / 局域网 IP。
 * 需要 ACCESS_WIFI_STATE（普通级权限，装即授）；没有授权时返回空，视图显示 —。
 * 只读当前连接的链路状态，不扫描周边网络、不读浏览记录。
 */
export function readWifi() {
  const out = { linkSpeed: '', band: '', rssi: '', ip: '' }
  // #ifdef APP-PLUS
  try {
    if (!isAndroidApp()) return out
    const activity = androidActivity()
    if (!activity) return out
    const wm = activity.getSystemService('wifi')
    const info = wm.getConnectionInfo()
    if (!info) return out
    const speed = Number(info.getLinkSpeed())
    out.linkSpeed = speed > 0 ? speed + ' Mbps' : ''
    const freq = Number(info.getFrequency())
    if (freq > 0) {
      const band = freq >= 5925 ? '6 GHz' : freq >= 4900 ? '5 GHz' : freq >= 2400 ? '2.4 GHz' : ''
      out.band = (band ? band + ' · ' : '') + freq + ' MHz'
    }
    const rssi = Number(info.getRssi())
    out.rssi = isFinite(rssi) && rssi < 0 ? rssi + ' dBm' : ''
    const ip = Number(info.getIpAddress())
    if (ip > 0) out.ip = [ip & 0xff, (ip >> 8) & 0xff, (ip >> 16) & 0xff, (ip >>> 24) & 0xff].join('.')
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
