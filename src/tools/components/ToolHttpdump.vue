<template>
  <view>
    <PkCard padded>
      <PkField v-model="input" type="textarea" :area-height="220" label="原始 HTTP 报文">
        <template #labelRight>
          <text class="mini-act" @tap="input = HTTP_SAMPLE">请求示例</text>
          <text class="mini-act" @tap="input = HTTP_RESPONSE_SAMPLE">响应示例</text>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
        </template>
      </PkField>
      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <template v-if="!error && data">
      <PkCard title="起始行" :accent="data.kind === 'request' ? 'var(--pk-accent)' : '#4A6FA5'">
        <template v-if="data.kind === 'request'">
          <PkRow label="方法" :value="data.startLine.method" big />
          <PkRow label="路径" :value="data.startLine.path" mono />
          <PkRow v-if="data.startLine.query" label="查询串" :value="data.startLine.query" mono />
          <PkRow label="版本" :value="data.startLine.version" :copy="false" />
        </template>
        <template v-else>
          <PkRow label="版本" :value="data.startLine.version" :copy="false" />
          <PkRow label="状态码" :value="data.startLine.code + ' ' + data.startLine.reason" big />
          <PkRow v-if="data.startLine.reasonCn" label="含义" :value="data.startLine.reasonCn" :copy="false" />
        </template>
      </PkCard>

      <PkCard :title="'头部（' + data.headerCount + '）'" accent="#4A6FA5">
        <template #extra>
          <text class="mini-act" @tap="copyText(toTable(data))">复制字段表</text>
        </template>
        <view v-for="(h, i) in data.headers" :key="i" class="hdr">
          <view class="hdr__head">
            <text class="hdr__n" selectable>{{ h.name }}</text>
            <text v-if="h.risky" class="hdr__risky">敏感</text>
          </view>
          <text class="hdr__v" selectable>{{ h.value }}</text>
          <text v-if="h.note" class="hdr__note">{{ h.note }}</text>
        </view>
      </PkCard>

      <PkCard v-if="data.cookies.length" title="Cookie 拆解" accent="#6B5B95">
        <PkRow
          v-for="(c, i) in data.cookies"
          :key="i"
          :label="c.name"
          :value="c.value === '' ? '（空）' : c.value"
        />
      </PkCard>

      <PkCard title="正文" accent="#8A6D3B">
        <PkRow label="类型" :value="data.bodyKind" :copy="false" />
        <PkRow label="字节数" :value="data.bodyBytes + ' 字节'" :copy="false" />
        <PkRow v-if="data.bodyFormat" label="解析" :value="data.bodyFormat" :copy="false" stack />
        <view v-if="data.body" class="body">
          <text class="body__t" selectable>{{ data.body }}</text>
        </view>
      </PkCard>

      <PkCard v-if="data.warnings.length" title="提醒" accent="var(--pk-danger)">
        <view v-for="(w, i) in data.warnings" :key="i" class="warn">
          <text class="warn__t">{{ w }}</text>
        </view>
      </PkCard>
    </template>

    <PkCard title="这能拿来做什么" accent="#6B5B95">
      <PkRow label="排查接口" value="从 DevTools 的 Copy as cURL / 复制响应里拿到报文，粘进来看参数与头部" :copy="false" stack />
      <PkRow label="看 Cookie" value="Cookie 会被逐个拆开，一眼就能看出哪些是会话凭证" :copy="false" stack />
      <PkRow label="理解字段" value="常见头部都带了说明，特别是缓存、CORS 与认证相关的几个" :copy="false" stack />
      <PkRow label="⚠️ 隐私" value="报文里常带 Cookie、Token、Authorization——分享给别人前先删掉这几行" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { parseHttp, toTable, HTTP_SAMPLE, HTTP_RESPONSE_SAMPLE } from '@/utils/httpdump'
import { copyText, toast } from '@/utils/clipboard'

const input = ref(HTTP_SAMPLE)

const parsed = computed(() => {
  if (!input.value.trim()) return { data: null, error: '' }
  try {
    return { data: parseHttp(input.value), error: '' }
  } catch (e) {
    return { data: null, error: e.message }
  }
})
const data = computed(() => parsed.value.data)
const error = computed(() => parsed.value.error)

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
  margin-left: 18rpx;
}
.hdr {
  padding: 14rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.hdr:last-child {
  border-bottom: none;
}
.hdr__head {
  display: flex;
  align-items: baseline;
}
.hdr__n {
  font-size: 24rpx;
  color: var(--pk-accent);
  font-family: Menlo, Consolas, monospace;
  word-break: break-all;
  flex: 1;
}
.hdr__risky {
  font-size: 20rpx;
  color: var(--pk-danger);
  padding: 2rpx 12rpx;
  border-radius: 999rpx;
  background: rgba(180, 85, 62, 0.12);
}
.hdr__v {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text);
  font-family: Menlo, Consolas, monospace;
  word-break: break-all;
  margin-top: 6rpx;
  line-height: 1.6;
}
.hdr__note {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
  line-height: 1.6;
}
.body {
  margin: 8rpx 24rpx 18rpx;
  padding: 18rpx;
  border-radius: var(--pk-radius-md);
  background: var(--pk-input);
  border: var(--pk-line-w) solid var(--pk-line);
  overflow: hidden;
}
.body__t {
  font-size: 22rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text-2);
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-all;
}
.warn {
  margin: 10rpx 24rpx 16rpx;
  padding: 14rpx 18rpx;
  border-radius: var(--pk-radius-sm);
  background: rgba(180, 85, 62, 0.1);
}
.warn__t {
  font-size: 22rpx;
  color: var(--pk-danger);
  line-height: 1.7;
}
</style>
