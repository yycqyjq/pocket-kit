<template>
  <view>
    <PkCard title="基本信息" accent="#3E7A4E">
      <PkSeg v-model="gender" :items="genders" />
      <PkField v-model="height" type="digit" label="身高（厘米）" placeholder="170" />
      <PkField v-model="weight" type="digit" label="体重（公斤）" placeholder="65" />
      <PkField v-model="age" type="number" label="年龄（岁）" placeholder="28" />
    </PkCard>

    <PkCard v-if="error" title="提示" accent="var(--pk-danger)">
      <PkRow label="无法计算" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <template v-if="bmi">
      <PkCard title="体型评估" accent="var(--pk-accent)">
        <view class="bmi-hero">
          <text class="bmi-hero__v">{{ bmi.value.toFixed(1) }}</text>
          <text class="bmi-hero__k">BMI</text>
          <view class="bmi-hero__tag" :style="{ background: toneColor }">
            <text class="bmi-hero__tag-t">{{ bmi.label }}</text>
          </view>
        </view>
        <view class="scale">
          <view class="scale__bar">
            <view
              v-for="seg in scaleSegments"
              :key="seg.label"
              class="scale__seg"
              :style="{ flex: seg.flex, background: seg.color }"
            ></view>
          </view>
          <view class="scale__marks">
            <text class="scale__m">18.5</text>
            <text class="scale__m">24</text>
            <text class="scale__m">28</text>
          </view>
        </view>
        <PkRow label="中国成人标准" value="偏瘦 < 18.5 ≤ 正常 < 24 ≤ 超重 < 28 ≤ 肥胖" :copy="false" stack />
        <PkRow label="理想体重区间" :value="idealText" />
        <PkRow v-if="bmi.toNormal > 0" label="距正常范围还需减" :value="bmi.toNormal.toFixed(1) + ' 公斤'" color="var(--pk-danger)" />
        <PkRow v-else-if="bmi.toNormal < 0" label="距正常范围还需增" :value="Math.abs(bmi.toNormal).toFixed(1) + ' 公斤'" color="var(--pk-warn)" />
      </PkCard>

      <PkCard title="能量代谢" accent="#4A6FA5">
        <PkSeg v-model="activity" :items="activityItems" />
        <PkRow label="基础代谢（BMR）" :value="Math.round(bmrValue) + ' 千卡/天'" big />
        <PkRow label="每日消耗（TDEE）" :value="Math.round(tdeeValue) + ' 千卡/天'" big color="var(--pk-accent)" />
        <PkRow :label="'按「' + activityName + '」估算'" :value="activityDesc + ' × ' + activityFactor" :copy="false" />
        <view class="goal">
          <view v-for="g in goals" :key="g.k" class="goal__i">
            <text class="goal__k">{{ g.k }}</text>
            <text class="goal__v">{{ g.v }}</text>
          </view>
        </view>
      </PkCard>

      <PkCard title="体成分与日常" accent="#6B5B95">
        <PkRow label="估算体脂率" :value="fat.toFixed(1) + '%　' + fatLabel" />
        <PkRow label="每日建议饮水" :value="water.ml + ' 毫升（约 ' + water.cups + ' 杯）'" />
        <PkField v-model="waist" type="digit" label="腰围（厘米，可选）" placeholder="80" />
        <PkRow v-if="ratio" label="腰高比" :value="ratio.value.toFixed(2) + '　' + ratio.label" />
      </PkCard>

      <view class="note">
        <text class="note__t">以上均为公式估算值（BMI 采用中国成人标准，BMR 采用 Mifflin-St Jeor 公式，体脂率采用 Deurenberg 公式），仅供日常参考，不构成医学建议。</text>
      </view>
    </template>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  bmi as calcBmi,
  bmr as calcBmr,
  tdee as calcTdee,
  bodyFat,
  bodyFatLabel,
  waterIntake,
  waistRatio,
  ACTIVITY_LEVELS,
} from '@/utils/health'

const genders = [
  { key: 'male', name: '男' },
  { key: 'female', name: '女' },
]

const activityItems = ACTIVITY_LEVELS.map((l) => ({ key: l.key, name: l.name }))

const gender = ref('male')
const height = ref('170')
const weight = ref('65')
const age = ref('28')
const waist = ref('')
const activity = ref('light')

const bmiCalc = computed(() => {
  try {
    return { out: calcBmi(Number(weight.value), Number(height.value)), err: '' }
  } catch (e) {
    return { out: null, err: e.message }
  }
})
const bmi = computed(() => bmiCalc.value.out)
const error = computed(() => bmiCalc.value.err)

