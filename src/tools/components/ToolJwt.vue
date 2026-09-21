<template>
  <view>
    <PkCard padded>
      <PkField v-model="token" type="textarea" :area-height="140" placeholder="粘贴 JWT（可以带 Bearer 前缀）">
        <template #labelRight>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="token = ''">清空</text>
        </template>
      </PkField>
      <PkRow v-if="token" label="段数" :value="segments + ' 段'" :copy="false" />
    </PkCard>

    <PkCard v-if="error" title="解析失败" accent="var(--pk-danger)">
      <PkRow label="原因" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <template v-else-if="data">
      <PkCard title="令牌概况" accent="var(--pk-accent)">
        <PkRow label="签名算法" :value="data.alg" big />
        <PkRow label="算法家族" :value="data.algInfo.family" :copy="false" />
        <PkRow label="有效性" :value="data.status" :color="data.statusTone === 'bad' ? 'var(--pk-danger)' : data.statusTone === 'warn' ? 'var(--pk-warn)' : 'var(--pk-accent)'" :copy="false" />
        <PkRow label="签名长度" :value="data.hasSignature ? data.sigBytes + ' 字节' : '无签名'" :copy="false" />
        <PkRow label="算法说明" :value="data.algInfo.note" :copy="false" stack />
        <view v-for="(w, i) in data.warnings" :key="i" class="warn">
          <text class="warn__t">{{ w }}</text>
        </view>
      </PkCard>

      <PkCard title="载荷声明" accent="#4A6FA5">
        <view v-for="c in data.claims" :key="c.key" class="claim">
          <view class="claim__head">
            <text class="claim__k">{{ c.key }}</text>
            <text v-if="c.badge" class="claim__badge" :class="'claim__badge--' + c.tone">{{ c.badge }}</text>
            <text class="claim__copy" @tap="copyText(String(c.raw))">复制</text>
          </view>
          <text class="claim__v" selectable>{{ c.raw }}</text>
          <text v-if="c.time" class="claim__time">{{ c.time }}</text>
          <text v-if="c.doc" class="claim__doc">{{ c.doc }}</text>
        </view>
      </PkCard>

      <PkCard title="头部 JSON" accent="#6B5B95">
        <template #extra>
          <text class="mini-act" @tap="copyText(data.headerText)">复制</text>
        </template>
        <PkField v-model="headerView" type="textarea" :area-height="120" />
      </PkCard>

      <PkCard title="载荷 JSON" accent="#6B5B95">
        <template #extra>
          <text class="mini-act" @tap="copyText(data.payloadText)">复制</text>
        </template>
        <PkField v-model="payloadView" type="textarea" :area-height="200" />
      </PkCard>

      <PkCard title="重要提醒" accent="var(--pk-warn)">
        <PkRow
          label="本工具只解码"
          value="不做签名验证。Base64URL 是纯编码不是加密，任何人都能解开看内容——所以 JWT 里不能放敏感数据"
          :copy="false"
          stack
        />
        <PkRow
          label="服务端必须验签"
          value="只解码不验签是常见的严重漏洞：攻击者改掉 payload 里的用户 ID 就能冒充别人"
          :copy="false"
          stack
        />
        <PkRow
          label="alg 别信客户端"
          value="算法必须由服务端白名单指定，否则会被 alg=none 或 HS/RS 混淆攻击绕过"
          :copy="false"
          stack
        />
      </PkCard>

      <PkCard title="标准声明" accent="#2F8C7A">
        <PkRow v-for="r in JWT_CLAIMS_REF" :key="r.key" :label="r.key" :value="r.desc" :copy="false" stack />
      </PkCard>
    </template>

    <PkCard v-else title="等一个 JWT" accent="var(--pk-accent)">
      <PkRow label="形如" value="xxxxx.yyyyy.zzzzz —— 三段 Base64URL，用点分隔" :copy="false" stack />
      <PkRow label="能看什么" value="签名算法、过期时间、用户身份等声明，以及是否已过期" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { decodeJwt, JWT_CLAIMS_REF } from '@/utils/jwt'
import { copyText, toast } from '@/utils/clipboard'

const token = ref('')

const segments = computed(() => String(token.value).trim().replace(/^Bearer\s+/i, '').split('.').length)

const parsed = computed(() => {
  if (!token.value.trim()) return { data: null, error: '' }
  try {
    return { data: decodeJwt(token.value), error: '' }
  } catch (e) {
    return { data: null, error: e.message }
  }
})
const data = computed(() => parsed.value.data)
const error = computed(() => parsed.value.error)
const headerView = computed(() => (data.value ? data.value.headerText : ''))
const payloadView = computed(() => (data.value ? data.value.payloadText : ''))

function paste() {
  uni.getClipboardData({
    success(res) {
      if (res.data) token.value = String(res.data).trim()
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
  margin-left: 24rpx;
}
.warn {
  margin: 8rpx 24rpx 14rpx;
  padding: 14rpx 18rpx;
  border-radius: 12rpx;
  background: rgba(168, 100, 47, 0.12);
}
.warn__t {
  font-size: 23rpx;
  color: var(--pk-warn);
  line-height: 1.6;
}
.claim {
  padding: 18rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.claim:last-child {
  border-bottom: none;
}
.claim__head {
  display: flex;
  align-items: center;
}
.claim__k {
  font-size: 25rpx;
  color: var(--pk-text-2);
  font-family: Menlo, Consolas, monospace;
  flex: 1;
}
.claim__badge {
  font-size: 20rpx;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  margin-right: 14rpx;
}
.claim__badge--ok {
  color: var(--pk-accent);
  background: rgba(63, 122, 110, 0.12);
}
.claim__badge--bad {
  color: var(--pk-danger);
  background: rgba(180, 85, 62, 0.12);
}
.claim__copy {
  font-size: 21rpx;
  color: var(--pk-text-2);
  padding: 8rpx 16rpx;
  border: var(--pk-line-w) solid var(--pk-line-strong);
  border-radius: 10rpx;
}
.claim__v {
  display: block;
  font-size: 25rpx;
  color: var(--pk-text);
  font-family: Menlo, Consolas, monospace;
  word-break: break-all;
  margin-top: 10rpx;
  line-height: 1.6;
}
.claim__time {
  display: block;
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-top: 8rpx;
}
.claim__doc {
  display: block;
  font-size: 21rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
}
</style>
