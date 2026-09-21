<template>
  <view>
    <!-- 各城市现在几点 -->
    <PkCard title="各城市现在几点" accent="#2F7A8C">
      <view v-for="r in nowList" :key="r.key" class="clock-row">
        <view class="clock-row__main">
          <text class="clock-row__cn">
            {{ r.cn }}<text v-if="r.dstActive" class="clock-row__dst"> · 夏令时中</text>
          </text>
          <text class="clock-row__sub">
            {{ r.date }} {{ r.weekday }}{{ r.crossDay === '当日' ? '' : ' · 比基准' + r.crossDay }}
          </text>
        </view>
        <text class="clock-row__hm">{{ r.hm }}</text>
      </view>
      <view class="act-row">
        <PkBtn text="刷新" kind="soft" @tap="refreshNow" />
        <PkBtn text="复制时刻表" kind="ghost" @tap="copySummary" />
      </view>
      <text v-if="nowNote" class="tip">{{ nowNote }}</text>
    </PkCard>

    <!-- 时间点换算 -->
    <PkCard title="时间点换算" accent="#4A6FA5">
      <PkField v-model="stampInput" placeholder="粘贴秒 / 毫秒时间戳，例如 1789000000" />
      <view class="act-row">
        <PkBtn text="用现在时刻" kind="soft" @tap="useNowStamp" />
      </view>
      <template v-if="stampRes">
        <PkRow label="标准 ISO" :value="stampRes.iso" mono />
        <PkRow label="UTC 文本" :value="stampUtc" mono />
        <PkRow label="设备本地" :value="stampDevice" :copy="false" />
        <PkRow label="北京" :value="stampBeijing" :copy="false" />
        <PkRow label="星期" :value="stampRes.deviceWeekday" :copy="false" />
      </template>
      <PkRow
        v-if="stampErr"
        label="解析不了"
        :value="stampErr"
        color="var(--pk-danger)"
        :copy="false"
        stack
      />
      <text class="tip">秒和毫秒按位数自动识别；时间戳是绝对时刻，同一瞬间全球读数不同但时刻相同</text>
    </PkCard>

    <!-- 两城对照 -->
    <PkCard title="两城对照" accent="#8C5B3E">
      <text class="seg-k">这边</text>
      <PkSeg v-model="pairA" :items="zoneItems" />
      <text class="seg-k seg-k--gap">那边</text>
      <PkSeg v-model="pairB" :items="zoneItems" />
      <template v-if="pairRes">
        <PkRow label="时差" :value="pairRes.deltaText" big :copy="false" />
        <PkRow label="那边此刻" :value="pairRes.thereText" :copy="false" stack />
        <PkRow label="双方工作时间重叠" :value="overlapText" :copy="false" />
        <PkRow label="日历关系" :value="sameDayText" :copy="false" />
      </template>
      <text v-if="pairRes" class="tip">{{ pairRes.note }}</text>
    </PkCard>

    <!-- 会议时段 -->
    <PkCard title="会议时段" accent="#3E7A4E">
      <PkField v-model="meetingDate" placeholder="日期如 2026-10-08，留空则从今天往后找" />
      <view class="act-row">
        <PkBtn text="找共同时段" kind="primary" @tap="runMeeting" />
        <PkBtn v-if="meeting && meeting.slots.length" text="复制时段" kind="ghost" @tap="copySlots" />
      </view>
      <PkRow
        v-if="meetingErr"
        label="算不了"
        :value="meetingErr"
        color="var(--pk-danger)"
        :copy="false"
        stack
      />
      <template v-if="meeting">
        <PkRow label="共同时长" :value="meeting.totalHours + ' 小时'" :copy="false" />
        <view class="slot-list">
          <view v-for="(s, i) in meeting.slots.slice(0, 8)" :key="i" class="slot-row">
            <text class="slot-row__t">{{ s.text }}</text>
          </view>
          <text v-if="!meeting.slots.length" class="tip">这段范围里没有双方都在工作时段的重叠——通常只能一方熬夜，或改成异步留言</text>
        </view>
        <text class="tip">{{ meeting.note }}</text>
      </template>
    </PkCard>

    <!-- 当日逐时对照 -->
    <PkCard title="当日逐时对照" accent="#6B5B95">
      <view class="grid24">
        <view
          v-for="g in grid.rows"
          :key="g.hour"
          class="gcell"
          :class="{ 'gcell--work': g.bothWork && g.inWeek && g.bInWeek }"
        >
          <text class="gcell__a">{{ g.aTime }}</text>
          <text class="gcell__b">
            {{ g.bTime }}<text v-if="g.crossDayMark" class="gcell__cross"> {{ g.crossDayMark }}</text>
          </text>
        </view>
      </view>
      <PkRow label="双方都工作的整点" :value="grid.bothWorkCount + ' 个'" :copy="false" />
      <view class="act-row">
        <PkBtn text="复制对照表" kind="ghost" @tap="copyGrid" />
      </view>
      <text class="tip">{{ grid.note }}</text>
    </PkCard>

    <!-- 说明 -->
    <PkCard title="排期前先读这七条" accent="var(--pk-warn)">
      <view class="notes">
        <text v-for="(n, i) in CLOCK_NOTES" :key="i" class="note">· {{ n }}</text>
      </view>
      <text class="tip">{{ ENGINE_NOTE }}</text>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { copyText, toast } from '@/utils/clipboard'
