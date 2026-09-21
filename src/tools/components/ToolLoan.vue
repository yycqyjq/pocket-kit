<template>
  <view>
    <PkCard title="贷款条件" accent="var(--pk-warn)">
      <PkSeg v-model="mode" :items="modes" />
      <PkField v-model="principal" type="digit" label="贷款金额（元）" placeholder="1000000" />
      <PkField v-model="rate" type="digit" label="年利率（%）" placeholder="3.85" />
      <PkField v-model="years" type="number" label="贷款年限（年）" placeholder="30" />
      <view class="quick">
        <text class="quick__t">快速填利率：</text>
        <text v-for="q in quickRates" :key="q.v" class="quick__i" @tap="rate = q.v">{{ q.n }}</text>
      </view>
    </PkCard>

    <PkCard v-if="error" title="提示" accent="var(--pk-danger)">
      <PkRow label="无法计算" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <template v-if="result">
      <PkCard title="还款概览" accent="var(--pk-accent)">
        <PkRow label="还款方式" :value="result.type" :copy="false" />
        <PkRow
          :label="mode === 'equal' ? '每月月供' : '首月月供'"
          :value="'¥ ' + money(result.firstMonthly)"
          big
        />
        <PkRow
          v-if="mode === 'capital'"
          label="末月月供"
          :value="'¥ ' + money(result.lastMonthly)"
        />
        <PkRow label="还款总额" :value="'¥ ' + money(result.totalPayment)" />
        <PkRow label="其中利息" :value="'¥ ' + money(result.totalInterest)" color="var(--pk-danger)" />
        <PkRow label="利息占比" :value="interestRatio" />
        <PkRow label="还款期数" :value="months + ' 期'" :copy="false" />
      </PkCard>

      <PkCard title="两种方式对比" accent="var(--pk-warn)">
        <view class="cmp">
          <view v-for="c in compare" :key="c.type" class="cmp__col" :class="{ 'cmp__col--on': c.type === result.type }">
            <text class="cmp__t">{{ c.type }}</text>
            <text class="cmp__v">{{ c.monthlyText }}</text>
            <text class="cmp__s">总利息 {{ money(c.totalInterest) }}</text>
            <text class="cmp__s">总额 {{ money(c.totalPayment) }}</text>
          </view>
        </view>
        <PkRow label="差额" :value="compareDiff" stack />
      </PkCard>

      <PkCard title="提前还款试算" accent="#6B5B95">
        <PkField v-model="prepayAt" type="number" label="在第几期后提前还款" placeholder="12" />
        <PkField v-model="prepayAmount" type="digit" label="一次性还款金额（元）" placeholder="100000" />
        <PkRow v-if="pre.valid && pre.payoff" label="结果" value="该笔金额已可结清剩余贷款" :copy="false" />
        <template v-else-if="pre.valid">
          <PkRow label="剩余本金（还款后）" :value="'¥ ' + money(pre.remainAfter)" />
          <PkRow label="月供不变可缩短" :value="pre.shortenMonths + ' 期'" color="var(--pk-accent)" />
          <PkRow label="期限不变新月供" :value="'¥ ' + money(pre.newMonthly)" />
          <PkRow label="月供可减少" :value="'¥ ' + money(pre.monthlyDrop)" color="var(--pk-accent)" />
          <PkRow label="可省利息" :value="'¥ ' + money(pre.savedInterest)" color="var(--pk-accent)" />
        </template>
        <PkRow v-else-if="pre.reason" label="提示" :value="pre.reason" :copy="false" />
      </PkCard>

      <PkCard title="还款计划" accent="#4A6FA5">
        <view class="plan-head">
          <text class="plan-head__c plan-head__c--1">期数</text>
          <text class="plan-head__c plan-head__c--2">月供</text>
          <text class="plan-head__c plan-head__c--3">本金</text>
          <text class="plan-head__c plan-head__c--4">利息</text>
        </view>
        <scroll-view scroll-y class="plan-body" :style="{ height: planHeight + 'px' }">
          <view v-for="row in visiblePlan" :key="row.period" class="plan-row">
            <text class="plan-row__c plan-row__c--1">{{ row.period }}</text>
            <text class="plan-row__c plan-row__c--2">{{ money(row.payment) }}</text>
            <text class="plan-row__c plan-row__c--3">{{ money(row.principal) }}</text>
            <text class="plan-row__c plan-row__c--4">{{ money(row.interest) }}</text>
          </view>
        </scroll-view>
        <view class="plan-more">
          <PkBtn
            :text="expanded ? '收起，只看前 12 期' : '展开全部 ' + months + ' 期'"
            kind="ghost"
            block
            @tap="expanded = !expanded"
          />
        </view>
      </PkCard>
    </template>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { equalInstallment, equalPrincipal, prepaymentEffect, money } from '@/utils/finance'

const modes = [
  { key: 'equal', name: '等额本息' },
  { key: 'capital', name: '等额本金' },
]

const quickRates = [
  { n: '公积金 2.85', v: '2.85' },
  { n: 'LPR 3.85', v: '3.85' },
  { n: '商贷 4.9', v: '4.9' },
]

const mode = ref('equal')
const principal = ref('1000000')
const rate = ref('3.85')
const years = ref('30')
const prepayAt = ref('12')
const prepayAmount = ref('100000')
const expanded = ref(false)
const planHeight = 420

const months = computed(() => {
  const y = Number(years.value)
  return y > 0 ? Math.round(y * 12) : 0
})

