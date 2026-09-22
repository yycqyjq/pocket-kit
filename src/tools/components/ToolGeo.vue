<template>
  <view>
    <PkCard padded>
      <text class="tip">同一个物理位置，在三套坐标系里写法不同：GPS 用的是 WGS-84，国测局加密后是 GCJ-02（高德、腾讯、Google 中国在用），百度又在 GCJ-02 上偏了一次（BD-09）。写错坐标系，位置能差出几百米。</text>
      <PkSeg v-model="from" :items="COORD_SYS" />
      <PkField v-model="lat" label="纬度（北纬为正）" placeholder="39.908722" type="digit" />
      <PkField v-model="lng" label="经度（东经为正）" placeholder="116.397499" type="digit" />
      <view class="row2">
        <PkBtn text="取一次定位" kind="soft" @tap="locate" />
        <PkBtn text="粘贴写法解析" kind="ghost" @tap="parseFromClip" />
      </view>
      <view class="quick">
        <text v-for="s in GEO_SAMPLES" :key="s.label" class="quick__i" @tap="pick(s)">{{ s.label }}</text>
      </view>
      <PkRow v-if="err" label="输入有问题" :value="err" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard v-if="!err" title="三套坐标系对照" :accent="TINT">
      <view v-for="r in rows" :key="r.key" class="sys">
        <text class="sys__n">{{ r.name }}</text>
        <text class="sys__v" selectable>{{ r.deg }}</text>
        <text class="sys__d">{{ r.dms }} · 偏移 {{ r.shift }}</text>
      </view>
      <text class="tip">{{ zeroTip }}</text>
    </PkCard>

    <PkCard v-if="!err" title="换到指定坐标系" :accent="TINT">
      <PkSeg v-model="toKey" :items="COORD_SYS" />
      <PkRow label="换算结果" :value="picked.deg" mono />
      <PkRow label="度分秒" :value="picked.dms" :copy="false" />
      <PkRow label="偏移量" :value="picked.shift" :copy="false" />
      <view class="row2">
        <PkBtn text="复制结果" kind="soft" @tap="copyPicked" />
        <PkBtn text="在地图里看看" kind="ghost" @tap="openInMap" />
      </view>
      <text class="tip">「在地图里看看」走系统的地图应用（安卓上是高德/百度/系统地图之一，取决于装了哪个），本工具只把坐标交出去，不联网。</text>
    </PkCard>

    <PkCard v-if="!err" title="两点距离与方位" :accent="TINT">
      <PkField v-model="lat2" label="第二个点 纬度" placeholder="31.239703" type="digit" />
      <PkField v-model="lng2" label="第二个点 经度" placeholder="121.490316" type="digit" />
      <template v-if="geo2">
        <PkRow label="直线距离" :value="rel.dist" :copy="false" />
        <PkRow label="初始方位角" :value="rel.brg + '°（' + rel.dir + '）'" :copy="false" />
        <text class="tip">距离是球面直线（haversine，地球半径取 6371.0088 公里），不含地形与路径；方位角是出发那一刻朝的方向，走大圆航线时它会一直变。</text>
      </template>
      <text v-else class="tip">再填一组坐标就能算距离。两个点必须写在同一个坐标系里，跨系比距离没有意义。</text>
    </PkCard>

    <PkCard title="定位读数" :accent="TINT">
      <template v-if="loc">
        <PkRow label="经纬度" :value="locDeg" mono />
        <PkRow label="坐标系" :value="locSysName" :copy="false" />
        <PkRow label="精度半径" :value="locAcc" :copy="false" />
        <PkRow label="评级" :value="locGrade" :copy="false" stack />
        <PkRow v-if="loc.altitude !== null" label="高度" :value="fmtNum(loc.altitude) + ' 米'" :copy="false" />
        <PkRow v-if="loc.speed !== null" label="速度" :value="fmtNum(loc.speed) + ' 米/秒'" :copy="false" />
        <PkRow label="采集时间" :value="locTime" :copy="false" />
        <text class="tip">定位一次即填进上面的输入框。安卓上系统给的是「网络定位 + 卫星」的混合结果，室内多半是 Wi-Fi/基站估的，几十到几百米都算正常。</text>
      </template>
      <text v-else class="tip">{{ locMsg || '点上面「取一次定位」拿当前坐标；浏览器预览里用的是网页定位，安卓 App 里用的是系统定位。' }}</text>
    </PkCard>

    <PkCard title="口径与边界" :accent="TINT">
      <PkRow v-for="n in GEO_NOTES" :key="n.t" :label="n.t" :value="n.d" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  COORD_SYS, GEO_SAMPLES, triple, convert, parsePair, checkLat, checkLng, shiftOf,
  distance, bearing, dirName, toDms, fmtDeg, fmtDistance, accuracyGrade, fromLocation,
} from '@/utils/geo'
import { probe, hasApi, uniCall, missText, requestAndroidPermissions, PERM_LOCATION } from '@/utils/native'
import { copyText, toast } from '@/utils/clipboard'

