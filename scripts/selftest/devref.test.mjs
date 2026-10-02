/**
 * devref.js 自查断言（直接测 src/utils/devref.js 本体）
 * ------------------------------------------------------------
 * 这张速查表的内容都有权威来源，判据分四类：
 *   1) 外部裁判（协议规范）：HTTP 状态码的 reason phrase 以 RFC 9110 为准
 *      （RFC 9110 未收录的用其定义 RFC：418=RFC 2324、422=RFC 4918、
 *      429=RFC 6585）。逐码断言「码 → 英文名」。
 *   2) 外部裁判（IANA 注册表）：MIME 类型用 IANA media types、
 *      端口用 IANA Service Name and Transport Protocol Port Number Registry。
 *   3) 外部裁判（RFC 9110 §9.2.1/§9.2.2）：HTTP 方法的 safe / idempotent
 *      属性——GET/HEAD/OPTIONS/TRACE 安全且幂等，PUT/DELETE 幂等但不安全，
 *      POST/PATCH/CONNECT 既不安全也不幂等。
 *   4) 表结构与搜索行为：码唯一、分组自洽、searchRef 大小写不敏感、
 *      未知分组给空、结果无脏字。
 *
 * 已知与 RFC 9110 不一致的一处（413 的 reason phrase）见最终报告，
 * 按任务要求那一条不写成断言。
 */
import { useUtils, makeTest } from './harness.mjs'

const D = await useUtils('devref')
const T = makeTest('devref')

const hasCJK = (s) => /[\u4e00-\u9fa5]/.test(String(s))
const statusOf = (code) => D.HTTP_STATUS.find((s) => s.code === code)

/* ---------------- 0. 导出面 ---------------- */
for (const k of ['HTTP_STATUS', 'HTTP_METHODS', 'MIME_TYPES', 'COMMON_PORTS', 'GIT_COMMANDS', 'GROUPS', 'searchRef']) {
  T.ok('导出 ' + k, typeof D[k] !== 'undefined')
}

/* ---------------- 1. HTTP 状态码：码 → 名（RFC 9110 等） ---------------- */
const NAMES = {
  100: 'Continue', 101: 'Switching Protocols',
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 206: 'Partial Content',
  301: 'Moved Permanently', 302: 'Found', 303: 'See Other', 304: 'Not Modified',
  307: 'Temporary Redirect', 308: 'Permanent Redirect',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
  405: 'Method Not Allowed', 406: 'Not Acceptable', 408: 'Request Timeout', 409: 'Conflict',
  410: 'Gone', 415: 'Unsupported Media Type',
  418: "I'm a teapot", 422: 'Unprocessable Entity', 429: 'Too Many Requests',
  500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway',
  503: 'Service Unavailable', 504: 'Gateway Timeout',
}
for (const code of Object.keys(NAMES)) {
  const e = statusOf(Number(code))
  T.eq('状态码 ' + code + ' 名称', e ? e.name : '(缺失)', NAMES[code])
}
T.ok('413 存在（名称按 RFC 9110 应为 Content Too Large，见报告）', !!statusOf(413))
T.ok('413 说明语义是「过大」', statusOf(413).note.includes('大'))

T.ok('状态码表够用', D.HTTP_STATUS.length >= 30)
T.eq('状态码不重复', new Set(D.HTTP_STATUS.map((s) => s.code)).size, D.HTTP_STATUS.length)
T.ok('码都在 100–599', D.HTTP_STATUS.every((s) => s.code >= 100 && s.code <= 599))
T.ok('英文名是 ASCII', D.HTTP_STATUS.every((s) => /^[\x20-\x7e]+$/.test(s.name)))
T.ok('分组与百位一致', D.HTTP_STATUS.every((s) => s.group.startsWith(String(Math.floor(s.code / 100)) + 'xx')))
T.ok('每条都有中文说明', D.HTTP_STATUS.every((s) => s.note.length > 5 && hasCJK(s.note)))
T.ok('401 讲的是没认证', /认证|登录/.test(statusOf(401).note))
T.ok('403 讲的是没权限', /权限/.test(statusOf(403).note))
T.ok('405 提示要带 Allow', /Allow/.test(statusOf(405).note))

/* ---------------- 2. HTTP 方法：safe / idempotent（RFC 9110） ---------------- */
const METHOD_PROPS = {
  GET: [true, true], HEAD: [true, true], OPTIONS: [true, true], TRACE: [true, true],
  PUT: [false, true], DELETE: [false, true],
  POST: [false, false], PATCH: [false, false], CONNECT: [false, false],
}
const methodOf = (n) => D.HTTP_METHODS.find((m) => m.name === n)
for (const name of Object.keys(METHOD_PROPS)) {
  const m = methodOf(name)
  const [safe, idem] = METHOD_PROPS[name]
  T.eq(name + ' safe', m ? m.safe : '(缺失)', safe)
  T.eq(name + ' idempotent', m ? m.idempotent : '(缺失)', idem)
}
T.ok('方法表覆盖 9 种', D.HTTP_METHODS.length === 9)
T.ok('方法名唯一', new Set(D.HTTP_METHODS.map((m) => m.name)).size === D.HTTP_METHODS.length)
T.ok('每个方法有中文说明', D.HTTP_METHODS.every((m) => hasCJK(m.note)))

