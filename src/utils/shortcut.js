/**
 * 快捷唤起的计算层：把用户填的东西校验收紧成一条 URI，再交给系统去唤起对应 App。
 *
 * 这一件工具是全站唯一会「离开本应用」的地方，所以规矩比别处严：
 *   · 号码、邮箱、包名、经纬度全部先校验后拼接，不合法的直接不生成 URI；
 *   · 交给系统的协议必须走白名单，javascript:、file:、content: 这类一律拒掉，
 *     免得有人把恶意串填进输入框，借这一页当跳板；
 *   · 唤起哪个 App、参数怎么拼，都是系统决定的，这里只能保证「递出去的串是干净的」。
 * 所有拼接都在这里做纯字符串，视图只负责把结果递给 native 层。
 */

/* ------------------------------------------------------------------ *
 *  电话与短信
 * ------------------------------------------------------------------ */

/** 号码里允许出现的字符：数字、国际前缀 +、拨号停顿 , 、子地址 ; 、# 与 * */
function phoneClean(raw) {
  return String(raw === null || raw === undefined ? '' : raw).trim().replace(/[\s\-().]/g, '')
}

/**
 * 归一化电话号码。返回 { ok, value, digits, reason }：
 * value 是拿去拼 tel:/smsto: 的串，digits 只留数字（用来数位数）。
 */
