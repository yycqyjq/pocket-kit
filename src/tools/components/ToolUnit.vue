<template>
  <view>
    <PkCard title="类别" accent="#2F7A8C">
      <PkSeg v-model="groupId" :items="groupItems" />
      <PkField v-model="value" type="digit" placeholder="输入数值" :maxlength="24">
        <template #labelRight>
          <text class="mini-act" @tap="value = ''">清空</text>
        </template>
      </PkField>
      <view class="pair">
        <view class="pair__side">
          <text class="pair__label">从</text>
          <picker
            mode="selector"
            :range="unitNames"
            :value="fromIndex"
            @change="onFrom"
          >
            <view class="picker">
              <text class="picker__t">{{ fromName }}</text>
              <view class="picker__chev"></view>
            </view>
          </picker>
        </view>
        <view class="pair__swap" hover-class="pk-op" @tap="swap">
          <text class="pair__swap-t">⇄</text>
        </view>
        <view class="pair__side">
          <text class="pair__label">到</text>
          <picker
            mode="selector"
            :range="unitNames"
            :value="toIndex"
            @change="onTo"
          >
            <view class="picker">
              <text class="picker__t">{{ toName }}</text>
              <view class="picker__chev"></view>
            </view>
          </picker>
        </view>
      </view>
    </PkCard>

    <PkCard title="换算结果" accent="var(--pk-accent)">
      <PkRow
        :label="value + ' ' + fromName + ' ='"
        :value="mainResult + ' ' + toName"
        big
      />
      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" />
    </PkCard>

    <PkCard title="该类别全部单位" accent="#3F7A8C">
      <PkRow
        v-for="r in allResults"
        :key="r.key"
        :label="r.name"
        :value="fmt(r.value)"
        :mono="true"
        :color="r.key === toKey ? 'var(--pk-accent)' : ''"
      />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { UNIT_GROUPS, getGroup, convertToAll, smartFormat } from '@/utils/unit'
import { haptic } from '@/utils/clipboard'

const groupItems = UNIT_GROUPS.map((g) => ({ key: g.id, name: g.name }))

const groupId = ref('length')
const value = ref('1')
const fromKey = ref('m')
const toKey = ref('cm')

const group = computed(() => getGroup(groupId.value))
const unitNames = computed(() => group.value.units.map((u) => u.name))
const fromIndex = computed(() => {
  const i = group.value.units.findIndex((u) => u.key === fromKey.value)
  return i < 0 ? 0 : i
})
const toIndex = computed(() => {
  const i = group.value.units.findIndex((u) => u.key === toKey.value)
  return i < 0 ? 1 : i
})
const fromName = computed(() => group.value.units[fromIndex.value].name)
const toName = computed(() => group.value.units[toIndex.value].name)

const error = ref('')

const allResults = computed(() => {
  error.value = ''
  const v = Number(value.value)
  if (value.value === '' || !isFinite(v)) return []
  return convertToAll(v, groupId.value, fromKey.value)
})

const mainResult = computed(() => {
  const hit = allResults.value.find((r) => r.key === toKey.value)
  if (!hit) {
    if (value.value !== '' && !isFinite(Number(value.value))) error.value = '请输入有效数字'
    return '—'
  }
  return fmt(hit.value)
})

function fmt(n) {
  return smartFormat(n, 6)
}

function onFrom(e) {
  fromKey.value = group.value.units[Number(e.detail.value)].key
}
function onTo(e) {
  toKey.value = group.value.units[Number(e.detail.value)].key
}

function swap() {
  haptic()
  const a = fromKey.value
  fromKey.value = toKey.value
  toKey.value = a
}

// 切换类别时重置首尾单位，避免索引越界
function resetUnits() {
  const g = getGroup(groupId.value)
  fromKey.value = g.units[0].key
  toKey.value = g.units[Math.min(1, g.units.length - 1)].key
  if (g.id === 'temp') value.value = '25'
}

watch(groupId, resetUnits)
</script>

<style scoped>
.mini-act {
  font-size: 24rpx;
  color: var(--pk-accent);
}
.pair {
  display: flex;
  align-items: flex-end;
  margin-top: 8rpx;
}
.pair__side {
  flex: 1;
}
.pair__label {
  font-size: 22rpx;
  color: var(--pk-text-3);
  display: block;
  margin-bottom: 8rpx;
}
.pair__swap {
  width: 68rpx;
  height: 76rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pair__swap-t {
  font-size: 34rpx;
  color: var(--pk-accent);
}
.pk-op {
  opacity: 0.5;
}
.picker {
  height: 76rpx;
  border-radius: var(--pk-radius-md);
  background: var(--pk-input);
  border: var(--pk-line-w) solid var(--pk-line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20rpx;
}
.picker__t {
  font-size: 28rpx;
  color: var(--pk-text);
}
.picker__chev {
  width: 12rpx;
  height: 12rpx;
  border-right: 3rpx solid var(--pk-text-3);
  border-bottom: 3rpx solid var(--pk-text-3);
  transform: rotate(45deg) translate(-3rpx, -3rpx);
}
</style>
