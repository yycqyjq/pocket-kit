/**
 * 工具注册表
 * ------------------------------------------------------------
 * 新增一个工具只需三步：
 *   1. 在 src/tools/components/ 下新建 ToolXxx.vue
 *   2. 在下面 import 进来
 *   3. 往 TOOLS 数组里加一条记录，并在 COMPONENTS 里映射 id -> 组件
 * 首页网格、搜索、收藏、最近使用全部由本文件驱动，无需改动其他页面。
 */
import ToolText from './components/ToolText.vue'
import ToolJson from './components/ToolJson.vue'
import ToolRadix from './components/ToolRadix.vue'
import ToolRegex from './components/ToolRegex.vue'
import ToolUnit from './components/ToolUnit.vue'
import ToolColor from './components/ToolColor.vue'
import ToolLoan from './components/ToolLoan.vue'
import ToolHealth from './components/ToolHealth.vue'
import ToolTimestamp from './components/ToolTimestamp.vue'
import ToolDateDiff from './components/ToolDateDiff.vue'
import ToolPassword from './components/ToolPassword.vue'
import ToolRandom from './components/ToolRandom.vue'
import ToolId from './components/ToolId.vue'
import ToolValidate from './components/ToolValidate.vue'
import ToolHash from './components/ToolHash.vue'
import ToolDiff from './components/ToolDiff.vue'
import ToolCase from './components/ToolCase.vue'
import ToolConvert from './components/ToolConvert.vue'
import ToolCalc from './components/ToolCalc.vue'
import ToolCron from './components/ToolCron.vue'
import ToolJwt from './components/ToolJwt.vue'
import ToolDevRef from './components/ToolDevRef.vue'
import ToolPerm from './components/ToolPerm.vue'
import ToolIp from './components/ToolIp.vue'
import ToolSql from './components/ToolSql.vue'
import ToolCny from './components/ToolCny.vue'
import ToolUrl from './components/ToolUrl.vue'
import ToolEntity from './components/ToolEntity.vue'
import ToolTable from './components/ToolTable.vue'
import ToolUnicode from './components/ToolUnicode.vue'
import ToolJson2ts from './components/ToolJson2ts.vue'
import ToolPercent from './components/ToolPercent.vue'
import ToolInvest from './components/ToolInvest.vue'
import ToolClassic from './components/ToolClassic.vue'
import ToolCodefmt from './components/ToolCodefmt.vue'
import ToolIpv6 from './components/ToolIpv6.vue'
import ToolTotp from './components/ToolTotp.vue'
import ToolLorem from './components/ToolLorem.vue'
import ToolGarbled from './components/ToolGarbled.vue'
import ToolNormalize from './components/ToolNormalize.vue'
import ToolExtract from './components/ToolExtract.vue'
import ToolWordfreq from './components/ToolWordfreq.vue'
import ToolCleanescape from './components/ToolCleanescape.vue'
import ToolHexdump from './components/ToolHexdump.vue'
import ToolBraille from './components/ToolBraille.vue'
import ToolQp from './components/ToolQp.vue'
import ToolPunycode from './components/ToolPunycode.vue'
import ToolUuidinfo from './components/ToolUuidinfo.vue'
import ToolDatefmt from './components/ToolDatefmt.vue'
import ToolHttpdump from './components/ToolHttpdump.vue'
import ToolImageinfo from './components/ToolImageinfo.vue'
import ToolImageb64 from './components/ToolImageb64.vue'
import ToolImagecompress from './components/ToolImagecompress.vue'
import ToolImageconvert from './components/ToolImageconvert.vue'
import ToolAes from './components/ToolAes.vue'
import ToolUseragent from './components/ToolUseragent.vue'
import ToolSemver from './components/ToolSemver.vue'
import ToolBases from './components/ToolBases.vue'
import ToolStats from './components/ToolStats.vue'
import ToolNumtheory from './components/ToolNumtheory.vue'
import ToolChincal from './components/ToolChincal.vue'
import ToolSplitbill from './components/ToolSplitbill.vue'
import ToolTaxcn from './components/ToolTaxcn.vue'
import ToolChecksum from './components/ToolChecksum.vue'
import ToolX509 from './components/ToolX509.vue'
import ToolBitwise from './components/ToolBitwise.vue'
import ToolMarkdown from './components/ToolMarkdown.vue'
import ToolExif from './components/ToolExif.vue'
import ToolPickcolor from './components/ToolPickcolor.vue'
import ToolBodysize from './components/ToolBodysize.vue'
import ToolDevice from './components/ToolDevice.vue'

export const CATEGORIES = [
  { key: 'all', name: '全部' },
  { key: 'text', name: '文本 · 处理' },
  { key: 'enc', name: '编码 · 解码' },
  { key: 'calc', name: '数值 · 计算' },
  { key: 'time', name: '时间 · 日期' },
  { key: 'dev', name: '开发 · 运维' },
  { key: 'make', name: '生成 · 校验' },
  { key: 'image', name: '图片 · 处理' },
]

