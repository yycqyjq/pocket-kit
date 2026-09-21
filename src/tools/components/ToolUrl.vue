<template>
  <view>
    <PkCard padded>
      <PkField v-model="input" type="textarea" :area-height="100" label="URL">
        <template #labelRight>
          <text class="mini-act" @tap="input = SAMPLE_URL">示例</text>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <PkRow label="结果" :value="error ? error : '解析完成'" :color="error ? 'var(--pk-danger)' : 'var(--pk-accent)'" :copy="false" />
    </PkCard>

    <template v-if="!error && parsed">
      <PkCard v-if="parsed.warnings.length" title="安全提醒" accent="var(--pk-danger)">
        <view v-for="(w, i) in parsed.warnings" :key="i" class="warn">
          <text class="warn__t">{{ w }}</text>
        </view>
      </PkCard>

      <PkCard title="拆解" accent="var(--pk-accent)">
        <PkRow
          v-for="r in segments"
          :key="r[0]"
          :label="r[0]"
          :value="r[1]"
          :mono="r[0] === '协议' || r[0] === '主机' || r[0] === '路径'"
        />
        <PkRow v-if="segments.length" label="备注" :value="segmentNotes" :copy="false" stack />
      </PkCard>

      <PkCard title="查询参数" accent="#4A6FA5">
        <template #extra>
          <text class="mini-act" @tap="copyText(paramText)">复制</text>
        </template>
        <view v-if="parsed.params.length" class="params">
          <view v-for="(p, i) in parsed.params" :key="i" class="param">
            <text class="param__k">{{ p.key }}</text>
            <text class="param__eq">=</text>
            <text class="param__v" selectable>{{ p.value === '' ? '（空值）' : p.value }}</text>
          </view>
        </view>
        <PkRow v-else label="参数" value="这个地址没有查询参数" :copy="false" stack />
        <PkRow v-if="parsed.params.length" label="参数个数" :value="parsed.params.length + ' 个'" :copy="false" />
      </PkCard>

      <PkCard title="编码与解码" accent="#6B5B95">
        <PkField v-model="codeText" type="textarea" :area-height="90" placeholder="输入要编码/解码的文本" />
        <view class="act-row">
          <PkBtn text="编码" kind="primary" @tap="doEncode" />
          <PkBtn text="解码" kind="soft" @tap="doDecode" />
          <PkBtn text="复制结果" kind="ghost" @tap="copyText(codeOut)" />
        </view>
        <PkRow label="结果" :value="codeOut" mono :copy="!!codeOut" />
        <PkRow label="说明" value="编码会把空格变 %20、& 变 %26 等；解码是反过来，遇到坏的百分号编码会保留原样不报错" :copy="false" stack />
      </PkCard>
    </template>

    <PkCard title="恶意链接无害化" accent="#8A6D3B">
      <PkField v-model="defangText" type="textarea" :area-height="80" placeholder="粘贴可疑链接" />
      <view class="act-row">
        <PkBtn text="无害化" kind="soft" @tap="doDefang" />
        <PkBtn text="还原" kind="ghost" @tap="doRefang" />
      </view>
      <PkRow label="结果" :value="defangOut" mono :copy="!!defangOut" />
      <PkRow label="用途" value="把 https:// 写成 hxxps[:]//、点写成 [.]，这样发出去时不会被聊天软件自动变成可点击链接——分享可疑样例时常用" :copy="false" stack />
    </PkCard>

    <PkCard title="看不懂的字段" accent="var(--pk-warn)">
      <PkRow label="来源 origin" value="协议 + 主机 + 端口，不含路径。跨域判断就是比这个" :copy="false" stack />
      <PkRow label="锚点 hash" value="# 后面的部分只在浏览器本地用，不会发给服务器" :copy="false" stack />
      <PkRow label="用户名密码" value="user:pass@ 这种写法会把凭证暴露在日志和 Referer 里，不要用" :copy="false" stack />
      <PkRow label="默认端口" value="http 是 80、https 是 443，写不写都一样" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { parseUrl, urlSegments, encodeUrl, decodeUrl, defang, refang, buildQuery, SAMPLE_URL } from '@/utils/url'
import { copyText, toast } from '@/utils/clipboard'

const input = ref(SAMPLE_URL)
const codeText = ref('')
const codeOut = ref('')
const defangText = ref('')
const defangOut = ref('')

const result = computed(() => {
  if (!input.value.trim()) return { parsed: null, segments: [], error: '' }
  try {
    const r = urlSegments(input.value)
    return { parsed: r.parsed, segments: r.rows, error: '' }
  } catch (e) {
    return { parsed: null, segments: [], error: e.message }
  }
})
const parsed = computed(() => result.value.parsed)
const segments = computed(() => result.value.segments)
const error = computed(() => result.value.error)

const segmentNotes = computed(() => {
  const p = parsed.value
  if (!p) return ''
  const parts = []
  if (p.isIpHost) parts.push('主机是 IP 地址')
  if (p.schemeAdded) parts.push('原文本没写协议，已自动补 https://')
  if (p.params.length) parts.push('查询参数里如果有重复的键，服务器拿到的是数组')
  return parts.join('；') || '没有特别需要注意的地方'
})

const paramText = computed(() => {
  if (!parsed.value) return ''
  return parsed.value.params.map((p) => p.key + '=' + p.value).join('\n')
})

function doEncode() {
  codeOut.value = encodeUrl(codeText.value)
}
function doDecode() {
  codeOut.value = decodeUrl(codeText.value)
}
function doDefang() {
  if (!defangText.value) return toast('先粘贴链接')
  defangOut.value = defang(defangText.value)
}
function doRefang() {
  if (!defangText.value) return toast('先粘贴内容')
  defangOut.value = refang(defangText.value)
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
.warn {
  margin: 8rpx 24rpx 14rpx;
  padding: 14rpx 18rpx;
  border-radius: var(--pk-radius-sm);
  background: rgba(180, 85, 62, 0.1);
}
.warn__t {
  font-size: 24rpx;
  color: var(--pk-danger);
  line-height: 1.6;
}
.params {
  padding: 4rpx 24rpx 10rpx;
}
.param {
  display: flex;
  align-items: baseline;
  padding: 12rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.param:last-child {
  border-bottom: none;
}
.param__k {
  font-size: 24rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-accent);
  min-width: 200rpx;
  word-break: break-all;
}
.param__eq {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin: 0 12rpx;
}
.param__v {
  flex: 1;
  font-size: 24rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
  word-break: break-all;
}
.act-row {
  display: flex;
  gap: 18rpx;
  flex-wrap: wrap;
  padding: 8rpx 0 12rpx;
}
</style>
