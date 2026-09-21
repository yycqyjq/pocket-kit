<template>
  <view>
    <PkCard title="起止日期" accent="#7A6BA8">
      <PkField v-model="start" label="开始日期" placeholder="2026-01-01" />
      <view class="quick-row">
        <text v-for="q in quickStarts" :key="q.n" class="quick-i" @tap="start = q.v">{{ q.n }}</text>
      </view>
      <PkField v-model="end" label="结束日期" placeholder="2026-12-31" />
      <view class="quick-row">
        <text class="quick-i" @tap="end = todayStr">今天</text>
        <text v-for="q in quickEnds" :key="q.n" class="quick-i" @tap="end = q.v">{{ q.n }}</text>
      </view>
      <view class="act-row">
        <PkBtn text="对调起止" kind="ghost" @tap="swap" />
        <PkBtn text="重置为今天" kind="soft" @tap="resetToday" />
      </view>
      <PkRow v-if="err" label="提示" :value="err" color="var(--pk-danger)" :copy="false" />
    </PkCard>

    <template v-if="diff">
      <PkCard title="间隔" accent="var(--pk-accent)">
        <PkRow label="共几天（含首尾）" :value="diff.span + ' 天'" big />
        <PkRow label="相隔天数（不含结束日）" :value="diff.gap + ' 天'" />
        <PkRow label="折算" :value="diff.breakdown" :copy="false" />
        <PkRow label="完整周 + 余天" :value="diff.weeks" :copy="false" />
        <PkRow label="小时" :value="diff.hours" />
        <PkRow label="分钟" :value="diff.minutes" />
        <PkRow label="秒" :value="diff.seconds" />
        <PkRow label="是否反向" :value="diff.reversed ? '是（结束早于开始）' : '否'" :copy="false" />
      </PkCard>

      <PkCard title="工作日统计" accent="#4A6FA5">
        <PkRow label="工作日（含首尾，周一至周五）" :value="diff.workdays + ' 天'" big />
        <PkRow label="休息日（含首尾，周六周日）" :value="diff.weekendDays + ' 天'" />
        <PkRow label="合计" :value="diff.workdays + ' + ' + diff.weekendDays + ' = ' + diff.span + ' 天'" :copy="false" />
        <PkRow label="说明" value="按自然周末估算，未考虑法定节假日与调休。工作日与休息日都按含首尾计算，两者之和等于「共几天」" :copy="false" stack />
      </PkCard>
    </template>

    <PkCard title="日期加减" accent="#6B5B95">
      <PkField v-model="baseDate" label="基准日期" placeholder="2026-09-20" />
      <PkField v-model="offsetDays" type="number" label="偏移天数（可为负）" placeholder="30" />
      <PkRow label="结果日期" :value="shiftResult.date" big />
      <PkRow label="星期" :value="shiftResult.weekday" :copy="false" />
      <PkRow label="时间戳（秒）" :value="shiftResult.ts" mono />
      <view class="quick-row">
        <text class="quick-i" @tap="offsetDays = '7'">+7</text>
        <text class="quick-i" @tap="offsetDays = '30'">+30</text>
        <text class="quick-i" @tap="offsetDays = '90'">+90</text>
        <text class="quick-i" @tap="offsetDays = '180'">+180</text>
        <text class="quick-i" @tap="offsetDays = '365'">+365</text>
      </view>
    </PkCard>

    <PkCard title="年龄推算" accent="var(--pk-warn)">
      <PkField v-model="birth" label="出生日期" placeholder="1998-05-20" />
      <PkField v-model="refDate" label="参照日期（默认今天）" :placeholder="todayStr" />
      <template v-if="age">
        <PkRow label="周岁" :value="age.years + ' 岁'" big />
        <PkRow label="精确年龄" :value="age.years + ' 岁 ' + age.months + ' 个月 ' + age.days + ' 天'" :copy="false" />
        <PkRow label="出生至今" :value="age.totalDays + ' 天'" />
        <PkRow label="下次生日" :value="age.nextBirthdayIn === 0 ? '就是今天' : '还有 ' + age.nextBirthdayIn + ' 天'" />
        <PkRow label="生肖" :value="zodiac" :copy="false" />
        <PkRow label="星座" :value="constellation" :copy="false" />
      </template>
      <PkRow v-else-if="ageErr" label="提示" :value="ageErr" color="var(--pk-danger)" :copy="false" />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { formatDate, daysBetween, workdaysBetween, addDays, weekdayCN, ageFrom } from '@/utils/date'

const todayStr = formatDate(new Date(), 'YYYY-MM-DD')

const start = ref(formatDate(new Date(), 'YYYY-MM-01'))
const end = ref(todayStr)
const baseDate = ref(todayStr)
const offsetDays = ref('30')
const birth = ref('')
const refDate = ref('')

