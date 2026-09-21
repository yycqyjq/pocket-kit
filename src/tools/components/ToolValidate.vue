<template>
  <view>
    <PkCard title="校验类型" accent="#8C5B3E">
      <PkSeg v-model="key" :items="typeItems" />
      <PkField v-model="value" :placeholder="current.placeholder" :maxlength="64">
        <template #labelRight>
          <text class="mini-act" @tap="value = current.sample">示例</text>
          <text class="mini-act" @tap="pasteValue">读取剪贴板</text>
          <text class="mini-act" @tap="value = ''">清空</text>
        </template>
      </PkField>
      <PkRow v-if="cleaned !== value && value" label="已自动去除分隔符" :value="cleaned" mono :copy="false" />
    </PkCard>

    <PkCard v-if="value" :title="result.ok ? '校验通过' : '校验未通过'" :accent="result.ok ? 'var(--pk-accent)' : 'var(--pk-danger)'">
      <view class="verdict" :style="{ background: result.ok ? 'var(--pk-accent-soft)' : 'rgba(180,85,62,0.10)' }">
        <text class="verdict__mark" :style="{ color: result.ok ? 'var(--pk-accent)' : 'var(--pk-danger)' }">
          {{ result.ok ? '通过' : '不通过' }}
        </text>
        <text class="verdict__tip">{{ result.tip }}</text>
      </view>
      <PkRow
        v-for="(v, k) in result.extra || {}"
        :key="k"
        :label="k"
        :value="v"
      />
    </PkCard>

    <PkCard v-else title="等待输入" accent="#8C5B3E">
      <PkRow label="当前类型" :value="current.name" :copy="false" />
      <PkRow label="合法示例" :value="current.sample" mono />
      <view class="act-row">
        <PkBtn text="填入示例" kind="soft" @tap="value = current.sample" />
      </view>
    </PkCard>

    <PkCard title="批量校验" accent="#4A6FA5">
      <PkField
        v-model="batch"
        type="textarea"
        :area-height="140"
        placeholder="每行一条，用当前选中的类型批量校验"
      />
      <view class="act-row">
        <PkBtn text="开始批量校验" kind="primary" block @tap="runBatch" />
      </view>
      <template v-if="batchResult.length">
        <PkRow label="总条数" :value="batchResult.length" :copy="false" />
        <PkRow label="通过" :value="batchPass" :color="'var(--pk-accent)'" :copy="false" />
        <PkRow label="未通过" :value="batchResult.length - batchPass" :color="'var(--pk-danger)'" :copy="false" />
        <view class="batch-list">
          <view v-for="(r, i) in batchResult" :key="i" class="batch-item">
            <text class="batch-item__mark" :style="{ color: r.ok ? 'var(--pk-accent)' : 'var(--pk-danger)' }">{{ r.ok ? '✓' : '✕' }}</text>
            <text class="batch-item__v">{{ r.value }}</text>
            <text class="batch-item__tip">{{ r.ok ? '通过' : r.tip }}</text>
          </view>
        </view>
      </template>
    </PkCard>

    <PkCard title="全部类型" accent="#6B5B95">
      <view
        v-for="t in VALIDATORS"
        :key="t.key"
        class="type-item"
        :class="{ 'type-item--on': t.key === key }"
        hover-class="type-item--hover"
        @tap="key = t.key"
      >
        <text class="type-item__n">{{ t.name }}</text>
        <text class="type-item__p">{{ t.placeholder }}</text>
      </view>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { toast } from '@/utils/clipboard'
import { VALIDATORS, findValidator } from '@/utils/validate'

const typeItems = VALIDATORS.map((v) => ({ key: v.key, name: v.name }))

const key = ref('phone')
const value = ref('')
const batch = ref('')
const batchResult = ref([])

const current = computed(() => findValidator(key.value))

/** 手机号、银行卡这类允许用户带空格横线输入 */
const cleaned = computed(() => {
  const k = key.value
  if (k === 'phone' || k === 'bank' || k === 'imei' || k === 'mac') {
    return String(value.value).replace(/[\s-]/g, '')
  }
  return String(value.value).trim()
})

const result = computed(() => {
  if (!value.value) return { ok: false, tip: '' }
  try {
    return current.value.fn(cleaned.value)
  } catch (e) {
    return { ok: false, tip: e.message || '校验出错' }
  }
})

const batchPass = computed(() => batchResult.value.filter((r) => r.ok).length)

function runBatch() {
  const lines = String(batch.value)
    .split(/\r\n|\r|\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!lines.length) {
    toast('请先粘贴要校验的内容')
    return
  }
  if (lines.length > 500) {
    toast('一次最多校验 500 条')
    return
  }
  batchResult.value = lines.map((v) => {
    let r
    try {
      r = current.value.fn(v)
    } catch (e) {
      r = { ok: false, tip: '校验出错' }
    }
    return { value: v, ok: r.ok, tip: r.tip }
  })
}

function pasteValue() {
  uni.getClipboardData({
    success(res) {
      if (res.data) {
        value.value = String(res.data).trim()
      } else {
        toast('剪贴板是空的')
      }
    },
    fail() {
      toast('读取失败')
    },
  })
}
</script>

<style scoped>
.mini-act {
  font-size: 23rpx;
  color: var(--pk-accent);
  margin-left: 22rpx;
}
.verdict {
  margin: 4rpx 24rpx 16rpx;
  padding: 24rpx;
  border-radius: 14rpx;
  display: flex;
  flex-direction: column;
}
.verdict__mark {
  font-size: 34rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
}
.verdict__tip {
  font-size: 23rpx;
  color: var(--pk-text-2);
  margin-top: 10rpx;
  line-height: 1.6;
}
.act-row {
  display: flex;
  gap: 20rpx;
  padding: 8rpx 24rpx 22rpx;
}
.batch-list {
  padding: 8rpx 24rpx 24rpx;
}
.batch-item {
  display: flex;
  align-items: center;
  padding: 12rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.batch-item__mark {
  width: 34rpx;
  font-size: 24rpx;
}
.batch-item__v {
  flex: 1;
  font-size: 24rpx;
  color: var(--pk-text);
  font-family: Menlo, Consolas, monospace;
  word-break: break-all;
  margin-right: 16rpx;
}
.batch-item__tip {
  font-size: 22rpx;
  color: var(--pk-text-3);
  flex-shrink: 0;
  max-width: 220rpx;
  text-align: right;
}
.type-item {
  padding: 16rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.type-item--on {
  background: var(--pk-accent-soft);
}
.type-item--hover {
  background: var(--pk-seg-bg);
}
.type-item__n {
  font-size: 26rpx;
  color: var(--pk-text);
}
.type-item--on .type-item__n {
  color: var(--pk-accent);
  font-weight: 600;
}
.type-item__p {
  font-size: 22rpx;
  color: var(--pk-text-3);
  font-family: Menlo, Consolas, monospace;
  max-width: 320rpx;
  text-align: right;
  overflow: hidden;
}
</style>
