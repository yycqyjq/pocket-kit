<template>
  <view class="pk-empty">
    <view class="pk-empty__mark">
      <view class="pk-empty__ring"></view>
      <view class="pk-empty__dot"></view>
    </view>
    <text class="pk-empty__title">{{ title }}</text>
    <text v-if="desc" class="pk-empty__desc">{{ desc }}</text>
    <view v-if="$slots.action" class="pk-empty__action">
      <slot name="action"></slot>
    </view>
  </view>
</template>

<script setup>
defineProps({
  title: { type: String, default: '这里还空着' },
  desc: { type: String, default: '' },
})
</script>

<style scoped>
.pk-empty {
  padding: 120rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.pk-empty__mark {
  width: 110rpx;
  height: 110rpx;
  position: relative;
  margin-bottom: 32rpx;
}
.pk-empty__ring {
  position: absolute;
  left: 0;
  top: 0;
  width: 110rpx;
  height: 110rpx;
  border-radius: 50%;
  border: 2rpx solid var(--pk-line-strong);
}
.pk-empty__dot {
  position: absolute;
  left: 46rpx;
  top: 46rpx;
  width: 18rpx;
  height: 18rpx;
  border-radius: 50%;
  background: var(--pk-accent);
  opacity: 0.5;
}
.pk-empty__title {
  font-size: 28rpx;
  color: var(--pk-text-2);
  letter-spacing: 2rpx;
}
.pk-empty__desc {
  font-size: 23rpx;
  color: var(--pk-text-3);
  margin-top: 12rpx;
  text-align: center;
  line-height: 1.7;
}
.pk-empty__action {
  margin-top: 36rpx;
}
</style>
