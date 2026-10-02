/**
 * 命名转换（id=case）。这页的坑正是「模块算对了但只印半截」，所以逐行盯 11 种风格的结果：
 *   user_name → userName/UserName/user_name/USER_NAME/user-name/User-Name/user.name/user/name/User Name/User name；
 *   HTTPServer 要切成 HTTP · Server（连续大写缩写）；
 *   中文 用户昵称 原样保留，不强行大小写；
 *   「示例」= getUserByID 要切成 get · User · By · ID 并给全 11 行；
 *   首尾/连续分隔符 --User__Name-- 要归并成两个词；
 *   清空、以及只填分隔符 ___ 都回到「等一个名字」。
 * 期望值全部手算／独立核算过，不是抄模块输出。
 */
import { IN, MINI } from '../harness.mjs'

export default {
  name: 'case',
  id: 'case',
  height: 1400,
  steps: [
    { desc: '下划线输入 user_name：11 种风格一次给全', act: [[IN(0), 'user_name']],
      expect: ['切成词', 'user · name', 'userName', 'UserName', 'user_name', 'USER_NAME', 'user-name',
        'User-Name', 'user.name', 'user/name', 'User Name', 'User name'],
      forbid: ['undefined', 'NaN', '[object Object]'] },

    { desc: '连续大写缩写 HTTPServer → HTTP · Server', act: [[IN(0), 'HTTPServer']],
      expect: ['切成词', 'HTTP · Server', 'httpServer', 'HttpServer', 'http_server', 'HTTP_SERVER',
        'http-server', 'Http-Server', 'http.server', 'http/server', 'Http Server', 'Http server'],
      forbid: ['undefined', 'NaN'] },

    { desc: '中文 用户昵称：原样保留，不被拆开也不改大小写', act: [[IN(0), '用户昵称']],
      expect: ['切成词', '用户昵称'],
      forbid: ['undefined', 'NaN'] },

    { desc: '「示例」按钮 getUserByID：切成 get · User · By · ID', act: [MINI('示例')],
      expect: ['切成词', 'get · User · By · ID', 'getUserById', 'GetUserById', 'get_user_by_id',
        'GET_USER_BY_ID', 'get-user-by-id', 'Get-User-By-Id', 'get.user.by.id', 'get/user/by/id',
        'Get User By Id', 'Get user by id'],
      forbid: ['undefined', 'NaN'] },

    { desc: '首尾/连续分隔符 --User__Name-- 归并成两个词', act: [[IN(0), '--User__Name--']],
      expect: ['切成词', 'User · Name', 'userName', 'UserName', 'user_name', 'USER_NAME', 'user-name',
        'User-Name', 'user.name', 'user/name', 'User Name', 'User name'],
      forbid: ['undefined', 'NaN'] },

    { desc: '「清空」：回到「等一个名字」，转换结果卡收起', act: [MINI('清空')],
      expect: ['等一个名字', '下面会一次给出 11 种风格', 'HTTPServer → HTTP + Server'],
      forbid: ['切成词', 'userName', 'undefined'] },

    { desc: '边界：只填分隔符 ___ 也切不出词，仍是「等一个名字」', act: [[IN(0), '___']],
      expect: ['等一个名字', '识别规则'],
      forbid: ['切成词', 'undefined', 'NaN'] },
  ],
}
