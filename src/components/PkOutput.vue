<template>
  <view class="pk-out">
    <text
      class="pk-out__t"
      :class="{ 'pk-out__t--mono': mono, 'pk-out__t--pre': pre }"
      :style="{ fontSize: size + 'rpx' }"
      selectable
    >{{ value }}</text>
  </view>
</template>

<script setup>
defineProps({
  value: { type: [String, Number], default: '' },
  /** 等宽字体：代码、摘要、进制等对齐输出 */
  mono: { type: Boolean, default: false },
  /** 保留原始换行且不折行（配合横向滚动），表格 / 压缩后的代码用 */
  pre: { type: Boolean, default: false },
  /** 字号（rpx），各工具输出密度不同 */
  size: { type: Number, default: 22 },
})
</script>

<style scoped>
.pk-out {
  margin: 8rpx 24rpx 18rpx;
  padding: 18rpx;
  border-radius: var(--pk-radius-md);
  background: var(--pk-input);
  border: var(--pk-line-w) solid var(--pk-line);
  overflow: hidden;
}
.pk-out__t {
  color: var(--pk-text);
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-all;
}
.pk-out__t--mono {
  font-family: Menlo, Consolas, monospace;
}
.pk-out__t--pre {
  white-space: pre;
  overflow-x: auto;
}
</style>
