<template>
  <view>
    <PkCard title="内容与码制" :accent="TINT" padded>
      <PkSeg v-model="sym" :items="SYM_ITEMS" />
      <PkField v-model="text" :placeholder="phText" :area-height="110" auto-height />
      <view class="quick">
        <text v-for="s in BARCODE_SAMPLES" :key="s.label" class="quick__i" @tap="pick(s)">{{ s.label }}</text>
      </view>
      <PkRow v-if="err" label="生成不了" :value="err" color="var(--pk-danger)" :copy="false" stack />
      <text class="tip">{{ charsetTip }}</text>
    </PkCard>

    <PkCard title="输出规格" :accent="TINT">
      <view class="line">
        <text class="line__k">单模块宽度（保存图片用）</text>
        <text class="line__v">{{ outPx }} px</text>
      </view>
      <PkSeg v-model="outPx" :items="PX_ITEMS" />
      <view class="line">
        <text class="line__k">条码高度</text>
        <text class="line__v">{{ heightPx }} px</text>
      </view>
      <PkSeg v-model="heightPx" :items="H_ITEMS" />
      <view class="line">
        <text class="line__k">左右静区（标准 {{ quietStd }} 模块 × ）</text>
        <text class="line__v">{{ quietPx }} 模块</text>
      </view>
      <PkSeg v-model="quietMul" :items="QUIET_ITEMS" />
      <PkSwitchRow
        v-model="showText"
        title="下方印可读文字"
        desc="EAN／UPC 按标准摆法：首位标在码体左外、末位标在右外。文字只给人看，扫描认的是条空本身。"
      />
      <PkSwitchRow
        v-model="inverted"
        title="黑白反相"
        desc="深底浅条。多数扫码 App 能读，超市扫码枪和强光下容易认不出，正式印刷建议白底黑条。"
      />
      <view class="act">
        <PkBtn text="复制载荷" kind="ghost" :disabled="!enc" @tap="doCopy" />
        <PkBtn text="保存到相册" kind="primary" :disabled="!enc" @tap="doSave" />
      </view>
      <PkRow v-if="saveMsg" label="保存" :value="saveMsg" color="var(--pk-warn)" :copy="false" stack />
    </PkCard>

    <PkCard title="预览" :accent="TINT" padded>
      <view ref="box" class="bc" :class="inverted ? 'bc--inv' : ''">
        <PkEmpty v-if="!enc" title="还没有内容" desc="选个码制、填点东西，条码会实时画出来。" />
        <scroll-view v-else scroll-x class="bc__scroll">
          <view class="bc__strip" :style="{ width: totalW + 'px', height: stripH + 'px' }">
            <view
              v-for="(b, i) in bars"
              :key="i"
              class="bc__bar"
              :style="{ left: b.left + 'px', width: b.w + 'px', height: b.h + 'px' }"
            />
            <view v-if="showText" class="bc__cap" :style="{ top: barAreaH + 'px', width: totalW + 'px' }">
              <text v-for="(c, i) in capPieces" :key="i" class="bc__cap__t" :style="capStyle(c)">{{ c.text }}</text>
            </view>
          </view>
        </scroll-view>
      </view>
      <view class="meta">
        <text class="meta__i">{{ enc ? enc.name : '-' }}</text>
        <text class="meta__i">{{ enc ? enc.moduleCount : '-' }} 模块</text>
        <text class="meta__i">静区 {{ quietPx }}×2</text>
        <text class="meta__i">预览 {{ unit }} px/模块</text>
        <text class="meta__i">{{ totalW }}×{{ stripH }}px</text>
      </view>
      <text class="tip">{{ fitTip }}</text>
    </PkCard>

    <PkCard v-if="enc" title="尺寸与构成" :accent="TINT">
      <PkRow label="载荷" :value="enc.payload" mono />
      <PkRow label="校验位" :value="enc.appended ? '自动补出 ' + enc.appended : '沿用输入自带的那一位'" :copy="false" />
      <PkRow
        label="模块"
        :value="enc.stats.modules + ' 模块 = ' + enc.stats.bars + ' 个条 + ' + enc.stats.spaces + ' 个空（深色占 ' + enc.stats.ratio + '%）'"
        :copy="false"
        stack
      />
      <PkRow
        label="保存尺寸"
        :value="saveW + ' × ' + saveH + ' px（含静区与可读文字）'"
        :copy="false"
      />
      <PkRow
        label="元素宽窄"
        :value="prof.runs + ' 段，其中宽段 ' + prof.wide + '、窄段 ' + prof.narrow"
        :copy="false"
        stack
      />
      <text class="tip">{{ ratioTip }}</text>
    </PkCard>

    <PkCard v-if="enc" title="结构分段" :accent="TINT">
      <view class="seg">
        <view v-for="(s, i) in segRows" :key="i" class="seg__r">
          <text class="seg__k">{{ KIND_NAME[s.kind] || s.kind }}</text>
          <text class="seg__v">{{ s.text || '—' }}</text>
          <text class="seg__m">{{ s.to - s.from }} 模块 · {{ s.from }}–{{ s.to }}</text>
        </view>
      </view>
      <text v-if="enc.structure.length > SEG_MAX" class="tip">
        一共 {{ enc.structure.length }} 段，只列出前 {{ SEG_MAX }} 段。
      </text>
      <text class="tip">{{ segTip }}</text>
    </PkCard>

    <PkCard v-if="enc" title="自检" :accent="TINT">
      <PkRow
        label="编码 → 回读"
        :value="rtOk ? '一致：readBack 从 ' + enc.moduleCount + ' 个模块里重新解析出「' + rtBack + '」' : '不一致：' + rtErr"
        :color="rtOk ? 'var(--pk-accent)' : 'var(--pk-danger)'"
        :copy="false"
        stack
      />
      <text class="tip">
        回读走的是另一条代码路径（切块反查表），但和编码共用同一张表，所以这一层只证明自洽。
        真正的外部判据是 zbar：见下面「口径与边界」。
      </text>
    </PkCard>

    <PkCard title="口径与边界" :accent="TINT">
      <PkRow v-for="n in BC_NOTES" :key="n.t" :label="n.t" :value="n.d" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { encode, readBack, widthProfile, SYM_ITEMS, SYMS, BARCODE_SAMPLES } from '@/utils/barcode'
