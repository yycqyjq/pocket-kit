/**
 * color.js 自查断言（直接测 src/utils/color.js 本体）
 * ------------------------------------------------------------
 * 判据分四类，外部来源如下：
 *   1) 外部裁判（WCAG 公式）：对比度用 WCAG 2.x 定义在测试里独立实现一遍 ——
 *      sRGB 线性化（c<=0.04045 走 c/12.92，否则 ((c+0.055)/1.055)^2.4）、
 *      相对亮度 0.2126R+0.7152G+0.0722B、对比度 (L1+0.05)/(L2+0.05)。拿它逐对跟模块对撞。
 *      黑白极端必须正好是 21；#767676 白底约 4.54 过 AA、#777777 约 4.48 不过 AA 是 WCAG 经典锚点。
 *   2) 色彩事实：纯红/绿/蓝的相对亮度就是 0.2126/0.7152/0.0722；红/绿/蓝的 HSL 是 (0/120/240,100,50)；
 *      橙 #ff8000 的色相是 30°；互补色取 +180°（红的互补是青 #00ffff）。
 *   3) 往返性质：hex→rgb→hex 闭合；hsl→hex→hsl 在 ±2 内闭合；夹取与四舍五入的边界。
 *   4) 边界与反例：3 位/8 位 hex、非法 hex、空串、越界通道值、非法输入给空/0/null 而不是崩。
 */
import { useUtils, makeTest } from './harness.mjs'

const C = await useUtils('color')
const T = makeTest('color')

