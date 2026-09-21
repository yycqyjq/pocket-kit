<template>
  <view>
    <!-- ================= 输入 ================= -->
    <PkCard padded>
      <PkField v-model="input" type="textarea" :area-height="200" :maxlength="200000" placeholder="粘贴 PEM：证书 / 公钥 / CSR / 私钥都行（-----BEGIN CERTIFICATE----- 那一段）">
        <template #labelRight>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="clearAll">清空</text>
        </template>
      </PkField>
      <view class="quick">
        <text v-for="s in X509_SAMPLES" :key="s.key" class="quick__i" @tap="loadSample(s.key)">{{ s.name }}</text>
      </view>
      <text class="hint">{{ sampleHint }}</text>
    </PkCard>

    <!-- ================= 出错 ================= -->
    <PkCard v-if="error" title="解析失败" accent="var(--pk-danger)">
      <PkRow label="原因" :value="error" color="var(--pk-danger)" :copy="false" stack />
      <PkRow label="常见坑" value="二进制 .cer / .der 要先转 PEM：openssl x509 -inform DER -outform PEM -in a.cer -out a.pem" :copy="false" stack />
      <PkRow label="再检查" value="BEGIN 与 END 的名字要一致，正文别漏粘行；PEM 里没有中文，中文一定是你多粘了说明" :copy="false" stack />
    </PkCard>

    <template v-else-if="data">
      <!-- ================= 概况 ================= -->
      <PkCard title="概况" :accent="overviewAccent">
        <template #extra>
          <text class="mini-act" @tap="copyText(data.pem || input.trim())">复制 PEM</text>
        </template>
        <PkRow label="识别为" :value="data.kindCn" big />
        <PkRow label="PEM 类型" :value="pemTypeText" :copy="false" />
        <PkRow label="DER 长度" :value="derLengthText" :copy="false" />
        <PkRow v-if="subjectLine" label="主体" :value="subjectLine" :copy="false" stack />
        <PkRow v-if="issuerLine" label="颁发者" :value="issuerLine" :copy="false" stack />
        <PkRow v-if="statusLine" label="有效期" :value="statusLine" :color="statusColor" :copy="false" stack />
        <PkRow v-if="keyLine" label="公钥" :value="keyLine" :copy="false" />
        <PkRow v-if="sigLine" label="签名算法" :value="sigLine" :copy="false" stack />
        <PkRow v-if="chainLine" label="链条位置" :value="chainLine" :copy="false" stack />
        <PkRow v-if="data.fingerprints" label="SHA-256 指纹" :value="data.fingerprints.sha256" mono stack />
        <view v-for="(w, i) in data.warnings || []" :key="'w' + i" class="warn">
          <text class="warn__t">{{ w }}</text>
        </view>
      </PkCard>

      <!-- ================= 私钥：只给头部 ================= -->
      <PkCard v-if="isPrivateKey" title="私钥头部（仅元信息）" accent="var(--pk-warn)">
        <PkRow v-if="data.message" label="结论" :value="data.message" color="var(--pk-danger)" :copy="false" stack />
        <PkRow v-for="(r, i) in data.rows || []" :key="'pr' + i" :label="r.k" :value="String(r.v)" :big="!!r.big" :copy="false" stack />
        <PkRow v-if="data.detail" label="说明" :value="data.detail" :copy="false" stack />
      </PkCard>

      <!-- ================= CRL ================= -->
      <PkCard v-if="isCrl" title="吊销列表内容" accent="var(--pk-warn)">
        <PkRow v-for="(r, i) in data.rows || []" :key="'cr' + i" :label="r.k" :value="String(r.v)" :copy="false" stack />
        <PkRow label="本工具不判断吊销" value="要确认某张证书是否被吊销，必须拿它的序列号在这份 CRL 里查，或联网问 OCSP。本项目离线，两者都不做" :copy="false" stack />
      </PkCard>

      <!-- ================= 主体 / 颁发者 DN ================= -->
      <PkCard v-if="hasDn" title="主体 DN（逐个属性）" accent="#4A6FA5">
        <template #extra>
          <text class="mini-act" @tap="copyText(subjectText)">复制整串</text>
        </template>
        <PkRow v-for="(a, i) in subjectAttrs" :key="'s' + i" :label="dnLabel(a)" :value="a.value" mono stack />
        <PkRow v-if="!subjectAttrs.length" label="主体" value="（空）" :copy="false" />
      </PkCard>

      <PkCard v-if="issuerAttrs.length" title="颁发者 DN（逐个属性）" accent="#4A6FA5">
        <template #extra>
          <text class="mini-act" @tap="copyText(issuerText)">复制整串</text>
        </template>
        <PkRow v-for="(a, i) in issuerAttrs" :key="'i' + i" :label="dnLabel(a)" :value="a.value" mono stack />
      </PkCard>

      <!-- ================= 有效期 ================= -->
      <PkCard v-if="isCert" title="有效期" accent="#2F8C7A">
        <PkRow label="状态" :value="data.validity.status.text" :color="statusColor" :copy="false" stack />
        <PkRow label="生效 notBefore" :value="timeText(data.validity.notBefore)" :copy="false" stack />
        <PkRow label="到期 notAfter" :value="timeText(data.validity.notAfter)" :copy="false" stack />
        <PkRow label="本机时区" :value="data.validity.tz" :copy="false" />
        <PkRow label="剩余" :value="daysText" :copy="false" />
        <PkRow label="原始 ASN.1" :value="timeRawText" :copy="false" stack />
      </PkCard>

      <!-- ================= 公钥 ================= -->
      <PkCard v-if="keyRows.length" title="公钥信息" accent="#6B5B95">
        <template #extra>
          <text v-if="data.publicKey && data.publicKey.spkiBase64" class="mini-act" @tap="copySpki">复制公钥 PEM</text>
        </template>
        <PkRow v-for="(r, i) in keyRows" :key="'k' + i" :label="r.k" :value="String(r.v)" :mono="!!r.mono" :big="!!r.big" :stack="!!r.stack" />
        <PkRow v-if="keyNote" label="说明" :value="keyNote" :copy="false" stack />
      </PkCard>

      <!-- ================= SAN + 域名试算 ================= -->
      <PkCard v-if="isCert || isCsr" title="备用名称 SAN" :accent="sanAccent">
        <template #extra>
          <text v-if="sanList.length" class="mini-act" @tap="copyText(sanJoin)">复制全部</text>
        </template>
        <PkRow v-if="isCert" label="是否 critical" :value="sanCriticalText" :copy="false" />
        <view v-for="(g, i) in sanList" :key="'g' + i" class="san">
          <view class="san__head">
            <text class="san__type">{{ g.type }}</text>
            <text class="san__copy" @tap="copyText(String(g.value))">复制</text>
          </view>
          <text class="san__v" selectable>{{ g.value }}</text>
        </view>
        <view v-if="isCert && !sanList.length" class="san-empty">
          <text class="hint">这张证书没有 SAN 扩展。现代浏览器只按 SAN 匹配域名，CN 早就不看了。</text>
        </view>

        <view class="trial">
          <PkField v-model="hostQuery" placeholder="试算域名或 IP，例如 a.example.test" :boxed="false">
            <template #labelRight>
              <text class="mini-act" @tap="hostQuery = ''">清空</text>
            </template>
          </PkField>
          <PkRow v-if="matchResult" label="本地匹配结果" :value="matchResult.text" :color="matchResult.color" :copy="false" stack />
          <PkRow v-if="matchResult && matchResult.why" label="怎么得出的" :value="matchResult.why" :copy="false" stack />
          <view v-for="(ck, i) in (matchResult && matchResult.checked) || []" :key="'ck' + i" class="checked">
            <text class="checked__n">{{ ck.hit ? '命中' : '未中' }} {{ ck.name }}</text>
            <text class="checked__w">{{ ck.why }}</text>
          </view>
          <text v-if="matchResult" class="hint">{{ matchNote }}</text>
        </view>
      </PkCard>

      <!-- ================= 扩展 ================= -->
      <PkCard v-if="extList.length" title="扩展项" accent="#B8756B">
        <view v-for="(e, i) in extList" :key="'e' + i" class="ext">
          <view class="ext__head">
            <text class="ext__name">{{ e.name || e.oid }}</text>
            <text v-if="e.critical" class="ext__badge ext__badge--crit">critical</text>
            <text v-if="!e.known" class="ext__badge ext__badge--unk">未收录</text>
            <text class="ext__copy" @tap="copyText(e.valueHex)">复制值</text>
          </view>
          <text class="ext__cn">{{ e.cn }} · {{ e.oid }}</text>
          <text v-if="e.summary" class="ext__sum" selectable>{{ e.summary }}</text>
          <text class="ext__doc">{{ e.doc }}</text>
        </view>
      </PkCard>

      <!-- ================= 指纹 ================= -->
      <PkCard v-if="data.fingerprints" title="指纹（对整份 DER 计算）" accent="#2F8C7A">
        <PkRow label="MD5" :value="data.fingerprints.md5" mono stack />
        <PkRow label="SHA-1" :value="data.fingerprints.sha1" mono stack />
        <PkRow label="SHA-256" :value="data.fingerprints.sha256" mono stack />
        <PkRow label="对指纹的意义" value="指纹只唯一标识这份字节内容：比对两份文件是否同一张证书用得上，它不说明证书可不可信" :copy="false" stack />
      </PkCard>

      <!-- ================= 能力边界 ================= -->
      <PkCard title="这台工具不做什么" accent="var(--pk-danger)">
        <PkRow v-for="(l, i) in X509_LIMITS" :key="'l' + i" :label="l.k" :value="l.v" :copy="false" stack />
      </PkCard>

      <PkCard title="常见扩展速查" accent="#4A6FA5">
        <PkRow v-for="(r, i) in X509_EXT_REF" :key="'r' + i" :label="r.k" :value="r.v" :copy="false" stack />
      </PkCard>
    </template>

    <!-- ================= 空态 ================= -->
    <PkCard v-else title="还没内容" accent="var(--pk-accent)">
      <PkRow label="能看什么" value="主体与颁发者、有效期与剩余天数、公钥类型与位数、SAN 域名清单与匹配试算、各项扩展的中文解释、MD5 / SHA-1 / SHA-256 指纹" :copy="false" stack />
      <PkRow label="支持粘贴" value="证书、公钥、CSR 直接粘；私钥只读头部（格式 / 算法 / 位数 / 是否加密），带口令的会明确拒绝" :copy="false" stack />
      <PkRow label="全程离线" value="不联网、不验签、不查吊销，也不上传任何内容" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  parseAny, matchesHost, X509_SAMPLES, X509_LIMITS, X509_EXT_REF, samplePem, PEM_TYPE_LABELS,
} from '@/utils/x509'
import { copyText, toast } from '@/utils/clipboard'

