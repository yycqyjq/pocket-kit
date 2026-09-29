<template>
  <view>
    <PkCard title="生成类型" accent="#5B7A3E">
      <PkSeg v-model="kind" :items="kinds" />
      <text class="desc">{{ currentDesc }}</text>
      <PkField v-if="kind === 'short'" v-model="len" type="number" label="长度" placeholder="21" />
      <PkField v-if="kind === 'custom'" v-model="alphabet" label="自定义字符集" placeholder="ABC123" />
      <PkField v-if="kind === 'serial'" v-model="prefix" label="前缀" placeholder="PK-" />
      <PkSeg
        v-if="kind === 'serial'"
        v-model="startNo"
        :items="startOptions"
      />
      <view class="act-row">
        <PkBtn text="生成一批" kind="primary" block @tap="gen" />
      </view>
    </PkCard>

    <PkCard v-if="list.length" :title="'结果 · ' + list.length + ' 条'" accent="#5B7A3E">
      <PkRow
        v-for="(v, i) in list"
        :key="i"
        :label="'#' + (i + 1)"
        :value="v"
        mono
      />
      <view class="act-row">
        <PkBtn text="复制全部" kind="soft" @tap="copyText(list.join('\n'), '已复制 ' + list.length + ' 条')" />
        <PkBtn text="重新生成" kind="ghost" @tap="gen" />
      </view>
    </PkCard>

    <PkCard title="类型说明" accent="#4A6FA5">
      <view v-for="k in kinds" :key="k.key" class="kind-item" hover-class="kind-item--hover" @tap="kind = k.key">
        <text class="kind-item__n">{{ k.name }}</text>
        <text class="kind-item__d">{{ k.desc }}</text>
      </view>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { copyText } from '@/utils/clipboard'
import { uuidV4, shortId, objectIdLike, uintId, snowflakeLike } from '@/utils/random'

const kinds = [
  { key: 'uuid', name: 'UUID v4', desc: '标准 36 位，含连字符，全球唯一性最好' },
  { key: 'short', name: '短标识', desc: 'URL 安全字母表，可自定义长度，适合短链与邀请码' },
  { key: 'hex', name: '24 位十六进制', desc: '形如数据库主键 ID，含时间前缀便于排序' },
  { key: 'uint', name: '32 位无符号整数', desc: '纯数字，范围 0 到约 42.9 亿' },
  { key: 'snowflake', name: '类雪花 ID', desc: '时间戳左移加随机位，19 位十进制数字' },
  { key: 'serial', name: '连续编号', desc: '可带前缀的递增流水号，适合订单号、工单号' },
  { key: 'custom', name: '自定义字符集', desc: '只使用你指定的字符随机组合' },
]

const kind = ref('uuid')
const len = ref('21')
const alphabet = ref('ABCDEFGHJKMNPQRSTUVWXYZ23456789')
const prefix = ref('PK-')
const startNo = ref('1001')
const startOptions = [
  { key: '1', name: '从 1 开始' },
  { key: '1001', name: '从 1001 开始' },
  { key: '20260920', name: '从 20260920 开始' },
]
const list = ref([])

const currentDesc = computed(() => {
  const k = kinds.find((x) => x.key === kind.value)
  return k ? k.desc : ''
})

function one() {
  switch (kind.value) {
    case 'uuid':
      return uuidV4()
    case 'short':
      return shortId(Math.max(4, Math.min(64, Number(len.value) || 21)))
    case 'hex':
      return objectIdLike()
    case 'uint':
      return uintId()
    case 'snowflake':
      return snowflakeLike()
    case 'custom':
      return shortId(16, String(alphabet.value) || 'ABC123')
    case 'serial':
      return null
    default:
      return uuidV4()
  }
}

function gen() {
  if (kind.value === 'serial') {
    const base = Number(startNo.value) || 1
    const out = []
    for (let i = 0; i < 10; i++) {
      out.push(prefix.value + String(base + i).padStart(4, '0'))
    }
    list.value = out
    return
  }
  const out = []
  for (let i = 0; i < 10; i++) out.push(one())
  list.value = out
}

onMounted(gen)
</script>

<style scoped>
.desc {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  line-height: 1.7;
  margin-bottom: 20rpx;
}
.act-row {
  display: flex;
  gap: 20rpx;
  padding: 16rpx 24rpx 24rpx;
}
.kind-item {
  padding: 18rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.kind-item--hover {
  background: var(--pk-seg-bg);
}
.kind-item__n {
  display: block;
  font-size: 26rpx;
  color: var(--pk-text);
  margin-bottom: 6rpx;
}
.kind-item__d {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  line-height: 1.6;
}
</style>
