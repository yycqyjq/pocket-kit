/**
 * shortcut.js 自查断言（直接测 src/utils/shortcut.js 本体）
 * ------------------------------------------------------------
 * 这一层没有算法，只有「校验收紧 + 拼串」，所以判据分两类：
 *   1) 该拒的必须拒住——尤其是能借 URI 越狱的写法（多余协议、labels 里塞 ?q=、号码里塞字母）；
 *   2) 拼出来的串用 Node 自带的 URL / decodeURIComponent 当外部裁判反解，
 *      反解回来的值必须等于填进去的原值，才算编码没把内容撑坏。
 * 真正唤起哪个 App 只有真机能验，这里测的是递出去的那根串干不干净。
 */
import { useUtils } from './harness.mjs'

const S = await useUtils('shortcut')

let ok = 0
let fail = 0
function is(a, b, m) {
  if (a === b) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b))
  }
}
function noThrow(fn, m) {
  try {
    fn()
    ok++
  } catch (e) {
    fail++
    console.log('FAIL ' + m + ': 抛了 ' + ((e && e.message) || e))
  }
}

/* ---------- 0. 导出面 ---------- */
{
  const want = [
    'normalizePhone', 'phoneKind', 'telUrl', 'smsUrl', 'smsBodyLimit', 'smsParts',
    'emailList', 'checkEmails', 'mailtoUrl',
    'coordOf', 'geoUrl', 'mapWebUrl', 'checkPkg', 'marketUrl', 'marketWebUrl', 'pkgHint',
    'OPEN_SCHEMES', 'urlAllowed', 'uriPreview',
    'SETTINGS_PAGES', 'settingsPage', 'SHORTCUT_ITEMS', 'SHORTCUT_NOTES',
  ]
  for (const k of want) is(typeof S[k] !== 'undefined', true, '导出 ' + k)
}

/* ---------- 1. 号码归一化 ---------- */
{
  const cases = [
    ['13812345678', '13812345678', 11],
    ['+86 138-1234-5678', '+8613812345678', 13],
    ['(010) 8447 3388', '01084473388', 11],
    ['  10086  ', '10086', 5],
    ['*61#', '*61#', 2],
    ['13812345678;1234', '13812345678;1234', 15],
    ['+44 20 7946 0958', '+442079460958', 12],
  ]
  for (const [raw, val, dg] of cases) {
    const r = S.normalizePhone(raw)
    is(r.ok, true, '合法号码：' + JSON.stringify(raw))
    is(r.value, val, '归一化结果：' + JSON.stringify(raw))
    is(r.digits.length, dg, '纯数字位数：' + JSON.stringify(raw))
    is(r.reason, '', '合法时不给理由：' + raw)
  }
  const bad = [
    ['1381234ab78', '字母'],
    ['12', '太短'],
    ['   ', '空白'],
    ['', '空'],
    ['+86+13812345678', '两个加号'],
    ['138+1234+5678', '加号在中间'],
    ['a@b.com', '邮箱混进来'],
    ['138123456789012345678901234', '超长'],
    ['138 1234 5678\n', '换行尾巴'],
  ]
  for (const [raw, tag] of bad) {
    const r = S.normalizePhone(raw)
    if (tag === '换行尾巴') {
      // trim 之后是合法号码，这一条是用来确认 \n 被清掉了
      is(r.ok, true, '换行会被 trim：' + JSON.stringify(raw))
      continue
    }
    is(r.ok, false, '必须拒掉：' + tag)
    is(r.value, '', '拒了就不给串：' + tag)
    is(/[一-龥]/.test(r.reason), true, '理由是中文：' + tag)
  }
  noThrow(() => S.normalizePhone(null), 'null 不抛')
  noThrow(() => S.normalizePhone(undefined), 'undefined 不抛')
  noThrow(() => S.normalizePhone(13812345678), '数字入参不抛')
  is(S.normalizePhone(13812345678).value, '13812345678', '数字入参当字符串处理')
  is(S.normalizePhone('').ok, false, '空串要拒')
}

/* ---------- 2. 号码类型提示 ---------- */
{
  const kinds = [
    ['13812345678', '中国大陆手机号'],
    ['+8613812345678', '中国大陆手机号（国际写法）'],
    ['01084473388', '北京固定电话（带区号）'],
    ['02112345678', '中国大陆固定电话（带区号）'],
    ['10086', '特服号或服务号'],
    ['+442079460958', '国际号码'],
    ['13812345678;1234', '含停顿或子地址，拨号盘会照办'],
  ]
  for (const [v, want] of kinds) is(S.phoneKind(v), want, '识别 ' + v)
  is(S.phoneKind('1234567').indexOf('没对上') > -1, true, '对不上常见格式时只提示不拦')
  is(S.phoneKind('*61#').indexOf('拨号盘') > -1, true, '星号井号说明白')
  noThrow(() => S.phoneKind(null), 'phoneKind 脏入参不抛')
}