const input = ref('')
const hostQuery = ref('')

const parsed = computed(() => {
  if (!input.value.trim()) return { data: null, error: '' }
  try {
    return { data: parseAny(input.value), error: '' }
  } catch (e) {
    return { data: null, error: (e && e.message) || '解析失败' }
  }
})
const data = computed(() => parsed.value.data)
const error = computed(() => parsed.value.error)

const isCert = computed(() => !!data.value && data.value.kind === 'certificate')
const isCsr = computed(() => !!data.value && data.value.kind === 'csr')
const isCrl = computed(() => !!data.value && data.value.kind === 'crl')
const isPrivateKey = computed(() => !!data.value && data.value.kind === 'private-key')
const hasDn = computed(() => !!data.value && (isCert.value || isCsr.value))

const sampleHint = computed(() => X509_SAMPLES.map((s) => s.name + '：' + s.hint).join('　/　'))

const pemTypeText = computed(() => {
  const d = data.value
  if (!d) return ''
  const known = PEM_TYPE_LABELS.filter((x) => x.label === d.pemLabel)[0]
  return (d.pemLabel || '—') + (known ? '（' + known.cn + '）' : '（未识别的 PEM 类型）')
})

const derLengthText = computed(() => {
  const d = data.value
  if (!d) return ''
  return typeof d.derLength === 'number' ? d.derLength + ' 字节' : '—'
})

