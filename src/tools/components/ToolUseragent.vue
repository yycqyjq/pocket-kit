<template>
  <view>
    <PkCard title="粘贴 User-Agent" accent="#2F7A8C">
      <PkField v-model="text" placeholder="Mozilla/5.0 (Windows NT 10.0; Win64; x64) …" :area-height="200" />
      <view class="act-row">
        <PkBtn text="读本机 UA" kind="soft" @tap="readLocal" />
        <PkBtn text="清空" kind="ghost" @tap="text = ''" />
      </view>
      <view class="quick-row">
        <text v-for="(s, i) in UA_SAMPLES" :key="s.name" class="quick-i" @tap="text = S(i)">{{ s.name }}</text>
      </view>
      <PkRow v-if="error" label="解析不了" :value="error" color="var(--pk-danger)" :copy="false" stack />
      <text v-if="!text" class="tip">支持任意字符串：浏览器地址栏、Nginx 日志里的字段、Postman 抓到的请求头都能粘。中文或伪造的 UA 也照样给结论。</text>
    </PkCard>

    <PkCard v-if="info" title="识别结果" accent="var(--pk-accent)">
      <view class="hero">
        <text class="hero__big">{{ info.browser.name }}{{ info.browser.version ? ' ' + info.browser.version : '' }}</text>
        <text class="hero__sub">{{ info.device.kindName }} · {{ info.os.name }}{{ info.os.version ? ' ' + info.os.version : '' }}</text>
      </view>
      <view v-if="info.bot.isBot" class="bot">
        <text class="bot__t">爬虫 / 脚本客户端：{{ info.bot.who }}</text>
        <text class="bot__d">依据令牌「{{ info.bot.token }}」</text>
      </view>
      <PkRow v-for="f in info.fields" :key="f.k" :label="f.k" :value="f.v" :copy="false" stack />
      <view class="notes">
        <text v-for="(t, i) in info.trust" :key="i" class="note">· {{ t }}</text>
      </view>
    </PkCard>

    <PkCard v-if="info" title="逐段拆解：这一段凭什么存在" accent="#4A6FA5">
      <text class="tip">UA 的历史包袱几乎全在「兼容占位」里 —— 下面逐段说明它是干什么的、为什么不能信。</text>
      <view class="segs">
        <view v-for="(s, i) in info.segments" :key="i" class="seg">
          <view class="seg__head">
            <text class="seg__kind">{{ s.kind }}</text>
            <text class="seg__pos">第 {{ s.index + 1 }} 字</text>
          </view>
          <text class="seg__txt">{{ s.text }}</text>
          <text class="seg__note">{{ s.note }}</text>
        </view>
      </view>
      <view class="act-row">
        <PkBtn text="复制这段 UA" kind="ghost" @tap="copy(info.raw)" />
      </view>
    </PkCard>

    <PkCard v-if="info" title="依据与结论对照" accent="#8A6D3B">
      <text class="tip">每个结论是靠哪个令牌得出来的，直接写出来方便你核对规则是不是适合你的场景。</text>
      <view class="tbl">
        <view v-for="f in info.fields" :key="f.k" class="tr">
          <text class="td td--k">{{ f.k }}</text>
          <text class="td td--v">{{ f.v }}</text>
          <text class="td td--f">{{ f.from }}</text>
          <text v-if="f.note" class="td td--n">{{ f.note }}</text>
        </view>
      </view>
    </PkCard>

    <PkCard title="生成一条 UA" accent="#3E7A4E">
      <text class="tip">调试站点兼容性时经常要「假装自己是某个浏览器」，这里按真实版式拼一条出来，拼完直接可以复制进请求头。</text>
      <PkSeg v-model="gBrowser" :items="UA_BROWSERS" />
      <view class="seg2">
        <PkSeg v-model="gPlatform" :items="UA_PLATFORMS" />
      </view>
      <PkField v-model="gVersion" label="版本号" :placeholder="genDefVersion" />
      <view class="act-row">
        <PkBtn text="生成" kind="primary" @tap="doGenerate" />
        <PkBtn text="拿去解析" kind="soft" @tap="useGenerated" />
      </view>
      <PkRow v-if="genError" label="生成失败" :value="genError" color="var(--pk-danger)" :copy="false" stack />
      <template v-if="generated">
        <view class="hero">
          <text class="hero__gen">{{ generated.ua }}</text>
        </view>
        <PkRow label="字符数" :value="generated.ua.length + ''" :copy="false" />
        <PkRow label="再解析" :value="regenSummary" :copy="false" stack />
        <view class="notes">
          <text v-for="(e, i) in generated.explain" :key="i" class="note">· {{ e }}</text>
        </view>
        <view class="act-row">
          <PkBtn text="复制" kind="ghost" @tap="copy(generated.ua)" />
        </view>
      </template>
    </PkCard>

    <PkCard title="常见爬虫令牌速查" accent="#6B5B95">
      <view class="tbl">
        <view v-for="b in UA_BOT_CHEATSHEET" :key="b.token" class="tr" @tap="text = demoBot(b.token)">
          <text class="td td--tok">{{ b.token }}</text>
          <text class="td td--who">{{ b.who }}</text>
          <text v-if="b.note" class="td td--n">{{ b.note }}</text>
        </view>
      </view>
      <text class="tip">点一行可以把示例塞进上面的输入框。这些是「愿意自报家门」的爬虫；抓取方伪造浏览器 UA 是常态，别把 UA 当身份。</text>
    </PkCard>

    <PkCard title="规则自检" accent="var(--pk-warn)">
      <text class="tip">把上面 {{ UA_SAMPLES.length }} 条真实样本喂给解析器，比对浏览器 / 内核 / 系统 / 形态 / 厂商的期望结论，并把 10 个生成模板 × 8 个平台各生成一次再解析回来。</text>
      <view class="act-row">
        <PkBtn text="跑一遍自检" kind="primary" @tap="runSelfTest" />
      </view>
      <PkRow v-if="testMsg" label="结果" :value="testMsg" :color="testOk ? 'var(--pk-accent)' : 'var(--pk-danger)'" :copy="false" stack />
      <view v-if="testRows.length" class="notes">
        <text v-for="(r, i) in testRows" :key="i" class="note" :class="{ 'note--bad': !r.ok }">{{ r.ok ? '✓ ' : '✗ ' }}{{ r.text }}</text>
      </view>
    </PkCard>

    <PkCard title="UA 的坑" accent="#8C5B3E">
      <PkRow v-for="n in UA_NOTES" :key="n.t" :label="n.t" :value="n.d" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { parseUA, buildUA, selfTest, UA_SAMPLES, UA_PLATFORMS, UA_BROWSERS, UA_BOT_CHEATSHEET, UA_NOTES } from '@/utils/useragent'
