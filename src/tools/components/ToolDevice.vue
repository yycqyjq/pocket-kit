<template>
  <view>
    <!-- ============================================================
         运行环境：一句话告诉用户现在是全量还是降级，降级到什么程度
         ============================================================ -->
    <PkCard title="运行环境" :accent="TINT">
      <view class="env" :class="'env--' + envLevel">
        <text class="env__t">{{ envTitle }}</text>
        <text class="env__d">{{ envDesc }}</text>
      </view>
      <PkRow label="uni 运行时" :value="caps.sysInfo ? '可用（getSystemInfoSync）' : '不可用'" :copy="false" />
      <PkRow label="plus 运行时" :value="caps.plus ? '已注入' : '未注入'" :copy="false" />
      <PkRow label="Native.js" :value="caps.android ? '可用' : '不可用'" :copy="false" />
      <PkRow v-if="caps.os" label="plus.os.name" :value="caps.os" :copy="false" />
      <PkRow label="安卓原生分组" :value="nativeCount + ' / ' + NATIVE_TOTAL + ' 组取到数据'" :copy="false" />
      <view class="act-row">
        <PkBtn text="重新读取" kind="primary" :disabled="loading" @tap="manualReload" />
      </view>
      <text class="stamp">{{ updatedAt ? '最近读取 ' + updatedAt : '还没有成功读取过' }} · 只取当下一次快照，页面内没有任何定时器</text>
      <text v-if="fatal" class="miss">{{ fatal }}</text>
      <view class="notes">
        <text class="notes__i">下面每一组都是独立读取的：某一组失败只会把那一段标成读不到，其余分组照常显示，页面不会白屏。</text>
      </view>
    </PkCard>

    <!-- ============================================================
         系统与机型
         ============================================================ -->
    <PkCard title="系统与机型" :accent="TINT">
      <PkRow v-if="ui.brand" label="品牌（uni）" :value="ui.brand" />
      <PkRow v-if="ui.model" label="型号（uni）" :value="ui.model" />
      <PkRow v-if="ui.system" label="系统（uni）" :value="ui.system" />
      <PkRow v-if="ui.platform" label="平台（uni）" :value="ui.platform" />
      <PkRow v-if="bi.brand" label="Build.BRAND" :value="bi.brand" />
      <PkRow v-if="bi.manufacturer" label="厂商" :value="bi.manufacturer" />
      <PkRow v-if="bi.model" label="Build.MODEL" :value="bi.model" />
      <PkRow v-if="bi.soc" label="SoC 型号" :value="bi.soc + (bi.socVendor ? '（' + bi.socVendor + '）' : '')" />
      <PkRow v-if="bi.hardware" label="硬件" :value="bi.hardware" />
      <PkRow v-if="bi.board" label="主板" :value="bi.board" />
      <PkRow v-if="bi.product" label="产品名" :value="bi.product" />
      <PkRow v-if="bi.device" label="设备代号" :value="bi.device" />
      <PkRow v-if="bi.abis" label="支持的指令集" :value="bi.abis" mono />
      <PkRow v-if="bi.buildDisplay" label="构建号" :value="bi.buildDisplay" mono />
      <text v-if="uniNote" class="miss">{{ uniNote }}</text>
      <text v-if="buildNote" class="miss">{{ buildNote }}</text>
      <view class="notes">
        <text class="notes__i">前四行（品牌 / 型号 / 系统 / 平台）来自 uni 系统信息，App 与 H5 都能给值；H5 那份是靠浏览器 UA 猜出来的，精度有限。</text>
        <text class="notes__i">其余各行来自安卓 Build 类与系统属性，只有 App 运行时读得到；厂商屏蔽某项时对应整行留空，不会用假值填。</text>
        <text class="notes__i">SoC 取 ro.soc.model，取不到时退到 ro.board.platform（后者是平台代号，不等同于市场名）。</text>
      </view>
    </PkCard>

    <!-- ============================================================
         Android 版本与 SDK
         ============================================================ -->
    <PkCard title="Android 版本与 SDK" accent="var(--pk-accent)">
      <PkRow v-if="bi.androidRelease" label="Android 版本" :value="bi.androidRelease" big :copy="false" />
      <PkRow v-if="bi.sdkInt" label="API 级别" :value="'API ' + bi.sdkInt" :copy="false" />
      <PkRow v-if="bi.securityPatch" label="安全补丁" :value="bi.securityPatch" />
      <PkRow v-if="bi.kernel" label="内核版本" :value="bi.kernel" mono />
      <text v-if="versionNote" class="miss">{{ versionNote }}</text>
      <view class="notes">
        <text class="notes__i">对照：API 29 = Android 10、30 = 11、31 = 12、32 = 12L、33 = 13、34 = 14、35 = 15。</text>
        <text class="notes__i">内核版本走 java System 属性，与设置里显示的版本号写法不同，同一台机器可能长度差很多。</text>
      </view>
    </PkCard>

    <!-- ============================================================
         屏幕
         ============================================================ -->
    <PkCard title="屏幕" accent="var(--pk-accent)">
      <PkRow v-if="physText" label="物理分辨率" :value="physText" big :copy="false" />
      <PkRow v-if="diagonal" label="对角线（估算）" :value="diagonal + ' 英寸'" :copy="false" />
      <PkRow v-if="logicText" label="逻辑尺寸" :value="logicText" :copy="false" />
      <PkRow v-if="st.pixelRatio" label="缩放比" :value="st.pixelRatio + '×'" :copy="false" />
      <PkRow v-if="st.densityDpi" label="密度分档" :value="st.densityDpi + ' dpi'" :copy="false" />
      <PkRow v-if="dpiText" label="物理像素密度" :value="dpiText" :copy="false" />
      <PkRow v-if="st.refreshRate" label="当前刷新率" :value="st.refreshRate + ' Hz'" :copy="false" />
      <PkRow v-if="st.refreshModes" label="支持的档位" :value="st.refreshModes" :copy="false" />
      <PkRow v-if="caps.sysInfo" label="状态栏高度" :value="statusBarText" :copy="false" />
      <PkRow v-if="caps.sysInfo" label="底部安全区" :value="safeBottomText" :copy="false" />
      <text v-if="screenNote" class="miss">{{ screenNote }}</text>
      <view class="notes">
        <text class="notes__i">物理分辨率用 Display.getRealMetrics 取，含状态栏与导航条；逻辑尺寸是应用可布局的区域，rpx 以 750 为基准换算。</text>
        <text class="notes__i">对角英寸 = 物理像素 ÷ 物理 dpi 的勾股结果，厂商上报的 xdpi/ypdpi 常有 1~2% 偏差，是估算值不是厂商标称值。</text>
        <text class="notes__i">状态栏与底部安全区取自布局层读数（导航栏用的同一份），只给到状态栏与底边两个值；完整的四边 safeAreaInsets 数据层没有导出，就不硬凑。</text>
        <text class="notes__i">H5 下没有真实刷新率与密度，浏览器窗口尺寸还会被缩放影响，所以这几行大多留空。</text>
      </view>
    </PkCard>

    <!-- ============================================================
         处理器
         ============================================================ -->
    <PkCard title="处理器（CPU）" accent="var(--pk-accent)">
      <PkRow v-if="cp.cores" label="核心数" :value="String(cp.cores)" big :copy="false" />
      <PkRow v-if="cp.soc" label="SoC" :value="cp.soc" />
      <PkRow v-if="cp.abis" label="指令集" :value="cp.abis" mono />
      <PkRow v-if="cp.maxMhz" label="cpu0 最高频" :value="cp.maxMhz" :copy="false" />
      <PkRow v-if="cp.minMhz" label="cpu0 最低频" :value="cp.minMhz" :copy="false" />
      <PkRow v-if="cp.governor" label="当前调频策略" :value="cp.governor" mono />
      <PkRow v-if="cp.governors" label="可选策略" :value="cp.governors" mono />
      <view v-if="cp.perCore && cp.perCore.length" class="cores">
        <text class="cores__t">逐核实时频率</text>
        <view class="cores__row">
          <text v-for="c in cp.perCore" :key="c.i" class="core">{{ c.i }}# {{ c.text }}</text>
        </view>
      </view>
      <text v-if="cpuNote" class="miss">{{ cpuNote }}</text>
      <view class="notes">
        <text class="notes__i">核心数：App 取 Runtime.availableProcessors()，H5 取 navigator.hardwareConcurrency（浏览器可能故意少报）。</text>
        <text class="notes__i">频率读的是 /sys/devices/system/cpu/cpuN/cpufreq 下的 world-readable 节点。安卓 10 之后 SELinux 对普通应用收紧了不少，读不到时逐核显示「离线」，最高/最低频整行消失。</text>
        <text class="notes__i">这一组只读文件一次，不会持续采样；调频策略是系统此刻的升降频偏好（如 interactive / schedutil）。</text>
      </view>
    </PkCard>

    <!-- ============================================================
         内存与存储
         ============================================================ -->
    <PkCard title="内存与存储" accent="var(--pk-warn)">
      <PkRow v-if="gb(ms.ramTotal)" label="运行内存总量" :value="gb(ms.ramTotal)" big :copy="false" />
      <view v-if="gb(ms.ramAvail) && ramPct" class="bar">
        <view class="bar__fill" :style="{ width: ramPct + '%' }"></view>
      </view>
      <PkRow v-if="gb(ms.ramAvail)" label="当前可用" :value="gb(ms.ramAvail) + '（' + ramPct + '%）'" :copy="false" />
      <PkRow v-if="ms.heapMB" label="应用堆上限" :value="ms.heapMB + ' MB'" :copy="false" />
      <PkRow v-if="gb(ms.storageTotal)" label="用户存储总量" :value="gb(ms.storageTotal)" big :copy="false" />
      <view v-if="gb(ms.storageAvail) && storagePct" class="bar">
        <view class="bar__fill" :style="{ width: storagePct + '%' }"></view>
      </view>
      <PkRow v-if="gb(ms.storageAvail)" label="存储可用" :value="gb(ms.storageAvail) + '（' + storagePct + '%）'" :copy="false" />
      <text v-if="memNote" class="miss">{{ memNote }}</text>
      <view class="notes">
        <text class="notes__i">口径说明：本页按 1024 进位换算（严格单位是 GiB），而厂商与系统设置按 1000 进位（1 GB = 10 亿字节）。所以标称 256 GB 的存储这里显示约 238，标称 8 GB 的内存显示约 7.45 —— 同一块容量，两种数法，不是掉容量。</text>
        <text class="notes__i">可用内存是 ActivityManager 口径，系统会保留一部分并随时回收缓存，比设置里显示的余量偏小或偏大都正常。</text>
        <text class="notes__i">存储统计的是外部存储（用户数据分区），不含系统分区、厂商保留区与 SD 卡。</text>
        <text class="notes__i">应用堆上限是单个应用能被分配的上限（dalvik/ART 配额），与总内存无关，超限会 OOM 而不是借用系统余量。</text>
      </view>
    </PkCard>

    <!-- ============================================================
         电池
         ============================================================ -->
    <PkCard title="电池" accent="var(--pk-warn)">
      <view v-if="hasBat" class="batt">
        <text class="batt__p">{{ ba.percent === '' || ba.percent === undefined ? '—' : ba.percent + '%' }}</text>
        <text class="batt__s">{{ (ba.status || '状态未知') + ' · ' + (ba.plugged || '供电方式未知') }}</text>
      </view>
      <view v-if="hasBat && ba.percent !== '' && ba.percent !== undefined" class="bar">
        <view class="bar__fill" :style="{ width: Number(ba.percent) + '%' }"></view>
      </view>
      <PkRow v-if="ba.status" label="充电状态" :value="ba.status" :copy="false" />
      <PkRow v-if="ba.plugged" label="供电方式" :value="ba.plugged" :copy="false" />
      <PkRow v-if="ba.health" label="健康度" :value="ba.health" :copy="false" />
      <PkRow v-if="ba.temperature" label="温度" :value="ba.temperature" :copy="false" />
      <PkRow v-if="ba.voltage" label="电压" :value="ba.voltage" :copy="false" />
      <PkRow v-if="ba.tech" label="电池技术" :value="ba.tech" :copy="false" />
      <PkRow v-if="batSourceText" label="数据来源" :value="batSourceText" :copy="false" />
      <text v-if="batNote" class="miss">{{ batNote }}</text>
      <view class="notes">
        <text class="notes__i">App 端的数据来自 ACTION_BATTERY_CHANGED 粘性广播：安卓 8.0 起该广播不许在清单里静态注册，本页在读取的瞬间动态取一次快照、不驻留监听器，因此只要 App 在前台就能读到。</text>
        <text class="notes__i">安卓 5.0 起系统为省电把电量上报做了合批，未充电时 level 可能几分钟才动一格，刚拔掉充电器时读数偏高属正常。</text>
        <text class="notes__i">温度、电压、健康度官方从未承诺精度：不少机型把温度固定上报或干脆给 0，健康度无论电池实际状态如何都只回「良好」或「未知」，电池技术（technology）在新版本上也常被留空。这三行读不到或明显不合理，是设备行为，不是本页算错。</text>
        <text class="notes__i">H5 预览只能走 navigator.getBattery，且要求 HTTPS / localhost 安全上下文，通常只有电量与是否充电两项。</text>
        <text class="notes__i">本页不做电池轮询：要看最新值，点上面的重新读取。</text>
      </view>
    </PkCard>

    <!-- ============================================================
         传感器清单
         ============================================================ -->
    <PkCard title="传感器清单" accent="var(--pk-accent)">
      <PkRow v-if="se.count" label="传感器总数" :value="String(se.count)" big :copy="false" />
      <view v-if="se.list && se.list.length" class="sensors">
        <view v-for="s in visibleSensors" :key="s.key" class="sensor">
          <text class="sensor__n" selectable>{{ s.name }}</text>
          <text v-if="s.meta" class="sensor__m">{{ s.meta }}</text>
        </view>
        <text v-if="se.list.length > SENSOR_LIMIT && !sensorExpand" class="more">…下面还有 {{ se.list.length - SENSOR_LIMIT }} 个，点展开看全部</text>
      </view>
      <view v-if="se.list && se.list.length > SENSOR_LIMIT" class="act-row">
        <PkBtn :text="sensorExpand ? '收起' : '展开全部 ' + se.list.length + ' 个'" kind="ghost" @tap="sensorExpand = !sensorExpand" />
      </view>
      <text v-if="sensNote" class="miss">{{ sensNote }}</text>
      <view class="notes">
        <text class="notes__i">这里只列出系统认为存在的传感器名与厂商、功耗，用的是 SensorManager 的一次性清单查询。</text>
        <text class="notes__i">本工具不会注册任何 SensorEventListener，不做实时采样，不申请权限，也不会因为打开这一页而多耗电。</text>
        <text class="notes__i">同一类传感器常有多个物理器件（如多个加速度/重力虚拟传感器），所以条数通常比「种类」多。</text>
      </view>
    </PkCard>

    <!-- ============================================================
         运行时长
         ============================================================ -->
    <PkCard title="运行时长" accent="var(--pk-accent)">
      <PkRow v-if="uptime" label="开机至今" :value="uptime" big :copy="false" />
      <text v-if="uptimeNote" class="miss">{{ uptimeNote }}</text>
      <view class="notes">
        <text class="notes__i">取的是 SystemClock.elapsedRealtime()，从开机累计、包含深度休眠，与「屏幕点亮时间」不是一回事。</text>
        <text class="notes__i">厂商 ROM 的后台冻结与重启策略会影响这个值，重启后归零。</text>
      </view>
    </PkCard>

    <!-- ============================================================
         隐私说明
         ============================================================ -->
    <PkCard title="这些数据怎么来的" :accent="TINT">
      <view class="notes">
        <text class="notes__i">全程只在本机读取：不联网、不上传、不写入任何本地存储，关掉页面这份快照就没了。</text>
        <text class="notes__i">没有发起过任何网络请求，也不读你的剪贴板、相册、文件与定位。</text>
        <text class="notes__i">不申请任何安卓运行时权限：Build 属性、粘性电池广播、内存与存储统计、传感器清单、开机时长都是无需权限即可读的系统信息。</text>
        <text class="notes__i">/sys 下的 CPU 频率节点只读 world-readable 文件，不做 root 探测，读不到就写读不到。</text>
        <text class="notes__i">传感器只列清单不采样；电池与内存这类会变的数据只在你点「重新读取」时取一次，页面里没有定时器。</text>
      </view>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  isAndroidApp,
  readSystemBase,
  readBuildInfo,
  readBattery,
  readBatteryH5,
  readScreen,
  readCpu,
  readMemoryStorage,
  readSensors,
  readUptime,
  fmtGB,
  screenDiagonalIn,
} from '@/utils/device'
import { statusBarHeight, safeBottom } from '@/utils/sys'
import { toast } from '@/utils/clipboard'