export function normalizePhone(raw) {
  const s = phoneClean(raw)
  if (!s) return { ok: false, value: '', digits: '', reason: '号码还没填' }
  const bad = s.match(/[^0-9+,;#*]/)
  if (bad) return { ok: false, value: '', digits: '', reason: '号码里有个不能用的字符「' + bad[0] + '」，只留数字和 + , ; # * 吧' }
  const pluses = (s.match(/\+/g) || []).length
  if (pluses > 1) return { ok: false, value: '', digits: '', reason: '+ 只能有一个，写在最前面表示国际号码' }
  if (pluses === 1 && s.charAt(0) !== '+') return { ok: false, value: '', digits: '', reason: '+ 只能在开头，中间出现的不算前缀' }
  if (s.length > 24) return { ok: false, value: '', digits: '', reason: '超过 24 位，不像真实号码，先核对一下' }
  const digits = s.replace(/[^0-9]/g, '')
  // 拨号盘串（含 # * ; ,）本身就可以很短，像 *#06# 查 IMEI；纯号码才要求至少 3 位
  const shortOk = /[#*;]/.test(s)
  if (digits.length < (shortOk ? 2 : 3)) return { ok: false, value: '', digits: '', reason: '有效数字太少，不敢替你拨' }
  return { ok: true, value: s, digits, reason: '' }
}

/** 这串数字看起来像什么号码——只是提示，不合法也照样能拨 */
export function phoneKind(raw) {
  const s = phoneClean(raw)
  if (/^\+861[3-9][0-9]{9}$/.test(s)) return '中国大陆手机号（国际写法）'
  if (/^1[3-9][0-9]{9}$/.test(s)) return '中国大陆手机号'
  if (/^010[0-9]{8}$/.test(s)) return '北京固定电话（带区号）'
  if (/^0[2-9][0-9]{2,3}[0-9]{7,8}$/.test(s)) return '中国大陆固定电话（带区号）'
  if (/^[19][0-9]{3,5}$/.test(s)) return '特服号或服务号'
  if (/^\+[0-9]+$/.test(s)) return '国际号码'
  if (/[;,]/.test(s)) return '含停顿或子地址，拨号盘会照办'
  if (/^[0-9]+$/.test(s)) return '没对上常见格式，能拨但先核对一下'
  return '含 # 或 *，属于拨号盘字符'
}

export function telUrl(phone) {
  return 'tel:' + phone
}

/**
 * 短信 URI。安卓上分号写法（smsto:123;body=...）不被所有 ROM 认，
 * 用 ?body= 是各家短信 App 普遍能吃下的那一种。
 */
export function smsUrl(phone, body) {
  const t = String(body || '')
  return 'smsto:' + phone + (t ? '?body=' + encodeURIComponent(t) : '')
}

/** 正文输入框的硬上限：再多就该换邮件了 */
export function smsBodyLimit(n) {
  const v = Number(n)
  if (!isFinite(v) || v <= 0) return 600
  return Math.min(600, Math.round(v))
}

/**
 * 正文会被拆成几条。用的是多条拼接时的口径（GSM-7 每段 153 字、UCS-2 每段 67 字），
 * 所以一条刚好装满的中文短信在这里也会显示成 2 段——宁可提前提醒，也不让你以为一条就发完了。
 */
export function smsParts(text) {
  const s = String(text || '')
  const ascii = /^[\x00-\x7F]*$/.test(s)
  const cap = ascii ? 153 : 67
  return { ascii, cap, chars: s.length, parts: s.length ? Math.ceil(s.length / cap) : 0 }
}

/* ------------------------------------------------------------------ *
 *  邮件
 * ------------------------------------------------------------------ */

const EMAIL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

/** 收件人框支持逗号、分号、空格和中文顿号分隔，拆成数组 */
export function emailList(raw) {
  return String(raw || '')
    .split(/[,;、\s]+/)
    .filter((x) => x.length > 0)
}

/** 逐个校验邮箱；返回 { ok, value, bad, reason }，value 是逗号拼接的干净列表 */
export function checkEmails(raw) {
  const xs = emailList(raw)
  if (!xs.length) return { ok: false, value: '', bad: [], reason: '收件人还没填' }
  const bad = xs.filter((x) => !EMAIL_RE.test(x))
  if (bad.length) {
    return { ok: false, value: '', bad, reason: '这几个不像邮箱地址：' + bad.join('、') + '（地址必须是 xxx@域名.后缀）' }
  }
  return { ok: true, value: xs.join(','), bad: [], reason: '' }
}

/** 拼 mailto:，主题与正文都编码，所以换行和中文都不会把 URI 撑坏 */
export function mailtoUrl(opts) {
  const to = (opts && opts.to) || ''
  const subject = (opts && opts.subject) || ''
  const body = (opts && opts.body) || ''
  const qs = []
  if (subject) qs.push('subject=' + encodeURIComponent(subject))
  if (body) qs.push('body=' + encodeURIComponent(body))
  return 'mailto:' + to + (qs.length ? '?' + qs.join('&') : '')
}

/* ------------------------------------------------------------------ *
 *  地图
 * ------------------------------------------------------------------ */

/** 经纬度校验并统一保留 6 位小数（约 0.1 米，够用了） */
export function coordOf(lat, lng) {
  const blank = (v) => v === null || v === undefined || String(v).trim() === ''
  if (blank(lat) || blank(lng)) return { ok: false, reason: '经纬度还没填（可以从「定位与坐标」那页复制）' }
  const a = Number(lat)
  const b = Number(lng)
  if (!isFinite(a) || !isFinite(b)) return { ok: false, reason: '经纬度得是数字（可以从「定位与坐标」那页复制）' }
  if (a < -90 || a > 90) return { ok: false, reason: '纬度只能在 -90 到 90 之间，你给的是 ' + a }
  if (b < -180 || b > 180) return { ok: false, reason: '经度只能在 -180 到 180 之间，你给的是 ' + b }
  const r6 = (v) => Math.round(v * 1e6) / 1e6
  return { ok: true, lat: r6(a), lng: r6(b) }
}

/** 安卓 geo: URI，带 q 才会直接落点，而不是只把地图甩到那个坐标 */
export function geoUrl(lat, lng, label) {
  const c = coordOf(lat, lng)
  if (!c.ok) return ''
  const t = String(label || '').trim()
  return 'geo:' + c.lat + ',' + c.lng + '?q=' + c.lat + ',' + c.lng + (t ? '(' + encodeURIComponent(t) + ')' : '')
}

/** 装了地图 App 就走 geo:，没装就只能开网页，所以给一个不依赖厂商的兜底 */
export function mapWebUrl(lat, lng) {
  const c = coordOf(lat, lng)
  if (!c.ok) return ''
  return 'https://www.openstreetmap.org/?mlat=' + c.lat + '&mlon=' + c.lng
}

/* ------------------------------------------------------------------ *
 *  应用商店
 * ------------------------------------------------------------------ */

const PKG_RE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/

export function checkPkg(raw) {
  const s = String(raw || '').trim()
  if (!s) return { ok: false, value: '', reason: '包名还没填' }
  if (!PKG_RE.test(s)) return { ok: false, value: '', reason: '包名是 com.公司.应用 这种点分段写法，每段以字母开头，只能有字母数字和下划线' }
  if (s.length > 200) return { ok: false, value: '', reason: '包名长得不像话（超过 200 字符）' }
  return { ok: true, value: s, reason: '' }
}

export function marketUrl(pkg) {
  return 'market://details?id=' + encodeURIComponent(pkg)
}

export function marketWebUrl(pkg) {
  return 'https://play.google.com/store/apps/details?id=' + encodeURIComponent(pkg)
}

/** 从「当前应用」那条系统信息里取包名的友好提示 */
export function pkgHint() {
  return '包名在「设置 → 应用 → 该应用」里能看到，也可以用本页的「读本应用包名」直接取'
}

/* ------------------------------------------------------------------ *
 *  协议白名单：递出去之前最后一道闸
 * ------------------------------------------------------------------ */

export const OPEN_SCHEMES = ['tel', 'sms', 'smsto', 'mailto', 'geo', 'market', 'https', 'http']

/** 只放行这几种协议：这一页能把 URI 交给系统，绝不能成为 javascript: 的跳板 */
export function urlAllowed(url) {
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(String(url || ''))
  if (!m) return false
  return OPEN_SCHEMES.indexOf(m[1].toLowerCase()) > -1
}

/** 上屏给人看的 URI：太长就截断，但要看得出真实结构 */
export function uriPreview(url, cap) {
  const s = String(url || '')
  const n = Number(cap) > 0 ? Number(cap) : 120
  return s.length <= n ? s : s.slice(0, n) + '…（共 ' + s.length + ' 字符）'
}

/* ------------------------------------------------------------------ *
 *  系统设置页（安卓 settings action 常量表）
 * ------------------------------------------------------------------ */

/**
 * 只列安卓官方文档里稳定存在的那批 action；不同 ROM 会少几个，
 * 打不开时由 native 层回一句中文，不崩。
 */
export const SETTINGS_PAGES = [
  { key: 'root', name: '设置首页', action: 'android.settings.SETTINGS', desc: '找不到对应的入口就先回这里' },
  { key: 'wifi', name: 'WLAN', action: 'android.settings.WIFI_SETTINGS', desc: '看已存网络、改 IP、看 MAC' },
  { key: 'net', name: '移动网络', action: 'android.settings.DATA_ROAMING_SETTINGS', desc: 'SIM 卡与流量入口' },
  { key: 'bt', name: '蓝牙', action: 'android.settings.BLUETOOTH_SETTINGS', desc: '配对列表，验机时看能不能扫到设备' },
  { key: 'loc', name: '位置', action: 'android.settings.LOCATION_SETTINGS', desc: '定位总开关与本应用授权' },
  { key: 'app', name: '应用管理', action: 'android.settings.APPLICATION_SETTINGS', desc: '清数据、管权限都从这儿进' },
  { key: 'notif', name: '通知', action: 'android.settings.NOTIFICATION_SETTINGS', desc: '通知总开关与渠道' },
  { key: 'disp', name: '显示', action: 'android.settings.DISPLAY_SETTINGS', desc: '亮度、字号、深色模式' },
  { key: 'sound', name: '声音', action: 'android.settings.SOUND_SETTINGS', desc: '媒体与铃声音量、勿扰' },
  { key: 'bat', name: '电池优化', action: 'android.settings.BATTERY_OPTIMIZATION_SETTINGS', desc: '被后台杀掉先来看这一页' },
  { key: 'store', name: '存储', action: 'android.settings.INTERNAL_STORAGE_SETTINGS', desc: '内部空间占用' },
  { key: 'dev', name: '开发者选项', action: 'android.settings.APPLICATION_DEVELOPMENT_SETTINGS', desc: 'USB 调试在这里打开' },
  { key: 'access', name: '无障碍', action: 'android.settings.ACCESSIBILITY_SETTINGS', desc: '读屏与无障碍服务' },
  { key: 'lang', name: '语言与区域', action: 'android.settings.LOCALE_SETTINGS', desc: '系统语言、地区（影响日期与数字格式）' },
  { key: 'date', name: '日期与时间', action: 'android.settings.DATE_SETTINGS', desc: '时区与 24 小时制' },
  { key: 'sec', name: '安全', action: 'android.settings.SECURITY_SETTINGS', desc: '锁屏、屏幕锁定与设备管理器' },
  { key: 'zen', name: '勿扰', action: 'android.settings.ZEN_MODE_SETTINGS', desc: 'API 28 起才有这一页' },
  { key: 'voice', name: '语音输入', action: 'android.settings.VOICE_INPUT_SETTINGS', desc: '默认输入法与语音服务' },
  { key: 'about', name: '关于手机', action: 'android.settings.DEVICE_INFO_SETTINGS', desc: '型号、序列号、版本号（API 26 起）' },
]

export function settingsPage(key) {
  return SETTINGS_PAGES.find((p) => p.key === key) || null
}

/** 哪些入口需要 plus 原生运行时才能唤起（拨号走 uni，不需要 plus） */
export const SHORTCUT_ITEMS = [
  { key: 'tel', name: '拨号', desc: '调起系统拨号盘，不自动外呼；填的是号码，按下去由你自己确认' },
  { key: 'sms', name: '短信', desc: '把号码和预填正文交给系统短信 App，收件人要你手点发送' },
  { key: 'mail', name: '邮件', desc: '拼成 mailto: 交给默认邮箱 App，支持抄送、主题和正文' },
  { key: 'map', name: '地图', desc: '用 geo: URI 落点，装了哪个地图 App 由系统选；没有就用网页兜底' },
  { key: 'market', name: '应用商店', desc: '按包名打开详情页，market:// 由系统路由到本机商店' },
  { key: 'settings', name: '系统设置', desc: '直接跳到某一页设置，验机、清数据、开 USB 调试少绕两步' },
]

export const SHORTCUT_NOTES = [
  { t: '这一页会离开本应用', d: '其余工具全在本机算完，这一件是把 URI 交给系统去唤起别的 App。唤起之后发生的事（拨出去、发出去）都由你在对方界面里确认，本应用不会替你发送。' },
  { t: '为什么要先校验', d: '号码、邮箱、包名、经纬度都会拼进 URI 里，所以先把不合法的挡下来，再用协议白名单卡一道：只放行 tel/sms/mailto/geo/market/http(s)，javascript: 与 file: 一律拒绝。' },
  { t: '点了没反应', d: '多半是系统里没有一个 App 认领这个协议：没装邮箱客户端时 mailto: 就是静默失败；模拟器上 market:// 也常常没人接。换一台装了相应 App 的机器再试。' },
  { t: '设置页因 ROM 而异', d: '这些跳转用的是安卓公开的 settings action，原生安卓全都有，深度定制的 ROM 会藏掉其中几页。打不开会写一行中文说明，其余入口照常。' },
  { t: '只有取坐标要权限', d: '拨号、短信、邮件、地图、商店、设置页都只是把 URI 交给系统，这条链路本身不需要权限。唯独地图那一项的「取当前位置」会读一次系统定位，用的是精确定位与粗略位置两项危险权限，弹窗授权、拒绝也能手输，坐标只在页面上显示，不上传。' },
  { t: '短信正文的写法', d: '预填正文用 ?body= 拼接，各家短信 App 都吃这一套；用分号的老写法在部分机型上会被当成号码的一部分。正文长度按多条拼接的口径提醒：含中文每段 67 字、纯英文数字每段 153 字。' },
]
