<template>
  <view>
    <PkCard padded>
      <PkField v-model="input" label="UUID" placeholder="f47ac10b-58cc-4372-a567-0e02b2c3d479">
        <template #labelRight>
          <text class="mini-act" @tap="useSample">示例</text>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <template v-if="!error && info">
      <PkCard title="版本" accent="var(--pk-accent)">
        <view class="hero">
          <text class="hero__v">v{{ info.version }}</text>
          <text class="hero__n">{{ info.versionName }}</text>
        </view>
        <PkRow label="变体" :value="info.variant" :copy="false" />
        <PkRow label="版本说明" :value="info.versionNote" :copy="false" stack />
      </PkCard>

      <PkCard title="规范化写法" accent="#4A6FA5">
        <PkRow label="标准写法" :value="info.canonical" mono />
        <PkRow label="大写" :value="info.upper" mono />
        <PkRow label="去连字符" :value="info.compact" mono />
        <PkRow label="十六进制字节" :value="info.compact.match(/.{2}/g).join(' ')" mono />
      </PkCard>

      <PkCard v-if="info.time" title="生成时间" accent="#6B5B95">
        <PkRow label="生成时间" :value="fmtTime(info.time)" big />
        <PkRow label="说明" :value="info.timeNote" :copy="false" stack />
      </PkCard>

      <PkCard v-if="info.node" title="v1 特有信息" accent="var(--pk-danger)">
        <PkRow label="节点（MAC）" :value="info.node" mono />
        <PkRow label="时钟序列" :value="info.clockSeq" :copy="false" />
        <PkRow
          label="隐私提醒"
          value="v1 把生成机器的 MAC 地址和时间都编码进去了——从 UUID 就能查到是哪台机器在什么时候生成的"
          :copy="false"
          stack
        />
      </PkCard>

      <PkCard v-if="info.isNil || info.isMax" title="特殊值" accent="var(--pk-warn)">
        <PkRow
          v-if="info.isNil"
          label="全零 UUID"
          value="nil UUID，RFC 4122 明确保留用于表示「没有值」"
          :copy="false"
          stack
        />
        <PkRow
          v-if="info.isMax"
          label="全 F UUID"
          value="max UUID，同样被保留，不是随机生成的"
          :copy="false"
          stack
        />
      </PkCard>
    </template>

    <PkCard title="八种版本对比" accent="#6B5B95">
      <view v-for="v in VERSION_LIST" :key="v.name" class="ver">
        <text class="ver__n">{{ v.name }}</text>
        <text class="ver__t">{{ v.note }}</text>
      </view>
    </PkCard>

    <PkCard title="怎么选" accent="#8A6D3B">
      <PkRow label="数据库主键" value="v7（时间有序，索引友好）。v4 会让 B+ 树频繁分裂" :copy="false" stack />
      <PkRow label="对外暴露的资源 ID" value="v4。不可预测，也不暴露信息" :copy="false" stack />
      <PkRow label="需要可复现" value="v3 / v5（由命名空间 + 名称决定）" :copy="false" stack />
      <PkRow label="一般建议" value="v7 取代 v1；v4 仍然是默认安全选择" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { parseUuid, UUID_SAMPLES, UUID_NOTES } from '@/utils/uuidinfo'
import { copyText, toast } from '@/utils/clipboard'

const input = ref(UUID_SAMPLES[0].value)

const VERSION_LIST = [
  { name: 'v1 时间戳 + MAC', note: '能反推生成时间与机器，隐私差' },
  { name: 'v3 MD5 命名空间', note: '确定性生成，同名同结果' },
  { name: 'v4 随机', note: '122 位随机，默认选择' },
  { name: 'v5 SHA-1 命名空间', note: '比 v3 更好的哈希' },
  { name: 'v6 重排时间戳', note: 'v1 改良，按时间有序' },
  { name: 'v7 毫秒时间戳', note: '做数据库主键首选' },
  { name: 'v8 自定义', note: '实现自己定义的格式' },
]

const parsed = computed(() => {
  if (!input.value.trim()) return { info: null, error: '' }
  try {
    return { info: parseUuid(input.value), error: '' }
  } catch (e) {
    return { info: null, error: e.message }
  }
})
const info = computed(() => parsed.value.info)
const error = computed(() => parsed.value.error)

function fmtTime(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '—'
  const pad = (v) => String(v).padStart(2, '0')
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
}

function useSample() {
  const s = UUID_SAMPLES[Math.floor(Math.random() * UUID_SAMPLES.length)]
  input.value = s.value
}

function paste() {
  uni.getClipboardData({
    success(res) {
      if (res.data) input.value = String(res.data).trim()
      else toast('剪贴板是空的')
    },
    fail() {
      toast('读取失败')
    },
  })
}
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 22rpx;
}
.hero {
  display: flex;
  align-items: baseline;
  padding: 22rpx 24rpx 14rpx;
}
.hero__v {
  font-size: 44rpx;
  font-weight: 700;
  color: var(--pk-text);
  font-family: Menlo, Consolas, monospace;
  margin-right: 18rpx;
}
.hero__n {
  font-size: 24rpx;
  color: var(--pk-accent);
}
.ver {
  padding: 16rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.ver:last-child {
  border-bottom: none;
}
.ver__n {
  display: block;
  font-size: 26rpx;
  color: var(--pk-text);
  font-weight: 600;
}
.ver__t {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
  line-height: 1.6;
}
</style>