const TINT = '#4F6B8C'
const NATIVE_TOTAL = 7
const SENSOR_LIMIT = 18
const NO_PLUS = '当前是浏览器 H5 预览，页面里没有 plus 原生运行时，Native.js 碰不到安卓 API'

/* ============================================================
 * 能力探测：每个 uni.* / plus.* 都先 typeof，再包 try/catch
 * ============================================================ */
const caps = computed(() => {
  const c = { uni: false, sysInfo: false, plus: false, android: false, os: '' }
  try {
    c.uni = typeof uni !== 'undefined' && !!uni
    c.sysInfo = !!(c.uni && typeof uni.getSystemInfoSync === 'function')
  } catch (e) {
    c.uni = false
    c.sysInfo = false
  }
  try {
    c.plus = typeof plus !== 'undefined' && !!plus
  } catch (e) {
    c.plus = false
  }
  try {
    c.android = !!(c.plus && plus.android && typeof plus.android.importClass === 'function')
  } catch (e) {
    c.android = false
  }
  try {
    if (c.plus && plus.os) c.os = String(plus.os.name || '')
  } catch (e) {
    c.os = ''
  }
  return c
})

const isApp = computed(() => {
  try {
    return !!isAndroidApp()
  } catch (e) {
    return false
  }
})

/** 为什么原生分支没跑起来：按探测结果给出人话 */
function why() {
  if (!caps.value.sysInfo) return '连 uni 运行时都没有探测到，页面处于最严重降级状态'
  if (!caps.value.plus) return NO_PLUS
  if (!caps.value.android) return 'plus 已注入但 plus.android 不可用，通常说明运行的不是安卓端 App'
  if (!isApp.value) return 'plus.os.name 报告的是 ' + (caps.value.os || '未知') + '，本工具的安卓分支不会执行'
  return '分支已进入但被系统拒绝，多为权限或 SELinux 限制'
}

