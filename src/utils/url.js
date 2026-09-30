/**
 * URL 解析与编解码
 */
import { parseIpv4, specialForIp } from './ip'
import { expandIpv6, classifyIpv6 } from './ipv6'

/** 常见协议说明 */
const SCHEME_DOC = {
  http: '明文 HTTP，默认端口 80',
  https: '加密 HTTP，默认端口 443',
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
  javascript: '会执行脚本，除非确信来源否则不要打开',
}

const DEFAULT_PORTS = { http: '80', https: '443', ftp: '21', ws: '80', wss: '443', ssh: '22', smtp: '25', telnet: '23' }

/** 这些协议按规范会把空路径当成「/」，其余协议没写就是没写 */
const PATH_DEFAULTED = new Set(['http', 'https', 'ftp', 'ws', 'wss', 'file'])

const IPV4_SHAPE = /^\d{1,3}(\.\d{1,3}){3}$/
/** 纯数字（含 0x 写法）拼出来的主机：浏览器会把它按 IPv4 简写换算成另一个地址 */
const NUMERIC_HOST = /^(0x[0-9a-fA-F]+|\d+)(\.(0x[0-9a-fA-F]+|\d+))*$/

/** 空白与控制字符（NUL 是老牌绕过手法：google.com\0.evil.com）。
 *  这里不用字符类正则写 \x00-\x1f，lint 的 no-control-regex 会拦，按码位判。 */
function hasBlankOrControl(s) {
  if (/\s/.test(s)) return true
  return Array.from(s).some((c) => c.codePointAt(0) < 0x20 || c.codePointAt(0) === 0x7f)
}

/** 主机位判据只有一份：方括号里问 ipv6.js，裸四段问 ip.js，这里不抄第二份。
 *  返回 { bad } 表示这个主机根本拆不出来；返回 kind/isIp 给表格和提醒用。 */
function hostInfo(h, shown) {
  const named = shown === undefined ? h : shown
  if (hasBlankOrControl(h)) {
    return { bad: '主机位里有空格或控制字符（「' + named + '」），主机是从 :// 之后到第一个 / ? # 之前的那一截' }
  }
  if (h[0] === '[') {
    if (h[h.length - 1] !== ']') return { bad: 'IPv6 主机要用方括号包住整段，像 [::1]:8080，你写了「' + named + '」' }
    const inner = h.slice(1, -1)
    try {
      const r = expandIpv6(inner)
      if (r.prefix !== null) return { bad: '主机位里不带前缀长度，[::1] 这样写就行，你写了「' + named + '」' }
      return { isIp: true, isV6: true, loopback: classifyIpv6(inner).name === '环回地址', kind: 'IPv6 地址（方括号写法）' }
    } catch (e) {
      return { bad: '方括号里不是一个合法的 IPv6 主机：' + e.message }
    }
  }
  if (h.includes(']')) return { bad: '「]」出现在主机位里，IPv6 主机要整段用方括号包住，像 [::1]:8080，你写了「' + named + '」' }
  if (NUMERIC_HOST.test(h)) {
    if (IPV4_SHAPE.test(h)) {
      const r = parseIpv4(h)
      if (!r.ok) return { bad: '主机写成四段数字，但不是合法的 IPv4：' + r.tip }
      const sp = specialForIp(h)
      return { isIp: true, loopback: !!sp && sp.name === '环回地址', kind: 'IPv4 地址' }
    }
    const parts = h.split('.')
    // WHATWG 在这里会直接把 http://300 换成 http://0.0.1.44 —— 那叫悄悄改你写的地址，
    // 这里不换，只把「它会换算」这件事说出来，让人自己判断要不要点
    if (parts.length > 4) return { bad: '纯数字主机最多四段，你写了 ' + parts.length + ' 段（' + named + '）' }
    return { shorthand: true, kind: '纯数字主机（浏览器会按 IPv4 简写换算成别的地址）' }
  }
  return { kind: h.includes('.') ? '域名' : '主机名（可能是内网机器）' }
}

