<template>
  <view class="pk-glyph" :class="{ 'pk-glyph--solid': solid }" :style="style">
    <text class="pk-glyph__t" :style="{ fontSize: size * 0.48 + 'rpx' }">{{ char }}</text>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  char: { type: String, default: '·' },
  tint: { type: String, default: '#3F7A6E' },
  size: { type: Number, default: 84 },
  radius: { type: Number, default: 22 },
  solid: { type: Boolean, default: false },
})

const style = computed(() => ({
  width: props.size + 'rpx',
  height: props.size + 'rpx',
  borderRadius: props.radius + 'rpx',
  background: props.solid ? props.tint : hexToSoft(props.tint),
}))

function hexToSoft(hex) {
  const h = String(hex).replace('#', '')
  if (h.length !== 6) return 'rgba(63,122,110,0.12)'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},0.13)`
}
</script>

<style scoped>
.pk-glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pk-glyph__t {
  font-weight: 600;
  line-height: 1;
}
/* 实心徽标：底色是饱和 tint，文字必须转白，否则深色字压深色底看不清 */
.pk-glyph--solid .pk-glyph__t {
  color: #fff;
}
</style>
