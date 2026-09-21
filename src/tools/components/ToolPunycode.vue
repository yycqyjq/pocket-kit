<template>
  <view>
    <PkCard padded>
      <PkField v-model="input" label="域名" placeholder="中文.cn 或 xn--fiq228c.cn">
        <template #labelRight>
          <text class="mini-act" @tap="useSample">示例</text>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <template v-if="!error && result">
      <PkCard title="双向结果" accent="var(--pk-accent)">
        <view class="pair">
          <text class="pair__k">可读形式</text>
          <text class="pair__v" selectable>{{ result.unicode || '—' }}</text>
          <text class="pair__copy" @tap="copyText(result.unicode)">复制</text>
        </view>
        <view class="pair">
          <text class="pair__k">Punycode 形式</text>
          <text class="pair__v" selectable>{{ result.ascii || '—' }}</text>
          <text class="pair__copy" @tap="copyText(result.ascii)">复制</text>
        </view>
        <PkRow label="方向" :value="result.direction" :copy="false" stack />
      </PkCard>

      <PkCard title="逐标签拆解" accent="#4A6FA5">
        <view v-for="(l, i) in result.asciiLabels" :key="'a' + i" class="label">
          <text class="label__in">{{ l.input }}</text>
          <text class="label__arrow">→</text>
          <text class="label__out">{{ l.output }}</text>
          <text class="label__note">{{ l.note }}</text>
        </view>
      </PkCard>

      <PkCard title="安全提醒" accent="var(--pk-danger)">
        <view class="warn">
          <text class="warn__t">同形异义钓鱼（Homograph Attack）</text>
          <text class="warn__t2">西里尔字母「а」与拉丁字母「a」长得一模一样，但码点不同。攻击者注册一个用西里尔字母拼的「apple.com」，浏览器显示出来完全一样，实际指向的是另一个网站。</text>
        </view>
        <PkRow
          label="怎么防"
          value="看到 xn-- 开头的域名多留个心眼；浏览器地址栏点开可以看真实形式；关键操作直接输网址而不要点链接"
          :copy="false"
          stack
        />
      </PkCard>

      <PkCard title="规范限制" accent="#8A6D3B">
        <PkRow label="单标签" value="最长 63 个字符（按 Punycode 形式算）" :copy="false" stack />
        <PkRow label="整个域名" value="最长 253 个字符" :copy="false" stack />
        <PkRow label="为什么" value="DNS 的底层协议里，一个标签就是一个「长度字节 + 内容」，长度字节只有 1 字节" :copy="false" stack />
        <PkRow label="Emoji 域名" value="技术上能注册，但 emoji 不是合法的国际化域名字符，浏览器会拒绝" :copy="false" stack />
      </PkCard>

      <PkCard title="哪些域名能转" accent="#6B5B95">
        <PkRow label="能" value="中文、日文、韩文、德文变音、俄文等非 ASCII 字符组成的标签" :copy="false" stack />
        <PkRow label="不能" value="含空格、下划线开头结尾、超过 63 字符、纯 emoji 的标签" :copy="false" stack />
        <PkRow label="注意" value="本工具做的是「编码转换」，不校验是否为合法的 TLD" :copy="false" stack />
      </PkCard>
    </template>

    <PkCard title="什么是 Punycode" accent="#8C5B3E">
      <PkRow label="背景" value="DNS 只能存 ASCII 字符，所以中文域名「中文.cn」在系统里存的是 xn--fiq228c.cn" :copy="false" stack />
      <PkRow label="机制" value="RFC 3492 定义了一套把任意 Unicode 压成纯 ASCII 的算法，用 xn-- 前缀标记" :copy="false" stack />
      <PkRow label="双向" value="同一个域名有两种写法：可读形式给人看，Punycode 形式给 DNS 用，两者指向同一个网站" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { convert as punyConvert, PUNY_SAMPLES, PUNY_NOTES } from '@/utils/punycode'
import { copyText, toast } from '@/utils/clipboard'

const input = ref('中文.cn')

const result = computed(() => {
  if (!input.value.trim()) return null
  try {
    return punyConvert(input.value)
  } catch (e) {
    return { error: e.message }
  }
})

const error = computed(() => (result.value && result.value.error) || '')

function useSample() {
  const s = PUNY_SAMPLES[Math.floor(Math.random() * PUNY_SAMPLES.length)]
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
.pair {
  display: flex;
  align-items: baseline;
  padding: 16rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.pair__k {
  font-size: 22rpx;
  color: var(--pk-text-3);
  min-width: 190rpx;
  flex-shrink: 0;
}
.pair__v {
  flex: 1;
  font-size: 26rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
  word-break: break-all;
  margin-right: 14rpx;
}
.pair__copy {
  font-size: 22rpx;
  color: var(--pk-text-2);
  padding: 8rpx 16rpx;
  border: var(--pk-line-w) solid var(--pk-line-strong);
  border-radius: var(--pk-radius-sm);
}
.label {
  display: flex;
  align-items: baseline;
  padding: 14rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.label__in {
  font-size: 24rpx;
  color: var(--pk-text-2);
  font-family: Menlo, Consolas, monospace;
  word-break: break-all;
  max-width: 220rpx;
}
.label__arrow {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin: 0 12rpx;
}
.label__out {
  font-size: 24rpx;
  color: var(--pk-accent);
  font-family: Menlo, Consolas, monospace;
  word-break: break-all;
  flex: 1;
}
.label__note {
  font-size: 20rpx;
  color: var(--pk-text-3);
  margin-left: 10rpx;
  flex-shrink: 0;
}
.warn {
  margin: 10rpx 24rpx 16rpx;
  padding: 16rpx 18rpx;
  border-radius: var(--pk-radius-sm);
  background: rgba(180, 85, 62, 0.1);
}
.warn__t {
  display: block;
  font-size: 24rpx;
  color: var(--pk-danger);
  font-weight: 600;
}
.warn__t2 {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-2);
  margin-top: 8rpx;
  line-height: 1.7;
}
</style>
