/**
 * README 截图批量生成：对 dist/build/h5 的真实渲染逐页截图。
 * 前置：npm run build:h5，然后 python3 -m http.server 4173 --directory dist/build/h5
 * 用法：node scripts/screenshot.mjs
 * 说明：SPA 的 hash 跳转不会重新挂载页面，每次导航前先回 about:blank 强制整页重载；
 *       深色截图通过应用自己的 uni.setStorageSync 写 pk.theme 再整页重载。
 */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const exe = process.argv[2] ||
  process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const BASE = 'http://127.0.0.1:4173'
const OUT = path.resolve('docs/screenshots')
fs.mkdirSync(OUT, { recursive: true })

const SHOTS = [
  ['01-首页', { hash: '/pages/index/index' }, 'light'],
  ['37-搞机页签', { hash: '/pages/index/index', tap: '搞机' }, 'light'],
  ['18-AES加解密', { hash: '/pages/tool/tool?id=aes' }, 'light'],
  ['19-UA解析', { hash: '/pages/tool/tool?id=useragent' }, 'light'],
  ['20-语义化版本', { hash: '/pages/tool/tool?id=semver' }, 'light'],
  ['21-字母表编码', { hash: '/pages/tool/tool?id=bases' }, 'light'],
  ['22-统计工坊', { hash: '/pages/tool/tool?id=stats' }, 'light'],
  ['23-数论工具箱', { hash: '/pages/tool/tool?id=numtheory' }, 'light'],
  ['24-农历历书', { hash: '/pages/tool/tool?id=chincal' }, 'light'],
  ['25-账单分摊', { hash: '/pages/tool/tool?id=splitbill' }, 'light'],
  ['26-个税速算', { hash: '/pages/tool/tool?id=taxcn' }, 'light'],
  ['27-CRC校验和', { hash: '/pages/tool/tool?id=checksum' }, 'light'],
  ['28-X509证书', { hash: '/pages/tool/tool?id=x509' }, 'light'],
  ['29-位运算', { hash: '/pages/tool/tool?id=bitwise' }, 'light'],
  ['30-Markdown互转', { hash: '/pages/tool/tool?id=markdown' }, 'light'],
  ['31-EXIF元数据', { hash: '/pages/tool/tool?id=exif' }, 'light'],
  ['32-图片取色', { hash: '/pages/tool/tool?id=pickcolor' }, 'light'],
  ['33-尺码换算', { hash: '/pages/tool/tool?id=bodysize' }, 'light'],
  ['34-二维码', { hash: '/pages/tool/tool?id=qrcode' }, 'light'],
  ['35-世界时钟', { hash: '/pages/tool/tool?id=worldclock' }, 'light'],
  ['36-设备信息', { hash: '/pages/tool/tool?id=device' }, 'light'],
  ['38-条形码', { hash: '/pages/tool/tool?id=barcode' }, 'light'],
  ['39-定位与坐标', { hash: '/pages/tool/tool?id=geo' }, 'light'],
  ['40-传感器实验室', { hash: '/pages/tool/tool?id=sensor' }, 'light'],
  ['41-硬件测试', { hash: '/pages/tool/tool?id=hardware' }, 'light'],
  ['42-屏幕测试', { hash: '/pages/tool/tool?id=screen' }, 'light'],
  ['43-快捷唤起', { hash: '/pages/tool/tool?id=shortcut' }, 'light'],
  ['37-搞机页签-深色', { hash: '/pages/index/index', tap: '搞机', dark: true }, 'dark'],
]

const browser = await chromium.launch({ executablePath: exe, headless: true })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 160)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })

let ok = 0
for (const [name, route, theme] of SHOTS) {
  try {
    await page.goto('about:blank')
    if (theme === 'dark') {
      await page.goto(BASE + '/#/', { waitUntil: 'load' })
      await page.waitForTimeout(600)
      await page.mouse.click(351, 815) // 第 5 个 tab：设置
      await page.waitForTimeout(600)
      await page.locator('uni-switch').first().click() // 深色模式开关
      await page.waitForTimeout(600)
      await page.goto('about:blank')
    }
    await page.goto(BASE + '/#' + route.hash, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    if (route.tap === '搞机') {
      await page.mouse.click(117, 815) // 第 2 个 tab：搞机
      await page.waitForTimeout(1000)
    }
    await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true })
    ok++
    console.log('OK ' + name)
    if (theme === 'dark') {
      await page.goto('about:blank')
      await page.goto(BASE + '/#/', { waitUntil: 'load' })
      await page.waitForTimeout(600)
      await page.mouse.click(351, 815)
      await page.waitForTimeout(600)
      await page.locator('uni-switch').first().click()
    }
  } catch (e) {
    console.log('FAIL ' + name + ' :: ' + String(e).slice(0, 140))
  }
}
await browser.close()
console.log('----')
console.log('完成 ' + ok + '/' + SHOTS.length)
if (errors.length) console.log('运行时错误 ' + errors.length + ' 条（前 3 条）：\n' + errors.slice(0, 3).join('\n'))
else console.log('运行时错误 0 条')
if (ok < SHOTS.length) process.exitCode = 1