function dnFirstAttr(dn, short) {
  if (!dn || !dn.attrs) return ''
  const hit = dn.attrs.filter((a) => a.short === short)[0]
  return hit ? hit.value : dn.text || ''
}

const subjectLine = computed(() => {
  const d = data.value
  if (!d || !d.subject) return ''
  return dnFirstAttr(d.subject, 'CN')
})
const issuerLine = computed(() => {
  const d = data.value
  if (!d || !d.issuer) return ''
  return dnFirstAttr(d.issuer, 'CN')
})
const subjectAttrs = computed(() => (data.value && data.value.subject ? data.value.subject.attrs || [] : []))
const issuerAttrs = computed(() => (data.value && data.value.issuer ? data.value.issuer.attrs || [] : []))
const subjectText = computed(() => (data.value && data.value.subject ? data.value.subject.text : ''))
const issuerText = computed(() => (data.value && data.value.issuer ? data.value.issuer.text : ''))

function dnLabel(a) {
  return a.short + '　' + String(a.cn || '').split('（')[0]
}

const statusLine = computed(() => {
  const d = data.value
  if (!d || !d.validity) return ''
  return d.validity.status.text
})
const statusColor = computed(() => {
  const d = data.value
  if (!d || !d.validity) return ''
  const tone = d.validity.status.tone
  if (tone === 'bad') return 'var(--pk-danger)'
  if (tone === 'warn') return 'var(--pk-warn)'
  return 'var(--pk-accent)'
})
const overviewAccent = computed(() => {
  const d = data.value
  if (!d) return 'var(--pk-accent)'
  if (d.kind === 'private-key') return d.encrypted ? 'var(--pk-danger)' : 'var(--pk-warn)'
  if (isCert.value) {
    const tone = d.validity.status.tone
    if (tone === 'bad') return 'var(--pk-danger)'
    if (tone === 'warn') return 'var(--pk-warn)'
  }
  return 'var(--pk-accent)'
})

