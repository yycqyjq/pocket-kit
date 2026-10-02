/**
 * storage.js 自查（直接测 src/utils/storage.js 本体）
 * ------------------------------------------------------------
 * 判据分四类，全部靠内存 Map 给 uni.getStorageSync/setStorageSync/removeStorageSync
 * 打桩来验真实读写逻辑：
 *   1) 键名契约：STORAGE_KEYS 的四个键是持久化格式的一部分（改了就丢用户数据），
 *      按源码里写死的那组字符串核对。
 *   2) 收藏 toggle：加→再切→再加；toggle 返回值即切换后状态；新收藏 unshift 到最前。
 *   3) 最近使用：同 id 去重（连推两次只留一条且提到最前）；限长（连推 N+1 条时
 *      最旧一条被挤掉，最新在首位）；removeRecent 只删指定项；clearRecent 清空。
 *   4) 设置/主题：readSettings 与默认值合并（局部写不丢其它键）；readTheme 只认
 *      'dark'，其余一律 'light'；hasStoredTheme 把空串视为「没存过」。
 * 另外覆盖异常分支：get/set 抛错时 safeGet 回落默认值、safeSet 返回 false 而不抛。
 * 不在覆盖内：真机存储容量/跨版本迁移（本项目没有 uni 环境，只能验逻辑）。
 */
import { useUtils, makeTest } from './harness.mjs'

const mem = new Map()
const calls = []
globalThis.uni = {
  getStorageSync: (k) => (mem.has(k) ? mem.get(k) : ''),
  setStorageSync: (k, v) => { calls.push(['set', k]); mem.set(k, v) },
  removeStorageSync: (k) => { calls.push(['rm', k]); mem.delete(k) },
}

const S = await useUtils('storage')
const T = makeTest('storage')
const snap = (v) => JSON.parse(JSON.stringify(v))

/* ---------- 1. 键名契约 ---------- */
T.eq('KEY.theme', S.STORAGE_KEYS.theme, 'pk.theme')
T.eq('KEY.favorites', S.STORAGE_KEYS.favorites, 'pk.favorites')
T.eq('KEY.recent', S.STORAGE_KEYS.recent, 'pk.recent')
T.eq('KEY.settings', S.STORAGE_KEYS.settings, 'pk.settings')

/* ---------- 2. 收藏 ---------- */
T.eq('初始无收藏 → []', snap(S.readFavorites()), [])
T.eq('初始 isFavorite(a) → false', S.isFavorite('a'), false)
T.eq('toggle a → true', S.toggleFavorite('a'), true)
T.eq('toggle 后 isFavorite(a) → true', S.isFavorite('a'), true)
T.eq('toggle 后列表 [a]', snap(S.readFavorites()), ['a'])
T.eq('再 toggle a → false（取消）', S.toggleFavorite('a'), false)
T.eq('取消后列表为空', snap(S.readFavorites()), [])
T.eq('再 toggle a → true（可再加回）', S.toggleFavorite('a'), true)
T.eq('加回后列表 [a]', snap(S.readFavorites()), ['a'])
S.toggleFavorite('b')
T.eq('新收藏排在最前 [b,a]', snap(S.readFavorites()), ['b', 'a'])
T.eq('已收藏项 isFavorite(a) 仍 true', S.isFavorite('a'), true)
// 非数组脏数据要回落空数组而不是崩
mem.set('pk.favorites', { nope: 1 })
T.eq('收藏脏数据 → []', snap(S.readFavorites()), [])
mem.delete('pk.favorites')

/* ---------- 3. 最近使用 ---------- */
T.eq('初始无记录 → []', snap(S.readRecent()), [])
S.pushRecent('r1')
T.eq('push r1 → 一条', snap(S.readRecent()).length, 1)
T.eq('记录含 id', S.readRecent()[0].id, 'r1')
T.ok('记录含数值 at', typeof S.readRecent()[0].at === 'number', typeof S.readRecent()[0].at)
S.pushRecent('r2')
T.eq('再 push r2 → 最新在首位 [r2,r1]', snap(S.readRecent()).map((x) => x.id), ['r2', 'r1'])
S.pushRecent('r2')
T.eq('同 id 连推两次只留一条', snap(S.readRecent()).length, 2)
T.eq('同 id 重复推送后提到最前', snap(S.readRecent()).map((x) => x.id), ['r2', 'r1'])