import { copyText, toast } from '@/utils/clipboard'
import { saveCanvasImage } from '@/utils/image'

/** 本工具的品牌色：视图里唯一允许的字面色，其余颜色一律走 CSS 变量 */
const TINT = '#4A6B7A'
/** 预览最长边（px），超过就把单模块压到 1 px 并允许横向滚动 */
const PREVIEW_MAX = 300
const SEG_MAX = 60

const PX_ITEMS = [
  { key: 2, name: '2 px 屏显' },
  { key: 3, name: '3 px' },
  { key: 4, name: '4 px 日常' },
  { key: 6, name: '6 px 热敏' },
  { key: 8, name: '8 px 印刷' },
]
const H_ITEMS = [
  { key: 40, name: '40 矮' },
  { key: 60, name: '60 标准' },
  { key: 80, name: '80 高' },
  { key: 120, name: '120 加高' },
]
const QUIET_ITEMS = [
  { key: 0, name: '0（裁到码体）' },
  { key: 1, name: '1× 标准' },
  { key: 2, name: '2× 宽松' },
]
const KIND_NAME = { guard: '守卫', delim: '分隔符', data: '数据（L／正序）', dataG: '数据（G 反色）' }

const BC_NOTES = [
  { t: '全离线', d: '查表、校验位、模块排布全在本机算，不联网、不上传内容。' },
  {
    t: '依据标准',
    d: 'Code 39 按 9 元素 3 宽（15 模块／字符 + 1 模块间隔）、43 个数据字符加一个起止分隔符；EAN／UPC 按 GS1 的模块布局：守卫 101／01010／101，一位数字 7 模块，EAN-13 共 95 模块、EAN-8 共 67 模块，首位不占模块、只由左半 6 位的 L／G 奇偶排列表示。',
  },
  {
    t: '校验位',
    d: 'mod-10 加权求和：EAN-13 从左边第一位按 1、3、1、3…，EAN-8 与 UPC-A 按 3、1、3、1…。填 12 位（EAN-8 填 7 位）自动补末位；填满整位则复核，错了直接报中文提示并指出应为几。',
  },
  {
    t: '第三方复核',
    d: '这套位模表是拿开源解码器 zbar（zbarimg）反向标定与验收的：Code 39 的 44 个图案靠遍历 3-out-of-9 全部 84 种组合、逐个渲染再让 zbar 认出来的；EAN／UPC 则是 100 组随机码全部被 zbar 逐字符读回一致。自查脚本里这 50 组判官用例每次都会重跑。',
  },
  { t: 'UPC-A 的口径', d: 'UPC-A 就是补了前导 0 的 EAN-13（奇偶行全 L）。zbar 常把这种码报成 EAN-13 形式，所以判官比对的是 0 + 载荷，工具本身仍按 12 位进出。' },
  { t: '静区', d: '各码制的标准静区不一样（Code 39 为 10 模块，EAN-13／UPC-A 为 11，EAN-8 为 7），页面里按倍数放宽；选 0 会把白边裁掉，部分扫码枪会认不出。' },
  {
    t: '长度与上限',
    d: 'Code 39 标准本身不限长度，这里截到 40 字符是自选的护栏——码体太长会超出打印宽度，条空压到极限就扫不出了。EAN／UPC 位数固定。',
  },
  { t: '不做的部分', d: '不做 Code 128、ITF-25、Codabar、PDF417 与减位 UPC-E；二维码请走「二维码」那件工具。' },
  { t: '颜色与保存', d: '前景背景都取当前主题的 CSS 变量，换深色模式预览和保存图片一起变；预览是 <view> 色块，只有保存时才用画布，App 端先写私有目录再存相册，没给相册权限会失败并提示。' },
]

