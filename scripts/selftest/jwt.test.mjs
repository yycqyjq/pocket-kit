/** JWT 解码的自查：样例令牌取自 RFC 7519 附录 C.3（那串是文档里的公开样本），
 *  其余用 Node 自带的 Buffer 独立编码再让本模块解——两头对得上才叫解码。 */
import { useUtils } from './harness.mjs'
const J = await useUtils('jwt')

let ok = 0
let fail = 0
function is(a, b, m) {
  if (a === b) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b))
  }
}
function ok_(cond, m) {
  is(!!cond, true, m)
}
function throwsWith(fn, re, m) {
  try {
    fn()
    fail++
    console.log('FAIL ' + m + ': 应该抛错却没抛')
  } catch (e) {
    const msg = e && e.message ? e.message : String(e)
    if (!/[\u4e00-\u9fa5]/.test(msg)) {
      fail++
      console.log('FAIL ' + m + ': 报错不是中文 → ' + msg)
    } else if (re && !re.test(msg)) {
      fail++
      console.log('FAIL ' + m + ': 文案不符 → ' + msg)
    } else ok++
  }
}

/* Node 的 base64url 是另一套实现，拿它当对照 */
const enc = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url')
const tok = (h, p, s) => enc(h) + '.' + enc(p) + '.' + (s === undefined ? 'ZmFrZXNpZw' : s)

/* ---------- RFC 7519 附录 C.3 的样例令牌 ---------- */
const RFC =
  'eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9' +
  '.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlLA0KICJodHRwOi8vZXhhbXBsZS5jb20vcG9saWN5IjoiYWxsIn0' +
  '.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
{
  // 先确认这串字面量本身没抄错：Node 解出来的头和仓库解出来的头必须一致
  const h = JSON.parse(Buffer.from(RFC.split('.')[0], 'base64url').toString('utf8'))
  const p = JSON.parse(Buffer.from(RFC.split('.')[1], 'base64url').toString('utf8'))
  is(h.typ, 'JWT', '样例头里有 typ')
  is(h.alg, 'HS256', '样例头里有 alg')
  is(p.iss, 'joe', '样例载荷的 iss')
  is(p.exp, 1300819380, '样例载荷的 exp')

  const r = J.decodeJwt(RFC)
  is(r.header.alg, h.alg, '仓库解的头 = Node 解的头')
  is(JSON.stringify(r.payload), JSON.stringify(p), '仓库解的载荷 = Node 解的载荷')
  is(r.alg, 'HS256', 'alg 原样给出')
  is(r.algInfo.family, 'HMAC 对称签名', 'HS 归到对称家族')
  is(r.algInfo.symmetric, true, '对称标记')
  is(r.hasSignature, true, '带签名')
  is(r.sigBytes, 32, '43 个 base64url 字符 = 32 字节')
  is(r.exp, 1300819380, 'exp 提出来')
  is(r.expired, true, '2011 年的令牌早过期了')
  is(r.status, '已过期', '状态')
  is(r.statusTone, 'bad', '过期要标红')
  ok_(r.warnings.includes('令牌已经过期'), '过期要写进告警')
  const expItem = r.claims.find((c) => c.key === 'exp')
  is(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(expItem.time.slice(0, 19)), true, 'exp 旁边给成人读的本地时间')
  is(expItem.badge, '已过期', '过期徽章')
  is(expItem.tone, 'bad', '徽章配色')
  ok_(expItem.time.includes('（'), '过期时间还补了一句相对时间')
  const issItem = r.claims.find((c) => c.key === 'iss')
  ok_(issItem.doc.includes('签发者'), '已知声明带中文释义')
  const rootItem = r.claims.find((c) => c.key === 'http://example.com/is_root')
  is(rootItem.doc, '', '私有声明不硬编释义')
  is(rootItem.raw, 'true', '布尔值原样成文本')
  is(r.payloadText.includes('\n'), true, '载荷给的是缩进好的 JSON')
}

