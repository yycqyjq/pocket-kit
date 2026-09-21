/** useragent.js 探针：打印每条样本的解析结论，便于核对规则表 */
import { useUtils } from '../harness.mjs'

const { parseUA, selfTest, UA_SAMPLES, buildUA, splitUA, UA_BROWSERS, UA_PLATFORMS } = await useUtils('useragent')

for (let i = 0; i < UA_SAMPLES.length; i++) {
  const s = UA_SAMPLES[i]
  try {
    const r = parseUA(s.ua)
    console.log(
      i + '. ' + s.name + '\n   ' + r.browser.name + ' ' + r.browser.version + ' | ' + r.engine.name + ' ' + r.engine.version + ' | ' + r.os.name + ' ' + r.os.version + ' | ' + r.device.kind + ' | ' + r.device.vendor + ' ' + r.device.model + ' | bot=' + r.bot.isBot + ' ' + r.bot.who
    )
  } catch (e) {
    console.log(i + '. ' + s.name + '\n   ERR ' + e.message)
  }
}
const st = selfTest()
console.log('\nselfTest ' + st.passed + '/' + st.total)
st.rows.filter((r) => !r.ok).forEach((r) => console.log('  ✗ ' + r.name + ' : ' + r.actual))
console.log('\n片段数：' + splitUA(UA_SAMPLES[0].ua).length)
splitUA(UA_SAMPLES[0].ua).forEach((x) => console.log('  [' + x.kind + '] ' + x.text + ' → ' + x.note.slice(0, 30)))
console.log('\n生成：')
for (const b of UA_BROWSERS) {
  const g = buildUA(b.key, 'mac', b.def)
  console.log('  ' + b.key + ' → ' + g.ua)
}
console.log('\n平台：' + UA_PLATFORMS.length + ' 浏览器：' + UA_BROWSERS.length)