/** 本工具的品牌色：视图里唯一允许的字面色，其余颜色一律走 CSS 变量 */
const TINT = '#2F6B4F'

const SYS_NAME = { wgs84: 'WGS-84（GPS 原始）', gcj02: 'GCJ-02（国测局）', bd09: 'BD-09（百度）' }
const GEO_NOTES = [
  { t: '算法与参数', d: '偏移量由经纬度差的正弦余弦混合而成，周期在几度量级，所以同城相邻两点偏移几乎一样；反向没有闭式解，这里用三次定点迭代逼近，残差在厘米级。BD-09 的正反向是公开的那条近似公式，往返会留分米到米级残差，属正常。' },
  { t: '境外为什么是零', d: 'GCJ-02 只处理中国范围（含港澳台）内的点，境外的坐标三套写法相同。这不是 bug，是这套加密本身的边界。' },
  { t: '偏移量级', d: '境内 GPS → 国测局一般几百米，百度再叠一层又是几百到上千米。同一个点三套写法互不相同是预期行为，对不上时先怀疑坐标系，而不是怀疑定位。' },
  { t: '精度半径', d: 'accuracy 是系统自己报的估计值，安卓来自 Location.getAccuracy()：室外 GPS 能到 5 米内，室内 Wi-Fi 定位常在一两百米，只给基站定位时可能到公里级。公里级的读数不要用来找具体门店。' },
  { t: '高度与速度', d: 'altitude 是相对海平面（不是椭球面）的高度，部分设备不给；speed 单位是米/秒。这两项缺失时页面直接不显示那一行，而不是显示 0。' },
  { t: '全本地', d: '换算、距离、方位全部在本机算。取定位只调系统接口，结果只留在这一页，不联网、不上传。定位是运行时授权的危险权限，第一次点「取一次定位」会弹系统授权框，拒绝后可以在系统设置里放行，也可以直接在页面上手输坐标——后面的换算不需要权限。' },
  { t: '不做的部分', d: '不做地图瓦片展示，也不做轨迹记录与导出；要看位置请点「在地图里看看」交给系统地图。BD-09 的墨卡托（bd09ll 之外的 bd09mc 平面坐标）这里不涉及。' },
]

const from = ref('wgs84')
const toKey = ref('gcj02')
const lat = ref('39.908722')
const lng = ref('116.397499')
const lat2 = ref('31.239703')
const lng2 = ref('121.490316')
const loc = ref(null)
const locMsg = ref('')

const parsed = computed(() => {
  const a = String(lat.value || '').trim()
  const b = String(lng.value || '').trim()
  if (!a || !b) return { ok: false, err: '' }
  try {
    return { ok: true, lat: checkLat(a), lng: checkLng(b) }
  } catch (e) {
    return { ok: false, err: (e && e.message) || '坐标不合法' }
  }
})
const err = computed(() => (parsed.value.ok ? '' : parsed.value.err))
const all = computed(() => {
  if (!parsed.value.ok) return null
  return triple(parsed.value.lat, parsed.value.lng, from.value)
})

function shiftText(key) {
  if (!parsed.value.ok) return '—'
  const s = shiftOf(parsed.value.lat, parsed.value.lng, from.value, key)
  if (s.meters < 0.01) return '0 米（没动）'
  return fmtDistance(s.meters) + ' 朝' + s.dir
}
function fmtPoint(v) {
  return fmtDeg(v.lat) + ', ' + fmtDeg(v.lng)
}

const rows = computed(() => {
  if (!all.value) return []
  return COORD_SYS.map((c) => {
    const v = all.value[c.key]
    return {
      key: c.key,
      name: SYS_NAME[c.key],
      deg: fmtPoint(v),
      dms: toDms(v.lat, true) + '  ' + toDms(v.lng, false),
      shift: shiftText(c.key),
    }
  })
})
const zeroTip = computed(() => {
  if (!parsed.value.ok) return ''
  const inside = Math.abs(Number(lng.value)) <= 137.84 && Number(lat.value) >= 0.8 && Number(lat.value) <= 55.83
  if (all.value.wgs84.lat === all.value.gcj02.lat) return '这一组三套写法相同：点在中国范围之外，国测局不做偏移。'
  return inside ? '来源是 ' + SYS_NAME[from.value] + '，另外两行是同一个地点在别家坐标系里的写法。' : ''
})

const picked = computed(() => {
  const v = all.value ? all.value[toKey.value] : { lat: 0, lng: 0 }
  return {
    deg: fmtPoint(v),
    dms: toDms(v.lat, true) + '  ' + toDms(v.lng, false),
    shift: shiftText(toKey.value),
  }
})