import {
  DEFAULT_ZONES,
  CLOCK_NOTES,
  ENGINE_NOTE,
  zone,
  zoneRow,
  nowRows,
  stampLinks,
  pairCompare,
  meetingSlots,
  dayGrid,
  worldSummaryText,
  utcText,
} from '@/utils/worldclock'

const baseKey = 'Asia/Shanghai'
const zoneItems = DEFAULT_ZONES.map((k) => ({ key: k, name: zone(k).cn }))

/* ---------- 各城市现在几点（30 秒自刷新） ---------- */
const nowRes = ref(null)
let timer = null

function refreshNow() {
  nowRes.value = nowRows(DEFAULT_ZONES, baseKey)
}

onMounted(() => {
  refreshNow()
  timer = setInterval(refreshNow, 30000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const nowList = computed(() => (nowRes.value && nowRes.value.rows) || [])
const nowNote = computed(() => (nowRes.value && nowRes.value.note) || '')

function copySummary() {
  copyText(worldSummaryText(nowRes.value))
  toast('时刻表已复制')
}

/* ---------- 时间点换算 ---------- */
const stampInput = ref('')
const stampErr = ref('')
const stampRes = computed(() => {
  const raw = stampInput.value.trim()
  if (!raw) {
    stampErr.value = ''
    return null
  }
  try {
    const r = stampLinks({ stamp: raw })
    stampErr.value = ''
    return r
  } catch (e) {
    stampErr.value = e.message
    return null
  }
})

function useNowStamp() {
  stampInput.value = String(Math.floor(Date.now() / 1000))
}

const stampUtc = computed(() => (stampRes.value ? utcText(stampRes.value.ms) : ''))
const stampDevice = computed(() => {
  const r = stampRes.value
  return r ? r.deviceDate + ' ' + r.deviceTime + '（' + r.deviceWeekday + '）' : ''
})
const stampBeijing = computed(() => {
  const b = stampRes.value && stampRes.value.beijing
  return b ? b.date + ' ' + b.hm + '（' + b.weekday + '）' : ''
})

/* ---------- 两城对照 ---------- */
const pairA = ref('Asia/Shanghai')
const pairB = ref('America/New_York')

const pairRes = computed(() => {
  try {
    return pairCompare({ a: pairA.value, b: pairB.value })
  } catch (e) {
    return null
  }
})

const overlapText = computed(() => {
  const r = pairRes.value
  return r ? Math.round((r.overlapRatio || 0) * 100) + '%' : ''
})

const sameDayText = computed(() => {
  const r = pairRes.value
  if (!r) return ''
  const day = r.sameDay ? '同一日历日' : r.dayOffset > 0 ? '那边快一天' : '那边慢一天'
  return day + (r.weekendThere ? ' · 此刻对方是周末' : '')
})

/* ---------- 会议时段 ---------- */
const meetingDate = ref('')
const meetingErr = ref('')
const meeting = ref(null)

function runMeeting() {
  meetingErr.value = ''
  try {
    const input = { a: pairA.value, b: pairB.value }
    const d = meetingDate.value.trim()
    if (d) input.date = d
    meeting.value = meetingSlots(input)
  } catch (e) {
    meeting.value = null
    meetingErr.value = e.message
  }
}

function copySlots() {
  if (!meeting.value) return
  copyText(meeting.value.slots.map((s) => s.text).join('\n'))
  toast('时段已复制')
}

/* ---------- 当日逐时对照 ---------- */
const grid = computed(() => {
  try {
    const aDate = zoneRow(Date.now(), pairA.value).date
    return dayGrid({ a: pairA.value, b: pairB.value, date: aDate })
  } catch (e) {
    return { rows: [], bothWorkCount: 0, note: e.message }
  }
})

function copyGrid() {
  const g = grid.value
  const lines = [g.a + '（' + g.aDate + '） ↔ ' + g.b]
  g.rows.forEach((r) => {
    lines.push(r.aTime + ' → ' + r.bTime + (r.crossDayMark ? '（' + r.bDateShort + '）' : '') + (r.bothWork ? ' 双方工作' : ''))
  })
  copyText(lines.join('\n'))
  toast('对照表已复制')
}
</script>

<style scoped>
.clock-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.clock-row:last-child {
  border-bottom: none;
}
.clock-row__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.clock-row__cn {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--pk-text);
}
.clock-row__dst {
  font-size: 21rpx;
  font-weight: 400;
  color: var(--pk-warn);
}
.clock-row__sub {
  font-size: 21rpx;
  color: var(--pk-text-3);
  margin-top: 4rpx;
}
.clock-row__hm {
  font-size: 32rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-accent);
  flex-shrink: 0;
}
.act-row {
  display: flex;
  gap: 20rpx;
  padding: 14rpx 24rpx 10rpx;
}
.tip {
  display: block;
  padding: 6rpx 24rpx 14rpx;
  font-size: 21rpx;
  line-height: 1.8;
  color: var(--pk-text-3);
}
.seg-k {
  display: block;
  padding: 8rpx 24rpx 4rpx;
  font-size: 22rpx;
  color: var(--pk-text-3);
}
.seg-k--gap {
  padding-top: 20rpx;
}
.slot-list {
  padding: 4rpx 24rpx 8rpx;
}
.slot-row {
  padding: 12rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.slot-row:last-child {
  border-bottom: none;
}
.slot-row__t {
  font-size: 23rpx;
  line-height: 1.7;
  color: var(--pk-text);
  word-break: break-all;
}
.grid24 {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  padding: 12rpx 24rpx 16rpx;
}
.gcell {
  min-width: 150rpx;
  padding: 10rpx 14rpx;
  border-radius: 10rpx;
  background: var(--pk-input);
  border: var(--pk-line-w) solid var(--pk-line);
}
.gcell--work {
  background: var(--pk-accent-soft);
  border-color: var(--pk-accent);
}
.gcell__a {
  display: block;
  font-size: 19rpx;
  color: var(--pk-text-3);
}
.gcell__b {
  display: block;
  margin-top: 2rpx;
  font-size: 22rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
}
.gcell__cross {
  font-size: 17rpx;
  color: var(--pk-warn);
}
.notes {
  padding: 6rpx 24rpx 10rpx;
}
.note {
  display: block;
  font-size: 21rpx;
  line-height: 1.8;
  color: var(--pk-text-2);
}
</style>
