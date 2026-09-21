<template>
  <view>
    <PkCard title="要编码的内容" accent="#3F5A75" padded>
      <PkField v-model="text" :area-height="200" auto-height placeholder="网址、文本、Wi-Fi 配置或名片都行" />
      <view class="quick-row">
        <text v-for="s in QR_SAMPLES" :key="s.label" class="quick-i" @tap="text = s.value">{{ s.label }}</text>
      </view>
      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard title="纠错等级与外观" accent="#3F5A75">
      <PkSeg v-model="elevel" :items="ELEVEL_INFO" />
      <text class="tip">{{ elevelDesc }}</text>
      <PkSeg v-model="scaleKey" :items="SCALE_ITEMS" />
      <PkSwitchRow v-model="inverted" title="反色（黑底白码）" desc="多数扫码枪能读，但强光下建议保持白底黑码。" />
      <view class="act-row">
        <PkBtn text="复制内容" kind="ghost" @tap="doCopy" />
        <PkBtn text="保存到相册" kind="primary" :disabled="!canSave" @tap="doSave" />
      </view>
      <PkRow v-if="saveMsg" label="保存" :value="saveMsg" color="var(--pk-warn)" :copy="false" stack />
    </PkCard>

    <PkCard v-if="qr" title="二维码" accent="var(--pk-accent)" padded>
      <view class="qr" :class="inverted ? 'qr--inv' : ''">
        <image v-if="previewUrl" class="qr__img" :src="previewUrl" mode="widthFix" />
        <PkEmpty v-else title="当前环境渲染不出预览" desc="内容与容量都是算出来的，可以「复制内容」后在别处生成，或打包成 App 再看。" />
      </view>
      <view class="meta">
        <text class="meta__i">版本 {{ qr.version }}</text>
        <text class="meta__i">{{ qr.size }} × {{ qr.size }} 模块</text>
        <text class="meta__i">{{ qr.elevel }} 级</text>
        <text class="meta__i">掩码 {{ qr.mask }}</text>
      </view>
    </PkCard>

    <PkCard v-if="qr" title="容量与结构" accent="#4A6FA5">
      <PkRow label="编码模式" :value="modeText" :copy="false" />
      <PkRow label="占用容量" :value="usedText" :copy="false" />
      <PkRow label="数据码字" :value="qr.dataCodewords + ' 字节（分成 ' + qr.blocks + ' 个分块，每块配 ' + qr.eccPerBlock + ' 字节纠错）'" :copy="false" stack />
      <PkRow label="码字总量" :value="qr.codewords + ' 字节 = 数据 ' + qr.dataCodewords + ' + 纠错 ' + qr.eccPerBlock * qr.blocks" :copy="false" stack />
      <PkRow label="比特流长度" :value="bitsText" :copy="false" stack />
      <PkRow label="掩码罚分" :value="qr.penalty + '（八种掩码里选出来的最低分）'" :copy="false" />
      <view class="segs">
        <text class="segs__t">分段明细（同种模式合并成段，段长与字符计数都按标准编码）</text>
        <view v-for="(g, i) in qr.segments" :key="i" class="segs__r">
          <text class="segs__m">{{ g.mode }}</text>
          <text class="segs__c">{{ g.chars }} 字符</text>
          <text class="segs__b">{{ g.bytes }} 字节</text>
        </view>
      </view>
      <text class="tip">{{ levelTip }}</text>
    </PkCard>

    <PkCard title="Wi-Fi 配置生成器" accent="#2F8C7A">
      <text class="tip">生成的是标准 Wi-Fi 二维码文本，扫一下就能连网；填完点「填进上方输入框」。</text>
      <PkField v-model="wifiSsid" label="网络名称 SSID" placeholder="MyRouter" />
      <PkField v-model="wifiPass" label="密码" placeholder="passw0rd" />
      <PkSeg v-model="wifiType" :items="WIFI_TYPES" />
      <PkSwitchRow v-model="wifiHidden" title="隐藏网络" desc="对应标准里的 H:true，路由器关了广播时才勾。" />
      <view class="act-row">
        <PkBtn text="生成并填入" kind="primary" @tap="useWifi" />
      </view>
      <PkRow v-if="wifiText" label="文本" :value="wifiText" mono stack />
      <PkRow v-if="wifiError" label="提示" :value="wifiError" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard title="名片 vCard 3.0" accent="#B5527A">
      <text class="tip">vCard 3.0 用 CRLF 分行，字段里的分号、逗号与换行必须转义，否则会被当成字段分隔符。</text>
      <PkField v-model="vcName" label="姓名 FN" placeholder="张三" />
      <PkField v-model="vcPhone" label="电话 TEL" type="number" placeholder="13800138000" />
      <PkField v-model="vcOrg" label="单位 ORG" placeholder="随身匣" />
      <PkField v-model="vcTitle" label="职务 TITLE" placeholder="工程师" />
      <PkField v-model="vcEmail" label="邮箱 EMAIL" placeholder="me@example.com" />
      <PkField v-model="vcUrl" label="网址 URL" placeholder="https://example.com" />
      <PkField v-model="vcAddr" label="地址 ADR" placeholder="杭州市西湖区" />
      <PkField v-model="vcNote" label="备注 NOTE" :area-height="120" auto-height />
      <view class="act-row">
        <PkBtn text="生成并填入" kind="primary" @tap="useVCard" />
      </view>
      <PkRow v-if="vcText" label="文本" :value="vcText" mono stack />
    </PkCard>

    <PkCard v-if="qr" title="自检：编码再解码" accent="#8A6D3B">
      <PkRow label="往返结果" :value="roundTrip" :color="roundTripOk ? 'var(--pk-accent)' : 'var(--pk-danger)'" :copy="false" stack />
      <text class="tip">{{ roundTripNote }}</text>
    </PkCard>

    <PkCard title="口径与边界" accent="var(--pk-accent)">
      <PkRow v-for="n in QR_NOTES" :key="n.t" :label="n.t" :value="n.d" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { encode, decodeMatrix, buildWifi, buildVCard, QR_SAMPLES, ELEVEL_INFO, QUIET_ZONE } from '@/utils/qrcode'
