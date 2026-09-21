<template>
  <view>
    <PkCard padded>
      <PkField v-model="input" label="IPv6 地址" placeholder="2001:db8::1 或完整写法">
        <template #labelRight>
          <text class="mini-act" @tap="paste">读取剪贴板</text>
          <text class="mini-act" @tap="input = ''">清空</text>
        </template>
      </PkField>
      <view class="quick-row">
        <text v-for="s in IPV6_SAMPLES" :key="s.name" class="quick-i" @tap="input = s.value">{{ s.name }}</text>
      </view>
      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <template v-if="!error && info">
      <PkCard title="地址类型" accent="#2F7A8C">
        <view class="hero">
          <text class="hero__t">{{ info.kind.name }}</text>
        </view>
        <PkRow label="说明" :value="info.kind.note" :copy="false" stack />
        <PkRow v-if="info.mapped" label="等价 IPv4" :value="info.mapped" mono />
      </PkCard>

      <PkCard title="规范化结果" accent="var(--pk-accent)">
        <PkRow label="压缩写法" :value="info.compressed" mono />
        <PkRow label="完整写法" :value="info.full" mono />
        <PkRow label="分组数" :value="info.groupCount + ' 组'" :copy="false" />
      </PkCard>

      <PkCard title="按 /64 划分子网" accent="#4A6FA5">
        <PkRow label="网络前缀（前 64 位）" :value="info.networkPart" mono />
        <PkRow label="接口标识（后 64 位）" :value="info.interfacePart" mono />
        <PkRow
          label="为什么要这样分"
          value="IPv6 默认按 /64 划分：前 64 位是网络前缀，后 64 位是接口标识。因为 64 位接口标识足够多，不需要像 IPv4 那样精打细算"
          :copy="false"
          stack
        />
      </PkCard>

      <PkCard title="逐组二进制" accent="#6B5B95">
        <text class="bin" selectable>{{ info.binary }}</text>
      </PkCard>
    </template>

    <PkCard title="怎么读 IPv6" accent="#8A6D3B">
      <PkRow v-for="(n, i) in IPV6_NOTES" :key="i" :label="'第 ' + (i + 1) + ' 条'" :value="n" :copy="false" stack />
      <PkRow label="首部缩写" value="每一组开头的 0 可以省略：0db8 → db8，0000 → 0" :copy="false" stack />
      <PkRow label=":: 的约束" value=":: 表示「这里有若干个 0 组」，但只能出现一次，否则无法确定省略了几组" :copy="false" stack />
      <PkRow label="内置 IPv4" value="::ffff:192.168.1.1 这种写法让 IPv6 栈能表示 IPv4 地址" :copy="false" stack />
    </PkCard>

    <PkCard title="地址段速查" accent="var(--pk-warn)">
      <PkRow label="::1" value="环回，相当于 127.0.0.1" :copy="false" stack />
      <PkRow label="::" value="未指定地址，相当于 0.0.0.0" :copy="false" stack />
      <PkRow label="fe80::/10" value="链路本地，只在同一网段有效，不路由" :copy="false" stack />
      <PkRow label="fc00::/7" value="唯一本地地址（内网），相当于私有网段" :copy="false" stack />
      <PkRow label="2000::/3" value="全球单播，能在公网路由" :copy="false" stack />
      <PkRow label="ff00::/8" value="组播地址" :copy="false" stack />
      <PkRow label="2001:db8::/32" value="文档示例专用，正式环境不要用" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { parseIpv6, IPV6_NOTES, IPV6_SAMPLES } from '@/utils/ipv6'
import { toast } from '@/utils/clipboard'

const input = ref('2001:0db8:0000:0000:0000:ff00:0042:8329')

const parsed = computed(() => {
  if (!input.value.trim()) return { info: null, error: '' }
  try {
    return { info: parseIpv6(input.value), error: '' }
  } catch (e) {
    return { info: null, error: e.message }
  }
})
const info = computed(() => parsed.value.info)
const error = computed(() => parsed.value.error)

function paste() {
  uni.getClipboardData({
    success(res) {
      if (res.data) input.value = String(res.data).trim()
      else toast('剪贴板是空的')
    },
    fail() {
      toast('读取失败')
    },
  })
}
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 22rpx;
}
.quick-row {
  display: flex;
  flex-wrap: wrap;
  margin-top: 4rpx;
}
.quick-i {
  display: inline-block;
  font-size: 22rpx;
  color: var(--pk-accent);
  margin: 8rpx 14rpx 0 0;
  padding: 12rpx 20rpx;
  line-height: 1.3;
  border-radius: 10rpx;
  background: var(--pk-accent-soft);
}
.hero {
  padding: 22rpx 24rpx 12rpx;
}
.hero__t {
  font-size: 40rpx;
  font-weight: 700;
  color: var(--pk-text);
  line-height: 1.3;
}
.bin {
  display: block;
  padding: 18rpx 24rpx;
  font-size: 20rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text-2);
  line-height: 1.9;
  word-break: break-all;
}
</style>