/* ---------- 3. tel 与 sms ---------- */
{
  is(S.telUrl('13812345678'), 'tel:13812345678', 'tel 串')
  is(S.telUrl('+8613812345678'), 'tel:+8613812345678', '国际写法保留 +')
  is(S.smsUrl('13812345678', ''), 'smsto:13812345678', '没有正文就不带 ?')
  const u = S.smsUrl('13812345678', '你好，我在路上')
  is(u.indexOf('?body=') > -1, true, '正文走 ?body=')
  is(/\s/.test(u), false, 'URI 里不能有空格或换行')
  is(decodeURIComponent(u.split('?body=')[1]), '你好，我在路上', '正文原样反解回来')
  const multi = S.smsUrl('13812345678', '第一行\n第二行')
  is(decodeURIComponent(multi.split('?body=')[1]), '第一行\n第二行', '换行编码后仍能反解')
  is(multi.indexOf('\n') === -1, true, '裸换行不会留在 URI 里')
  is(S.smsBodyLimit(0), 600, '缺省上限 600')
  is(S.smsBodyLimit('x'), 600, '非数字按缺省')
  is(S.smsBodyLimit(9999), 600, '超上限夹住')
  is(S.smsBodyLimit(160), 160, '指定 160 就用 160')
  is(S.smsBodyLimit(-5), 600, '负数按缺省')

  is(S.smsParts('').parts, 0, '空正文零条')
  is(S.smsParts('abc').ascii, true, '纯英文判为 GSM-7')
  is(S.smsParts('abc').cap, 153, '英文段长 153')
  is(S.smsParts('a'.repeat(153)).parts, 1, '刚好装满一段算一条')
  is(S.smsParts('a'.repeat(154)).parts, 2, '多一个字符就要两条')
  is(S.smsParts('你'.repeat(67)).ascii, false, '含中文判为 UCS-2')
  is(S.smsParts('你'.repeat(67)).cap, 67, '中文段长 67')
  is(S.smsParts('你'.repeat(70)).parts, 2, '70 个汉字按拼接口径是两条')
  is(S.smsParts('a你').cap, 67, '混进一个中文就整体按 67')
  is(S.smsParts('line1\nline2').ascii, true, '换行属于 GSM-7 字符集')
  is(S.smsParts(null).chars, 0, 'null 不抛')
}

/* ---------- 4. 邮箱校验 ---------- */
{
  is(S.emailList('a@b.com, c@d.com').length, 2, '逗号分隔')
  is(S.emailList('a@b.com;c@d.com e@f.com、g@h.com').length, 4, '分号空格顿号都能分')
  is(S.emailList('   ').length, 0, '全空白等于没填')
  const good = S.checkEmails('first.last+tag@sub.example.museum')
  is(good.ok, true, '带加号与长后缀的常见地址算合法')
  is(S.checkEmails('a@b.com z@c.org').value, 'a@b.com,z@c.org', '干净列表用逗号拼接')
  for (const x of ['a@b', '@b.com', 'a b', 'a@@b.com', 'a@b.', '纯中文']) {
    const r = S.checkEmails(x)
    is(r.ok, false, '必须拒掉邮箱：' + JSON.stringify(x))
    is(r.value, '', '拒了不给出串：' + JSON.stringify(x))
    is(/[一-龥]/.test(r.reason), true, '理由是中文：' + JSON.stringify(x))
  }
  is(S.checkEmails('a@b.com, 坏@x').bad.length, 1, '只报出问题那一个')
}

