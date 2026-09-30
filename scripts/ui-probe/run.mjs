/**
 * 界面探针入口：
 *   npm run probe:h5              跑全部（要对得上当前源码，先 npm run build:h5）
 *   npm run probe:h5 -- ip url    只跑名字里带这两个的探针
 *   PK_CHROME=/路径/Chrome npm run probe:h5    指定浏览器可执行文件
 *
 * 不进 CI：CI 那台 ubuntu runner 没有 Chrome，也不该为了界面探针再拉一层浏览器。
 * 这些探针验的是「用户看得见的那行字」，本地改完界面顺手跑一次就够。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'
import { startStaticServer } from './server.mjs'
import { runProbe } from './harness.mjs'

const HERE = join(fileURLToPath(import.meta.url), '..')
const ROOT = join(HERE, '..', '..')
const DIST = join(ROOT, 'dist', 'build', 'h5')

function findChrome() {
  if (process.env.PK_CHROME) return process.env.PK_CHROME
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : process.platform === 'win32' ? 'AppData/Local/ms-playwright' : '.cache/ms-playwright')
  let rev = null
  try {
    const bj = JSON.parse(readFileSync(join(ROOT, 'node_modules/playwright-core/browsers.json'), 'utf8'))
    rev = String(bj.browsers.find((b) => b.name === 'chromium').revision)
  } catch {
    /* 读不到就退回扫目录，下面照扫 */
  }
  const inner =
    process.platform === 'win32'
      ? join('chrome-win', 'chrome.exe')
      : process.platform === 'linux'
        ? join('chrome-linux', 'chrome')
        : join(process.arch === 'arm64' ? 'chrome-mac-arm64' : 'chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')
  if (!existsSync(base)) return null
  const dirs = readdirSync(base)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => (a === 'chromium-' + rev ? -1 : b === 'chromium-' + rev ? 1 : Number(b.split('-')[1]) - Number(a.split('-')[1])))
  for (const d of dirs) {
    const p = join(base, d, inner)
    if (existsSync(p)) return p
  }
  return null
}

const argv = process.argv.slice(2)
const only = argv.filter((a) => !a.startsWith('--'))
const exe = (argv.find((a) => a.startsWith('--exe=')) || '').split('=')[1] || findChrome()
if (!exe) {
  console.error('找不到 Chrome for Testing。装一次：npx playwright install chromium\n或者 PK_CHROME=/可执行文件路径 npm run probe:h5')
  process.exit(1)
}
if (!existsSync(join(DIST, 'index.html'))) {
  console.error('没有 H5 构建产物（' + DIST + '/index.html）。先跑 npm run build:h5 再来。')
  process.exit(1)
}

const dir = join(HERE, 'probes')
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.mjs'))
  .filter((f) => !only.length || only.some((o) => f.includes(o)))
if (!files.length) {
  console.error('没有匹配 ' + only.join(',') + ' 的探针。可选：' + readdirSync(dir).filter((f) => f.endsWith('.mjs')).join(' '))
  process.exit(1)
}

const srv = await startStaticServer(DIST)
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] })
console.log('Chrome ' + exe)
console.log('静态服务 ' + srv.base + ' → ' + DIST)
console.log('探针 ' + files.length + ' 个：' + files.join(' '))

let pass = 0
let fail = 0
const failedProbes = []
for (const f of files) {
  const probe = (await import(pathToFileURL(join(dir, f)).href)).default
  console.log('\n=== ' + probe.name + ' ===')
  const r = await runProbe(browser, probe, srv.base)
  pass += r.pass
  fail += r.fail + r.consoleErrors
  if (r.fail || r.consoleErrors) failedProbes.push(f)
}

await browser.close()
await srv.close()
console.log('\n总计：' + pass + ' 通过 / ' + fail + ' 失败')
if (failedProbes.length) console.log('失败探针：' + failedProbes.join(' '))
process.exit(fail ? 1 : 0)
