/**
 * URL 解析与编解码
 */

/** 常见协议说明 */
const SCHEME_DOC = {
  http: '明文 HTTP，默认端口 80',
  https: '加密 HTTP，默认端口 443',
  'ftp:': '文件传输',
  ftp: '文件传输，默认端口 21',
  ws: 'WebSocket，默认端口 80',
  wss: '加密 WebSocket，默认端口 443',
  file: '本地文件',
  data: '内联数据（base64 或文本直接写在 URL 里）',
  mailto: '邮件地址',
  tel: '电话号码',
  ssh: 'SSH 连接',
  git: 'Git 仓库',
  magnet: '磁力链接',
  blob: '浏览器内存对象',
  javascript: '⚠️ 会执行脚本，除非确信来源否则不要打开',
  'data:': '内联数据',
}

const DEFAULT_PORTS = { http: '80', https: '443', ftp: '21', ws: '80', wss: '443', ssh: '22', smtp: '25', telnet: '23' }

/** 拆解 URL。用正则而不是 URL 构造函数，因为 App 端不一定有 */
export function parseUrl(input) {
  const raw = String(input || '').trim()
  if (!raw) return { ok: false, error: '请输入 URL' }

  const RE_URL = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(?:([^:@/?#]*)(?::([^@/?#]*))?@)?([^:/?#]*)(?::(\d+))?([^?#]*)(?:\?([^#]*))?(?:#([\s\S]*))?$/
  // 不带 // 的伪协议（mailto:、tel:、data:、javascript:）
  const RE_PSEUDO = /^([a-zA-Z][a-zA-Z0-9+.-]*):([\s\S]*)$/
  // 白名单：只有这些协议名才按「伪协议」处理。
  // 否则 localhost:3000/x 会被误认成 scheme=localhost，example.com:8080 也一样
  const PSEUDO_SCHEMES = new Set([
    'mailto', 'tel', 'sms', 'data', 'javascript', 'blob', 'magnet', 'geo',
    'callto', 'skype', 'about', 'view-source', 'bitcoin', 'intent', 'market', 'chrome',
  ])

  let m = RE_URL.exec(raw)
  let m2 = null
  let schemeAdded = false
  if (!m) {
    const pseudo = RE_PSEUDO.exec(raw)
    if (pseudo && PSEUDO_SCHEMES.has(pseudo[1].toLowerCase())) {
      m2 = pseudo
    } else if (/^[^\s/?#]+(?::\d+)?([/?#]|$)/.test(raw)) {
      // 没写协议时按 https 补一个，浏览器地址栏也是这么处理的
      m = RE_URL.exec('https://' + raw)
      schemeAdded = !!m
    }
  }

  const safeDecode = (s) => {
    try {
      return decodeURIComponent(s)
    } catch (e) {
      return s
    }
  }

  let out
  if (m) {
    const [, scheme, user, pass, host, port, path, query, hash] = m
    out = {
      scheme,
      schemeAdded,
      username: user || '',
      password: pass || '',
      host,
      port: port || '',
      path: path || '/',
      query: query || '',
      hash: hash || '',
      authority: (user ? user + (pass ? ':' + pass : '') + '@' : '') + host + (port ? ':' + port : ''),
      isPseudo: false,
    }
  } else if (m2) {
    out = {
      scheme: m2[1],
      schemeAdded: false,
      username: '',
      password: '',
      host: '',
      port: '',
      path: m2[2],
      query: '',
      hash: '',
      authority: '',
      isPseudo: true,
    }
  } else {
    return { ok: false, error: '认不出这个 URL。至少要写成 host/path 或 scheme://host/path 的形式' }
  }

  out.schemeLower = out.scheme.toLowerCase()
  out.effectivePort = out.port || DEFAULT_PORTS[out.schemeLower] || ''
  out.schemeDoc = SCHEME_DOC[out.schemeLower] || SCHEME_DOC[out.schemeLower + ':'] || '未知协议'
  out.isIpHost = /^\d{1,3}(\.\d{1,3}){3}$/.test(out.host)
  out.hostKind = out.isIpHost ? 'IPv4 地址' : out.host.includes('.') ? '域名' : out.host ? '主机名（可能是内网机器）' : '—'

  // 查询参数：保留顺序与重复键
  out.params = []
  if (out.query) {
    out.query.split('&').forEach((pair) => {
      if (pair === '') return
      const i = pair.indexOf('=')
      const k = i < 0 ? pair : pair.slice(0, i)
      const v = i < 0 ? '' : pair.slice(i + 1)
      out.params.push({ key: safeDecode(k.replace(/\+/g, ' ')), value: safeDecode(v.replace(/\+/g, ' ')), raw: pair })
    })
  }
  out.origin = out.isPseudo ? out.scheme + ':' : out.scheme + '://' + out.authority
  out.ok = true

  // 简单的安全检查
  out.warnings = []
  if (schemeAdded) out.warnings.push('原文本没写协议，已按 https:// 解读')
  if (out.schemeLower === 'javascript') out.warnings.push('这是 javascript: 伪协议，点击会在页面里执行脚本')
  if (out.schemeLower === 'data' && /base64|%3C|<html/i.test(out.path)) out.warnings.push('data: 里内联了内容，可能是钓鱼页')
  if (out.username || out.password) out.warnings.push('URL 里带用户名密码，会出现在日志与 Referer 里，不要这样传凭证')
  if (/\d{1,3}(\.\d{1,3}){3}/.test(out.host) && out.host !== '127.0.0.1') out.warnings.push('直接写 IP 而没有域名，常见于钓鱼链接')
  return out
}

/** 把参数数组拼回查询串 */
export function buildQuery(params) {
  return params
    .filter((p) => p.key !== '')
    .map((p) => encodeURIComponent(p.key) + (p.value === '' ? '' : '=' + encodeURIComponent(p.value)))
    .join('&')
}

/** 由拆解结果拼回完整 URL */
export function rebuildUrl(parts) {
  if (!parts) return ''
  if (parts.isPseudo) return parts.scheme + ':' + parts.path
  const auth = (parts.username ? parts.username + (parts.password ? ':' + parts.password : '') + '@' : '') +
    parts.host + (parts.port ? ':' + parts.port : '')
  const q = parts.params && parts.params.length ? '?' + buildQuery(parts.params) : ''
  return parts.scheme + '://' + auth + (parts.path || '/') + q + (parts.hash ? '#' + parts.hash : '')
}

/** 编码：保留 : / ? # [ ] @ 等结构字符的选项 */
export function encodeUrl(str, keepReserved) {
  const s = String(str)
  return keepReserved ? encodeURI(s) : encodeURIComponent(s)
}

export function decodeUrl(str) {
  const s = String(str)
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '))
  } catch (e) {
    // 逐段容错解码，遇到坏字节就保留原样
    return s.replace(/(%[0-9a-fA-F]{2})+/g, (m) => {
      try {
        return decodeURIComponent(m)
      } catch (e2) {
        return m
      }
    })
  }
}

/** 恶意 URL「无害化」：把可能被自动识别成链接的部分拆开 */
export function defang(str) {
  return String(str)
    .replace(/^http/i, 'hxxp')
    .replace(/^ftp/i, 'fxp')
    .replace(/\./g, '[.]')
    .replace(/:\/\//g, '[:]//')
    .replace(/@/g, '[@]')
}

/** 反向还原 */
export function refang(str) {
  return String(str)
    .replace(/hxxp/gi, 'http')
    .replace(/fxp/gi, 'ftp')
    .replace(/\[\.\]/g, '.')
    .replace(/\[:\]/g, ':')
    .replace(/\[@\]/g, '@')
    .replace(/\[:\/\//g, '://')
}

/** 把绝对 URL 拆成分段表格用 */
export function urlSegments(input) {
  const p = parseUrl(input)
  if (!p.ok) throw new Error(p.error)
  const rows = [
    ['协议', p.scheme, p.schemeDoc],
    ['用户名', p.username || '—', ''],
    ['密码', p.password ? '（有）' : '—', p.password ? 'URL 里不该带密码' : ''],
    ['主机', p.host || '—', p.hostKind],
    ['端口', p.effectivePort || '—', p.port ? '显式指定' : '协议默认'],
    ['路径', p.path || '/', ''],
    ['查询串', p.query || '—', p.params.length ? p.params.length + ' 个参数' : ''],
    ['锚点', p.hash || '—', '只在本页内跳转，不会发给服务器'],
    ['来源', p.origin, ''],
  ]
  return { parsed: p, rows }
}

export const SAMPLE_URL =
  'https://user:pw@api.example.com:8443/v2/items?page=2&size=20&tag=%E5%B7%A5%E5%85%B7&tag=dev#section-3'