const keyLine = computed(() => {
  const d = data.value
  if (!d || !d.publicKey) return ''
  const p = d.publicKey
  const tail = p.curve && p.curve.name ? ' · ' + p.curve.name : ''
  return p.algo + (p.bits ? ' ' + p.bits + ' 位' : '') + tail
})
const sigLine = computed(() => {
  const d = data.value
  if (!d || !d.sigAlg) return ''
  return d.sigAlg.name + '（' + d.sigAlg.oid + '）— ' + d.sigAlg.cn
})
const chainLine = computed(() => {
  const d = data.value
  if (!d || !isCert.value) return ''
  const parts = []
  parts.push(d.selfSigned ? '自签（颁发者 = 主体）' : '他签')
  parts.push(d.ca === true ? 'CA 证书（可签发下级）' : d.ca === false ? '终端实体证书' : '未写 basicConstraints，按终端实体看待')
  if (typeof d.pathLen === 'number') parts.push('pathlen ' + d.pathLen)
  if (d.serial) parts.push('序列号 ' + d.serial.dec + '（' + d.serial.bytes + ' 字节）')
  return parts.join(' · ')
})

function timeText(t) {
  if (!t) return ''
  return t.local + '（本机） / ' + t.utc + '（UTC）'
}
const timeRawText = computed(() => {
  const d = data.value
  if (!d || !d.validity) return ''
  return d.validity.notBefore.raw + ' → ' + d.validity.notAfter.raw + '　均为 ' + d.validity.notBefore.type
})
const daysText = computed(() => {
  const d = data.value
  if (!d || !d.validity) return ''
  const s = d.validity.status
  if (s.key === 'expired') return '已过期 ' + s.daysSinceEnd + ' 天'
  if (s.key === 'future') return '还有 ' + s.daysLeft + ' 天才生效'
  return '还剩 ' + s.daysLeft + ' 天 / 全周期 ' + s.total + ' 天'
})

const keyRows = computed(() => {
  const d = data.value
  if (!d) return []
  if (d.kind === 'public-key' && d.rows) return d.rows
  return d.publicKey ? d.publicKey.rows || [] : []
})
const keyNote = computed(() => {
  const d = data.value
  if (!d) return ''
  return (d.publicKey && d.publicKey.note) || d.note || ''
})

const sanList = computed(() => {
  const d = data.value
  if (!d || !d.san) return []
  return d.san.list || []
})
const sanJoin = computed(() => sanList.value.map((g) => g.type + ' = ' + g.value).join('\n'))
const sanCriticalText = computed(() => {
  const d = data.value
  if (!d || !d.san || !d.san.present) return '无 SAN 扩展'
  return d.san.critical ? '是（浏览器必须认）' : '否（规范建议不写 critical）'
})
const sanAccent = computed(() => {
  const d = data.value
  if (!d || !isCert.value) return '#B8756B'
  return d.san && d.san.present ? '#B8756B' : 'var(--pk-warn)'
})

const extList = computed(() => {
  const d = data.value
  if (!d) return []
  if (d.extensions) return d.extensions
  if (Array.isArray(d.requested)) return d.requested
  return []
})

