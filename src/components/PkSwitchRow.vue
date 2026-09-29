<template>
  <view class="pk-switch-row" :class="{ 'pk-switch-row--last': last }">
    <view class="pk-switch-row__main">
      <text class="pk-switch-row__title">{{ title }}</text>
      <text v-if="desc" class="pk-switch-row__desc">{{ desc }}</text>
    </view>
    <switch
      :checked="modelValue"
      :color="themeColors.accent"
      style="transform: scale(0.78)"
      @change="onChange"
    />
  </view>
</template>

<script setup>
import { themeColors } from '@/utils/theme'

defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  desc: { type: String, default: '' },
  last: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'change'])

function onChange(e) {
  const v = e.detail.value
  emit('update:modelValue', v)
  emit('change', v)
}
</script>

<style scoped>
.pk-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.pk-switch-row--last {
  border-bottom: none;
}
.pk-switch-row__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin-right: 16rpx;
}
.pk-switch-row__title {
  font-size: 28rpx;
  color: var(--pk-text);
}
.pk-switch-row__desc {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
  line-height: 1.5;
}
</style>