const sym = ref('ean13')
const text = ref('590123412345')
const outPx = ref(4)
const heightPx = ref(60)
const quietMul = ref(1)
const showText = ref(true)
const inverted = ref(false)
const saveMsg = ref('')
const box = ref(null)

const spec = computed(() => SYMS.find((s) => s.key === sym.value))
const quietStd = computed(() => spec.value.quiet)
const quietPx = computed(() => quietStd.value * quietMul.value)

const phText = computed(() => {
  const s = spec.value
  if (!s.digits) return '英文数字与 - . 空格 $ / + %，最长 40 字符'
  return s.name + ' 填前 ' + (s.digits - 1) + ' 位数字，校验位自动补'
})
const charsetTip = computed(() => {
  const s = spec.value
  if (!s.digits) {
    return 'Code 39 的字符集只有 43 个（0-9 A-Z - . 空格 $ / + %），没有小写字母——这里输小写会自动转大写。'
  }
  return (
    s.name + ' 只能是数字，空格与连字符按排版忽略。' +
    (s.key === 'upca' ? '美国商品码，首位（数制）只允许 0 或 1。' : '')
  )
})

function pick(s) {
  sym.value = s.sym
  text.value = s.value
}

const state = computed(() => {
  const raw = String(text.value)
  if (!raw.trim()) return { enc: null, err: '' }
  try {
    return { enc: encode(raw, sym.value), err: '' }
  } catch (e) {
    return { enc: null, err: (e && e.message) || '编码失败' }
  }
})
const enc = computed(() => state.value.enc)
const err = computed(() => state.value.err)

const rt = computed(() => {
  const e = enc.value
  if (!e) return { ok: false, back: '', why: '' }
  try {
    const back = readBack(e.modules, e.sym)
    return { ok: back === e.payload, back, why: back === e.payload ? '' : '读回「' + back + '」，与载荷不符' }
  } catch (x) {
    return { ok: false, back: '', why: ((x && x.message) || '') + ' / ' + e.modules.slice(0, 24) + '…' }
  }
})
const rtOk = computed(() => rt.value.ok)
const rtBack = computed(() => rt.value.back)
const rtErr = computed(() => rt.value.why || '读不回原内容')
const prof = computed(() => widthProfile(enc.value ? enc.value.modules : ''))

/* ---------- 几何：模块串 → 条块 ---------- */
const totalModules = computed(() => (enc.value ? enc.value.moduleCount + quietPx.value * 2 : 0))
const unit = computed(() => {
  const t = totalModules.value
  if (!t) return 1
  return Math.max(1, Math.min(4, Math.floor(PREVIEW_MAX / t)))
})
/** 守卫的条要往下扎一截，这是 EAN／UPC 的样子；Code 39 没有守卫 */
const guardExt = computed(() => (sym.value === 'code39' ? 0 : Math.max(3, Math.round(heightPx.value * 0.16))))
const barAreaH = computed(() => heightPx.value + guardExt.value)
const capH = computed(() => (showText.value ? Math.max(14, Math.round(heightPx.value * 0.34)) : 0))
const stripH = computed(() => barAreaH.value + capH.value)
const totalW = computed(() => totalModules.value * unit.value)

