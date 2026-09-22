<template>
  <view>
    <PkCard padded>
      <text class="tip">手机里那些平时看不见的传感器，这里一次接一个地读出来。选一种、点开始，读数就按系统给的频率往下刷；读不到的会用人话写清楚是缺接口还是缺权限。</text>
      <view class="kind">
        <view
          v-for="k in SENSOR_KINDS"
          :key="k.key"
          class="kind__i"
          :class="{ 'kind__i--on': k.key === activeKey }"
          @tap="choose(k)"
        >
          <text class="kind__g">{{ k.glyph }}</text>
          <text class="kind__n">{{ k.name }}</text>
        </view>
      </view>
      <text class="tip">{{ kind.desc }}</text>
      <PkSeg v-model="rate" :items="SENSOR_RATES" />
      <view class="row2">
        <PkBtn :text="running ? '停止监听' : '开始监听'" :kind="running ? 'ghost' : 'primary'" @tap="toggle" />
        <PkBtn text="清空读数" kind="soft" @tap="reset" />
      </view>
      <text v-if="msg" class="msg">{{ msg }}</text>
    </PkCard>

    <PkCard :title="kind.name + '读数'" :accent="TINT">
      <template v-if="seen">
        <PkRow v-for="r in rows" :key="r.label" :label="r.label" :value="r.value" mono />
        <template v-if="kind.key === 'accel'">
          <PkRow label="合成模长" :value="magText" :copy="false" />
          <PkRow label="前倾 / 侧倾" :value="tiltText" :copy="false" />
          <PkRow label="水平判定" :value="levelText" :color="levelOk ? 'var(--pk-text)' : 'var(--pk-warn)'" :copy="false" stack />
          <view class="level">
            <view class="level__ring">
              <view class="level__dot" :style="dotStyle" />
            </view>
            <view class="level__cross" />
            <text class="level__t">{{ levelOk ? '气泡进圈了：这台面在这个方向上已经平了' : '把气泡往中间挪，两个方向都进圈才算真平' }}</text>
          </view>
        </template>
        <template v-if="kind.key === 'compass'">
          <view class="dial">
            <view class="dial__rose" :style="roseStyle">
              <text class="dial__p dial__p--n">北</text>
              <text class="dial__p dial__p--e">东</text>
              <text class="dial__p dial__p--s">南</text>
              <text class="dial__p dial__p--w">西</text>
            </view>
            <text class="dial__n">{{ cmp.deg }}°</text>
            <text class="dial__d">{{ cmp.dir }}</text>
          </view>
          <text class="tip">表盘跟着方位角反向转，所以「北」这一头始终指向磁北。离磁铁、音箱、车载支架远一点，磁北能偏出几十度。</text>
        </template>
        <template v-if="kind.key === 'light'">
          <PkRow label="照度档位" :value="lg.name" :copy="false" />
          <text class="tip">{{ lg.hint }}</text>
        </template>
        <template v-if="kind.key === 'prox'">
          <PkRow label="距离" :value="px.text" :copy="false" stack />
          <text class="tip">{{ px.detail }}。遮住听筒旁边那颗小窗再移开，读数应该跟着翻；一直不变说明这颗传感器没接上或被壳挡住了。</text>
        </template>
        <template v-if="kind.key === 'gyro'">
          <text class="tip">慢速翻转时角速度低于阈值，读数会一直是 0，这是 MEMS 陀螺的固有特性，不是坏了；快速转一下就能看到峰值。</text>
        </template>
        <template v-if="kind.key === 'motion'">
          <text class="tip">alpha/beta/gamma 是系统融合出来的姿态角，不是原始传感器值：alpha 绕 Z（航向）、beta 绕 X（前后）、gamma 绕 Y（左右）。没有磁力计时 alpha 会慢慢漂。</text>
        </template>
      </template>
      <text v-else class="tip">{{ running ? '已经开始了，等系统给第一帧数据。' : '点上面的「开始监听」读数据。' }}</text>
    </PkCard>

    <PkCard v-if="seen" title="这一段的稳定性" :accent="TINT">
      <view class="spark">
        <view v-for="(h, i) in spark" :key="i" class="spark__b" :style="{ height: h + '%' }" />
      </view>
      <PkRow label="样本数" :value="st.n + ' 帧'" :copy="false" />
      <PkRow label="最小 / 最大" :value="st.min + ' / ' + st.max" mono :copy="false" />
      <PkRow label="均值" :value="String(st.avg)" mono :copy="false" />
      <PkRow label="极差" :value="String(st.spread)" mono :copy="false" />
      <PkRow label="标准差" :value="String(st.sd)" mono :copy="false" />
      <PkRow label="结论" :value="stableText" :copy="false" stack />
      <text class="tip">曲线只画最近 {{ HIST }} 帧。静置时机身的抖动应该是个位数百分比的极差；如果拿在手里不动也能晃出很大的数，多半是这台机器的传感器本身噪点高。</text>
    </PkCard>

    <PkCard title="口径与边界" :accent="TINT">
      <PkRow v-for="n in NOTES" :key="n.t" :label="n.t" :value="n.d" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import {
  SENSOR_KINDS, SENSOR_RATES, frameRows, primaryValue, pushFrame, seriesStats,
  magnitude, tiltFromAccel, isLevel, bubble, smooth, smoothHeading, compassView, lightGrade, proximityState, GRAVITY,
} from '@/utils/sensor'
import { probe, hasApi, h5Has, uniStart, uniStop, uniOn, uniOff, missText, NATIVE_NOTES } from '@/utils/native'