/* ---------- 输入容忍与结构错误 ---------- */
{
  is(J.decodeJwt('  ' + RFC + '  ').exp, 1300819380, '前后空格不算')
  is(J.decodeJwt('Bearer ' + RFC).alg, 'HS256', 'Bearer 前缀收掉')
  is(J.decodeJwt('bearer\t' + RFC).alg, 'HS256', '前缀大小写与制表符都认')
  throwsWith(() => J.decodeJwt(''), /请粘贴/, '空输入')
  throwsWith(() => J.decodeJwt(null), /请粘贴/, 'null')
  throwsWith(() => J.decodeJwt('a.b'), /三段.*只有 2 段/, '只有两段')
  throwsWith(() => J.decodeJwt('a.b.c.d'), /现在有 4 段/, '四段')
  throwsWith(() => J.decodeJwt('aGVsbG8.' + enc({ a: 1 }) + '.c'), /头部不是合法 JSON/, '头部解出来是 hello，不是 JSON')
  throwsWith(() => J.decodeJwt(enc(42) + '.' + enc({ a: 1 }) + '.c'), /头部解析出来不是一个对象/, '头部是个数字')
  throwsWith(() => J.decodeJwt(enc({ alg: 'HS256' }) + '.' + enc([1, 2]) + '.c'), /载荷.*不是一个对象/, '载荷是数组也不行')
  throwsWith(() => J.decodeJwt('.' + enc({ a: 1 }) + '.c'), /头部是空的/, '头部空段')
}

/* ---------- 算法家族 ---------- */
{
  const fam = (alg) => J.decodeJwt(tok({ alg }, { sub: 'u' })).algInfo.family
  is(fam('HS256'), 'HMAC 对称签名', 'HS256')
  is(fam('HS512'), 'HMAC 对称签名', 'HS512')
  is(fam('RS256'), 'RSA 非对称签名', 'RS256')
  is(fam('PS384'), 'RSA-PSS 非对称签名', 'PS384')
  is(fam('ES256'), 'ECDSA 非对称签名', 'ES256')
  is(fam('EdDSA'), 'EdDSA 签名', 'EdDSA')
  is(fam('hs384'), 'HMAC 对称签名', '小写也归对家族')
  is(fam('XYZ'), '未识别的算法', '没见过的算法')
  is(J.decodeJwt(tok({}, { sub: 'u' })).algInfo.family, '未知', '头部没有 alg')
  is(J.decodeJwt(tok({ alg: 'none' }, { sub: 'u' }, '')).algInfo.note.includes('任何人都能伪造'), true, 'none 要说清风险')
  ok_(J.decodeJwt(tok({ alg: 'none' }, { sub: 'u' })).warnings.includes('alg 是 none，签名形同虚设'), 'none 要进告警')
  is(J.decodeJwt(tok({ alg: 'RS256' }, { sub: 'u' })).algInfo.symmetric, false, 'RS 是不对称')
}

