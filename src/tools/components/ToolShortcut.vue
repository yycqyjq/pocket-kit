<template>
  <view>
    <PkCard padded>
      <text class="tip">这一页是全站唯一会离开本应用的工具：它只负责把你填的东西校验干净、拼成一条 URI，再交给系统去唤起拨号盘、短信、邮箱、地图或商店。发不发送、拨不拨出，都由你在对方界面里点。</text>
      <text class="msg" :class="{ 'msg--ok': caps.plus }">{{ envLine }}</text>
    </PkCard>

    <PkCard title="拨号" :accent="TINT">
      <PkField v-model="tel.v" label="号码" placeholder="13812345678 或 +86 138-1234-5678" type="text" :maxlength="30" />
      <text v-if="telHint" class="tip">{{ telHint }}</text>
      <view class="row2">
        <PkBtn text="打开拨号盘" kind="primary" @tap="doTel" />
      </view>
      <template v-if="out.tel">
        <PkRow v-if="out.tel.uri" label="将唤起" :value="uriPreview(out.tel.uri)" mono stack :copy="false" />
        <text v-if="out.tel.msg" class="msg" :class="{ 'msg--ok': out.tel.ok }">{{ out.tel.msg }}</text>
      </template>
      <text class="tip">走的是系统「把号码填进拨号盘」这一步，不会自动外呼；国际号码记得带 +。</text>
    </PkCard>

    <PkCard title="短信" :accent="TINT">
      <PkField v-model="sms.v" label="收件号码" placeholder="13812345678" type="text" :maxlength="30" />
      <PkField v-model="sms.body" label="预填正文" type="textarea" :maxlength="BODY_CAP" placeholder="可选，交给短信 App 后还能改" />
      <text class="tip">{{ smsCount }}</text>
      <view class="row2">
        <PkBtn text="唤起短信" kind="primary" @tap="doSms" />
      </view>
      <template v-if="out.sms">
        <PkRow v-if="out.sms.uri" label="将唤起" :value="uriPreview(out.sms.uri)" mono stack :copy="false" />
        <text v-if="out.sms.msg" class="msg" :class="{ 'msg--ok': out.sms.ok }">{{ out.sms.msg }}</text>
      </template>
    </PkCard>

    <PkCard title="邮件" :accent="TINT">
      <PkField v-model="mail.to" label="收件人" placeholder="多个地址用逗号或空格分开" type="text" :maxlength="600" />
      <PkField v-model="mail.subject" label="主题" placeholder="可选" type="text" :maxlength="200" />
      <PkField v-model="mail.body" label="正文" type="textarea" :maxlength="4000" placeholder="可选，换行会照原样带过去" />
      <view class="row2">
        <PkBtn text="唤起邮件" kind="primary" @tap="doMail" />
      </view>
      <template v-if="out.mail">
        <PkRow v-if="out.mail.uri" label="将唤起" :value="uriPreview(out.mail.uri)" mono stack :copy="false" />
        <text v-if="out.mail.msg" class="msg" :class="{ 'msg--ok': out.mail.ok }">{{ out.mail.msg }}</text>
      </template>
    </PkCard>

    <PkCard title="地图落点" :accent="TINT">
      <PkField v-model="map.lat" label="纬度" placeholder="-90 ~ 90" type="digit" :maxlength="20" />
      <PkField v-model="map.lng" label="经度" placeholder="-180 ~ 180" type="digit" :maxlength="20" />
      <PkField v-model="map.label" label="标注" placeholder="可选，显示在地图上的名字" type="text" :maxlength="80" />
      <view class="row2">
        <PkBtn text="用当前定位填上" kind="soft" @tap="useFix" />
      </view>
      <view class="row2">
        <PkBtn text="唤起地图" kind="primary" @tap="doMap(false)" />
        <PkBtn text="用网页打开" kind="ghost" @tap="doMap(true)" />
      </view>
      <template v-if="out.map">
        <PkRow v-if="out.map.uri" label="将唤起" :value="uriPreview(out.map.uri)" mono stack :copy="false" />
        <text v-if="out.map.msg" class="msg" :class="{ 'msg--ok': out.map.ok }">{{ out.map.msg }}</text>
      </template>
      <text class="tip">geo: 交给谁由系统决定，装了多个地图 App 时会弹选择框；网页那条走开放街道地图，不依赖任何厂商。</text>
    </PkCard>

    <PkCard title="应用商店" :accent="TINT">
      <PkField v-model="pkg" label="包名" placeholder="com.example.app" type="text" :maxlength="200" />
      <view class="row2">
        <PkBtn text="读本应用包名" kind="soft" @tap="readOwnPkg" />
      </view>
      <view class="row2">
        <PkBtn text="唤起本机商店" kind="primary" @tap="doMarket(false)" />
        <PkBtn text="用网页打开" kind="ghost" @tap="doMarket(true)" />
      </view>
      <template v-if="out.market">
        <PkRow v-if="out.market.uri" label="将唤起" :value="uriPreview(out.market.uri)" mono stack :copy="false" />
        <text v-if="out.market.msg" class="msg" :class="{ 'msg--ok': out.market.ok }">{{ out.market.msg }}</text>
      </template>
      <text class="tip">{{ pkgHint() }}</text>
    </PkCard>

    <PkCard title="系统设置" :accent="TINT">
      <text class="tip">{{ descOf('settings') }}</text>
      <view class="chips">
        <text v-for="p in SETTINGS_PAGES" :key="p.key" class="chips__i" @tap="doSettings(p)">{{ p.name }}</text>
      </view>
      <template v-if="out.settings">
        <PkRow label="目标页" :value="settingsTarget" mono stack :copy="false" />
        <PkRow v-if="out.settings.uri" label="action" :value="out.settings.uri" mono stack :copy="false" />
        <text v-if="out.settings.msg" class="msg" :class="{ 'msg--ok': out.settings.ok }">{{ out.settings.msg }}</text>
      </template>
      <text class="tip">上面每一个词都是一次跳转，点错不会改任何东西——进去看了再退出来就是。</text>
    </PkCard>

    <PkCard title="口径与边界" :accent="TINT">
      <PkRow v-for="n in NOTES" :key="n.t" :label="n.t" :value="n.d" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import {
  normalizePhone, phoneKind, telUrl, smsUrl, smsBodyLimit, smsParts,
  checkEmails, mailtoUrl, coordOf, geoUrl, mapWebUrl, checkPkg, marketUrl, marketWebUrl,
  pkgHint, urlAllowed, uriPreview, SETTINGS_PAGES, SHORTCUT_ITEMS, SHORTCUT_NOTES,
} from '@/utils/shortcut'
import { probe, hasApi, uniCall, openExternal, startActivityAction, withAndroid, missText, NATIVE_NOTES, requestAndroidPermissions, PERM_LOCATION } from '@/utils/native'

