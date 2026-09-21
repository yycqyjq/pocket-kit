/**
 * 图片取色 / 取色板
 * ------------------------------------------------------------
 * 面向 H5 与 App（plus webview）：两者都有 DOM 的 Image 与 canvas，
 * 小程序端没有，相关工具会走降级提示。
 *
 * 全部计算都在本地完成：像素来自本地图片解码后的 canvas，
 * 不联网、不上传、不依赖任何第三方取色库。
 * 颜色格式换算尽量复用 utils/color.js，这里只补它没有的 CMYK 与取样逻辑。
 */

import { rgbToHex, rgbToHsl, luminance, contrastRatio, readableTextOn, nearestName, clamp } from './color'

/** 取色历史上限，视图层的「清空 / 溢出丢弃」都读这一个常量 */
export const MAX_HISTORY = 20

/** 采样画布最长边：超大图按比例缩小后再取色，避免移动端 canvas 内存爆掉 */
export const MAX_SAMPLE_EDGE = 2600

/** 取色板网格取样：每边最多多少个探针（最多 grid² 个样本） */
export const PALETTE_GRID = 72

/** 取色板贪心去重的最小色距（RGB 欧氏距离，0-441），太相近的颜色会被合并 */
export const PALETTE_MIN_DISTANCE = 46

/** 取色板可选档 */
export const PALETTE_SIZES = [5, 8]

/** 放大镜默认：以选中像素为中心，取 span×span 个像素，放大 zoom 倍 */
export const MAGNIFY_SPAN = 11
export const MAGNIFY_ZOOM = 12

/** 把 RGB 转 CMYK（color.js 没有，这里补一个，用最常见的朴素公式） */
export function rgbToCmyk(r, g, b) {
  const rf = clamp(r, 0, 255) / 255
  const gf = clamp(g, 0, 255) / 255
  const bf = clamp(b, 0, 255) / 255
  const k = 1 - Math.max(rf, gf, bf)
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 }
  const inv = 1 - k
  return {
    c: Math.round(((1 - rf - k) / inv) * 100),
    m: Math.round(((1 - gf - k) / inv) * 100),
    y: Math.round(((1 - bf - k) / inv) * 100),
    k: Math.round(k * 100),
  }
}

/** 由 r/g/b/a 生成一份完整描述：HEX / RGB / HSL / CMYK + 亮度 + 对比度 + 近名 */
export function describeColor(r, g, b, a) {
  const alpha = a === undefined ? 255 : clamp(a, 0, 255)
  const hex = rgbToHex(r, g, b)
  const hsl = rgbToHsl(r, g, b)
  const cmyk = rgbToCmyk(r, g, b)
  const lum = luminance(hex)
  const onWhite = contrastRatio(hex, '#ffffff')
  const onBlack = contrastRatio(hex, '#000000')
  const onBg = contrastRatio(hex, '#1D2521')
  const text = readableTextOn(hex)
  return {
    r,
    g,
    b,
    a: alpha,
    hex,
    hexUpper: hex.toUpperCase(),
    hex8: alpha === 255 ? '' : hex.slice(1) + alpha.toString(16).padStart(2, '0'),
    alpha: Number((alpha / 255).toFixed(3)),
    rgbText: 'rgb(' + r + ', ' + g + ', ' + b + ')',
    rgbaText: alpha === 255 ? '' : 'rgba(' + r + ', ' + g + ', ' + b + ', ' + (alpha / 255).toFixed(2) + ')',
    cssHex: alpha === 255 ? hex : '#' + (hex.slice(1) + alpha.toString(16).padStart(2, '0')),
    hsl,
    hslText: 'hsl(' + hsl.h + ', ' + hsl.s + '%, ' + hsl.l + '%)',
    cmyk,
    cmykText: 'cmyk(' + cmyk.c + '%, ' + cmyk.m + '%, ' + cmyk.y + '%, ' + cmyk.k + '%)',
    luminance: Number(lum.toFixed(4)),
    luminanceText: lum.toFixed(4),
    onWhite,
    onBlack,
    onBg,
    bestText: text,
    bestTextText: '放进这个颜色里当文字用 ' + text + '，对比度 ' + (text === '#FFFFFF' ? onBlack.text : onWhite.text),
    name: nearestName(hex),
    isDark: lum <= 0.45,
  }
}

/** 色距（RGB 欧氏距离），取色板去重用 */
export function colorDistance(a, b) {
  return Math.sqrt(Math.pow(a.r - b.r, 2) + Math.pow(a.g - b.g, 2) + Math.pow(a.b - b.b, 2))
}