const TINT = '#5B7A2F'
const HIST = 48

/** 浏览器预览里哪些传感器真能读：口径取自 native 那张与 uni-h5 对过账的表，不手写死 */
const H5_YES = SENSOR_KINDS.filter((k) => h5Has(k.start) && h5Has(k.api)).map((k) => k.name)
const H5_NO = SENSOR_KINDS.filter((k) => !(h5Has(k.start) && h5Has(k.api))).map((k) => k.name)
const H5_LINE = H5_YES.length
  ? '浏览器预览里只有' + H5_YES.join('、') + '能读，走的还是网页的运动与方向事件，采样率和精度都不如系统接口；' +
    H5_NO.join('、') + '在 H5 端根本没有对应接口。'
  : '浏览器预览里这几样传感器接口都没有。'

const NOTES = [
  { t: '数据从哪来', d: '全部走 uni 的传感器接口，最终落到安卓的 SensorManager。' + H5_LINE + '不管有没有，页面上都会在原位写清楚缺什么，不会崩。' },
  { t: '为什么读数会抖', d: '系统给的是原始采样，屏幕上又只放得下三行字，所以倾角和方位都做了一阶低通（α=0.25 / 0.3）。要看不加滤波的裸值，看上面那三行轴读数。' },
  { t: '静止时应该看到什么', d: '加速度三轴合力约等于重力 ' + GRAVITY + ' m/s²，也就是平放时 Z 轴接近 9.8、X/Y 接近 0。合模长明显偏离这个数，说明手机正在动。' },
  { t: '磁北不等于真北', d: '指南针读的是地磁方向，和地图上的正北差一个磁偏角，国内东边能差到几度、西边更大；再加上钢铁和电磁干扰，取个整数方位当参考就好，别拿它当测绘。' },
  { t: '不是每台都有', d: '光线、接近、陀螺仪在低端机和虚拟机上经常缺席；部分机型只在亮屏且前台时才给传感器数据，切到后台就会停更。' },
  { t: '离开页面就停', d: '传感器常驻很费电，所以停止监听、切换传感器和离开页面都会把回调摘掉，不会留在后台继续采样。' },
].concat(NATIVE_NOTES.slice(0, 2))

