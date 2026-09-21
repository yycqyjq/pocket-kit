<template>
  <view class="pk-nav" :style="{ background: navBg }">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <view class="pk-nav__inner">
      <view v-if="back" class="pk-nav__back" hover-class="pk-tap" :hover-stay-time="60" @tap="goBack">
        <view class="pk-chev"></view>
      </view>
      <view class="pk-nav__titles">
        <text class="pk-nav__title">{{ title }}</text>
        <text v-if="sub" class="pk-nav__sub">{{ sub }}</text>
      </view>
      <view class="pk-nav__right">
        <slot name="right"></slot>
      </view>
    </view>
    <view v-if="hairline" class="pk-nav__line"></view>
  </view>
</template>

<script setup>
import { statusBarHeight } from '@/utils/sys'

const props = defineProps({
  title: { type: String, default: '' },
  sub: { type: String, default: '' },
  back: { type: Boolean, default: false },
  hairline: { type: Boolean, default: false },
  navBg: { type: String, default: 'var(--pk-bg)' },
})

const emit = defineEmits(['back'])

function goBack() {
  emit('back')
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack({ delta: 1 })
  } else {
    uni.reLaunch({ url: '/pages/index/index' })
  }
}
</script>

<style scoped>
.pk-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 90;
}
.pk-nav__inner {
  position: relative;
  height: 44px;
  display: flex;
  align-items: center;
  padding: 0 12px;
}
.pk-nav__back {
  width: 40px;
  height: 40px;
  margin-left: -8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}
.pk-chev {
  width: 16rpx;
  height: 16rpx;
  border-left: 3rpx solid var(--pk-text);
  border-bottom: 3rpx solid var(--pk-text);
  transform: rotate(45deg);
  margin-left: 6rpx;
}
.pk-nav__titles {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.pk-nav__title {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--pk-text);
  letter-spacing: 1rpx;
  line-height: 1.1;
}
.pk-nav__sub {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 2rpx;
  letter-spacing: 1rpx;
}
.pk-nav__right {
  margin-left: auto;
  display: flex;
  align-items: center;
  min-width: 40px;
  justify-content: flex-end;
}
.pk-nav__line {
  height: var(--pk-line-w);
  background: var(--pk-line);
}
.pk-tap {
  opacity: 0.5;
}
</style>