import { utf8Bytes } from '@/utils/base64'
import { copyText, toast } from '@/utils/clipboard'

const SCALE_ITEMS = [
  { key: 's', name: '小（适合屏幕看）' },
  { key: 'm', name: '中（日常扫码）' },
  { key: 'l', name: '大（打印张贴）' },
]
const SCALE_PX = { s: 4, m: 8, l: 14 }
const WIFI_TYPES = [
  { key: 'WPA', name: 'WPA / WPA2 / WPA3' },
  { key: 'WEP', name: 'WEP' },
  { key: 'nopass', name: '开放网络' },
]
/** 口径说明：把「自己算的」和「别人验过的」分清楚 */
const QR_NOTES = [
  { t: '全离线', d: '版本选择、模式分段、Reed-Solomon 纠错、掩码罚分都在本机算，不联网、不上传内容。' },
  { t: '依据标准', d: '按 ISO/IEC 18004 的码字容量表、分块交错与生成多项式实现，字符集支持数字 / 字母数字 / 字节（UTF-8）。' },
  { t: '第三方复核', d: '生成的矩阵曾用开源解码器 zbar 独立扫读验证过（多版本、四个纠错等级、各模式与中文/emoji）；换新内容后建议用你手机自带扫码再确认一次。' },
  { t: '自检的边界', d: '页面里的「编码再解码」用的是同一套实现的正反两个方向，只能说明自洽，不能证明符合标准。' },
  { t: '不做的部分', d: '不支持 Kanji 模式、ECI 与扩展通道（微二维码、复合码）；这些内容会按 UTF-8 字节模式编码，普通扫码 App 一样能读出原文。' },
  { t: '静区', d: '预览与保存图片都留了标准要求的 4 模块空白静区；如果你把图裁到只剩码体，部分扫码枪会认不出。' },
  { t: '保存位置', d: 'App 端先写入应用私有目录再存相册，没给相册权限会失败并提示。' },
]