const activeKey = ref('accel')
const rate = ref('ui')
const running = ref(false)
const raw = ref(null)
const sm = ref(null)
const heading = ref(null)
const buf = ref([])
const msg = ref('')

const kind = computed(() => SENSOR_KINDS.find((k) => k.key === activeKey.value) || SENSOR_KINDS[0])
const seen = computed(() => !!raw.value)
const rows = computed(() => frameRows(kind.value, raw.value))
const st = computed(() => seriesStats(buf.value))
const spark = computed(() => {
  const xs = buf.value
  if (!xs.length) return []
  let lo = xs[0]
  let hi = xs[0]
  for (const v of xs) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  const span = hi - lo
  return xs.map((v) => (span < 1e-9 ? 50 : Math.max(4, Math.round(((v - lo) / span) * 96) + 2)))
})
const stableText = computed(() => {
  if (!st.value.n) return '还没有样本'
  if (st.value.stable) return '稳：极差 ' + st.value.spread + '，在读数本身的量级以内'
  return '在动：极差 ' + st.value.spread + '，标准差 ' + st.value.sd
})

const magText = computed(() => {
  const f = smFrame.value
  if (!f) return '—'
  const m = magnitude(f.x, f.y, f.z)
  return Math.round(m * 1000) / 1000 + ' m/s²（1 g ≈ ' + GRAVITY + '）'
})
const smFrame = computed(() => sm.value)
const tiltText = computed(() => {
  const f = smFrame.value
  if (!f) return '—'
  const t = tiltFromAccel(f.x, f.y, f.z)
  return t.pitch + '° / ' + t.roll + '°'
})
const levelOk = computed(() => {
  const f = smFrame.value
  return !!f && isLevel(f.x, f.y, f.z, 1)
})
const levelText = computed(() => (smFrame.value ? (levelOk.value ? '水平（±1°内）' : '不平') : '—'))
const dotStyle = computed(() => {
  const f = smFrame.value
  const b = f ? bubble(f.x, f.y, 0.5) : { left: 50, top: 50 }
  return { left: b.left + '%', top: b.top + '%' }
})

const cmp = computed(() => compassView(heading.value === null ? 0 : heading.value))
const roseStyle = computed(() => ({ transform: 'rotate(' + -cmp.value.rot + 'deg)' }))

const lg = computed(() => lightGrade(raw.value ? raw.value.intensity : null))
const px = computed(() => proximityState(raw.value ? raw.value.value : null, raw.value ? raw.value.max : null))

/* ---------- 采样链路 ---------- */
function onFrame(res) {
  raw.value = res || null
  const v = primaryValue(kind.value, res)
  if (v !== null) buf.value = pushFrame(buf.value, v, HIST)
  if (res && res.x !== undefined && res.y !== undefined) sm.value = smooth(sm.value, res, 0.25)
  if (res && res.direction !== undefined) heading.value = smoothHeading(heading.value, res.direction, 0.3)
}

function reset() {
  raw.value = null
  sm.value = null
  heading.value = null
  buf.value = []
}

function stopAll() {
  const k = kind.value
  uniOff(k.api)
  if (k.start !== k.api) uniStop(k.stop)
  running.value = false
}

function start() {
  const k = kind.value
  msg.value = ''
  reset()
  if (k.start !== k.api && !hasApi(k.start)) {
    msg.value = missText(k.name, probe())
    return
  }
  if (k.start !== k.api) {
    const r = uniStart(k.start, { interval: rate.value })
    if (!r.started) {
      msg.value = r.message
      return
    }
  }
  const o = uniOn(k.api, onFrame)
  if (!o.started) {
    msg.value = o.message
    if (k.start !== k.api) uniStop(k.stop)
    return
  }
  running.value = true
}

function toggle() {
  if (running.value) {
    stopAll()
    msg.value = ''
  } else {
    start()
  }
}

