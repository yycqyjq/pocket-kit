<template>
  <view>
    <PkCard title="实时时间" accent="#4F6B8C">
      <view class="now">
        <text class="now__t">{{ nowText }}</text>
        <text class="now__s">{{ relativeTick }}</text>
      </view>
      <PkRow label="当前秒级时间戳" :value="nowSec" mono />
      <PkRow label="当前毫秒时间戳" :value="nowMs" mono />
      <PkRow label="本机时区" :value="tzText" :copy="false" />
      <view class="act-row">
        <PkBtn text="把当前时间戳填入" kind="soft" @tap="useNow" />
        <PkBtn text="暂停/继续" kind="ghost" @tap="running = !running" />
      </view>
    </PkCard>

    <PkCard title="时间戳 → 日期" accent="var(--pk-accent)">
      <PkField v-model="tsInput" type="number" label="粘贴时间戳" placeholder="10 位或 13 位数字" :maxlength="16">
        <template #labelRight>
          <text class="mini-act" @tap="tsInput = nowSec">用当前时间</text>
        </template>
      </PkField>
      <template v-if="fromTs.standard">
        <PkRow v-if="tsUnit" label="识别为" :value="tsUnit === 's' ? '秒级（已 ×1000）' : '毫秒级'" :copy="false" />
        <PkRow label="标准格式" :value="fromTs.standard" mono big />
        <PkRow label="日期" :value="fromTs.date" />
        <PkRow label="时间" :value="fromTs.time" />
        <PkRow label="星期" :value="fromTs.weekday" :copy="false" />
        <PkRow label="ISO 8601" :value="fromTs.iso" mono />
        <PkRow label="UTC 时间" :value="fromTs.utc" mono />
        <PkRow label="相对现在" :value="fromTs.relative" :copy="false" />
        <PkRow label="年内第几天" :value="fromTs.doy" :copy="false" />
        <PkRow label="年内第几周" :value="fromTs.week" :copy="false" />
      </template>
      <PkRow
        v-else
        label="等待输入"
        value="填一个 10 位或 13 位数字，这里会列出日期、星期、ISO 时间与年内周数"
        :copy="false"
        stack
      />
    </PkCard>

    <PkCard title="日期 → 时间戳" accent="#6B5B95">
      <PkField v-model="dateInput" placeholder="2026-09-20 15:53:00" :maxlength="30" />
      <PkRow label="解析结果" :value="toTs.parsed" :copy="false" />
      <PkRow label="秒级时间戳" :value="toTs.sec" mono />
      <PkRow label="毫秒时间戳" :value="toTs.ms" mono />
      <PkRow v-if="toTs.err" label="提示" :value="toTs.err" color="var(--pk-danger)" :copy="false" />
    </PkCard>

    <PkCard title="常用时间点" accent="#8A6D3B">
      <PkRow
        v-for="p in commonPoints"
        :key="p.name"
        :label="p.name"
        :value="p.ts"
        mono
      />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import {
  formatDate,
  parseTimestamp,
  weekdayCN,
  relativeTime,
  dayOfYear,
  isoWeek,
  TZ_OFFSET_MINUTES,
} from '@/utils/date'

const running = ref(true)
const tick = ref(Date.now())
const tsInput = ref('')
const dateInput = ref(formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss'))

const timer = setInterval(() => {
  if (running.value) tick.value = Date.now()
}, 1000)
onUnmounted(() => clearInterval(timer))

const nowMs = computed(() => String(tick.value))
const nowSec = computed(() => String(Math.floor(tick.value / 1000)))
const nowText = computed(() => formatDate(tick.value, 'YYYY-MM-DD HH:mm:ss'))
const relativeTick = computed(() => weekdayCN(tick.value) + ' · ' + relativeTime(tick.value))

const tzText = computed(() => {
  const sign = TZ_OFFSET_MINUTES >= 0 ? '+' : '-'
  const abs = Math.abs(TZ_OFFSET_MINUTES)
  return 'UTC' + sign + String(Math.floor(abs / 60)).padStart(2, '0') + ':' + String(abs % 60).padStart(2, '0')
})

const parsedInput = computed(() => parseTimestamp(tsInput.value))

const tsUnit = computed(() => (tsInput.value ? parsedInput.value.unit : ''))

const emptyFromTs = {
  standard: '', date: '', time: '', weekday: '', iso: '', utc: '', relative: '', doy: '', week: '',
}

const fromTs = computed(() => {
  if (!tsInput.value) return emptyFromTs
  const { ms } = parsedInput.value
  if (!isFinite(ms)) return emptyFromTs
  const d = new Date(ms)
  if (isNaN(d.getTime())) return emptyFromTs
  return {
    standard: formatDate(d, 'YYYY-MM-DD HH:mm:ss'),
    date: formatDate(d, 'YYYY-MM-DD'),
    time: formatDate(d, 'HH:mm:ss'),
    weekday: weekdayCN(d),
    iso: d.toISOString(),
    utc: d.toUTCString(),
    relative: relativeTime(ms),
    doy: '第 ' + dayOfYear(d) + ' 天',
    week: '第 ' + isoWeek(d) + ' 周',
  }
})

const toTs = computed(() => {
  const raw = String(dateInput.value).trim()
  if (!raw) return { parsed: '', sec: '', ms: '', err: '' }
  // 兼容 2026-09-20 15:53:00 与 2026/09/20 这类写法
  const normalized = raw.replace(/\//g, '-').replace(/\./g, '-')
  const d = new Date(normalized)
  if (isNaN(d.getTime())) {
    return { parsed: '', sec: '', ms: '', err: '无法识别的日期格式，建议写成 2026-09-20 15:53:00' }
  }
  return {
    parsed: formatDate(d, 'YYYY-MM-DD HH:mm:ss') + ' ' + weekdayCN(d),
    sec: String(Math.floor(d.getTime() / 1000)),
    ms: String(d.getTime()),
    err: '',
  }
})

const commonPoints = computed(() => {
  const now = new Date(tick.value)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const points = [
    { name: '今天 0 点', d: todayStart },
    { name: '明天 0 点', d: new Date(todayStart.getTime() + 86400000) },
    { name: '本月 1 号 0 点', d: new Date(now.getFullYear(), now.getMonth(), 1) },
    { name: '今年 1 月 1 日', d: new Date(now.getFullYear(), 0, 1) },
    { name: '一周前', d: new Date(tick.value - 7 * 86400000) },
    { name: '30 天后', d: new Date(tick.value + 30 * 86400000) },
  ]
  return points.map((p) => ({
    name: p.name,
    ts: String(Math.floor(p.d.getTime() / 1000)),
  }))
})

function useNow() {
  tsInput.value = String(Math.floor(Date.now() / 1000))
  running.value = false
}
</script>

<style scoped>
.mini-act {
  font-size: 24rpx;
  color: var(--pk-accent);
}
.now {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24rpx 0 20rpx;
}
.now__t {
  font-size: 46rpx;
  font-weight: 600;
  color: var(--pk-text);
  font-family: Menlo, Consolas, monospace;
  letter-spacing: 1rpx;
}
.now__s {
  font-size: 24rpx;
  color: var(--pk-text-3);
  margin-top: 12rpx;
}
.act-row {
  display: flex;
  gap: 20rpx;
  padding: 16rpx 24rpx 24rpx;
}
</style>
