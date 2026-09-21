<template>
  <view>
    <PkCard padded>
      <PkField v-model="input" type="textarea" :area-height="120" placeholder="输入要计算摘要的内容（支持中文与 emoji）">
        <template #labelRight>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <PkRow label="输入长度" :value="input ? byteLen + ' 字节 / ' + input.length + ' 字符' : '—'" :copy="false" />
    </PkCard>

    <PkCard v-if="input" title="消息摘要" accent="var(--pk-accent)">
      <PkRow
        v-for="a in results"
        :key="a.key"
        :label="a.name"
        :value="a.value"
        mono
      />
      <PkRow label="说明" value="同样的输入永远得到同样的结果，且无法从结果反推原文" :copy="false" stack />
    </PkCard>

    <PkCard v-else title="等待输入" accent="var(--pk-accent)">
      <PkRow label="提示" value="输入内容后这里会列出 MD5 / SHA-1 / SHA-256 / SHA-512 四种摘要" :copy="false" stack />
    </PkCard>

    <PkCard title="HMAC（带密钥的摘要）" accent="#4A6FA5">
      <PkField v-model="hmacKey" label="密钥" placeholder="例如 secret-key" />
      <PkField v-model="hmacAlgoModel" label="算法" placeholder="sha256" />
      <view class="algo-row">
        <text
          v-for="a in hmacAlgos"
          :key="a"
          class="algo-chip"
          :class="{ 'algo-chip--on': hmacAlgo === a }"
          @tap="hmacAlgo = a"
        >{{ a.toUpperCase() }}</text>
      </view>
      <PkRow v-if="hmacValue" label="HMAC 结果" :value="hmacValue" mono />
      <PkRow v-else label="结果" value="填了密钥就会在这里出结果" :copy="false" stack />
    </PkCard>

    <PkCard title="算法安全性" accent="var(--pk-warn)">
      <view v-for="a in ALGOS" :key="a.key" class="algo-item">
        <view class="algo-item__head">
          <text class="algo-item__n">{{ a.name }}</text>
          <text class="algo-item__bits">{{ a.bits }} 位</text>
          <text class="algo-item__tag" :class="a.weak ? 'algo-item__tag--bad' : 'algo-item__tag--ok'">
            {{ a.weak ? '已不安全' : '安全' }}
          </text>
        </view>
        <text class="algo-item__note">{{ a.note }}</text>
      </view>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { hashAll, hmac, ALGOS, supportsSHA512 } from '@/utils/hash'
import { toast, copyText } from '@/utils/clipboard'

const input = ref('')
const hmacKey = ref('')
const hmacAlgo = ref('sha256')
const hmacAlgos = ['md5', 'sha1', 'sha256', 'sha512']
const hmacAlgoModel = computed({
  get: () => hmacAlgo.value,
  set: (v) => {
    if (hmacAlgos.indexOf(String(v).toLowerCase()) > -1) hmacAlgo.value = String(v).toLowerCase()
  },
})

const byteLen = computed(() => {
  let n = 0
  for (const ch of String(input.value)) {
    const c = ch.codePointAt(0)
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4
  }
  return n
})

const results = computed(() => {
  const all = hashAll(input.value)
  return ALGOS.map((a) => ({
    key: a.key,
    name: a.name,
    value: all[a.key] || (a.key === 'sha512' && !supportsSHA512 ? '当前环境不支持' : '—'),
  }))
})

const hmacValue = computed(() => {
  if (!hmacKey.value || !input.value) return ''
  try {
    return hmac(hmacAlgo.value, hmacKey.value, input.value)
  } catch (e) {
    return '计算出错：' + e.message
  }
})

function paste() {
  uni.getClipboardData({
    success(res) {
      if (res.data) input.value = String(res.data)
      else toast('剪贴板是空的')
    },
    fail() {
      toast('读取失败')
    },
  })
}

watch(input, (v) => {
  if (v && v.length > 20000) toast('内容较长，计算可能需要一点时间')
})
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 24rpx;
}
.algo-row {
  display: flex;
  flex-wrap: wrap;
  margin: 0 0 12rpx;
}
.algo-chip {
  display: inline-block;
  font-size: 22rpx;
  color: var(--pk-text-2);
  margin: 8rpx 14rpx 0 0;
  padding: 10rpx 20rpx;
  line-height: 1.3;
  border-radius: var(--pk-radius-sm);
  border: var(--pk-line-w) solid var(--pk-line-strong);
}
.algo-chip--on {
  color: var(--pk-accent);
  border-color: var(--pk-accent);
  background: var(--pk-accent-soft);
}
.algo-item {
  padding: 18rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.algo-item:last-child {
  border-bottom: none;
}
.algo-item__head {
  display: flex;
  align-items: center;
}
.algo-item__n {
  font-size: 28rpx;
  color: var(--pk-text);
  font-weight: 600;
  margin-right: 16rpx;
}
.algo-item__bits {
  font-size: 22rpx;
  color: var(--pk-text-3);
  flex: 1;
}
.algo-item__tag {
  font-size: 22rpx;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
}
.algo-item__tag--ok {
  color: var(--pk-accent);
  background: rgba(63, 122, 110, 0.12);
}
.algo-item__tag--bad {
  color: var(--pk-danger);
  background: rgba(180, 85, 62, 0.12);
}
.algo-item__note {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  line-height: 1.7;
  margin-top: 8rpx;
}
</style>