function missText(label, extra) {
  return '当前环境读不到：' + label + ' —— ' + why() + (extra ? '（接口报错：' + extra + '）' : '')
}

/* ============================================================
 * 各分组快照：读失败只影响本组
 * ============================================================ */
const base = ref({})
const build = ref(null)
const screen = ref(null)
const cpu = ref(null)
const mem = ref(null)
const sens = ref(null)
const uptime = ref('')
const bat = ref(null)
const batSource = ref('')

const errBase = ref('')
const errBuild = ref('')
const errScreen = ref('')
const errCpu = ref('')
const errMem = ref('')
const errSens = ref('')
const errUp = ref('')
const errBat = ref('')
const fatal = ref('')

const loading = ref(false)
const updatedAt = ref('')
const sensorExpand = ref(false)
let disposed = false

/** 统一的取值包装：任何抛错都吞掉并记下原因，绝不让渲染中断 */
function grab(target, errTarget, fn, fallback) {
  try {
    const v = fn()
    target.value = v === undefined ? fallback : v
    errTarget.value = ''
  } catch (e) {
    target.value = fallback
    errTarget.value = e && e.message ? String(e.message) : '读取时抛错'
  }
}

function stamp() {
  try {
    const d = new Date()
    const p = (n) => (n < 10 ? '0' + n : String(n))
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
  } catch (e) {
    return ''
  }
}

