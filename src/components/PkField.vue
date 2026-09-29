<template>
  <view class="pk-field" :class="{ 'pk-field--boxed': boxed }">
    <view v-if="label || $slots.labelRight" class="pk-field__head">
      <text class="pk-field__label">{{ label }}</text>
      <view class="pk-field__head-right">
        <slot name="labelRight"></slot>
      </view>
    </view>

    <textarea
      v-if="type === 'textarea'"
      class="pk-field__input pk-field__input--area"
      :value="modelValue"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :auto-height="autoHeight"
      :style="{ minHeight: autoHeight ? '0' : areaHeight + 'px' }"
      placeholder-class="pk-ph"
      @input="onInput"
    />

    <input
      v-else
      class="pk-field__input"
      :value="modelValue"
      :type="type"
      :password="password"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :confirm-type="confirmType"
      placeholder-class="pk-ph"
      @input="onInput"
      @confirm="$emit('confirm')"
    />

    <view v-if="$slots.suffix" class="pk-field__suffix">
      <slot name="suffix"></slot>
    </view>
  </view>
</template>

<script setup>
defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  type: { type: String, default: 'text' },
  password: { type: Boolean, default: false },
  maxlength: { type: Number, default: 5000 },
  boxed: { type: Boolean, default: true },
  areaHeight: { type: Number, default: 180 },
  autoHeight: { type: Boolean, default: false },
  confirmType: { type: String, default: 'done' },
})

const emit = defineEmits(['update:modelValue', 'input', 'confirm'])

function onInput(e) {
  const v = e && e.detail ? e.detail.value : ''
  emit('update:modelValue', v)
  emit('input', v)
}
</script>

<style scoped>
.pk-field {
  margin-bottom: 20rpx;
}
.pk-field__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10rpx;
}
.pk-field__label {
  font-size: 24rpx;
  color: var(--pk-text-2);
  letter-spacing: 1rpx;
}
.pk-field__head-right {
  display: flex;
  align-items: center;
}
/* 注意：uni-app 在 H5/App 会把 <input> 渲染成 <uni-input> + 内层 input，
   内层 input 是 height:100%，所以容器必须给出明确高度，否则输入框会被压成 0 高度而"隐形" */
.pk-field__input {
  width: 100%;
  box-sizing: border-box;
  height: 84rpx;
  font-size: 28rpx;
  color: var(--pk-text);
  background: var(--pk-input);
  border: var(--pk-line-w) solid var(--pk-line);
  border-radius: var(--pk-radius-md);
  padding: 0 22rpx;
  line-height: 1.5;
}
/* 多行文本域由 uni-textarea 自行撑高，这里必须把固定高度解除 */
.pk-field__input--area {
  height: auto;
  padding: 20rpx 22rpx;
  line-height: 1.6;
}
.pk-field--boxed .pk-field__input {
  background: var(--pk-input);
}
.pk-field__suffix {
  margin-top: 10rpx;
  display: flex;
  justify-content: flex-end;
}
</style>
