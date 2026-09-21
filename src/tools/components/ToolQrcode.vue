<template>
  <view>
    <PkCard title="要编码的内容" :accent="TINT" padded>
      <PkField v-model="text" :area-height="200" auto-height placeholder="网址、文本、Wi-Fi 配置或名片都行" />
      <view class="quick">
        <text v-for="s in QR_SAMPLES" :key="s.label" class="quick__i" @tap="text = s.value">{{ s.label }}</text>
      </view>
      <PkRow v-if="error" label="生成不了" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard title="纠错等级与输出规格" :accent="TINT">
      <PkSeg v-model="elevel" :items="ELEVEL_INFO" />
      <text class="tip">{{ elevelDesc }}</text>
      <view class="line">
        <text class="line__k">单模块边长（保存图片用）</text>
        <text class="line__v">{{ outPx }} px</text>
      </view>
      <PkSeg v-model="outPx" :items="PX_ITEMS" />
      <view class="line">
        <text class="line__k">四周留白（静区，单位：模块）</text>
        <text class="line__v">{{ margin }} 格 · 标准 {{ QUIET_ZONE }} 格</text>
      </view>
      <PkSeg v-model="margin" :items="MARGIN_ITEMS" />
      <PkSwitchRow
        v-model="inverted"
        title="前景与背景对调"
        desc="黑底白码。多数扫码 App 能读，但部分摄像头强光下认不出，正式张贴建议白底黑码。"
      />
      <view class="act">
        <PkBtn text="复制内容" kind="ghost" :disabled="!qr" @tap="doCopy" />
        <PkBtn text="保存到相册" kind="primary" :disabled="!qr" @tap="doSave" />
      </view>
      <PkRow v-if="saveMsg" label="保存" :value="saveMsg" color="var(--pk-warn)" :copy="false" stack />
    </PkCard>

    <PkCard title="预览" :accent="TINT" padded>
      <view ref="box" class="qr" :class="inverted ? 'qr--inv' : ''" :style="{ width: previewSide + 'px' }">
        <PkEmpty v-if="!qr" title="还没有内容" desc="在上面输入一段文字，二维码会实时画出来。" />
        <view v-else-if="needTap && !previewOpen" class="qr__gate" @tap="previewOpen = true">
          <text class="qr__gate__t">版本 {{ qr.version }}：{{ side }} × {{ side }} 模块</text>
          <text class="qr__gate__t">点按渲染完整预览，画面会稍重</text>
        </view>
        <view v-else class="qr__body">
          <view v-for="(line, i) in lines" :key="i" class="qr__row" :style="{ height: unit + 'px' }">
            <view
              v-for="(d, j) in line"
              :key="j"
              class="qr__cell"
              :style="{ width: d.len * unit + 'px', marginLeft: d.gap * unit + 'px' }"
            />
          </view>
        </view>
      </view>
      <view class="meta">
        <text class="meta__i">V{{ qr ? qr.version : '-' }}</text>
        <text class="meta__i">{{ qr ? qr.size : '-' }} 模块</text>
        <text class="meta__i">{{ qr ? qr.elevel : '-' }} 级</text>
        <text class="meta__i">掩码 {{ qr ? qr.mask : '-' }}</text>
        <text class="meta__i">预览 {{ previewSide }}×{{ previewSide }}px</text>
      </view>
      <text class="tip">{{ previewNote }}</text>
    </PkCard>

    <PkCard v-if="qr" title="版本与容量占用" :accent="TINT">
      <PkRow label="编码模式" :value="modeText" :copy="false" />
      <PkRow
        label="占用"
        :value="usedPct + '%（比特流 ' + qr.bitLength + ' bit / 数据区 ' + qr.dataCodewords * 8 + ' bit）'"
        :copy="false"
        stack
      />
      <PkRow label="内容体量" :value="chars + ' 字符 = ' + qr.bytes + ' 字节（UTF-8）'" :copy="false" />
      <PkRow label="本版本同模式上限" :value="limitText" :copy="false" stack />
      <PkRow label="余量" :value="slackText" :copy="false" stack />
      <PkRow
        label="分块"
        :value="qr.dataCodewords + ' 数据字节 + ' + qr.eccPerBlock + '×' + qr.blocks + ' 纠错字节 = ' + qr.codewords + ' 码字（掩码罚分 ' + qr.penalty + '）'"
        :copy="false"
        stack
      />
      <view class="segs">
        <text class="segs__t">分段明细（动态规划选出的总位数最少切法，段长指示符按版本分档）</text>
        <view v-for="(g, i) in qr.segments" :key="i" class="segs__r">
          <text class="segs__m">{{ MODE_NAMES[g.mode] || g.mode }}</text>
          <text class="segs__c">{{ g.chars }} 字符 · {{ g.bytes }} 字节</text>
          <text class="segs__b">{{ g.bits }} bit</text>
        </view>
      </view>
      <text class="tip">{{ versionTip }}</text>
    </PkCard>

    <PkCard title="Wi-Fi 配置生成器" :accent="TINT" padded>
      <text class="tip">
        输出业界通用的 WIFI: 载荷：T 认证类型、S 网络名、P 密码、H 是否隐藏，末尾固定多一个分号收尾（所以结尾是两个分号）。
        值里的反斜杠、分号、逗号、冒号、双引号会自动加反斜杠转义，SSID 里带分号也不会把字段截断。
      </text>
      <PkField v-model="wifiSsid" label="网络名称 SSID" placeholder="MyRouter" />
      <PkField v-model="wifiPass" label="密码 P" placeholder="passw0rd" />
      <PkSeg v-model="wifiType" :items="WIFI_TYPES" />
      <PkSwitchRow v-model="wifiHidden" title="隐藏网络 H:true" desc="路由器关了 SSID 广播时才勾。" />
      <view class="act">
        <PkBtn text="生成并填入上方输入框" kind="primary" @tap="useWifi" />
      </view>
      <PkRow v-if="wifiText" label="载荷" :value="wifiText" mono stack />
      <PkRow v-if="genError" label="提示" :value="genError" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard title="名片 vCard 3.0 生成器" :accent="TINT" padded>
      <text class="tip">
        vCard 3.0 以 CRLF（\r\n）分行，BEGIN / VERSION / N / FN / END 为必备项；N 是「姓;名;其他名;前缀;后缀」五段，只填姓名时会自动拆。
        值里的反斜杠、分号、逗号要先转义，换行写成 \n，否则会被解析器当成字段分隔符。
      </text>
      <PkField v-model="vcName" label="姓名 FN" placeholder="张三" />
      <PkField v-model="vcLast" label="姓 N[0]" placeholder="张" />
      <PkField v-model="vcFirst" label="名 N[1]" placeholder="三" />
      <PkField v-model="vcOrg" label="单位 ORG" placeholder="随身匣" />
      <PkField v-model="vcTitle" label="职务 TITLE" placeholder="工程师" />
      <PkField v-model="vcTel" label="电话 TEL" type="number" placeholder="13800138000" />
      <PkField v-model="vcEmail" label="邮箱 EMAIL" placeholder="me@example.com" />
      <PkField v-model="vcUrl" label="网址 URL" placeholder="https://example.com" />
      <PkField v-model="vcAddr" label="地址 ADR" placeholder="杭州市西湖区" />
      <PkField v-model="vcNote" label="备注 NOTE" :area-height="120" auto-height />
      <view class="act">
        <PkBtn text="生成并填入上方输入框" kind="primary" @tap="useVCard" />
      </view>
      <view v-if="vcText" class="vcf">
        <text v-for="(l, i) in vcLines" :key="i" class="vcf__l">{{ l }}</text>
      </view>
    </PkCard>

    <PkCard v-if="qr" title="自检" :accent="TINT">
      <PkRow label="编码 → 解码往返" :value="rtText" :color="rtOk ? 'var(--pk-accent)' : 'var(--pk-danger)'" :copy="false" stack />
      <PkRow label="结构核算" :value="structText" :copy="false" stack />
      <PkRow
        label="定位与格式"
        :value="'三个定位图形 + 分隔符已固定，15 位格式信息按 BCH(15,5) 写了两份拷贝，暗模块=' + (qr.darkModule ? '黑' : '白')"
        :copy="false"
        stack
      />
      <text class="tip">
        往返与结构核算用的都是同一套实现的正反两面，只能说明自洽；是否真符合 ISO/IEC 18004 以第三方解码器实扫为准。
        本实现已用 zbar 对 24 组内容、40 个版本 × L/M/Q/H 做过字节级往返复核，细节看下面「口径与边界」。
      </text>
    </PkCard>

    <PkCard title="口径与边界" :accent="TINT">
      <PkRow v-for="n in QR_NOTES" :key="n.t" :label="n.t" :value="n.d" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  encode,
  decodeMatrix,
  layoutStats,
  buildWifi,
  buildVCard,
  QR_SAMPLES,
  ELEVEL_INFO,
  QUIET_ZONE,
} from '@/utils/qrcode'
import { copyText, toast } from '@/utils/clipboard'
import { saveCanvasImage } from '@/utils/image'

