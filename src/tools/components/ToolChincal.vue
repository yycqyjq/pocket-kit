<template>
  <view>
    <PkCard title="公历 → 农历" accent="#7A4E6B" padded>
      <PkField v-model="solarInput" label="公历日期" placeholder="2025-01-29" :maxlength="10">
        <template #labelRight>
          <text class="mini-act" @tap="useToday">填今天</text>
        </template>
      </PkField>
      <PkField v-model="hourInput" type="number" label="钟点（0—23，用于干支纪时）" placeholder="14" :maxlength="2" />
      <view class="chips">
        <text v-for="q in quickDates" :key="q.n" class="chips__i" @tap="solarInput = q.v">{{ q.n }}</text>
      </view>
      <text class="tip">
        农历数据区间 {{ LUNAR_YEAR_FROM }}—{{ LUNAR_YEAR_TO }} 年，节气公式区间 1901—2100 年，超出会直接提示而不是硬算。
      </text>
      <PkRow v-if="solarError" label="提示" :value="solarError" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <template v-if="lunar">
      <PkCard title="历书摘要" accent="var(--pk-accent)">
        <template #extra>
          <text class="mini-act" @tap="copySummary">复制这一段</text>
        </template>
        <view class="hero">
          <text class="hero__big">{{ lunar.text }}</text>
          <text class="hero__sub">{{ lunar.shortText }}　{{ lunar.solar.text }}　{{ lunar.solar.weekday }}</text>
        </view>
        <view class="para">
          <text class="para__t">{{ summaryPara }}</text>
        </view>
        <PkRow label="农历串" :value="lunar.text" />
        <PkRow label="生肖" :value="'属' + lunar.zodiac + '（' + lunar.ganzhiYear + '年）'" :copy="false" />
        <PkRow label="干支年" :value="ganzhiYearDetail" mono />
        <PkRow label="干支月" :value="monthGzDetail" mono />
        <PkRow label="干支日" :value="dayGzDetail" mono />
        <PkRow label="干支时" :value="hourGzDetail" :copy="false" />
        <PkRow label="节气" :value="termDetail" :copy="false" stack />
        <PkRow label="节日" :value="lunar.festival || '当天没有收录的节日'" :copy="false" />
        <PkRow label="本农历月" :value="lunar.monthName + '共 ' + lunar.monthDays + ' 天，当天是' + lunar.dayName" :copy="false" stack />
        <PkRow label="本农历年" :value="yearDetail" :copy="false" stack />
        <PkRow label="公历年进度" :value="progressDetail" :copy="false" stack />
      </PkCard>

      <PkCard title="十二时辰对照" accent="var(--pk-accent)">
        <text class="tip">{{ hourNote }}</text>
        <view class="sc">
          <view v-for="(s, i) in SHICHEN" :key="s.zhi" class="sc__i" :class="{ 'sc__i--on': i === activeShichen }">
            <text class="sc__z">{{ s.zhi }}时</text>
            <text class="sc__r">{{ s.range }}</text>
          </view>
        </view>
        <text class="tip">高亮的是{{ hourGz ? '输入的 ' + hourInput + ' 点所在时辰' : '时辰未填，先在上面补一个 0—23 的钟点' }}。</text>
      </PkCard>

      <PkCard title="当年二十四节气" accent="var(--pk-accent)">
        <view class="nt">
          <text class="nt__k">下一个节气</text>
          <text class="nt__v">{{ nextTermText }}</text>
        </view>
        <view class="terms">
          <view v-for="t in terms" :key="t.index" class="terms__i" :class="{ 'terms__i--on': t.date === hitTermDate }">
            <text class="terms__n">{{ t.name }}</text>
            <text class="terms__d">{{ pad2(t.month) }}-{{ pad2(t.day) }}</text>
            <text class="terms__j" :class="{ 'terms__j--jie': t.isJie }">{{ t.isJie ? '节' : '气' }}</text>
          </view>
        </view>
        <text class="tip">
          一年固定 24 条，全部列出。「节」是干支纪月的分界（立春起寅月），中气不分管月切换。
          {{ terms.length ? terms[0].date.slice(0, 4) : '' }} 年共 {{ terms.length }} 条，其中带「节」的 12 条参与纪月推算。
        </text>
      </PkCard>
    </template>

    <PkCard title="农历 → 公历" accent="#7A4E6B" padded>
      <PkField v-model="l2Year" type="number" label="农历年" placeholder="2025" :maxlength="4" />
      <view v-if="l2Months.length" class="chips">
        <text
          v-for="m in l2Months"
          :key="m.name"
          class="chips__i"
          :class="{ 'chips__i--on': String(m.month) === l2Month && String(m.isLeap) === l2Leap }"
          @tap="pickMonth(m)"
        >{{ m.name }} {{ m.days }}天</text>
      </view>
      <view class="row2">
        <PkField v-model="l2Month" type="number" label="月（1—12）" placeholder="1" :maxlength="2" />
        <PkField v-model="l2Day" type="number" label="日（1—30）" placeholder="1" :maxlength="2" />
      </view>
      <PkSeg v-model="l2Leap" :items="leapItems" />
      <text class="tip">{{ l2YearHint }}</text>
      <PkRow v-if="l2Error" label="提示" :value="l2Error" color="var(--pk-danger)" :copy="false" stack />
      <template v-else-if="l2Result">
        <PkRow label="对应公历" :value="l2Result.solar.text" mono big />
        <PkRow label="星期" :value="l2Result.solar.weekday" :copy="false" />
        <PkRow label="农历" :value="l2Result.lunar.text" mono />
        <PkRow label="生肖" :value="'属' + l2Result.zodiac" :copy="false" />
        <PkRow label="干支年 / 干支日" :value="l2Result.ganzhiYear + '年 / ' + l2Result.ganzhiDay + '日'" mono />
        <PkRow label="距 1900-01-31" :value="l2Result.offsetFromBase + ' 天'" />
      </template>
    </PkCard>

    <PkCard title="生日与已过天数" accent="var(--pk-accent)" padded>
      <PkField v-model="birthInput" label="出生公历日期" placeholder="1995-08-17" :maxlength="10">
        <template #labelRight>
          <text class="mini-act" @tap="birthInput = todayStr">用今天</text>
        </template>
      </PkField>
      <text class="tip">参照日取本机今天的日期，改系统日期会跟着变；计算只用年月日，不受时区影响。</text>
      <PkRow v-if="birthError" label="提示" :value="birthError" color="var(--pk-danger)" :copy="false" stack />
      <template v-else-if="bday">
        <PkRow label="农历生日" :value="bday.sync.birthLunar.text" mono />
        <PkRow v-if="bday.sync.leapNote" label="闰月说明" :value="bday.sync.leapNote" color="var(--pk-warn)" :copy="false" stack />
        <PkRow label="下次农历生日" :value="nextLunarText" :copy="false" stack />
        <PkRow v-if="bday.nl && bday.nl.note" label="顺延提示" :value="bday.nl.note" color="var(--pk-warn)" :copy="false" stack />
        <PkRow label="下次公历生日" :value="nextSolarText" :copy="false" />
        <PkRow label="已经过了" :value="livedText" :copy="false" stack />
        <PkRow label="万天节点" :value="tenThousandText" :copy="false" stack />
      </template>
    </PkCard>

    <PkCard title="数据口径与精度" accent="var(--pk-warn)">
      <view class="src">
        <text class="src__k">农历数据</text>
        <text class="src__v">{{ LUNAR_DATA_SOURCE }}</text>
      </view>
      <view class="src">
        <text class="src__k">节气算法</text>
        <text class="src__v">{{ SOLAR_TERM_SOURCE }}</text>
      </view>
      <view class="src">
        <text class="src__k">支持区间</text>
        <text class="src__v">农历 {{ LUNAR_YEAR_FROM }}—{{ LUNAR_YEAR_TO }} 年；节气公式 1901—2100 年</text>
      </view>
      <view class="src">
        <text class="src__k">精度提示</text>
        <text class="src__v">{{ termNote }}</text>
      </view>
      <view class="src">
        <text class="src__k">干支口径</text>
        <text class="src__v">{{ hourNote }}</text>
      </view>
      <view class="act">
        <PkBtn text="复制口径说明" kind="soft" @tap="copySources" />
      </view>
      <text class="tip">以上均为公式与查表推算，历书内容仅供日常参考，不构成命理、医疗或法律建议。</text>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  solarToLunar,
  lunarToSolar,
  lunarMonthsOf,
  lunarYearProfile,
  solarTermsOfYear,
  nextSolarTerm,
  ganzhiOfYear,
  ganzhiOfMonth,
  ganzhiOfDay,
  ganzhiOfHour,
  doubleHourOf,
  calendarSummary,
  birthdaySync,
  daysLived,
  SHICHEN,
  SOLAR_TERM_SOURCE,
  LUNAR_DATA_SOURCE,
  LUNAR_YEAR_FROM,
  LUNAR_YEAR_TO,
} from '@/utils/chincal'
import { copyText } from '@/utils/clipboard'

