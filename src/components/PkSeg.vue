<template>
  <scroll-view class="pk-seg" scroll-x :show-scrollbar="false">
    <view class="pk-seg__inner">
      <view
        v-for="item in items"
        :key="item[valueKey]"
        class="pk-seg__item"
        :class="{ 'pk-seg__item--on': item[valueKey] === modelValue }"
        hover-class="pk-seg__item--hover"
        :hover-stay-time="60"
        @tap="pick(item[valueKey])"
      >
        <text class="pk-seg__text">{{ item[labelKey] }}</text>
      </view>
    </view>
  </scroll-view>
</template>

<script setup>
import { haptic } from '@/utils/clipboard'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  items: { type: Array, default: () => [] },
  valueKey: { type: String, default: 'key' },
  labelKey: { type: String, default: 'name' },
})

const emit = defineEmits(['update:modelValue', 'change'])

function pick(v) {
  if (v === props.modelValue) return
  haptic()
  emit('update:modelValue', v)
  emit('change', v)
}
</script>

<style scoped>
.pk-seg {
  width: 100%;
  white-space: nowrap;
  margin-bottom: 20rpx;
}
.pk-seg__inner {
  display: inline-flex;
  padding: 6rpx;
  background: var(--pk-seg-bg);
  border-radius: var(--pk-radius-md);
}
.pk-seg__item {
  padding: 12rpx 26rpx;
  border-radius: var(--pk-radius-sm);
  transition: background 0.15s;
  flex-shrink: 0;
  flex-grow: 0;
}
.pk-seg__item--on {
  background: var(--pk-card);
  box-shadow: var(--pk-shadow-sm);
}
.pk-seg__item--hover {
  opacity: 0.7;
}
.pk-seg__text {
  font-size: 26rpx;
  color: var(--pk-text-2);
  white-space: nowrap;
}
.pk-seg__item--on .pk-seg__text {
  color: var(--pk-accent);
  font-weight: 600;
}
</style>
