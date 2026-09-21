<template>
  <view>
    <PkCard title="表达式" accent="#4F6B8C">
      <PkField v-model="expr" placeholder="分 时 日 月 周，例如 */5 * * * *" confirm-type="done">
        <template #labelRight>
          <text class="mini-act" @tap="expr = '* * * * *'">每分钟</text>
          <text class="mini-act" @tap="expr = ''">清空</text>
        </template>
      </PkField>
      <view class="quick-row">
        <text v-for="p in CRON_PRESETS" :key="p.name" class="quick-i" @tap="expr = p.expr">{{ p.name }}</text>
      </view>
    </PkCard>

    <PkCard v-if="error" title="解析失败" accent="var(--pk-danger)">
      <PkRow label="原因" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <template v-else>
      <PkCard title="含义" accent="var(--pk-accent)">
        <view class="summary">
          <text class="summary__t">{{ info.summary }}</text>
        </view>
        <PkRow v-for="l in info.lines" :key="l.name" :label="l.name" :value="l.raw + '　→　' + l.text" :copy="false" />
        <PkRow
          v-if="info.parallel"
          label="注意"
          value="日和星期都限定了，按标准 cron 规则是「满足任一即执行」，不是「同时满足」"
          color="var(--pk-warn)"
          :copy="false"
          stack
        />
      </PkCard>

      <PkCard title="接下来 10 次执行" accent="#6B5B95">
        <PkRow
          v-for="(r, i) in runs"
          :key="i"
          :label="'第 ' + (i + 1) + ' 次'"
          :value="fmt(r)"
          :copy="false"
        />
        <PkRow v-if="!runs.length" label="结果" value="往后找了 6 年也没匹配到，检查一下表达式" color="var(--pk-danger)" :copy="false" stack />
      </PkCard>
    </template>

    <PkCard title="可视化生成" accent="#8A6D3B">
      <PkSeg v-model="rhythm" :items="rhythms" />
      <PkField v-if="rhythm === 'everyMin'" v-model="n1" type="number" label="每多少分钟执行一次" placeholder="5" />
      <PkField v-if="rhythm === 'everyHour'" v-model="n1" type="number" label="每小时的第几分钟" placeholder="0" />
      <template v-if="rhythm === 'daily' || rhythm === 'weekly' || rhythm === 'monthly'">
        <PkField v-model="hour" type="number" label="小时（0-23）" placeholder="9" />
        <PkField v-model="minute" type="number" label="分钟（0-59）" placeholder="0" />
      </template>
      <PkField v-if="rhythm === 'weekly'" v-model="n1" type="number" label="星期几（0=周日, 1-6）" placeholder="1" />
      <PkField v-if="rhythm === 'monthly'" v-model="n1" type="number" label="每月几号（1-31）" placeholder="1" />
      <view class="act-row">
        <PkBtn text="生成表达式" kind="primary" block @tap="generate" />
      </view>
    </PkCard>

    <PkCard title="五段含义" accent="#4A6FA5">
      <PkRow label="第 1 段" value="分钟 0-59" :copy="false" />
      <PkRow label="第 2 段" value="小时 0-23" :copy="false" />
      <PkRow label="第 3 段" value="日 1-31" :copy="false" />
      <PkRow label="第 4 段" value="月 1-12，也可写 jan~dec" :copy="false" />
      <PkRow label="第 5 段" value="星期 0-7（0 和 7 都是周日），也可写 sun~sat" :copy="false" />
      <PkRow label="写法" value="* 任意　5 固定值　1-5 区间　*/15 步长　1,3,5 枚举　22-2 跨零点区间" :copy="false" stack />
      <PkRow label="不支持" value="L / W / # 这类特殊符号（Quartz 专有，不同系统行为不一致），本工具会直接提示" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { parseCron, nextRuns, describe, fmtDate, CRON_PRESETS } from '@/utils/cron'
import { toast } from '@/utils/clipboard'

const expr = ref('0 9 * * 1-5')
const rhythm = ref('daily')
const n1 = ref('0')
const hour = ref('9')
const minute = ref('0')

const rhythms = [
  { key: 'everyMin', name: '按分钟' },
  { key: 'everyHour', name: '按小时' },
  { key: 'daily', name: '每天' },
  { key: 'weekly', name: '每周' },
  { key: 'monthly', name: '每月' },
]

const parsed = computed(() => parseCron(expr.value))
const error = computed(() => (parsed.value.ok ? '' : parsed.value.error))
const info = computed(() => (parsed.value.ok ? describe(expr.value) : { summary: '', lines: [], parallel: false }))

const runs = computed(() => {
  if (!parsed.value.ok) return []
  try {
    return nextRuns(expr.value, 10)
  } catch (e) {
    return []
  }
})

function fmt(d) {
  return fmtDate(d)
}

const pad = (v) => String(v).padStart(2, '0')

function generate() {
  const m = Number(minute.value)
  const h = Number(hour.value)
  const x = Number(n1.value)
  let out = ''
  if (rhythm.value === 'everyMin') {
    if (!(x >= 1 && x <= 59)) return toast('间隔要在 1~59 分钟之间')
    out = '*/' + x + ' * * * *'
  } else if (rhythm.value === 'everyHour') {
    if (!(x >= 0 && x <= 59)) return toast('分钟要在 0~59 之间')
    out = x + ' * * * *'
  } else if (rhythm.value === 'daily') {
    if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) return toast('时间填得不对')
    out = m + ' ' + h + ' * * *'
  } else if (rhythm.value === 'weekly') {
    if (!(x >= 0 && x <= 6)) return toast('星期要在 0~6 之间')
    if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) return toast('时间填得不对')
    out = m + ' ' + h + ' * * ' + x
  } else {
    if (!(x >= 1 && x <= 31)) return toast('日期要在 1~31 之间')
    if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) return toast('时间填得不对')
    out = m + ' ' + h + ' ' + x + ' * *'
  }
  expr.value = out
  toast('已生成：' + out)
}
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 22rpx;
}
.quick-row {
  display: flex;
  flex-wrap: wrap;
  margin-top: 4rpx;
}
.quick-i {
  display: inline-block;
  font-size: 22rpx;
  color: var(--pk-accent);
  margin: 8rpx 14rpx 0 0;
  padding: 12rpx 20rpx;
  line-height: 1.3;
  border-radius: 10rpx;
  background: var(--pk-accent-soft);
}
.summary {
  padding: 18rpx 24rpx 12rpx;
}
.summary__t {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--pk-text);
  line-height: 1.6;
}
.act-row {
  padding: 10rpx 0 4rpx;
}
</style>