const FALLBACK_NOTE = '公式近似推算，个别年份与天文时刻可能相差 1 天'

function pad2(n) {
  return (n < 10 ? '0' : '') + n
}

function fmtDate(p) {
  return p.year + '-' + pad2(p.month) + '-' + pad2(p.day)
}

function todayParts() {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours() }
}

function parseDate(s) {
  const t = String(s || '').trim().replace(/[/.]/g, '-')
  const m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

function intOf(v) {
  const n = Math.round(Number(v))
  return isFinite(n) ? n : NaN
}

const today = todayParts()
const todayStr = fmtDate(today)
const spring = computed(() => {
  try {
    const r = lunarYearProfile(today.year)
    return r.springFestival ? fmtDate(r.springFestival) : ''
  } catch (e) {
    return ''
  }
})

const solarInput = ref(todayStr)
const hourInput = ref(String(today.hour))

const quickDates = computed(() => {
  const list = [{ n: '今天', v: todayStr }]
  if (spring.value) list.push({ n: '今年春节', v: spring.value })
  return list
})

const parsed = computed(() => {
  const p = parseDate(solarInput.value)
  if (!p) return { error: '日期请按 ' + todayStr + ' 这种写法填' }
  if (p.year < LUNAR_YEAR_FROM || p.year > LUNAR_YEAR_TO) {
    return { error: '农历数据只覆盖 ' + LUNAR_YEAR_FROM + '—' + LUNAR_YEAR_TO + ' 年，当前是 ' + p.year + ' 年' }
  }
  try {
    return {
      date: p,
      lunar: solarToLunar(p.year, p.month, p.day),
      sum: calendarSummary(p.year, p.month, p.day),
      error: '',
    }
  } catch (e) {
    return { error: e.message || '这个日期算不出来' }
  }
})
const lunar = computed(() => parsed.value.lunar || null)
const sum = computed(() => parsed.value.sum || null)
const solarError = computed(() => parsed.value.error)

const hourGz = computed(() => {
  const p = parsed.value.date
  if (!p) return null
  const h = intOf(hourInput.value)
  if (!isFinite(h) || h < 0 || h > 23) return null
  try {
    return ganzhiOfHour(p.year, p.month, p.day, h)
  } catch (e) {
    return null
  }
})
const activeShichen = computed(() => {
  const h = intOf(hourInput.value)
  if (!isFinite(h) || h < 0 || h > 23) return -1
  return doubleHourOf(h)
})
const hourNote = computed(() => (hourGz.value ? hourGz.value.note : '干支纪时用「五鼠遁日起时」，' + FALLBACK_NOTE + '；日辰边界按 23:00 口径。'))

const gzYear = computed(() => (lunar.value ? ganzhiOfYear(lunar.value.lunarYear) : null))
const gzMonth = computed(() => {
  const p = parsed.value.date
  if (!p) return null
  try {
    return ganzhiOfMonth(p.year, p.month, p.day)
  } catch (e) {
    return null
  }
})
const gzDay = computed(() => {
  const p = parsed.value.date
  if (!p) return null
  return ganzhiOfDay(p.year, p.month, p.day)
})

const ganzhiYearDetail = computed(() => {
  if (!gzYear.value) return ''
  const g = gzYear.value
  return g.ganzhi + '（第 ' + (g.index + 1) + ' 位，' + g.gan + g.zhi + '，属' + g.zodiac + '）'
})
const monthGzDetail = computed(() => {
  if (!gzMonth.value) return ''
  return gzMonth.value.ganzhi + '（自 ' + gzMonth.value.since + ' ' + gzMonth.value.term + ' 起，寅月起第 ' + gzMonth.value.monthFromYin + ' 个月）'
})
const dayGzDetail = computed(() => {
  if (!gzDay.value) return ''
  return gzDay.value.ganzhi + '（六十循环第 ' + (gzDay.value.index + 1) + ' 位，儒略日序 ' + gzDay.value.jdn + '）'
})
const hourGzDetail = computed(() => {
  if (!hourGz.value) return '钟点没填或不在 0—23 之间'
  return hourGz.value.ganzhi + '时（' + hourGz.value.shichen + ' ' + hourGz.value.range + '，日辰 ' + hourGz.value.dayGanzhi + '）'
})

const term = computed(() => (lunar.value ? lunar.value.solarTerm : null))
const termNote = computed(() => (term.value && term.value.note) || FALLBACK_NOTE)
const termDetail = computed(() => {
  const t = term.value
  if (!t) return ''
  if (!t.name) return t.note || FALLBACK_NOTE
  if (!t.next) return '当前处于' + t.name + '（自 ' + t.since + '）之后第 ' + t.passedDays + ' 天；' + t.note
  return (
    t.name + ' 后第 ' + t.passedDays + ' 天（' + t.since + ' 起），距 ' + t.next + '（' + t.nextDate + '）还有 ' +
    t.daysToNext + ' 天，本节气已过 ' + t.progress + '%。' + t.note
  )
})
const hitTermDate = computed(() => {
  const t = term.value
  return t && t.since ? t.since : ''
})

const terms = computed(() => {
  const p = parsed.value.date
  const y = p ? p.year : today.year
  try {
    return solarTermsOfYear(y)
  } catch (e) {
    return []
  }
})
const nextTerm = computed(() => {
  const p = parsed.value.date
  if (!p) return null
  try {
    return nextSolarTerm(p.year, p.month, p.day)
  } catch (e) {
    return null
  }
})
const nextTermText = computed(() => {
  const n = nextTerm.value
  if (!n) return '该日期不在节气公式区间（1901—2100）内，或已是范围内最后一个节气'
  return n.name + '　' + n.date + '　还有 ' + n.daysAway + ' 天' + (n.daysAway === 0 ? '（就是今天）' : '')
})

const yearProfile = computed(() => {
  if (!lunar.value) return null
  try {
    return lunarYearProfile(lunar.value.lunarYear)
  } catch (e) {
    return null
  }
})
const yearDetail = computed(() => {
  const pr = yearProfile.value
  if (!pr) return ''
  const leap = pr.leapMonth
    ? '闰' + pr.leapMonthName + '（' + pr.leapMonthDays + ' 天）'
    : '无闰月（平年）'
  return (
    pr.year + ' 年 ' + pr.ganzhi + '年·属' + pr.zodiac + '，' + leap + '，全年 ' + pr.days + ' 天；' +
    '春节 ' + (pr.springFestival ? pr.springFestival.text : '—') + '，含 ' + pr.months.length + ' 个历月'
  )
})
const progressDetail = computed(() => {
  const s = sum.value
  if (!s) return ''
  return (
    s.solar.year + ' 年是' + (s.leapYear ? '闰年' : '平年') + '，当天是第 ' + s.dayOfYear + ' 天，还剩 ' +
    s.daysLeftInYear + ' 天；' + s.weekdayCn
  )
})

const summaryPara = computed(() => {
  const l = lunar.value
  if (!l) return ''
  const parts = []
  parts.push(l.solar.text + '（' + l.solar.weekday + '）＝ ' + l.text + '，属' + l.zodiac)
  const pillars = [l.ganzhiYear + '年', gzMonth.value ? gzMonth.value.ganzhi + '月' : '', l.ganzhiDay + '日', hourGz.value ? hourGz.value.ganzhi + '时' : '']
  parts.push('四柱 ' + pillars.filter((x) => x).join(' '))
  if (term.value && term.value.name && term.value.name !== '—') {
    parts.push('节令在' + term.value.name + '之后第 ' + term.value.passedDays + ' 天')
  }
  parts.push(l.festival ? '当天是' + l.festival : '当天没有收录的节日')
  const pr = yearProfile.value
  if (pr) {
    parts.push(
      '农历' + pr.year + '年' + (pr.leapMonth ? '闰' + pr.leapMonth + '月' : '无闰月') + '，全年 ' + pr.days + ' 天'
    )
  }
  parts.push(FALLBACK_NOTE)
  return parts.join('；') + '。'
})

/* ---------------------------------------------------------- 农历 → 公历 */
const l2Year = ref(String(today.year))
const l2Month = ref('1')
const l2Day = ref('1')
const l2Leap = ref('false')
const leapItems = [
  { key: 'false', name: '平月' },
  { key: 'true', name: '闰月' },
]

const l2Months = computed(() => {
  const y = intOf(l2Year.value)
  if (!isFinite(y) || y < LUNAR_YEAR_FROM || y > LUNAR_YEAR_TO) return []
  try {
    return lunarMonthsOf(y)
  } catch (e) {
    return []
  }
})
const l2YearHint = computed(() => {
  const pr = l2Months.value.length ? yearProfileOf(intOf(l2Year.value)) : null
  if (!pr) return '先把农历年填在 ' + LUNAR_YEAR_FROM + '—' + LUNAR_YEAR_TO + ' 之间'
  return (
    pr.year + ' 年' + (pr.leapMonth ? '在' + pr.leapMonthName + '之后插闰' + pr.leapMonth + '月（' + pr.leapMonthDays + ' 天）' : '没有闰月') +
    '，全年 ' + pr.days + ' 天；不存在的闰月会直接报错。'
  )
})
function yearProfileOf(y) {
  try {
    return lunarYearProfile(y)
  } catch (e) {
    return null
  }
}
function pickMonth(m) {
  l2Month.value = String(m.month)
  l2Leap.value = String(m.isLeap)
}

const l2Result = computed(() => {
  const y = intOf(l2Year.value)
  const m = intOf(l2Month.value)
  const d = intOf(l2Day.value)
  if (!isFinite(y) || !isFinite(m) || !isFinite(d)) return null
  if (y < LUNAR_YEAR_FROM || y > LUNAR_YEAR_TO) return null
  try {
    return lunarToSolar(y, m, d, l2Leap.value === 'true')
  } catch (e) {
    return null
  }
})
const l2Error = computed(() => {
  const y = intOf(l2Year.value)
  const m = intOf(l2Month.value)
  const d = intOf(l2Day.value)
  if (!isFinite(y) || !isFinite(m) || !isFinite(d)) return '农历年月日都要填整数'
  if (y < LUNAR_YEAR_FROM || y > LUNAR_YEAR_TO) {
    return '农历年只支持 ' + LUNAR_YEAR_FROM + '—' + LUNAR_YEAR_TO + ' 年，当前是 ' + y + ' 年'
  }
  try {
    lunarToSolar(y, m, d, l2Leap.value === 'true')
    return ''
  } catch (e) {
    return e.message || '这个农历日期不存在'
  }
})

/* ---------------------------------------------------------- 生日 */
const birthInput = ref('1995-08-17')
const bday = computed(() => {
  const b = parseDate(birthInput.value)
  if (!b) return null
  if (b.year < LUNAR_YEAR_FROM || b.year > LUNAR_YEAR_TO) return null
  if (fmtDate(b) > todayStr) return null
  try {
    const sync = birthdaySync(b, today)
    return { sync, nl: sync.nextLunar, lived: daysLived(b, today) }
  } catch (e) {
    return { error: e.message || '生日算不出来' }
  }
})
const birthError = computed(() => {
  const b = parseDate(birthInput.value)
  if (!b) return '出生日期请按 1995-08-17 这种写法填'
  if (b.year < LUNAR_YEAR_FROM || b.year > LUNAR_YEAR_TO) {
    return '农历数据只覆盖 ' + LUNAR_YEAR_FROM + '—' + LUNAR_YEAR_TO + ' 年'
  }
  if (fmtDate(b) > todayStr) return '出生日期晚于今天，先把日期改回来'
  const r = bday.value
  return r && r.error ? r.error : ''
})
const nextLunarText = computed(() => {
  const nl = bday.value && bday.value.nl
  if (!nl) return '往后 130 个农历年里没找到对应日期（多半是腊月三十这种短月末日）'
  return nl.solar.text + ' ' + nl.weekday + '（' + nl.lunar.text + '）还有 ' + nl.daysAway + ' 天，约 ' + nl.weeksAway + ' 周'
})
const nextSolarText = computed(() => {
  const ns = bday.value && bday.value.sync.nextSolar
  if (!ns) return '—'
  return ns.solar.text + ' 还有 ' + ns.daysAway + ' 天，满 ' + ns.age + ' 岁'
})
const livedText = computed(() => {
  const lv = bday.value && bday.value.lived
  if (!lv) return ''
  return lv.days + ' 天 · ' + lv.weeks + ' 周 · 约 ' + lv.months + ' 个平均月 · 约 ' + lv.years.toFixed(2) + ' 年'
})
const tenThousandText = computed(() => {
  const lv = bday.value && bday.value.lived
  if (!lv) return ''
  const d = Math.round(Math.abs(lv.tenThousand) * 1000)
  return lv.tenThousand > 0 ? '距满 10000 天还有约 ' + d + ' 天' : '已过 10000 天，超出约 ' + d + ' 天'
})

function useToday() {
  solarInput.value = todayStr
  hourInput.value = String(new Date().getHours())
}

function copySummary() {
  const lines = [
    summaryPara.value,
    '节气：' + termDetail.value,
    '本农历年：' + yearDetail.value,
    '精度：' + termNote.value,
  ]
  copyText(lines.join('\n'), '已复制历书摘要')
}

function copySources() {
  copyText(
    [
      '农历数据：' + LUNAR_DATA_SOURCE,
      '节气算法：' + SOLAR_TERM_SOURCE,
      '支持区间：农历 ' + LUNAR_YEAR_FROM + '—' + LUNAR_YEAR_TO + ' 年，节气 1901—2100 年',
      '精度：' + termNote.value,
      '干支：' + hourNote.value,
      '仅供日常参考，不构成命理、医疗或法律建议。',
    ].join('\n'),
    '已复制口径说明'
  )
}
</script>

<style scoped>
.mini-act {
  font-size: 23rpx;
  color: var(--pk-accent);
}
.tip {
  display: block;
  font-size: 21rpx;
  line-height: 1.8;
  color: var(--pk-text-3);
  padding: 10rpx 0 4rpx;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  margin-top: 4rpx;
}
.chips__i {
  display: inline-block;
  font-size: 22rpx;
  color: var(--pk-accent);
  margin: 8rpx 12rpx 0 0;
  padding: 12rpx 18rpx;
  line-height: 1.3;
  border-radius: 10rpx;
  background: var(--pk-accent-soft);
}
.chips__i--on {
  color: var(--pk-on-accent);
  background: var(--pk-accent);
}
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 26rpx 24rpx 12rpx;
}
.hero__big {
  font-size: 52rpx;
  font-weight: 600;
  color: var(--pk-text);
  letter-spacing: 4rpx;
}
.hero__sub {
  font-size: 23rpx;
  color: var(--pk-text-3);
  margin-top: 12rpx;
}
.para {
  padding: 6rpx 24rpx 16rpx;
}
.para__t {
  font-size: 25rpx;
  line-height: 1.9;
  color: var(--pk-text-2);
}
.sc {
  display: flex;
  flex-wrap: wrap;
  padding: 6rpx 16rpx 12rpx;
}
.sc__i {
  width: 33.33%;
  padding: 14rpx 8rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-radius: 12rpx;
}
.sc__i--on {
  background: var(--pk-accent-soft);
}
.sc__z {
  font-size: 25rpx;
  color: var(--pk-text);
}
.sc__i--on .sc__z {
  color: var(--pk-accent);
  font-weight: 600;
}
.sc__r {
  font-size: 20rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
}
.nt {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 8rpx 24rpx 14rpx;
}
.nt__k {
  font-size: 23rpx;
  color: var(--pk-text-3);
}
.nt__v {
  font-size: 27rpx;
  color: var(--pk-accent);
  font-weight: 600;
  text-align: right;
  flex: 1;
  margin-left: 16rpx;
}
.terms {
  display: flex;
  flex-wrap: wrap;
  padding: 0 16rpx;
}
.terms__i {
  width: 25%;
  display: flex;
  align-items: center;
  padding: 12rpx 8rpx;
  border-radius: 10rpx;
}
.terms__i--on {
  background: var(--pk-accent-soft);
}
.terms__n {
  font-size: 24rpx;
  color: var(--pk-text);
}
.terms__d {
  font-size: 20rpx;
  color: var(--pk-text-3);
  margin-left: 8rpx;
  font-family: Menlo, Consolas, monospace;
}
.terms__j {
  font-size: 19rpx;
  color: var(--pk-text-3);
  margin-left: auto;
}
.terms__j--jie {
  color: var(--pk-warn);
}
.row2 {
  display: flex;
  gap: 18rpx;
}
.src {
  display: flex;
  flex-direction: column;
  padding: 14rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.src__k {
  font-size: 22rpx;
  color: var(--pk-text-3);
}
.src__v {
  font-size: 24rpx;
  color: var(--pk-text-2);
  line-height: 1.8;
  margin-top: 6rpx;
}
.act {
  display: flex;
  padding: 18rpx 24rpx 6rpx;
}
</style>