const toneColor = computed(() => {
  if (!bmi.value) return 'var(--pk-accent)'
  return { ok: 'var(--pk-accent)', warn: 'var(--pk-warn)', bad: 'var(--pk-danger)' }[bmi.value.tone] || 'var(--pk-accent)'
})

const scaleSegments = computed(() => [
  { label: '偏瘦', flex: 18.5, color: '#7FA8C9' },
  { label: '正常', flex: 5.5, color: 'var(--pk-accent)' },
  { label: '超重', flex: 4, color: '#C99A4B' },
  { label: '肥胖', flex: 6, color: 'var(--pk-danger)' },
])

const idealText = computed(() => {
  try {
    const h = Number(height.value) / 100
    if (!(h > 0)) return '—'
    return (18.5 * h * h).toFixed(1) + ' ~ ' + (23.9 * h * h).toFixed(1) + ' 公斤'
  } catch (e) {
    return '—'
  }
})

const bmrValue = computed(() => {
  try {
    return calcBmr(Number(weight.value), Number(height.value), Number(age.value), gender.value)
  } catch (e) {
    return 0
  }
})

const activityObj = computed(() => ACTIVITY_LEVELS.find((l) => l.key === activity.value) || ACTIVITY_LEVELS[0])
const activityName = computed(() => activityObj.value.name)
const activityDesc = computed(() => activityObj.value.desc)
const activityFactor = computed(() => activityObj.value.factor)

const tdeeValue = computed(() => {
  if (!bmrValue.value) return 0
  try {
    return calcTdee(bmrValue.value, activity.value).value
  } catch (e) {
    return 0
  }
})

const goals = computed(() => {
  const t = tdeeValue.value
  if (!t) return []
  return [
    { k: '减脂', v: Math.round(t - 500) + ' 千卡/天' },
    { k: '维持', v: Math.round(t) + ' 千卡/天' },
    { k: '增肌', v: Math.round(t + 300) + ' 千卡/天' },
  ]
})

const fat = computed(() => {
  if (!bmi.value) return 0
  try {
    return bodyFat(bmi.value.value, Number(age.value), gender.value)
  } catch (e) {
    return 0
  }
})

const fatLabel = computed(() => bodyFatLabel(fat.value, gender.value))

const water = computed(() => {
  try {
    return waterIntake(Number(weight.value), activity.value !== 'sedentary')
  } catch (e) {
    return { ml: 0, cups: 0 }
  }
})

const ratio = computed(() => {
  if (!waist.value) return null
  try {
    return waistRatio(Number(waist.value), Number(height.value))
  } catch (e) {
    return null
  }
})
</script>

<style scoped>
.bmi-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24rpx 0 20rpx;
}
.bmi-hero__v {
  font-size: 88rpx;
  font-weight: 700;
  color: var(--pk-text);
  line-height: 1;
}
.bmi-hero__k {
  font-size: 22rpx;
  color: var(--pk-text-3);
  letter-spacing: 3rpx;
  margin-top: 10rpx;
}
.bmi-hero__tag {
  margin-top: 18rpx;
  padding: 8rpx 26rpx;
  border-radius: 999rpx;
}
.bmi-hero__tag-t {
  font-size: 24rpx;
  color: var(--pk-on-accent);
  font-weight: 600;
  letter-spacing: 2rpx;
}
.scale {
  padding: 8rpx 24rpx 20rpx;
}
.scale__bar {
  display: flex;
  height: 14rpx;
  border-radius: 7rpx;
  overflow: hidden;
}
.scale__seg {
  height: 14rpx;
}
.scale__marks {
  display: flex;
  justify-content: space-between;
  margin-top: 10rpx;
  padding: 0 2rpx;
}
.scale__m {
  font-size: 22rpx;
  color: var(--pk-text-3);
}
.goal {
  display: flex;
  gap: 14rpx;
  padding: 16rpx 24rpx 22rpx;
}
.goal__i {
  flex: 1;
  padding: 18rpx 12rpx;
  border-radius: var(--pk-radius-sm);
  background: var(--pk-seg-bg);
  border: var(--pk-line-w) solid var(--pk-line);
  display: flex;
  flex-direction: column;
  align-items: center;
}
.goal__k {
  font-size: 22rpx;
  color: var(--pk-text-3);
}
.goal__v {
  font-size: 22rpx;
  color: var(--pk-text);
  margin-top: 8rpx;
  font-weight: 600;
}
.note {
  padding: 4rpx 8rpx 30rpx;
}
.note__t {
  font-size: 22rpx;
  color: var(--pk-text-3);
  line-height: 1.8;
}
</style>