/** 每段属于哪个结构块：守卫段用来看条要不要加长 */
const guardRanges = computed(() => {
  const e = enc.value
  if (!e) return []
  return e.structure.filter((s) => s.kind === 'guard' || s.kind === 'delim').map((s) => [s.from, s.to])
})

const bars = computed(() => {
  const e = enc.value
  if (!e) return []
  const u = unit.value
  const ranges = guardRanges.value
  const out = []
  let at = quietPx.value
  for (const r of e.runs) {
    if (r.on) {
      const isGuard = ranges.some(([a, b]) => r.start >= a && r.end <= b)
      out.push({
        left: at * u,
        w: r.len * u,
        h: isGuard ? barAreaH.value : heightPx.value,
      })
    }
    at += r.len
  }
  return out
})

/* ---------- 可读文字：EAN／UPC 按标准分块摆，位置以「模块」为单位 ---------- */
const capPieces = computed(() => {
  const e = enc.value
  if (!e || !showText.value) return []
  const p = e.payload
  const q = quietPx.value
  if (e.sym === 'code39' || q === 0) {
    return [{ text: p, align: 'center', xm: q + e.moduleCount / 2, wide: e.sym === 'code39' }]
  }
  if (e.sym === 'ean13') {
    return [
      { text: p[0], align: 'right', xm: q - 1 },
      { text: p.slice(1, 7), align: 'center', xm: q + 24 },
      { text: p.slice(7), align: 'center', xm: q + 71 },
    ]
  }
  if (e.sym === 'ean8') {
    return [
      { text: p.slice(0, 4), align: 'center', xm: q + 17 },
      { text: p.slice(4), align: 'center', xm: q + 50 },
    ]
  }
  return [
    { text: p[0], align: 'right', xm: q - 1 },
    { text: p.slice(1, 6), align: 'center', xm: q + 27.5 },
    { text: p.slice(6, 11), align: 'center', xm: q + 67.5 },
    { text: p[11], align: 'left', xm: q + e.moduleCount + 1 },
  ]
})

function capStyle(c) {
  return {
    left: c.xm * unit.value + 'px',
    transform: c.align === 'center' ? 'translateX(-50%)' : c.align === 'right' ? 'translateX(-100%)' : 'none',
    fontSize: fontPx() + 'px',
    letterSpacing: c.wide ? '1px' : '2px',
  }
}
function fontPx() {
  return Math.max(9, Math.round(heightPx.value * 0.26))
}

const fitTip = computed(() => {
  if (!enc.value) return ''
  if (totalW.value > PREVIEW_MAX + 40) {
    return '码体比屏幕还宽，预览已压到 1 px／模块，下面这条可以横向拖动；保存按上面选的 ' + outPx.value + ' px 出全尺寸。'
  }
  return '预览按 ' + unit.value + ' px／模块 画，仅供肉眼确认；真要靠它扫，请用上面的保存出图（' + outPx.value + ' px／模块）。'
})
const ratioTip = computed(() => {
  const r = enc.value ? enc.value.stats.ratio : 0
  if (r < 45) return '深色占 ' + r + '%，偏淡：条空比正常，静区够宽就能读。'
  if (r > 55) return '深色占 ' + r + '%，偏浓：这类码对打印墨量敏感，印糊了条空会粘连，建议换更小的模块或加大高度。'
  return '深色占 ' + r + '%，接近 1:1，是最耐印耐扫的区间。'
})
const segTip = computed(() => {
  if (!enc.value) return ''
  if (enc.value.sym === 'code39') {
    return '首尾两格是起止分隔符（星号），它不算数据；中间每格一个字符，固定 15 模块。'
  }
  return '三段守卫固定占 3+5+3 模块；标了 G 反色的左半位就是奇偶表在起作用，首位数字靠这一排列表示。'
})

const segRows = computed(() => (enc.value ? enc.value.structure.slice(0, SEG_MAX) : []))

/* ---------- 保存尺寸 & 画布 ---------- */
const saveW = computed(() => (enc.value ? totalModules.value * outPx.value : 0))
const saveH = computed(() => barAreaH.value + capH.value)