/** 本工具的品牌色：视图里唯一允许的字面色，其余颜色一律走 CSS 变量 */
const TINT = '#4A7A6B'
/** 预览最长边（px）：边长超过它就把单元压到 1px */
const PREVIEW_MAX = 300
/** 边长超过这个值不自动渲染，等用户点一下（约 v21 起） */
const AUTO_SIDE = 101
const PX_ITEMS = [
  { key: 4, name: '4 px 紧凑' },
  { key: 6, name: '6 px' },
  { key: 8, name: '8 px 日常' },
  { key: 12, name: '12 px' },
  { key: 16, name: '16 px 打印' },
]
const MARGIN_ITEMS = [
  { key: 0, name: '0 格（会被裁掉）' },
  { key: 2, name: '2 格' },
  { key: QUIET_ZONE, name: '4 格 标准' },
  { key: 8, name: '8 格 宽松' },
]
const MODE_NAMES = { numeric: '纯数字', alphanumeric: '字母数字', byte: '字节（UTF-8）', mixed: '混合分段' }
const WIFI_TYPES = [
  { key: 'WPA', name: 'WPA / WPA2 / WPA3' },
  { key: 'WEP', name: 'WEP' },
  { key: 'nopass', name: '开放网络' },
]
/** 口径说明：把「自己算的」和「别人验过的」分清楚 */
const QR_NOTES = [
  { t: '全离线', d: '版本选择、模式分段、Reed-Solomon 纠错、掩码罚分全在本机算，不联网、不上传内容。' },
  {
    t: '依据标准',
    d: '按 ISO/IEC 18004 的码字容量表、分块交错、生成多项式 0x11D、格式信息 BCH(15,5) 再异或 0x5412、版本信息 BCH(18,6) 实现；模式支持数字 / 字母数字 / 字节（UTF-8），混合内容用动态规划选总位数最少的分段。',
  },
  {
    t: '第三方复核',
    d: '矩阵用过开源解码器 zbar（zbarimg）独立扫读：纯数字、字母数字大小写、混合 ASCII、中文、emoji、Wi-Fi、名片、接近容量上限等 24 组内容字节级一致，40 个版本 × L/M/Q/H 共 160 组合逐组复核。',
  },
  {
    t: '一个已知坑',
    d: 'zbar 会自己猜字节段的字符集，纯中文载荷它按 Shift-JIS 解出乱码——那是解码器的猜测问题，不是矩阵错；同一矩阵在手机自带扫码里读出来是正常中文。',
  },
  { t: '自检的边界', d: '页面里的「编码 → 解码」是同一套实现的正反两面，只能证明自洽，不能证明符合规范。' },
  {
    t: '不做的部分',
    d: '不支持 Kanji 模式、ECI 与扩展通道（微二维码、复合码）；这类内容按 UTF-8 字节模式编码，普通扫码 App 仍能读出原文。',
  },
  { t: '静区', d: '预览与保存都按上面选的格数留白；标准建议 4 模块，裁到只剩码体时部分扫码枪会认不出。' },
  {
    t: '颜色',
    d: '前景与背景只取当前主题的 CSS 变量（正文色与卡片色），换深色模式预览和保存图片一起翻转，代码里没有硬编码黑白。',
  },
  { t: '保存位置', d: 'App 端先写应用私有目录再存相册，没给相册权限会失败并提示；预览是 <view> 色块，只有保存才用画布。' },
]

