<template>
  <view>
    <PkCard title="输入权限" accent="#8C5B3E">
      <PkField v-model="input" placeholder="755 或 4755 或 rwxr-xr-x">
        <template #labelRight>
          <text class="mini-act" @tap="input = '755'">755</text>
          <text class="mini-act" @tap="input = '644'">644</text>
        </template>
      </PkField>
      <PkRow v-if="error" label="提示" :value="error" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <template v-if="!error && info">
      <PkCard title="解析结果" accent="var(--pk-accent)">
        <view class="perm-hero">
          <text class="perm-hero__t">{{ info.symbolic }}</text>
          <text class="perm-hero__o">{{ info.octal4 }}</text>
        </view>
        <PkRow label="数字写法（三位）" :value="info.octal3" mono />
        <PkRow label="数字写法（含特殊位）" :value="info.octal4" mono />
        <PkRow label="符号写法" :value="info.symbolic" mono />
        <PkRow label="chmod 命令" :value="info.command" mono />
        <PkRow label="递归目录" :value="info.recursive" mono />
      </PkCard>

      <PkCard title="逐位解读" accent="#4A6FA5">
        <view v-for="c in info.classes" :key="c.name" class="cls">
          <view class="cls__head">
            <text class="cls__n">{{ c.name }}</text>
            <text class="cls__rwx">{{ c.rwx }}</text>
            <text class="cls__code">{{ c.code }}</text>
          </view>
          <text class="cls__t">{{ c.text }}</text>
        </view>
      </PkCard>

      <PkCard v-if="info.specialBits.length" title="特殊位" accent="var(--pk-warn)">
        <view v-for="b in info.specialBits" :key="b.key" class="cls">
          <view class="cls__head">
            <text class="cls__n">{{ b.name }}</text>
            <text class="cls__code">s</text>
          </view>
          <text class="cls__t">{{ b.note }}</text>
        </view>
      </PkCard>

      <PkCard v-if="info.warnings.length" title="安全提醒" accent="var(--pk-danger)">
        <view v-for="(w, i) in info.warnings" :key="i" class="warn">
          <text class="warn__t">{{ w.text }}</text>
          <text class="warn__n">{{ w.note }}</text>
        </view>
      </PkCard>
      <PkCard v-else title="安全检查" accent="var(--pk-accent)">
        <PkRow label="结论" value="没有发现明显危险的组合" color="var(--pk-accent)" :copy="false" stack />
      </PkCard>
    </template>

    <PkCard title="常用权限" accent="#6B5B95">
      <view
        v-for="p in COMMON_PERMS"
        :key="p.octal"
        class="common"
        hover-class="common--hover"
        @tap="input = p.octal"
      >
        <view class="common__head">
          <text class="common__o">{{ p.octal }}</text>
          <text class="common__s">{{ p.symbolic }}</text>
        </view>
        <text class="common__u">{{ p.use }}</text>
      </view>
    </PkCard>

    <PkCard title="数字怎么来的" accent="#4A6FA5">
      <PkRow label="读 r" value="加 4" :copy="false" />
      <PkRow label="写 w" value="加 2" :copy="false" />
      <PkRow label="执行 x" value="加 1" :copy="false" />
      <PkRow label="示例" value="rwx = 4+2+1 = 7；rw- = 4+2 = 6；r-x = 4+1 = 5" :copy="false" stack />
      <PkRow label="三组顺序" value="属主、同组、其他人，所以 755 = rwx r-x r-x" :copy="false" stack />
      <PkRow label="第四位" value="SUID=4、SGID=2、Sticky=1，如 4755、1777" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { parsePerm, COMMON_PERMS } from '@/utils/perm'

const input = ref('755')

const parsed = computed(() => {
  if (!input.value.trim()) return { info: null, error: '' }
  try {
    return { info: parsePerm(input.value), error: '' }
  } catch (e) {
    return { info: null, error: e.message }
  }
})
const info = computed(() => parsed.value.info)
const error = computed(() => parsed.value.error)
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 22rpx;
}
.perm-hero {
  display: flex;
  align-items: baseline;
  padding: 24rpx 24rpx 20rpx;
}
.perm-hero__t {
  font-size: 40rpx;
  font-weight: 600;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
  letter-spacing: 2rpx;
  flex: 1;
}
.perm-hero__o {
  font-size: 32rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-accent);
}
.cls {
  padding: 16rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.cls:last-child {
  border-bottom: none;
}
.cls__head {
  display: flex;
  align-items: center;
}
.cls__n {
  font-size: 26rpx;
  color: var(--pk-text);
  min-width: 110rpx;
}
.cls__rwx {
  font-size: 26rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-accent);
  flex: 1;
}
.cls__code {
  font-size: 24rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text-3);
}
.cls__t {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
}
.warn {
  margin: 10rpx 24rpx 14rpx;
  padding: 16rpx 18rpx;
  border-radius: var(--pk-radius-sm);
  background: rgba(180, 85, 62, 0.1);
}
.warn__t {
  display: block;
  font-size: 24rpx;
  color: var(--pk-danger);
  font-weight: 600;
}
.warn__n {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
  line-height: 1.6;
}
.common {
  padding: 16rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.common--hover {
  background: var(--pk-seg-bg);
}
.common__head {
  display: flex;
  align-items: baseline;
}
.common__o {
  font-size: 28rpx;
  font-weight: 600;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
  min-width: 110rpx;
}
.common__s {
  font-size: 24rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-accent);
}
.common__u {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
  line-height: 1.6;
}
</style>