const text = ref('https://example.com/pocketkit')
const elevel = ref('M')
const scaleKey = ref('m')
const inverted = ref(false)
const previewUrl = ref('')
const saveMsg = ref('')

/* 生成器字段 */
const wifiSsid = ref('MyRouter')
const wifiPass = ref('passw0rd')
const wifiType = ref('WPA')
const wifiHidden = ref(false)
const wifiText = ref('')
const wifiError = ref('')
const vcName = ref('张三')
const vcPhone = ref('13800138000')
const vcOrg = ref('随身匣')
const vcTitle = ref('')
const vcEmail = ref('')
const vcUrl = ref('')
const vcAddr = ref('')
const vcNote = ref('')
const vcText = ref('')

const qr = computed(() => {
  if (!String(text.value).trim()) return null
  try {
    return encode(text.value, { elevel: elevel.value })
  } catch (e) {
    return null
  }
})
const error = computed(() => {
  const raw = String(text.value).trim()
  if (!raw) return ''
  try {
    encode(raw, { elevel: elevel.value })
    return ''
  } catch (e) {
    return e.message
  }
})

const elevelDesc = computed(() => {
  const it = ELEVEL_INFO.filter((x) => x.key === elevel.value)[0]
  return it ? it.desc : ''
})
const modeText = computed(() => {
  const q = qr.value
  if (!q) return ''
  const name = { numeric: '纯数字', alphanumeric: '字母数字', byte: '字节（UTF-8）', mixed: '混合分段' }[q.mode] || q.mode
  return name + '（' + q.segments.length + ' 段）'
})
const usedText = computed(() => {
  const q = qr.value
  if (!q) return ''
  const cap = q.capacity || {}
  const byteMode = q.mode === 'byte' || q.mode === 'mixed'
  const unit = byteMode ? 'byte' : q.mode
  const limit = cap[unit] || cap.byte
  const raw = String(q.text || '')
  const used = byteMode ? utf8Bytes(raw).length : raw.length
  const isByte = unit === 'byte'
  return (
    used +
    ' ' +
    (isByte ? '字节' : '字符') +
    ' / 版本 ' +
    q.version +
    ' ' +
    q.elevel +
    ' 级同模式上限 ' +
    limit +
    '（约 ' +
    Math.round((used / limit) * 100) +
    '%）'
  )
})
const bitsText = computed(() => {
  const q = qr.value
  if (!q) return ''
  const bytes = Math.ceil(q.bitLength / 8)
  return (
    q.bitLength +
    ' bit ≈ ' +
    bytes +
    ' 字节，数据码字 ' +
    q.dataCodewords +
    ' 字节（余下 ' +
    (q.dataCodewords - bytes) +
    ' 字节是终端填充）'
  )
})
const levelTip = computed(() => {
  const q = qr.value
  if (!q) return ''
  if (q.version >= 26) return '版本已经很高，模块极密，屏幕上看清都费劲：建议换 L 级、缩短内容，或直接分成了几张码。'
  if (q.version >= 10) return '中等版本，打印时注意别小于 3cm，否则手机对不上焦。'
  return '版本较低，模块数少，屏幕与打印都容易扫。'
})
const roundTrip = computed(() => (roundTripOk.value ? '一致：decodeMatrix(encode(内容)) 读回原文' : '不一致：解码结果与原文有出入'))
const roundTripOk = computed(() => {
  const q = qr.value
  if (!q) return false
  try {
    const back = decodeMatrix(q.modules)
    const s = back && (back.text !== undefined ? back.text : back)
    return String(s) === String(q.text)
  } catch (e) {
    return false
  }
})
const roundTripNote =
  '往返一致只证明编码与解码互为逆过程，不等于符合规范；是否符合 ISO/IEC 18004 要用第三个扫码 App 实扫确认。'

const canSave = computed(() => !!qr.value)