/** 电池：App 走粘性广播同步取；非 App 才尝试 navigator.getBattery（异步一次，不轮询）
 *  返回 true 表示还挂着 promise，loading 由回调收尾 */
function readBat() {
  bat.value = null
  batSource.value = ''
  errBat.value = ''
  if (isApp.value) {
    grab(bat, errBat, () => readBattery(), null)
    if (bat.value) batSource.value = 'plus'
    return false
  }
  if (!caps.value.sysInfo && typeof navigator === 'undefined') {
    errBat.value = '既没有 plus 也没有浏览器 navigator，电池无从读取'
    return false
  }
  try {
    const p = readBatteryH5()
    if (!p || typeof p.then !== 'function') {
      errBat.value = '当前环境没有返回电池 Promise'
      return false
    }
    p.then((r) => {
      if (disposed) return
      bat.value = r || null
      batSource.value = r ? 'h5' : ''
      errBat.value = r ? '' : '浏览器没有 navigator.getBattery，或页面不在 HTTPS / localhost 安全上下文里'
    })
      .catch((e) => {
        if (disposed) return
        bat.value = null
        errBat.value = e && e.message ? String(e.message) : '浏览器电池接口调用失败'
      })
      .then(() => {
        if (!disposed) loading.value = false
      })
    return true
  } catch (e) {
    errBat.value = e && e.message ? String(e.message) : '电池读取抛错'
    return false
  }
}

