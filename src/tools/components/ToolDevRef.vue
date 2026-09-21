<template>
  <view>
    <PkCard title="查哪一类" accent="var(--pk-accent)">
      <PkSeg v-model="groupKey" :items="groupItems" />
      <PkField v-model="kw" :placeholder="placeholder" />
      <PkRow label="命中" :value="list.length + ' 条'" :copy="false" />
    </PkCard>

    <PkCard :title="currentName" :accent="accent">
      <PkEmpty v-if="!list.length" title="没查到" desc="换个关键词试试，比如「429」「json」「6379」「rebase」" />
      <view v-else>
        <view v-for="(item, i) in list" :key="i" class="item">
          <!-- 状态码 -->
          <template v-if="groupKey === 'status'">
            <view class="item__head">
              <text class="item__code" :class="'item__code--' + codeTone(item.code)">{{ item.code }}</text>
              <text class="item__name">{{ item.name }}</text>
            </view>
            <text class="item__note">{{ item.note }}</text>
          </template>
          <!-- HTTP 方法 -->
          <template v-else-if="groupKey === 'method'">
            <view class="item__head">
              <text class="item__code">{{ item.name }}</text>
              <text class="item__tag" :class="item.safe ? 'item__tag--ok' : 'item__tag--warn'">{{ item.safe ? '安全' : '有副作用' }}</text>
              <text class="item__tag" :class="item.idempotent ? 'item__tag--ok' : 'item__tag--warn'">{{ item.idempotent ? '幂等' : '非幂等' }}</text>
            </view>
            <text class="item__note">{{ item.note }}</text>
          </template>
          <!-- MIME -->
          <template v-else-if="groupKey === 'mime'">
            <view class="item__head">
              <text class="item__ext">{{ item.ext }}</text>
              <text class="item__mime" selectable>{{ item.mime }}</text>
            </view>
            <text class="item__note">{{ item.note }}</text>
          </template>
          <!-- 端口 -->
          <template v-else-if="groupKey === 'port'">
            <view class="item__head">
              <text class="item__code">{{ item.port }}</text>
              <text class="item__name">{{ item.name }}</text>
            </view>
            <text class="item__note">{{ item.note }}</text>
          </template>
          <!-- Git -->
          <template v-else>
            <text class="item__cmd" @tap="copyText(item.cmd)">{{ item.cmd }}</text>
            <text class="item__note">{{ item.note }}</text>
          </template>
        </view>
      </view>
    </PkCard>

    <PkCard v-if="groupKey === 'status'" title="记忆口诀" accent="#6B5B95">
      <PkRow label="1xx" value="信息，请求收到了，继续" :copy="false" stack />
      <PkRow label="2xx" value="成功" :copy="false" stack />
      <PkRow label="3xx" value="重定向，东西在别处" :copy="false" stack />
      <PkRow label="4xx" value="怪你（客户端）：路由错、参数错、没登录、没权限" :copy="false" stack />
      <PkRow label="5xx" value="怪我（服务端）：代码抛错、网关挂了、上游超时" :copy="false" stack />
      <PkRow label="401 vs 403" value="401 是「不知道你是谁」，403 是「知道你是谁但不许」" :copy="false" stack />
    </PkCard>

    <PkCard v-if="groupKey === 'method'" title="两个容易记混的性质" accent="#6B5B95">
      <PkRow label="安全" value="只读不改数据，可以被预取、被爬虫随便访问" :copy="false" stack />
      <PkRow label="幂等" value="调用一次和调用多次，服务端最终状态一样。GET/PUT/DELETE 幂等，POST 不幂等" :copy="false" stack />
      <PkRow label="PUT vs PATCH" value="PUT 是整体替换（没传的字段会被清掉），PATCH 是局部更新" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { GROUPS, searchRef } from '@/utils/devref'
import { copyText } from '@/utils/clipboard'

const groupItems = GROUPS.map((g) => ({ key: g.key, name: g.name }))
const groupKey = ref('status')
const kw = ref('')

const group = computed(() => GROUPS.find((g) => g.key === groupKey.value) || GROUPS[0])
const currentName = computed(() => group.value.name + '（' + list.value.length + '）')
const list = computed(() => searchRef(groupKey.value, kw.value))

const accents = { status: '#3E7A4E', method: '#4A6FA5', mime: '#6B5B95', port: 'var(--pk-warn)', git: '#2F8C7A' }
const accent = computed(() => accents[groupKey.value] || 'var(--pk-accent)')

const placeholders = {
  status: '找状态码，如 404、超时、权限',
  method: '找方法，如 GET、幂等',
  mime: '找类型，如 .json、图片、字体',
  port: '找端口，如 redis、8080',
  git: '找命令，如 rebase、撤销、stash',
}
const placeholder = computed(() => placeholders[groupKey.value] || '输入关键词')

function codeTone(code) {
  if (code < 200) return 'info'
  if (code < 300) return 'ok'
  if (code < 400) return 'warn'
  if (code < 500) return 'warn'
  return 'bad'
}
</script>

<style scoped>
.item {
  padding: 18rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.item:last-child {
  border-bottom: none;
}
.item__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}
.item__code {
  font-size: 28rpx;
  font-weight: 600;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
  margin-right: 16rpx;
}
.item__code--info {
  color: #4A6FA5;
}
.item__code--ok {
  color: var(--pk-accent);
}
.item__code--warn {
  color: var(--pk-warn);
}
.item__code--bad {
  color: var(--pk-danger);
}
.item__name {
  font-size: 25rpx;
  color: var(--pk-text-2);
  flex: 1;
}
.item__ext {
  font-size: 24rpx;
  color: var(--pk-text-2);
  margin-right: 16rpx;
  min-width: 130rpx;
}
.item__mime {
  font-size: 23rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-accent);
  flex: 1;
  word-break: break-all;
}
.item__cmd {
  font-size: 24rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-accent);
  word-break: break-all;
  line-height: 1.6;
}
.item__tag {
  font-size: 20rpx;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  margin-left: 12rpx;
}
.item__tag--ok {
  color: var(--pk-accent);
  background: rgba(63, 122, 110, 0.12);
}
.item__tag--warn {
  color: var(--pk-warn);
  background: rgba(168, 100, 47, 0.14);
}
.item__note {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  line-height: 1.7;
  margin-top: 8rpx;
}
</style>
