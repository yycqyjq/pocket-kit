<template>
  <view>
    <!-- 设备概览 -->
    <PkCard title="设备概览" accent="#2F7A8C">
      <view class="hero">
        <text class="hero__big">{{ heroName }}</text>
        <text class="hero__sub">{{ heroSub }}</text>
      </view>
      <PkRow label="品牌 / 制造商" :value="ov.brandMaker" :copy="false" />
      <PkRow label="设备代号" :value="ov.codename" mono />
      <PkRow label="SOC / 平台" :value="ov.soc" mono />
      <PkRow label="硬件" :value="ov.hardware" mono />
      <PkRow label="系统版本" :value="ov.systemText" :copy="false" />
      <PkRow label="安全补丁" :value="ov.patch" :copy="false" />
      <PkRow label="内核" :value="ov.kernel" mono />
      <PkRow label="构建号" :value="ov.buildDisplay" mono />
      <PkRow label="开机时长" :value="ov.uptime" :copy="false" />
      <view class="act-row">
        <PkBtn :text="loading ? '读取中…' : '重新读取'" kind="soft" @tap="loadAll" />
        <PkBtn text="复制完整档案" kind="ghost" @tap="copyProfile" />
      </view>
      <text v-if="readAt" class="tip">读取于 {{ readAt }} · 全部本地读取，不联网、不上传、不申请权限</text>
    </PkCard>

    <!-- 电池 -->
    <PkCard v-if="battery" title="电池" accent="#3E7A4E">
      <PkRow label="电量" :value="batteryText.percent" big :copy="false" />
      <PkRow label="状态" :value="batteryText.status" :copy="false" />
      <PkRow label="供电" :value="batteryText.plugged" :copy="false" />
      <PkRow label="健康" :value="batteryText.health" :copy="false" />
      <PkRow label="电池温度" :value="batteryText.temperature" :copy="false" />
      <PkRow label="电压" :value="batteryText.voltage" :copy="false" />
      <PkRow v-if="battery.tech" label="电池技术" :value="battery.tech" :copy="false" />
      <PkRow v-if="batteryText.watts" label="实时功率" :value="batteryText.watts" :copy="false" />
      <PkRow v-if="batteryText.charge" label="剩余容量" :value="batteryText.charge" :copy="false" />
      <text class="tip">想看充电变化，插上电再点上面「重新读取」就是最新值</text>
    </PkCard>

    <!-- 屏幕 -->
    <PkCard title="屏幕" accent="#4A6FA5">
      <PkRow label="物理分辨率" :value="screenText.phys" mono />
      <PkRow label="逻辑分辨率" :value="screenText.logic" mono :copy="false" />
      <PkRow label="像素密度" :value="screenText.dpi" :copy="false" />
      <PkRow label="估算尺寸" :value="screenText.inch" :copy="false" />
      <PkRow label="当前刷新率" :value="screenText.hz" :copy="false" />
      <PkRow v-if="screenText.modes" label="支持的刷新率" :value="screenText.modes" :copy="false" stack />
    </PkCard>

    <!-- 处理器 -->
    <PkCard title="处理器" accent="#8C5B3E">
      <PkRow label="核心数" :value="cpuText.cores" :copy="false" />
      <PkRow label="指令集" :value="cpuText.abis" mono />
      <PkRow label="SOC 型号" :value="cpuText.soc" mono />
      <PkRow label="调频策略" :value="cpuText.governor" :copy="false" />
      <PkRow v-if="cpuText.govList" label="可选策略" :value="cpuText.govList" :copy="false" stack />
      <PkRow label="频率范围" :value="cpuText.range" mono :copy="false" />
      <view v-if="cpu.perCore.length" class="freq-head">
        <text class="freq-head__t">逐核实时频率</text>
        <text class="freq-head__a" @tap="refreshFreq">刷新</text>
      </view>
      <view v-if="cpu.perCore.length" class="freq-grid">
        <view v-for="c in cpu.perCore" :key="c.i" class="freq-cell">
          <text class="freq-cell__i">CPU{{ c.i }}</text>
          <text class="freq-cell__v">{{ c.text }}</text>
        </view>
      </view>
    </PkCard>

    <!-- 内存与存储 -->
    <PkCard title="内存与存储" accent="#6B5B95">
      <PkRow label="运行内存" :value="memText.ram" mono />
      <PkRow label="内存占用" :value="memText.ramPct" :copy="false" />
      <PkRow label="应用堆上限" :value="memText.heap" :copy="false" />
      <PkRow label="用户存储" :value="memText.storage" mono />
      <PkRow v-if="memText.swap" label="Swap / ZRAM" :value="memText.swap" mono :copy="false" />
    </PkCard>

    <!-- 传感器 -->
    <PkCard v-if="sensorList.length" title="传感器" accent="#7A6BA8">
      <PkRow label="数量" :value="sensorList.length + ' 个'" :copy="false" />
      <view class="sensor-list">
        <view v-for="s in sensorList" :key="s.key" class="sensor-row">
          <text class="sensor-row__n">{{ s.name }}</text>
          <text class="sensor-row__v">{{ s.meta || '—' }}</text>
        </view>
      </view>
    </PkCard>

    <!-- 系统与安全 -->
    <PkCard title="系统与安全" accent="#5B7A3E">
      <PkRow label="Project Treble" :value="secText.treble" :copy="false" />
      <PkRow label="动态分区" :value="secText.dynamic" :copy="false" />
      <PkRow label="无缝更新" :value="secText.seamless" :copy="false" />
      <PkRow label="验证启动" :value="secText.verifiedBoot" :copy="false" />
      <PkRow label="加密" :value="secText.crypto" :copy="false" />
      <text class="tip">刷 GSI 前先看这里：Treble 与动态分区决定能用哪种系统镜像；验证启动是橙色即引导已解锁</text>
    </PkCard>

    <!-- 图形与生态 -->
    <PkCard title="图形与生态" accent="#3F5A75">
      <PkRow label="GPU 版本" :value="ecoText.gles" :copy="false" />
      <PkRow label="Vulkan" :value="ecoText.vulkan" :copy="false" />
      <PkRow v-if="ecoText.vulkanCompute" label="Vulkan 计算" :value="ecoText.vulkanCompute" :copy="false" />
      <PkRow v-if="ecoText.webView" label="WebView" :value="ecoText.webView" mono />
      <PkRow v-if="ecoText.gms" label="Play 服务" :value="ecoText.gms" mono />
    </PkCard>

    <!-- 摄像头 -->
    <PkCard v-if="cameraList.length" title="摄像头" accent="#4F6B8C">
      <PkRow label="数量" :value="cameraList.length + ' 颗'" :copy="false" />
      <view class="sensor-list">
        <view v-for="c in cameraList" :key="c.key" class="sensor-row">
          <text class="sensor-row__n">{{ c.name }}</text>
          <text class="sensor-row__v">{{ c.meta || '—' }}</text>
        </view>
      </view>
    </PkCard>

    <!-- 说明 -->
    <PkCard title="读不到？先看这里" accent="var(--pk-warn)">
      <PkRow label="完整数据" value="装进安卓真机 App 里看，浏览器放行不了这些" :copy="false" stack />
      <PkRow label="隐私" value="全部本地读取：不联网、不上传、不申请任何权限" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { copyText, toast } from '@/utils/clipboard'