function makeContext(img, label) {
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  if (!w || !h) throw new Error(label + '：读不到图片尺寸，换一张试试')
  const scale = Math.min(1, MAX_SAMPLE_EDGE / Math.max(w, h))
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))
  let canvas
  let ctx
  try {
    canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, cw, ch)
  } catch (e) {
    throw new Error(label + '：这台设备的画布用不了（' + (e && e.message ? e.message : '未知原因') + '）')
  }
  if (!ctx) throw new Error(label + '：拿不到画布上下文，取色需要 2D canvas')
  return { canvas, ctx, width: w, height: h, cw, ch, scale }
}

/**
 * 建一个取样器：一次解码 + 一次绘制，后续点击只读 1×1 像素。
 * 坐标一律用「自然像素」，内部按 scale 换算到画布像素，
 * H5 与 App webview 走同一条路径，行为一致。
 */
export function createSampler(img) {
  const base = makeContext(img, '取色准备失败')
  const { canvas, ctx, width, height, cw, ch, scale } = base

  /** 所有画布读取都收在这里：一旦被污染/内存不足，统一换成中文 Error，不把 DOMException 抛给界面 */
  function readPixels(x, y, w, h) {
    try {
      return ctx.getImageData(x, y, w, h)
    } catch (e) {
      throw new Error('读不到图片像素：' + ((e && e.message) || '浏览器拒绝了画布读取') + '。可以先截图再取色')
    }
  }

  // 先探一次像素：canvas 被污染或内存不足时，这里就抛中文错，不留到点击时才崩
  readPixels(0, 0, 1, 1)

  return {
    width,
    height,
    canvasWidth: cw,
    canvasHeight: ch,
    /** 自然像素 → 画布像素的比例，小于 1 说明大图被按比例降采样过 */
    scale,
    downscaled: scale < 1,
    canvas,
    /** 自然像素坐标 → 该点颜色，越界返回 clamp 到边缘的结果并带 inRange=false */
    pickAt(nx, ny) {
      const inRange = nx >= 0 && ny >= 0 && nx < width && ny < height
      const cx = clamp(Math.floor((nx / width) * cw), 0, cw - 1)
      const cy = clamp(Math.floor((ny / height) * ch), 0, ch - 1)
      const d = readPixels(cx, cy, 1, 1).data
      const info = describeColor(d[0], d[1], d[2], d[3])
      return Object.assign(info, { x: clamp(Math.floor(nx), 0, Math.max(0, width - 1)), y: clamp(Math.floor(ny), 0, Math.max(0, height - 1)), inRange, approx: scale < 1 })
    },
    /** 画布像素，给「按屏幕点击位置取色」用 */
    pickCanvas(cx, cy) {
      const nx = (clamp(cx, 0, cw - 1) / cw) * width
      const ny = (clamp(cy, 0, ch - 1) / ch) * height
      return this.pickAt(nx, ny)
    },
    /** 放大镜：以某点为中心取 span×span 个自然像素，硬边放大成 dataURL */
    magnifyAt(nx, ny, span, zoom) {
      const s = span || MAGNIFY_SPAN
      const z = zoom || MAGNIFY_ZOOM
      const size = Math.min(1080, s * z)
      let out
      let octx
      try {
        out = document.createElement('canvas')
        out.width = size
        out.height = size
        octx = out.getContext('2d')
      } catch (e) {
        throw new Error('放大镜画布创建失败：' + ((e && e.message) || '未知原因'))
      }
      if (!octx) throw new Error('放大镜拿不到 2D 画布')
      // 画布可能被降采样过，把「自然像素跨度」换算回画布像素
      const sw = Math.max(1, Math.round(s * (cw / width)))
      const sh = Math.max(1, Math.round(s * (ch / height)))
      const sx = Math.round((nx / width) * cw - sw / 2)
      const sy = Math.round((ny / height) * ch - sh / 2)
      octx.imageSmoothingEnabled = false
      try {
        octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, size, size)
        return { url: out.toDataURL('image/png'), span: s, zoom: z, size, sx, sy, sw, sh }
      } catch (e) {
        throw new Error('放大镜导出失败：' + ((e && e.message) || '画布被浏览器保护'))
      }
    },
    /** 取色板：网格取样 + 分桶统计 + 贪心去重，得到 k 个代表色 */
    palette(k, step) {
      return buildPalette(ctx, cw, ch, k, step)
    },
  }
}

/**
 * 取色板核心：
 * 1) 在画布上均匀撒 PALETTE_GRID×PALETTE_GRID 个探针（可传 step 调密度）；
 * 2) 丢掉接近透明的样本；
 * 3) 按每通道 32 一档分桶，桶内累加求均值与权重；
 * 4) 桶按权重降序，贪心挑代表色，色距小于阈值就跳过；不够就逐级放宽阈值补齐。
 * 纯本地算术，没有第三方量化库。
 */
