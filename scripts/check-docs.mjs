/**
 * 文档对撞：README 工具表 ↔ 注册表 ↔ manifest 三方核对，防「件数漂移」复发；
 * 顺带查全仓库零引用的导出（lint 看不见的那一类），以及每个 util 模块有没有被自查用例直接装载。
 * 任何一项不一致都让退出码非零——CI 与本地 npm run check:docs 共用。
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'

const reg = fs.readFileSync('src/tools/registry.js', 'utf8')
const catNames = new Set([...reg.matchAll(/key:\s*'(\w+)',\s*name:\s*'([^']+)'/g)].map((m) => m[2]))
const ids = [...reg.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1])
const names = [...reg.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1]).filter((n) => !catNames.has(n))
const imports = [...reg.matchAll(/from\s+'\.\/components\/([\w-]+)\.vue'/g)].map((m) => m[1])
const files = fs.readdirSync('src/tools/components').filter((f) => f.endsWith('.vue')).map((f) => f.replace(/\.vue$/, ''))
const cm = reg.split('COMPONENTS')[2] || ''
const cmKeys = [...cm.matchAll(/^\s+(\w+):/gm)].map((m) => m[1])

const readme = fs.readFileSync('README.md', 'utf8')
const rows = [...readme.matchAll(/^\|\s*[^|]+\|\s*\*\*([^*]+)\*\*\s*\|/gm)].map((m) => m[1])
const manifest = fs.readFileSync('src/manifest.json', 'utf8')
const mCount = Number((manifest.match(/共 (\d+) 件小工具/) || [])[1])

// 这批图住在 .agent/，而 .agent 整个目录不入库——在 clone 出来的仓库里它们根本不存在。
// 缺目录就跳过并说明原因，别把「这里没有文件」报成「README 的图丢了」。
const SHOT_DIR = '.agent/docs/screenshots'
const shots = [...readme.matchAll(/!\[[^\]]*\]\(\.agent\/docs\/screenshots\/([^)\s]+)\)/g)].map((m) => m[1])
const shotSkip = !fs.existsSync(SHOT_DIR)
const missingShots = shotSkip ? [] : shots.filter((s) => !fs.existsSync(SHOT_DIR + '/' + s))

const diffs = (a, b) => a.filter((x) => !b.includes(x)).concat(b.filter((x) => !a.includes(x)))

/* 死导出对撞：导出了、但全仓库（含 .vue 模板与自查用例）没人引用的名字。
   lint 的 no-unused-vars 只管「本文件内没用到」，看不见「整个仓库没人 import」这一类。
   2026-09-30 清了第一轮，33 处：29 处删掉（多是界面里已另写一遍的说明常量与从没调用
   过的辅助函数）、2 处接回界面（理想体重、古典密码样例）、1 处让农历模块改用它（每月天数）、
   1 处是框架入口进白名单；连带变成孤儿的 OUTLEN、buildQuery、pk.drafts 一并清掉。
   其中 centsToYuan 是本地被 life/ 下的源码副本掩护住、CI 的干净 clone 才补挖出来的。
   钉成门禁，免得下一个人重新数一遍。 */
const ENTRY_EXPORTS = ['src/main.js::createApp']

/* 数的是「仓库里的文件」，不是「硬盘上碰巧有的文件」：用 git ls-files 取清单。
   scripts/selftest/life/*.mjs 是 run-all 每次从 src/utils 拷出来的副本，不入库，
   本地留着上一次的旧副本——把它们算进来，副本里的定义会被当成引用，CI 的干净
   clone 里就露馅（首轮 CI 就是这么在 splitbill.js 里补挖出一个 centsToYuan）。
   另外把自己也排除掉：这段说明里写了被清掉的名字，按整词数出现次数时会被当成
   引用，等于文档一句话就把门禁在那名字上关了。取不到 git 清单时退回按目录走。 */
const SELF = 'scripts/check-docs.mjs'

function trackedCode() {
  try {
    return execSync('git ls-files -z -- src scripts', { encoding: 'utf8' })
      .split('\0')
      .filter((f) => /\.(js|mjs|vue)$/.test(f))
  } catch (e) {
    return null
  }
}

function walkCode(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue
    const p = dir + '/' + e.name
    if (e.isDirectory()) walkCode(p, out)
    else if (/\.(js|mjs|vue)$/.test(e.name)) out.push(p)
  }
  return out
}

const codeFiles = (trackedCode() || ['src', 'scripts'].flatMap((d) => walkCode(d)))
  .filter((f) => f !== SELF)
const codeText = codeFiles.map((f) => fs.readFileSync(f, 'utf8'))
const hits = (text, name) =>
  (text.match(new RegExp('\\b' + name.replace(/\$/g, '\\$') + '\\b', 'g')) || []).length