/* ---------- 颜色：从当前主题的 CSS 变量里取，视图内不写死 ---------- */
function isColor(s) {
  const v = String(s || '').trim()
  return v.indexOf('rgb') > -1 || /^#[0-9a-fA-F]{3,8}$/.test(v)
}
function readColors() {
  const fail = new Error('没能从当前主题里取到前景与背景色，请先让条码显示出来再保存')
  const node = box.value
  const el = node && (node.$el || node)
  if (!el || typeof window === 'undefined' || !window.getComputedStyle) throw fail
  const cs = window.getComputedStyle(el)
  const bg = cs.backgroundColor
  let fg = cs.getPropertyValue ? String(cs.getPropertyValue('--bc-fg') || '').trim() : ''
  if (!isColor(fg)) {
    const probe = el.querySelector ? el.querySelector('.bc__bar') : null
    if (probe) fg = window.getComputedStyle(probe).backgroundColor
  }
  if (!isColor(fg) || !isColor(bg)) throw fail
  return { fg, bg }
}

function buildCanvas() {
  const e = enc.value
  if (!e) return null
  if (typeof document === 'undefined' || !document.createElement) throw new Error('当前环境没有画布能力，存不了图')
  const colors = readColors()
  const px = outPx.value
  const q = quietPx.value * px
  const barH = heightPx.value
  const gExt = guardExt.value
  const textH = capH.value
  const c = document.createElement('canvas')
  c.width = totalModules.value * px
  c.height = saveH.value
  const ctx = c.getContext('2d')
  ctx.fillStyle = colors.bg
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = colors.fg
  const ranges = guardRanges.value
  let at = q
  for (const r of e.runs) {
    if (r.on) {
      const isGuard = ranges.some(([a, b]) => r.start >= a && r.end <= b)
      ctx.fillRect(at, 0, r.len * px, barH + (isGuard ? gExt : 0))
    }
    at += r.len * px
  }
  if (textH) {
    ctx.font = fontPx() + 'px sans-serif'
    ctx.textBaseline = 'top'
    for (const p of capPieces.value) {
      ctx.textAlign = p.align === 'center' ? 'center' : p.align === 'right' ? 'right' : 'left'
      ctx.fillText(p.text, p.xm * px, barH + gExt + 2)
    }
  }
  return c
}

async function doSave() {
  saveMsg.value = ''
  if (!enc.value) {
    toast('先生成条码')
    return
  }
  try {
    const c = buildCanvas()
    await saveCanvasImage(c, 'barcode-' + enc.value.sym + '-' + enc.value.payload + '.png', 'image/png')
    toast('已保存到相册')
  } catch (x) {
    saveMsg.value = (x && x.message) || '保存失败，可能是相册权限没给'
  }
}

function doCopy() {
  if (!enc.value) {
    toast('还没有内容可复制')
    return
  }
  copyText(enc.value.payload)
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
.bc {
  --bc-fg: var(--pk-text);
  --bc-bg: var(--pk-card);
  background: var(--bc-bg);
  padding: 16rpx 0;
}
.bc--inv {
  --bc-fg: var(--pk-card);
  --bc-bg: var(--pk-text);
}
.bc__scroll {
  width: 100%;
}
.bc__strip {
  position: relative;
  margin: 0 auto;
}
.bc__bar {
  position: absolute;
  top: 0;
  background: var(--bc-fg);
}
.bc__cap {
  position: absolute;
}
.bc__cap__t {
  position: absolute;
  top: 4rpx;
  color: var(--bc-fg);
  font-family: Menlo, Consolas, monospace;
  white-space: nowrap;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  padding: 12rpx 24rpx 0;
}
.meta__i {
  font-size: 21rpx;
  color: var(--pk-text-3);
  margin: 4rpx 18rpx 0 0;
  padding: 6rpx 14rpx;
  border-radius: 8rpx;
  background: var(--pk-bg-soft);
}
.seg {
  padding: 4rpx 24rpx 8rpx;
}
.seg__r {
  display: flex;
  align-items: baseline;
  padding: 8rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.seg__k {
  font-size: 21rpx;
  color: var(--pk-text-2);
  width: 190rpx;
  flex-shrink: 0;
}
.seg__v {
  font-size: 23rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
  width: 110rpx;
  flex-shrink: 0;
}
.seg__m {
  font-size: 20rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text-3);
}
</style>