const TINT = '#8C3E6B'
const BODY_CAP = smsBodyLimit(0)
const NOTES = SHORTCUT_NOTES.concat(NATIVE_NOTES.slice(0, 1))

const caps = probe()
const envLine = computed(() =>
  caps.plus
    ? 'plus 原生运行时在，短信 / 邮件 / 地图 / 商店都通过它交给系统。'
    : missText('唤起外部应用', caps) + '（H5 预览里会退回浏览器地址栏，能不能唤起取决于浏览器）'
)

function descOf(key) {
  const it = SHORTCUT_ITEMS.find((i) => i.key === key)
  return it ? it.desc : ''
}

/* 每个入口一行结果：uri 是递给系统的串，msg 是发生了什么 */
const out = reactive({})
function say(key, uri, msg, good) {
  out[key] = { uri: uri || '', msg: msg || '', ok: !!good }
}

const OPENED_TEXT = '已交给系统。没有弹出 App 说明这台机上没有一个认领该协议'

/** 白名单闸门 + 交给系统 */
function openUri(key, uri) {
  if (!uri) {
    say(key, '', '校验没过，没有生成地址')
    return
  }
  if (!urlAllowed(uri)) {
    say(key, uri, '这个协议不在白名单里（只放行 tel / sms / mailto / geo / market / http(s)），已拒绝交给系统')
    return
  }
  const r = openExternal(uri)
  say(key, uri, r.ok ? OPENED_TEXT + '（' + r.via + '）' : r.message, r.ok)
}

/* ---------- 拨号 ---------- */
const tel = reactive({ v: '' })
const telHint = computed(() => {
  if (!String(tel.v).trim()) return ''
  const p = normalizePhone(tel.v)
  if (!p.ok) return p.reason
  return phoneKind(p.value) + ' · ' + p.digits.length + ' 位数字'
})
function doTel() {
  const p = normalizePhone(tel.v)
  if (!p.ok) {
    say('tel', '', p.reason)
    return
  }
  if (!hasApi('makePhoneCall')) {
    say('tel', telUrl(p.value), missText('拨号盘', probe()))
    return
  }
  const uri = telUrl(p.value)
  uniCall('makePhoneCall', { phoneNumber: p.value })
    .then(() => say('tel', uri, '拨号盘已打开：' + phoneKind(p.value), true))
    .catch((e) => say('tel', uri, (e && e.message) || '拨号盘没打开'))
}