import { copyText, toast } from '@/utils/clipboard'

const text = ref('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

function S(i) {
  return UA_SAMPLES[i].ua
}

const parsed = computed(() => {
  const raw = String(text.value || '').trim()
  if (!raw) return { info: null, error: '' }
  try {
    return { info: parseUA(raw), error: '' }
  } catch (e) {
    return { info: null, error: e.message }
  }
})
const info = computed(() => parsed.value.info)
const error = computed(() => parsed.value.error)

/* ---- 本机 UA：H5 走 navigator，App 走 uni 的系统信息 ---- */
function readLocal() {
  let ua = ''
  try {
    const sys = uni.getSystemInfoSync() || {}
    ua = sys.userAgent || sys.appName || ''
  } catch (e) {
    ua = ''
  }
  if (!ua) {
    try {
      ua = (typeof navigator !== 'undefined' && navigator.userAgent) || ''
    } catch (e) {
      ua = ''
    }
  }
  if (!ua) {
    toast('这个运行环境读不到 UA')
    return
  }
  text.value = ua
  toast('已读入本机 UA')
}

/* ---- 生成器 ---- */
const gBrowser = ref('chrome')
const gPlatform = ref('windows')
const gVersion = ref('')
const generated = ref(null)
const genError = ref('')

const genDefVersion = computed(() => {
  const b = UA_BROWSERS.filter((x) => x.key === gBrowser.value)[0]
  return b ? b.def : ''
})

function doGenerate() {
  genError.value = ''
  try {
    generated.value = buildUA(gBrowser.value, gPlatform.value, gVersion.value)
  } catch (e) {
    generated.value = null
    genError.value = e.message
  }
}

const regenSummary = computed(() => {
  if (!generated.value) return ''
  try {
    const r = parseUA(generated.value.ua)
    return r.browser.name + ' ' + r.browser.version + ' · ' + r.engine.name + ' · ' + r.os.name + ' · ' + r.device.kindName
  } catch (e) {
    return '解析失败：' + e.message
  }
})

function useGenerated() {
  if (!generated.value) doGenerate()
  if (generated.value) text.value = generated.value.ua
}

function demoBot(token) {
  const first = token.split(' / ')[0]
  return 'Mozilla/5.0 (compatible; ' + first + '/2.1; +https://example.com/bot.html)'
}

function copy(v) {
  copyText(v)
  toast('已复制')
}

/* ---- 自检 ---- */
const testRows = ref([])
const testMsg = ref('')
const testOk = ref(true)

function runSelfTest() {
  const st = selfTest()
  const bad = st.rows.filter((r) => !r.ok)
  testRows.value = (bad.length ? bad : st.rows).map((r) => ({
    ok: r.ok,
    text: r.ok ? r.name + '：' + r.actual : r.name + '：' + r.actual,
  }))
  testOk.value = st.ok
  testMsg.value = st.passed + '/' + st.total + ' 项通过' + (st.ok ? '（失败项才会逐条列出，全过时展示全部）' : '')
}
</script>

<style scoped>
.seg2 {
  margin-top: 10rpx;
}
.quick-row {
  display: flex;
  flex-wrap: wrap;
  margin-top: 4rpx;
}
.quick-i {
  display: inline-block;
  font-size: 22rpx;
  color: var(--pk-accent);
  margin: 8rpx 14rpx 0 0;
  padding: 12rpx 20rpx;
  line-height: 1.3;
  border-radius: 10rpx;
  background: var(--pk-accent-soft);
}
.act-row {
  display: flex;
  gap: 20rpx;
  padding: 12rpx 24rpx 10rpx;
}
.tip {
  display: block;
  padding: 8rpx 24rpx;
  font-size: 21rpx;
  line-height: 1.8;
  color: var(--pk-text-3);
}
.hero {
  padding: 18rpx 24rpx 10rpx;
}
.hero__big {
  display: block;
  font-size: 34rpx;
  font-weight: 600;
  color: var(--pk-text);
}
.hero__sub {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
}
.hero__gen {
  font-size: 23rpx;
  font-family: Menlo, Consolas, monospace;
  line-height: 1.7;
  color: var(--pk-accent);
  word-break: break-all;
}
.bot {
  margin: 8rpx 24rpx 12rpx;
  padding: 16rpx 20rpx;
  border-radius: 12rpx;
  background: var(--pk-danger-soft);
}
.bot__t {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: var(--pk-danger);
}
.bot__d {
  display: block;
  font-size: 21rpx;
  color: var(--pk-text-2);
  margin-top: 6rpx;
}
.notes {
  padding: 6rpx 24rpx 16rpx;
}
.note {
  display: block;
  font-size: 21rpx;
  line-height: 1.8;
  color: var(--pk-text-2);
}
.note--bad {
  color: var(--pk-danger);
}
.segs {
  padding: 4rpx 24rpx 8rpx;
}
.seg {
  border-bottom: var(--pk-line-w) solid var(--pk-line);
  padding: 14rpx 0;
}
.seg__head {
  display: flex;
  align-items: center;
}
.seg__kind {
  font-size: 19rpx;
  color: var(--pk-accent);
  background: var(--pk-accent-soft);
  border-radius: 6rpx;
  padding: 4rpx 12rpx;
}
.seg__pos {
  flex: 1;
  text-align: right;
  font-size: 19rpx;
  color: var(--pk-text-3);
}
.seg__txt {
  display: block;
  font-size: 23rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
  word-break: break-all;
  margin-top: 8rpx;
  line-height: 1.6;
}
.seg__note {
  display: block;
  font-size: 21rpx;
  line-height: 1.7;
  color: var(--pk-text-3);
  margin-top: 4rpx;
}
.tbl {
  padding: 6rpx 24rpx 14rpx;
}
.tr {
  border-bottom: var(--pk-line-w) solid var(--pk-line);
  padding: 12rpx 0;
}
.td {
  display: block;
  font-size: 22rpx;
  line-height: 1.65;
}
.td--k {
  color: var(--pk-text-3);
  font-size: 20rpx;
}
.td--v {
  color: var(--pk-text);
  font-weight: 600;
}
.td--f {
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-accent);
  word-break: break-all;
}
.td--n {
  color: var(--pk-text-3);
}
.td--tok {
  font-family: Menlo, Consolas, monospace;
  font-size: 22rpx;
  color: var(--pk-text);
}
.td--who {
  color: var(--pk-accent);
}
</style>
