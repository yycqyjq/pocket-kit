<template>
  <view>
    <PkCard title="算哪种" accent="#6B5B95">
      <PkSeg v-model="sceneKey" :items="sceneItems" />
      <PkField v-model="v1" type="digit" :label="scene.labels[0]" />
      <PkField v-model="v2" type="digit" :label="scene.labels[1]" />
      <PkSeg v-if="sceneKey === 'tax'" v-model="taxMode" :items="taxModes" />
      <PkRow label="场景" :value="scene.hint" :copy="false" stack />
    </PkCard>

    <PkCard v-if="error" title="算不出来" accent="var(--pk-danger)">
      <PkRow label="原因" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <template v-if="!error && out">
      <PkCard title="结果" accent="var(--pk-accent)">
        <view class="hero">
          <text class="hero__t">{{ out.hero }}</text>
          <text class="hero__s">{{ out.heroLabel }}</text>
        </view>
        <PkRow
          v-for="r in out.rows"
          :key="r[0]"
          :label="r[0]"
          :value="r[1]"
          :copy="r[1] !== '—'"
        />
        <view v-if="out.warn" class="warn">
          <text class="warn__t">{{ out.warn }}</text>
        </view>
      </PkCard>

      <PkCard title="怎么算的" accent="#4A6FA5">
        <PkRow label="代入" :value="out.formula" :copy="false" stack />
        <PkRow label="结果" :value="out.explain" :copy="false" stack />
      </PkCard>
    </template>

    <PkCard title="别踩这几个坑" accent="var(--pk-warn)">
      <PkRow label="「涨了多少」" value="要看基数是哪个：从 100 涨到 120 是涨 20%，从 120 跌回 100 是跌 16.7%，不是对称的" :copy="false" stack />
      <PkRow label="百分数 vs 百分点" value="从 10% 到 15% 是「涨了 5 个百分点」，相对涨幅是 50%——两个说法完全不同" :copy="false" stack />
      <PkRow label="「比」字后面" value="「A 比 B 多百分之几」的基数是 B，不是 A，也不取两者平均" :copy="false" stack />
      <PkRow label="先降后升" value="200 先降 10% 再升 10% 得到的是 198，回不到 200" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import * as P from '@/utils/percent'
import { PERCENT_SCENES, PERCENT_DEFAULTS } from '@/utils/percent'

const sceneItems = PERCENT_SCENES.map((s) => ({ key: s.key, name: s.name }))
const taxModes = [
  { key: 'excl', name: '不含税 → 含税' },
  { key: 'incl', name: '含税 → 不含税' },
]

const sceneKey = ref('ratio')
const taxMode = ref('excl')
const v1 = ref(PERCENT_DEFAULTS.ratio[0])
const v2 = ref(PERCENT_DEFAULTS.ratio[1])

const scene = computed(() => PERCENT_SCENES.find((s) => s.key === sceneKey.value) || PERCENT_SCENES[0])

// 切场景时带上一组合理的默认值，避免用户面对空表单
watch(sceneKey, (k) => {
  const d = PERCENT_DEFAULTS[k]
  if (d) {
    v1.value = d[0]
    v2.value = d[1]
  }
})

const result = computed(() => {
  const a = v1.value
  const b = v2.value
  if (!String(a).trim() || !String(b).trim()) return { out: null, error: '' }
  try {
    return { out: build(sceneKey.value, a, b), error: '' }
  } catch (e) {
    return { out: null, error: e.message }
  }
})

const out = computed(() => result.value.out)
const error = computed(() => result.value.error)

function build(key, a, b) {
  if (key === 'ratio') {
    const r = P.ratio(a, b)
    return {
      hero: r.text, heroLabel: '占比',
      rows: [['算式', a + ' ÷ ' + b + ' × 100%'], ['反过来', a + ' 是 ' + b + ' 的 ' + r.text + '；' + b + ' 是 ' + a + ' 的 ' + r.inverse]],
      formula: a + ' ÷ ' + b + ' × 100%',
      explain: r.explain,
    }
  }
  if (key === 'value') {
    const r = P.percentOf(a, b)
    return {
      hero: r.text, heroLabel: a + ' 的 ' + b + '%',
      rows: [['剩下', r.rest]],
      formula: a + ' × ' + b + ' ÷ 100',
      explain: r.explain,
    }
  }
  if (key === 'change') {
    const r = P.changeRate(a, b)
    return {
      hero: r.text, heroLabel: r.up ? '上涨' : '下跌',
      rows: [['变化量', r.diff], ['倍数', r.multiple]],
      formula: '(' + b + ' − ' + a + ') ÷ |' + a + '| × 100%',
      explain: r.explain,
    }
  }
  if (key === 'apply') {
    const r = P.applyChange(a, b)
    return {
      hero: r.upText, heroLabel: a + ' 增加 ' + b + '%',
      rows: [['减少 ' + b + '%', r.downText], ['变化量', r.delta]],
      formula: a + ' × (1 ± ' + b + '%)',
      explain: r.explain,
    }
  }
  if (key === 'compare') {
    const r = P.compare(a, b)
    return {
      hero: r.text, heroLabel: '相对比较',
      rows: [['算式', '(' + a + ' − ' + b + ') ÷ |' + b + '| × 100%']],
      formula: '(' + a + ' − ' + b + ') ÷ |' + b + '| × 100%',
      explain: r.explain,
      warn: r.warn,
    }
  }
  if (key === 'discount') {
    const r = P.discount(a, b)
    return {
      hero: r.pay, heroLabel: '实付金额（打 ' + r.zhe + ' 折）',
      rows: [['原价', a], ['省下', r.saved], ['折扣写法', r.zhe + ' 折']],
      formula: a + ' × (1 − ' + b + '%)',
      explain: r.explain,
    }
  }
  if (key === 'points') {
    const r = P.pointsDiff(a, b)
    return {
      hero: r.text, heroLabel: '百分点差',
      rows: [['从', b + '%'], ['到', a + '%']],
      formula: a + '% − ' + b + '%',
      explain: r.explain,
      warn: r.warn,
    }
  }
  const r = P.tax(a, b, taxMode.value)
  return {
    hero: taxMode.value === 'excl' ? r.total : r.price,
    heroLabel: taxMode.value === 'excl' ? '含税合计' : '不含税金额',
    rows: [['不含税', r.price], ['税额', r.taxPart], ['含税', r.total]],
    formula: taxMode.value === 'excl' ? a + ' × (1 + ' + b + '%)' : a + ' ÷ (1 + ' + b + '%)',
    explain: r.explain,
  }
}
</script>

<style scoped>
.hero {
  display: flex;
  flex-direction: column;
  padding: 24rpx 24rpx 16rpx;
}
.hero__t {
  font-size: 48rpx;
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
.warn {
  margin: 8rpx 24rpx 16rpx;
  padding: 14rpx 18rpx;
  border-radius: var(--pk-radius-sm);
  background: rgba(168, 100, 47, 0.12);
}
.warn__t {
  font-size: 22rpx;
  color: var(--pk-warn);
  line-height: 1.7;
}
</style>
