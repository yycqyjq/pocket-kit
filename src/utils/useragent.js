/**
 * User-Agent 解析与生成
 * ------------------------------------------------------------
 * 完全本地规则解析：拆片段 → 认产品令牌 → 认平台注释 → 认设备型号 → 认爬虫。
 * 不引任何第三方库（uap-parser 之类），规则表按各家 UA 规范与真实样本手写。
 * 纯函数：不碰 uni、不碰 DOM（真机 UA 由视图层取，见 ToolUseragent.vue）。
 */

/* ---------------- 规则表 ---------------- */

/** 浏览器识别规则：自上而下，先命中者赢（Edge/Opera 的 UA 里也含 Chrome，必须排在前面） */
const BROWSER_RULES = [
  { re: /\b(SamsungBrowser)\/([0-9][0-9.]*)/i, name: 'Samsung Internet', token: 'SamsungBrowser', vendor: '三星' },
  { re: /\b(Quark)\/([0-9][0-9.]*)/i, name: '夸克浏览器', token: 'Quark', vendor: '阿里' },
  { re: /\b(UWSEngine|UBrowser|UCBrowser|U3W3|UCWEB)\/([0-9][0-9.]*)/i, name: 'UC 浏览器', token: 'UCBrowser', vendor: 'UC（阿里）' },
  { re: /\b(QQBrowser|QQ)\/([0-9][0-9.]*)/i, name: 'QQ 浏览器', token: 'QQBrowser', vendor: '腾讯' },
  { re: /\b(MiuiBrowser|XiaoMi\/MiuiBrowser)\/([0-9][0-9.]*)/i, name: '小米浏览器', token: 'MiuiBrowser', vendor: '小米' },
  { re: /\b(VivoBrowser)\/([0-9][0-9.]*)/i, name: 'vivo 浏览器', token: 'VivoBrowser', vendor: 'vivo' },
  { re: /\b(HuaweiBrowser|MBB)\/([0-9][0-9.]*)/i, name: '华为浏览器', token: 'HuaweiBrowser', vendor: '华为' },
  { re: /\b(MicroMessenger|WeChat)\/([0-9][0-9.]*)/i, name: '微信内置浏览器', token: 'MicroMessenger', vendor: '腾讯', note: '内嵌 WebView：内核还是系统的，JSAPI 只在微信里可用' },
  { re: /\b(Weibo|WeiboIntl)\/([0-9][0-9.]*)/i, name: '微博内置浏览器', token: 'Weibo', vendor: '新浪' },
  { re: /\b(AlipayClient)\/([0-9][0-9.]*)/i, name: '支付宝内置浏览器', token: 'AlipayClient', vendor: '阿里' },
  { re: /\b(DingTalk|AliApp\(DingTalk)\/?([0-9][0-9.]*)?/i, name: '钉钉内置浏览器', token: 'DingTalk', vendor: '阿里' },
  { re: /\b(aweme|BytedanceWebview|TTWebView|Douyin|Lark)\/?([0-9][0-9.]*)?/i, name: '字节系内置浏览器', token: 'aweme', vendor: '字节跳动' },
  { re: /\bQQ\/([0-9][0-9.]*)/i, name: 'QQ 客户端', token: 'QQ', vendor: '腾讯', note: '不是 QQBrowser：这是 QQ 主程序里开链接的那个 WebView' },
  { re: /\b(EdgA|EdgiOS|EdgIOS|EdgWSE|EdgWebView|Edg)\/([0-9][0-9.]*)/i, name: 'Microsoft Edge', token: 'Edg', note: 'Chromium 内核版（U4 手机版叫 EdgA，iOS 版叫 EdgiOS）' },
  { re: /\b(Edge)\/([0-9][0-9.]*)/i, name: 'Microsoft Edge（旧）', token: 'Edge', note: 'EdgeHTML 内核，Windows Phone 与 Win10 早期版本' },
  { re: /\b(OPiOS|OPT)\/([0-9][0-9.]*)/i, name: 'Opera Mini', token: 'OPiOS', vendor: 'Opera' },
  { re: /\b(OPR|Opera)\/?([0-9][0-9.]*)/i, name: 'Opera', token: 'OPR', vendor: 'Opera' },
  { re: /\b(FxiOS|Firefox)\/([0-9][0-9.]*)/i, name: 'Firefox', token: 'Firefox', note: 'iOS 上的 FxiOS 只能借 WebKit，功能比桌面版少' },
  { re: /\b(CriOS|FxiOS|EdgiOS)\/([0-9][0-9.]*)/i, name: 'Chrome（iOS）', token: 'CriOS' },
  { re: /\b(Coc Coc)\/([0-9][0-9.]*)/i, name: 'Cốc Cốc', token: 'Coc Coc' },
  { re: /\b(Silk)\/([0-9][0-9.]*)/i, name: 'Amazon Silk', token: 'Silk', vendor: '亚马逊' },
  { re: /\b(Electron)\/([0-9][0-9.]*)/i, name: 'Electron 应用', token: 'Electron', note: '套壳桌面应用，通常还会带自己的名字与版本' },
  { re: /\b(HeadlessChrome)\/([0-9][0-9.]*)/i, name: '无头 Chrome', token: 'HeadlessChrome', note: '自动化/抓取用，正常人访问不会看到' },
  { re: /\b(Chrome|CrMo|CriOS)\/([0-9][0-9.]*)/i, name: 'Chrome', token: 'Chrome' },
  { re: /\b(Chromium)\/([0-9][0-9.]*)/i, name: 'Chromium', token: 'Chromium' },
  { re: /\b(Version)\/([0-9][0-9.]*)/i, name: 'Safari', token: 'Version', note: 'Version/x 是 Safari 的「真版本」令牌，iOS 版式里它和 Safari/ 之间还夹着 Mobile/15E148' },
  { re: /\b(Safari)\/([0-9][0-9.]*)/i, name: 'Safari', token: 'Safari', note: '只有 Safari/xxx 而没有 Chrome 令牌时才是真的 Safari' },
  { re: /\b(MSIE\s?[0-9.]+|Trident\/([0-9.]+))/i, name: 'Internet Explorer', token: 'MSIE', note: 'IE 11 只写 Trident/7.0，不再写 MSIE' },
]

/** 内核识别规则 */
const ENGINE_RULES = [
  { re: /\bEdgA?\/|EdgiOS\//i, name: 'Blink（Edge Chromium）', from: 'Edg/' },
  { re: /\bEdge\/([0-9.]+)/i, name: 'EdgeHTML', from: 'Edge/', ver: 1 },
  { re: /\bPresto\/([0-9.]+)/i, name: 'Presto', from: 'Presto/', ver: 1 },
  { re: /\bTrident\/([0-9.]+)/i, name: 'MSHTML（Trident）', from: 'Trident/', ver: 1 },
  { re: /\bGecko\/([0-9]+)/i, name: 'Gecko', from: 'Gecko/', ver: 1 },
  { re: /\bU3W3|UBrowser|UCBrowser/i, name: 'U4（国内魔改版）', from: 'UCBrowser/' },
  { re: /\bSamsungBrowser|OPR|OPT|Quark|VivoBrowser|MiuiBrowser|QQBrowser|Silk|Electron|Chrome|CrMo|CriOS|HeadlessChrome/i, name: 'Blink', from: 'Chrome/ 等 Chromium 系令牌' },
  { re: /\bAppleWebKit\/([0-9.]+)/i, name: 'WebKit', from: 'AppleWebKit/', ver: 1 },
]

/** 平台（操作系统）规则：只看括号里的平台注释，自上而下 */
const OS_RULES = [
  { re: /\bWindows NT 10\.0\b/i, name: 'Windows 10 / 11', ver: null, note: '微软从 Win10 起一直写 NT 10.0，Win11 也是，UA 分不出这两代' },
  { re: /\bWindows NT 6\.3\b/i, name: 'Windows 8.1', ver: null },
  { re: /\bWindows NT 6\.2\b/i, name: 'Windows 8', ver: null },
  { re: /\bWindows NT 6\.1\b/i, name: 'Windows 7', ver: null },
  { re: /\bWindows NT 6\.0\b/i, name: 'Windows Vista', ver: null },
  { re: /\bWindows NT 5\.1\b/i, name: 'Windows XP', ver: null },
  { re: /\bWindows Phone(?: OS)?\s*([0-9.]+)?/i, name: 'Windows Phone', ver: 1 },
  { re: /\bXBLWP7\b/i, name: 'Windows Phone 7', ver: null },
  { re: /\bAndroid\s*([0-9][0-9._]*)?/i, name: 'Android', ver: 1 },
  { re: /\bHarmonyOS|OpenHarmony|HMSCore/i, name: 'HarmonyOS', ver: null, note: '鸿蒙设备大量沿用 Android UA，常同时带 HMSCore 令牌' },
  { re: /\bCPU (?:iPhone )?OS ([0-9_]+)/i, name: 'iOS', ver: 1 },
  { re: /\biPhone|iPad|iPod/i, name: 'iOS / iPadOS', ver: null, note: '新版 iPadOS 默认伪装成 macOS 的桌面 UA，只能靠「Max Touch Points」等旁证区分' },
  { re: /\bMac OS X ([0-9_.]+)/i, name: 'macOS', ver: 1 },
  { re: /\bMacintosh|Mac_PowerPC/i, name: 'macOS', ver: null },
  { re: /\bCrOS\b/i, name: 'ChromeOS', ver: null },
  { re: /\b(KaiaOS|KaiOS)\/?([0-9.]+)?/i, name: 'KaiOS', ver: 2 },
  { re: /\bTizen\/?([0-9.]+)?/i, name: 'Tizen（三星电视/手表）', ver: 1 },
  { re: /\bWeb0S|WebOS/i, name: 'webOS', ver: null },
  { re: /\b(Linux [a-z0-9_+-]*|X11|i686|x86_64|aarch64)\b/i, name: 'Linux', ver: null },
  { re: /\b(BlackBerry|BB10|PlayBook)/i, name: 'BlackBerry', ver: null },
  { re: /\b(JIO|Series40|Nokia|Symbian|Maemo|Meego)/i, name: '功能机 / 老智能机', ver: null },
]

/** 机型前缀 → 厂商（纯启发，Android UA 的型号字段各家没有统一规矩） */
const VENDOR_RULES = [
  { re: /^(SM|GT|SGH|SCH|SPH|GH[0-9])/i, vendor: '三星', tip: 'SM-/GT- 开头是三星机型，第二位常表示系列（S 旗舰、A 中端）' },
  { re: /^(Pixel|Nexus|Android SDK)/i, vendor: 'Google', tip: 'Pixel / Nexus 系列' },
  { re: /^(MI\s|MIX|Redmi|M2[0-9]{3}|2[0-5][0-9][0-9]|Mi)/i, vendor: '小米', tip: 'Mi/MIX/Redmi 以及「M2101」这类内部代号' },
  { re: /^(HUAWEI|ELS|ANA|NOH|JER|OCE|ART|CDY|KOZ|HBN|MGA|LIO|TAS)/i, vendor: '华为', tip: '华为常用三字母系列代号，如 ELS = Mate 30 系列' },
  { re: /^(HEY|AMG|ANY|TEL|BMH|AGT|BNE|LGE|KOZ-A|DNN|MTN)/i, vendor: '荣耀', tip: '荣耀独立后机型代号继续在华为的表里' },
  { re: /^(V2[0-9]{3}|PD[0-9]{4}|IQ[0-9]{4}|HLTE|X67)/i, vendor: 'vivo', tip: 'V2xxx / PDxxxx / IQxxxx' },
  { re: /^(PBBT|PEGT|PFUM|PDYM|PKM|CPH[0-9]{4}|PBAM|PDBM)/i, vendor: 'OPPO', tip: 'CPHxxxx 是海外代号，PDYM/PKM 是国内' },
  { re: /^(RMX[0-9]{4})/i, vendor: 'realme', tip: 'RMX 开头' },
  { re: /^(OnePlus|HD[0-9]{4}|LE[0-9]{4}|IN[0-9]{4}|KB[0-9]{4}|GM[0-9]{4}|MT[0-9]{4}|NE[0-9]{4})/i, vendor: '一加', tip: 'HD/LE/IN/KB/GM/MT/NE + 四位数字' },
  { re: /^(ASUS|ZS[0-9]{4}|AI\d)/i, vendor: '华硕', tip: 'ASUS / ZSxxxx' },
  { re: /^(Motorola|XT[0-9]{4}|MZ\d)/i, vendor: '摩托罗拉', tip: 'XTxxxx' },
  { re: /^(LG-|LGHAN|LM-[0-9]|US[0-9]{4}|L-)/i, vendor: 'LG', tip: 'LG-/LM-xxxx' },
  { re: /^(Meizu|MZ\d{4})/i, vendor: '魅族', tip: 'MZ 开头' },
  { re: /^(Lenovo|TB[0-9]{3,4}|L[0-9]{3}|YT[0-9]{4})/i, vendor: '联想', tip: 'TBxxxx 多是平板' },
  { re: /^(SONY|XQ-[0-9]{4}|E5[0-9]{3})/i, vendor: '索尼', tip: 'XQ-xxxx 是 Xperia 1/5 世代' },
  { re: /^(Nintendo|Nitendo)/i, vendor: '任天堂', tip: 'Switch 浏览器' },
  { re: /^(Apple|iPhone|iPad|iPod|Mac)/i, vendor: 'Apple', tip: '苹果的机型名（iPhone / iPad / Mac）直接写在 UA 里' },
]

/** 爬虫与脚本客户端：令牌 → 归属 */
const BOT_RULES = [
  { re: /\bGooglebot\b/i, who: 'Google 搜索爬虫' },
  { re: /\bLighthouse\b/i, who: 'Google Lighthouse 性能检测' },
  { re: /\bBingbot\b|\bBingPreview\b|\bmsnbot\b/i, who: '微软必应爬虫' },
  { re: /\bDuckDuckBot\b/i, who: 'DuckDuckGo 爬虫' },
  { re: /\bBaiduspider\b|\bBaiduImagePreview\b/i, who: '百度爬虫' },
  { re: /\bSogou web spider\b|\bSogouInstiction\b/i, who: '搜狗爬虫' },
  { re: /\b360Spider\b|\bHaousoSeller/i, who: '360 爬虫' },
  { re: /\bYandexBot\b|\bYandexImages\b/i, who: 'Yandex 爬虫' },
  { re: /\bApplebot\b/i, who: '苹果 Siri/Spotlight 爬虫' },
  { re: /\bSlurp\b/i, who: '雅虎爬虫' },
  { re: /\bPetalBot\b|\bAspiegel\b/i, who: '华为花瓣搜索爬虫' },
  { re: /\bGPTBot\b|\bOAI-SearchBot\b|\bChatGPT-User\b|\btext-embedding\b/i, who: 'OpenAI（训练/搜索/用户代理）' },
  { re: /\bClaudeBot\b|\bclaude-ai\b|\bClaude-Web\b/i, who: 'Anthropic Claude' },
  { re: /\bBytespider\b/i, who: '字节跳动爬虫' },
  { re: /\b(?:ccbot|CCBot)\b/, who: 'Common Crawl 语料抓取' },
  { re: /\bPerplexityBot\b|\bPerplexityUser\b/i, who: 'Perplexity' },
  { re: /\bmeta-externalagent\b|\bFacebookExternalHit\b|\bfacebot\b/i, who: 'Meta（抓取链接预览）' },
  { re: /\bTwitterbot\b|\bTwitterAndroid/i, who: 'X/Twitter 链接预览' },
  { re: /\bLinkedInBot\b/i, who: 'LinkedIn 链接预览' },
  { re: /\bTelegramBot\b|\bTelegram/i, who: 'Telegram 链接预览' },
  { re: /\bSlackbot[\d.-]*/i, who: 'Slack 链接预览' },
  { re: /\bDiscordbot\b/i, who: 'Discord 链接预览' },
  { re: /\bWhatsApp\/|whatsapp/i, who: 'WhatsApp 链接预览' },
  { re: /\bWget\b/i, who: 'wget 命令行下载' },
  { re: /\bcurl\//i, who: 'curl 命令行' },
  { re: /\bpython-requests\b|\bPython-urllib\b/i, who: 'Python 脚本' },
  { re: /\bGo-http-client\b/i, who: 'Go 标准库 http.Client' },
  { re: /\bokhttp\b/i, who: 'okhttp（Android/Java 网络库）' },
  { re: /\bJava\/|\bJakarta\b|Apache-HttpClient/i, who: 'Java 程序' },
  { re: /\bPostmanRuntime\b/i, who: 'Postman 调试请求' },
  { re: /\binsomnia\//i, who: 'Insomnia 调试请求' },
  { re: /\blibwww-perl\b/i, who: 'Perl LWP 脚本' },
  { re: /\bnutch\b/i, who: 'Nutch 开源爬虫' },
  { re: /\bAhrefsBot\b/i, who: 'Ahrefs SEO 抓取' },
  { re: /\bSemrushBot\b/i, who: 'Semrush SEO 抓取' },
  { re: /\bMJ12bot\b/i, who: 'Majestic SEO 抓取' },
  { re: /\bDotBot\b/i, who: 'Moz 抓取' },
  { re: /\bHeadlessChrome\b|\bPhantomJS\b|\bPuppeteer\b|\bSelenium\b|\bElectron\b.*Headless/i, who: '无头浏览器 / 自动化框架' },
  { re: /\bbot\b|\bspider\b|\bcrawler\b|\bfetch\b|\bscraper\b/i, who: '带 bot/spider 字样的爬虫' },
]

/** 片段注解：把 UA 按空格与括号切开，逐段说明它凭什么存在 */
const SEGMENT_NOTES = [
  { re: /^Mozilla\/5\.0$/i, note: '兼容占位：从 Netscape 时代留下的假身份，现代浏览器一律写 5.0，本身不含任何真实信息' },
  { re: /^\(?KHTML,? ?like ?Gecko\)?$/i, note: '历史包袱：告诉老站点「我和 Gecko 一样能渲染」，KDE 的 KHTML 分支遗留' },
  { re: /^AppleWebKit\/[0-9.]+$/i, note: 'Chromium 系实际内核是 Blink（Chrome 28 起从 WebKit 分叉），这里仍写 AppleWebKit 只为兼容老站点' },
  { re: /^Safari\/[0-9.]+$/i, note: 'Chromium 系里的 Safari 令牌同样是兼容占位；它的数字是 WebKit 构建号，不是 Safari 版本' },
  { re: /^Chrome\/99\.0\.0\.0$/i, note: 'Chrome 桌面版冻结在 99.0.0.0 的旧写法（部分场景），新版本要看 UA Client Hints' },
  { re: /^\(?.*Windows NT.*\)?$/i, note: '平台注释：Windows 版本号写在这里，64 位再补 Win64; x64' },
  { re: /^Gecko\/[0-9]+$/i, note: 'Gecko 引擎标记，Firefox 桌面版常用它替代 AppleWebKit 那一段' },
  { re: /^\(?rv:[0-9.]+\)?$/i, note: 'Gecko 版本兼容位，Firefox 58 之后已统一写成 rv:1.0 不再反映真实版本' },
  { re: /^\(?Mobile\)?$/i, note: 'Mobile 标记：手机版；平板一般不带（iPad 例外）' },
  { re: /^\(?.*Android [0-9][0-9._]*.*\)?$/i, note: '平台注释：Android 版本 + 机型名，机型名可用来猜厂商' },
  { re: /^\(?Build\/.*\)?$/i, note: 'Build 号：厂商固件构建标识，同一机型不同系统版本会变' },
  { re: /^\(?CPU (?:iPhone )?OS .*$/i, note: 'iOS 平台注释，下划线是版本号的点' },
  { re: /^\(?Mac OS X .*$/i, note: 'macOS 平台注释，下划线同样是版本号的点' },
  { re: /^\(?X11.*$/i, note: 'X11 前缀是 Unix 桌面遗留写法，Linux 桌面浏览器都带' },
  { re: /^\(?Linux; (?:U; )?$/i, note: 'Android/桌面 Linux 的占位前缀，后面常跟机型或发行版信息' },
]

/* ---------------- 解析实现 ---------------- */

/** 取括号里的平台注释（可能有多层，按第一层切） */
function extractComments(ua) {
  const out = []
  let depth = 0
  let start = -1
  for (let i = 0; i < ua.length; i++) {
    const c = ua.charAt(i)
    if (c === '(') {
      if (depth === 0) start = i + 1
      depth++
    } else if (c === ')') {
      depth--
      if (depth === 0 && start > 0) {
        out.push({ text: ua.slice(start, i), index: start })
        start = -1
      } else if (depth < 0) depth = 0
    }
  }
  return out
}

/** 取全部「名字/版本」令牌 */
function extractProducts(ua) {
  const out = []
  const re = /([A-Za-z][A-Za-z0-9 ._-]*?)\/([0-9][0-9a-zA-Z._-]*)/g
  let m
  while ((m = re.exec(ua)) !== null) {
    out.push({ token: m[1].trim(), version: m[2], index: m.index })
    if (out.length > 60) break
  }
  return out
}

function cleanVer(v) {
  if (!v) return ''
  return String(v).replace(/_/g, '.').replace(/\.+$/, '')
}

function detectBrowser(ua, products) {
  for (let i = 0; i < BROWSER_RULES.length; i++) {
    const r = BROWSER_RULES[i]
    const m = r.re.exec(ua)
    if (!m) continue
    let version = cleanVer(m[2] || '')
    const found = { name: r.name, version, token: r.token, vendor: r.vendor || '', note: r.note || '' }
    if (r.token === 'Version') {
      const v = products.filter((p) => p.token === 'Version')[0]
      found.version = v ? cleanVer(v.version) : version
    }
    if (r.token === 'MSIE') {
      const msie = /MSIE\s?([0-9.]+)/i.exec(ua)
      const rv = /rv:([0-9.]+)/i.exec(ua)
      const trident = /Trident\/([0-9.]+)/i.exec(ua)
      found.version = msie ? cleanVer(msie[1]) : rv ? cleanVer(rv[1]) : trident ? cleanVer(String(4 + parseFloat(trident[1]))) : ''
      found.name = 'Internet Explorer ' + (found.version ? found.version.replace(/\..*$/, '') : '?')
    }
    if (r.token === 'Chrome' && /\bwv\b/.test(ua)) found.note = (found.note ? found.note + '；' : '') + '带 wv 标记，是 App 内嵌的 Android WebView 而不是 Chrome 本身'
    return found
  }
  return { name: '未识别', version: '', token: '', vendor: '', note: '没有任何已知浏览器令牌，可能是自定义客户端或被改写过的 UA' }
}

function detectEngine(ua, products, browser) {
  for (let i = 0; i < ENGINE_RULES.length; i++) {
    const r = ENGINE_RULES[i]
    const m = r.re.exec(ua)
    if (!m) continue
    let version = r.ver ? cleanVer(m[r.ver]) : ''
    if (r.name === 'Blink' || /Chromium 系/.test(r.from)) {
      const c = products.filter((p) => p.token === 'Chrome' || p.token === 'HeadlessChrome')[0]
      const sdk = /Android SDK|GoogleTV/.test(ua)
      version = c ? cleanVer(c.version) : ''
      return { name: 'Blink', version, from: r.from, note: 'Blink 是 WebKit 的分支，版本号跟随 Chrome（' + (sdk ? 'Android 模拟器' : 'Chromium 系') + '）' }
    }
    if (r.name === 'Gecko') {
      const rv = /rv:([0-9.]+)/i.exec(ua)
      return { name: 'Gecko', version: rv ? cleanVer(rv[1]) : version, from: r.from, note: 'Firefox 系；rv: 才是引擎版本，Gecko/ 后面的数字是日期式旧写法' }
    }
    if (r.name === 'WebKit') {
      const aw = /AppleWebKit\/([0-9.]+)/i.exec(ua)
      return { name: 'WebKit', version: aw ? cleanVer(aw[1]) : version, from: r.from, note: browser && /Safari/.test(browser.name) ? '真正的 WebKit：Safari 系浏览器' : '只剩 AppleWebKit 令牌的兼容写法' }
    }
    return { name: r.name, version, from: r.from, note: r.note || '' }
  }
  return { name: '未识别', version: '', from: '', note: '没有 AppleWebKit / Gecko / Trident 之类内核令牌' }
}

function detectOS(ua, comments) {
  const hay = comments.length ? comments.map((c) => c.text).join('; ') : ua
  for (let i = 0; i < OS_RULES.length; i++) {
    const r = OS_RULES[i]
    const m = r.re.exec(hay)
    if (!m) continue
    let version = r.ver ? cleanVer(m[r.ver]) : ''
    if (version && /iOS|macOS/.test(r.name)) version = version.replace(/\.$/, '')
    return { name: r.name, version, from: m[0], note: r.note || '' }
  }
  return { name: '未识别', version: '', from: '', note: '括号里的平台注释缺失或被抹掉（有些客户端只写 Mozilla/5.0）' }
}

/** 平台注释里不是机型的杂项：系统名、语言标签、占位符、爬虫的说明链接 */
const MODEL_NOISE = /^(linux|u|wv|mobile|tablet|desktop|compatible|like|gecko|android[\s0-9._]*|build\/.*|[a-z]{2}(-[a-z]{2,4})?(-r[a-z]{2})?|[a-z]{3}-[a-z]{4}-[a-z]{2})$/i

/** 从平台注释的分号分段里挑出最像机型的字段 */
function pickModel(plat) {
  const parts = String(plat).split(';').map((x) => x.trim()).filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i].replace(/\s+Build\/.*$/i, '').trim()
    if (!p || MODEL_NOISE.test(p)) continue
    /* 机型由字母数字与 - . 空格组成；带斜杠、冒号的（说明链接之类）不是 */
    if (!/^[A-Za-z0-9][A-Za-z0-9._+ -]*$/.test(p) || /[:/]/.test(p)) continue
    if (!/[0-9A-Za-z]/.test(p)) continue
    return p
  }
  return ''
}

/** 设备形态 + 厂商 + 机型 */
function detectDevice(ua, comments, os) {
  const plat = comments.length ? comments[0].text : ''
  let model = pickModel(plat)
  if (/iPhone/i.test(plat)) model = 'iPhone'
  else if (/iPad/i.test(plat)) model = 'iPad'
  else if (/iPod/i.test(plat)) model = 'iPod touch'
  else if (/Macintosh/i.test(plat)) model = /Intel Mac OS X/.test(plat) ? 'Mac (Intel/Apple Silicon)' : 'Mac'
  else if (/Windows NT/i.test(plat)) model = 'PC'
  else if (/CrOS/i.test(plat)) model = 'Chromebook'
  else if (/X11|Linux/i.test(plat) && !/Android/i.test(plat)) model = 'PC'
  if (/^K$/i.test(model)) model = 'K'

  let kind = 'desktop'
  if (/SmartTV|SMART-TV|Tizen|HbbTV|BRAVIA|BrightSign|GoogleTV|Apple ?TV|PhilipsTV|Hisense|VsmartTV|AFTM|AFT[0-9]|DIAL\b/i.test(ua)) kind = 'tv'
  else if (/CarPlay|AndroidAuto|automotive|INCAR|DACT/i.test(ua)) kind = 'car'
  else if (/Watch|WearOS|watchOS|Gear S|REACH-\//i.test(ua)) kind = 'watch'
  else if (/Android/i.test(plat)) kind = /\bMobile\b/i.test(ua) ? 'mobile' : 'tablet'
  else if (/iPhone|iPod|Windows Phone|BlackBerry|BB10|PlayBook|KaiOS|Series40|Symbian|Maemo|Midp|CLDC/i.test(ua)) kind = 'mobile'
  else if (/iPad/i.test(ua)) kind = 'tablet'
  else if (/\bMobile\b/i.test(ua) && !/Windows NT/i.test(ua)) kind = 'mobile'
  else if (/Electron|PostmanRuntime|python-requests|curl\/|okhttp|Java\/|Go-http-client|Wget|libwww-perl|Node\.js/i.test(ua) && !/\b(AppleWebKit|Gecko|Trident)\b/i.test(ua)) kind = 'app'
  const KIND = { desktop: '桌面 / 笔记本', mobile: '手机', tablet: '平板', tv: '电视 / 大屏', car: '车机', watch: '手表 / 穿戴', app: '应用或脚本客户端' }
  let vendor = ''
  let tip = ''
  for (let i = 0; i < VENDOR_RULES.length; i++) {
    if (VENDOR_RULES[i].re.test(model)) {
      vendor = VENDOR_RULES[i].vendor
      tip = VENDOR_RULES[i].tip
      break
    }
  }
  return {
    kind,
    kindName: KIND[kind],
    model,
    modelNote: model === 'K' ? 'Android 12 起部分客户端把机型统一抹成 K，机型信息已经拿不到了' : '',
    vendor,
    vendorTip: tip,
    hint: /HarmonyOS|HMSCore/i.test(ua) ? '带 HMSCore / HarmonyOS 令牌，可能是鸿蒙设备' : /\bwv\b/.test(ua) ? '带 wv 标记：App 内嵌 WebView，不是独立浏览器' : '',
  }
}

function detectBot(ua) {
  for (let i = 0; i < BOT_RULES.length; i++) {
    const m = BOT_RULES[i].re.exec(ua)
    if (m) return { isBot: true, who: BOT_RULES[i].who, token: m[0].trim(), why: '命中规则「' + String(BOT_RULES[i].re).replace(/\\b/g, '').replace(/^\/|\/i$/g, '') + '」' }
  }
  const suspicious = !/\bMozilla\/5\.0\b/.test(ua) || !/\b(AppleWebKit|Gecko|Trident|Version|Chrome|Safari)\b/i.test(ua)
  return { isBot: false, who: '', token: '', why: suspicious ? '没有浏览器内核令牌，虽然没命中爬虫规则，但多半也不是真人浏览器' : '结构完整，像真人浏览器' }
}

/**
 * 把 UA 切成片段并逐段解释（页面「这一段是干什么的」列表用）
 * @returns {Array<{text:string,kind:string,note:string,index:number}>}
 */
export function splitUA(ua) {
  const raw = String(ua == null ? '' : ua).trim()
  const out = []
  const re = /\((?:[^()]*)\)|[A-Za-z][A-Za-z0-9 ._-]*\/[0-9][0-9a-zA-Z._-]*|KHTML, like Gecko|rv:[0-9.]+|Mobile|Build\/[A-Za-z0-9._-]+|[A-Za-z][A-Za-z0-9._-]*/g
  let m
  while ((m = re.exec(raw)) !== null) {
    const text = m[0]
    let kind = '其他'
    if (/^\(/.test(text)) kind = /KHTML/i.test(text) ? '兼容段' : '平台注释'
    else if (/\/[0-9]/.test(text)) kind = '产品/版本'
    else if (/^rv:/.test(text)) kind = '版本兼容位'
    else if (text === 'Mobile') kind = '形态标记'
    else if (/^Build\//.test(text)) kind = '固件号'
    out.push({ text, kind, index: m.index, note: annotate(text) })
    if (out.length > 40) break
  }
  return out
}

function annotate(text) {
  for (let i = 0; i < SEGMENT_NOTES.length; i++) if (SEGMENT_NOTES[i].re.test(text)) return SEGMENT_NOTES[i].note
  if (/^\(/.test(text)) return '平台注释：整段是操作系统与设备信息，解析操作系统主要看这里'
  const prod = /^([A-Za-z][A-Za-z0-9 ._-]*)\/([0-9][0-9a-zA-Z._-]*)$/.exec(text)
  if (prod) {
    const hit = BROWSER_RULES.filter((r) => r.token === prod[1])[0]
    if (hit) return '本工具据此判定浏览器为 ' + hit.name + '（版本取这个令牌的数字）'
    const eng = ENGINE_RULES.filter((r) => String(r.from).indexOf(prod[1] + '/') === 0)[0]
    if (eng) return '内核判定依据：' + eng.name
    return '产品令牌 ' + prod[1] + '，版本 ' + prod[2] + '；本工具未收录它，可能是冷门客户端或伪造字段'
  }
  return '辅助令牌：多数是历史遗留的兼容位'
}

/**
 * 主解析入口
 * @param {string} ua
 * @returns {{raw,browser,engine,os,device,bot,segments,fields,products,comments,trust}}
 */
export function parseUA(ua) {
  const raw = String(ua == null ? '' : ua).trim()
  if (!raw) throw new Error('还没有粘贴 User-Agent')
  if (raw.length > 2000) throw new Error('UA 一般不超过 300 字符，这里 ' + raw.length + ' 个字符，肯定粘错东西了')
  const comments = extractComments(raw)
  const products = extractProducts(raw)
  const browser = detectBrowser(raw, products)
  const engine = detectEngine(raw, products, browser)
  const os = detectOS(raw, comments)
  const device = detectDevice(raw, comments, os)
  const bot = detectBot(raw)
  const segments = splitUA(raw)
  const fields = [
    { k: '浏览器', v: browser.name + (browser.version ? ' ' + browser.version : ''), from: browser.token ? '依据令牌 ' + browser.token + '/' : '没有依据令牌', note: browser.note },
    { k: '内核', v: engine.name + (engine.version ? ' ' + engine.version : ''), from: engine.from ? '依据 ' + engine.from : '无内核令牌', note: engine.note },
    { k: '操作系统', v: os.name + (os.version ? ' ' + os.version : ''), from: os.from ? '依据平台注释「' + os.from + '」' : '无平台注释', note: os.note },
    { k: '设备形态', v: device.kindName, from: device.kind === 'app' ? '依据客户端令牌' : '依据 Mobile / 机型 / 平台注释', note: device.hint || device.modelNote },
    { k: '厂商 / 机型', v: (device.vendor || '未知') + (device.model ? ' · ' + device.model : ''), from: device.model ? '机型字段「' + device.model + '」' : '没有机型字段', note: device.vendorTip },
    { k: '是不是爬虫', v: bot.isBot ? bot.who : '未命中爬虫规则', from: bot.token ? '令牌「' + bot.token + '」' : bot.why, note: bot.why },
  ]
  const trust = trustNote(raw, browser, os, device, bot)
  return { raw, browser, engine, os, device, bot, segments, fields, products, comments, trust }
}

/** UA 可信度提醒：不同寻常的地方直接说出来 */
function trustNote(raw, browser, os, device, bot) {
  const out = []
  if (/\bChrome\/[0-9]{1,2}\.0\.0\.0\b/.test(raw)) out.push('Chrome 主版本号被写成 0.0.0.0，这是刻意抹掉版本的写法')
  if (!/\bMozilla\/5\.0\b/.test(raw)) out.push('没有 Mozilla/5.0 前缀，几乎肯定不是浏览器发出的')
  if (browser.name === '未识别') out.push('认不出浏览器，可能是自定义客户端')
  if (os.name === '未识别') out.push('平台注释缺失或被抹掉')
  if (device.model === 'K') out.push('Android 新规矩：机型统一写成 K，不能再靠 UA 认机型')
  if (/CriOS|FxiOS|EdgiOS/.test(raw)) out.push('iOS 版 Chrome/Firefox/Edge：内核仍是 WebKit，行为与桌面版不同')
  if (/Windows NT 10\.0/.test(raw)) out.push('Win10 与 Win11 的 UA 完全一样，无法靠 UA 区分')
  if (bot.isBot) out.push('这是爬虫/脚本客户端，服务器通常要给它裁剪过的页面')
  if (/HeadlessChrome|Puppeteer|Selenium|PhantomJS/.test(raw)) out.push('无头/自动化特征明显，风控一般会直接拦')
  if (!out.length) out.push('结构规整、令牌齐全，但不能证明它不是伪造的 —— UA 是客户端随意写的自述字段')
  return out
}

/* ---------------- 生成器 ---------------- */

/** 平台注释模板 */
export const UA_PLATFORMS = [
  { key: 'windows', name: 'Windows 10/11 64 位', comment: 'Windows NT 10.0; Win64; x64' },
  { key: 'mac', name: 'macOS', comment: 'Macintosh; Intel Mac OS X 10_15_7' },
  { key: 'linux', name: 'Linux 桌面', comment: 'X11; Linux x86_64' },
  { key: 'android', name: 'Android 手机', comment: 'Linux; Android 13; Pixel 7' },
  { key: 'android-tab', name: 'Android 平板', comment: 'Linux; Android 12; SM-X710' },
  { key: 'iphone', name: 'iPhone', comment: 'iPhone; CPU iPhone OS 17_4 like Mac OS X' },
  { key: 'ipad', name: 'iPad', comment: 'iPad; CPU OS 17_4 like Mac OS X' },
  { key: 'cros', name: 'Chromebook', comment: 'X11; CrOS x86_64 14541.0.0' },
]

/** 浏览器模板：tail 是平台注释之后的固定写法，{v} 由用户填 */
export const UA_BROWSERS = [
  { key: 'chrome', name: 'Chrome / Edge 式', tail: 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{v} Safari/537.36', def: '120.0.0.0' },
  { key: 'edge', name: 'Edge', tail: 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{cv} Safari/537.36 Edg/{v}', def: '120.0.2210.91', cv: '120.0.0.0' },
  { key: 'firefox', name: 'Firefox', tail: 'rv:{v}) Gecko/{date} Firefox/{v}', def: '121.0', date: '20100101', inComment: true, note: 'Firefox 的真版本写两处：平台注释里的 rv: 和末尾的 Firefox/' },
  { key: 'safari', name: 'Safari（桌面）', tail: 'Version/{v} Safari/{wk}', def: '17.4', wk: '605.1.15' },
  { key: 'ios-safari', name: 'Safari（iOS 版式）', tail: 'Version/{v} Mobile/{mob} Safari/{wk}', def: '17.4', mob: '15E148', wk: '604.1' },
  { key: 'chrome-mobile', name: 'Chrome（移动版）', tail: 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{v} Mobile Safari/537.36', def: '120.0.6099.230' },
  { key: 'opera', name: 'Opera', tail: 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{cv} Safari/537.36 OPR/{v}', def: '106.0.0.0', cv: '120.0.0.0' },
  { key: 'samsung', name: 'Samsung Internet', tail: 'AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/{v} Chrome/{cv} Mobile Safari/537.36', def: '23.0', cv: '111.0.0.0' },
  { key: 'ie11', name: 'Internet Explorer 11', tail: 'Trident/7.0; rv:{v}) like Gecko', def: '11.0', inComment: true, winOnly: true },
  { key: 'qqbrowser', name: 'QQ 浏览器（国内常见）', tail: 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{cv} Mobile Safari/537.36 QQBrowser/{v}', def: '13.0.0.1003', cv: '99.0.4844.88' },
]

/**
 * 拼一条 UA（用于「如果我想要 XX 浏览器的 UA 长什么样」）
 * @param {string} browserKey
 * @param {string} platformKey
 * @param {string} [version]
 * @returns {{ua:string,browser:Object,platform:Object,explain:string[]}}
 */
export function buildUA(browserKey, platformKey, version) {
  const b = UA_BROWSERS.filter((x) => x.key === browserKey)[0] || UA_BROWSERS[0]
  let p = UA_PLATFORMS.filter((x) => x.key === platformKey)[0] || UA_PLATFORMS[0]
  let forced = ''
  if (b.winOnly && p.key !== 'windows') {
    p = UA_PLATFORMS[0]
    forced = b.name + ' 只存在于 Windows，平台注释已换成 Windows 的写法'
  }
  const v = String(version || b.def || '').trim()
  if (v && !/^[0-9][0-9a-zA-Z._-]*$/.test(v)) throw new Error('版本号只能有数字、点和字母，现在是「' + v + '」')
  const fill = (s) =>
    String(s)
      .replace(/\{v\}/g, v)
      .replace(/\{cv\}/g, b.cv || v)
      .replace(/\{wk\}/g, b.wk || '537.36')
      .replace(/\{mob\}/g, b.mob || '15E148')
      .replace(/\{date\}/g, b.date || '20100101')
  const comment = b.inComment ? p.comment + '; ' + fill(b.tail) : p.comment
  const tail = b.inComment ? '' : fill(b.tail)
  const ua = 'Mozilla/5.0 (' + comment + (b.inComment ? '' : ')') + (tail ? ' ' + tail : '')
  const explain = [
    'Mozilla/5.0 是所有人都写的兼容占位，不用改。',
    '括号里是平台注释：' + p.comment + '（' + p.name + '）。',
    tail
      ? '括号外这一段决定它被认成什么：' + tail
      : 'Firefox/IE 把版本信息写在括号里的 rv: 与内核令牌上，括号外只剩一个身份令牌。',
    /iphone|ipad/.test(p.key) ? 'iOS 平台注释用下划线代替点（17_4 就是 17.4）；另外 iOS 上任何浏览器内核都是 WebKit，CriOS/FxiOS 才是它们的写法。' : '把 Chrome/xxx 改成别的或删掉，站点就会认为你不是 Chrome。',
    forced ? '⚠ ' + forced : '',
    b.note ? 'ℹ ' + b.note : '',
  ].filter(Boolean)
  return { ua, browser: b, platform: p, explain }
}

/* ---------------- 样本与文案 ---------------- */

export const UA_SAMPLES = [
  {
    name: 'Chrome 120 / Win11',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
  {
    name: 'Safari 17 / macOS',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  },
  {
    name: 'Firefox 121 / Linux',
    ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  },
  {
    name: 'Edge 120 / Win10',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91',
  },
  {
    name: 'Chrome 移动版 / Pixel 7',
    ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
  },
  {
    name: '三星 SM-S9080',
    ua: 'Mozilla/5.0 (Linux; Android 13; SM-S9080) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  },
  {
    name: '机型被抹成 K',
    ua: 'Mozilla/5.0 (Linux; Android 13; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  },
  {
    name: 'Safari / iPhone iOS 17',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'iPad（伪装桌面版）',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  },
  {
    name: '微信内置浏览器',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.44(0x18002c2f) NetType/WIFI Language/zh_CN',
  },
  {
    name: 'Googlebot',
    ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  },
  {
    name: 'GPTBot',
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)',
  },
  {
    name: 'curl',
    ua: 'curl/8.4.0',
  },
  {
    name: 'python-requests',
    ua: 'python-requests/2.31.0',
  },
  {
    name: '无头 Chrome',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
  },
  {
    name: 'IE 11',
    ua: 'Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko',
  },
  {
    name: '小米平板 / MIUI 浏览器',
    ua: 'Mozilla/5.0 (Linux; U; Android 12; zh-cn; 21051182C Build/SP1A.210812.016) AppleWebKit/30.0 (KHTML, like Gecko) Version/4.0 Safari/30.0 MIUIBrowser/17.0.6.0',
  },
  {
    name: '电视 / Tizen',
    ua: 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) BrightSign/2.1.0 Chrome/64.0.3282.186 Safari/537.36',
  },
]

/** 常见爬虫令牌速查（页面用，只列能在公开 robots/文档里查到的写法） */
export const UA_BOT_CHEATSHEET = [
  { token: 'Googlebot', who: 'Google 搜索收录', note: '带 +http://www.google.com/bot.html 说明链接' },
  { token: 'Bingbot', who: '必应搜索收录', note: '过去叫 msnbot' },
  { token: 'Baiduspider', who: '百度搜索收录', note: '国内站点最常见' },
  { token: 'Sogou web spider', who: '搜狗搜索收录', note: '' },
  { token: '360Spider', who: '360 搜索收录', note: '' },
  { token: 'YandexBot', who: 'Yandex 搜索收录', note: '俄语区流量来源' },
  { token: 'Applebot', who: 'Siri / Spotlight 预览', note: '' },
  { token: 'GPTBot', who: 'OpenAI 训练抓取', note: '不想被训练可在 robots.txt 禁' },
  { token: 'ClaudeBot', who: 'Anthropic 抓取', note: '' },
  { token: 'Bytespider', who: '字节跳动抓取', note: '' },
  { token: 'meta-externalagent', who: 'Meta 链接预览', note: 'Facebook / Instagram 分享卡片' },
  { token: 'Twitterbot', who: 'X 链接预览', note: '' },
  { token: 'TelegramBot', who: 'Telegram 链接预览', note: '' },
  { token: 'Slackbot', who: 'Slack 链接预览', note: '常带版本号' },
  { token: 'LinkedInBot', who: 'LinkedIn 链接预览', note: '' },
  { token: 'AhrefsBot / SemrushBot', who: 'SEO 外链分析', note: '量大，通常要限流' },
  { token: 'curl / wget', who: '命令行下载', note: '没有 Mozilla 前缀，一眼是脚本' },
  { token: 'python-requests', who: 'Python 脚本', note: '' },
  { token: 'Go-http-client', who: 'Go 程序', note: '' },
  { token: 'okhttp', who: 'Android / Java 网络库', note: 'App 内请求常见' },
  { token: 'HeadlessChrome', who: '无头浏览器', note: '自动化测试或抓取，正常人不会带' },
]

export const UA_NOTES = [
  {
    t: 'UA 是客户端的自我陈述，不是证明',
    d: '这个字段由发起方随便写，任何 HTTP 库都能填成 Chrome。所以它只能用来做「大概的适配」和统计，不能当安全判断依据；需要真实能力就用特性检测（feature detection），需要身份就用签名请求。',
  },
  {
    t: '为什么 Chrome 系里同时有 AppleWebKit、Chrome、Safari 三个令牌',
    d: '历史兼容：老站点靠 AppleWebKit 判断 WebKit，靠 Safari 结尾判断「是不是 iPhone」，Chrome 出来后为了让这些站点正常工作，把整串兼容位照抄了下来。于是 Chrome 的 UA 里反而没有一条信息是「真」的。',
  },
  {
    t: 'UA Reduction 与冻结',
    d: 'Chrome 101 起把桌面版里的次要版本号统一降为 0.0.0；Android 上把机型统一写成 K。想拿精确版本与机型，只能读 sec-ch-ua 系列请求头（UA Client Hints），且只在 HTTPS 下可用。',
  },
  {
    t: 'iOS 上的浏览器其实都是 WebKit',
    d: 'iOS 17.4 之前，App Store 里的浏览器只能用 WebKit（欧盟数字市场法之后才允许其他内核）。所以 iPhone 上的 Chrome 写 CriOS/、Firefox 写 FxiOS/，渲染行为跟桌面版差很多 —— 这也是很多「只在 iOS 浏览器复现」的 bug 的来源。',
  },
  {
    t: '平板与桌面越来越难分',
    d: 'iPadOS 13 起默认发 macOS 版 UA，光看字符串会以为是笔记本；服务端要靠触摸点数量、屏幕尺寸或 sec-ch-ua-platform 才认得出来。Win10 与 Win11 更是完全同串。',
  },
  {
    t: '爬虫怎么认',
    d: '正规爬虫会老实写自己的名字和说明链接（robots.txt 里也常能反查到），但抓取方伪造浏览器 UA 是常态。工程上更可靠的做法是三段结合：UA 规则 + IP 反向 DNS + 行为特征（请求频率、是否执行 JS、是否带 Cookie）。',
  },
]

/* ---------------- 自检 ---------------- */

const CASES = [
  ['Chrome 120 桌面', 0, ['Chrome', '120.0.0.0', 'Blink', 'Windows 10 / 11', 'desktop', '']],
  ['Safari 桌面', 1, ['Safari', '17.4', 'WebKit', 'macOS 10.15.7', 'desktop', 'Apple']],
  ['Firefox Linux', 2, ['Firefox', '121.0', 'Gecko', 'Linux', 'desktop', '']],
  ['Edge', 3, ['Microsoft Edge', '120.0.2210.91', 'Blink（Edge Chromium）', 'Windows 10 / 11', 'desktop', '']],
  ['Pixel 手机', 4, ['Chrome', '120.0.6099.230', 'Blink', 'Android 13', 'mobile', 'Google']],
  ['三星机型', 5, ['Chrome', '120.0.0.0', 'Blink', 'Android 13', 'mobile', '三星']],
  ['机型抹成 K', 6, ['Chrome', '120.0.0.0', 'Blink', 'Android 13', 'mobile', '']],
  ['iPhone Safari', 7, ['Safari', '17.4', 'WebKit', 'iOS 17.4', 'mobile', 'Apple']],
  ['iPad 桌面版 UA', 8, ['Safari', '17.4', 'WebKit', 'macOS 10.15.7', 'desktop', 'Apple']],
  ['微信内置', 9, ['微信内置浏览器', '8.0.44', 'WebKit', 'iOS 16.6', 'mobile', 'Apple']],
  ['Googlebot', 10, ['', '', '', '', '', '']],
  ['GPTBot', 11, ['', '', 'WebKit', '未识别', 'desktop', '']],
  ['curl', 12, ['未识别', '', '未识别', '未识别', 'app', '']],
  ['python-requests', 13, ['未识别', '', '未识别', '未识别', 'app', '']],
  ['无头 Chrome', 14, ['无头 Chrome', '120.0.0.0', 'Blink', 'Windows 10 / 11', 'desktop', '']],
  ['IE 11', 15, ['Internet Explorer 11', '11.0', 'MSHTML（Trident）', 'Windows 10 / 11', 'desktop', '']],
  ['MIUI 平板', 16, ['小米浏览器', '17.0.6.0', 'Blink', 'Android 12', 'tablet', '小米']],
  ['电视盒子', 17, ['Chrome', '64.0.3282.186', 'Blink', '未识别', 'tv', '']],
]

const BOT_CASES = [
  [10, true, 'Google 搜索爬虫'],
  [11, true, 'OpenAI（训练/搜索/用户代理）'],
  [12, true, 'curl 命令行'],
  [13, true, 'Python 脚本'],
  [14, true, '无头浏览器 / 自动化框架'],
  [0, false, ''],
  [4, false, ''],
]

/**
 * 自检：把内置样本跑一遍，比对关键结论
 * @returns {{total:number,passed:number,ok:boolean,rows:Array<{name:string,expected:string,actual:string,ok:boolean}>}}
 */
export function selfTest() {
  const rows = []
  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i]
    const want = c[2]
    const s = UA_SAMPLES[c[1]]
    let got = ['', '', '', '', '', '']
    let err = ''
    try {
      const r = parseUA(s.ua)
      got = [r.browser.name, r.browser.version, r.engine.name, (r.os.name + ' ' + r.os.version).trim(), r.device.kind, r.device.vendor]
    } catch (e) {
      err = e.message
    }
    const keys = ['浏览器', '版本', '内核', '系统', '形态', '厂商']
    const diffs = []
    for (let j = 0; j < want.length; j++) if (want[j] && got[j] !== want[j]) diffs.push(keys[j] + ' 期望 ' + want[j] + ' 实得 ' + (err || got[j] || '（空）'))
    rows.push({
      name: c[0],
      expected: want.filter(Boolean).join(' / ') || '（只跑通不校验）',
      actual: diffs.length ? diffs.join('；') : got.filter(Boolean).join(' / '),
      ok: diffs.length === 0,
    })
  }
  for (let i = 0; i < BOT_CASES.length; i++) {
    const c = BOT_CASES[i]
    const s = UA_SAMPLES[c[0]]
    const r = parseUA(s.ua)
    const ok = r.bot.isBot === c[1] && (!c[2] || r.bot.who === c[2])
    rows.push({ name: '爬虫判定：' + s.name, expected: (c[1] ? '是 ' + c[2] : '不是爬虫'), actual: (r.bot.isBot ? '是 ' : '不是 ') + r.bot.who, ok })
  }
  const tplOk = UA_BROWSERS.every((b) => /\{v\}/.test(b.tail)) && UA_PLATFORMS.every((p) => !!p.comment)
  rows.push({ name: '生成器模板齐全', expected: '每个模板都有 {v} 占位与平台注释', actual: tplOk ? '齐全' : '缺占位符', ok: tplOk })
  const segOk = splitUA(UA_SAMPLES[0].ua).length >= 5
  rows.push({ name: '片段拆解有输出', expected: '≥ 5 段', actual: splitUA(UA_SAMPLES[0].ua).length + ' 段', ok: segOk })
  let genBad = []
  for (let i = 0; i < UA_BROWSERS.length; i++) {
    for (let j = 0; j < UA_PLATFORMS.length; j++) {
      const b = UA_BROWSERS[i]
      const p = UA_PLATFORMS[j]
      try {
        const g = buildUA(b.key, p.key, b.def)
        const back = parseUA(g.ua)
        if (g.ua.length < 30) genBad.push(b.key + '/' + p.key + ' 太短')
        if (/\{[a-z]+\}/.test(g.ua)) genBad.push(b.key + '/' + p.key + ' 占位符没替换：' + g.ua)
        const wantName = { chrome: 'Chrome', edge: 'Microsoft Edge', firefox: 'Firefox', safari: 'Safari', 'ios-safari': 'Safari', 'chrome-mobile': 'Chrome', opera: 'Opera', samsung: 'Samsung Internet', ie11: 'Internet Explorer 11', qqbrowser: 'QQ 浏览器' }[b.key]
        if (back.browser.name !== wantName) genBad.push(b.key + '/' + p.key + ' 再生成后认成 ' + back.browser.name)
        if (back.browser.version !== b.def) genBad.push(b.key + '/' + p.key + ' 版本 ' + back.browser.version)
        if (!back.bot.isBot && /Headless/.test(g.ua)) genBad.push(b.key + '/' + p.key + ' 不该是爬虫')
      } catch (e) {
        genBad.push(b.key + '/' + p.key + ' 抛了：' + e.message)
      }
    }
  }
  rows.push({ name: '全部模板 × 全部平台 生成后再解析', expected: '身份与版本都能读回', actual: genBad.length ? genBad.slice(0, 3).join('；') + '（共 ' + genBad.length + ' 处）' : '一致', ok: genBad.length === 0 })
  const passed = rows.filter((r) => r.ok).length
  return { total: rows.length, passed, ok: passed === rows.length, rows }
}