import {
  readSystemBase,
  isAndroidApp,
  readBuildInfo,
  readBattery,
  readBatteryH5,
  readScreen,
  readCpu,
  readMemoryStorage,
  readSensors,
  readUptime,
  screenDiagonalIn,
  readSecurityInfo,
  readGraphicsEco,
  readDrmInfo,
  readCameras,
  readBatteryPower,
  readSwap,
  fmtWatts,
} from '@/utils/device'

const loading = ref(false)
const readAt = ref('')
const base = ref({})
const build = ref(null)
const battery = ref(null)
const screen = ref({})
const cpu = ref({ perCore: [] })
const mem = ref({})
const sensorList = ref([])
const security = ref(null)
const graphics = ref(null)
const drm = ref(null)
const cameraList = ref([])
const power = ref({ currentUa: 0 })
const swap = ref({})

function nowText() {
  try {
    return new Date().toTimeString().slice(0, 8)
  } catch (e) {
    return ''
  }
}

function dash(v) {
  const s = String(v == null ? '' : v).trim()
  return s || '—'
}

async function loadAll() {
  loading.value = true
  try {
    base.value = readSystemBase()
    const app = isAndroidApp()
    build.value = app ? readBuildInfo() : null
    screen.value = readScreen()
    cpu.value = readCpu()
    mem.value = readMemoryStorage()
    sensorList.value = readSensors().list || []
    security.value = readSecurityInfo()
    graphics.value = readGraphicsEco()
    drm.value = readDrmInfo()
    cameraList.value = readCameras().list || []
    power.value = readBatteryPower()
    swap.value = readSwap()
    if (app) {
      battery.value = readBattery()
    } else {
      readBatteryH5().then((b) => { battery.value = b })
    }
    readAt.value = nowText()
  } finally {
    loading.value = false
  }
}

function refreshFreq() {
  cpu.value = readCpu()
  toast('已重新读取各核频率')
}

function copyProfile() {
  copyText(profileText())
  toast('设备档案已复制')
}

onMounted(loadAll)

