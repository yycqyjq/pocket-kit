/**
 * 颜色计算
 */

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

export function normalizeHex(hex) {
  let h = String(hex).trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (/^[0-9a-fA-F]{8}$/.test(h)) h = h.slice(0, 6)
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return '#' + h.toLowerCase()
}

export function hexToRgb(hex) {
  const h = normalizeHex(hex)
  if (!h) return null
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  }
}

export function rgbToHex(r, g, b) {
  return (
    '#' +
    [r, g, b]
      .map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0'))
      .join('')
  )
}

export function rgbToHsl(r, g, b) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  const d = max - min
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  }
}

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360
  s = clamp(s, 0, 100) / 100
  l = clamp(l, 0, 100) / 100
  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue2rgb = (t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return {
    r: Math.round(hue2rgb(h + 1 / 3) * 255),
    g: Math.round(hue2rgb(h) * 255),
    b: Math.round(hue2rgb(h - 1 / 3) * 255),
  }
}

export function hexToHsl(hex) {
  const rgb = hexToRgb(hex)
  return rgb ? rgbToHsl(rgb.r, rgb.g, rgb.b) : null
}

export function hslToHex(h, s, l) {
  const rgb = hslToRgb(h, s, l)
  return rgbToHex(rgb.r, rgb.g, rgb.b)
}

/** 相对亮度（WCAG） */
export function luminance(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const a = [rgb.r, rgb.g, rgb.b].map((v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]
}

/** 对比度，返回如 "4.53 : 1" */
export function contrastRatio(hexA, hexB) {
  const la = luminance(hexA)
  const lb = luminance(hexB)
  const ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
  return {
    value: ratio,
    text: ratio.toFixed(2) + ' : 1',
    aa: ratio >= 4.5,
    aaa: ratio >= 7,
    aaLarge: ratio >= 3,
  }
}

/** 判断深色/浅色，返回适合放在该底色上的文字色 */
export function readableTextOn(hex) {
  return luminance(hex) > 0.45 ? '#1D2521' : '#FFFFFF'
}

export function isLightColor(hex) {
  return luminance(hex) > 0.45
}

/** 调整亮度（l 为百分比增量） */
export function shiftLightness(hex, delta) {
  const hsl = hexToHsl(hex)
  if (!hsl) return hex
  return hslToHex(hsl.h, hsl.s, clamp(hsl.l + delta, 0, 100))
}

/** 生成配色：互补 / 邻近 / 三角 */
export function scheme(hex, type) {
  const hsl = hexToHsl(hex)
  if (!hsl) return []
  const offsets = {
    complement: [180],
    analogous: [-30, 30],
    triad: [120, 240],
    split: [150, 210],
    tetrad: [90, 180, 270],
  }[type || 'complement'] || [180]
  return offsets.map((d) => {
    const h = (hsl.h + d + 360) % 360
    return { hex: hslToHex(h, hsl.s, hsl.l), h }
  })
}

/** 由主色生成一组深浅阶梯，用于做界面配色 */
export function ramp(hex, steps) {
  const hsl = hexToHsl(hex)
  if (!hsl) return []
  const n = steps || 9
  const out = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const l = 95 - t * 80
    const s = hsl.s * (1 - Math.abs(t - 0.5) * 0.35)
    out.push(hslToHex(hsl.h, clamp(s, 0, 100), clamp(l, 3, 97)))
  }
  return out
}

/** 常见命名色，按相近度匹配 */
export function nearestName(hex) {
  const names = [
    ['黑', '#000000'], ['白', '#ffffff'], ['灰', '#808080'], ['银', '#c0c0c0'],
    ['红', '#ff0000'], ['橙', '#ff8000'], ['黄', '#ffff00'], ['草绿', '#7fff00'],
    ['绿', '#008000'], ['青', '#00ffff'], ['蓝', '#0000ff'], ['靛', '#4b0082'],
    ['紫', '#800080'], ['品红', '#ff00ff'], ['粉', '#ffc0cb'], ['棕', '#8b4513'],
    ['藏青', '#1a2b4c'], ['豆沙', '#c47b6b'], ['雾霾蓝', '#6e8ca0'], ['藕荷', '#c7a5b8'],
    ['墨绿', '#2f4f4f'], ['酒红', '#8b1a1a'], ['赭', '#b06a3b'], ['杏', '#f5c396'],
  ]
  const rgb = hexToRgb(hex)
  if (!rgb) return ''
  let best = ''
  let bestD = Infinity
  for (const [name, h] of names) {
    const c = hexToRgb(h)
    const d =
      Math.pow(c.r - rgb.r, 2) + Math.pow(c.g - rgb.g, 2) + Math.pow(c.b - rgb.b, 2)
    if (d < bestD) {
      bestD = d
      best = name
    }
  }
  return best
}
