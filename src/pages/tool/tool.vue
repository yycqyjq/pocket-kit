<template>
  <PkPage :title="tool ? tool.name : '未找到'" :sub="catName" back hairline>
    <template #nav-right>
      <view
        v-if="tool"
        class="fav"
        :class="{ 'fav--on': fav }"
        hover-class="fav--hover"
        :hover-stay-time="60"
        @tap="onToggleFav"
      >
        <text class="fav__t">{{ fav ? '已收' : '收藏' }}</text>
      </view>
    </template>

    <PkEmpty
      v-if="!tool"
      title="这个工具不在匣中"
      desc="可能是链接失效，回到首页重新挑一个吧"
    >
      <template #action>
        <PkBtn text="回到首页" kind="soft" @tap="goHome" />
      </template>
    </PkEmpty>

    <template v-else>
      <component :is="comp" v-if="comp" />

      <view class="intro">
        <text class="intro__label">说明</text>
        <text class="intro__t">{{ tool.intro }}</text>
      </view>

      <view class="nav-bottom">
        <PkBtn text="回到匣中" kind="ghost" block @tap="goHome" />
      </view>
    </template>
  </PkPage>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getTool, getComponent, CATEGORIES } from '@/tools/registry'
import { isFavorite, toggleFavorite, pushRecent } from '@/utils/storage'
import { haptic, toast } from '@/utils/clipboard'

const toolId = ref('')
const fav = ref(false)

const tool = computed(() => (toolId.value ? getTool(toolId.value) : null))
const comp = computed(() => (toolId.value ? getComponent(toolId.value) : null))
const catName = computed(() => {
  if (!tool.value) return ''
  const c = CATEGORIES.find((x) => x.key === tool.value.cat)
  return c ? c.name : ''
})

onLoad((options) => {
  const id = (options && options.id) || ''
  toolId.value = id
  const t = getTool(id)
  if (t) {
    fav.value = isFavorite(id)
    pushRecent(id)
    uni.setNavigationBarTitle && uni.setNavigationBarTitle({ title: t.name })
  }
})

function onToggleFav() {
  haptic()
  fav.value = toggleFavorite(toolId.value)
  toast(fav.value ? '已加入收藏' : '已取消收藏')
}

function goHome() {
  const pages = getCurrentPages()
  if (pages.length > 1) uni.navigateBack({ delta: 1 })
  else uni.reLaunch({ url: '/pages/index/index' })
}
</script>

<style scoped>
.fav {
  padding: 8rpx 20rpx;
  border-radius: 999rpx;
  border: 1px solid var(--pk-line-strong);
}
.fav--on {
  background: var(--pk-accent-soft);
  border-color: var(--pk-accent);
}
.fav--hover {
  opacity: 0.6;
}
.fav__t {
  font-size: 22rpx;
  color: var(--pk-text-2);
}
.fav--on .fav__t {
  color: var(--pk-accent);
  font-weight: 600;
}
.intro {
  padding: 8rpx 4rpx 4rpx;
}
.intro__label {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  letter-spacing: 4rpx;
  margin-bottom: 10rpx;
}
.intro__t {
  font-size: 22rpx;
  color: var(--pk-text-3);
  line-height: 1.8;
}
.nav-bottom {
  padding: 30rpx 0 10rpx;
}
</style>