/* ---------- 5. mailto：拿 Node 的 URL 当外部裁判 ---------- */
{
  const url = S.mailtoUrl({ to: 'a@b.com,c@d.com', subject: '报价 单', body: '第一行\n第二行 & 谢谢' })
  is(url.indexOf('mailto:a@b.com,c@d.com?') === 0, true, '收件人紧跟在 mailto: 后面')
  const parsed = new URL(url)
  is(parsed.searchParams.get('subject'), '报价 单', '主题反解一致')
  is(parsed.searchParams.get('body'), '第一行\n第二行 & 谢谢', '正文反解一致')
  is(/\s/.test(url), false, '裸空格不会留在 URI 里')
  is(S.mailtoUrl({ to: 'a@b.com' }), 'mailto:a@b.com', '只有收件人时不带 ?')
  is(S.mailtoUrl({}), 'mailto:', '全空不抛')
  // 主题里塞 & 与 = 都不能多出参数来
  const sneaky = S.mailtoUrl({ to: 'a@b.com', subject: 'x&body=y=1' })
  const p2 = new URL(sneaky)
  is(p2.searchParams.get('subject'), 'x&body=y=1', '主题里的 & 被编码，不会新增参数')
  is(p2.searchParams.get('body'), null, '不会凭空多出一个 body 参数')
}

/* ---------- 6. 经纬度与地图 ---------- */
{
  is(S.coordOf(31.2304, 121.4737).ok, true, '合法坐标')
  is(S.coordOf(91, 0).ok, false, '纬度越界要拒')
  is(S.coordOf(0, 181).ok, false, '经度越界要拒')
  is(S.coordOf('x', 0).ok, false, '非数字要拒')
  is(S.coordOf('', '').ok, false, '空要拒')
  is(S.coordOf(null, null).ok, false, 'null 要拒（Number(null) 是 0，不能当成赤道本初子午线）')
  is(S.coordOf('  ', 1).ok, false, '只有空格也算没填')
  is(S.coordOf(-90, -180).ok, true, '边界值本身合法')
  is(S.coordOf(31.123456789, 121).lat, 31.123457, '保留 6 位小数')
  const g = S.geoUrl(31.2304, 121.4737, '东方明珠')
  is(/^geo:31\.2304,121\.4737\?q=31\.2304,121\.4737\(/.test(g), true, 'geo 串的形状')
  is(decodeURIComponent(g.slice(g.indexOf('(') + 1, -1)), '东方明珠', '标注名能反解')
  const evil = S.geoUrl(1, 2, '3?q=9,9')
  is((evil.match(/\?/g) || []).length, 1, '标注名里的 ? 被编码，不会多出一个查询串')
  is((evil.match(/,/g) || []).length, 2, '标注名里的逗号也被关在括号里')
  is(S.geoUrl(999, 0, 'x'), '', '非法坐标不给串')
  const w = S.mapWebUrl(31.2304, 121.4737)
  is(new URL(w).searchParams.get('mlat'), '31.2304', '网页兜底能带纬度')
  is(new URL(w).searchParams.get('mlon'), '121.4737', '网页兜底能带经度')
  is(S.mapWebUrl('x', 'y'), '', '非法坐标不给网页串')
}

/* ---------- 7. 包名与商店 ---------- */
{
  for (const p of ['com.android.settings', 'com.example.app_2', 'io.github.x.y', 'a.b']) {
    const r = S.checkPkg(p)
    is(r.ok, true, '合法包名：' + p)
    is(r.value, p, '原样返回：' + p)
  }
  for (const p of ['com', 'com.', '.com.x', '1com.x', 'com.ex-ample', 'com.exam ple', '', '   ', 'com.例子']) {
    const r = S.checkPkg(p)
    is(r.ok, false, '必须拒掉包名：' + JSON.stringify(p))
    is(/[一-龥]/.test(r.reason), true, '理由是中文：' + JSON.stringify(p))
  }
  is(S.marketUrl('com.android.settings'), 'market://details?id=com.android.settings', 'market 串')
  is(S.marketWebUrl('com.android.settings'), 'https://play.google.com/store/apps/details?id=com.android.settings', '网页商店串')
  is(new URL(S.marketWebUrl('com.a.b')).searchParams.get('id'), 'com.a.b', 'id 参数可反解')
  is(S.pkgHint().length > 10, true, '给了去哪儿找包名的提示')
}

/* ---------- 8. 协议白名单 ---------- */
{
  const allow = ['tel:13812345678', 'sms:13812345678', 'smsto:13812345678?body=x', 'mailto:a@b.com', 'geo:1,2?q=1,2', 'market://details?id=a.b', 'https://x.com/a', 'http://x.com', 'https://x']
  for (const u of allow) is(S.urlAllowed(u), true, '放行 ' + u)
  const block = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'file:///sdcard/1.txt',
    'content://com.android.contacts/data/1',
    'intent://x#Intent;scheme=tel;end',
    'data:text/html,<script>1</script>',
    'weixin://x',
    'about:blank',
    'tel',
    '',
    '没有协议的一串字',
  ]
  for (const u of block) is(S.urlAllowed(u), false, '拒绝 ' + JSON.stringify(u))
  is(S.urlAllowed(null), false, 'null 不抛')
  is(S.OPEN_SCHEMES.indexOf('javascript') === -1, true, '白名单里绝没有 javascript')
  is(S.OPEN_SCHEMES.every((s) => /^[a-z]+$/.test(s)), true, '白名单项是干净的小写协议名')
  // 走完「校验 → 拼串 → 白名单」这条链，确认自己生成的串自己一定放行
  const p = S.normalizePhone('+86 138-1234-5678')
  is(S.urlAllowed(S.telUrl(p.value)), true, 'tel 链通')
  is(S.urlAllowed(S.smsUrl(p.value, '在吗')), true, 'sms 链通')
  is(S.urlAllowed(S.mailtoUrl({ to: S.checkEmails('a@b.com').value, subject: 'x' })), true, 'mailto 链通')
  is(S.urlAllowed(S.geoUrl(31, 121, '家')), true, 'geo 链通')
  is(S.urlAllowed(S.marketUrl(S.checkPkg('com.android.settings').value)), true, 'market 链通')
  is(S.urlAllowed(''), false, '空串不放行（校验没过时拿到的是空串，交给系统那步会被挡下）')
  is(S.geoUrl(999, 0), '', '非法坐标根本拼不出串')
}