const deadExports = []
codeFiles.forEach((f, i) => {
  const decls = [...codeText[i].matchAll(
    /^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([\w$]+)/gm)]
    .map((m) => m[1])
  for (const n of decls) {
    if (ENTRY_EXPORTS.includes(f + '::' + n)) continue
    const elsewhere = codeText.reduce((a, t, j) => (j === i ? a : a + hits(t, n)), 0)
    if (elsewhere === 0 && hits(codeText[i], n) <= 1) deadExports.push(f + ' :: ' + n)
  }
})

/* 自查覆盖：每个 src/utils 模块都得被某个 *.test.mjs 直接装载（useUtils('x') 或
   from './x.mjs'）。整词命中不算覆盖——注释里提一句模块名太容易，那会把没测的说成测过。
   豁免只给「不跑在 uni.* / DOM 上就没法验」的平台边界模块；两张清单都写死在这里：
   新增模块必须带用例，付了账必须从欠账清单里划掉，欠账清单里不许出现已不存在的模块。
   2026-09-30 立这条时实测：模块 78 个，直接装载 31 个，平台豁免 5 个，欠账 42 个。 */
const PLATFORM_UNTESTED = ['clipboard', 'image', 'storage', 'sys', 'theme']
const UNTESTED = [
  'braille', 'classic', 'cleanescape', 'codefmt', 'color', 'cron', 'dataconv', 'date',
  'datefmt', 'devref', 'diff', 'entity', 'expr', 'extract', 'garbled', 'hash', 'health',
  'hexdump', 'httpdump', 'ip', 'ipv6', 'json2ts', 'jwt', 'lorem', 'naming', 'normalize',
  'percent', 'perm', 'punycode', 'qp', 'radix', 'random', 'regexlib', 'sqlfmt', 'table',
  'text', 'unicode', 'unit', 'url', 'uuidinfo', 'validate', 'wordfreq',
]

const utilNames = codeFiles
  .filter((f) => f.startsWith('src/utils/') && f.endsWith('.js'))
  .map((f) => f.slice('src/utils/'.length, -3))
const loaded = new Set()
for (const f of codeFiles.filter((x) => x.endsWith('.test.mjs'))) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/useUtils\(\s*'([\w-]+)'\s*\)|from '\.\/([\w-]+)\.mjs'/g)) {
    const n = m[1] || m[2]
    if (n !== 'harness') loaded.add(n)
  }
}
const noSuite = utilNames.filter((u) => !loaded.has(u))
const undeclared = noSuite.filter((u) => !UNTESTED.includes(u) && !PLATFORM_UNTESTED.includes(u))
const paidOff = UNTESTED.filter((u) => loaded.has(u)).concat(PLATFORM_UNTESTED.filter((u) => loaded.has(u)))
const ghost = UNTESTED.concat(PLATFORM_UNTESTED).filter((u) => !utilNames.includes(u))
const covered = utilNames.length - noSuite.length

const checks = [
  ['registry id 唯一', new Set(ids).size === ids.length],
  ['id ↔ COMPONENTS 一致', cmKeys.length === ids.length && ids.every((i) => cmKeys.includes(i)) && cmKeys.every((k) => ids.includes(k))],
  ['imports ↔ 组件文件一致', files.length === imports.length && imports.every((i) => files.includes(i)) && diffs(files, imports).length === 0],
  ['组件文件全部接线', diffs(files, imports).length === 0],
  ['README 工具表行数 = 注册数', rows.length === names.length],
  ['README 与 registry 名称一致', diffs(names, rows).length === 0],
  ['manifest 件数一致', mCount === names.length],
  ['README 引用的截图都存在' + (shotSkip ? '（.agent 不入库，跳过 ' + shots.length + ' 张）' : ''), missingShots.length === 0],
  ['没有零引用的导出', deadExports.length === 0],
]
checks.push([
  '模块都有直接自查（' + utilNames.length + ' 个模块：已装载 ' + covered + ' · 欠账 ' + UNTESTED.length + ' · 平台豁免 ' + PLATFORM_UNTESTED.length + '）',
  undeclared.length === 0 && paidOff.length === 0 && ghost.length === 0,
])

let bad = 0
for (const [name, ok] of checks) {
  console.log((ok ? '✓ ' : '✗ ') + name)
  if (!ok) bad++
}
if (names.length !== rows.length) console.log('  差集 registry:', names.filter((n) => !rows.includes(n)), '| README:', rows.filter((n) => !names.includes(n)))
if (missingShots.length) console.log('  缺失截图:', missingShots)
if (mCount !== names.length) console.log('  manifest 写的是 ' + mCount + '，实际 ' + names.length)
if (deadExports.length) console.log('  零引用导出（删掉，或像界面上真有需求那样接回去）:', deadExports)
if (undeclared.length) console.log('  新增模块没带自查用例:', undeclared)
if (paidOff.length) console.log('  已有用例、还挂在清单上（划掉）:', paidOff)
if (ghost.length) console.log('  清单里有 src/utils 下不存在的模块:', ghost)
process.exitCode = bad ? 1 : 0
