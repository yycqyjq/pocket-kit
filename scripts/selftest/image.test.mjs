/**
 * image.js 自查（直接测 src/utils/image.js 本体）
 * ------------------------------------------------------------
 * 判据分三类：
 *   1) formatBytes：字节 → 人类可读。进位按 1024；小数位由数值档位决定
 *      （v>=100 取 0 位、v>=10 取 1 位、其余 2 位），这套档位规则手算即可对；
 *      空值/非数字（null/undefined/NaN/'abc'）→ '—'；0 与负数走 <1024 分支
 *      原样带 'B'；单位到 GB 封顶（再大也只显示 GB）。
 *   2) reduceRatio：宽高约简。最简比用 gcd 手算；约简后任一边 >40 时退回
 *      小数比 "x:1"（(w/h).toFixed(3) 再去尾零）；任一边为 0/空 → '—'。
 *   3) chooseImage：给 uni.chooseImage 打桩，验 name/size/type 的推导与
 *      reject 契约（无 path 报中文错、fail 原样透传、size 为 0 要保留而非当空）。
 * 不在覆盖内（需要真实 DOM / 浏览器，本项目跑不到）：
 *   loadImage、hasAlpha、drawScaled、canvasToBlob、blobToDataURL、
 *   saveCanvasImage（H5 / APP-PLUS / MP 三个条件编译分支）。
 */
import { useUtils, makeTest } from './harness.mjs'

const calls = []
let chooseHandler = null
globalThis.uni = {
  chooseImage: (o) => {
    calls.push(['choose', o && o.count])
    if (chooseHandler) return chooseHandler(o)
  },
}

const I = await useUtils('image')
const T = makeTest('image')

/* ---------- 1. formatBytes ---------- */
T.eq('formatBytes(null) → —', I.formatBytes(null), '—')
T.eq('formatBytes(undefined) → —', I.formatBytes(undefined), '—')
T.eq('formatBytes(NaN) → —', I.formatBytes(NaN), '—')
T.eq("formatBytes('abc') → —", I.formatBytes('abc'), '—')
T.eq('formatBytes(0) → 0 B', I.formatBytes(0), '0 B')
T.eq('formatBytes(1) → 1 B', I.formatBytes(1), '1 B')
T.eq('formatBytes(1023) → 1023 B', I.formatBytes(1023), '1023 B')
T.eq('formatBytes(1024) → 1.00 KB（未满 10，2 位小数）', I.formatBytes(1024), '1.00 KB')
T.eq('formatBytes(1100) → 1.07 KB（四舍五入 2 位）', I.formatBytes(1100), '1.07 KB')
T.eq('formatBytes(10240) → 10.0 KB（满 10，1 位小数）', I.formatBytes(10240), '10.0 KB')
T.eq('formatBytes(101376=99KB) → 99.0 KB', I.formatBytes(101376), '99.0 KB')
T.eq('formatBytes(102400=100KB) → 100 KB（满 100，0 位小数）', I.formatBytes(102400), '100 KB')
T.eq('formatBytes(1048576) → 1.00 MB', I.formatBytes(1048576), '1.00 MB')
T.eq('formatBytes(153600) → 150 KB', I.formatBytes(153600), '150 KB')
T.eq('formatBytes(1073741824) → 1.00 GB', I.formatBytes(1073741824), '1.00 GB')
T.eq('formatBytes(1TB) → 1024 GB（单位封顶在 GB）', I.formatBytes(1099511627776), '1024 GB')
T.eq('formatBytes(-5) → -5 B（负数走 <1024 分支）', I.formatBytes(-5), '-5 B')
T.eq("formatBytes('1024') → 1.00 KB（可转数）", I.formatBytes('1024'), '1.00 KB')