function reload(silent) {
  loading.value = true
  fatal.value = ''
  let pendingBattery = false
  try {
    grab(base, errBase, () => readSystemBase(), {})
    grab(build, errBuild, () => readBuildInfo(), null)
    grab(screen, errScreen, () => readScreen(), null)
    grab(cpu, errCpu, () => readCpu(), null)
    grab(mem, errMem, () => readMemoryStorage(), null)
    grab(sens, errSens, () => readSensors(), null)
    grab(uptime, errUp, () => readUptime(), '')
    pendingBattery = readBat()
    updatedAt.value = stamp()
    if (!silent) safeToast('已重新读取')
  } catch (e) {
    fatal.value = '这次整体读取异常，能拿到的部分仍保留在下面的分组里：' + (e && e.message ? String(e.message) : String(e))
  }
  if (!pendingBattery) loading.value = false
}

function manualReload() {
  reload(false)
}

function safeToast(t) {
  try {
    toast(t)
  } catch (e) {}
}

onMounted(() => {
  reload(true)
})

onUnmounted(() => {
  // 没有定时器要清；这里只拦住异步电池回调往已销毁实例写值
  disposed = true
})

/* ============================================================
 * 展示层：拿不到的字段一律不渲染
 * ============================================================ */
const ui = computed(() => base.value || {})
const bi = computed(() => build.value || {})
const st = computed(() => screen.value || {})
const cp = computed(() => cpu.value || { perCore: [] })
const ms = computed(() => mem.value || {})
const se = computed(() => sens.value || { list: [], count: 0 })
const ba = computed(() => bat.value || {})
const hasBat = computed(() => !!bat.value)

