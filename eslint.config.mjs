/**
 * ESLint 扁平配置（flat config）—— ESLint 10
 * ------------------------------------------------------------
 * 为什么需要这个文件，以及几个不写就会踩的坑：
 *
 * 1. **必须显式声明 sourceType: 'module'。**
 *    源码用的是 ESM（import/export），但 package.json 没有 "type": "module"
 *    —— 在 Node 眼里 .js 仍是 CommonJS。ESLint 默认跟随这个判断，
 *    不显式改就会把每一行 import/export 都报成语法错（几百条假错）。
 *
 * 2. **忽略清单里要排除"生成物"。**
 *    scripts/selftest/life/*.mjs 是 run.sh 从 src/utils/*.js 拷出来的
 *    （因为上面第 1 条，.js 不能当 ESM 跑），逐字节相同。扫它等于把同一份代码查两遍，
 *    还会让"改源码忘了重跑"变成假报错。.gitignore 已经忽略它，这里保持一致。
 *
 * 3. **不碰排版。**
 *    排版类（vue/max-attributes-per-line、singleline-html-element-content-newline…）
 *    一律不开：本项目从未格式化过，一开就是 9000+ 条纯格式警告，零 bug 价值，
 *    只会把真正的问题淹掉。所以用 `vue/flat/essential`（只含正确性规则），
 *    **不用** recommended —— 它的 strongly-recommended 那一层几乎全是排版。
 *    要统一格式请另上 Prettier，别混进 lint 门禁。
 *
 * 4. **门禁口径：窄而硬，清完一条升一条。**
 *    首次接入时存量有 112 处「规则有价值、但当时没清」的违规，一律先设 warn、不计入
 *    退出码——当场全设 error 只会逼人加 eslint-disable 绕过，比不接更糟。
 *    之后的规矩是逐条清、清完就升：no-unused-vars 43 处、no-useless-escape 8 处、
 *    preserve-caught-error 11 处已于 2026-09-29 清零并升为 error（见下面的 HARD 段），
 *    剩下 2 条 50 处还在 DEBT 里排队。
 *
 * 5. **@typescript-eslint 在纯 JS 仓库里的真实作用（别误会）。**
 *    现在源码没有 TS、也没有 tsconfig，它的"类型感知规则"（需要类型信息）
 *    **跑不起来**。当前它只提供：用 TS 解析器解析 JS（比默认 espree 更能接受新语法），
 *    以及为将来迁 TS 铺路 —— 到那天加个 tsconfig、把 type-checked 规则集打开即可，零改动。
 *    真正能抓「对字符串取 .zodiac」那类类型错误的仍是 `tsc --checkJs`，不是 ESLint。
 */
import js from '@eslint/js'
import globals from 'globals'
import vue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'

/* uni-app 的运行时全局：App 端由原生运行时注入，既不是浏览器 API 也不是 Node 全局，
   必须单独声明，否则会被 no-undef 全部报成"未定义变量"。 */
const UNI_GLOBALS = {
  uni: 'readonly',
  plus: 'readonly',
  wx: 'readonly',
  getApp: 'readonly',
  getCurrentPages: 'readonly',
  uniCloud: 'readonly',
}

/* 用了 uni-app 条件编译（// #ifdef / // #ifndef）的文件。
   uni-app 编译器会在构建时剥掉这些块，但 ESLint 看的是**原始源码**——
   两个分支都在，于是「前一个分支的 return 之后的代码」被判成 unreachable。
   实测这 8 条 no-unreachable 全部是假阳性，不是死代码。
   新增这类文件时把它加进来即可。 */
const CONDITIONAL_COMPILE_FILES = [
  'src/utils/device.js',
  'src/utils/image.js',
  'src/utils/exif.js',
  'src/utils/clipboard.js',
  'src/utils/theme.js',
]

/* 「存量待清理」：规则本身有价值，但现有代码有违规，先只报警告。
   每条都标了实际处数，清完就能升回 error。 */
const DEBT = {
  /* 17 处，跨 7 个组件。computed 里写另一个 ref（多为 error.value = ...），
     属系统性反模式：当前能工作，但依赖 computed 的求值时机，脆弱。
     （这类问题在本地复核报告里逐条列过；报告住在不入库的 .agent/，这里只留口径不留链接。） */
  'vue/no-side-effects-in-computed-properties': 'warn',
  /* 33 处，多为防御性初始化（`let yearly = 0` 后各分支都赋值）。真实但无害。 */
  'no-useless-assignment': 'warn',
}

/* 已经清零、当场拦的硬门禁。
   no-unused-vars 的 43 处存量于 2026-09-29 清完（死导入 20 处、从没调用过的内部
   辅助与局部 23 处），按本文件第 4 条的约定升回 error——以后再往里塞没用的
   import 或残留变量，CI 直接红，不用等下一个人重新数一遍。
   args 仍留 'none'：回调里位置必需的参数（(f, x) => x 的 f）不是脏代码，报它是噪声。 */
