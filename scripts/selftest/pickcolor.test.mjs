/**
 * pickcolor.js 纯函数自测（canvas 相关的 createSampler/buildPalette 不在此测，需真机/浏览器）
 */
import { useUtils, makeTest } from './harness.mjs'

const P = await useUtils('pickcolor')
const T = makeTest('pickcolor 纯函数')

/* 常量契约（视图层读它们做上限，改了会互相失配） */
T.eq('MAX_HISTORY', P.MAX_HISTORY, 20)
T.eq('PALETTE_SIZES', P.PALETTE_SIZES, [5, 8])
T.eq('MAGNIFY_ZOOM', P.MAGNIFY_ZOOM, 12)

/* CMYK：与常见换算器一致的手工样例 */
T.eq('cmyk 红', P.rgbToCmyk(255, 0, 0), { c: 0, m: 100, y: 100, k: 0 })
T.eq('cmyk 白', P.rgbToCmyk(255, 255, 255), { c: 0, m: 0, y: 0, k: 0 })
T.eq('cmyk 黑', P.rgbToCmyk(0, 0, 0), { c: 0, m: 0, y: 0, k: 100 })
T.eq('cmyk 128,64,32', P.rgbToCmyk(128, 64, 32), { c: 0, m: 50, y: 75, k: 50 })

/* describeColor：不透明红 */
const red = P.describeColor(255, 0, 0, 255)
T.eq('red hex', red.hex, '#ff0000')
T.eq('red hexUpper', red.hexUpper, '#FF0000')
T.eq('red 无 alpha 时 hex8 为空', red.hex8, '')
T.eq('red rgbaText 不透明为空', red.rgbaText, '')
T.eq('red rgbText', red.rgbText, 'rgb(255, 0, 0)')
T.eq('red cmykText', red.cmykText, 'cmyk(0%, 100%, 100%, 0%)')
T.eq('red 亮度', red.luminance, 0.2126)
T.eq('red 是深色底', red.isDark, true)
T.ok('red 有近名', typeof red.name === 'string' && red.name.length > 0)

/* describeColor：半透明 */
const half = P.describeColor(255, 0, 0, 128)
T.eq('half hex8', half.hex8, 'ff000080')
T.eq('half cssHex', half.cssHex, '#ff000080')
T.eq('half rgbaText', half.rgbaText, 'rgba(255, 0, 0, 0.50)')
T.eq('half alpha', half.alpha, 0.502)

/* 色距 */
T.eq('色距 同色为 0', P.colorDistance({ r: 10, g: 200, b: 30 }, { r: 10, g: 200, b: 30 }), 0)
T.eq('色距 黑白 ≈ 442', Math.round(P.colorDistance({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })), 442)

/* 色板可用性建议（WCAG 结论文案） */
const adv = P.paletteAdvice([{ hex: '#ffffff' }, { hex: '#333333' }, { hex: '#888888' }])
T.eq('白底建议配深墨字（设计系统不用纯黑）', adv[0].text, '#1D2521')
T.ok('白底黑字是 AAA', adv[0].level.indexOf('AAA') >= 0)
T.eq('#333 底黑字 AAA', adv[1].level, 'AAA 随便用')
T.eq('#888 底深墨字 4.43 仅大字', adv[2].level, '仅大字/图标')

/* 导出文本 */
const row = { hex: '#aabbcc', rgbText: 'rgb(170, 187, 204)', shareText: '12.3%', name: '雾蓝' }
T.ok('paletteToText 含大写 HEX', P.paletteToText([row]).indexOf('#AABBCC') >= 0)
T.ok('paletteToText 含占比与近名', P.paletteToText([row]).indexOf('占比 12.3%') >= 0 && P.paletteToText([row]).indexOf('近名「雾蓝」') >= 0)
const pick = P.describeColor(255, 0, 0, 255)
pick.x = 3
pick.y = 4
const ct = P.colorToText(pick)
T.ok('colorToText 含坐标与 HEX', ct.indexOf('坐标 3, 4') >= 0 && ct.indexOf('HEX   #FF0000') >= 0)

T.done()