export const TOOLS = [
  {
    id: 'text',
    name: '文本工坊',
    glyph: '文',
    tint: '#3F7A6E',
    cat: 'text',
    desc: '字数统计 · 批量整理 · 编码转换',
    intro: '统计中英文字数与段落，批量去重、排序、去空行，URL 与 Base64 互转。',
    keywords: '文本 字数 统计 去重 排序 大小写 base64 url 编码 解码 html 标签',
  },
  {
    id: 'json',
    name: 'JSON 工坊',
    glyph: 'J',
    tint: '#4A6FA5',
    cat: 'enc',
    desc: '格式化 · 压缩 · 结构体检',
    intro: '格式化与压缩 JSON，定位报错位置，汇总类型与层级结构。',
    keywords: 'json 格式化 压缩 校验 解析 转义 结构',
  },
  {
    id: 'radix',
    name: '进制转换',
    glyph: '进',
    tint: '#6B5B95',
    cat: 'enc',
    desc: '2 / 8 / 10 / 16 / 36 互转',
    intro: '多进制互转，附带二进制分组、字节视图与位运算细节。',
    keywords: '进制 二进制 八进制 十六进制 转换 bit byte 位运算 ascii 编码',
  },
  {
    id: 'regex',
    name: '正则速查',
    glyph: '则',
    tint: '#8A6D3B',
    cat: 'enc',
    desc: '常用表达式库 · 实时匹配',
    intro: '内置常见正则库，可直接替换到输入文本上验证并高亮匹配结果。',
    keywords: '正则 regex 表达式 匹配 校验 替换 高亮',
  },
  {
    id: 'unit',
    name: '单位换算',
    glyph: '换',
    tint: '#2F7A8C',
    cat: 'calc',
    desc: '长度 · 重量 · 温度 · 数据',
    intro: '十二大类单位一次换算到底，含市制单位与英制单位。',
    keywords: '单位 换算 长度 面积 体积 重量 温度 数据 速度 压力 能量 角度 斤 两 里 尺',
  },
  {
    id: 'color',
    name: '色彩工坊',
    glyph: '色',
    tint: '#B5527A',
    cat: 'calc',
    desc: '取值转换 · 对比度 · 配色',
    intro: 'HEX / RGB / HSL 互转，计算对比度与可读性，并生成配色阶梯。',
    keywords: '颜色 色彩 hex rgb hsl 对比度 配色 调色板 色值',
  },
  {
    id: 'loan',
    name: '还款试算',
    glyph: '贷',
    tint: '#A8642F',
    cat: 'calc',
    desc: '等额本息 · 等额本金',
    intro: '两种还款方式对比，逐期还款计划与提前还款效果试算。',
    keywords: '贷款 房贷 还款 等额本息 等额本金 利息 月供 利率 提前还款',
  },
  {
    id: 'health',
    name: '身体数据',
    glyph: '身',
    tint: '#3E7A4E',
    cat: 'calc',
    desc: 'BMI · 代谢 · 体脂 · 饮水',
    intro: '按中国成人标准评估体重区间，估算基础代谢、体脂率与每日饮水。',
    keywords: 'bmi 体重 身高 体脂 基础代谢 bmr tdee 饮水 腰围 健康',
  },
  {
    id: 'timestamp',
    name: '时间戳',
    glyph: '戳',
    tint: '#4F6B8C',
    cat: 'time',
    desc: '秒 / 毫秒互转 · 时区',
    intro: '时间戳与日期双向转换，自动识别秒或毫秒，附带周数、年中第几天。',
    keywords: '时间戳 timestamp unix 日期 时间 转换 秒 毫秒 时区 utc',
  },
  {
    id: 'datediff',
    name: '日期推算',
    glyph: '日',
    tint: '#7A6BA8',
    cat: 'time',
    desc: '间隔 · 工作日 · 年龄',
    intro: '计算两个日期的间隔与工作日天数，按出生日期精确推算年龄与下次生日。',
    keywords: '日期 计算 间隔 天数 工作日 年龄 生日 倒计时 加减',
  },
  {
    id: 'password',
    name: '密码生成',
    glyph: '密',
    tint: '#B4553E',
    cat: 'make',
    desc: '随机密码 · 强度评估',
    intro: '按字符集与长度策略生成随机密码，并给出强度评分与爆破耗时估计。',
    keywords: '密码 随机 生成 强度 安全 字符 符号',
  },
  {
    id: 'random',
    name: '随机抽屉',
    glyph: '随',
    tint: '#2F8C7A',
    cat: 'make',
    desc: '随机数 · 抽签 · 洗牌',
    intro: '区间随机数、硬币骰子、名单抽签与洗牌，结果可一键复制。',
    keywords: '随机 抽签 随机数 点名 骰子 硬币 洗牌 抽奖',
  },
  {
    id: 'id',
    name: '标识生成',
    glyph: 'ID',
    tint: '#5B7A3E',
    cat: 'make',
    desc: 'UUID · 短 ID · 类雪花',
    intro: '批量生成 UUID v4、短标识、十六进制与类雪花 ID，适合测试数据。',
    keywords: 'id uuid 唯一 标识 生成 nanoid 雪花 objectid 测试',
  },
  {
    id: 'validate',
    name: '校验台',
    glyph: '验',
    tint: '#8C5B3E',
    cat: 'make',
    desc: '手机号 · 身份证 · 银行卡',
    intro: '十二类常见格式校验，通过后进一步解析出可用信息。',
    keywords: '校验 验证 手机号 身份证 银行卡 邮箱 url ip mac imei 车牌 邮编 统一社会信用代码',
  },
  {
    id: 'hash',
    name: '哈希工坊',
    glyph: '摘',
    tint: '#4A6FA5',
    cat: 'dev',
    desc: 'MD5 · SHA-1 · SHA-256 · SHA-512',
    intro: '一次算出四种消息摘要，支持中文与 emoji，并附带 HMAC 带密钥摘要。',
    keywords: 'hash 哈希 md5 sha1 sha256 sha512 摘要 校验和 指纹 hmac 加密 hash',
  },
  {
    id: 'diff',
    name: '文本对比',
    glyph: '差',
    tint: '#7A6BA8',
    cat: 'text',
    desc: '逐行差异 · 字符级高亮',
    intro: '对比两段文本，标出新增与删除的行，并给出相似度与首个差异的字符级对比。',
    keywords: 'diff 对比 差异 比较 不同 改动 修订 文本 compare',
  },
  {
    id: 'case',
    name: '命名转换',
    glyph: '名',
    tint: '#2F8C7A',
    cat: 'text',
    desc: '驼峰 · 下划线 · 短横线 · 常量',
    intro: '一次给出 11 种命名风格，能识别连续大写缩写，中文原样保留。',
    keywords: '命名 驼峰 camel pascal snake kebab 下划线 短横线 常量 变量名 大小写 转换 slug',
  },
  {
    id: 'convert',
    name: '格式互转',
    glyph: '转',
    tint: '#5B7A3E',
    cat: 'dev',
    desc: 'JSON · CSV · XML · YAML · TOML',
    intro: '六种数据格式任意互转，改动前会先解析校验，报错定位到行列。',
    keywords: 'json csv xml yaml toml markdown 表格 格式 转换 互转 数据 配置',
  },
  {
    id: 'calc',
    name: '表达式计算',
    glyph: '算',
    tint: '#6B5B95',
    cat: 'calc',
    desc: '四则 · 幂 · 阶乘 · 函数',
    intro: '带括号与优先级的表达式求值，支持三角函数、对数、阶乘与常用常量。',
    keywords: '计算器 表达式 公式 求值 数学 sin cos log 阶乘 开方 calc 算',
  },
  {
    id: 'cron',
    name: 'Cron 表达式',
    glyph: '期',
    tint: '#4F6B8C',
    cat: 'time',
    desc: '解析 · 未来执行时间 · 生成',
    intro: '把五段式 Cron 翻译成人话，推演接下来 10 次执行时间，也能反向生成。',
    keywords: 'cron crontab 定时 计划任务 表达式 周期 调度 定时任务 schedule',
  },
  {
    id: 'jwt',
    name: 'JWT 解析',
    glyph: '令',
    tint: '#8C5B3E',
    cat: 'dev',
    desc: '解码头部载荷 · 检查过期',
    intro: '解开 JWT 的头部与载荷，翻译标准声明，判断是否过期与签名算法家族。',
    keywords: 'jwt token 令牌 json web token 解析 解码 过期 签名 bearer oauth',
  },
  {
    id: 'devref',
    name: '开发速查',
    glyph: '查',
    tint: '#3E7A4E',
    cat: 'dev',
    desc: '状态码 · MIME · 端口 · Git',
    intro: 'HTTP 状态码、MIME 类型、常用端口、HTTP 方法与 Git 常用命令的随身手册。',
    keywords: '状态码 http mime 类型 端口 port git 命令 速查 手册 404 502 表',
  },
  {
    id: 'perm',
    name: 'Linux 权限',
    glyph: '权',
    tint: '#8A6D3B',
    cat: 'dev',
    desc: 'chmod · 数字符号互转',
    intro: '数字与符号写法互转，拆解逐位权限，并检查 SUID、可写等危险组合。',
    keywords: 'chmod 权限 linux 755 644 rwx suid sgid sticky 文件 目录 服务器',
  },
  {
    id: 'ip',
    name: 'IP 子网',
    glyph: '网',
    tint: '#2F7A8C',
    cat: 'dev',
    desc: 'CIDR · 掩码 · 子网拆分',
    intro: '解析网段、算出可用地址范围与掩码，支持拆分子网与区间合并成网段。',
    keywords: 'ip ipv4 cidr 子网 掩码 subnet 网段 广播 网络地址 内网 192.168 计算',
  },
  {
    id: 'sql',
    name: 'SQL 格式化',
    glyph: '库',
    tint: '#5B6B8C',
    cat: 'dev',
    desc: '排版 · 关键字大写 · 压缩',
    intro: '把一坨 SQL 排成易读格式，或压成一行；字符串与注释不会被破坏。',
    keywords: 'sql 格式化 美化 排版 压缩 mysql postgres 查询 语句 format',
  },
  {
    id: 'cny',
    name: '金额大写',
    glyph: '额',
    tint: '#A8642F',
    cat: 'calc',
    desc: '人民币大写 · 中文读法',
    intro: '数字转财务大写（壹贰叁），零的补位按银行规范处理，也支持纯整数中文读法。',
    keywords: '金额 大写 人民币 财务 报销 发票 合同 中文 数字 壹贰叁 零元整 转换',
  },
  {
    id: 'url',
    name: 'URL 解析',
    glyph: '链',
    tint: '#4A6FA5',
    cat: 'enc',
    desc: '拆解 · 参数 · 编解码',
    intro: '把一条链接拆成协议、主机、端口、路径、参数、锚点，并提供编解码与恶意链接无害化。',
    keywords: 'url 链接 解析 参数 query 编码 解码 百分号 defang 无害化 get 请求 uri',
  },
  {
    id: 'entity',
    name: 'HTML 实体',
    glyph: '符',
    tint: '#8A6D3B',
    cat: 'enc',
    desc: '转义 · 反转义 · 去标签',
    intro: 'HTML 实体编码解码，支持命名、十进制、十六进制三种写法，并能一键剥掉标签取纯文本。',
    keywords: 'html 实体 entity 转义 反转义 escape 标签 amp lt copy 去标签 纯文本 xss',
  },
  {
    id: 'table',
    name: '表格对齐',
    glyph: '表',
    tint: '#2F7A8C',
    cat: 'text',
    desc: 'CSV/TSV 转等宽表格',
    intro: '把分隔文本排成对齐的等宽表格，中文按两列宽计算，可加边框或转成 Markdown。',
    keywords: '表格 对齐 等宽 ascii table csv tsv markdown 排版 列宽 monospace 整理',
  },
  {
    id: 'unicode',
    name: 'Unicode 码点',
    glyph: '码',
    tint: '#6B5B95',
    cat: 'enc',
    desc: '逐字符拆解 · 查不可见字符',
    intro: '看清文本的真实构成：码点、UTF-8 字节、UTF-16 码元，并揪出零宽空格这类看不见的字符。',
    keywords: 'unicode 码点 utf-8 utf-16 零宽空格 不可见字符 代理对 emoji 字符 编码 转义 bom',
  },
  {
    id: 'json2ts',
    name: 'JSON 转 TS',
    glyph: '型',
    tint: '#4A6FA5',
    cat: 'dev',
    desc: '数据反推 TypeScript 接口',
    intro: '从真实 JSON 数据反推 TypeScript 接口定义，数组自动合并联合类型，缺失字段标成可选。',
    keywords: 'json typescript ts interface 接口 类型 声明 反推 生成 model dto 前端',
  },
  {
    id: 'percent',
    name: '百分比计算',
    glyph: '百',
    tint: '#B5527A',
    cat: 'calc',
    desc: '占比 · 涨跌 · 折扣 · 税',
    intro: '八类常见百分比场景一次算清，并把「百分点」和「百分比」的区别讲明白。',
    keywords: '百分比 占比 涨跌幅 折扣 打折 税率 含税 百分点 增减 比例 计算 百分之几',
  },
  {
    id: 'invest',
    name: '复利与投资',
    glyph: '投',
    tint: '#3E7A4E',
    cat: 'calc',
    desc: '复利 · 定投 · 年化反推',
    intro: '一次性投入的复利终值、每月定投的逐年明细、从期初期末反推年化收益率，附 72 法则。',
    keywords: '复利 投资 定投 年化 收益 利息 存款 基金 理财 72法则 收益率 计算 终值',
  },
  {
    id: 'stats',
    name: '统计工坊',
    glyph: '统',
    tint: '#B5527A',
    cat: 'calc',
    desc: '均值 · 分位 · 方差 · 回归',
    intro: '描述统计一站算完：加权平均、分位数、方差与标准差、线性回归与相关系数，口径全部写明。',
    keywords: '统计 平均 加权 中位数 分位数 方差 标准差 线性回归 相关系数 最小二乘 拟合',
  },
  {
    id: 'numtheory',
    name: '数论工具箱',
    glyph: '数',
    tint: '#6B5B95',
    cat: 'calc',
    desc: '素数 · 分解 · GCD/LCM',
    intro: '素性判定、质因数分解、约数、GCD/LCM、欧拉函数、素数表、完全数与亲和数，附罗马数字互转。',
    keywords: '数论 素数 质数 质因数 分解 gcd lcm 欧拉函数 完全数 亲和数 罗马数字 约数 数字根',
  },
  {
    id: 'splitbill',
    name: '账单分摊',
    glyph: '摊',
    tint: '#2F8C7A',
    cat: 'calc',
    desc: 'AA 分摊 · 找零撮平',
    intro: '多人账单按税、折扣、小费与抹零分摊，自动算出谁该给谁钱，可直接生成发群文本。',
    keywords: 'aa 分账 分摊 账单 聚餐 拼单 小费 折扣 抹零 转账 找零 团建 多人',
  },
  {
    id: 'taxcn',
    name: '个税速算',
    glyph: '税',
    tint: '#A8642F',
    cat: 'calc',
    desc: '个税 · 社保 · 到手工资',
    intro: '月薪到手、五险一金逐险种、年度综合所得与专项附加扣除、累计预扣逐月表，年终奖两种发法对比。',
    keywords: '个税 个人所得税 社保 五险一金 公积金 到手工资 专项附加扣除 年终奖 累计预扣 起征点 工资',
  },
  {
    id: 'classic',
    name: '古典密码',
    glyph: '古',
    tint: '#8A6D3B',
    cat: 'enc',
    desc: '凯撒 · 栅栏 · 摩斯 · 培根',
    intro: '八种经典字符变换的编解码，凯撒还能暴力枚举 26 种位移，附摩斯电码速查表。',
    keywords: '凯撒 rot13 rot47 栅栏 摩斯 培根 atbash a1z26 密码 编码 解谜 谜语 classic cipher',
  },
  {
    id: 'codefmt',
    name: '代码美化',
    glyph: '美',
    tint: '#5B6B8C',
    cat: 'dev',
    desc: 'HTML / CSS 排版与压缩',
    intro: 'HTML 与 CSS 的换行缩进与压缩，字符串、注释、pre 内容都不会被破坏。',
    keywords: 'html css 美化 格式化 压缩 minify beautify 排版 缩进 代码 format',
  },
  {
    id: 'ipv6',
    name: 'IPv6 规范化',
    glyph: '六',
    tint: '#2F7A8C',
    cat: 'dev',
    desc: '压缩展开 · 类型判断',
    intro: 'IPv6 的压缩与展开互转、地址类型判断、内嵌 IPv4 识别，以及按 /64 拆分网络与接口部分。',
    keywords: 'ipv6 地址 压缩 展开 规范化 子网 前缀 fe80 ula 组播 内嵌 ipv4 网络 运维',
  },
  {
    id: 'totp',
    name: '两步验证码',
    glyph: '动',
    tint: '#8C5B3E',
    cat: 'dev',
    desc: 'TOTP · HOTP 动态口令',
    intro: '按 RFC 6238 在本地算出动态验证码，也能反过来校验一个码是否落在当前时间窗内。',
    keywords: 'totp hotp 两步验证 动态口令 验证码 二次验证 2fa otp 身份验证器 base32 谷歌验证器',
  },
  {
    id: 'lorem',
    name: '占位文本',
    glyph: '占',
    tint: '#3E7A4E',
    cat: 'make',
    desc: '中文/英文假文生成',
    intro: '按段落、句子或字数生成中文与英文占位文本，用来撑满版面、检查排版与折行。',
    keywords: '占位 假文 lorem ipsum 填充 文案 占位符 排版 测试文本 mock 示例文字',
  },
  {
    id: 'garbled',
    name: '乱码恢复',
    glyph: '乱',
    tint: '#B4553E',
    cat: 'enc',
    desc: '编码错误一键还原',
    intro: '按各种编码组合暴力尝试，并按「像不像正常文字」排序，能还原最常见的几类乱码。',
    keywords: '乱码 编码 gbk utf-8 big5 latin1 恢复 还原 mojibake 转码 字符集',
  },
  {
    id: 'normalize',
    name: 'Unicode 规范化',
    glyph: '规',
    tint: '#4A6FA5',
    cat: 'enc',
    desc: 'NFC/NFD/NFKC/NFKD 对比',
    intro: '解释「看起来一样但 === 不相等」的原因，并展示四种规范化形式下的差异。',
    keywords: 'unicode 规范化 nfc nfd nfkc nfkd 组合符号 全角 半角 等价 去重 比对 相等',
  },
  {
    id: 'extract',
    name: '文本抽取',
    glyph: '抽',
    tint: '#3E7A4E',
    cat: 'text',
    desc: 'URL/邮箱/手机号/日期 一键捞出',
    intro: '从日志、聊天记录、文档里抽出网址、邮箱、手机号、IPv4、日期、金额、UUID 等 16 类信息。',
    keywords: '抽取 提取 正则 网址 邮箱 手机号 ip 日期 金额 uuid 颜色 话题 批量 从文本中提取',
  },
  {
    id: 'wordfreq',
    name: '词频统计',
    glyph: '频',
    tint: '#B5527A',
    cat: 'text',
    desc: '词频 · 字频 · 丰富度',
    intro: '统计中英文词频、字符构成、段落句子数与词汇丰富度，可忽略高频虚词。',
    keywords: '词频 统计 字频 出现次数 高频 关键词 文本分析 word count frequency 丰富度',
  },
  {
    id: 'cleanescape',
    name: '文本清洗',
    glyph: '净',
    tint: '#2F8C7A',
    cat: 'text',
    desc: '零宽字符 · 色码 · 控制符',
    intro: '清掉从终端、网页、PDF 里复制出来的终端色码、零宽字符、控制字符与全角空格。',
    keywords: '清洗 零宽空格 ansi 终端颜色码 控制字符 bom 全角空格 不可见字符 清理 复制 粘贴',
  },
  {
    id: 'hexdump',
    name: '十六进制',
    glyph: '十',
    tint: '#5B6B8C',
    cat: 'enc',
    desc: '文本 ↔ 十六进制 ↔ 转储',
    intro: '文本与十六进制互转，并生成带偏移量与 ASCII 列的 hexdump 转储视图。',
    keywords: 'hex 十六进制 转储 hexdump 字节 二进制 offset 视图 编辑器 编码 字节',
  },
  {
    id: 'braille',
    name: '盲文转换',
    glyph: '盲',
    tint: '#3E7A4E',
    cat: 'enc',
    desc: '英文一级盲文 · 点位图',
    intro: '英文与数字转成六点盲文，逐字符展示点位编号，支持从 Unicode 盲文字符解码。',
    keywords: '盲文 braille 点字 盲文码 视障 转换 accessibility 六点 u2800',
  },
  {
    id: 'qp',
    name: 'QP 编解码',
    glyph: 'Q',
    tint: '#A8642F',
    cat: 'enc',
    desc: 'Quoted-Printable 编解码',
    intro: '邮件正文的 Quoted-Printable 编解码，支持软换行，能定位不完整的转义序列。',
    keywords: 'quoted-printable qp 编码 解码 邮件 rfc2045 =E9 拼回 邮件正文 mime',
  },
  {
    id: 'punycode',
    name: '国际化域名',
    glyph: '域',
    tint: '#8C5B3E',
    cat: 'enc',
    desc: '中文域名 ↔ xn--',
    intro: '中文域名与 Punycode 形式互转，附带同形异义钓鱼攻击的说明。',
    keywords: 'punycode 国际化域名 idn 中文域名 xn-- 域名 转码 钓鱼 同形异义 ace rfc3492',
  },
  {
    id: 'bases',
    name: '字母表编码',
    glyph: 'B',
    tint: '#4A6FA5',
    cat: 'enc',
    desc: 'Base32/58/62/64url 互转',
    intro: 'Base32、base32hex、Base58、Base62 与 Base64url 五套字母表编码互转，讲清各自的使用场景与填充规则。',
    keywords: 'base32 base32hex base58 base62 base64url base64 编码 字母表 bitcoin 比特币 编解码 url安全',
  },
  {
    id: 'uuidinfo',
    name: 'UUID 解析',
    glyph: 'U',
    tint: '#5B7A3E',
    cat: 'dev',
    desc: '版本 · 变体 · 时间戳',
    intro: '解析 UUID 的版本、变体，v1/v6/v7 还能读出生成时间，并给出版本选型建议。',
    keywords: 'uuid guid 解析 版本 v1 v4 v7 时间戳 变体 随机 nil 标识 对比 选型',
  },
  {
    id: 'datefmt',
    name: '日期格式互转',
    glyph: '格',
    tint: '#6B5B95',
    cat: 'time',
    desc: 'strftime/Java/moment/Go',
    intro: '四种日期格式记法互转，并给出每种语言的示例输出，解释大小写陷阱。',
    keywords: '日期格式 strftime java simpledateformat moment dayjs go time format 转换 占位符 格式串',
  },
  {
    id: 'chincal',
    name: '农历历书',
    glyph: '历',
    tint: '#8A6D3B',
    cat: 'time',
    desc: '农历 · 节气 · 干支 · 时辰',
    intro: '公历农历双向换算，给出干支、生肖、二十四节气、十二时辰与历书摘要，生日和已过天数一并算。',
    keywords: '农历 阴历 万年历 节气 干支 生肖 十二时辰 农历转公历 公历转农历 生日 老黄历',
  },
  {
    id: 'httpdump',
    name: 'HTTP 报文解析',
    glyph: '报',
    tint: '#B4553E',
    cat: 'dev',
    desc: '请求/响应 · 头部 · Cookie',
    intro: '把原始 HTTP 请求与响应拆开：起始行、逐个头部（带说明）、Cookie、正文类型判断与安全提醒。',
    keywords: 'http 报文 解析 请求 响应 头部 header cookie body 调试 排查 devtools 抓包',
  },
  {
    id: 'imageinfo',
    name: '图片信息',
    glyph: '寸',
    tint: '#2F7A8C',
    cat: 'image',
    desc: '尺寸 · 类型 · 体积 · 比例',
    intro: '读出图片的像素尺寸、纵横比、文件大小、类型与是否含透明通道，一眼看清一张图的基本盘。',
    keywords: '图片 信息 尺寸 分辨率 宽高 大小 体积 类型 格式 透明 alpha 纵横比 比例',
  },
  {
    id: 'imageb64',
    name: '图片 Base64',
    glyph: 'B6',
    tint: '#6B5B95',
    cat: 'image',
    desc: '图片 ↔ Base64 互转',
    intro: '把图片转成 dataURL 文本方便内联，也能把粘贴来的 Base64 还原成图片预览并估算大小。',
    keywords: 'base64 dataurl 图片 编码 解码 内联 转换 图片转base64 base64转图片',
  },
  {
    id: 'imagecompress',
    name: '图片压缩',
    glyph: '压',
    tint: '#B5527A',
    cat: 'image',
    desc: '压缩 · 缩放 · 降质',
    intro: '本地压缩图片：限制最大宽度、调质量、选输出格式，实时看压缩前后的体积变化，全程不上传。',
    keywords: '图片 压缩 减小 体积 质量 缩放 宽度 jpeg webp png optimize 瘦身 上传前',
  },
  {
    id: 'imageconvert',
    name: '图片格式转换',
    glyph: '图',
    tint: '#3E7A4E',
    cat: 'image',
    desc: 'PNG · JPEG · WebP 互转',
    intro: '在 PNG / JPEG / WebP 之间转换图片格式，透明图转 JPEG 会提示铺白底，转完可直接保存。',
    keywords: '图片 格式 转换 png jpeg jpg webp 互转 后缀 透明 白底',
  },
  {
    id: 'aes',
    name: 'AES 加解密',
    glyph: '盾',
    tint: '#3F5A75',
    cat: 'dev',
    desc: 'AES-128/192/256 · CBC / ECB',
    intro: '纯 JS 手写 Rijndael 分组运算，口令或十六进制密钥、PKCS#7 填充、逐块过程可视，附带 NIST 公开向量当场自检。',
    keywords: 'aes 对称加密 解密 加密 rijndael cbc ecb pkcs7 iv 口令 密钥 分组 cipher 解密工具',
  },
  {
    id: 'useragent',
    name: 'UA 解析',
    glyph: '端',
    tint: '#2F7A8C',
    cat: 'dev',
    desc: '解析 · 生成 · 爬虫识别',
    intro: '拆解任意 User-Agent 的浏览器、内核、系统与设备，识别爬虫令牌，也能按真实版式生成一条 UA 并自检规则。',
    keywords: 'useragent ua user-agent 浏览器 内核 解析 生成 爬虫 spider bot 请求头 兼容',
  },
  {
    id: 'semver',
    name: '语义化版本',
    glyph: '版',
    tint: '#5B6B8C',
    cat: 'dev',
    desc: 'SemVer 解析 · 比较 · 范围',
    intro: '按 SemVer 2.0.0 解析版本号，比较与排序、递增一位，判定 npm 式范围表达式，还能从文本里抓出版本号。',
    keywords: 'semver 语义化 版本 版本号 比较 排序 范围 npm 升级 release 递增',
  },
  {
    id: 'checksum',
    name: 'CRC 校验和',
    glyph: '检',
    tint: '#A8642F',
    cat: 'dev',
    desc: 'CRC8/16/32 · Adler · FNV',
    intro: '一次算出 CRC8、九种 CRC16、CRC32、Adler-32 与 FNV-1a 32/64，支持文本、十六进制、十进制三种字节输入，并用公开已知值当场自检。',
    keywords: 'crc crc8 crc16 crc32 modbus xmodem ccitt adler32 fnv fnv1a 校验和 校验值 多项式 初值 反转 check 字节 固件 通讯',
  },
  {
    id: 'x509',
    name: 'X509 证书',
    glyph: '证',
    tint: '#6B5B95',
    cat: 'dev',
    desc: 'PEM/DER 拆解 · SAN · 指纹',
    intro: '手写 ASN.1 DER 读取器拆开证书：主体与颁发者 DN、有效期、公钥、SAN、全部扩展项，以及和 openssl 一致的 SHA-1/SHA-256 指纹，附吊销列表与私钥头部识别。',
    keywords: 'x509 证书 ssl pem der asn1 解析 指纹 san 备用名称 有效期 颁发者 主体 crl 吊销 ca 公钥 openssl',
  },
  {
    id: 'bitwise',
    name: '位运算',
    glyph: '位',
    tint: '#4F6B8C',
    cat: 'calc',
    desc: '与或非 · 移位 · 位段抽取',
    intro: '8~64 位宽的与、或、异或、非、移位与循环移位，逐位网格点一下就翻转，还能看原码反码补码、抽位段、查常用位模式，超过 32 位走 BigInt 不丢精度。',
    keywords: '位运算 与 或 非 异或 xor and or not 移位 左移 右移 循环移位 掩码 mask 位段 bit 补码 反码 原码 寄存器 标志位',
  },
  {
    id: 'markdown',
    name: 'Markdown 互转',
    glyph: 'M',
    tint: '#4A6FA5',
    cat: 'text',
    desc: 'MD → HTML · HTML → MD',
    intro: '纯手写解析器把 Markdown 渲染成 HTML（标题、表格、代码块、列表、引用全覆盖，原始 HTML 一律转义防注入），反向也能把任意 HTML 转回 Markdown，并给出大纲与统计。',
    keywords: 'markdown md html 转换 渲染 预览 大纲 目录 表格 代码块 readme 转义 xss',
  },
  {
    id: 'exif',
    name: 'EXIF 元数据',
    glyph: '元',
    tint: '#7A6BA8',
    cat: 'image',
    desc: '拍摄信息 · GPS · 一键清除',
    intro: '读本地图片的 EXIF、GPS、相机参数、内嵌缩略图与 PNG 文本块，按分组逐条列出并标注隐私风险，也能一键清除后另存。全程只读本地文件。',
    keywords: 'exif 元数据 图片 信息 gps 位置 相机 光圈 快门 iso 拍摄时间 缩略图 png 文本块 清除 隐私 去水印',
  },
  {
    id: 'pickcolor',
    name: '图片取色',
    glyph: '采',
    tint: '#8C5B3E',
    cat: 'image',
    desc: '点哪儿取哪儿 · 取色板',
    intro: '选一张图，放大镜对准像素点一下就取色，输出 HEX/RGB/HSL 等多种写法，支持手动定位、取色历史与整图取色板建议。',
    keywords: '取色 颜色 吸管 图片 配色 色板 palette hex rgb hsl 放大镜 像素 提取颜色',
  },
  {
    id: 'bodysize',
    name: '尺码换算',
    glyph: '尺',
    tint: '#3F7A6E',
    cat: 'calc',
    desc: '鞋码 · 戒指 · 号型 · 文胸',
    intro: '按公制公式与国标号型系列换算鞋码（含童码与放余量）、戒指圈号、服装 XS~XXXXL 与 175/96A 式号型、文胸中/日/欧/英/美对照，并给出偏码与越界提醒。',
    keywords: '尺码 鞋码 脚长 厘米 欧码 美码 英码 日码 童码 戒指 圈号 港号 服装 号型 xs s m l xl 文胸 罩杯 底围 胸围 腰围 换算 对照表',
  },
  {
    id: 'device',
    name: '设备信息',
    glyph: '机',
    tint: '#4F6B8C',
    cat: 'dev',
    desc: '机型 · 屏幕 · CPU · 电池',
    intro: '在 App 真机上读机型与系统补丁号、物理分辨率与刷新率档位、逐核实时频率、内存与存储占用、电池温度电压与健康度，以及传感器清单；读不到的字段如实显示，不猜。',
    keywords: '设备 信息 机型 型号 厂商 soc 处理器 核心 频率 governor 内存 存储 电量 电池 温度 电压 健康度 屏幕 分辨率 密度 刷新率 高刷 传感器 开机时长 android build',
  },
]

