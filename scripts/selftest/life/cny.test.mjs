/** 金额中文读法的自查：期望值按《正确填写票据和结算凭证的基本规定》的写法规格手推，
 *  例：￥1409.5 → 壹仟肆佰零玖元伍角、￥107.53 → 壹佰零柒元伍角叁分。 */
import { useUtils } from '../harness.mjs'
const C = await useUtils('cny')

let ok = 0
let fail = 0
function is(a, b, m) {
  if (a === b) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b))
  }
}
function throws(fn, msg, m) {
  try {
    fn()
    fail++
    console.log('FAIL ' + m + ': should throw')
  } catch (e) {
    if (msg && e.message !== msg) {
      fail++
      console.log('FAIL ' + m + ': message got ' + JSON.stringify(e.message) + ' want ' + JSON.stringify(msg))
    } else ok++
  }
}

/* ---------- 财务大写 ---------- */
is(C.toChineseUpper('1234.56'), '壹仟贰佰叁拾肆元伍角陆分', '常规')
is(C.toChineseUpper('1409.5'), '壹仟肆佰零玖元伍角', '规范例子：中间零')
is(C.toChineseUpper('107.53'), '壹佰零柒元伍角叁分', '规范例子：拾位后补零')
is(C.toChineseUpper('1000'), '壹仟元整', '整元写「整」')
is(C.toChineseUpper('10001'), '壹万零壹元整', '万位断档补零')
is(C.toChineseUpper('100.05'), '壹佰元零伍分', '有角无分时元角之间补零')
is(C.toChineseUpper('20.08'), '贰拾元零捌分', '同上')
is(C.toChineseUpper('0.05'), '零元伍分', '元位为零')
is(C.toChineseUpper('0.54'), '零元伍角肆分', '角分都有')
is(C.toChineseUpper('0'), '零元整', '零')
is(C.toChineseUpper('10.5'), '壹拾元伍角', '角结尾不写整')
is(C.toChineseUpper('123456789.01'), '壹亿贰仟叁佰肆拾伍万陆仟柒佰捌拾玖元零壹分', '亿级分组')
is(C.toChineseUpper('1000000'), '壹佰万元整', '百万')
is(C.toChineseUpper('100000000'), '壹亿元整', '亿')
is(C.toChineseUpper('1000000000000000'), '壹仟万亿元整', '上界 10^15')
is(C.toChineseUpper('-100'), '负壹佰元整', '负数')
is(C.toChineseUpper('105'), '壹佰零伍元整', '十位为零')
is(C.toChineseUpper('1010'), '壹仟零壹拾元整', '百位为零')
is(C.toChineseUpper('￥1,234.50'), '壹仟贰佰叁拾肆元伍角', '带符号与千分位逗号')

/* 四舍五入到分：第三位决定进位，进位可以穿透到整数位 */
is(C.toChineseUpper('1.005'), '壹元零壹分', '1.005 → 1.01')
is(C.toChineseUpper('1.004'), '壹元整', '1.004 → 1.00')
is(C.toChineseUpper('9.999'), '壹拾元整', '进位穿到元')
is(C.toChineseUpper('0.009'), '零元壹分', '分位由厘进上来')
is(C.toChineseUpper('99.995'), '壹佰元整', '连续进位')

/* ---------- 小写读法 ---------- */
is(C.toChineseLower('1234.56'), '一千二百三十四元五角六分', '小写常规')
is(C.toChineseLower('10.5'), '十元五角', '「一十」读作「十」')
is(C.toChineseLower('0'), '零', '零元只说零')
is(C.toChineseLower('-100'), '负一百元整', '小写负数')
is(C.toChineseLower('1000000'), '一百万元整', '小写百万')

/* ---------- 纯整数读法（页码、序号）---------- */
is(C.numberToChinese('2024', false), '二千零二十四', '小写整数')
is(C.numberToChinese('2024', true), '贰仟零贰拾肆', '大写整数')
is(C.numberToChinese('15', false), '十五', '一十打头')
is(C.numberToChinese('15', true), '壹拾伍', '大写不省「壹」')
is(C.numberToChinese('0', false), '零', '零')
is(C.numberToChinese('-7', false), '负七', '负')
is(C.numberToChinese('0007', false), '七', '前导零丢掉')
throws(() => C.numberToChinese('1.5', false), '请输入整数', '小数报错')
throws(() => C.numberToChinese('一二三', false), '请输入整数', '非数字报错')

/* ---------- 入参校验（错误文案一律中文）---------- */
throws(() => C.toChineseUpper(''), '请输入金额', '空')
throws(() => C.toChineseUpper('   '), '请输入金额', '全空格')
throws(() => C.toChineseUpper('abc'), '只能是数字，可以带小数点', '字母')
throws(() => C.toChineseUpper('1.2.3'), '只能是数字，可以带小数点', '两个小数点')
throws(() => C.toChineseUpper('1e5'), '只能是数字，可以带小数点', '科学计数法不收')
throws(
  () => C.toChineseUpper('10000000000000000'),
  '数值过大，本工具支持到「万亿」位',
  '超出 10^16 上界'
)
throws(() => C.toChineseLower('abc'), '只能是数字，可以带小数点', '小写走同一套校验')

console.log('== cny pass=' + ok + '/' + (ok + fail))
if (fail) process.exitCode = 1
