<template>
  <view>
    <PkCard padded>
      <PkField v-model="secret" type="textarea" :area-height="80" label="Base32 密钥">
        <template #labelRight>
          <text class="mini-act" @tap="makeSecret">随机生成</text>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="secret = ''">清空</text>
        </template>
      </PkField>
      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" stack />
      <PkRow v-else-if="secret" label="密钥长度" :value="keyBytes + ' 字节（' + (secret.replace(/[\s-]/g, '').length) + ' 个字符）'" :copy="false" />
    </PkCard>

    <PkCard title="参数" accent="#4A6FA5">
      <PkSeg v-model="periodKey" :items="periodItems" />
      <PkSeg v-model="digitsKey" :items="digitItems" />
      <PkSeg v-model="algoKey" :items="algoItems" />
    </PkCard>

    <template v-if="code">
      <PkCard title="当前验证码" accent="var(--pk-accent)">
        <template #extra>
          <text class="mini-act" @tap="copyText(code.code)">复制</text>
        </template>
        <view class="code">
          <text class="code__t">{{ code.pretty }}</text>
        </view>
        <view class="bar">
          <view class="bar__fill" :style="{ width: (100 - code.progress * 100) + '%' }"></view>
        </view>
        <PkRow label="剩余有效时间" :value="code.remain + ' 秒'" :copy="false" />
        <PkRow label="时间计数器" :value="String(code.counter)" mono :copy="false" />
        <PkRow label="到期时刻" :value="expireText" :copy="false" />
      </PkCard>

      <PkCard title="校验一个验证码" accent="#6B5B95">
        <PkField v-model="checkCode" type="number" label="输入 6 位验证码" :maxlength="8" />
        <PkRow
          v-if="checkResult"
          label="结论"
          :value="checkResult.matched ? '通过' : '不通过'"
          :color="checkResult.matched ? 'var(--pk-accent)' : 'var(--pk-danger)'"
          :copy="false"
        />
        <PkRow v-if="checkResult" label="说明" :value="checkResult.explain" :copy="false" stack />
        <PkRow
          label="容错窗口"
          value="会同时检查当前时间窗与前后各一个窗口，因为设备时钟常有几秒偏差"
          :copy="false"
          stack
        />
      </PkCard>
    </template>

    <PkCard title="这是什么" accent="#8C5B3E">
      <PkRow label="TOTP" value="基于时间的一次性密码，RFC 6238。每隔一段时间换一个码，所以叫动态口令" :copy="false" stack />
      <PkRow label="和密码的区别" value="密码泄露了能一直用；动态口令只在很短的时间内有效，偷到了也很快作废" :copy="false" stack />
      <PkRow label="密钥从哪来" value="在网站开启两步验证时给出，可能是一串 Base32 字符，也可能藏在 otpauth:// 二维码里" :copy="false" stack />
      <PkRow label="为什么不用扫码" value="二维码解析需要摄像头，这里直接贴密钥字符串更省事" :copy="false" stack />
      <PkRow v-for="(n, i) in TOTP_NOTES" :key="'n' + i" :label="'注意 ' + (i + 1)" :value="n" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed, onUnmounted, watch } from 'vue'
import { totp, verifyTotp, randomSecret, secretFromUri, base32Decode, TOTP_NOTES } from '@/utils/totp'
import { formatDate } from '@/utils/date'
import { copyText, toast } from '@/utils/clipboard'

const periodItems = [
  { key: '30', name: '30 秒' },
  { key: '60', name: '60 秒' },
]
const digitItems = [
  { key: '6', name: '6 位' },
  { key: '8', name: '8 位' },
]
const algoItems = [
  { key: 'SHA1', name: 'SHA-1' },
  { key: 'SHA256', name: 'SHA-256' },
  { key: 'SHA512', name: 'SHA-512' },
]

const secret = ref('')
const periodKey = ref('30')
const digitsKey = ref('6')
const algoKey = ref('SHA1')
const checkCode = ref('')
const tick = ref(Date.now())

const timer = setInterval(() => {
  tick.value = Date.now()
}, 1000)
onUnmounted(() => clearInterval(timer))

const codeCalc = computed(() => {
  if (!secret.value.trim()) return { out: null, err: '' }
  const r = totp(secret.value, {
    period: Number(periodKey.value),
    digits: Number(digitsKey.value),
    algo: algoKey.value,
    at: tick.value,
  })
  if (!r.ok) return { out: null, err: r.error }
  return { out: r, err: '' }
})
const code = computed(() => codeCalc.value.out)
const error = computed(() => codeCalc.value.err)

const keyBytes = computed(() => {
  try {
    return base32Decode(secret.value).length
  } catch (e) {
    return 0
  }
})

const expireText = computed(() => (code.value ? formatDate(code.value.expiresAt, 'HH:mm:ss') : '—'))

const checkResult = computed(() => {
  if (!checkCode.value || !secret.value.trim()) return null
  const r = verifyTotp(secret.value, checkCode.value, {
    period: Number(periodKey.value),
    digits: Number(digitsKey.value),
    algo: algoKey.value,
    at: tick.value,
  })
  return r.ok ? r : { matched: false, explain: r.error }
})

function makeSecret() {
  secret.value = randomSecret(20)
  toast('已生成一串随机密钥')
}

function paste() {
  uni.getClipboardData({
    success(res) {
      if (!res.data) {
        toast('剪贴板是空的')
        return
      }
      const raw = String(res.data).trim()
      // 粘贴的可能是 otpauth:// 链接，尝试从中抽密钥
      if (/^otpauth:\/\//i.test(raw)) {
        const s = secretFromUri(raw)
        if (s) {
          secret.value = s
          toast('已从 otpauth 链接里取出密钥')
          return
        }
      }
      secret.value = raw
    },
    fail() {
      toast('读取失败')
    },
  })
}

// 换了位数/算法后清掉校验输入，避免误判
watch([digitsKey, algoKey, periodKey], () => {
  checkCode.value = ''
})
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 20rpx;
}
.code {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 30rpx 24rpx 18rpx;
}
.code__t {
  font-size: 68rpx;
  font-weight: 700;
  font-family: Menlo, Consolas, monospace;
  letter-spacing: 6rpx;
  color: var(--pk-text);
}
.bar {
  height: 8rpx;
  margin: 0 24rpx 16rpx;
  border-radius: 4rpx;
  background: var(--pk-seg-bg);
  overflow: hidden;
}
.bar__fill {
  height: 8rpx;
  background: var(--pk-accent);
  transition: width 0.9s linear;
}
</style>