/* ---------- 概览 ---------- */
const heroName = computed(() => dash((build.value && build.value.model) || base.value.model))
const heroSub = computed(() => {
  const n = build.value || {}
  const b = base.value || {}
  const brand = n.brand || b.brand || ''
  const sys = n.androidRelease ? 'Android ' + n.androidRelease : String(b.system || '')
  return [brand, sys].filter(Boolean).join(' · ') || '—'
})

const ov = computed(() => {
  const n = build.value || {}
  const b = base.value || {}
  const maker = [n.manufacturer, n.brand].filter(Boolean)
  return {
    brandMaker: [...new Set(maker)].join(' / '),
    codename: [n.device, n.product].filter(Boolean).join(' · '),
    soc: n.soc || '',
    hardware: n.hardware || '',
    systemText: [n.androidRelease ? 'Android ' + n.androidRelease : String(b.system || ''), n.sdkInt ? 'SDK ' + n.sdkInt : ''].filter(Boolean).join(' · '),
    patch: n.securityPatch || '',
    kernel: n.kernel || '',
    buildDisplay: n.buildDisplay || '',
    uptime: isAndroidApp() ? readUptime() : '',
  }
})

/* ---------- 电池 ---------- */
const batteryText = computed(() => {
  const b = battery.value || {}
  return {
    percent: b.percent === '' || b.percent == null ? '—' : b.percent + '%',
    status: b.status || '',
    plugged: b.plugged || '',
    health: b.health || '',
    temperature: b.temperature || '',
    voltage: b.voltage || '',
    watts: fmtWatts(b.voltageUv, power.value.currentUa),
    charge: b.chargeUah || power.value.chargeUah ? Math.round((Number(b.chargeUah) || power.value.chargeUah) / 1000) + ' mAh' : '',
  }
})

/* ---------- 屏幕 ---------- */
const screenText = computed(() => {
  const s = screen.value || {}
  const ratio = Number(s.pixelRatio) || 0
  const phys = s.physW && s.physH ? s.physW + ' × ' + s.physH + ' px' : ''
  const logic = s.logicW && s.logicH ? s.logicW + ' × ' + s.logicH + (ratio ? ' @' + ratio + 'x' : '') : ''
  const inch = screenDiagonalIn(s.physW, s.physH, s.xdpi, s.ydpi)
  return {
    phys: phys,
    logic: logic,
    dpi: s.densityDpi ? s.densityDpi + ' dpi' : '',
    inch: inch ? inch + '"' : '',
    hz: s.refreshRate ? s.refreshRate + ' Hz' : '',
    modes: s.refreshModes || '',
  }
})

/* ---------- 处理器 ---------- */
const cpuText = computed(() => {
  const c = cpu.value || {}
  const range = [c.minMhz, c.maxMhz].filter(Boolean).join(' ~ ')
  return {
    cores: c.cores ? c.cores + ' 核' : '',
    abis: c.abis || '',
    soc: [c.soc, c.hardware].filter(Boolean).join(' · '),
    governor: c.governor || '',
    govList: c.governors || '',
    range: range,
  }
})

/* ---------- 内存与存储 ---------- */
const memText = computed(() => {
  const m = mem.value || {}
  let ram = ''
  let ramPct = ''
  if (m.ramTotal > 0) {
    const used = Math.max(0, m.ramTotal - (m.ramAvail || 0))
    ram = fmtGbSafe(used) + ' / ' + fmtGbSafe(m.ramTotal)
    ramPct = Math.round((used / m.ramTotal) * 100) + '%'
  }
  return {
    ram: ram,
    ramPct: ramPct,
    heap: m.heapMB ? m.heapMB + ' MB' : '',
    storage: m.storageTotal > 0 ? fmtGbSafe(m.storageTotal - (m.storageAvail || 0)) + ' 已用 / ' + fmtGbSafe(m.storageTotal) : '',
    swap: [m.swapFree, m.swapTotal].filter(Boolean).length === 2 ? m.swapFree + ' 可用 / ' + m.swapTotal : '',
  }
})

function fmtGbSafe(bytes) {
  const g = Number(bytes) / 1073741824
  if (!isFinite(g) || g <= 0) return ''
  return (g >= 10 ? g.toFixed(1) : g.toFixed(2)).replace(/\.?0+$/, '') + ' GB'
}

/* ---------- 系统与安全 / 图形生态 / 摄像头 ---------- */
const secText = computed(() => {
  const s = security.value || {}
  return { treble: s.treble || '', dynamic: s.dynamicPartitions || '', seamless: s.seamlessUpdates || '', verifiedBoot: s.verifiedBoot || '', crypto: s.cryptoType || '' }
})

const ecoText = computed(() => {
  const g = graphics.value || {}
  return { gles: g.gles || '', vulkan: g.vulkan || '', vulkanCompute: g.vulkanCompute || '', webView: g.webView || '', gms: g.gms || '' }
})