/* ---------- 短信 ---------- */
const sms = reactive({ v: '', body: '' })
const smsCount = computed(() => {
  const t = smsParts(sms.body)
  if (!t.chars) return '正文可以留空；' + BODY_CAP + ' 字以内都能预填'
  return '正文 ' + t.chars + ' 字 · ' + (t.ascii ? '英文数字' : '含中文') + ' · 按每段 ' + t.cap + ' 字算是 ' + t.parts + ' 条'
})
function doSms() {
  const p = normalizePhone(sms.v)
  if (!p.ok) {
    say('sms', '', p.reason)
    return
  }
  openUri('sms', smsUrl(p.value, sms.body))
}

/* ---------- 邮件 ---------- */
const mail = reactive({ to: '', subject: '', body: '' })
function doMail() {
  const e = checkEmails(mail.to)
  if (!e.ok) {
    say('mail', '', e.reason)
    return
  }
  openUri('mail', mailtoUrl({ to: e.value, subject: mail.subject, body: mail.body }))
}

/* ---------- 地图 ---------- */
const map = reactive({ lat: '', lng: '', label: '' })
function doMap(web) {
  const c = coordOf(map.lat, map.lng)
  if (!c.ok) {
    say('map', '', c.reason)
    return
  }
  openUri('map', web ? mapWebUrl(c.lat, c.lng) : geoUrl(c.lat, c.lng, map.label))
}
async function useFix() {
  if (!hasApi('getLocation')) {
    say('map', '', missText('定位', probe()))
    return
  }
  const perm = await requestAndroidPermissions(PERM_LOCATION, '定位')
  if (perm.noneGranted) {
    say('map', '', perm.message)
    return
  }
  say('map', '', '正在取当前位置…', true)
  uniCall('getLocation', { type: 'gcj02', isHighAccuracy: true })
    .then((r) => {
      map.lat = String(r.latitude)
      map.lng = String(r.longitude)
      if (!map.label) map.label = '我的位置'
      say('map', '', '经纬度已填上：' + map.lat + ', ' + map.lng + '（精度约 ' + (Number(r.accuracy) || 0) + ' 米）', true)
    })
    .catch((e) => say('map', '', (e && e.message) || '定位失败'))
}

/* ---------- 商店 ---------- */
const pkg = ref('')
function doMarket(web) {
  const p = checkPkg(pkg.value)
  if (!p.ok) {
    say('market', '', p.reason)
    return
  }
  openUri('market', web ? marketWebUrl(p.value) : marketUrl(p.value))
}
function readOwnPkg() {
  const r = withAndroid((p) => String(p.android.runtimeMainActivity().getPackageName()), '本应用包名')
  if (!r.ok) {
    say('market', '', r.message)
    return
  }
  pkg.value = r.value
  say('market', '', '已填入本应用包名：' + r.value, true)
}

/* ---------- 设置页 ---------- */
const settingsTarget = ref('')
function doSettings(page) {
  settingsTarget.value = page.name + ' · ' + page.desc
  const r = startActivityAction(page.action)
  if (!r.ok) {
    say('settings', page.action, r.message)
    return
  }
  say('settings', page.action, '已交给系统。没跳过去就是这台机的 ROM 藏掉了这一页，从设置首页进也能找到', true)
}
</script>

<style scoped>
.tip {
  display: block;
  font-size: 21rpx;
  line-height: 1.8;
  color: var(--pk-text-3);
  padding: 8rpx 24rpx 12rpx;
}
.msg {
  display: block;
  font-size: 22rpx;
  line-height: 1.8;
  color: var(--pk-danger);
  padding: 12rpx 24rpx;
}
.msg--ok {
  color: var(--pk-text-2);
}
.row2 {
  display: flex;
  gap: 20rpx;
  padding: 16rpx 24rpx 8rpx;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  padding: 8rpx 24rpx 0;
}
.chips__i {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin: 8rpx 14rpx 0 0;
  padding: 14rpx 20rpx;
  line-height: 1.3;
  border-radius: 10rpx;
  background: var(--pk-accent-soft);
}
</style>