const matchResult = computed(() => {
  const q = String(hostQuery.value || '').trim()
  const d = data.value
  if (!q || !d || !isCert.value) return null
  try {
    const r = matchesHost(d, q)
    return {
      text: (r.matched ? '匹配' : '不匹配') + '　来源：' + r.source + (r.matchedName ? '　命中：' + r.matchedName : ''),
      color: r.matched ? 'var(--pk-accent)' : 'var(--pk-danger)',
      why: r.detail,
      checked: r.checked,
      note: r.note,
    }
  } catch (e) {
    return { text: (e && e.message) || '试算失败', color: 'var(--pk-warn)', why: '', checked: [], note: '' }
  }
})
const matchNote = computed(() => (matchResult.value ? matchResult.value.note : ''))

function loadSample(key) {
  input.value = samplePem(key)
  hostQuery.value = ''
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
function clearAll() {
  input.value = ''
  hostQuery.value = ''
}
function copySpki() {
  const b64 = data.value && data.value.publicKey ? data.value.publicKey.spkiBase64 : ''
  if (!b64) return
  copyText('-----BEGIN PUBLIC KEY-----\n' + b64 + '\n-----END PUBLIC KEY-----\n')
}
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 24rpx;
}
.quick {
  display: flex;
  flex-wrap: wrap;
  margin-top: 18rpx;
}
.quick__i {
  font-size: 22rpx;
  color: var(--pk-accent);
  background: var(--pk-accent-soft);
  border-radius: 999rpx;
  padding: 10rpx 22rpx;
  margin: 0 14rpx 12rpx 0;
}
.hint {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  line-height: 1.7;
  margin-top: 6rpx;
}
.warn {
  margin: 8rpx 24rpx 14rpx;
  padding: 14rpx 18rpx;
  border-radius: var(--pk-radius-sm);
  background: var(--pk-accent-soft);
  border-left: var(--pk-line-w) solid var(--pk-warn);
}
.warn__t {
  font-size: 24rpx;
  color: var(--pk-warn);
  line-height: 1.6;
}
.san {
  padding: 16rpx 24rpx;
  border-top: var(--pk-line-w) solid var(--pk-line);
}
.san__head {
  display: flex;
  align-items: center;
}
.san__type {
  flex: 1;
  font-size: 22rpx;
  color: var(--pk-text-3);
}
.san__copy,
.ext__copy {
  font-size: 22rpx;
  color: var(--pk-text-2);
  padding: 6rpx 16rpx;
  border: var(--pk-line-w) solid var(--pk-line-strong);
  border-radius: var(--pk-radius-sm);
}
.san__v {
  display: block;
  font-size: 26rpx;
  color: var(--pk-text);
  font-family: Menlo, Consolas, monospace;
  word-break: break-all;
  margin-top: 6rpx;
}
.san-empty {
  padding: 16rpx 24rpx;
  border-top: var(--pk-line-w) solid var(--pk-line);
}
.trial {
  padding: 18rpx 24rpx 20rpx;
  border-top: var(--pk-line-w) solid var(--pk-line-strong);
}
.checked {
  display: flex;
  align-items: baseline;
  margin-top: 10rpx;
}
.checked__n {
  font-size: 22rpx;
  color: var(--pk-text-2);
  font-family: Menlo, Consolas, monospace;
  min-width: 300rpx;
}
.checked__w {
  flex: 1;
  font-size: 22rpx;
  color: var(--pk-text-3);
  line-height: 1.6;
}
.ext {
  padding: 20rpx 24rpx;
  border-top: var(--pk-line-w) solid var(--pk-line);
}
.ext:first-child {
  border-top: none;
}
.ext__head {
  display: flex;
  align-items: center;
}
.ext__name {
  flex: 1;
  font-size: 26rpx;
  color: var(--pk-text);
  font-family: Menlo, Consolas, monospace;
  word-break: break-all;
}
.ext__badge {
  font-size: 20rpx;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  margin-right: 12rpx;
}
.ext__badge--crit {
  color: var(--pk-danger);
  background: var(--pk-danger-soft);
}
.ext__badge--unk {
  color: var(--pk-warn);
  background: var(--pk-accent-soft);
}
.ext__cn {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-2);
  margin-top: 8rpx;
}
.ext__sum {
  display: block;
  font-size: 26rpx;
  color: var(--pk-text);
  word-break: break-all;
  margin-top: 10rpx;
  line-height: 1.6;
}
.ext__doc {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 8rpx;
  line-height: 1.6;
}
</style>
