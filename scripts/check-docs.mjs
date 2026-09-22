/**
 * 文档对撞：README 工具表 ↔ 注册表 ↔ manifest 三方核对，防「件数漂移」复发。
 * 任何一项不一致都让退出码非零——CI 与本地 npm run check:docs 共用。
 */
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

const shots = [...readme.matchAll(/docs\/screenshots\/([^)\s]+)/g)].map((m) => m[1])
const missingShots = shots.filter((s) => !fs.existsSync('docs/screenshots/' + s))

const diffs = (a, b) => a.filter((x) => !b.includes(x)).concat(b.filter((x) => !a.includes(x)))
const checks = [
  ['registry id 唯一', new Set(ids).size === ids.length],
  ['id ↔ COMPONENTS 一致', cmKeys.length === ids.length && ids.every((i) => cmKeys.includes(i)) && cmKeys.every((k) => ids.includes(k))],
  ['imports ↔ 组件文件一致', files.length === imports.length && imports.every((i) => files.includes(i)) && diffs(files, imports).length === 0],
  ['组件文件全部接线', diffs(files, imports).length === 0],
  ['README 工具表行数 = 注册数', rows.length === names.length],
  ['README 与 registry 名称一致', diffs(names, rows).length === 0],
  ['manifest 件数一致', mCount === names.length],
  ['README 引用的截图都存在', missingShots.length === 0],
]
let bad = 0
for (const [name, ok] of checks) {
  console.log((ok ? '✓ ' : '✗ ') + name)
  if (!ok) bad++
}
if (names.length !== rows.length) console.log('  差集 registry:', names.filter((n) => !rows.includes(n)), '| README:', rows.filter((n) => !names.includes(n)))
if (missingShots.length) console.log('  缺失截图:', missingShots)
if (mCount !== names.length) console.log('  manifest 写的是 ' + mCount + '，实际 ' + names.length)
process.exitCode = bad ? 1 : 0
