/**
 * 图片处理公共能力（纯前端 / Canvas）
 * ------------------------------------------------------------
 * 面向 H5 与 App（plus webview）—— 两者都有 DOM 的 Image / canvas。
 * 小程序端没有这套 DOM API，相关工具在小程序里会走降级提示。
 * 全程本地计算，不联网、不上传。
 */

/** 字节数 → 人类可读 */
export function formatBytes(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  if (n < 1024) return n + ' B'
  const units = ['KB', 'MB', 'GB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2) + ' ' + units[i]
}

function gcd(a, b) {
  return b ? gcd(b, a % b) : a
}

/** 宽高约简成最简整数比，比例过歪时退回小数 */
export function reduceRatio(w, h) {
  if (!w || !h) return '—'
  const g = gcd(w, h)
  const rw = w / g
  const rh = h / g
  if (rw <= 40 && rh <= 40) return rw + ':' + rh
  return (w / h).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + ':1'
}

/** 拉起选图，返回 { path, file, name, size, type } */
export function chooseImage() {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count: 1,
      sizeType: ['original'],
      success(res) {
        const path = res.tempFilePaths && res.tempFilePaths[0]
        const file = res.tempFiles && res.tempFiles[0]
        if (!path) return reject(new Error('没选中图片'))
        resolve({
          path,
          file,
          name: (file && file.name) || guessName(path),
          size: file && typeof file.size === 'number' ? file.size : null,
          type: (file && file.type) || mimeFromPath(path),
        })
      },
      fail(err) {
        reject(err)
      },
    })
  })
}

function guessName(path) {
  const m = String(path).split('/').pop()
  return m && m.indexOf('.') > -1 ? m : 'image'
}

function mimeFromPath(path) {
  const ext = String(path).split('.').pop().toLowerCase()
  return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' }[ext] || ''
}

/** 把 path / blobURL 载入成 HTMLImageElement */
export function loadImage(path) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败，可能格式不支持'))
    img.src = path
  })
}

/** 采样判断是否含透明像素 */
export function hasAlpha(img) {
  const c = document.createElement('canvas')
  const w = Math.min(img.naturalWidth || img.width, 200)
  const h = Math.min(img.naturalHeight || img.height, 200)
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true
  }
  return false
}

/** 按比例缩到不超过 maxW×maxH（0/空 表示不限制），返回 canvas。
 *  opaque=true 时铺白底（给 JPEG 这类无透明通道格式用），否则保留透明。 */
export function drawScaled(img, maxW, maxH, opaque) {
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  let w = iw
  let h = ih
  if (maxW && w > maxW) {
    h = Math.round((h * maxW) / w)
    w = maxW
  }
  if (maxH && h > maxH) {
    w = Math.round((w * maxH) / h)
    h = maxH
  }
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (opaque) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
  }
  ctx.drawImage(img, 0, 0, w, h)
  return c
}

/** canvas → Blob */
export function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('导出失败，格式可能不被支持'))),
      mime || 'image/png',
      quality
    )
  })
}

/** Blob → dataURL */
export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(new Error('读取失败'))
    r.readAsDataURL(blob)
  })
}

/** 保存 / 下载一张由 canvas 导出的图片 */
export async function saveCanvasImage(canvas, filename, mime, quality) {
  // #ifdef H5
  const blob = await canvasToBlob(canvas, mime, quality)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'image'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return
  // #endif

  // #ifdef APP-PLUS
  const dataUrl = canvas.toDataURL(mime || 'image/png', quality)
  const base64 = dataUrl.split(',')[1]
  const path = `_doc/${filename || 'image.png'}`
  await new Promise((resolve, reject) => {
    plus.io.resolveLocalFileSystemURL(
      '_doc/',
      (dir) => {
        dir.getFile(
          filename || 'image.png',
          { create: true },
          (entry) => {
            entry.file((f) => {
              const writer = new plus.io.FileWriter()
              writer.onwrite = () => resolve()
              writer.onerror = reject
              writer.write(Array.from(atob(base64)).map((ch) => ch.charCodeAt(0)))
            })
          }
        )
      },
      reject
    )
  })
  await new Promise((resolve, reject) => {
    uni.saveImageToPhotosAlbum({ filePath: path, success: resolve, fail: reject })
  })
  return
  // #endif

  // #ifdef MP
  throw new Error('小程序端暂不支持保存，可长按预览图保存')
  // #endif
}