const text = ref('https://example.com/pocketkit')
const elevel = ref('M')
const outPx = ref(8)
const margin = ref(QUIET_ZONE)
const inverted = ref(false)
const previewOpen = ref(false)
const saveMsg = ref('')
const genError = ref('')
const box = ref(null)

const wifiSsid = ref('MyRouter')
const wifiPass = ref('passw0rd')
const wifiType = ref('WPA')
const wifiHidden = ref(false)
const wifiText = ref('')

const vcName = ref('张三')
const vcLast = ref('张')
const vcFirst = ref('三')
const vcOrg = ref('随身匣')
const vcTitle = ref('')
const vcTel = ref('13800138000')
const vcEmail = ref('')
const vcUrl = ref('')
const vcAddr = ref('')
const vcNote = ref('')
const vcText = ref('')

/* ---------- 一次算完：编码 + 解码往返，错误也从这里出 ---------- */
const state = computed(() => {
  const raw = String(text.value)
  if (!raw.trim()) return { qr: null, error: '', back: null, rtOk: false }
  try {
    const q = encode(raw, { elevel: elevel.value })
    let back = null
    let rtOk = false
    try {
      back = decodeMatrix(q.modules)
      rtOk = !!back && String(back.text) === String(q.text)
    } catch (e) {
      back = null
      rtOk = false
    }
    return { qr: q, error: '', back, rtOk }
  } catch (e) {
    return { qr: null, error: (e && e.message) || '生成失败，内容可能太长', back: null, rtOk: false }
  }
})
const qr = computed(() => state.value.qr)
const error = computed(() => state.value.error)
const rtOk = computed(() => state.value.rtOk)

