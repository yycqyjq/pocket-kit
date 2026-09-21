<template>
  <view class="pk-row" :class="{ 'pk-row--stack': stack }" @tap="onTap">
    <text class="pk-row__k">{{ label }}</text>
    <view class="pk-row__v-wrap">
      <text class="pk-row__v" :class="{ 'pk-row__v--mono': mono, 'pk-row__v--big': big }" :style="valueStyle" selectable>{{ display }}</text>
      <view v-if="copy && display !== '—'" class="pk-row__copy" hover-class="pk-tap" :hover-stay-time="60" @tap.stop="doCopy">
        <text class="pk-row__copy-t">复制</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { copyText } from '@/utils/clipboard'

const props = defineProps({
  label: { type: String, default: '' },
  value: { type: [String, Number], default: '' },
  copy: { type: Boolean, default: true },
  mono: { type: Boolean, default: false },
  big: { type: Boolean, default: false },
  stack: { type: Boolean, default: false },
  color: { type: String, default: '' },
})

const emit = defineEmits(['tap'])

const display = computed(() => {
  const v = props.value
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
})

const valueStyle = computed(() => (props.color ? { color: props.color } : {}))

function doCopy() {
  if (display.value === '—') return
  copyText(display.value)
}

function onTap() {
  emit('tap')
}
</script>

<style scoped>
.pk-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.pk-row:last-child {
  border-bottom: none;
}
.pk-row--stack {
  flex-direction: column;
  align-items: stretch;
}
.pk-row__k {
  font-size: 26rpx;
  color: var(--pk-text-3);
  flex-shrink: 0;
  margin-right: 20rpx;
  line-height: 1.6;
}
.pk-row--stack .pk-row__k {
  margin-right: 0;
  margin-bottom: 8rpx;
}
.pk-row__v-wrap {
  display: flex;
  align-items: flex-start;
  flex: 1;
  justify-content: flex-end;
  min-width: 0;
}
.pk-row--stack .pk-row__v-wrap {
  justify-content: flex-start;
}
.pk-row__v {
  font-size: 28rpx;
  color: var(--pk-text);
  text-align: right;
  word-break: break-all;
  line-height: 1.6;
  flex: 1;
}
.pk-row--stack .pk-row__v {
  text-align: left;
}
.pk-row__v--mono {
  font-family: Menlo, Consolas, "Courier New", monospace;
  font-size: 26rpx;
  letter-spacing: 0.5rpx;
}
.pk-row__v--big {
  font-size: 36rpx;
  font-weight: 600;
}
.pk-row__copy {
  margin-left: 16rpx;
  margin-top: 2rpx;
  min-height: 72rpx;
  display: flex;
  align-items: center;
  padding: 14rpx 20rpx;
  border-radius: var(--pk-radius-sm);
  /* 素色描边而不是实心色块：结果行里六成都有复制按钮，
     实心色块一屏堆十几个非常吵，压过了数据本身 */
  background: transparent;
  border: var(--pk-line-w) solid var(--pk-line-strong);
  flex-shrink: 0;
}
.pk-row__copy-t {
  font-size: 22rpx;
  line-height: 1.2;
  color: var(--pk-text-2);
}
.pk-tap {
  opacity: 0.5;
}
</style>