const quickStarts = [
  { n: '本月 1 号', v: formatDate(new Date(), 'YYYY-MM-01') },
  { n: '今年 1 月 1 日', v: formatDate(new Date(), 'YYYY-01-01') },
  { n: '半年前', v: formatDate(addDays(new Date(), -182), 'YYYY-MM-DD') },
]
const quickEnds = [
  { n: '本月底', v: formatDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), 'YYYY-MM-DD') },
  { n: '今年底', v: formatDate(new Date(), 'YYYY-12-31') },
]

function parseDate(s) {
  const raw = String(s).trim().replace(/\//g, '-').replace(/\./g, '-')
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

const diffState = computed(() => {
  const a = parseDate(start.value)
  const b = parseDate(end.value)
  if (!a || !b) {
    return {
      err: start.value && end.value ? '日期格式无法识别，建议写成 2026-09-20' : '',
      data: null,
    }
  }
  const raw = daysBetween(a, b)
  const reversed = raw < 0
  // gap = 相隔天数（半开区间，不含结束日）；span = 含首尾的天数。
  // 「9月1日到9月30日」按直觉是 30 天，所以展示以 span 为准；
  // gap 单列一行，把「相隔多少」和「共几天」两种问法分开，不再含糊。
  const gap = Math.abs(raw)
  const span = gap + 1
  const weeks = Math.floor(span / 7)
  const rem = span % 7
  const years = Math.floor(span / 365)
  const months = Math.floor((span % 365) / 30)
  const restDays = (span % 365) % 30
  // 工作日 / 休息日按含首尾算，两者之和正好等于 span
  const workdays = workdaysBetween(a, b, { inclusive: true })
  return {
    err: '',
    data: {
      gap,
      span,
      reversed,
      breakdown: years + ' 年 ' + months + ' 个月 ' + restDays + ' 天（按 365 天/年估算）',
      weeks: weeks + ' 周 ' + rem + ' 天',
      hours: String(span * 24),
      minutes: String(span * 24 * 60),
      seconds: String(span * 86400),
      workdays,
      weekendDays: span - workdays,
    },
  }
})

const diff = computed(() => diffState.value.data)
const err = computed(() => diffState.value.err)

function swap() {
  const t = start.value
  start.value = end.value
  end.value = t
}

function resetToday() {
  start.value = formatDate(new Date(), 'YYYY-MM-01')
  end.value = todayStr
}

const shiftResult = computed(() => {
  const b = parseDate(baseDate.value)
  const n = Number(offsetDays.value)
  if (!b || !isFinite(n)) return { date: '—', weekday: '', ts: '' }
  const d = addDays(b, n)
  return {
    date: formatDate(d, 'YYYY-MM-DD'),
    weekday: weekdayCN(d),
    ts: String(Math.floor(d.getTime() / 1000)),
  }
})

const ageState = computed(() => {
  if (!birth.value) return { err: '', data: null }
  const b = parseDate(birth.value)
  if (!b) return { err: '出生日期格式无法识别', data: null }
  const r = refDate.value ? parseDate(refDate.value) : new Date()
  if (!r) return { err: '参照日期格式无法识别', data: null }
  const result = ageFrom(b, r)
  if (result.years < 0 || result.years > 150) return { err: '日期超出合理范围', data: null }
  return { err: '', data: result }
})

const age = computed(() => ageState.value.data)
const ageErr = computed(() => ageState.value.err)

const zodiac = computed(() => {
  if (!age.value) return ''
  const names = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪']
  const d = parseDate(birth.value)
  const y = d.getFullYear()
  // 以立春附近（2 月 4 日）为界做粗略换算
  const idx = ((y - 4) % 12 + 12) % 12
  return names[idx]
})

const constellation = computed(() => {
  if (!age.value) return ''
  const d = parseDate(birth.value)
  const m = d.getMonth() + 1
  const day = d.getDate()
  const edges = [20, 19, 21, 20, 21, 22, 23, 23, 23, 24, 23, 22]
  const names = ['摩羯座', '水瓶座', '双鱼座', '白羊座', '金牛座', '双子座', '巨蟹座', '狮子座', '处女座', '天秤座', '天蝎座', '射手座', '摩羯座']
  return day < edges[m - 1] ? names[m - 1] : names[m]
})
</script>

<style scoped>
.quick-row {
  display: flex;
  flex-wrap: wrap;
  margin: 0 0 16rpx;
}
.quick-i {
  display: inline-block;
  font-size: 22rpx;
  color: var(--pk-accent);
  margin: 8rpx 14rpx 0 0;
  padding: 12rpx 20rpx;
  line-height: 1.3;
  border-radius: var(--pk-radius-sm);
  background: var(--pk-accent-soft);
}
.act-row {
  display: flex;
  gap: 20rpx;
}
</style>
