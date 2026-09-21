/**
 * HTTP 报文解析
 * 把从 DevTools、curl -v、抓包工具里复制出来的原始报文拆开
 */

const HEADER_NOTES = {
  host: '目标主机（HTTP/1.1 必需）',
  'user-agent': '客户端标识，服务端常用它做兼容或拦截',
  accept: '能接受的响应类型，内容协商的依据',
  'accept-encoding': '能接受的压缩算法，如 gzip / br',
  'accept-language': '语言偏好，q 值表示权重',
  'content-type': '正文的媒体类型与字符集',
  'content-length': '正文字节数（不含头部）',
  'content-encoding': '正文本体用的压缩算法',
  authorization: '凭证。⚠️ 贴出来分享前一定要删掉',
  cookie: '客户端带的 Cookie，⚠️ 常含会话凭证',
  'set-cookie': '服务端下发的 Cookie，注意 HttpOnly / Secure / SameSite 三个属性',
  referer: '来源页面。⚠️ 会泄露你从哪跳过来的',
  origin: '跨域请求时标明来源域',
  connection: '连接管理，keep-alive 表示复用连接',
  'cache-control': '缓存策略，no-store 表示完全不缓存',
  etag: '资源版本标识，配合 If-None-Match 做协商缓存',
  'last-modified': '资源最后修改时间，配合 If-Modified-Since',
  'if-none-match': '带上上次的 ETag，服务端可回 304',
  location: '重定向目标',
  'x-forwarded-for': '经过代理时记录原始客户端 IP',
  'x-real-ip': 'Nginx 常用它传递真实 IP',
  'x-request-id': '链路追踪 ID，查日志时用它串起来',
  'access-control-allow-origin': 'CORS 允许的来源。为 * 时不能同时带凭证',
  'strict-transport-security': 'HSTS，强制后续用 HTTPS',
  'transfer-encoding': '分块传输，chunked 时没有 Content-Length',
  vary: '缓存键要参考哪些请求头',
  server: '服务端软件与版本。⚠️ 暴露版本信息有风险',
  date: '服务端生成响应的时间',
  'www-authenticate': '要求客户端提供凭证，通常跟 401 一起出现',
}

const STATUS_TEXT = {
  200: '成功', 201: '已创建', 204: '成功但无正文', 206: '部分内容',
  301: '永久重定向', 302: '临时重定向', 304: '内容未修改', 307: '临时重定向（保方法）', 308: '永久重定向（保方法）',
  400: '请求有误', 401: '未认证', 403: '无权限', 404: '不存在', 405: '方法不允许',
  409: '状态冲突', 413: '正文过大', 415: '类型不支持', 422: '字段校验不通过', 429: '触发限流',
  500: '服务端异常', 502: '网关拿到无效响应', 503: '服务不可用', 504: '网关超时',
}

/**
 * @param {string} raw
 * @returns {object}
 */
