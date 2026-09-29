<template>
  <view>
    <PkCard title="算什么" accent="#3E7A4E">
      <PkSeg v-model="mode" :items="modeItems" />

      <template v-if="mode === 'once'">
        <PkField v-model="principal" type="digit" label="一次性投入（元）" />
        <PkField v-model="rate" type="digit" label="年化收益率 %" />
        <PkField v-model="years" type="digit" label="年限" />
        <PkSeg v-model="freq" :items="freqItems" />
      </template>

      <template v-else-if="mode === 'monthly'">
        <PkField v-model="initial" type="digit" label="初始本金（元，可填 0）" />
        <PkField v-model="monthly" type="digit" label="每月投入（元）" />
        <PkField v-model="rate" type="digit" label="年化收益率 %" />
        <PkField v-model="years" type="digit" label="年限" />
      </template>

      <template v-else>
        <PkField v-model="initial" type="digit" label="期初金额（元）" />
        <PkField v-model="target" type="digit" label="期末金额（元）" />
        <PkField v-model="years" type="digit" label="年限" />
      </template>

      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <template v-if="!error && out">
      <PkCard title="结果" accent="var(--pk-accent)">
        <view class="hero">
          <text class="hero__t">{{ out.hero }}</text>
          <text class="hero__s">{{ out.heroLabel }}</text>
        </view>
        <PkRow v-for="r in out.rows" :key="r[0]" :label="r[0]" :value="r[1]" />
        <view v-if="out.tip" class="tip-box">
          <text class="tip-box__t">{{ out.tip }}</text>
        </view>
      </PkCard>

      <PkCard v-if="schedule.length" title="逐年明细" accent="#4A6FA5">
        <view class="sched">
          <view class="sched__head">
            <text class="sched__c1">年</text>
            <text class="sched__c">累计投入</text>
            <text class="sched__c">累计收益</text>
            <text class="sched__c">期末余额</text>
          </view>
          <view v-for="s in schedule" :key="s.year" class="sched__row">
            <text class="sched__c1">{{ s.year }}</text>
            <text class="sched__c">{{ money(s.invested) }}</text>
            <text class="sched__c sched__c--gain">{{ money(s.interest) }}</text>
            <text class="sched__c">{{ money(s.balance) }}</text>
          </view>
        </view>
      </PkCard>
    </template>

    <PkCard title="口径说明" accent="var(--pk-warn)">
      <PkRow v-for="(n, i) in INVEST_NOTES" :key="i" :label="'第 ' + (i + 1) + ' 条'" :value="n" :copy="false" stack />
      <PkRow label="名义 vs 实际" value="这里算的是名义收益，没有扣通胀。想算实际购买力，把「收益率」改成「收益率 − 通胀率」即可" :copy="false" stack />
      <PkRow label="月收益率" value="按年化 ÷ 12 近似，与真正的「(1+年化)^(1/12) − 1」有一点差异，短期可忽略" :copy="false" stack />
    </PkCard>

    <PkCard title="72 法则" accent="#6B5B95">
      <PkField v-model="r72" type="digit" label="年化收益率 %" placeholder="8" />
      <PkRow label="估算翻倍年数" :value="rule72Out" big :copy="false" />
      <PkRow label="原理" value="用 72 除以年化收益率，就能估算本金翻倍需要多少年。6%~10% 区间最准，利率越高误差越大" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { compoundOnce, monthlyPlan, annualizedReturn, rule72, INVEST_NOTES } from '@/utils/invest'
import { money } from '@/utils/finance'

const modeItems = [
  { key: 'once', name: '一次性' },
  { key: 'monthly', name: '每月定投' },
  { key: 'reverse', name: '反推年化' },
]
const freqItems = [
  { key: '12', name: '按月复利' },
  { key: '4', name: '按季复利' },
  { key: '1', name: '按年复利' },
  { key: '365', name: '按日复利' },
]

const mode = ref('once')
const principal = ref('100000')
const initial = ref('0')
const monthly = ref('2000')
const rate = ref('6')
const years = ref('10')
const target = ref('200000')
const freq = ref('12')
const r72 = ref('8')

