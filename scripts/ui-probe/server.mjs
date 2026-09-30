/**
 * 探针用的静态服务器：把 dist/build/h5 起在 127.0.0.1 的一个随机端口上。
 * 之所以自己写而不用 `python3 -m http.server`：探针要能一条命令跑起来，
 * 不该依赖机器上有没有 python，也不该让人先去另开一个终端窗口。
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
}

/** dir 必须真是目录，路径拼完不许跑出 dir（探针只读自己的构建产物，但这是文件服务，照样按边界收） */
function safeJoin(root, urlPath) {
  const p = normalize(join(root, decodeURIComponent(urlPath.split('?')[0].split('#')[0])))
  if (p !== root && !p.startsWith(root + sep)) return null
  return p
}

export async function startStaticServer(root, { port = 0 } = {}) {
  const server = createServer(async (req, res) => {
    const raw = req.url || '/'
    const path = raw.split('?')[0]
    const target = path === '/' || path === '' ? join(root, 'index.html') : safeJoin(root, path)
    if (!target) {
      res.writeHead(400).end('bad path')
      return
    }
    try {
      const buf = await readFile(target)
      res.writeHead(200, { 'content-type': MIME[extname(target).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' }).end(buf)
    } catch (e) {
      // H5 走 hash 路由，带扩展名的资源不会走到这儿；无扩展名的路径兜回 index.html
      if (extname(target)) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found: ' + path)
        return
      }
      try {
        const buf = await readFile(join(root, 'index.html'))
        res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' }).end(buf)
      } catch {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('构建产物读不到：' + e.message)
      }
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  const { port: actual } = server.address()
  return {
    base: 'http://127.0.0.1:' + actual,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}