/** 报错时把整个主机位（含凭证后面的那一截）指给人看，别只指正则切出来的一半 */
function authorityOf(raw) {
  const i = raw.indexOf('://')
  if (i < 0) return raw
  const rest = raw.slice(i + 3)
  const end = rest.search(/[/?#]/)
  const a = end < 0 ? rest : rest.slice(0, end)
  const at = a.lastIndexOf('@')
  return at < 0 ? a : a.slice(at + 1)
}

/** 拆解 URL。用正则而不是 URL 构造函数，因为 App 端不一定有 */
function parseUrl(input) {
  const src = String(input || '')
  // 换行和制表符按浏览器地址栏的规则先删掉（邮件里折行的链接靠这条救回来）；
  // 删过就在安全提醒里说一句，别不吭声。
  const raw = src.replace(/[\t\r\n]/g, '').trim()
  if (!raw) return { ok: false, error: '请输入 URL' }

  const RE_URL =
    /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(?:([^:@/?#]*)(?::([^@/?#]*))?@)?(\[[^\]]*\](?=[/:?#]|$)|[^:/?#]*)(?::([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#([\s\S]*))?$/
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
      host: host || '',
      port: port === undefined ? '' : port,
      path: path || '',
      query: query || '',
      hash: hash || '',
      isPseudo: false,
    }
  } else if (m2) {
    // 伪协议也得切 ? 和 #：magnet:?xt=… 的参数原来整段落进路径，
    // 于是「查询参数」那张卡对着一条带参数的地址说「没有查询参数」
    let rest = m2[2]
    let hash = ''
    let query = ''
    const hi = rest.indexOf('#')
    if (hi > -1) {
      hash = rest.slice(hi + 1)
      rest = rest.slice(0, hi)
    }
    const qi = rest.indexOf('?')
    if (qi > -1) {
      query = rest.slice(qi + 1)
      rest = rest.slice(0, qi)
    }
    out = {
      scheme: m2[1],
      schemeAdded: false,
      username: '',
      password: '',
      host: '',
      port: '',
      path: rest,
      query,
      hash,
      isPseudo: true,
    }
  } else {
    return { ok: false, error: '认不出这个 URL。至少要写成 host/path 或 scheme://host/path 的形式' }
  }

  out.schemeLower = out.scheme.toLowerCase()
  out.schemeDoc = SCHEME_DOC[out.schemeLower] || '未知协议'
  out.hostLower = out.host.toLowerCase()

  if (out.host) {
    const hi = hostInfo(out.host, authorityOf(raw))
    if (hi.bad) return { ok: false, error: hi.bad }
    out.isIpHost = !!hi.isIp
    out.isV6Host = !!hi.isV6
    out.hostLoopback = !!hi.loopback
    out.hostShorthand = !!hi.shorthand
    out.hostKind = hi.kind
  } else {
    if (!out.isPseudo && out.schemeLower !== 'file') {
      return { ok: false, error: '「' + out.scheme + '://」后面要跟域名或 IP，你这儿是空的' }
    }
    out.isIpHost = false
    out.isV6Host = false
    out.hostLoopback = false
    out.hostShorthand = false
    out.hostKind = out.isPseudo ? '伪协议没有主机位' : '本地文件，没有主机'
  }

  // 空路径：http/https/ftp/ws/wss/file 按规范就是「/」，其余协议没写就是没写，
  // 原来一律补「/」，于是 ssh://user@a.com 的表格上多出一个谁也没写过的斜杠
  if (!out.isPseudo && !out.path && PATH_DEFAULTED.has(out.schemeLower)) out.path = '/'

  if (out.port !== '') {
    if (!/^\d+$/.test(out.port)) return { ok: false, error: '「' + out.port + '」不是端口号，冒号后面写数字，例如 :8080' }
    const n = Number(out.port)
    // 位数上限跟校验台的 checkUrl 同一把尺：超过 5 位一律拦，别让 Number 丢精度
    if (out.port.length > 5 || n < 1 || n > 65535) return { ok: false, error: '端口应在 1-65535 之间，当前 ' + n }
  }
  out.portExplicit = out.port !== ''
  out.portIsDefault = out.portExplicit && Number(out.port) === Number(DEFAULT_PORTS[out.schemeLower] || -1)
  out.effectivePort = out.portExplicit ? String(Number(out.port)) : DEFAULT_PORTS[out.schemeLower] || ''

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
  // 来源：协议 + 主机 + 端口，不含用户名密码，也不含路径。
  // 原来把 user:pw@ 一起印进来，跟「跨域判断就是比这个」那句话自相矛盾；
  // 端口跟协议默认一致时也不写，http://a.com:80 和 http://a.com 是同一个来源。
  out.origin = out.host ? out.schemeLower + '://' + out.hostLower + (out.portExplicit && !out.portIsDefault ? ':' + out.port : '') : ''
  out.ok = true

  // 简单的安全检查
  out.warnings = []
  if (/[\t\r\n]/.test(src)) out.warnings.push('原文里有换行或制表符，已按浏览器地址栏的规则删掉再拆')
  if (schemeAdded) out.warnings.push('原文本没写协议，已按 https:// 解读')
  if (out.schemeLower === 'javascript') out.warnings.push('这是 javascript: 伪协议，点击会在页面里执行脚本')
  if (out.schemeLower === 'data' && /base64|%3C|<html/i.test(out.path + out.query)) out.warnings.push('data: 里内联了内容，可能是钓鱼页')
  if (out.username || out.password) out.warnings.push('URL 里带用户名密码，会出现在日志与 Referer 里，不要这样传凭证')
  if (out.isIpHost && !out.hostLoopback) out.warnings.push('直接写 IP 而没有域名，常见于钓鱼链接')
  if (out.hostShorthand) out.warnings.push('主机全是数字（' + out.host + '），浏览器会按 IPv4 简写把它换算成另一个地址，这种写法常见于绕过域名白名单')
  return out
}

/** 编码：keepReserved 时保留 : / ? # [ ] @ 等结构字符 */
export function encodeUrl(str, keepReserved) {
  const s = String(str)
  try {
    return keepReserved ? encodeURI(s) : encodeURIComponent(s)
  } catch (e) {
    // 半个表情符号（孤立代理字符）编码不出来，原生异常是英文的，这里换成能印到界面上的话
    throw new Error('文本里有半个表情符号（孤立的代理字符），编码不出来；把那一截删掉再试', { cause: e })
  }
}

/** 解码：只做百分号还原。
 *  「+」不当空格处理——编码那头从没把「+」变成过什么（它把 + 编成 %2B），
 *  解码要是把字面「+」吃掉，粘一段 base64 进来就被改坏了。
 *  表单里那种 a+b=c 的「+」算空格，只在下面查询参数那张卡按表单规则处理。 */
export function decodeUrl(str) {
  const s = String(str)
  try {
    return decodeURIComponent(s)
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

/** 已经是 [x] 样子的字符是上一次无害化留下的，不再包第二层，
 *  不然连点两次「无害化」就把 a[.]com 变成 a[[.]]com、把 user[@] 变成 user[[@]] */
function alreadyWrapped(off, whole) {
  return whole[off - 1] === '[' && whole[off + 1] === ']'
}

/** 恶意 URL「无害化」：把可能被自动识别成链接的部分拆开。
 *  协议名按词匹配，粘的是一整句话时每个链接都能照顾到（原来只查串首，
 *  「Visit http://a.com」里的 http 一点没动）。 */
export function defang(str) {
  return String(str)
    .replace(/\b(https?|ftp)(?=:|：)/gi, (scheme) => scheme.replace(/[tT]/g, (t) => (t === 'T' ? 'X' : 'x')))
    .replace(/\./g, (dot, off, whole) => (alreadyWrapped(off, whole) ? dot : '[.]'))
    .replace(/:\/\//g, '[:]//')
    .replace(/@/g, (at, off, whole) => (alreadyWrapped(off, whole) ? at : '[@]'))
}

/** x 只是替身，它自己那一位的大小写记着被它换掉的字母，所以还原能一字不差 */
function unhxxp(m) {
  const want = /^f/i.test(m) ? 'ftp' : /s$/i.test(m) ? 'https' : 'http'
  return m
    .split('')
    .map((c, i) => (c === 'x' ? want[i].toLowerCase() : c === 'X' ? want[i].toUpperCase() : c))
    .join('')
}

/** 反向还原 */
export function refang(str) {
  return String(str)
    .replace(/\b(hxxps?|fxp)\b/gi, unhxxp)
    .replace(/\[\.\]/g, '.')
    .replace(/\[:\]/g, ':')
    .replace(/\[@\]/g, '@')
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
    ['端口', (p.portExplicit ? p.port : p.effectivePort) || '—', p.portExplicit ? (p.portIsDefault ? '跟 ' + p.schemeLower + ' 的默认端口是同一个' : '显式指定') : '协议默认'],
    ['路径', p.path || '—', p.path ? '' : '原文没写路径'],
    ['查询串', p.query || '—', p.params.length ? p.params.length + ' 个参数' : ''],
    ['锚点', p.hash || '—', p.hash ? '只在本页内跳转，不会发给服务器' : ''],
    ['来源', p.origin || '—', p.origin ? '' : p.isPseudo ? '伪协议没有主机，谈不上来源' : '本地文件没有来源'],
  ]
  return { parsed: p, rows }
}

export const SAMPLE_URL =
  'https://user:pw@api.example.com:8443/v2/items?page=2&size=20&tag=%E5%B7%A5%E5%85%B7&tag=dev#section-3'
