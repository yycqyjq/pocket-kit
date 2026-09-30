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
        <PkRow v-for="(t, i) in result.notes" :key="'n' + i" label="备注" :value="t" :copy="false" stack />
      </PkCard>

      <PkCard title="逐标签拆解" accent="#4A6FA5">
        <view v-for="(l, i) in result.labels" :key="'a' + i" class="label">
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
        <PkRow label="单标签" value="最长 63 个字符（按 Punycode 形式算），超了本页报错" :copy="false" stack />
        <PkRow label="整个域名" value="最长 253 个字符，同样报错，不会给你一个存不进 DNS 的结果" :copy="false" stack />
        <PkRow label="为什么" value="DNS 的底层协议里，一个标签就是一个「长度字节 + 内容」，长度字节只有 1 字节" :copy="false" stack />
        <PkRow label="全角字符" value="先按 NFKC 折成基本形式再转（跟浏览器、注册局同一条尺），折了会在备注里说清了哪一串折成哪一串——「ａｐｐｌｅ．ｃｏｍ」折完就是 apple.com" :copy="false" stack />
        <PkRow label="大小写" value="DNS 本来就不区分大小写，整串先折成小写再转；xn-- 那一段必须全小写才对得上，所以带大写的 xn-- 一样算错" :copy="false" stack />
        <PkRow label="只剩数字" value="「１２３」这种折完只剩数字和点的，不是一段域名。浏览器会把它按 IPv4 简写换算成别的地址，那件事「URL 拆解」那一页说了" :copy="false" stack />
        <PkRow label="Emoji" value="按算法能编出 xn--，能不能真注册、别人那边怎么显示，本页不答——它只做编码转换" :copy="false" stack />
      </PkCard>

      <PkCard title="哪些域名能转" accent="#6B5B95">
        <PkRow label="能" value="中文、日文、韩文、德文变音、俄文等非 ASCII 字符组成的标签；下划线开头（_dmarc、_smtp._tcp 这类服务记录名）" :copy="false" stack />
        <PkRow label="不能" value="有空格或控制字符、零宽字符、下划线不在开头（或者跟中文混在同一个标签里）、连字符在开头结尾、第 3、4 位都是连字符、空标签（连续两个点）、编码后超 63 或整域名超 253" :copy="false" stack />
        <PkRow label="还要能对上" value="写了 xn-- 的标签必须能解回去、解出来再编回来得是同一串；解出来全是 ASCII 的（xn--a 那种）也算错" :copy="false" stack />
        <PkRow label="注意" value="本页做的是「编码转换」：不查 TLD 是否真存在，也没有注册局那张「哪些字符允许进域名」的表，同形异义那些判定更不做" :copy="false" stack />
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
import { convert as punyConvert, PUNY_SAMPLES } from '@/utils/punycode'
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
