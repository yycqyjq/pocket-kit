<template>
  <view>
    <PkCard padded>
      <PkField v-model="input" type="textarea" :area-height="110" label="文本">
        <template #labelRight>
          <text class="mini-act" @tap="useSample">示例</text>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <PkRow v-if="!input" label="提示" value="贴一段含重音、全角或组合符号的文本，看看它的几种表示形式差在哪" :copy="false" stack />
    </PkCard>

    <template v-if="data">
      <PkCard title="四种规范化形式" accent="var(--pk-accent)">
        <view
          v-for="f in data.forms"
          :key="f.key"
          class="form"
          :class="{ 'form--same': f.sameAsInput }"
          hover-class="form--hover"
          @tap="pick(f)"
        >
          <view class="form__head">
            <text class="form__n">{{ f.name }}</text>
            <text class="form__len">{{ f.length }} 个字符</text>
            <text v-if="f.sameAsInput" class="form__tag">与输入一致</text>
          </view>
          <text class="form__t" selectable>{{ f.text === '' ? '（空）' : f.text }}</text>
          <text class="form__p">{{ f.points }}</text>
          <text class="form__note">{{ f.note }}</text>
        </view>
      </PkCard>

      <PkCard v-if="data.distinctCount > 1" title="⚠️ 四种形式并不相同" accent="var(--pk-danger)">
        <PkRow
          label="为什么"
          value="这说明这段文本里存在「可有多种表示」的字符。做搜索、去重、比对之前，务必先统一规范化方向"
          :copy="false"
          stack
        />
      </PkCard>

      <PkCard title="逐字符体检" accent="#6B5B95">
        <view v-for="c in inspect.rows" :key="c.index" class="ch">
          <view class="ch__head">
            <text class="ch__idx">{{ c.index }}</text>
            <text class="ch__char">{{ c.char }}</text>
            <text class="ch__hex">{{ c.hex }}</text>
            <text class="ch__kind" :class="{ 'ch__kind--warn': c.suspect }">{{ c.cls }}</text>
          </view>
          <text v-if="c.nfkcChanged" class="ch__nfkc">NFKC 后变成：{{ c.nfkcText }}</text>
          <text v-if="c.note" class="ch__note">{{ c.note }}</text>
        </view>
      </PkCard>
    </template>

    <PkCard title="四种形式分别用在哪" accent="#4A6FA5">
      <PkRow label="NFC" value="存储与传输的首选。字符数最少，跨系统拷贝时最不容易出问题" :copy="false" stack />
      <PkRow label="NFD" value="macOS 文件系统用它。Windows 的文件名是 NFC，跨系统拷贝会「变」" :copy="false" stack />
      <PkRow label="NFKC" value="搜索与去重首选：全角转半角、圈号变数字、连字拆开" :copy="false" stack />
      <PkRow label="NFKD" value="最彻底的分解，做拼音检索、音译比对时用它" :copy="false" stack />
      <PkRow label="什么时候选错" value="NFKC / NFKD 是有损的：① 变 1、ﬁ 变 fi，改完回不去。要保留原样就别用 K 系列" :copy="false" stack />
    </PkCard>

    <PkCard title="经典坑：é 的两种写法" accent="var(--pk-warn)">
      <PkRow label="写法一" value="U+00E9 —— 一个码点表示完整的 é" :copy="false" stack />
      <PkRow label="写法二" value="U+0065（e）+ U+0301（组合尖音符号）—— 两个码点" :copy="false" stack />
      <PkRow label="后果" value="肉眼看完全一样，但字符串长度不同、哈希不同、=== 比对为 false" :copy="false" stack />
      <PkRow label="解法" value="比对前统一 normalize('NFC')；搜索场景用 NFKC 更彻底" :copy="false" stack />
      <PkRow label="西里尔的坑" value="拉丁 a（U+0061）与西里尔 а（U+0430）是不同码点，规范化也不会统一——这是钓鱼域名的常用手法" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { check, NORMALIZE_SAMPLES } from '@/utils/normalize'
import { copyText, toast } from '@/utils/clipboard'

const input = ref('')
const picked = ref('')

const data = computed(() => {
  if (!input.value) return null
  try {
    return check(input.value)
  } catch (e) {
    return null
  }
})

const inspect = computed(() => (data.value ? data.value.inspect : { rows: [], counts: {}, hasSuspect: false }))

function pick(f) {
  picked.value = f.text
  copyText(f.text)
  toast('已复制 ' + f.name + ' 形式')
}

function useSample() {
  const s = NORMALIZE_SAMPLES[Math.floor(Math.random() * NORMALIZE_SAMPLES.length)]
  input.value = s.value
}

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
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 22rpx;
}
.form {
  padding: 16rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.form--same {
  background: var(--pk-accent-soft);
}
.form--hover {
  opacity: 0.6;
}
.form__head {
  display: flex;
  align-items: center;
}
.form__n {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--pk-text);
  flex: 1;
}
.form__len {
  font-size: 21rpx;
  color: var(--pk-text-3);
  margin-right: 14rpx;
}
.form__tag {
  font-size: 20rpx;
  color: var(--pk-accent);
}
.form__t {
  display: block;
  font-size: 26rpx;
  color: var(--pk-text);
  margin-top: 8rpx;
  word-break: break-all;
  font-family: Menlo, Consolas, monospace;
}
.form__p {
  display: block;
  font-size: 20rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
  font-family: Menlo, Consolas, monospace;
  word-break: break-all;
}
.form__note {
  display: block;
  font-size: 21rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
  line-height: 1.6;
}
.ch {
  padding: 14rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.ch:last-child {
  border-bottom: none;
}
.ch__head {
  display: flex;
  align-items: baseline;
}
.ch__idx {
  font-size: 20rpx;
  color: var(--pk-text-3);
  min-width: 52rpx;
}
.ch__char {
  font-size: 28rpx;
  color: var(--pk-text);
  min-width: 60rpx;
}
.ch__hex {
  font-size: 23rpx;
  color: var(--pk-accent);
  font-family: Menlo, Consolas, monospace;
  min-width: 110rpx;
}
.ch__kind {
  flex: 1;
  font-size: 22rpx;
  color: var(--pk-text-3);
}
.ch__kind--warn {
  color: var(--pk-warn);
}
.ch__nfkc {
  display: block;
  font-size: 21rpx;
  color: var(--pk-warn);
  margin-top: 6rpx;
  font-family: Menlo, Consolas, monospace;
}
.ch__note {
  display: block;
  font-size: 21rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
  line-height: 1.6;
}
</style>
