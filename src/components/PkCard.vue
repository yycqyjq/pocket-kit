<template>
  <view class="pk-card">
    <view v-if="title || $slots.extra" class="pk-card__head">
      <view class="pk-card__head-left">
        <view v-if="accent" class="pk-card__bar" :style="{ background: accent }"></view>
        <text class="pk-card__title">{{ title }}</text>
      </view>
      <view class="pk-card__extra">
        <slot name="extra"></slot>
      </view>
    </view>
    <view class="pk-card__body" :style="{ padding: bodyPadding }">
      <slot></slot>
    </view>
  </view>
</template>

<script setup>
import { computed, useSlots } from 'vue'

const props = defineProps({
  title: { type: String, default: '' },
  accent: { type: String, default: '' },
  padded: { type: Boolean, default: false },
})

const slots = useSlots()

/**
 * 有标题时，标题行自己带左右内边距，正文只需补下边距和下沿；
 * 无标题时若声明了 padded，则四边都要给内边距，否则内容会贴着卡片边框
 * （输入框、按钮会直接顶到圆角上，非常难看）。
 * 不声明 padded 时保持 0，供 .pk-row 这类自带内边距的列表使用。
 */
const bodyPadding = computed(() => {
  if (!props.padded) return '0'
  const hasHead = !!props.title || !!slots.extra
  return hasHead ? '0 24rpx 24rpx' : '24rpx'
})
</script>

<style scoped>
.pk-card {
  background: var(--pk-card);
  border-radius: var(--pk-radius-lg);
  margin-bottom: 24rpx;
  overflow: hidden;
  border: var(--pk-line-w) solid var(--pk-line);
}
.pk-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 24rpx 12rpx;
}
.pk-card__head-left {
  display: flex;
  align-items: center;
}
.pk-card__bar {
  width: 6rpx;
  height: 26rpx;
  border-radius: 3rpx;
  margin-right: 14rpx;
}
.pk-card__title {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--pk-text-2);
  letter-spacing: 2rpx;
}
.pk-card__extra {
  display: flex;
  align-items: center;
}
</style>