const envLevel = computed(() => {
  if (!caps.value.sysInfo) return 'bad'
  return isApp.value ? 'ok' : 'warn'
})
const envTitle = computed(() => {
  if (!caps.value.sysInfo) return '运行时未就绪'
  if (isApp.value) return '安卓 App 运行时（plus 可用）'
  if (caps.value.plus && caps.value.os) return 'App 运行时但不是安卓（' + caps.value.os + '）'
  if (caps.value.plus) return 'App 运行时已注入，但 Native.js 安卓分支不可用'
  return 'H5 浏览器预览（无 plus 原生运行时）'
})
const envDesc = computed(() => {
  if (envLevel.value === 'ok') return '机型、屏幕物理参数、CPU 频率、内存存储、电池、传感器、开机时长这 7 组原生数据都有机会读到；个别字段被厂商屏蔽属正常。'
  if (!caps.value.sysInfo) return '连 uni 系统信息都没有，本页只剩静态说明可看。'
  return '只有 uni 与浏览器能给的字段有值：品牌型号、逻辑分辨率、核心数、部分电量。下面每个分组都会写明读不到的原因，不会白屏。'
})

const nativeCount = computed(() => {
  let n = 0
  if (build.value) n++
  if (st.value.physW && st.value.xdpi) n++
  if (cp.value.perCore && cp.value.perCore.length) n++
  if (ms.value.ramTotal) n++
  if (batSource.value === 'plus') n++
  if (se.value.count) n++
  if (uptime.value) n++
  return n
})

