<template>
  <view>
    <PkCard title="输入 IP 或网段" accent="#2F7A8C">
      <PkField v-model="input" placeholder="192.168.1.10/24 或 10.0.0.1 255.255.0.0" />
      <view class="quick-row">
        <text v-for="s in COMMON_SUBNETS" :key="s.cidr" class="quick-i" @tap="input = s.cidr">{{ s.cidr }}</text>
      </view>
      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <template v-if="!error && info">
      <PkCard title="网段概览" accent="var(--pk-accent)">
        <view class="hero">
          <text class="hero__cidr">{{ info.cidr }}</text>
          <text class="hero__hosts">{{ info.hostCount }} 个可用地址</text>
        </view>
        <PkRow label="地址类型" :value="info.special ? info.special.name + '（' + info.special.note + '）' : info.ipClass" :copy="false" />
        <PkRow label="网络地址" :value="info.network" mono />
        <PkRow label="广播地址" :value="info.broadcast" mono />
        <PkRow label="第一个可用" :value="info.firstHost" mono />
        <PkRow label="最后一个可用" :value="info.lastHost" mono />
        <PkRow label="子网掩码" :value="info.mask + '  /' + info.prefix" mono />
        <PkRow label="反掩码" :value="info.wildcard" mono />
        <PkRow label="总地址数" :value="info.size + '（含网络号和广播号）'" :copy="false" />
      </PkCard>

      <PkCard title="你输入的是" accent="#4A6FA5">
        <PkRow label="IP" :value="info.ip" mono />
        <PkRow label="换算成整数" :value="String(info.ipInt)" mono />
        <PkRow label="十六进制" :value="info.hex" mono />
        <PkRow label="二进制" :value="info.ipBin" mono />
        <PkRow label="掩码二进制" :value="info.maskBin" mono />
        <PkRow
          v-if="info.isNetworkAddress || info.isBroadcastAddress"
          label="注意"
          :value="info.isNetworkAddress ? '这就是网络地址本身，不能配给主机' : '这就是广播地址，不能配给主机'"
          color="var(--pk-warn)"
          :copy="false"
          stack
        />
      </PkCard>

      <PkCard title="拆分子网" accent="#6B5B95">
        <PkField v-model="newPrefix" type="number" :label="'想拆成 /几（要大于 ' + info.prefix + '）'" placeholder="26" />
        <view class="quick-row">
          <text v-for="p in splitOptions" :key="p" class="quick-i" @tap="newPrefix = String(p)">/{{ p }}</text>
        </view>
        <view class="act-row">
          <PkBtn text="拆分" kind="primary" @tap="doSplit" />
        </view>
        <PkRow v-if="splitError" label="提示" :value="splitError" color="var(--pk-danger)" :copy="false" stack />
        <view v-if="subnets.length" class="subnets">
          <view v-for="s in subnets.slice(0, 40)" :key="s.index" class="subnet">
            <text class="subnet__cidr">{{ s.cidr }}</text>
            <text class="subnet__range">{{ s.range }}</text>
            <text class="subnet__hosts">{{ s.hosts }} 台</text>
          </view>
          <text v-if="subnets.length > 40" class="subnet__more">…共 {{ subnets.length }} 个子网，只显示前 40 个</text>
        </view>
      </PkCard>
    </template>

    <PkCard title="IP 区间合并成网段" accent="#8A6D3B">
      <PkField v-model="rangeStart" label="起始 IP" placeholder="192.168.1.0" />
      <PkField v-model="rangeEnd" label="结束 IP" placeholder="192.168.1.255" />
      <view class="act-row">
        <PkBtn text="合并" kind="primary" @tap="doMerge" />
      </view>
      <PkRow v-if="mergeError" label="提示" :value="mergeError" color="var(--pk-danger)" :copy="false" stack />
      <template v-if="merged.length">
        <PkRow label="合并结果" :value="merged.join('  ')" mono />
        <PkRow label="段数" :value="merged.length + ' 段'" :copy="false" />
      </template>
    </PkCard>

    <PkCard title="内网网段速查" accent="var(--pk-warn)">
      <PkRow v-for="s in COMMON_SUBNETS" :key="s.cidr" :label="s.cidr" :value="s.note" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { parseCidr, splitSubnet, rangeToCidrs, COMMON_SUBNETS } from '@/utils/ip'
import { toast } from '@/utils/clipboard'

const input = ref('192.168.1.10/24')
const newPrefix = ref('26')
const rangeStart = ref('192.168.1.0')
const rangeEnd = ref('192.168.1.255')
const subnets = ref([])
const splitError = ref('')
const merged = ref([])
const mergeError = ref('')

const parsed = computed(() => {
  if (!input.value.trim()) return { info: null, error: '' }
  try {
    return { info: parseCidr(input.value), error: '' }
  } catch (e) {
    return { info: null, error: e.message }
  }
})
const info = computed(() => parsed.value.info)
const error = computed(() => parsed.value.error)

const splitOptions = computed(() => {
  if (!info.value) return []
  const p = info.value.prefix
  return [p + 1, p + 2, p + 3, p + 4].filter((x) => x <= 32)
})

function doSplit() {
  splitError.value = ''
  subnets.value = []
  try {
    subnets.value = splitSubnet(info.value.cidr, Number(newPrefix.value))
  } catch (e) {
    splitError.value = e.message
  }
}

function doMerge() {
  mergeError.value = ''
  merged.value = []
  try {
    merged.value = rangeToCidrs(rangeStart.value, rangeEnd.value)
    if (!merged.value.length) mergeError.value = '合并结果为空，检查一下起止地址'
  } catch (e) {
    mergeError.value = e.message
  }
}
</script>

<style scoped>
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
  display: flex;
  align-items: baseline;
  padding: 24rpx 24rpx 18rpx;
}
.hero__cidr {
  font-size: 40rpx;
  font-weight: 600;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
  flex: 1;
}
.hero__hosts {
  font-size: 22rpx;
  color: var(--pk-text-3);
}
.act-row {
  display: flex;
  gap: 20rpx;
  padding: 10rpx 0 16rpx;
}
.subnets {
  padding: 4rpx 24rpx 18rpx;
}
.subnet {
  display: flex;
  align-items: center;
  padding: 12rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.subnet__cidr {
  font-size: 23rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-accent);
  min-width: 220rpx;
}
.subnet__range {
  flex: 1;
  font-size: 21rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text-3);
  word-break: break-all;
}
.subnet__hosts {
  font-size: 21rpx;
  color: var(--pk-text-3);
  margin-left: 12rpx;
}
.subnet__more {
  display: block;
  font-size: 21rpx;
  color: var(--pk-text-3);
  padding-top: 14rpx;
}
</style>