/* 独立 WCAG 实现 */
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
const refLum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const hexRgb = (h) => { h = String(h).replace('#', ''); return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) } }
const refContrast = (a, b) => {
  const A = hexRgb(a)
  const B = hexRgb(b)
  const la = refLum(A.r, A.g, A.b)
  const lb = refLum(B.r, B.g, B.b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/* ---------- 1. 相对亮度 ---------- */
T.eq('luminance 白 = 1', C.luminance('#ffffff'), 1)
T.eq('luminance 黑 = 0', C.luminance('#000000'), 0)
T.ok('luminance 红 = 0.2126', Math.abs(C.luminance('#ff0000') - 0.2126) < 1e-12)
T.ok('luminance 绿 = 0.7152', Math.abs(C.luminance('#00ff00') - 0.7152) < 1e-12)
T.ok('luminance 蓝 = 0.0722', Math.abs(C.luminance('#0000ff') - 0.0722) < 1e-12)
T.eq('luminance 非法给 0', C.luminance('nope'), 0)
T.ok('luminance 与独立实现一致', Math.abs(C.luminance('#6e8ca0') - refLum(0x6e, 0x8c, 0xa0)) < 1e-12)

/* ---------- 2. 对比度（WCAG） ---------- */
const bw = C.contrastRatio('#000000', '#ffffff')
T.ok('黑白对比度正好 21', Math.abs(bw.value - 21) < 1e-12)
T.eq('黑白 text', bw.text, '21.00 : 1')
T.eq('黑白过 AA', bw.aa, true)
T.eq('黑白过 AAA', bw.aaa, true)
T.eq('黑白大字号可读', bw.aaLarge, true)
T.ok('对比度对称', C.contrastRatio('#ffffff', '#000000').value === bw.value)
T.eq('#767676 白底过 AA', C.contrastRatio('#767676', '#ffffff').aa, true)
T.eq('#777777 白底不过 AA', C.contrastRatio('#777777', '#ffffff').aa, false)
for (const [a, b] of [['#000000', '#ffffff'], ['#6e8ca0', '#ffffff'], ['#ff8000', '#1d2521'], ['#4b0082', '#f5c396']]) {
  T.ok('对比度与独立实现一致 ' + a + '/' + b, Math.abs(C.contrastRatio(a, b).value - refContrast(a, b)) < 1e-12)
}
T.ok('对比度 text 形状', /^\d+\.\d{2} : 1$/.test(C.contrastRatio('#123456', '#ffffff').text))

/* ---------- 3. hex 归一化与解析 ---------- */
T.eq('normalizeHex 三位补全', C.normalizeHex('#FFF'), '#ffffff')
T.eq('normalizeHex 无井号', C.normalizeHex('abc'), '#aabbcc')
T.eq('normalizeHex 六位转小写', C.normalizeHex('#AABBCC'), '#aabbcc')
T.eq('normalizeHex 八位截断前六位', C.normalizeHex('#aabbccdd'), '#aabbcc')
T.eq('normalizeHex 去空格', C.normalizeHex('  #AbC  '), '#aabbcc')
T.eq('normalizeHex 五位非法', C.normalizeHex('#12345'), null)
T.eq('normalizeHex 非法字符', C.normalizeHex('#GGGGGG'), null)
T.eq('normalizeHex 空串', C.normalizeHex(''), null)
T.eq('hexToRgb', C.hexToRgb('#ff8000'), { r: 255, g: 128, b: 0 })
T.eq('hexToRgb 三位', C.hexToRgb('#000'), { r: 0, g: 0, b: 0 })
T.eq('hexToRgb 非法', C.hexToRgb('zz'), null)

/* ---------- 4. rgbToHex（夹取与四舍五入） ---------- */
T.eq('rgbToHex', C.rgbToHex(255, 128, 0), '#ff8000')
T.eq('rgbToHex 越界夹住', C.rgbToHex(300, -5, 128), '#ff0080')
T.eq('rgbToHex 四舍五入', C.rgbToHex(127.6, 0, 0), '#800000')
for (const h of ['#000000', '#ffffff', '#ff0000', '#123456', '#abcdef', '#00ff80']) {
  T.eq('hex→rgb→hex ' + h, C.rgbToHex(C.hexToRgb(h).r, C.hexToRgb(h).g, C.hexToRgb(h).b), h)
}

/* ---------- 5. HSL 双向 ---------- */
T.eq('rgbToHsl 红', C.rgbToHsl(255, 0, 0), { h: 0, s: 100, l: 50 })
T.eq('rgbToHsl 绿', C.rgbToHsl(0, 255, 0), { h: 120, s: 100, l: 50 })
T.eq('rgbToHsl 蓝', C.rgbToHsl(0, 0, 255), { h: 240, s: 100, l: 50 })
T.eq('rgbToHsl 白', C.rgbToHsl(255, 255, 255), { h: 0, s: 0, l: 100 })
T.eq('rgbToHsl 黑', C.rgbToHsl(0, 0, 0), { h: 0, s: 0, l: 0 })
T.eq('rgbToHsl 灰饱和度为 0', C.rgbToHsl(128, 128, 128).s, 0)
T.eq('rgbToHsl 橙色相 30', C.rgbToHsl(255, 128, 0), { h: 30, s: 100, l: 50 })
T.eq('hslToRgb 红', C.hslToRgb(0, 100, 50), { r: 255, g: 0, b: 0 })
T.eq('hslToRgb 绿', C.hslToRgb(120, 100, 50), { r: 0, g: 255, b: 0 })
T.eq('hslToRgb 蓝', C.hslToRgb(240, 100, 50), { r: 0, g: 0, b: 255 })
T.eq('hslToRgb 灰', C.hslToRgb(0, 0, 50), { r: 128, g: 128, b: 128 })
T.eq('hslToRgb 360 折回 0', C.hslToRgb(360, 100, 50), { r: 255, g: 0, b: 0 })
T.eq('hslToRgb 负角度折回', C.hslToRgb(-120, 100, 50), { r: 0, g: 0, b: 255 })
T.eq('hslToHex 红', C.hslToHex(0, 100, 50), '#ff0000')
T.eq('hslToHex 橙', C.hslToHex(30, 100, 50), '#ff8000')
T.eq('hexToHsl 红', C.hexToHsl('#ff0000'), { h: 0, s: 100, l: 50 })
T.eq('hexToHsl 非法给 null', C.hexToHsl('x'), null)
for (const [h, s, l] of [[30, 100, 50], [200, 60, 40], [0, 0, 50], [120, 100, 50]]) {
  const back = C.hexToHsl(C.hslToHex(h, s, l))
  T.ok('hsl 往返 ±2 ' + h + ',' + s + ',' + l, Math.abs(back.h - h) <= 2 && Math.abs(back.s - s) <= 2 && Math.abs(back.l - l) <= 2, JSON.stringify(back))
}

/* ---------- 6. 文字色 / 配色方案 / 阶梯 ---------- */
T.eq('浅底用深字', C.readableTextOn('#ffffff'), '#1D2521')
T.eq('深底用浅字', C.readableTextOn('#000000'), '#FFFFFF')
T.eq('中灰用浅字', C.readableTextOn('#808080'), '#FFFFFF')
T.eq('银底用深字', C.readableTextOn('#c0c0c0'), '#1D2521')

T.eq('complement 长度 1', C.scheme('#ff0000', 'complement').length, 1)
T.eq('红的互补是青', C.scheme('#ff0000', 'complement')[0].hex, '#00ffff')
T.eq('complement 色相 180', C.scheme('#ff0000', 'complement')[0].h, 180)
T.eq('analogous 色相', C.scheme('#ff0000', 'analogous').map((x) => x.h), [330, 30])
T.eq('triad 色相', C.scheme('#ff0000', 'triad').map((x) => x.h), [120, 240])
T.eq('split 色相', C.scheme('#ff0000', 'split').map((x) => x.h), [150, 210])
T.eq('tetrad 返回 3 个偏移（不含基色）', C.scheme('#ff0000', 'tetrad').length, 3)
T.eq('tetrad 色相', C.scheme('#ff0000', 'tetrad').map((x) => x.h), [90, 180, 270])
T.eq('scheme 缺省是互补', C.scheme('#ff0000').length, 1)
T.eq('scheme 非法给空数组', C.scheme('nope', 'triad'), [])
T.ok('scheme 结果都是合法 hex', C.scheme('#336699', 'tetrad').every((x) => /^#[0-9a-f]{6}$/.test(x.hex)))

T.eq('ramp 长度 9', C.ramp('#ff0000', 9).length, 9)
T.eq('ramp 缺省长度 9', C.ramp('#ff0000').length, 9)
T.ok('ramp 首尾不同', C.ramp('#ff0000', 9)[0] !== C.ramp('#ff0000', 9)[8])
T.ok('ramp 由浅到深', C.luminance(C.ramp('#336699', 9)[0]) > C.luminance(C.ramp('#336699', 9)[8]))
T.eq('ramp 非法给空数组', C.ramp('nope'), [])
T.ok('ramp 都是合法 hex', C.ramp('#336699', 5).every((h) => /^#[0-9a-f]{6}$/.test(h)))

/* ---------- 7. 命名色与 clamp ---------- */
T.eq('nearestName 黑', C.nearestName('#000000'), '黑')
T.eq('nearestName 白', C.nearestName('#ffffff'), '白')
T.eq('nearestName 红', C.nearestName('#ff0000'), '红')
T.eq('nearestName 灰', C.nearestName('#808080'), '灰')
T.eq('nearestName 绿', C.nearestName('#008000'), '绿')
T.eq('nearestName 草绿', C.nearestName('#7fff00'), '草绿')
T.eq('nearestName 蓝', C.nearestName('#0000ff'), '蓝')
T.eq('nearestName 黄', C.nearestName('#ffff00'), '黄')
T.eq('nearestName 品红', C.nearestName('#ff00ff'), '品红')
T.eq('nearestName 非法给空串', C.nearestName('nope'), '')
T.eq('clamp 区间内', C.clamp(5, 0, 10), 5)
T.eq('clamp 下界', C.clamp(-1, 0, 10), 0)
T.eq('clamp 上界', C.clamp(11, 0, 10), 10)

T.done()
