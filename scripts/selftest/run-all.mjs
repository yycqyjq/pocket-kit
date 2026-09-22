/**
 * 全量自查发现器：自动收集 scripts/selftest 各子目录下的 *.test.mjs 逐套运行。
 * 加新测试 = 丢一个 .test.mjs 进来，不用再改 package.json 的测试链。
 *
 * life/ 下的用例按「源码拷贝为同名 .mjs」的方式运行（项目无 "type":"module"），
 * 这里按用例的 import 清单自动完成拷贝，等价并取代旧的 run.sh 前置步骤。
 * 任何一套失败（含加载失败）都让整体退出码非零；输出带 SKIP 的套件视为放行，
 * 但会在汇总里点名——CI 上 zbarimg / magick 已装，出现 SKIP 就该去查环境。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = path.dirname(fileURLToPath(import.meta.url))
const UTILS = path.resolve(SELF, '..', '..', 'src', 'utils')
const DIRS = [SELF, path.join(SELF, 'dev8'), path.join(SELF, 'life')]

const tests = []
for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue
  for (const f of fs.readdirSync(dir).sort()) {
    if (f.endsWith('.test.mjs')) tests.push(path.join(dir, f))
  }
}

/* life/ 用例按 import 清单把 src/utils/<name>.js 拷成本地 .mjs 副本 */
const lifeDir = path.join(SELF, 'life')
for (const t of tests.filter((p) => path.dirname(p) === lifeDir)) {
  const src = fs.readFileSync(t, 'utf8')
  const re = /from\s+'\.\/([\w-]+)\.mjs'/g
  let m
  while ((m = re.exec(src))) {
    const from = path.join(UTILS, m[1] + '.js')
    const to = path.join(lifeDir, m[1] + '.mjs')
    if (fs.existsSync(from)) fs.copyFileSync(from, to)
  }
}

let failed = 0
const skipped = []
for (const t of tests) {
  const label = path.relative(SELF, t)
  const r = spawnSync(process.execPath, [t], { encoding: 'utf8' })
  const out = (r.stdout || '') + (r.stderr || '')
  const skippedHere = /SKIP/.test(out)
  const ok = r.status === 0
  if (skippedHere) skipped.push(label)
  console.log('==== ' + label + ' ---- ' + (ok ? (skippedHere ? 'PASS（含 SKIP）' : 'PASS') : 'FAIL'))
  if (!ok) {
    failed++
    const tail = out.trim().split('\n').filter((l) => !l.startsWith('data:')).slice(-14)
    console.log(tail.join('\n'))
  }
}
console.log('====')
console.log('套件 ' + tests.length + ' · 失败 ' + failed + (skipped.length ? ' · 含 SKIP ' + skipped.join(', ') : ''))
if (failed) process.exitCode = 1