/* ---------- 有效期三态 ---------- */
{
  const now = Math.floor(Date.now() / 1000)
  const live = J.decodeJwt(tok({ alg: 'HS256' }, { sub: 'u', exp: now + 7200, iat: now - 60 }))
  is(live.expired, false, '两小时后过期，现在还没')
  is(live.status, '有效', '状态：有效')
  is(live.statusTone, 'ok', '标绿')
  ok_(live.claims.find((c) => c.key === 'exp').time.includes('还有'), '要写「还有多久」')
  is(live.warnings.length, 0, '没毛病就不该有告警')
  is(live.claims.find((c) => c.key === 'iat').isTime, true, 'iat 是时间类声明')
  ok_(live.claims.find((c) => c.key === 'iat').time.includes('-'), 'iat 也翻成日期')

  const noexp = J.decodeJwt(tok({ alg: 'HS256' }, { sub: 'u' }))
  is(noexp.exp, null, '没有 exp')
  is(noexp.expired, null, '过期状态未知，不是 false')
  is(noexp.status, '无有效期', '状态：无有效期')
  is(noexp.statusTone, 'warn', '这属于要提醒')
  ok_(noexp.warnings.some((w) => w.includes('永不过期')), '没写 exp 要提醒')

  const later = J.decodeJwt(tok({ alg: 'HS256' }, { sub: 'u', nbf: now + 86400 }))
  ok_(later.warnings.some((w) => w.includes('尚未生效')), 'nbf 在未来要提醒')
  is(later.claims.find((c) => c.key === 'nbf').isTime, true, 'nbf 算时间类')

  const strExp = J.decodeJwt(tok({ alg: 'HS256' }, { sub: 'u', exp: String(now + 7200) }))
  is(strExp.claims.find((c) => c.key === 'exp').isTime, false, 'exp 是字符串时不当时间处理')
  is(strExp.exp, null, '字符串 exp 不当数用')
  is(strExp.claims.find((c) => c.key === 'exp').raw, String(now + 7200), '但原文还在')
}

/* ---------- 声明渲染 ---------- */
{
  const r = J.decodeJwt(
    tok(
      { alg: 'HS256' },
      { sub: '42', name: '张三', roles: ['admin', 'ops'], auth_time: 1700000000, scp: ['a', 'b'], empty: null }
    )
  )
  const by = (k) => r.claims.find((c) => c.key === k)
  is(by('name').raw, '张三', '中文载荷解得回来')
  is(Buffer.from(r.payloadText).includes(Buffer.from('张三', 'utf8')), true, '确实是那三个字的 UTF-8')
  is(by('roles').raw, '["admin","ops"]', '数组声明按 JSON 展示')
  ok_(by('roles').doc.includes('角色'), 'roles 有释义')
  ok_(by('sub').doc.includes('主体'), 'sub 有释义')
  is(by('empty').raw, 'null', 'null 值也列出来')
  is(by('auth_time').isTime, true, 'auth_time 是时间类')
  is(by('scp').doc, '授权范围', 'scp 与 scope 同释义')
  is(r.claims.length, 6, '六个声明全列')
  is(J.decodeJwt(tok({ alg: 'HS256' }, {})).claims.length, 0, '空载荷不崩')
}

/* ---------- 签名段 ---------- */
{
  is(J.decodeJwt(tok({ alg: 'HS256' }, { sub: 'u' }, '')).hasSignature, false, '空签名段')
  is(J.decodeJwt(tok({ alg: 'HS256' }, { sub: 'u' }, '')).sigBytes, 0, '字节数 0')
  is(J.decodeJwt(tok({ alg: 'HS256' }, { sub: 'u' }, 'AAAA')).sigBytes, 3, '4 个字符 = 3 字节')
  is(J.decodeJwt(tok({ alg: 'HS256' }, { sub: 'u' }, 'AAAAAA')).sigBytes, 4, '6 个字符 = 4 字节（末尾两个字符凑不满三个字节）')
  ok_(J.decodeJwt(tok({ alg: 'HS256' }, { sub: 'u' })).hasSignature, '默认样例带签名')
}

/* ---------- 速查表 ---------- */
{
  is(J.JWT_CLAIMS_REF.length >= 7, true, '速查表至少覆盖七个注册声明')
  ok_(J.JWT_CLAIMS_REF.every((x) => x.key && x.desc), '每条都有键和说明')
  ok_(J.JWT_CLAIMS_REF.some((x) => x.key === 'exp'), 'exp 在表里')
  ok_(J.JWT_CLAIMS_REF.every((x) => /[\u4e00-\u9fa5]/.test(x.desc)), '说明都是中文')
}

console.log('== jwt pass=' + ok + '/' + (ok + fail))
if (fail) process.exitCode = 1