// 限长：已有 2 条，再连推 25 条（共 27，超上限 24），多出的 3 条按最旧被挤掉
for (let i = 0; i < 25; i++) S.pushRecent('e' + i)
{
  const ids = snap(S.readRecent()).map((x) => x.id)
  T.eq('超上限后长度锁在 24', ids.length, 24)
  T.eq('最新一条在首位', ids[0], 'e24')
  T.eq('最旧的 e0 被淘汰', ids.indexOf('e0'), -1)
  T.eq('更早的 r2 被淘汰', ids.indexOf('r2'), -1)
  T.eq('更早的 r1 被淘汰', ids.indexOf('r1'), -1)
  T.eq('刚好保住的 e1 在末位', ids[23], 'e1')
}
S.removeRecent('e24')
T.eq('removeRecent 删指定项', snap(S.readRecent()).map((x) => x.id).indexOf('e24'), -1)
T.eq('removeRecent 不影响其它项', snap(S.readRecent()).length, 23)
S.removeRecent('不存在')
T.eq('removeRecent 删不存在的 id 是空操作', snap(S.readRecent()).length, 23)
S.clearRecent()
T.eq('clearRecent 清空', snap(S.readRecent()), [])

/* ---------- 4. 主题 ---------- */
T.eq('未存过主题 → readTheme light', S.readTheme(), 'light')
T.eq('未存过主题 → hasStoredTheme false', S.hasStoredTheme(), false)
S.writeTheme('dark')
T.eq('写 dark 后读回 dark', S.readTheme(), 'dark')
T.eq('写后 hasStoredTheme true', S.hasStoredTheme(), true)
S.writeTheme('light')
T.eq('写 light 后读回 light', S.readTheme(), 'light')
S.writeTheme('乱七八糟')
T.eq('非法主题被归一为 light', S.readTheme(), 'light')
mem.set('pk.theme', '')
T.eq('空串视为没存过（hasStoredTheme false）', S.hasStoredTheme(), false)
T.eq('空串 readTheme 回落 light', S.readTheme(), 'light')
mem.delete('pk.theme')

/* ---------- 5. 设置 ---------- */
T.eq('默认设置合并', snap(S.readSettings()), { haptic: true, startTab: 'home' })
S.writeSetting('haptic', false)
T.eq('写 haptic=false 生效', S.readSettings().haptic, false)
T.eq('写单项不丢 startTab', S.readSettings().startTab, 'home')
S.writeSetting('startTab', 'tools')
T.eq('写 startTab 生效', S.readSettings().startTab, 'tools')
T.eq('前一项 haptic=false 仍在', S.readSettings().haptic, false)
S.writeSetting('custom', 7)
T.eq('新增自定义键保留', S.readSettings().custom, 7)
T.eq('自定义键不影响默认项', S.readSettings().startTab, 'tools')
mem.set('pk.settings', 'oops')
T.eq('设置脏数据回落默认', snap(S.readSettings()), { haptic: true, startTab: 'home' })
mem.delete('pk.settings')

/* ---------- 6. store 与异常分支 ---------- */
T.eq('store.set 成功返回 true', S.store.set('x', 5), true)
T.eq('store.get 读回', S.store.get('x', 0), 5)
T.eq('store.get 缺省回落', S.store.get('missing', 9), 9)
S.store.remove('x')
T.eq('store.remove 后回落默认', S.store.get('x', 0), 0)
mem.set('pk.theme', '')
T.eq('safeGet 把空串当未设置', S.store.get('pk.theme', 'def'), 'def')
mem.delete('pk.theme')

const realGet = globalThis.uni.getStorageSync
const realSet = globalThis.uni.setStorageSync
globalThis.uni.getStorageSync = () => { throw new Error('boom') }
T.eq('get 抛错时 safeGet 回落默认', S.store.get('any', 'd'), 'd')
T.eq('get 抛错时 readFavorites 回落 []', snap(S.readFavorites()), [])
T.eq('get 抛错时 readSettings 回落默认', S.readSettings().haptic, true)
T.eq('get 抛错时 hasStoredTheme false', S.hasStoredTheme(), false)
globalThis.uni.getStorageSync = realGet
globalThis.uni.setStorageSync = () => { throw new Error('quota') }
T.eq('set 抛错时 safeSet 返回 false', S.store.set('y', 1), false)
T.ok('set 抛错时 writeSetting 不抛', (() => { try { S.writeSetting('z', 1); return true } catch (e) { return false } })())
globalThis.uni.setStorageSync = realSet

T.done()