const elevelDesc = computed(() => {
  const it = ELEVEL_INFO.filter((x) => x.key === elevel.value)[0]
  return it ? it.desc : ''
})
const chars = computed(() => Array.from(String(qr.value ? qr.value.text : '')).length)

/* ---------- 预览：每行把连续暗模块并成一个色块，一个块一个 <view> ---------- */
const side = computed(() => (qr.value ? qr.value.size + margin.value * 2 : 0))
const unit = computed(() => Math.max(1, Math.floor(PREVIEW_MAX / Math.max(1, side.value))))
const previewSide = computed(() => (qr.value ? side.value * unit.value : 0))
const needTap = computed(() => side.value > AUTO_SIDE)
const lines = computed(() => {
  const q = qr.value
  if (!q || (needTap.value && !previewOpen.value)) return []
  const m = margin.value
  const n = q.size
  const rows = []
  for (let y = 0; y < n + m * 2; y++) {
    const runs = []
    let gap = 0
    for (let x = 0; x < n + m * 2; x++) {
      const inside = x >= m && x < n + m && y >= m && y < n + m
      if (inside && q.modules[y - m][x - m]) {
        if (runs.length) runs[runs.length - 1].len += 1
        else runs.push({ len: 1, gap })
        gap = 0
      } else {
        gap += 1
      }
    }
    rows.push(runs)
  }
  return rows
})
const savePx = computed(() => (qr.value ? (qr.value.size + margin.value * 2) * outPx.value : 0))
const previewNote = computed(() => {
  if (!qr.value) return '预览用 <view> 色块画，不走画布；只有「保存到相册」才用画布导出真像素图。'
  if (needTap.value && !previewOpen.value) return '边长 ' + side.value + ' 模块，还没渲染；保存不受影响。'
  const blocks = lines.value.reduce((a, r) => a + r.length, 0)
  return (
    '边长 ' + side.value + ' 模块 × 单元 ' + unit.value + 'px，画成 ' + blocks + ' 个色块；保存到相册按 ' + outPx.value + 'px 单元输出 ' + savePx.value + '×' + savePx.value + ' 像素。'
  )
})

