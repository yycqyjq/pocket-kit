/**
 * 界面探针的公共骨架：一个浏览器、一个页面、一套动作和断言方言。
 * 每个探针文件只写「哪一页、点哪些东西、页面上应该出现／不该出现什么」，
 * 起服务器、找 Chrome、点输入框、抓 innerText 这些都在这儿一份。
 *
 * 断言全部对着页面上渲染出来的字，不对着组件内部状态——
 * 这轮踩过的坑是「文案写在代码里但界面从来只取表格前两列」，
 * 只看模块返回值会绿，用户看见的还是缺的那半截。
 */

/** 输入框按出现顺序编号（type=text 与 type=number 都用这个选择器） */
export const IN = (n) => ({ input: n })
/** 多行文本框（uni-textarea），nth 与 IN 各数各的 */
export const TA = (n) => ({ ta: n })
/** 裸 textarea（有的页面是原生标签，不是 uni-textarea） */
export const AREA = (n) => ({ area: n })

export const CHIP = (t) => [{ chip: true }, t]
export const MINI = (t) => [{ mini: true }, t]
export const BTN = (t) => [{ btn: true }, t]
export const TAP = (t) => [{ tap: true }, t]
export const SEG = (t) => [{ seg: true }, t]
export const TYPE = (t) => [{ type: true }, t]
export const SWITCH = (t) => [{ switch: true }, t]
export const SWAP = () => [{ swap: true }, '']
/** 第 n 个拉框（uni-picker）里选文本为 text 的那一项 */
export const PICK = (n, text) => [{ pick: n }, text]

const SEL = {
  input: 'input.uni-input-input',
  ta: 'textarea.uni-textarea-textarea',
  area: 'textarea',
  chip: '.quick-i',
  mini: '.mini-act',
  btn: '.pk-btn',
  tap: '.pk-btn__t',
  seg: '.pk-seg__item',
  type: '.type-item',
  switch: '.pk-switch-row__title',
  swap: '.pair__swap',
}

/** uni-app 的 H5 拉框：DOM 里同时有一份滚轮和一份 .uni-picker-select 列表，
 *  列表被 CSS 藏成 visibility:hidden，但它才挂着选中 handler —— 只能 dispatchEvent('click')。 */
async function pickOption(page, n, text) {
  await page.locator('uni-picker').nth(n).click()
  await page.waitForTimeout(250)
  const ok = await page.evaluate((t) => {
    const cont = document.querySelector('.uni-picker-container[style*="display: block"]')
    if (!cont) return 'no-container'
    const items = [...cont.querySelectorAll('.uni-picker-select .uni-picker-item')]
    const hit = items.find((e) => e.textContent.trim() === t)
    if (!hit) return 'no-item:' + items.length
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    return 'ok'
  }, text)
  if (ok !== 'ok') throw new Error('拉框选项点不到（' + text + '）：' + ok)
  await page.waitForTimeout(250)
}

async function doAct(page, spec, arg) {
  const kind = Object.keys(spec)[0]
  if (kind === 'pick') return pickOption(page, spec.pick, arg)
  const sel = SEL[kind]
  if (!sel) throw new Error('不认识的动作：' + JSON.stringify(spec))
  if (kind === 'input' || kind === 'ta' || kind === 'area') {
    const loc = page.locator(sel).nth(spec[kind])
    if (!(await loc.count())) throw new Error('找不到 ' + sel + ' 第 ' + spec[kind] + ' 个')
    await loc.click()
    await loc.fill(arg)
    await page.waitForTimeout(120)
    return
  }
  const loc = page.locator(sel, kind === 'swap' ? {} : { hasText: arg }).first()
  if (!(await loc.count())) throw new Error('找不到 ' + sel + '「' + arg + '」')
  await loc.click()
  await page.waitForTimeout(kind === 'switch' ? 150 : 300)
}

/** toast 只活 1.5 秒，点完立刻轮询抓文案；不期待 toast 时读一次就够 */
async function readBody(page, want) {
  let txt = ''
  for (let i = 0; i < 25; i++) {
    txt = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
    if (!want || txt.includes(want)) return txt
    await page.waitForTimeout(60)
  }
  return txt
}