/* ---------------- 3. MIME 类型（IANA） ---------------- */
const MIMES = {
  '.json': 'application/json', '.html': 'text/html', '.css': 'text/css',
  '.js': 'text/javascript', '.txt': 'text/plain', '.csv': 'text/csv',
  '.md': 'text/markdown', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.pdf': 'application/pdf',
  '.zip': 'application/zip', '.gz': 'application/gzip', '.wasm': 'application/wasm',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf',
}
const mimeOf = (ext) => D.MIME_TYPES.find((m) => m.ext === ext)
for (const ext of Object.keys(MIMES)) {
  const e = mimeOf(ext)
  T.eq('MIME ' + ext, e ? e.mime : '(缺失)', MIMES[ext])
}
T.ok('MIME 条目够用', D.MIME_TYPES.length >= 25)
T.ok('mime 都形如 type/subtype', D.MIME_TYPES.every((m) => /^[\w.+-]+\/[\w.+-]+$/.test(m.mime)))
T.ok('MIME 有中文说明', D.MIME_TYPES.every((m) => hasCJK(m.note)))

/* ---------------- 4. 常用端口（IANA） ---------------- */
const PORTS = {
  21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP',
  110: 'POP3', 143: 'IMAP', 443: 'HTTPS', 1433: 'SQL Server', 1521: 'Oracle',
  3306: 'MySQL', 3389: 'RDP', 5432: 'PostgreSQL', 5672: 'RabbitMQ',
  6379: 'Redis', 9092: 'Kafka', 9200: 'Elasticsearch', 11211: 'Memcached', 27017: 'MongoDB',
}
const portOf = (p) => D.COMMON_PORTS.find((x) => x.port === p)
for (const p of Object.keys(PORTS)) {
  const e = portOf(Number(p))
  T.eq('端口 ' + p, e ? e.name : '(缺失)', PORTS[p])
}
T.eq('端口不重复', new Set(D.COMMON_PORTS.map((p) => p.port)).size, D.COMMON_PORTS.length)
T.ok('端口号在 1–65535', D.COMMON_PORTS.every((p) => p.port > 0 && p.port <= 65535))

/* ---------------- 5. Git 命令 ---------------- */
T.ok('Git 命令够多', D.GIT_COMMANDS.length >= 15)
T.ok('命令都以 git 开头', D.GIT_COMMANDS.every((g) => g.cmd.startsWith('git ')))
T.ok('每条有中文说明', D.GIT_COMMANDS.every((g) => hasCJK(g.note) && g.note.length > 5))

/* ---------------- 6. 分组与搜索 ---------------- */
T.eq('分组 key', JSON.stringify(D.GROUPS.map((g) => g.key)), JSON.stringify(['status', 'method', 'mime', 'port', 'git']))
const GROUP_SRC = { status: D.HTTP_STATUS, method: D.HTTP_METHODS, mime: D.MIME_TYPES, port: D.COMMON_PORTS, git: D.GIT_COMMANDS }
T.ok('分组 list 与导出数组同源', D.GROUPS.every((g) => g.list === GROUP_SRC[g.key]))
T.eq('status 组指向 HTTP_STATUS', D.GROUPS.find((g) => g.key === 'status').list, D.HTTP_STATUS)

T.eq('搜 404 命中一条', D.searchRef('status', '404').length, 1)
T.eq('搜 404 码正确', D.searchRef('status', '404')[0].code, 404)
T.eq('搜索大小写不敏感', D.searchRef('status', 'NOT FOUND')[0].code, 404)
T.ok('搜 4 命中多条 4xx', D.searchRef('status', '4').filter((s) => s.code >= 400 && s.code < 500).length >= 5)
T.ok('搜 json 命中 application/json', D.searchRef('mime', 'json').some((m) => m.mime === 'application/json'))
T.eq('搜 mysql 命中 3306', D.searchRef('port', 'mysql')[0].port, 3306)
T.ok('搜 rebase 命中 git 命令', D.searchRef('git', 'rebase').some((g) => g.cmd.includes('rebase')))
T.eq('空关键字返回整组', D.searchRef('status', '').length, D.HTTP_STATUS.length)
T.eq('未知分组返回空', D.searchRef('nope', 'x').length, 0)
T.ok('搜索无脏字', noJunkJson(D.searchRef('status', 'ok')))

function noJunkJson(v) {
  return !/undefined|NaN|\[object Object\]/.test(JSON.stringify(v))
}

T.done()