/* ---------------- 渲染：预览与保存共用一段离屏画布 ---------------- */
function buildCanvas(px) {
  const q = qr.value
  if (!q) return null
  if (typeof document === 'undefined' || !document.createElement) return null
  const quiet = QUIET_ZONE
  const side = (q.size + quiet * 2) * px
  const c = document.createElement('canvas')
  c.width = side
  c.height = side
  const ctx = c.getContext('2d')
  ctx.fillStyle = inverted.value ? '#000000' : '#ffffff'
  ctx.fillRect(0, 0, side, side)
  ctx.fillStyle = inverted.value ? '#ffffff' : '#000000'
  for (let y = 0; y < q.size; y++) {
    for (let x = 0; x < q.size; x++) {
      if (q.modules[y][x]) ctx.fillRect((x + quiet) * px, (y + quiet) * px, px, px)
    }
  }
  return c
}

function refreshPreview() {
  saveMsg.value = ''
  const q = qr.value
  if (!q) {
    previewUrl.value = ''
    return
  }
  try {
    const c = buildCanvas(SCALE_PX[scaleKey.value] || 8)
    previewUrl.value = c ? c.toDataURL('image/png') : ''
  } catch (e) {
    previewUrl.value = ''
  }
}

watch([qr, inverted, scaleKey], () => nextTick(refreshPreview), { immediate: true })

async function doSave() {
  if (!qr.value) {
    toast('先生成二维码')
    return
  }
  try {
    const c = buildCanvas(SCALE_PX[scaleKey.value] || 8)
    if (!c) {
      saveMsg.value = '当前环境没有画布能力，存不了图'
      return
    }
    const { saveCanvasImage } = await import('@/utils/image')
    await saveCanvasImage(c, 'qrcode-v' + qr.value.version + '-' + qr.value.elevel + '.png', 'image/png')
    toast('已保存到相册')
  } catch (e) {
    saveMsg.value = (e && e.message) || '保存失败，可能是相册权限没给'
  }
}

function doCopy() {
  if (!String(text.value).trim()) {
    toast('还没有内容可复制')
    return
  }
  copyText(text.value)
}

/* ---------------- Wi-Fi 与名片 ---------------- */
function useWifi() {
  wifiError.value = ''
  wifiText.value = ''
  const ssid = String(wifiSsid.value).trim()
  if (!ssid) {
    wifiError.value = '网络名称不能为空'
    return
  }
  if (wifiType.value !== 'nopass' && !String(wifiPass.value).trim()) {
    wifiError.value = '除了开放网络，密码不能为空'
    return
  }
  const t = buildWifi({ ssid: ssid, password: wifiPass.value, auth: wifiType.value, hidden: wifiHidden.value })
  wifiText.value = t
  text.value = t
}

function useVCard() {
  const t = buildVCard({
    name: vcName.value,
    tel: vcPhone.value,
    org: vcOrg.value,
    title: vcTitle.value,
    email: vcEmail.value,
    url: vcUrl.value,
    addr: vcAddr.value,
    note: vcNote.value,
  })
  vcText.value = t
  text.value = t
}
</script>

<style scoped>
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
.tip {
  display: block;
  font-size: 21rpx;
  line-height: 1.8;
  color: var(--pk-text-3);
  padding: 10rpx 24rpx 12rpx;
}
.act-row {
  display: flex;
  gap: 20rpx;
  padding: 14rpx 0 10rpx;
}
.qr {
  display: flex;
  justify-content: center;
  padding: 20rpx 0 6rpx;
  background: var(--pk-card);
}
.qr--inv {
  background: var(--pk-text);
}
.qr__img {
  width: 480rpx;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  padding-top: 12rpx;
}
.meta__i {
  font-size: 21rpx;
  color: var(--pk-text-3);
  margin: 4rpx 12rpx;
  font-family: Menlo, Consolas, monospace;
}
.segs {
  padding: 6rpx 24rpx 12rpx;
}
.segs__t {
  display: block;
  font-size: 21rpx;
  color: var(--pk-text-3);
  line-height: 1.7;
  margin-bottom: 6rpx;
}
.segs__r {
  display: flex;
  align-items: baseline;
  padding: 10rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.segs__m {
  width: 200rpx;
  font-size: 22rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-accent);
  flex-shrink: 0;
}
.segs__c {
  flex: 1;
  font-size: 22rpx;
  color: var(--pk-text-2);
}
.segs__b {
  font-size: 21rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text-3);
}
</style>