function choose(k) {
  if (k.key === activeKey.value) return
  const wasRunning = running.value
  if (wasRunning) stopAll()
  activeKey.value = k.key
  reset()
  msg.value = ''
  if (wasRunning) start()
}

onUnmounted(() => {
  if (running.value) stopAll()
})
</script>

<style scoped>
.tip {
  display: block;
  font-size: 21rpx;
  line-height: 1.8;
  color: var(--pk-text-3);
  padding: 8rpx 24rpx 12rpx;
}
.msg {
  display: block;
  font-size: 22rpx;
  line-height: 1.8;
  color: var(--pk-danger);
  padding: 12rpx 24rpx;
}
.row2 {
  display: flex;
  gap: 20rpx;
  padding: 16rpx 24rpx 8rpx;
}
.kind {
  display: flex;
  flex-wrap: wrap;
  padding: 8rpx 16rpx 0;
}
.kind__i {
  width: 33.33%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 18rpx 0;
  margin: 8rpx 0;
  border-radius: var(--pk-radius-md);
  background: var(--pk-bg-soft);
  border: var(--pk-line-w) solid var(--pk-line);
}
.kind__i--on {
  background: var(--pk-accent-soft);
  border-color: var(--pk-accent);
}
.kind__g {
  font-size: 30rpx;
  line-height: 1.4;
  color: var(--pk-text);
}
.kind__n {
  font-size: 21rpx;
  color: var(--pk-text-3);
  margin-top: 4rpx;
}
.level {
  position: relative;
  align-items: center;
  padding: 24rpx;
}
.level__ring {
  position: relative;
  width: 240rpx;
  height: 240rpx;
  border-radius: 50%;
  overflow: hidden;
  border: var(--pk-line-w) solid var(--pk-line-strong);
  background: var(--pk-bg-soft);
}
.level__cross {
  position: absolute;
  left: 50%;
  top: 20rpx;
  width: var(--pk-line-w);
  height: 200rpx;
  background: var(--pk-line);
}
.level__dot {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 46rpx;
  height: 46rpx;
  margin: -23rpx 0 0 -23rpx;
  border-radius: 50%;
  background: var(--pk-accent);
}
.level__t {
  display: block;
  font-size: 21rpx;
  line-height: 1.8;
  color: var(--pk-text-3);
  text-align: center;
  padding-top: 16rpx;
}
.dial {
  position: relative;
  width: 300rpx;
  height: 300rpx;
  margin: 24rpx auto 0;
  border-radius: 50%;
  border: var(--pk-line-w) solid var(--pk-line-strong);
  background: var(--pk-bg-soft);
}
.dial__rose {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
}
.dial__p {
  position: absolute;
  font-size: 24rpx;
  color: var(--pk-text-2);
  padding: 10rpx;
}
.dial__p--n {
  left: 50%;
  top: 0;
  margin-left: -22rpx;
  color: var(--pk-accent);
}
.dial__p--e {
  top: 50%;
  right: 0;
  margin-top: -22rpx;
}
.dial__p--s {
  left: 50%;
  bottom: 0;
  margin-left: -22rpx;
}
.dial__p--w {
  top: 50%;
  left: 0;
  margin-top: -22rpx;
}
.dial__n {
  position: absolute;
  left: 0;
  right: 0;
  top: 96rpx;
  text-align: center;
  font-size: 44rpx;
  color: var(--pk-text);
}
.dial__d {
  position: absolute;
  left: 0;
  right: 0;
  top: 168rpx;
  text-align: center;
  font-size: 24rpx;
  color: var(--pk-text-3);
}
.spark {
  display: flex;
  align-items: flex-end;
  height: 120rpx;
  margin: 16rpx 24rpx 8rpx;
  padding: 8rpx;
  border-radius: var(--pk-radius-sm);
  background: var(--pk-bg-soft);
}
.spark__b {
  flex: 1;
  margin: 0 2rpx;
  background: var(--pk-accent);
  opacity: 0.75;
}
</style>