/* ---------- 屏幕 ---------- */
const physText = computed(() => (st.value.physW && st.value.physH ? st.value.physW + ' × ' + st.value.physH : ''))
const logicText = computed(() => (st.value.logicW && st.value.logicH ? st.value.logicW + ' × ' + st.value.logicH + ' px' : ''))
const dpiText = computed(() => {
  const x = Number(st.value.xdpi)
  const y = Number(st.value.ydpi)
  if (!x || !y) return ''
  return x.toFixed(1) + ' × ' + y.toFixed(1) + ' dpi'
})
const diagonal = computed(() => {
  try {
    return screenDiagonalIn(st.value.physW, st.value.physH, st.value.xdpi, st.value.ydpi)
  } catch (e) {
    return ''
  }
})
const statusBarText = computed(() => {
  if (!caps.value.sysInfo) return ''
  const v = Number(statusBarHeight) || 0
  return v ? v + ' px' : ''
})
const safeBottomText = computed(() => {
  if (!caps.value.sysInfo) return ''
  const v = Number(safeBottom) || 0
  return v > 0 ? v + ' px' : '0 px（无底部安全区，或当前环境不上报）'
})
const screenNote = computed(() => {
  if (st.value.physW) return ''
  return missText('物理分辨率与刷新率', errScreen.value)
})

/* ---------- 系统 / 版本 ---------- */
const uniNote = computed(() => {
  if (!errBase.value && caps.value.sysInfo) return ''
  return '当前环境读不到：uni 系统信息（品牌 / 型号 / 逻辑分辨率）—— ' + (errBase.value || 'uni.getSystemInfoSync 不可用')
})
const buildNote = computed(() => {
  if (build.value) return ''
  return missText('Android Build 与系统属性', errBuild.value)
})
const versionNote = computed(() => {
  if (bi.value.androidRelease || bi.value.sdkInt) return ''
  return missText('Android 版本与 API 级别', errBuild.value)
})

/* ---------- CPU ---------- */
const cpuNote = computed(() => {
  if (cp.value.cores) return ''
  return missText('CPU 核心数与频率', errCpu.value)
})

/* ---------- 内存与存储 ---------- */
function gb(n) {
  try {
    return fmtGB(n)
  } catch (e) {
    return ''
  }
}
function pctOf(a, b) {
  const x = Number(a)
  const y = Number(b)
  if (!isFinite(x) || !isFinite(y) || y <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((x / y) * 100)))
}
const ramPct = computed(() => pctOf(ms.value.ramAvail, ms.value.ramTotal))
const storagePct = computed(() => pctOf(ms.value.storageAvail, ms.value.storageTotal))
const memNote = computed(() => {
  const has = ms.value.ramTotal || ms.value.storageTotal
  if (has) return ''
  return missText('内存与存储统计', errMem.value)
})