export function parseHttp(raw) {
  let s = String(raw || '').replace(/\r\n/g, '\n')
  if (!s.trim()) throw new Error('请粘贴原始 HTTP 报文')

  const sepIndex = s.indexOf('\n\n')
  const headPart = sepIndex < 0 ? s : s.slice(0, sepIndex)
  const bodyPart = sepIndex < 0 ? '' : s.slice(sepIndex + 2)

  const headLines = headPart.split('\n').filter((l) => l !== '')
  if (!headLines.length) throw new Error('没找到起始行')

  const first = headLines[0]
  let kind = ''
  let startLine = null

  const reqM = /^([A-Z]+)\s+(\S+)\s*(HTTP\/[\d.]+)?$/.exec(first)
  const resM = /^(HTTP\/[\d.]+)\s+(\d{3})\s*(.*)$/.exec(first)

  if (reqM) {
    kind = 'request'
    const target = reqM[2]
    const qIdx = target.indexOf('?')
    startLine = {
      method: reqM[1],
      target,
      path: qIdx < 0 ? target : target.slice(0, qIdx),
      query: qIdx < 0 ? '' : target.slice(qIdx + 1),
      version: reqM[3] || 'HTTP/1.1（未写明）',
    }
  } else if (resM) {
    kind = 'response'
    const code = Number(resM[2])
    startLine = {
      version: resM[1],
      code,
      reason: resM[3] || '',
      reasonCn: STATUS_TEXT[code] || '',
    }
  } else {
    throw new Error('起始行认不出来。请求应以「GET /path HTTP/1.1」开头，响应应以「HTTP/1.1 200 OK」开头')
  }

  // 头部
  const headers = []
  const seen = {}
  for (let i = 1; i < headLines.length; i++) {
    const line = headLines[i]
    // 折行续行（以空格或制表符开头）
    if (/^[ \t]/.test(line) && headers.length) {
      headers[headers.length - 1].value += ' ' + line.trim()
      continue
    }
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const name = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()
    const note = HEADER_NOTES[name] || ''
    const risky = /authorization|cookie|^x-.*token|referer/i.test(name)
    headers.push({ name, value, note, risky })
    seen[name] = (seen[name] || 0) + 1
  }

  // 正文类型判断
  const ct = (headers.find((h) => h.name === 'content-type') || {}).value || ''
  const body = bodyPart
  let bodyKind = '空'
  let bodyParsed = null
  let bodyFormat = ''
  if (body.trim()) {
    if (/json/i.test(ct) || /^\s*[{[]/.test(body)) {
      bodyKind = 'JSON'
      try {
        bodyParsed = JSON.parse(body)
        bodyFormat = JSON.stringify(bodyParsed, null, 2)
      } catch (e) {
        bodyKind = '看起来是 JSON，但解析失败'
      }
    } else if (/x-www-form-urlencoded/i.test(ct) || /^[\w%+.-]+=[^&]*(&|$)/.test(body.trim())) {
      bodyKind = '表单（form-urlencoded）'
      bodyFormat = body
        .trim()
        .split('&')
        .map((kv) => {
          const i = kv.indexOf('=')
          const k = i < 0 ? kv : kv.slice(0, i)
          const v = i < 0 ? '' : kv.slice(i + 1)
          return decodeURIComponent(k.replace(/\+/g, ' ')) + ' = ' + decodeURIComponent(v.replace(/\+/g, ' '))
        })
        .join('\n')
    } else if (/multipart\/form-data/i.test(ct)) {
      bodyKind = '多部分表单（含文件上传）'
    } else {
      bodyKind = '纯文本或其他'
      bodyFormat = body
    }
  }

  // Cookie 拆解
  const cookies = []
  const cookieHeader = headers.find((h) => h.name === 'cookie')
  if (cookieHeader) {
    cookieHeader.value.split(';').forEach((kv) => {
      const t = kv.trim()
      if (!t) return
      const i = t.indexOf('=')
      cookies.push({ name: i < 0 ? t : t.slice(0, i), value: i < 0 ? '' : t.slice(i + 1) })
    })
  }

  // 安全提醒
  const warnings = []
  headers.filter((h) => h.risky).forEach((h) => {
    warnings.push(h.name + ' 里含敏感信息，分享前记得删掉')
  })
  if (!headers.some((h) => h.name === 'content-length') && !headers.some((h) => h.name === 'transfer-encoding')) {
    warnings.push('既没有 Content-Length 也没有 Transfer-Encoding，接收方无法确定正文边界')
  }
  if (headers.some((h) => h.name === 'content-length') && headers.some((h) => h.name === 'transfer-encoding')) {
    warnings.push('同时出现 Content-Length 与 Transfer-Encoding 可能导致请求走私，服务端应当拒绝')
  }
  const auth = headers.find((h) => h.name === 'authorization')
  const jwtInAuth = auth && /^Bearer\s+[\w-]+\.[\w-]+\.[\w-]*$/i.test(auth.value)
  if (jwtInAuth) warnings.push('Authorization 里是 JWT，可以有效期很长，分享前务必打码')

  return {
    kind,
    kindName: kind === 'request' ? '请求' : '响应',
    startLine,
    headers,
    headerCount: headers.length,
    dupHeaders: Object.keys(seen).filter((k) => seen[k] > 1),
    body,
    bodyKind,
    bodyFormat,
    bodyBytes: utf8Length(body),
    cookies,
    isJwtInAuth: !!jwtInAuth,
    warnings,
    hasBody: !!body.trim(),
  }
}

function utf8Length(s) {
  let n = 0
  for (const ch of String(s)) {
    const c = ch.codePointAt(0)
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4
  }
  return n
}

/** 把报文整理成字段表，方便复制 */
export function toTable(r) {
  const lines = []
  if (r.kind === 'request') {
    lines.push('方法\t' + r.startLine.method)
    lines.push('路径\t' + r.startLine.path)
    if (r.startLine.query) lines.push('查询串\t' + r.startLine.query)
    lines.push('版本\t' + r.startLine.version)
  } else {
    lines.push('版本\t' + r.startLine.version)
    lines.push('状态码\t' + r.startLine.code + ' ' + r.startLine.reason)
    if (r.startLine.reasonCn) lines.push('含义\t' + r.startLine.reasonCn)
  }
  r.headers.forEach((h) => lines.push(h.name + '\t' + h.value))
  return lines.join('\n')
}

export const HTTP_SAMPLE = `POST /api/v2/orders?from=web HTTP/1.1
Host: api.example.com
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
Content-Type: application/json; charset=utf-8
Content-Length: 74
Accept: application/json
Accept-Encoding: gzip, br
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc
X-Request-Id: 8f3c2b1a-4d5e-6f70-8192-a3b4c5d6e7f8
Cookie: session=abc123; theme=dark

{"items":[{"sku":"A-1","qty":2}],"addr":{"city":"北京","zip":"100000"}}`

export const HTTP_RESPONSE_SAMPLE = `HTTP/1.1 302 Found
Date: Sun, 20 Sep 2026 11:22:33 GMT
Server: nginx/1.25.3
Location: https://www.example.com/login
Set-Cookie: session=xyz789; Path=/; HttpOnly; Secure; SameSite=Lax
Content-Length: 0

`