const HARD = {
  'no-unused-vars': ['error', {
    args: 'none',
    varsIgnorePattern: '^_',
    caughtErrors: 'none', // catch 里刻意的落空写法不报
  }],
  /* 同日清完的 11 处：catch 里换成中文 Error 时补上 { cause: e }。
     界面照旧只读 .message，改动对用户不可见，原始异常不再丢。 */
  'preserve-caught-error': 'error',
  /* 同日清完的 8 处。7 处是正则字符类里白写的反斜杠，删掉即可；
     唯独 markdown.js 中文排版示例那 2 处是**缺**转义：那句想教人写 \*，
     而字符串里的 \* 被 JS 折叠成了 *，示例一直在演示错的写法。 */
  'no-useless-escape': 'error',
}

export default [
  /* ---------- 0. 忽略：构建产物、依赖、生成物 ---------- */
  {
    ignores: [
      'dist/**',
      'unpackage/**',
      'node_modules/**',
      'scripts/selftest/life/*.mjs', // run.sh 生成的副本，见文件头第 2 条
      '.agent/**', // agent 的文档、截图与过程记录（原 docs/ 与 .workbuddy-ai/ 都收在这），不是项目代码
    ],
  },

  /* ---------- 1. 基线：ESLint 官方推荐 ---------- */
  js.configs.recommended,

  /* ---------- 2. Vue：正确性那一层（不含排版） ---------- */
  ...vue.configs['flat/essential'],

  /* ---------- 3. 源码：ESM + 浏览器 API + uni-app 全局 ---------- */
  {
    files: ['src/**/*.{js,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module', // 见文件头第 1 条
      globals: { ...globals.browser, ...UNI_GLOBALS },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...DEBT,
      ...HARD,

      /* vue/no-html 在 essential 里没有，单独打开 —— 这是防 XSS 的规则，值得开。
         目前唯一命中是 ToolMarkdown.vue 的 markdown 渲染（有意为之，已在那处
         写了定向豁免并附上安全论证）。 */
      'vue/no-v-html': 'error',

      /* 空 catch / 空块在「探测型」代码里是有意的（试一个 API，不支持就静默跳过）。 */
      'no-empty': ['error', { allowEmptyCatch: true }],

      /* 注意：no-irregular-whitespace 在 .vue 里关掉了，见下面单独一段。 */
      'no-irregular-whitespace': ['error', {
        skipComments: true,
        skipStrings: true,
        skipTemplates: true,
        skipRegExps: true,
      }],
    },
  },

  /* ---------- 4. .vue 模板：关掉「不规则空白」 ----------
     Vue 模板的**文本节点**不在 skipStrings/skipComments/skipTemplates 的覆盖范围内，
     而本项目在 UI 文案里大量使用全角空格 U+3000 做中文排版分隔
     （如 `{{ a }}\u3000{{ b }}`、`'%\u3000'`、`"* 任意\u30005 固定值…"`）。
     实测 19 处命中**全部是 U+3000**，无一处是零宽空格（U+200B）之类的真隐患，
     属有意排版而非错误。为 19 处假阳性保留这条规则不划算，故对 .vue 关闭。
     （.js / .mjs 里仍然开启。） */
  {
    files: ['**/*.vue'],
    rules: { 'no-irregular-whitespace': 'off' },
  },

  /* ---------- 5. 条件编译文件：no-unreachable 必然是假阳性 ---------- */
  {
    files: CONDITIONAL_COMPILE_FILES,
    rules: { 'no-unreachable': 'off' },
  },

  /* ---------- 6. 二进制 / 编码层：正则里的控制字符是必需的 ----------
     src/utils 里有一批工具**本来就要处理控制字符**：
     exif.js 解析二进制段、markdown.js 用 \x00\x01\x02 当占位哨兵、
     punycode.js 按 RFC 3492 匹配 \x00、shortcut.js 处理 \x00。
     实测 8 处命中全部有意，无一处是误写的字符类。 */
  // no-control-regex 不在这里整层关：本项目有 10 处正则刻意匹配控制字符
  // （文本清洗 / 占位符还原 / ASCII 判定 / URL scheme 探测），各自在代码现场
  // 用 eslint-disable-next-line 定点豁免并写明理由 —— 与 cleanescape.js 里
  // 原有的两处风格一致。「为什么这里要匹配控制字符」留在代码旁边，比整层关掉耐读。
  /* ---------- 7. uni-app 页面：组件名不适用多词规则 ----------
     src/pages 下是**页面路由**（index.vue / tool.vue），不是可复用组件，
     单文件多词命名规则在这里没有意义。 */
  {
    files: ['src/pages/**/*.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },

  /* ---------- 8. 自测脚手架与构建配置：Node 环境 ---------- */
  {
    files: ['scripts/**/*.{js,mjs}', 'vite.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...DEBT,
      ...HARD,
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-irregular-whitespace': ['error', {
        skipComments: true, skipStrings: true, skipTemplates: true, skipRegExps: true,
      }],
    },
  },

  /* ---------- 9. .vue 单文件组件 ---------- */
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        /* <script> 块交给 TS 解析器：现在解析的是 JS，
           将来某天写 <script setup lang="ts"> 时这里不用改。 */
        parser: tsParser,
      },
    },
  },
]