/* ---------- 完整档案 ---------- */
function profileText() {
  const L = []
  L.push('随身匣 · 设备档案')
  if (readAt.value) L.push('读取时间：' + readAt.value)
  const push = (k, v) => { if (dash(v) !== '—') L.push(k + '：' + v) }
  push('品牌', ov.value.brandMaker)
  push('机型', heroName.value === '—' ? '' : heroName.value)
  push('设备代号', ov.value.codename)
  push('SOC', ov.value.soc)
  push('硬件', ov.value.hardware)
  push('系统', ov.value.systemText)
  push('安全补丁', ov.value.patch)
  push('内核', ov.value.kernel)
  push('构建号', ov.value.buildDisplay)
  push('开机时长', ov.value.uptime)
  if (battery.value) {
    push('电量', batteryText.value.percent === '—' ? '' : batteryText.value.percent)
    push('电池状态', [battery.value.status, battery.value.plugged].filter(Boolean).join(' · '))
    push('电池温度', battery.value.temperature)
    push('电池电压', battery.value.voltage)
    push('电池技术', battery.value.tech)
  }
  push('物理分辨率', screenText.value.phys)
  push('逻辑分辨率', screenText.value.logic)
  push('像素密度', screenText.value.dpi)
  push('估算尺寸', screenText.value.inch)
  push('刷新率', screenText.value.hz)
  push('支持刷新率', screenText.value.modes)
  push('CPU', [cpuText.value.cores, cpuText.value.soc, cpuText.value.abis].filter(Boolean).join(' · '))
  push('调频策略', [cpuText.value.governor, cpuText.value.range].filter(Boolean).join('（') + (cpuText.value.range ? '）' : ''))
  if ((cpu.value.perCore || []).length) {
    push('逐核频率', cpu.value.perCore.map((c) => 'CPU' + c.i + ' ' + c.text).join('，'))
  }
  push('运行内存', memText.value.ram)
  push('应用堆上限', memText.value.heap)
  push('用户存储', memText.value.storage)
  if (memText.value.swap) push('Swap', memText.value.swap)
  if (batteryText.value.watts) push('充电功率', batteryText.value.watts)
  push('Project Treble', secText.value.treble)
  push('验证启动', secText.value.verifiedBoot)
  push('加密', secText.value.crypto)
  push('GPU', ecoText.value.gles)
  push('WebView', ecoText.value.webView)
  if (cameraList.value.length) push('摄像头', cameraList.value.length + ' 颗')
  if (sensorList.value.length) {
    push('传感器', sensorList.value.length + ' 个')
    sensorList.value.forEach((s) => L.push('  · ' + s.name + (s.meta ? '（' + s.meta + '）' : '')))
  }
  return L.filter(Boolean).join('\n')
}
</script>

<style scoped>
.hero {
  padding: 18rpx 24rpx 12rpx;
}
.hero__big {
  display: block;
  font-size: 34rpx;
  font-weight: 600;
  color: var(--pk-text);
  word-break: break-all;
}
.hero__sub {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
}
.act-row {
  display: flex;
  gap: 20rpx;
  padding: 14rpx 24rpx 10rpx;
}
.tip {
  display: block;
  padding: 6rpx 24rpx 14rpx;
  font-size: 22rpx;
  line-height: 1.8;
  color: var(--pk-text-3);
}
.freq-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14rpx 24rpx 6rpx;
}
.freq-head__t {
  font-size: 24rpx;
  color: var(--pk-text-2);
}
.freq-head__a {
  font-size: 24rpx;
  color: var(--pk-accent);
  padding: 8rpx 12rpx;
}
.freq-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  padding: 8rpx 24rpx 16rpx;
}
.freq-cell {
  min-width: 148rpx;
  padding: 12rpx 16rpx;
  border-radius: var(--pk-radius-sm);
  background: var(--pk-input);
  border: var(--pk-line-w) solid var(--pk-line);
}
.freq-cell__i {
  display: block;
  font-size: 20rpx;
  color: var(--pk-text-3);
}
.freq-cell__v {
  display: block;
  margin-top: 4rpx;
  font-size: 24rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
}
.sensor-list {
  padding: 4rpx 24rpx 16rpx;
}
.sensor-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 20rpx;
  padding: 12rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.sensor-row:last-child {
  border-bottom: none;
}
.sensor-row__n {
  flex: 1;
  font-size: 24rpx;
  color: var(--pk-text);
  word-break: break-all;
}
.sensor-row__v {
  flex-shrink: 0;
  max-width: 46%;
  text-align: right;
  font-size: 22rpx;
  color: var(--pk-text-3);
  word-break: break-all;
}
</style>