export function buildPalette(ctx, cw, ch, k, step) {
  const want = clamp(k || PALETTE_SIZES[0], 2, 16)
  const gx = clamp(step || Math.min(PALETTE_GRID, cw), 2, Math.max(2, cw))
  const gy = clamp(step || Math.min(PALETTE_GRID, ch), 2, Math.max(2, ch))
  let img
  try {
    img = ctx.getImageData(0, 0, cw, ch)
  } catch (e) {
    throw new Error('读不到图片像素，做不了取色板：' + (e && e.message ? e.message : '画布被拒绝读取'))
  }
  const data = img.data
  const buckets = new Map()
  let total = 0
  for (let y = 0; y < gy; y++) {
    const py = Math.round((y * (ch - 1)) / (gy - 1))
    for (let x = 0; x < gx; x++) {
      const px = Math.round((x * (cw - 1)) / (gx - 1))
      const i = (py * cw + px) * 4
      if (data[i + 3] < 128) continue
      total++
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const key = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5)
      let bu = buckets.get(key)
      if (!bu) {
        bu = { n: 0, r: 0, g: 0, b: 0 }
        buckets.set(key, bu)
      }
      bu.n++
      bu.r += r
      bu.g += g
      bu.b += b
    }
  }
  if (!total) throw new Error('这张图几乎全是透明像素，取不出色板')
  const list = []
  buckets.forEach((bu) => {
    list.push({ r: Math.round(bu.r / bu.n), g: Math.round(bu.g / bu.n), b: Math.round(bu.b / bu.n), n: bu.n })
  })
  list.sort((a, b) => b.n - a.n)

  let picked = []
  let threshold = PALETTE_MIN_DISTANCE
  for (let round = 0; round < 5 && picked.length < want; round++) {
    picked = []
    for (let i = 0; i < list.length && picked.length < want; i++) {
      const c = list[i]
      if (picked.every((p) => colorDistance(p, c) >= threshold)) picked.push(c)
    }
    threshold = Math.max(8, Math.round(threshold * 0.6))
  }
  // 极端情况（纯色图）下补齐，保证长度等于 want 或等于可用色数
  while (picked.length < want && list.length > picked.length) {
    const next = list[picked.length]
    if (picked.indexOf(next) === -1) picked.push(next)
    else break
  }
  return picked.map((c) => {
    const info = describeColor(c.r, c.g, c.b, 255)
    return Object.assign(info, {
      share: Number(((c.n / total) * 100).toFixed(1)),
      shareText: ((c.n / total) * 100).toFixed(1) + '%',
      samples: c.n,
    })
  })
}

/** 色板可用性建议：每格给「压什么字、能不能当正文色」的 WCAG 结论 */
export function paletteAdvice(list) {
  return (list || []).map((c) => {
    const hex = typeof c === 'string' ? c : c.hex
    const on = readableTextOn(hex)
    const cr = contrastRatio(hex, on)
    return {
      hex,
      text: on,
      ratio: cr.text,
      level: cr.aaa ? 'AAA 随便用' : cr.aa ? 'AA 正文可用' : cr.aaLarge ? '仅大字/图标' : '别拿它当底色放正文',
      aa: cr.aa,
      aaa: cr.aaa,
    }
  })
}

/** 色板导出成可复制文本 */
export function paletteToText(list) {
  const rows = list || []
  return rows
    .map((c, i) => (i + 1) + '. ' + c.hex.toUpperCase() + '  ' + c.rgbText + '  占比 ' + (c.shareText || '—') + '  近名「' + c.name + '」')
    .join('\n')
}

/** 一次取色的完整可复制文本 */
export function colorToText(p) {
  const lines = [
    '坐标 ' + p.x + ', ' + p.y + (p.approx ? '（大图已降采样，颜色代表该像素所在区域）' : ''),
    'HEX   ' + (p.hex8 ? p.cssHex.toUpperCase() : p.hex.toUpperCase()),
    'RGB   ' + p.rgbText,
  ]
  if (p.rgbaText) lines.push('RGBA  ' + p.rgbaText)
  lines.push(
    'HSL   ' + p.hslText,
    'CMYK  ' + p.cmykText,
    '亮度  ' + p.luminanceText + (p.a < 255 ? '　Alpha ' + p.alpha : ''),
    '白底对比 ' + p.onWhite.text + (p.onWhite.aa ? '（达 AA）' : '（不足 AA）'),
    '黑底对比 ' + p.onBlack.text + (p.onBlack.aa ? '（达 AA）' : '（不足 AA）'),
    '近名    ' + p.name
  )
  return lines.join('\n')
}
