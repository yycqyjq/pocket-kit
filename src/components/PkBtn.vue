<template>
  <view
    class="pk-btn"
    :class="['pk-btn--' + kind, { 'pk-btn--block': block, 'pk-btn--disabled': disabled }]"
    hover-class="pk-btn--hover"
    :hover-stay-time="60"
    @tap="onTap"
  >
    <text class="pk-btn__t">{{ text }}</text>
  </view>
</template>

<script setup>
import { haptic } from '@/utils/clipboard'

const props = defineProps({
  text: { type: String, default: '确定' },
  kind: { type: String, default: 'primary' }, // primary | ghost | soft | danger
  block: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['tap'])

function onTap() {
  if (props.disabled) return
  haptic()
  emit('tap')
}
</script>

<style scoped>
.pk-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  padding: 0 34rpx;
  border-radius: var(--pk-radius-md);
  border: var(--pk-line-w) solid transparent;
  box-sizing: border-box;
}
.pk-btn--block {
  display: flex;
  width: 100%;
}
.pk-btn--primary {
  background: var(--pk-accent);
}
.pk-btn--primary .pk-btn__t {
  color: var(--pk-on-accent);
  font-weight: 600;
}
.pk-btn--soft {
  background: var(--pk-accent-soft);
}
.pk-btn--soft .pk-btn__t {
  color: var(--pk-accent);
  font-weight: 600;
}
.pk-btn--ghost {
  background: transparent;
  border-color: var(--pk-line-strong);
}
.pk-btn--ghost .pk-btn__t {
  color: var(--pk-text-2);
}
.pk-btn--danger {
  background: transparent;
  border-color: var(--pk-danger-soft);
}
.pk-btn--danger .pk-btn__t {
  color: var(--pk-danger);
}
.pk-btn__t {
  font-size: 28rpx;
  letter-spacing: 1rpx;
}
.pk-btn--disabled {
  opacity: 0.4;
}
.pk-btn--hover {
  opacity: 0.78;
}
</style>