const COMPONENTS = {
  text: ToolText,
  json: ToolJson,
  radix: ToolRadix,
  regex: ToolRegex,
  unit: ToolUnit,
  color: ToolColor,
  loan: ToolLoan,
  health: ToolHealth,
  timestamp: ToolTimestamp,
  datediff: ToolDateDiff,
  password: ToolPassword,
  random: ToolRandom,
  id: ToolId,
  validate: ToolValidate,
  hash: ToolHash,
  diff: ToolDiff,
  case: ToolCase,
  convert: ToolConvert,
  calc: ToolCalc,
  cron: ToolCron,
  jwt: ToolJwt,
  devref: ToolDevRef,
  perm: ToolPerm,
  ip: ToolIp,
  sql: ToolSql,
  cny: ToolCny,
  url: ToolUrl,
  entity: ToolEntity,
  table: ToolTable,
  unicode: ToolUnicode,
  json2ts: ToolJson2ts,
  percent: ToolPercent,
  invest: ToolInvest,
  classic: ToolClassic,
  codefmt: ToolCodefmt,
  ipv6: ToolIpv6,
  totp: ToolTotp,
  lorem: ToolLorem,
  garbled: ToolGarbled,
  normalize: ToolNormalize,
  extract: ToolExtract,
  wordfreq: ToolWordfreq,
  cleanescape: ToolCleanescape,
  hexdump: ToolHexdump,
  braille: ToolBraille,
  qp: ToolQp,
  punycode: ToolPunycode,
  uuidinfo: ToolUuidinfo,
  datefmt: ToolDatefmt,
  httpdump: ToolHttpdump,
  imageinfo: ToolImageinfo,
  imageb64: ToolImageb64,
  imagecompress: ToolImagecompress,
  imageconvert: ToolImageconvert,
  aes: ToolAes,
  useragent: ToolUseragent,
  semver: ToolSemver,
  bases: ToolBases,
  stats: ToolStats,
  numtheory: ToolNumtheory,
  chincal: ToolChincal,
  splitbill: ToolSplitbill,
  taxcn: ToolTaxcn,
  checksum: ToolChecksum,
  x509: ToolX509,
  bitwise: ToolBitwise,
  markdown: ToolMarkdown,
  exif: ToolExif,
  pickcolor: ToolPickcolor,
  bodysize: ToolBodysize,
  device: ToolDevice,
}

export const TOOL_COUNT = TOOLS.length

export function getTool(id) {
  return TOOLS.find((t) => t.id === id) || null
}

export function getComponent(id) {
  return COMPONENTS[id] || null
}

export function toolsByCategory(cat) {
  if (!cat || cat === 'all') return TOOLS
  return TOOLS.filter((t) => t.cat === cat)
}

/** 关键词搜索：命中名称、描述、关键词、分类名 */
export function searchTools(kw) {
  const q = String(kw || '').trim().toLowerCase()
  if (!q) return []
  const catName = {}
  CATEGORIES.forEach((c) => (catName[c.key] = c.name))
  return TOOLS.filter((t) => {
    const hay = [t.name, t.desc, t.intro, t.keywords, catName[t.cat] || '', t.glyph]
      .join(' ')
      .toLowerCase()
    return hay.indexOf(q) > -1
  })
}