const error = ref('')

const result = computed(() => {
  error.value = ''
  const p = Number(principal.value)
  const r = Number(rate.value)
  const n = months.value
  if (!(p > 0)) {
    error.value = '请输入贷款金额'
    return null
  }
  if (!(n > 0)) {
    error.value = '请输入贷款年限'
    return null
  }
  if (!(r >= 0)) {
    error.value = '请输入有效的年利率'
    return null
  }
  if (n > 600) {
    error.value = '期数过多（超过 50 年）'
    return null
  }
  try {
    return mode.value === 'equal' ? equalInstallment(p, r, n) : equalPrincipal(p, r, n)
  } catch (e) {
    error.value = e.message || '计算失败'
    return null
  }
})

const interestRatio = computed(() => {
  if (!result.value) return '—'
  return ((result.value.totalInterest / result.value.totalPayment) * 100).toFixed(2) + '%'
})

const other = computed(() => {
  const p = Number(principal.value)
  const r = Number(rate.value)
  const n = months.value
  if (!(p > 0) || !(n > 0) || !(r >= 0)) return null
  try {
    return mode.value === 'equal' ? equalPrincipal(p, r, n) : equalInstallment(p, r, n)
  } catch (e) {
    return null
  }
})

const compare = computed(() => {
  if (!result.value) return []
  const list = [result.value]
  if (other.value) list.push(other.value)
  return list.map((x) => ({
    type: x.type,
    monthlyText: x.type === '等额本息' ? '每月 ' + money(x.monthly) : '首月 ' + money(x.firstMonthly),
    totalInterest: x.totalInterest,
    totalPayment: x.totalPayment,
  }))
})

const compareDiff = computed(() => {
  if (!result.value || !other.value) return '—'
  const a = result.value
  const b = other.value
  const d = b.totalInterest - a.totalInterest
  if (Math.abs(d) < 1) return '两种方式总利息基本持平'
  return d > 0
    ? '等额本息比等额本金多付利息 ¥ ' + money(d)
    : '等额本金比等额本息多付利息 ¥ ' + money(-d)
})

const pre = computed(() => {
  if (!result.value || mode.value !== 'equal') {
    return { valid: false, reason: mode.value === 'capital' ? '提前还款试算目前支持等额本息' : '' }
  }
  const p = Number(principal.value)
  const r = Number(rate.value)
  const n = months.value
  const k = Number(prepayAt.value)
  const x = Number(prepayAmount.value)
  if (!(k > 0) || !(x > 0)) return { valid: false, reason: '' }
  try {
    return prepaymentEffect(p, r, n, k, x)
  } catch (e) {
    return { valid: false, reason: e.message || '试算失败' }
  }
})

const visiblePlan = computed(() => {
  if (!result.value) return []
  return expanded.value ? result.value.schedule : result.value.schedule.slice(0, 12)
})
</script>

<style scoped>
.quick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  padding-top: 4rpx;
}
.quick__t {
  font-size: 24rpx;
  color: var(--pk-text-3);
}
.quick__i {
  display: inline-block;
  font-size: 24rpx;
  color: var(--pk-accent);
  margin: 8rpx 0 0 16rpx;
  padding: 12rpx 18rpx;
  line-height: 1.3;
  border-radius: var(--pk-radius-sm);
  background: var(--pk-accent-soft);
}
.cmp {
  display: flex;
  gap: 16rpx;
  padding: 4rpx 24rpx 16rpx;
}
.cmp__col {
  flex: 1;
  padding: 20rpx 18rpx;
  border-radius: var(--pk-radius-md);
  background: var(--pk-seg-bg);
  border: var(--pk-line-w) solid var(--pk-line);
  display: flex;
  flex-direction: column;
}
.cmp__col--on {
  border-color: var(--pk-accent);
  background: var(--pk-accent-soft);
}
.cmp__t {
  font-size: 24rpx;
  color: var(--pk-text-2);
  font-weight: 600;
}
.cmp__v {
  font-size: 28rpx;
  color: var(--pk-text);
  margin: 10rpx 0 8rpx;
  font-weight: 600;
}
.cmp__s {
  font-size: 22rpx;
  color: var(--pk-text-3);
  line-height: 1.7;
}
.plan-head {
  display: flex;
  padding: 6rpx 24rpx 12rpx;
}
.plan-head__c {
  /* 表头原来只有 21rpx（约 10.9px），手机上几乎看不清 */
  font-size: 24rpx;
  color: var(--pk-text-3);
}
.plan-head__c--1,
.plan-row__c--1 {
  width: 80rpx;
}
.plan-head__c--2,
.plan-row__c--2,
.plan-head__c--3,
.plan-row__c--3,
.plan-head__c--4,
.plan-row__c--4 {
  flex: 1;
  text-align: right;
}
.plan-body {
  width: 100%;
}
.plan-row {
  display: flex;
  /* 字号调大后行距也要跟着放开，否则四列数字挤成一团 */
  padding: 16rpx 24rpx;
  border-top: var(--pk-line-w) solid var(--pk-line);
}
.plan-row__c {
  /* 原来是 23rpx（约 12px），一屏四列带千分位的金额太吃力 */
  font-size: 26rpx;
  color: var(--pk-text-2);
  font-family: Menlo, Consolas, monospace;
}
.plan-more {
  padding: 16rpx 24rpx 24rpx;
}
</style>