/* ---------- 2. reduceRatio ---------- */
T.eq('reduceRatio(1920,1080) → 16:9', I.reduceRatio(1920, 1080), '16:9')
T.eq('reduceRatio(1080,1920) → 9:16（方向不可丢）', I.reduceRatio(1080, 1920), '9:16')
T.eq('reduceRatio(100,100) → 1:1', I.reduceRatio(100, 100), '1:1')
T.eq('reduceRatio(7,7) → 1:1', I.reduceRatio(7, 7), '1:1')
T.eq('reduceRatio(300,200) → 3:2', I.reduceRatio(300, 200), '3:2')
T.eq('reduceRatio(4000,3000) → 4:3', I.reduceRatio(4000, 3000), '4:3')
T.eq('reduceRatio(2,4) → 1:2', I.reduceRatio(2, 4), '1:2')
T.eq('reduceRatio(1,3) → 1:3', I.reduceRatio(1, 3), '1:3')
T.eq('reduceRatio(40,1) → 40:1（恰在整数比上限）', I.reduceRatio(40, 1), '40:1')
T.eq('reduceRatio(41,1) → 41:1（>40 走小数分支，去尾零）', I.reduceRatio(41, 1), '41:1')
T.eq('reduceRatio(41,2) → 20.5:1（小数分支）', I.reduceRatio(41, 2), '20.5:1')
T.eq('reduceRatio(100,3) → 33.333:1（保留 3 位）', I.reduceRatio(100, 3), '33.333:1')
T.eq('reduceRatio(0,100) → —', I.reduceRatio(0, 100), '—')
T.eq('reduceRatio(100,0) → —', I.reduceRatio(100, 0), '—')
T.eq('reduceRatio(0,0) → —', I.reduceRatio(0, 0), '—')
T.eq('reduceRatio(null,100) → —', I.reduceRatio(null, 100), '—')

/* ---------- 3. chooseImage（uni 打桩） ---------- */
// 完整 tempFile：name/size/type 全部来自 file
chooseHandler = (o) => {
  const file = { name: 'photo.png', size: 2048, type: 'image/png' }
  o.success({ tempFilePaths: ['/tmp/a/photo.png'], tempFiles: [file] })
}
{
  const r = await I.chooseImage()
  T.eq('chooseImage 透传 path', r.path, '/tmp/a/photo.png')
  T.eq('chooseImage 透传 file 引用', r.file && r.file.size, 2048)
  T.eq('chooseImage 取 file.name', r.name, 'photo.png')
  T.eq('chooseImage 取 file.size', r.size, 2048)
  T.eq('chooseImage 取 file.type', r.type, 'image/png')
}
T.eq('chooseImage 桩收到 count=1', calls[calls.length - 1][1], 1)

// 只有 path：name 从文件名推、type 从扩展名推、size 为 null
chooseHandler = (o) => o.success({ tempFilePaths: ['/tmp/x/abc.jpg'] })
{
  const r = await I.chooseImage()
  T.eq('无 tempFiles 时 name 取文件名', r.name, 'abc.jpg')
  T.eq('无 tempFiles 时 size 为 null', r.size, null)
  T.eq('无 tempFiles 时 type 由 .jpg 推', r.type, 'image/jpeg')
}

// 扩展名大小写归一
chooseHandler = (o) => o.success({ tempFilePaths: ['/tmp/x/A.WEBP'] })
T.eq('大写扩展名归一为 webp', (await I.chooseImage()).type, 'image/webp')

// 无扩展名：name 回落 'image'、type 为空串
chooseHandler = (o) => o.success({ tempFilePaths: ['/tmp/foo'] })
{
  const r = await I.chooseImage()
  T.eq('无扩展名 name 回落 image', r.name, 'image')
  T.eq('无扩展名 type 为空串', r.type, '')
}

// size 为 0 是合法数字，必须保留而不是当空
chooseHandler = (o) => o.success({ tempFilePaths: ['/a/b/c.png'], tempFiles: [{ size: 0 }] })
T.eq('size=0 保留为 0（不当空）', (await I.chooseImage()).size, 0)

// file.type 缺失时回落扩展名
chooseHandler = (o) => o.success({ tempFilePaths: ['/a/b/c.gif'], tempFiles: [{ size: 5 }] })
T.eq('file.type 缺失回落 .gif', (await I.chooseImage()).type, 'image/gif')

// 没选中 path → reject 中文错误
chooseHandler = (o) => o.success({ tempFilePaths: [] })
{
  let err = null
  try { await I.chooseImage() } catch (e) { err = e }
  T.ok('无 path 必须 reject', !!err, '实际未抛')
  T.ok('无 path 报错为中文', !!err && /[\u4e00-\u9fa5]/.test(err.message), err && err.message)
}

// fail 回调原样透传错误
chooseHandler = (o) => o.fail(new Error('用户取消'))
{
  let err = null
  try { await I.chooseImage() } catch (e) { err = e }
  T.eq('fail 原样透传', err && err.message, '用户取消')
}

T.done()