async function readResults(page, want) {
  const sel = want.sel
  const vals = await page.$$eval(sel + ' text, ' + sel + ' .chip__t, ' + sel + ' .roll__t', (els) => els.map((e) => e.textContent.trim()))
  const picked = vals.filter((v) => v !== '')
  const n = await page.$$eval(sel, (els) => els.length)
  const extra = []
  if (want.count !== undefined && n !== want.count) extra.push('结果个数 ' + n + ' ≠ ' + want.count)
  if (want.re && !picked.every((v) => want.re.test(v))) extra.push('有结果不符合形状：' + picked.slice(0, 6).join(','))
  if (want.range) {
    const out = picked.filter((v) => !(Number.isInteger(Number(v)) && Number(v) >= want.range[0] && Number(v) <= want.range[1]))
    if (out.length) extra.push('有结果掉出区间／不是整数：' + out.slice(0, 4).join(','))
  }
  if (!picked.length) extra.push('一个结果都没读到')
  return extra
}

function pagesOf(probe) {
  if (probe.pages) return probe.pages
  return [{ id: probe.id, viewport: probe.viewport, steps: probe.steps, check: probe.check }]
}

/** 跑一个探针。返回 { pass, fail }；每一行判定当场打出来，方便只看失败的那几条。 */
export async function runProbe(browser, probe, base) {
  const page = await browser.newPage({ viewport: { width: 420, height: probe.height || 1600 } })
  page.setDefaultTimeout(4000)
  const logs = []
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') logs.push('console: ' + m.text())
  })

  let pass = 0
  let fail = 0
  const ok = (cond, msg) => {
    if (cond) {
      pass++
      console.log('ok   ' + msg)
    } else {
      fail++
      console.log('FAIL ' + msg)
    }
  }

  for (const pg of pagesOf(probe)) {
    await page.setViewportSize({ width: 420, height: pg.height || probe.height || 1600 })
    await page.goto('about:blank')
    await page.goto(base + '/#/pages/tool/tool?id=' + pg.id, { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)

    if (pg.check) {
      try {
        await pg.check({ page, ok, body: () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')) })
      } catch (e) {
        fail++
        console.log('FAIL 页面检查抛错：' + e.message.split('\n')[0])
      }
    }

    for (const st of pg.steps) {
      const label = pg.id + ' · ' + st.desc
      const t0 = Date.now()
      try {
        for (const pair of st.act || []) await doAct(page, pair[0], pair[1])
        let txt = ''
        const miss = []
        if (st.toast) {
          txt = await readBody(page, st.toast)
          if (!txt.includes(st.toast)) miss.push('没等到提示「' + st.toast + '」')
        } else {
          await page.waitForTimeout(80)
          txt = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
        }
        miss.push(...(st.expect || []).filter((e) => !txt.includes(e)))
        if (st.expectRe && !st.expectRe.test(txt)) miss.push('页面里没有匹配 ' + st.expectRe + ' 的文本')
        if (st.results) miss.push(...(await readResults(page, st.results)))
        if (st.readback !== undefined) {
          const back = await page.locator('input.uni-input-input').first().inputValue()
          if (back !== st.readback) miss.push('输入框里应该是 ' + JSON.stringify(st.readback) + '，实际 ' + JSON.stringify(back))
        }
        const hit = (st.forbid || []).filter((f) => txt.includes(f))
        if (st.mustBeFast && Date.now() - t0 > st.mustBeFast) miss.push('这一步花了 ' + (Date.now() - t0) + 'ms，超过 ' + st.mustBeFast + 'ms（多半在硬建整段池子）')
        if (miss.length || hit.length) {
          fail++
          console.log('FAIL ' + label)
          if (miss.length) console.log('  少了 ' + JSON.stringify(miss))
          if (hit.length) console.log('  多了 ' + JSON.stringify(hit))
          console.log('  实际 ' + txt.slice(0, 300))
        } else {
          pass++
          console.log('ok   ' + label + (st.mustBeFast ? '（' + (Date.now() - t0) + 'ms）' : ''))
        }
      } catch (e) {
        fail++
        console.log('FAIL ' + label + ' —— ' + e.message.split('\n')[0])
      }
      await page.waitForTimeout(60)
    }
  }

  const badLogs = logs.filter((l) => !/Failed to load resource|favicon/.test(l))
  console.log(probe.name + '：' + pass + ' 通过 / ' + fail + ' 失败 / 控制台报错 ' + badLogs.length + ' 条')
  for (const l of badLogs.slice(0, 6)) console.log('  ' + l.slice(0, 160))
  await page.close()
  return { pass, fail, consoleErrors: badLogs.length }
}
