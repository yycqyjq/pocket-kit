/**
 * httpdump.js 自查断言（直接测 src/utils/httpdump.js 本体）
 * ------------------------------------------------------------
 * 报文格式由 RFC 9110（HTTP 语义）/ RFC 9112（HTTP/1.1 消息语法）规定，
 * 所以判据分四类：
 *   1) 外部裁判（Node 内置 / 标准库）：请求行里的 target 用 new URL 反解出
 *      path 与 query；正文字节数用 Buffer.byteLength(body,'utf8') 独立算；
 *      JSON 正文用 JSON.parse 独立解析后深度比对；表单正文用
 *      decodeURIComponent 独立解码。这些都不是抄模块输出。
 *   2) 手写报文逐字段断言：请求行「方法 SP target SP 版本」、状态行
 *      「版本 SP 码 SP 原因短语」、头部「名: 值」、空行后为正文，
 *      按 RFC 9112 的语法逐项核对。
 *   3) 边界与反例：空串/认不出起始行必须抛中文错；折行续行、重复头、
 *      缺 Content-Length、同时出现 CL 与 TE（请求走私）等敏感场景。
 *   4) UI 可见契约：toTable 字段齐全，结果 JSON 里不许 undefined/NaN。
 */
import { useUtils, makeTest } from './harness.mjs'

const H = await useUtils('httpdump')
const T = makeTest('httpdump')

const noJunk = (v) => !/undefined|NaN|\[object Object\]/.test(JSON.stringify(v))
const headerOf = (r, name) => (r.headers.find((h) => h.name === name) || {}).value

/* ---------------- 0. 导出面 ---------------- */
T.ok('导出 parseHttp', typeof H.parseHttp === 'function')
T.ok('导出 toTable', typeof H.toTable === 'function')
T.ok('导出 HTTP_SAMPLE', typeof H.HTTP_SAMPLE === 'string' && H.HTTP_SAMPLE.includes('HTTP/1.1'))
T.ok('导出 HTTP_RESPONSE_SAMPLE', typeof H.HTTP_RESPONSE_SAMPLE === 'string' && H.HTTP_RESPONSE_SAMPLE.includes('HTTP/1.1'))

/* ---------------- 1. 请求样例：起始行（RFC 9112 §3） ---------------- */
const req = H.parseHttp(H.HTTP_SAMPLE)
T.eq('识别为请求', req.kind, 'request')
T.eq('中文类型名', req.kindName, '请求')
T.eq('方法', req.startLine.method, 'POST')
T.eq('完整 target', req.startLine.target, '/api/v2/orders?from=web')
T.eq('路径', req.startLine.path, '/api/v2/orders')
T.eq('查询串', req.startLine.query, 'from=web')
T.eq('版本', req.startLine.version, 'HTTP/1.1')
// 外部裁判：用 new URL 独立切 path / query
const u = new URL('http://example.com' + req.startLine.target)
T.eq('path 与 URL 一致', req.startLine.path, u.pathname)
T.eq('query 与 URL 一致', req.startLine.query, u.search.slice(1))

/* ---------------- 2. 请求样例：头部 ---------------- */
T.eq('头部条数', req.headerCount, 9)
T.eq('headerCount == headers.length', req.headerCount, req.headers.length)
T.ok('头名统一小写', req.headers.every((h) => h.name === h.name.toLowerCase()))
T.ok('头值已 trim', req.headers.every((h) => h.value === h.value.trim() && h.value.length > 0))
T.eq('Host', headerOf(req, 'host'), 'api.example.com')
T.ok('Content-Type 是 JSON', headerOf(req, 'content-type').includes('application/json'))
T.eq('Accept', headerOf(req, 'accept'), 'application/json')
T.ok('已知头带中文说明', headerOf(req, 'host') && req.headers.find((h) => h.name === 'host').note.includes('主机'))
T.ok('敏感头被标记 risky', req.headers.find((h) => h.name === 'authorization').risky === true)

/* ---------------- 3. 请求样例：正文（外部裁判） ---------------- */
const rawBody = H.HTTP_SAMPLE.slice(H.HTTP_SAMPLE.indexOf('\n\n') + 2)
T.eq('正文种类', req.bodyKind, 'JSON')
T.eq('正文原样保留', req.body, rawBody)
T.ok('hasBody', req.hasBody === true)
T.eq('格式化正文能被 JSON.parse 验回', JSON.stringify(JSON.parse(req.bodyFormat)), JSON.stringify(JSON.parse(rawBody)))
T.eq('bodyFormat 是两空格缩进的 JSON', req.bodyFormat, JSON.stringify(JSON.parse(rawBody), null, 2))
T.eq('正文字节数与 Buffer.byteLength 一致', req.bodyBytes, Buffer.byteLength(rawBody, 'utf8'))

/* ---------------- 4. 请求样例：Cookie 与安全提醒 ---------------- */
T.eq('Cookie 拆成两条', req.cookies.length, 2)
T.eq('cookie session', req.cookies[0].name, 'session')
T.eq('cookie session 值', req.cookies[0].value, 'abc123')
T.eq('cookie theme', req.cookies[1].name, 'theme')
T.eq('cookie theme 值', req.cookies[1].value, 'dark')
T.ok('Authorization 是 JWT', req.isJwtInAuth === true)
T.ok('提醒 authorization 敏感', req.warnings.some((w) => w.includes('authorization')))
T.ok('提醒 cookie 敏感', req.warnings.some((w) => w.includes('cookie')))
T.ok('提醒 JWT 要打码', req.warnings.some((w) => w.includes('JWT')))