const result = computed(() => {
  try {
    if (mode.value === 'once') {
      const r = compoundOnce({ principal: principal.value, annualRate: rate.value, years: years.value, timesPerYear: Number(freq.value) })
      return {
        schedule: [],
        out: {
          hero: money(r.final) + ' 元',
          heroLabel: years.value + ' 年后',
          rows: [
            ['投入本金', money(Number(principal.value)) + ' 元'],
            ['收益', money(r.profit) + ' 元'],
            ['收益率', Number(r.profitRate.toFixed(2)) + '%'],
            ['有效年利率', Number(r.effectiveAnnual.toFixed(3)) + '%'],
            ['复利期数', r.periods + ' 期'],
          ],
          tip: '',
        },
      }
    }
    if (mode.value === 'monthly') {
      const r = monthlyPlan({ monthly: monthly.value, annualRate: rate.value, years: years.value, initial: initial.value })
      return {
        schedule: r.schedule,
        out: {
          hero: money(r.final) + ' 元',
          heroLabel: years.value + ' 年后',
          rows: [
            ['累计投入', money(r.invested) + ' 元'],
            ['累计收益', money(r.profit) + ' 元'],
            ['收益率', Number(r.profitRate.toFixed(2)) + '%'],
            ['投入月数', r.months + ' 个月'],
          ],
          tip: '投得越早，同样的钱复利时间越长。上表里「累计收益」那一列增长会越来越快，那就是复利。',
        },
      }
    }
    const r = annualizedReturn(initial.value, target.value, years.value)
    return {
      schedule: [],
      out: {
        hero: Number(r.annual.toFixed(3)) + '%',
        heroLabel: '年化收益率',
        rows: [
          ['累计收益', Number(r.total.toFixed(2)) + '%'],
          ['总倍数', Number(r.multiple.toFixed(3)) + ' 倍'],
          ['换算', r.text],
        ],
        tip: '',
      },
    }
  } catch (e) {
    return { schedule: [], out: null, error: e.message }
  }
})

const out = computed(() => (result.value ? result.value.out : null))
const schedule = computed(() => (result.value ? result.value.schedule : []))
const error = computed(() => (result.value ? result.value.error || '' : ''))

const rule72Out = computed(() => {
  try {
    const r = rule72(r72.value)
    return r.years.toFixed(1) + ' 年（精确 ' + r.exact.toFixed(1) + ' 年）'
  } catch (e) {
    return '—'
  }
})
</script>

<style scoped>
.hero {
  display: flex;
  flex-direction: column;
  padding: 24rpx 24rpx 16rpx;
}
.hero__t {
  font-size: 46rpx;
  font-weight: 700;
  color: var(--pk-text);
  line-height: 1.2;
  font-family: Menlo, Consolas, monospace;
  word-break: break-all;
}
.hero__s {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 10rpx;
}
.tip-box {
  margin: 10rpx 24rpx 16rpx;
  padding: 14rpx 18rpx;
  border-radius: var(--pk-radius-sm);
  background: var(--pk-accent-soft);
}
.tip-box__t {
  font-size: 22rpx;
  color: var(--pk-accent);
  line-height: 1.7;
}
.sched {
  padding: 4rpx 0 14rpx;
}
.sched__head {
  display: flex;
  padding: 12rpx 24rpx;
  border-bottom: 2rpx solid var(--pk-line-strong);
}
.sched__row {
  display: flex;
  padding: 12rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.sched__c1 {
  width: 60rpx;
  font-size: 22rpx;
  color: var(--pk-text-3);
  font-family: Menlo, Consolas, monospace;
}
.sched__c {
  flex: 1;
  font-size: 22rpx;
  color: var(--pk-text-2);
  font-family: Menlo, Consolas, monospace;
  text-align: right;
}
.sched__head .sched__c {
  color: var(--pk-text-3);
}
.sched__c--gain {
  color: var(--pk-accent);
}
</style>