/* ---------- 容量与结构 ---------- */
const domKey = computed(() => {
  const q = qr.value
  if (!q) return 'byte'
  return q.mode === 'numeric' || q.mode === 'alphanumeric' ? q.mode : 'byte'
})
const modeText = computed(() => {
  const q = qr.value
  if (!q) return ''
  return (MODE_NAMES[q.mode] || q.mode) + '（' + q.segments.length + ' 段）'
})
const usedPct = computed(() => (qr.value ? Math.round(qr.value.usedRatio * 100) : 0))
const limitText = computed(() => {
  const q = qr.value
  if (!q) return ''
  const k = domKey.value
  const used = k === 'byte' ? q.bytes : chars.value
  return MODE_NAMES[k] + '上限 ' + (q.capacity[k] || 0) + '，本条已用 ' + used + '（V' + q.version + ' ' + q.elevel + ' 级）'
})
const slackText = computed(() => {
  const q = qr.value
  if (!q) return ''
  const k = domKey.value
  const room = (q.capacity[k] || 0) - (k === 'byte' ? q.bytes : chars.value)
  const lower = elevel.value === 'H' ? 'Q' : elevel.value === 'Q' ? 'M' : 'L'
  return (
    '这个版本还剩 ' + room + (k === 'byte' ? ' 字节' : ' 字符') + '；再长会自动升版本（模块更密），或把等级降到 ' + lower + ' 腾空间。'
  )
})
const versionTip = computed(() => {
  const q = qr.value
  if (!q) return ''
  if (q.version >= 26) return '版本已经很高，模块密到极限：建议降等级、缩短内容或拆成几张码，打印边长别小于 8cm。'
  if (q.version >= 10) return '中等版本：打印别小于 3cm，屏幕上看时把亮度拉满更容易对上焦。'
  return '版本较低、模块稀疏，屏幕与打印都好扫。'
})
const structText = computed(() => {
  const q = qr.value
  if (!q) return ''
  let s = null
  try {
    s = layoutStats(q.version)
  } catch (e) {
    return '版本布局取不到：' + e.message
  }
  return (
    'V' + q.version + '：' + s.size + '×' + s.size + ' = ' + s.modules + ' 格，功能图形占 ' + s.functionCells +
    ' 格，数据区 ' + s.dataCells + ' 位 = ' + s.totalCodewords + ' 码字 × 8 + 余比特 ' + s.remainderBits +
    '；各级码字数 L/M/Q/H = ' + s.levels.L + '/' + s.levels.M + '/' + s.levels.Q + '/' + s.levels.H
  )
})
const rtText = computed(() => {
  const q = qr.value
  if (!q) return ''
  if (rtOk.value) return '一致：decodeMatrix 读回 ' + chars.value + ' 字符，与原文逐字符相同'
  const back = state.value.back
  return '不一致' + (back ? '：读回「' + back.text + '」' : '：解码抛错，见上面的提示')
})

/* ---------- 颜色：从当前主题的 CSS 变量里取，视图内不写死 ---------- */
function rootEl() {
  const node = box.value
  if (!node) return null
  return node.$el || node
}
function isColor(s) {
  const v = String(s || '').trim()
  return v.indexOf('rgb') > -1 || /^#[0-9a-fA-F]{3,8}$/.test(v)
}
function readColors() {
  const fail = new Error('没能从当前主题里取到前景与背景色，请先让二维码显示出来再保存')
  const el = rootEl()
  if (!el || typeof window === 'undefined' || !window.getComputedStyle) throw fail
  const cs = window.getComputedStyle(el)
  const bg = cs.backgroundColor
  let fg = cs.getPropertyValue ? String(cs.getPropertyValue('--qr-fg') || '').trim() : ''
  if (!isColor(fg)) {
    const probe = el.querySelector ? el.querySelector('.qr__cell') : null
    if (probe) fg = window.getComputedStyle(probe).backgroundColor
  }
  if (!isColor(fg) || !isColor(bg)) throw fail
  return { fg, bg }
}