/* ---------- 9. URI 预览 ---------- */
{
  is(S.uriPreview('tel:13812345678'), 'tel:13812345678', '短的原样给')
  const long = 'a'.repeat(300)
  const p = S.uriPreview(long, 40)
  is(p.length < 60, true, '长的要截断')
  is(p.indexOf('共 300 字符') > -1, true, '标出真实长度')
  is(S.uriPreview(long).length <= 120 + 20, true, '缺省上限 120 上下')
  is(S.uriPreview(''), '', '空串不抛')
}

/* ---------- 10. 设置页表 ---------- */
{
  is(S.SETTINGS_PAGES.length >= 15, true, '至少 15 页')
  is(new Set(S.SETTINGS_PAGES.map((p) => p.key)).size, S.SETTINGS_PAGES.length, 'key 不重复')
  is(new Set(S.SETTINGS_PAGES.map((p) => p.action)).size, S.SETTINGS_PAGES.length, 'action 不重复')
  for (const p of S.SETTINGS_PAGES) {
    is(p.action.indexOf('android.settings.') === 0, true, p.name + ' 用的是公开 settings action')
    is(/^android\.settings\.[A-Z_]+$/.test(p.action), true, p.name + ' action 只含大写字母下划线：' + p.action)
    is(p.name.length > 1, true, p.key + ' 有中文名')
    is(p.desc.length > 5, true, p.key + ' 有一句说明')
  }
  is(S.settingsPage('wifi').action, 'android.settings.WIFI_SETTINGS', 'WLAN 页')
  is(S.settingsPage('nope'), null, '不认识的关键字给 null')
  noThrow(() => S.settingsPage(null), '脏入参不抛')
}

/* ---------- 11. 条目与口径 ---------- */
{
  is(S.SHORTCUT_ITEMS.length, 6, '六个唤起入口')
  is(new Set(S.SHORTCUT_ITEMS.map((i) => i.key)).size, 6, '入口 key 不重复')
  for (const i of S.SHORTCUT_ITEMS) {
    is(i.name.length > 1, true, i.key + ' 有名字')
    is(i.desc.length > 12, true, i.key + ' 讲清楚唤谁')
  }
  is(S.SHORTCUT_NOTES.length >= 4, true, '至少四条口径')
  for (const n of S.SHORTCUT_NOTES) {
    is(n.t.length > 1, true, '标题成词：' + n.t)
    is(n.d.length > 20, true, n.t + ' 正文够长')
  }
  is(new Set(S.SHORTCUT_NOTES.map((n) => n.t)).size, S.SHORTCUT_NOTES.length, '标题不重复')
  is(S.SHORTCUT_NOTES.some((n) => n.d.indexOf('javascript:') > -1), true, '明确说了协议白名单')
  is(S.SHORTCUT_NOTES.some((n) => n.t.indexOf('权限') > -1 || n.d.indexOf('权限') > -1), true, '把「只有取坐标要定位权限」写在口径里')
}

console.log('shortcut ' + (fail ? 'FAIL ' + fail : '全绿') + ' ' + ok + '/' + (ok + fail))
process.exit(fail ? 1 : 0)