/* ---------- 电池 ---------- */
const batSourceText = computed(() => (batSource.value === 'plus' ? 'App 粘性广播' : batSource.value === 'h5' ? '浏览器 Battery API（字段更少）' : ''))
const batNote = computed(() => {
  if (hasBat.value) return ''
  if (isApp.value) return missText('电池快照', errBat.value || 'registerReceiver 返回了空')
  return '当前环境读不到：电池 —— ' + (errBat.value || NO_PLUS)
})

/* ---------- 传感器 ---------- */
const visibleSensors = computed(() => {
  const list = se.value.list || []
  return sensorExpand.value ? list : list.slice(0, SENSOR_LIMIT)
})
const sensNote = computed(() => {
  if (se.value.count) return ''
  return missText('传感器清单', errSens.value)
})

/* ---------- 运行时长 ---------- */
const uptimeNote = computed(() => {
  if (uptime.value) return ''
  return missText('开机时长', errUp.value)
})
</script>

<style scoped>
.env {
  padding: 20rpx 24rpx;
  margin: 16rpx 24rpx 8rpx;
  border-radius: var(--pk-radius-md);
  background: var(--pk-bg-soft);
  border-left: 6rpx solid var(--pk-line-strong);
}
.env--ok {
  border-left-color: var(--pk-accent);
}
.env--warn {
  border-left-color: var(--pk-warn);
}
.env--bad {
  border-left-color: var(--pk-danger);
}
.env__t {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--pk-text);
  line-height: 1.6;
}
.env__d {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  line-height: 1.8;
  margin-top: 8rpx;
}
.miss {
  display: block;
  font-size: 22rpx;
  color: var(--pk-warn);
  line-height: 1.8;
  margin: 12rpx 24rpx 4rpx;
  padding: 14rpx 18rpx;
  border-radius: var(--pk-radius-sm);
  background: var(--pk-bg-soft);
}
.notes {
  padding: 14rpx 24rpx 20rpx;
}
.notes__i {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  line-height: 1.85;
  margin-top: 6rpx;
}
.stamp {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  padding: 0 24rpx 14rpx;
  line-height: 1.7;
}
.act-row {
  display: flex;
  gap: 20rpx;
  padding: 16rpx 24rpx 14rpx;
}
.bar {
  height: 10rpx;
  margin: 0 24rpx 12rpx;
  border-radius: 999rpx;
  background: var(--pk-seg-bg);
  overflow: hidden;
}
.bar__fill {
  height: 100%;
  border-radius: 999rpx;
  background: var(--pk-accent);
}
.batt {
  display: flex;
  align-items: baseline;
  padding: 20rpx 24rpx 14rpx;
}
.batt__p {
  font-size: 52rpx;
  font-weight: 600;
  color: var(--pk-text);
  flex: 1;
}
.batt__s {
  font-size: 24rpx;
  color: var(--pk-text-3);
}
.cores {
  padding: 6rpx 24rpx 14rpx;
}
.cores__t {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-bottom: 10rpx;
}
.cores__row {
  display: flex;
  flex-wrap: wrap;
}
.core {
  font-size: 22rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text-2);
  padding: 10rpx 16rpx;
  margin: 0 12rpx 12rpx 0;
  border-radius: var(--pk-radius-sm);
  background: var(--pk-bg-soft);
}
.sensors {
  padding: 6rpx 24rpx 12rpx;
}
.sensor {
  padding: 12rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.sensor:last-child {
  border-bottom: none;
}
.sensor__n {
  display: block;
  font-size: 24rpx;
  color: var(--pk-text);
  line-height: 1.6;
  word-break: break-all;
}
.sensor__m {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  line-height: 1.6;
  margin-top: 2rpx;
}
.more {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  padding-top: 12rpx;
}
</style>
