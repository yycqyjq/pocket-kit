<template>
  <view class="pk-page" :class="{ 'theme-dark': theme.dark }">
    <PkNavBar
      v-if="title || back"
      :title="title"
      :sub="sub"
      :back="back"
      :hairline="hairline"
      :nav-bg="navBg"
    >
      <template #right>
        <slot name="nav-right"></slot>
      </template>
    </PkNavBar>
    <view class="pk-page__body" :style="bodyStyle">
      <slot></slot>
    </view>
    <slot name="fixed"></slot>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import PkNavBar from './PkNavBar.vue'
import { theme } from '@/utils/theme'
import { navTotalHeight, safeBottom } from '@/utils/sys'

const props = defineProps({
  title: { type: String, default: '' },
  sub: { type: String, default: '' },
  back: { type: Boolean, default: false },
  hairline: { type: Boolean, default: false },
  navBg: { type: String, default: 'var(--pk-bg)' },
  /** 底部预留高度（px），用于给固定底栏让位 */
  padBottom: { type: Number, default: 0 },
  /** 页面左右内边距（rpx） */
  gutter: { type: Number, default: 28 },
})

const bodyStyle = computed(() => {
  const hasNav = !!(props.title || props.back)
  // 导航栏下方额外留 12px（约 24rpx）呼吸位，
  // 否则首张卡片会紧贴导航栏底边，看着很憋
  return {
    paddingTop: hasNav ? navTotalHeight + 12 + 'px' : '0px',
    paddingBottom: props.padBottom + safeBottom + 'px',
    paddingLeft: props.gutter + 'rpx',
    paddingRight: props.gutter + 'rpx',
  }
})
</script>

<style scoped>
.pk-page {
  min-height: 100vh;
  background: var(--pk-bg);
  box-sizing: border-box;
}
.pk-page__body {
  box-sizing: border-box;
}
</style>