/* ---------------- 5. 请求样例：toTable ---------------- */
const tbl = H.toTable(req)
T.ok('表里有方法', tbl.includes('方法\tPOST'))
T.ok('表里有路径', tbl.includes('路径\t/api/v2/orders'))
T.ok('表里有查询串', tbl.includes('查询串\tfrom=web'))
T.ok('表里有版本', tbl.includes('版本\tHTTP/1.1'))
T.ok('表里有 Host 行', tbl.includes('host\tapi.example.com'))

/* ---------------- 6. 响应样例 ---------------- */
const res = H.parseHttp(H.HTTP_RESPONSE_SAMPLE)
T.eq('识别为响应', res.kind, 'response')
T.eq('中文类型名', res.kindName, '响应')
T.eq('响应版本', res.startLine.version, 'HTTP/1.1')
T.eq('状态码', res.startLine.code, 302)
T.eq('原因短语', res.startLine.reason, 'Found')
T.eq('中文含义', res.startLine.reasonCn, '临时重定向')
T.eq('无正文', res.hasBody, false)
T.eq('正文种类为空', res.bodyKind, '空')
T.eq('响应头条数', res.headerCount, 5)
T.eq('Location 头', headerOf(res, 'location'), 'https://www.example.com/login')
const resTbl = H.toTable(res)
T.ok('响应表有状态码', resTbl.includes('状态码\t302 Found'))
T.ok('响应表有中文含义', resTbl.includes('含义\t临时重定向'))

/* ---------------- 7. 手写报文：请求行变体 ---------------- */
const r2 = H.parseHttp('GET /a/b?x=1&y=2 HTTP/1.1\r\nHost: h\r\nContent-Length: 0\r\n\r\n')
T.eq('CRLF 也能解析', r2.kind, 'request')
T.eq('GET 路径', r2.startLine.path, '/a/b')
T.eq('GET 查询串', r2.startLine.query, 'x=1&y=2')
const r3 = H.parseHttp('GET /path\nHost: h\nContent-Length: 0\n')
T.ok('不写版本时给出提示', r3.startLine.version.includes('未写明'))
T.eq('无正文时 hasBody=false', r3.hasBody, false)
T.eq('无正文时 bodyKind=空', r3.bodyKind, '空')

/* ---------------- 8. 折行续行与重复头（RFC 9112 §5.2） ---------------- */
const folded = H.parseHttp('GET / HTTP/1.1\nHost: a\nX-Long: one\n two\nContent-Length: 0\n')
T.eq('折行续行被并进上一头', headerOf(folded, 'x-long'), 'one two')
const dup = H.parseHttp('HTTP/1.1 200 OK\nSet-Cookie: a=1\nSet-Cookie: b=2\nContent-Length: 0\n')
T.eq('重复头被点名', JSON.stringify(dup.dupHeaders), JSON.stringify(['set-cookie']))
T.eq('重复头两条都保留', dup.headers.filter((h) => h.name === 'set-cookie').length, 2)

/* ---------------- 9. 正文类型分支 ---------------- */
const form = H.parseHttp('POST /x HTTP/1.1\nHost: a\nContent-Type: application/x-www-form-urlencoded\nContent-Length: 15\n\na=1&b=%E4%B8%AD')
T.eq('表单正文种类', form.bodyKind, '表单（form-urlencoded）')
T.eq('表单解码与独立 decodeURIComponent 一致', form.bodyFormat, 'a = 1\nb = ' + decodeURIComponent('%E4%B8%AD'))
const badJson = H.parseHttp('HTTP/1.1 200 OK\nContent-Type: application/json\nContent-Length: 4\n\n{bad')
T.eq('坏 JSON 被识别出来', badJson.bodyKind, '看起来是 JSON，但解析失败')
const text = H.parseHttp('HTTP/1.1 200 OK\nContent-Type: text/plain\nContent-Length: 5\n\nhello')
T.eq('纯文本正文种类', text.bodyKind, '纯文本或其他')
T.eq('纯文本正文原样保留', text.bodyFormat, 'hello')

/* ---------------- 10. 安全提醒规则 ---------------- */
const noLen = H.parseHttp('GET / HTTP/1.1\nHost: a\n')
T.ok('缺 CL 与 TE 会提醒边界', noLen.warnings.some((w) => w.includes('Content-Length')))
const smuggle = H.parseHttp('POST / HTTP/1.1\nHost: a\nContent-Length: 3\nTransfer-Encoding: chunked\n\nabc')
T.ok('CL 与 TE 同时出现会提醒走私', smuggle.warnings.some((w) => w.includes('走私')))

/* ---------------- 11. 边界与反例 ---------------- */
T.throws('空串报错', () => H.parseHttp(''), /粘贴/)
T.throws('纯空白报错', () => H.parseHttp('   \n  '), /粘贴/)
T.throws('认不出的起始行报错', () => H.parseHttp('garbage line'), /起始行/)
T.throws('随便一行中文报错', () => H.parseHttp('这不是报文'), /起始行/)
const skip = H.parseHttp('GET / HTTP/1.1\nHost: a\n这一行没有冒号\nContent-Length: 0\n')
T.eq('没有冒号的头被跳过', skip.headerCount, 2)
T.eq('跳过后仍是两条', skip.headers.length, 2)
T.ok('解析结果无脏字', noJunk(req) && noJunk(res) && noJunk(form))

T.done()