const geo2 = computed(() => {
  const a = String(lat2.value || '').trim()
  const b = String(lng2.value || '').trim()
  if (!a || !b || !parsed.value.ok) return null
  try {
    return { lat: checkLat(a), lng: checkLng(b) }
  } catch (e) {
    return null
  }
})
const rel = computed(() => {
  const p = parsed.value
  const q = geo2.value
  const m = distance(p.lat, p.lng, q.lat, q.lng)
  const brg = m < 0.01 ? 0 : bearing(p.lat, p.lng, q.lat, q.lng)
  return { dist: fmtDistance(m), brg: Math.round(brg * 10) / 10, dir: m < 0.01 ? '同一点' : dirName(brg) }
})

function pick(s) {
  lat.value = s.lat
  lng.value = s.lng
}

/* ---------- 定位 ---------- */
const locDeg = computed(() => (loc.value ? fmtPoint(loc.value) : ''))
const locSysName = computed(() => (loc.value ? SYS_NAME[loc.value.sys] : ''))
const locAcc = computed(() => (loc.value && loc.value.accuracy ? fmtDistance(loc.value.accuracy) : '系统没给'))
const locGrade = computed(() => (loc.value ? accuracyGrade(loc.value.accuracy).note : ''))
const locTime = computed(() => (loc.value ? new Date(loc.value.at).toLocaleTimeString() : ''))
function fmtNum(v) {
  return Math.round(Number(v) * 100) / 100
}

async function locate() {
  locMsg.value = ''
  if (!hasApi('getLocation')) {
    locMsg.value = missText('定位', probe())
    return
  }
  // 安卓的 gcj02 是系统直接给的加密坐标；要 GPS 原始值就填 wgs84，App 端需要定位权限
  const type = from.value === 'wgs84' ? 'wgs84' : 'gcj02'
  const perm = await requestAndroidPermissions(PERM_LOCATION, '定位')
  if (perm.message) locMsg.value = perm.message
  if (perm.noneGranted) return
  try {
    const r = await uniCall('getLocation', { type, isHighAccuracy: true, geocode: false })
    loc.value = fromLocation(r, type)
    lat.value = fmtDeg(loc.value.lat)
    lng.value = fmtDeg(loc.value.lng)
    locMsg.value = ''
    toast('已取到位置，精度 ' + (loc.value.accuracy ? fmtDistance(loc.value.accuracy) : '未报'))
  } catch (e) {
    locMsg.value = (e && e.message) || '定位失败'
  }
}

async function openInMap() {
  if (!all.value) return
  locMsg.value = ''
  if (!hasApi('openLocation')) {
    locMsg.value = missText('打开地图查看位置', probe())
    toast(locMsg.value)
    return
  }
  // 系统地图按国测局读坐标，所以交给它的必须是 gcj02 那一行
  const g = from.value === 'gcj02' ? all.value.gcj02 : convert(parsed.value.lat, parsed.value.lng, from.value, 'gcj02')
  try {
    await uniCall('openLocation', { latitude: g.lat, longitude: g.lng, scale: 16 })
  } catch (e) {
    locMsg.value = (e && e.message) || '没能唤起地图'
    toast(locMsg.value)
  }
}

async function parseFromClip() {
  if (!hasApi('getClipboardData')) {
    toast(missText('读剪贴板', probe()) + '；也可以直接把两个数打在下面输入框里')
    return
  }
  try {
    const r = await uniCall('getClipboardData')
    const t = (r && r.data) || ''
    const p = parsePair(t)
    lat.value = fmtDeg(p.lat)
    lng.value = fmtDeg(p.lng)
    toast('已从剪贴板读入一组坐标')
  } catch (e) {
    toast(((e && e.message) || '解析失败') + '（剪贴板里需要有「纬度 经度」两个数）')
  }
}

function copyPicked() {
  if (!all.value) return
  copyText(picked.value.deg)
}
</script>

<style scoped>
.tip {
  display: block;
  font-size: 21rpx;
  line-height: 1.8;
  color: var(--pk-text-3);
  padding: 8rpx 24rpx 12rpx;
}
.row2 {
  display: flex;
  gap: 20rpx;
  padding: 16rpx 24rpx 8rpx;
}
.quick {
  display: flex;
  flex-wrap: wrap;
  padding: 8rpx 24rpx 0;
}
.quick__i {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin: 8rpx 14rpx 0 0;
  padding: 12rpx 20rpx;
  line-height: 1.3;
  border-radius: 10rpx;
  background: var(--pk-accent-soft);
}
.sys {
  padding: 14rpx 24rpx;
  border-bottom: 1rpx solid var(--pk-line);
}
.sys__n {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-2);
}
.sys__v {
  display: block;
  font-size: 30rpx;
  line-height: 1.5;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
}
.sys__d {
  display: block;
  font-size: 21rpx;
  line-height: 1.7;
  color: var(--pk-text-3);
}
</style>
