# 随身匣 · PocketKit

一个离线优先的日常工具箱 App。uni-app + Vue 3 + Vite，**只面向 Android 出包**，
H5 只作为开发期的浏览器预览手段（小程序/快应用目标已移除）。

内置 **79 件小工具**，全部本地计算，不联网、不上传、无后端。

首页另有「搞机」页签：电池（电量/状态/温度/电压）、CPU（逐核实时频率与调频策略）、屏幕（物理分辨率/刷新率）、内存存储、传感器清单等整机信息，数据层在 `src/utils/device.js`，App 端经 Native.js 读系统 API，**整页只用到已声明的权限**（其中「摄像头清单」与硬件测试的手电筒共用相机一项，不拍照、不落盘）；H5 预览只显示浏览器放行的部分字段。

工具清单参考了 GitHub 上三个同类项目——[it-tools](https://github.com/CorentinTh/it-tools)（40k+ star，GPL-3.0）、
[CyberChef](https://github.com/gchq/CyberChef)（35k+ star，Apache-2.0，505 个操作）、
[DevToys](https://github.com/DevToys-app/DevToys)（32k+ star，MIT）。
**只参考「该做什么工具」，实现全部自己写**：直接抄代码会把许可证传染过来。

分七类：文本 · 处理 / 编码 · 解码 / 数值 · 计算 / 时间 · 日期 / 开发 · 运维 / 生成 · 校验 / 图片 · 处理。

> 界面截图与过程文档不在版本库里：这批东西统一放本地的 `.agent/`（已 gitignore）。
> 本地想看图就先 `npm run build:h5`，再 `node scripts/screenshot.mjs`，图会落在 `.agent/docs/screenshots/`。
> `playwright-core` 钉在 devDependencies（1.61.1 —— 它要的那个 Chromium 内核正是脚本默认路径里的 `chromium-1228`，版本别乱升）。它只带驱动、不带浏览器内核，也不挂 install 钩子，所以 CI 装它不联网不下内核；本机第一次跑得 `npx playwright-core install chromium` 把内核拉下来。默认路径是 macOS 写法，别的系统把可执行文件路径当第一个参数传：`node scripts/screenshot.mjs /path/to/chrome`。

---

## 一、快速开始

```bash
cd ~/Desktop/pocket-kit
npm install

# 浏览器里预览（开发最快的方式）
npm run dev:h5

# 打包 H5 静态文件
npm run build:h5

# 生成 App 资源（产物在 dist/dev/app 或 dist/build/app）
npm run dev:app
npm run build:app
```

> 项目默认 npm registry 已指向 npmmirror，如果安装慢可以执行
> `npm config set registry https://registry.npmmirror.com`

### 用 HBuilderX 运行 / 打包 Android（推荐）

1. 下载 [HBuilderX](https://www.dcloud.io/hbuilderx.html)（App 开发版）。
2. 菜单 `文件 → 导入 → 从本地目录导入`，选择本目录 `pocket-kit`。
3. 首次打开需要在 `src/manifest.json` 里点「重新获取」生成 **DCloud AppID**（打包必需，免费）。
4. 换掉应用图标：放一张 1024×1024 的**不透明** PNG 到 `unpackage/res/icons/1024x1024.png`，
   图案占画布 52%~61% 之间最合适（现在是 51%，安全但偏小，只会在桌面显得小一圈）。
5. 真机调试：手机开 USB 调试 → 菜单 `运行 → 运行到手机或模拟器`。
6. 打包 APK：菜单 `发行 → 原生App-云打包`，选择 Android，使用公共测试证书即可出包；
   上线应用商店则需要自己生成签名证书（见下）。
   注意上架 Google Play 要求 `targetSdkVersion` ≥ 36（2026-08-31 起），
   并且要用 HBuilderX 5.09+ 打包（逐步流程在本地文档 `.agent/docs/打包安卓.md`，这个目录不入库）。

### 用命令行打包 Android（离线打包）

```bash
npm run build:app          # 产出 dist/build/app
```

然后把 `dist/build/app` 目录导入 HBuilderX，
用 `发行 → 原生App-本地打包 → 生成本地打包App资源`，
再配合 [Android 离线打包 SDK](https://nativesupport.dcloud.net.cn/AppDocs/download/android)
用 Android Studio 出 APK。第一次做建议直接用云打包，省去配置 NDK 的麻烦。

### GitHub Actions（自动到资源为止，不出 APK）

`.github/workflows/android.yml`：push 到 `main`、提 PR 或手动触发时跑
`npm ci → lint → check:docs → test → build:h5 → build:app`，最后把 `dist/build/app` 传成 artifact。
界面探针（下面那条 `probe:h5`）**不在 CI 里**：CI 那台 ubuntu runner 没有 Chrome，
为了它再拉一层浏览器不值得；探针验的是「用户看得见的那行字」，本地改完界面顺手跑一次就够。

APK 那一步不在里面，也不是漏写：DCloud 的云打包没有可供 CI 调用的接口，
离线打包 SDK 又要登录下载且不许再分发。要让 CI 直接出 APK，得先把离线 SDK 私有托管
（私有仓库或 Actions artifact）并把 keystore 放进 Secrets，或者把自建 runner 挂在
装了 HBuilderX 的 Mac 上；细节在本地文档 `.agent/docs/打包安卓.md` 的「路线 C」。

要拿打包好的 App 资源，不用本地再构建一遍，每次运行的 artifact 就是：

- 名字是 `pocket-kit-app-<这次提交的完整 sha>`，`zip` 压完 755 KB（本地 `du` 出来的 2.6M 是解压后的尺寸），
  保留 14 天，过期条目会标 `expired` 就下不动了。
- 网页：Actions → 选那次运行 → 页面底部 Artifacts 里点名字直接下。
- 命令行：下载接口匿名请求返 **401**——仓库是公开的，但 artifact 不给匿名下，得带身份。
  run id 就是运行页面 URL 末尾那串数字；一次运行只有这一个 artifact，所以直接把它的
  下载地址抓出来（token 要有 Actions 读权限：fine-grained 勾 `Actions`，classic 用 `repo`）：

  ```bash
  URL=$(curl -s -H "Authorization: Bearer $TOKEN" \
    https://api.github.com/repos/yycqyjq/pocket-kit/actions/runs/<run_id>/artifacts \
    | grep -o 'https://api.github.com/[^"]*/actions/artifacts/[0-9]*/zip')
  curl -L -H "Authorization: Bearer $TOKEN" -o pocket-kit-app.zip "$URL"
  ```

  别用 `grep -o '"id": [0-9]*'` 去抠 id——同一段 JSON 里 `workflow_run` 自己也带一个 `id`，
  抓到的可能是 run id 而不是 artifact id。

### 开发脚本（本地）

| 命令 | 干什么 |
| --- | --- |
| `npm test` | 全量自查：自动发现 `scripts/selftest/**/*.test.mjs` 逐套运行；条码与二维码拿 zbarimg / magick 当外部判官，缺判官的套件会 SKIP 并在汇总里点名 |
| `npm run verify` | 收尾一条跑齐：`lint` → `check:docs` → `test`，与 CI 的三道门禁同序。CI 那三步一个都没少，这条只是让本地不用记顺序。**注意 Node 版本要跟 `.nvmrc` 一致**（CI 读同一份）——判据里有拿 Node 自带实现当判官的（ICU、`node:punycode`），版本不一致会出现本地绿、CI 红 |
| `npm run probe:h5` | 界面探针：自己起一个静态服务器（不依赖 python、不用另开终端），用 `playwright-core` 打开 `dist/build/h5`，逐条真点一遍并断言**页面上渲染出来的那行字**——模块返回值对了不等于用户看得见（有过算对了却被组件丢掉一半的例子）。`npm run probe:h5 -- ip url` 只跑名字里带这两个的；`PK_CHROME=/可执行文件路径` 换浏览器；跑之前先 `npm run build:h5`，探针验的就是那份产物。清单在 `scripts/ui-probe/probes/`，一个工具一个文件，公共骨架（服务器、找 Chrome、点输入框、抓 innerText）在 `harness.mjs` 一份 |
| `npm run check:docs` | README 工具表 ↔ 注册表 ↔ manifest 三方对撞，件数漂移当场报错；顺带查两件事——全仓库零引用的导出（lint 的 `no-unused-vars` 只看得见「本文件内没用到」，看不见「没人 import」），以及每个 util 有没有被某个自查用例直接装载（新增模块必须带用例，欠账清单只许缩短） |
| `npm run lint` | ESLint 静态检查（配置见 `eslint.config.mjs`）。**只卡正确性、不卡排版**；首次接入时那 112 处存量（`no-unused-vars` 43、`no-useless-assignment` 33、`vue/no-side-effects-in-computed-properties` 17、`preserve-caught-error` 11、`no-useless-escape` 8）已于 2026-09-29/09-30 逐条清零，五条全部升为 error——现在 lint 是 0 error / 0 warning，往里塞同类问题当场就红，`npm run lint:fix` 可自动修其中一部分 |
| `node scripts/screenshot.mjs` | 构建后整批重拍界面截图，写到 `.agent/docs/screenshots/`（先起 `python3 -m http.server 4173 --directory dist/build/h5`）。依赖 devDependencies 里的 `playwright-core`，浏览器内核要自己拉一次，见上一节说明 |

---

## 二、内置工具

| 分类 | 工具 | 能做什么 |
| --- | --- | --- |
| 文本 · 处理 | **文本工坊** | 字数/段落/单词统计、阅读耗时、17 种批量整理（去重、排序、去空行、加行号、去 HTML…）、URL 与 Base64 编解码（含 URL 安全变体）、中文转拼音首字母 |
| 文本 · 处理 | **文本对比** | 逐行差异对比，标出新增与删除，给出相似度与首个差异的字符级高亮 |
| 文本 · 处理 | **命名转换** | 驼峰/下划线/短横线/常量等 11 种命名风格互转，能识别连续大写缩写，中文原样保留 |
| 文本 · 处理 | **表格对齐** | CSV/TSV 排成等宽表格，中文按两列宽计算，可加边框或转 Markdown |
| 文本 · 处理 | **文本抽取** | 从日志、聊天记录、文档里捞出网址、邮箱、手机号、IPv4、日期、金额、UUID 等 16 类信息 |
| 文本 · 处理 | **词频统计** | 中英文词频与字频、字符构成、段落句子数、词汇丰富度，可忽略「的/了/the」这类虚词 |
| 文本 · 处理 | **文本清洗** | 清掉终端色码（ANSI）、零宽字符、控制字符与全角空格，专治从网页/PDF 复制来的脏文本 |
| 文本 · 处理 | **Markdown 互转** | MD → HTML · HTML → MD |
| 编码 · 解码 | **JSON 工坊** | 格式化 / 压缩 / 校验，报错定位到行列，结构体检（层级、键数、空值、顶层字段类型） |
| 编码 · 解码 | **进制转换** | 2/8/10/16/32/36 进制互转，二进制分组、按字节视图、补码与取反、ASCII 码互查 |
| 编码 · 解码 | **正则速查** | 6 组约 40 条常用表达式，可一键载入并实时高亮匹配结果 |
| 编码 · 解码 | **URL 解析** | 拆解协议/主机/端口/路径/参数/锚点，编解码，以及把可疑链接「无害化」 |
| 编码 · 解码 | **HTML 实体** | 命名 / 十进制 / 十六进制三种写法的转义与反转义，还能一键剥标签取纯文本 |
| 编码 · 解码 | **Unicode 码点** | 逐字符看码点、UTF-8 字节、UTF-16 码元，并揪出零宽空格这类看不见的字符 |
| 编码 · 解码 | **古典密码** | 凯撒（含 26 种暴力枚举）/ ROT13 / ROT47 / 栅栏 / A1Z26 / Atbash / 培根 / 摩斯 |
| 编码 · 解码 | **乱码恢复** | 按各种编码组合暴力尝试，并按「像不像正常文字」排序，还原 GBK/UTF-8/Big5/Latin-1 混用造成的乱码 |
| 编码 · 解码 | **Unicode 规范化** | NFC / NFD / NFKC / NFKD 四种形式对比，解释「看起来一样但 `===` 不相等」的原因 |
| 编码 · 解码 | **十六进制** | 文本 ↔ 十六进制互转，并生成带偏移量与 ASCII 列的 hexdump 转储视图 |
| 编码 · 解码 | **盲文转换** | 英文与数字转六点盲文，逐字符展示点位编号，也能从 Unicode 盲文字符解码 |
| 编码 · 解码 | **QP 编解码** | 邮件正文的 Quoted-Printable 编解码，支持软换行，能定位不完整的转义序列 |
| 编码 · 解码 | **国际化域名** | 中文域名 ↔ Punycode（`xn--`）互转，附带同形异义钓鱼攻击的说明 |
| 编码 · 解码 | **字母表编码** | Base32 / Base58 / Base62 / Base64url 互转，按规范实现，讲清各自场景与填充规则 |
| 数值 · 计算 | **单位换算** | 11 大类：长度/面积/体积/重量/数据/速度/时间/压力/能量/角度/温度，共 100 个单位，含市制（斤/两/里/丈/尺/寸）与英制单位 |
| 数值 · 计算 | **色彩工坊** | HEX/RGB/HSL 互转、RGB 滑杆调节、WCAG 对比度评级、4 种配色方案、9 级明度阶梯、相近中文色名 |
| 数值 · 计算 | **还款试算** | 等额本息 / 等额本金对比、逐期还款计划、提前还款效果（缩短期限 vs 降低月供）、可省利息 |
| 数值 · 计算 | **身体数据** | BMI（中国成人标准）、理想体重区间、BMR、TDEE 与减脂/维持/增肌热量、体脂率、腰高比、每日饮水 |
| 数值 · 计算 | **表达式计算** | 带括号与优先级的求值：四则、幂、阶乘、三角、对数、多参函数，角度弧度可切 |
| 数值 · 计算 | **金额大写** | 数字转人民币财务大写（壹贰叁），零的补位按银行规范处理，也支持纯整数中文读法 |
| 数值 · 计算 | **百分比计算** | 占比 / 求部分 / 涨跌幅 / 增减 / 比较 / 折扣 / 百分点 / 含税互算，八种场景一次算清 |
| 数值 · 计算 | **复利与投资** | 复利终值、每月定投的逐年明细、从期初期末反推年化，附 72 法则 |
| 数值 · 计算 | **统计工坊** | 加权平均、分位数、方差与标准差、线性回归与相关系数，口径写明 |
| 数值 · 计算 | **数论工具箱** | 素性判定、质因数分解、GCD/LCM、欧拉函数、完全数亲和数与罗马数字互转 |
| 数值 · 计算 | **账单分摊** | 多人 AA 分摊，支持税、折扣、小费与抹零，算出谁该给谁钱并发群文本 |
| 数值 · 计算 | **个税速算** | 月薪到手与五险一金、年度综合所得、专项附加扣除、累计预扣逐月表、年终奖对比 |
| 数值 · 计算 | **位运算** | 与或非 · 移位 · 位段抽取 |
| 数值 · 计算 | **尺码换算** | 鞋码 · 戒指 · 号型 · 文胸 |
| 时间 · 日期 | **时间戳** | 秒/毫秒自动识别互转、时区、ISO 8601、相对时间、年内第几天/第几周、常用时间点速查 |
| 时间 · 日期 | **日期推算** | 日期间隔、工作日统计、日期加减、精确年龄、下次生日、生肖与星座 |
| 时间 · 日期 | **Cron 表达式** | 五段式解析成人话、推演未来 10 次执行时间，还能按节奏反向生成 |
| 时间 · 日期 | **日期格式互转** | strftime / Java / moment / Go 四种记法互转，给出各语言示例输出并解释大小写陷阱 |
| 时间 · 日期 | **农历历书** | 公历农历双向换算，干支生肖、二十四节气、十二时辰与历书摘要，生日一并推算 |
| 时间 · 日期 | **世界时钟** | 多城市当前时刻、时间戳换算、两城时差与工作时段重叠度、共同会议时段与逐小时对照表 |
| 开发 · 运维 | **哈希工坊** | MD5 / SHA-1 / SHA-256 / SHA-512 一次算全，另带 HMAC 带密钥摘要与安全性说明 |
| 开发 · 运维 | **格式互转** | JSON / CSV / Markdown 表格 / XML / YAML / TOML 六种格式任意互转，解析报错定位到行列 |
| 开发 · 运维 | **JWT 解析** | 解开头部与载荷、翻译标准声明、判断是否过期、识别签名算法家族 |
| 开发 · 运维 | **Linux 权限** | chmod 数字与符号互转、逐位解读、SUID/SGID/Sticky 说明与危险组合检查 |
| 开发 · 运维 | **IP 子网** | CIDR 解析、可用地址范围、掩码互转、拆分子网、区间合并成网段 |
| 开发 · 运维 | **SQL 格式化** | 把一坨 SQL 排成易读格式或压成一行，字符串、引号标识符与注释不会被破坏 |
| 开发 · 运维 | **开发速查** | 32 个 HTTP 状态码、9 个方法、30 类 MIME、37 个常用端口、24 条 Git 命令，可搜索 |
| 开发 · 运维 | **JSON 转 TS** | 从真实 JSON 反推 TypeScript 接口，数组合并联合类型，缺失字段标可选 |
| 开发 · 运维 | **代码美化** | HTML 与 CSS 的排版与压缩，字符串、注释、pre 内容都不会被破坏 |
| 开发 · 运维 | **IPv6 规范化** | 压缩与展开互转、地址类型判断、内嵌 IPv4 识别、按 /64 拆网络与接口部分 |
| 开发 · 运维 | **两步验证码** | 按 RFC 6238 本地算 TOTP/HOTP，也能校验一个码落在哪个时间窗 |
| 开发 · 运维 | **UUID 解析** | 解析版本与变体，v1/v6/v7 还能读出生成时间，并给出版本选型建议 |
| 开发 · 运维 | **HTTP 报文解析** | 把原始请求/响应拆成起始行、逐个头部（带说明）、Cookie、正文类型判断与安全提醒 |
| 开发 · 运维 | **AES 加解密** | AES-128/192/256 的 CBC / ECB 加解密，口令或十六进制密钥、PKCS#7 填充，附 NIST 公开向量当场自检 |
| 开发 · 运维 | **UA 解析** | 拆解 User-Agent 的浏览器、系统、设备与爬虫令牌，可生成 UA 并跑规则自检 |
| 开发 · 运维 | **语义化版本** | SemVer 解析、比较排序、递增与 npm 式范围判定，可从文本里抓版本号 |
| 开发 · 运维 | **CRC 校验和** | CRC8/16/32 · Adler · FNV |
| 开发 · 运维 | **X509 证书** | PEM/DER 拆解 · SAN · 指纹 |
| 开发 · 运维 | **设备信息** | 机型 · 屏幕 · CPU · 电池 |
| 开发 · 运维 | **定位与坐标** | WGS-84 / GCJ-02 / BD-09 三套坐标系互转与对照、度分秒写法、剪贴板解析、两点距离与方位角，也能取一次系统定位 |
| 开发 · 运维 | **传感器实验室** | 加速度、指南针、陀螺仪、设备姿态、光线与接近传感器逐个接上实时读数，带水平仪气泡与方位表盘，离开页面自动停 |
| 开发 · 运维 | **硬件测试** | 震动（含强度）· 闪光灯定时 · 屏幕常亮与亮度 · 扬声器与左右声道，测试音由本机按采样率现算（正弦/扫频/白噪声），另读媒体音量档位 |
| 开发 · 运维 | **屏幕测试** | 纯色轮播找坏点、多级灰阶看过渡、网格斜线与条纹判变形，再按 3×4 统计触摸覆盖率与盲区格，给出物理分辨率与屏幕比例 |
| 开发 · 运维 | **快捷唤起** | 把号码、邮箱、经纬度、包名校验干净后拼成一条 URI，唤起拨号盘、短信、邮件、地图落点、应用商店与 19 页系统设置，唤起前原文回显 |
| 生成 · 校验 | **密码生成** | 字符集与长度策略、易混淆字符过滤、信息熵与爆破耗时估算、批量生成、强度自测 |
| 生成 · 校验 | **随机抽屉** | 区间随机数（可去重）、名单抽签、随机分组、洗牌、硬币与骰子（带分布统计） |
| 生成 · 校验 | **标识生成** | UUID v4、短标识、24 位十六进制、32 位无符号整数、类雪花 ID、流水号、自定义字符集 |
| 生成 · 校验 | **校验台** | 12 类校验：手机号/身份证/银行卡/邮箱/网址/IPv4/MAC/IMEI/统一社会信用代码/车牌/邮编/中文姓名，通过后解析出可用信息，支持批量 |
| 生成 · 校验 | **占位文本** | 按段落 / 句子 / 字数生成中英文占位文本，用来撑版面、检查折行 |
| 图片 · 处理 | **图片信息** | 读出像素尺寸、纵横比、文件大小、类型与是否含透明通道，一眼看清一张图的基本盘 |
| 图片 · 处理 | **图片 Base64** | 图片转 dataURL 文本方便内联，也能把粘贴来的 Base64 还原成图片预览并估算大小 |
| 图片 · 处理 | **图片压缩** | 限制最大宽度、调质量、选输出格式，实时看压缩前后的体积变化，全程本地不上传 |
| 图片 · 处理 | **图片格式转换** | PNG / JPEG / WebP 互转，透明图转 JPEG 会提示铺白底，转完可直接保存 |
| 图片 · 处理 | **EXIF 元数据** | 拍摄信息 · GPS · 一键清除 |
| 图片 · 处理 | **二维码** | 文本 / Wi-Fi / 名片 → 码，本机生成、可缩放导出 |
| 图片 · 处理 | **条形码** | Code 39 / Code 128 / EAN-13 / EAN-8 / UPC-A 五种一维码本机生成，校验位自动补齐或复核，模块宽度、高度、静区与可读文字可调 |
| 图片 · 处理 | **图片取色** | 选一张图，放大镜对准像素点一下就取色，输出 HEX/RGB/HSL 等多种写法，支持手动定位、取色历史与整图取色板建议。 |

---

## 三、目录结构

```
pocket-kit/
├── index.html
├── vite.config.js
├── package.json
├── README.md
├── .agent/                  # 不入库，只在本机：agent 写的文档、报告、截图都收在这
│   ├── docs/                #   架构说明 / 打包安卓 / 样式修正记录 / 体检报告 / 第四批工具说明
│   │   └── screenshots/     #   真实渲染截图（由 scripts/screenshot.mjs 本地生成）
│   └── workbuddy-ai/        #   另一个工具的会话记录
└── src/
    ├── main.js              # 应用入口
    ├── App.vue              # 全局主题变量与基础样式
    ├── pages.json           # 路由与窗口配置（仅两个页面）
    ├── manifest.json        # 应用信息、Android 权限、打包配置
    ├── uni.scss             # uni-app 内置样式变量
    ├── static/              # 静态资源
    ├── utils/               # 纯逻辑层，零依赖、可单测
    │   ├── sys.js           #   状态栏 / 安全区 / 屏幕尺寸
    │   ├── storage.js       #   本地存储：主题、收藏、记录、设置
    │   ├── theme.js         #   深浅色主题单例
    │   ├── clipboard.js     #   复制、提示、震动反馈
    │   ├── device.js        #   搞机页签数据层：电池/CPU/屏幕/内存/传感器（App 走 Native.js）
    │   ├── base64.js        #   手写 Base64（不依赖 btoa/atob）
    │   ├── text.js          #   文本统计与批量整理
    │   ├── date.js          #   日期时间计算
    │   ├── radix.js         #   进制转换（BigInt，带降级）
    │   ├── color.js         #   色彩计算与对比度
    │   ├── random.js        #   随机数、密码、ID 生成
    │   ├── unit.js          #   单位换算数据表与换算逻辑
    │   ├── finance.js       #   还款计算
    │   ├── health.js        #   身体数据公式
    │   ├── validate.js      #   12 类校验器
    │   ├── regexlib.js      #   常用正则库
    │   ├── hash.js          #   MD5/SHA-1/SHA-256/SHA-512 与 HMAC（手写）
    │   ├── cny.js           #   金额中文大写
    │   ├── naming.js        #   命名风格拆分与转换
    │   ├── diff.js          #   行级 LCS 差异
    │   ├── expr.js          #   表达式解析求值（递归下降）
    │   ├── cron.js          #   Cron 解析与执行时间推算
    │   ├── jwt.js           #   JWT 解码（不验签）
    │   ├── dataconv.js      #   六种数据格式互转
    │   ├── ip.js            #   IPv4 子网计算
    │   ├── perm.js          #   Linux 权限解析
    │   ├── sqlfmt.js        #   SQL 排版
    │   ├── devref.js        #   状态码/MIME/端口/Git 速查表
    │   ├── totp.js          #   Base32 + TOTP/HOTP（RFC 4226 / 6238）
    │   ├── url.js           #   URL 拆解与编解码
    │   ├── entity.js        #   HTML 实体
    │   ├── unicode.js       #   Unicode 码点分析
    │   ├── table.js         #   文本表格对齐（含中日韩双宽）
    │   ├── json2ts.js       #   JSON 反推 TypeScript
    │   ├── percent.js       #   八类百分比场景
    │   ├── invest.js        #   复利与定投
    │   ├── classic.js       #   古典密码八种
    │   ├── codefmt.js       #   HTML / CSS 美化与压缩
    │   ├── ipv6.js          #   IPv6 规范化
    │   ├── lorem.js         #   占位文本生成
    │   ├── garbled.js       #   乱码恢复（编码组合暴力尝试 + 可读性排序）
    │   ├── normalize.js     #   Unicode NFC/NFD/NFKC/NFKD 规范化
    │   ├── extract.js       #   从文本里抽取 16 类结构化信息
    │   ├── wordfreq.js      #   词频 / 字频 / 词汇丰富度
    │   ├── cleanescape.js   #   清终端色码、零宽字符、控制符
    │   ├── hexdump.js       #   文本 ↔ 十六进制 ↔ 转储视图
    │   ├── braille.js       #   英文一级盲文编解码
    │   ├── qp.js            #   Quoted-Printable 编解码
    │   ├── punycode.js      #   国际化域名 ↔ xn--
    │   ├── uuidinfo.js      #   UUID 版本 / 变体 / 时间戳解析
    │   ├── datefmt.js       #   strftime / Java / moment / Go 格式串互转
    │   ├── httpdump.js      #   HTTP 请求 / 响应报文解析
    │   ├── aes.js           #   AES-128/192/256 CBC·ECB（手写，带 NIST 公开向量）
    │   ├── bases.js         #   Base32 / base32hex / Base58 / Base62 / base64url
    │   ├── checksum.js      #   CRC-8/16/32 · Adler · FNV 校验和
    │   ├── x509.js          #   X.509 证书 PEM/DER → 字段、SAN、指纹
    │   ├── semver.js        #   SemVer 解析、比较、递增与范围判定
    │   ├── useragent.js     #   User-Agent 解析与生成
    │   ├── bitwise.js       #   8/16/32/64 位下的位运算与位段抽取
    │   ├── markdown.js      #   Markdown 子集解析 / 反向转换 / 大纲
    │   ├── numtheory.js     #   素性、质因数、GCD/LCM、欧拉函数、罗马数字
    │   ├── stats.js         #   描述统计：分位数、方差、线性回归
    │   ├── splitbill.js     #   多人账单分摊与找零撮平
    │   ├── taxcn.js         #   大陆个税与社保速算、累计预扣
    │   ├── bodysize.js      #   鞋码 / 戒指 / 服装 / 文胸换算
    │   ├── worldclock.js    #   世界时钟、时差与共同工作时段
    │   ├── chincal.js       #   农历、二十四节气、干支生肖
    │   ├── image.js         #   图片信息 / 压缩 / 格式转换（Canvas）
    │   ├── qrcode.js        #   二维码编码与配套最小解码
    │   ├── barcode.js       #   Code 39 / Code 128 / EAN-13 / EAN-8 / UPC-A
    │   ├── exif.js          #   EXIF 解析（手写 JPEG 段扫描 + TIFF）与清除
    │   ├── pickcolor.js     #   图片取色与整图色板建议
    │   │                    # ── 「安卓原生」一组：native.js 是共用降级层，其余是各工具的计算层 ──
    │   ├── native.js        #   ★ uni/plus 能力探测、Promise 包装与中文降级话术
    │   ├── geo.js           #   WGS-84 / GCJ-02 / BD-09 互转、距离方位角
    │   ├── sensor.js        #   传感器读数整理与判读阈值
    │   ├── hardware.js      #   测试音 WAV 合成、亮度与震动档位口径
    │   ├── screen.js        #   坏点图序、灰阶递进、几何图与触摸网格归属
    │   └── shortcut.js      #   号码/邮箱/坐标/包名校验与 URI 拼装
    ├── components/          # 通用 UI 组件
    │   ├── GearHub.vue      #   搞机页签：设备信息中枢（配合 utils/device.js）
    │   ├── PkPage.vue       #   页面外壳（导航栏 + 安全区）
    │   ├── PkNavBar.vue     #   自定义导航栏
    │   ├── PkCard.vue       #   卡片
    │   ├── PkField.vue      #   输入框 / 文本域
    │   ├── PkRow.vue        #   结果行（带复制按钮）
    │   ├── PkSeg.vue        #   分段选择器
    │   ├── PkBtn.vue        #   按钮
    │   ├── PkGlyph.vue      #   单字图标块
    │   ├── PkSwitchRow.vue  #   设置开关行
    │   └── PkEmpty.vue      #   空状态
    ├── tools/
    │   ├── registry.js      #   ★ 工具注册表（新增工具只改这里）
    │   └── components/      #   79 个工具组件（全部接入）
    └── pages/
        ├── index/index.vue  # 主壳：工具 / 搞机 / 收藏 / 记录 / 设置 五个页签
        └── tool/tool.vue    # 工具详情容器（按 id 动态渲染组件）
```

---

## 四、怎么再加一个工具

三步，五分钟：

1. 新建 `src/tools/components/ToolXxx.vue`，正常写 Vue 3 组件即可，
   直接用 `@/components/PkCard.vue`、`PkField.vue`、`PkRow.vue` 这些现成组件，样式会自动跟随主题。
2. 在 `src/tools/registry.js` 顶部 `import ToolXxx from './components/ToolXxx.vue'`。
3. 在 `TOOLS` 数组里加一条：

```js
{
  id: 'xxx',                     // 唯一标识，也是路由参数
  name: '工具名',
  glyph: '某',                    // 网格上显示的单字
  tint: '#3F7A6E',               // 单字块配色
  cat: 'text',                   // 见 CATEGORIES
  desc: '一句话副标题',
  intro: '工具页底部的详细说明',
  keywords: '搜索关键词 空格分隔',
}
```

最后在 `COMPONENTS` 里加一行 `xxx: ToolXxx`。

首页网格、搜索、分类计数、收藏、最近使用都会自动带上这个新工具，**不需要改任何页面代码**。

---

## 五、设计约定

- **浅色为主**：米白纸底（`#F6F4EF`）+ 青瓷绿主色（`#3F7A6E`），深色模式为墨黑底（`#14171A`）+ 提亮的青瓷（`#6BB3A3`）。
- **全部颜色走 CSS 变量**，定义在 `src/App.vue` 的 `page{}` 与 `.theme-dark{}` 里。
  页面根节点挂 `theme-dark` 类即可整体换肤，不要在组件里写死颜色。
  目前只有两类例外：每件工具的品牌 `tint`（注册表里那一个色），以及屏幕测试的
  考卷色值——坏点、灰阶、几何线必须是精确的 RGB，跟着主题走就没法判读了。
- **导航栏自定义**：`pages.json` 里两个页面都是 `navigationStyle: "custom"`，
  用 `PkNavBar` 自行绘制，这样才能完全控制配色与留白。
- **工具页单容器**：所有工具共用 `pages/tool/tool.vue`，靠 `id` 动态渲染组件。
  好处是导航栏、收藏按钮、使用记录只写一次；代价是首包会包含全部工具（79 个纯逻辑组件体积很小，可接受）。
- **逻辑与视图分离**：所有计算都放在 `src/utils/` 里，是纯函数，
  改公式、加公式只动这一层，也方便单独写测试。
- **零外部依赖**：不引入 UI 库、不引入 moment/lodash 之类，避免 App 端兼容问题，
  也让包体保持在很小的水平。Base64、UTF-8 编解码、随机数都是手写的。

---

## 六、数据与隐私

- 收藏、使用记录、偏好设置只写入本机 `uni.setStorageSync`，不上传任何服务器。
- 应用自身不发网络请求、没有后端，所有计算与渲染都在本机完成。唯一会把内容交出去的是
  「快捷唤起」：它只把一条 URI 递给系统，之后的事发生在拨号盘、短信、邮件、地图、商店这些
  别的应用里，并且要你在对方界面上确认；唤起前页面会原文回显这条 URI。
- Android 权限共 **7 项**。其中 4 项是普通级（装即授、不弹窗）：网络状态、
  Wi-Fi 状态（搞机页的链路速率与频段）、震动、唤醒锁。
  另外 3 项是危险级，只在点到对应功能时才弹系统授权框，拒绝后其余部分照常可用：
  精确定位与粗略位置（定位与坐标、快捷唤起的「取当前位置」）、
  相机（**只用于手电筒开关与镜头清单，不拍照、不录像、不落盘、不读相册**）。
- 定位结果只在当页显示，不写本地存储、不上传；屏幕测试与触摸统计同样不落盘。
- 密码生成使用「时间戳 + 计数器 + Math.random」混合播种的随机源。
  日常抽签、生成临时密码足够；若要用于生产环境密钥，请自行接入更安全的随机源。

---

## 七、已知边界

- 工作日统计按自然周末计算，**不含法定节假日与调休**（调休安排以官方公告为准，本机没有这份数据）。
- 体脂率、基础代谢均为公式估算（Deurenberg / Mifflin-St Jeor），误差 ±4% 左右，不构成医学建议。
- HashMap 之外的精确计算（进制转换）依赖 `BigInt`；极老的 Android WebView 上会自动降级为 Number，超大整数会提示精度不足。
- 传感器实验室、硬件测试、屏幕测试、定位与坐标、快捷唤起这五件以真机判读为准：
  开发期的 H5 预览里没有 `plus`，但 uni 那一半不全是空的：震动、屏幕常亮、加速度计与指南针
  在预览里是真通的（`native.js` 那张与 uni-h5 对过账的字面量表在兜底，走网页的运动与方向事件）。
  闪光灯、镜头清单、屏幕亮度、陀螺仪与光线接近、以及拨号短信地图商店的唤起链路只能上机验；
  这些均按「代码分支 + 能力探测」写完，等打包后在设备上逐项自测。