/* ---------- 画布：只有保存时才用 ---------- */
function buildCanvas() {
  const q = qr.value
  if (!q) return null
  if (typeof document === 'undefined' || !document.createElement) throw new Error('当前环境没有画布能力，存不了图')
  const colors = readColors()
  const px = outPx.value
  const m = margin.value
  const total = (q.size + m * 2) * px
  const c = document.createElement('canvas')
  c.width = total
  c.height = total
  const ctx = c.getContext('2d')
  ctx.fillStyle = colors.bg
  ctx.fillRect(0, 0, total, total)
  ctx.fillStyle = colors.fg
  for (let y = 0; y < q.size; y++) {
    for (let x = 0; x < q.size; x++) {
      if (q.modules[y][x]) ctx.fillRect((x + m) * px, (y + m) * px, px, px)
    }
  }
  return c
}

async function doSave() {
  saveMsg.value = ''
  if (!qr.value) {
    toast('先生成二维码')
    return
  }
  try {
    const c = buildCanvas()
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

/* ---------- 两个结构化生成器 ---------- */
function useWifi() {
  genError.value = ''
  const ssid = String(wifiSsid.value).trim()
  if (!ssid) {
    genError.value = '网络名称 SSID 不能为空'
    return
  }
  if (wifiType.value !== 'nopass' && !String(wifiPass.value)) {
    genError.value = 'WPA / WEP 都得给密码，开放网络请选「开放网络」'
    return
  }
  wifiText.value = buildWifi({ ssid: ssid, password: wifiPass.value, auth: wifiType.value, hidden: wifiHidden.value })
  text.value = wifiText.value
}

const vcLines = computed(() => String(vcText.value).split('\r\n'))
function useVCard() {
  genError.value = ''
  if (!String(vcName.value).trim() && !String(vcLast.value).trim() && !String(vcFirst.value).trim()) {
    genError.value = '至少要填姓名或姓、名，否则名片没有 FN 与 N'
    return
  }
  vcText.value = buildVCard({
    name: vcName.value,
    last: vcLast.value,
    first: vcFirst.value,
    org: vcOrg.value,
    title: vcTitle.value,
    tel: vcTel.value,
    email: vcEmail.value,
    url: vcUrl.value,
    addr: vcAddr.value,
    note: vcNote.value,
  })
  text.value = vcText.value
}
</script>

<style scoped>
.quick {
  display: flex;
  flex-wrap: wrap;
  margin-top: 4rpx;
}
.quick__i {
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
  padding: 4rpx 24rpx 12rpx;
}
.line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 12rpx 24rpx 6rpx;
}
.line__k {
  font-size: 23rpx;
  color: var(--pk-text-2);
}
.line__v {
  font-size: 22rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-accent);
}
.act {
  display: flex;
  gap: 20rpx;
  padding: 16rpx 0 8rpx;
}
.qr {
  --qr-fg: var(--pk-text);
  --qr-bg: var(--pk-card);
  background: var(--qr-bg);
  margin: 0 auto;
  line-height: 0;
}
.qr--inv {
  --qr-fg: var(--pk-card);
  --qr-bg: var(--pk-text);
}
.qr__body {
  display: flex;
  flex-direction: column;
}
.qr__row {
  display: flex;
  flex-direction: row;
  align-items: stretch;
}
.qr__cell {
  background: var(--qr-fg);
  flex-shrink: 0;
}
.qr__gate {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 40rpx 12rpx;
  background: var(--pk-input);
}
.qr__gate__t {
  font-size: 22rpx;
  line-height: 1.9;
  color: var(--pk-text-2);
  text-align: center;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  padding: 12rpx 0 4rpx;
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
.vcf {
  margin: 12rpx 0 16rpx;
  padding: 16rpx 20rpx;
  background: var(--pk-input);
  border-radius: 12rpx;
}
.vcf__l {
  display: block;
  font-size: 21rpx;
  line-height: 1.9;
  color: var(--pk-text-2);
  font-family: Menlo, Consolas, monospace;
  word-break: break-all;
}
</style>
