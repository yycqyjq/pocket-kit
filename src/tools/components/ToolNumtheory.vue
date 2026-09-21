<template>
  <view>
    <PkCard padded>
      <PkField v-model="n" label="整数" placeholder="360，也接受 1_000_000 与负数">
        <template #labelRight>
          <text class="mini-act" @tap="n = ''">清空</text>
        </template>
      </PkField>
      <view class="quick-row">
        <text v-for="s in N_SAMPLES" :key="s.name" class="quick-i" @tap="n = s.v">{{ s.name }}</text>
      </view>
      <PkRow v-if="nv.error" label="输入问题" :value="nv.error" color="var(--pk-danger)" :copy="false" stack />
      <template v-else-if="nv.t">
        <PkRow label="规整后" :value="nv.t.str" mono />
        <PkRow label="位数" :value="digits + ' 位' + (nv.t.neg ? '（负数，按绝对值分析）' : '')" :copy="false" />
        <PkRow label="BigInt 支持" :value="bigText" :copy="false" stack />
        <PkRow
          v-if="tooBig && !force"
          label="大数保护"
          :value="'超过 ' + FACTOR_DIGITS + ' 位，分解可能很慢，已先停手。点下面的按钮继续。'"
          color="var(--pk-warn)"
          :copy="false"
          stack
        />
        <view v-if="tooBig && !force" class="act-row">
          <PkBtn text="仍然分解" kind="soft" @tap="force = true" />
        </view>
      </template>
      <text v-else class="tip">填一个整数，一次给出素性、分解、约数、φ(n) 与数位信息。</text>
    </PkCard>

    <PkCard v-if="show" title="素性判定" accent="#3E6B8C">
      <view class="hero">
        <text class="hero__v" :class="pt.v && pt.v.prime ? 'hero__v--ok' : 'hero__v--no'">{{ primeWord }}</text>
        <text class="hero__s">{{ pt.v ? pt.v.n : '' }}</text>
      </view>
      <PkRow v-if="pt.e" label="判定失败" :value="pt.e" color="var(--pk-danger)" :copy="false" stack />
      <template v-else-if="pt.v">
        <PkRow label="isPrime" :value="String(isPrime(nv.t.str))" mono />
        <PkRow label="用的方法" :value="pt.v.method" :copy="false" stack />
        <PkRow label="依据" :value="pt.v.reason" :copy="false" stack />
        <PkRow v-if="pt.v.divisor" label="最小证据（因子）" :value="pt.v.divisor" color="var(--pk-danger)" mono />
        <view class="bases">
          <text class="bases__t">Miller–Rabin 确定性基底（{{ MR_BASES.length }} 个）</text>
          <view class="bases__row">
            <text v-for="b in MR_BASES" :key="b" class="bases__i">{{ b }}</text>
          </view>
          <text class="bases__n">{{ MR_LIMIT_NOTE }}</text>
        </view>
        <text class="tip">判定顺序是先用 2…997 的小素数表试除（命中即定），剩下的才走 Miller–Rabin，所以合数大多在试除阶段就被逮住。</text>
        <PkRow label="上一个素数" :value="nb.v ? String(nb.v.prev || '—') : '—'" mono />
        <PkRow label="下一个素数" :value="nb.v ? String(nb.v.next) : '—'" mono />
        <PkRow v-if="nb.v && nb.v.gap" label="两侧间隔之和" :value="nb.v.gap" />
        <PkRow
          v-if="nb.v"
          label="孪生素数？"
          :value="nb.v.twin ? '是，与它相差 2 的素数就在旁边' : '否'"
          :color="nb.v.twin ? 'var(--pk-accent)' : ''"
          :copy="false"
        />
      </template>
    </PkCard>

    <PkCard v-if="show" title="质因数分解" accent="#4A6FA5">
      <PkRow v-if="ft.e" label="分解失败" :value="ft.e" color="var(--pk-danger)" :copy="false" stack />
      <template v-else-if="ft.v">
        <view class="hero">
          <text class="hero__v">{{ ft.v.display || ft.v.expression }}</text>
          <text class="hero__s">{{ ft.v.n }} 的质因数分解</text>
        </view>
        <view v-if="ft.v.factors.length" class="tb">
          <view class="tb__h">
            <text class="tb__c tb__c--1">素因子 p</text>
            <text class="tb__c tb__c--2">指数 e</text>
            <text class="tb__c tb__c--3">p^e</text>
          </view>
          <view v-for="(f, i) in ft.v.factors" :key="i" class="tb__r">
            <text class="tb__c tb__c--1">{{ f.prime }}</text>
            <text class="tb__c tb__c--2">{{ f.exp }}</text>
            <text class="tb__c tb__c--3">{{ powText(f) }}</text>
          </view>
        </view>
        <PkRow label="不同素因子个数" :value="String(ft.v.distinctCount)" :copy="false" />
        <PkRow label="素因子总个数（含重数）" :value="String(ft.v.totalFactors)" :copy="false" />
        <PkRow label="约数个数 d(n)" :value="ft.v.divisorCount" color="var(--pk-accent)" />
        <PkRow label="约数和 σ(n)" :value="ft.v.sumDivisors" />
        <PkRow label="radical（无平方因子核）" :value="ft.v.radical" mono />
        <PkRow
          label="无平方因子？"
          :value="ft.v.squareFree ? '是，每个素因子都只出现一次' : '否，有素因子出现 2 次以上'"
          :copy="false"
          stack
        />
        <view class="steps">
          <text class="steps__h">试除与 Pollard–Rho 过程（最多记 {{ STEP_LIMIT }} 步）</text>
          <text v-for="(s, i) in visibleSteps" :key="i" class="steps__l">{{ s }}</text>
          <text v-if="ft.v.steps.length > STEP_VIEW" class="steps__m">…共 {{ ft.v.steps.length }} 步，只显示前 {{ STEP_VIEW }} 步。</text>
          <text v-if="!ft.v.steps.length" class="steps__m">这一步没有可展示的过程。</text>
        </view>
      </template>
    </PkCard>

    <PkCard v-if="show" title="约数与完全性" accent="#6B5B95">
      <PkRow v-if="dv.e" label="无法列约数" :value="dv.e" color="var(--pk-danger)" :copy="false" stack />
      <template v-else-if="dv.v">
        <PkRow label="约数个数" :value="dv.v.count + ' 个'" color="var(--pk-accent)" big />
        <PkRow label="约数和" :value="dv.v.sumAll" />
        <PkRow label="真约数和" :value="dv.v.sumProper" />
        <PkRow
          label="盈亏判定"
          :value="dv.v.kindName"
          :color="dv.v.kind === 'perfect' ? 'var(--pk-accent)' : ''"
          :copy="false"
        />
        <view class="chips">
          <text v-for="(d, i) in visibleDivisors" :key="i" class="chip">{{ d }}</text>
        </view>
        <text class="tip">
          共 {{ dv.v.count }} 个约数，这里显示 {{ visibleDivisors.length }} 个{{ dv.v.truncated ? '（util 层已截到前 ' + DIVISOR_LIST_LIMIT + ' 个）' : '' }}。
          约数由 {{ dv.v.factorization || dv.v.n }} 组合生成。
        </text>
        <PkRow
          v-if="pf.v"
          label="isPerfectNumber"
          :value="pf.v.perfect ? '完全数：真约数和 ' + pf.v.properSum + ' 正好等于自身' : '不是完全数（' + pf.v.kind + '）'"
          :color="pf.v.perfect ? 'var(--pk-accent)' : ''"
          :copy="false"
          stack
        />
      </template>
    </PkCard>

    <PkCard v-if="show" title="欧拉函数 φ(n)" accent="#8A6D3B">
      <PkRow v-if="ph.e" label="算不了" :value="ph.e" color="var(--pk-danger)" :copy="false" stack />
      <template v-else-if="ph.v">
        <view class="hero">
          <text class="hero__v">{{ ph.v.result }}</text>
          <text class="hero__s">φ({{ ph.v.n }})：1 到 {{ ph.v.n }} 中与它互质的数有这么多</text>
        </view>
        <PkRow label="公式" :value="ph.v.formula" :copy="false" stack />
        <PkRow label="用到的素因子" :value="ph.v.primes.join(' 、 ') || '—'" mono :copy="false" stack />
        <text class="tip">φ 是乘性函数：先分解，再对每个不同素因子乘一次 (1 − 1/p)。n 为素数时 φ(n) = n − 1。</text>
      </template>
    </PkCard>

    <PkCard v-if="show" title="数位、数字根与位" accent="#B5527A">
      <PkSeg v-model="baseKey" :items="DIGIT_BASES" />
      <PkRow v-if="di.e" label="算不了" :value="di.e" color="var(--pk-danger)" :copy="false" stack />
      <template v-else-if="di.v">
        <PkRow :label="baseName + '表示'" :value="di.v.repr" mono />
        <PkRow label="位数" :value="String(di.v.digitCount)" :copy="false" />
        <PkRow label="数位和" :value="di.v.digitSum" mono />
        <PkRow label="数字根" :value="di.v.digitalRoot" color="var(--pk-accent)" />
        <PkRow label="公式校验 1+(n−1)mod(b−1)" :value="di.v.rootByFormula" mono :copy="false" />
        <view v-if="di.v.steps.length" class="steps">
          <text class="steps__h">逐次求数位和</text>
          <text v-for="(s, i) in di.v.steps.slice(0, STEP_VIEW)" :key="i" class="steps__l">{{ s }}</text>
          <text v-if="di.v.steps.length > STEP_VIEW" class="steps__m">…共 {{ di.v.steps.length }} 步，只显示前 {{ STEP_VIEW }} 步。</text>
        </view>
        <text class="tip">{{ di.v.note }}</text>
      </template>
      <view v-if="pv.v" class="pv">
        <text class="pv__h">十进制数位拆解（共 {{ pv.v.digits }} 位，数位和 {{ pv.v.sumOfDigits }}）</text>
        <view class="pv__row">
          <text v-for="(r, i) in pv.v.rows" :key="i" class="pv__c">
            <text class="pv__d">{{ r.digit }}</text>
            <text class="pv__u">{{ r.unit }}</text>
          </text>
          <text v-if="!pv.v.rows.length" class="pv__e">每一位都是 0</text>
        </view>
      </view>
      <PkRow v-if="pc.v" label="是 2 的幂？" :value="pc.v.powerOf2 ? '是，2^' + pc.v.exponentOf2 : '否'" :color="pc.v.powerOf2 ? 'var(--pk-accent)' : ''" :copy="false" />
      <PkRow v-if="pc.v" label="是 10 的幂？" :value="pc.v.powerOf10 ? '是，10^' + pc.v.exponentOf10 : '否'" :color="pc.v.powerOf10 ? 'var(--pk-accent)' : ''" :copy="false" />
      <text v-if="pc.v && pc.v.note" class="tip">{{ pc.v.note }}</text>
    </PkCard>

    <PkCard title="GCD / LCM（多个数）" accent="#3E7A4E">
      <PkField v-model="multi" type="textarea" :area-height="120" label="一批整数（空格 / 逗号 / 换行分隔）" placeholder="48 36 60">
        <template #labelRight>
          <text class="mini-act" @tap="multi = '48 36 60'">填样例</text>
        </template>
      </PkField>
      <view class="quick-row">
        <text v-for="s in MULTI_SAMPLES" :key="s.name" class="quick-i" @tap="multi = s.v">{{ s.name }}</text>
      </view>
      <PkRow v-if="glError" label="提示" :value="glError" color="var(--pk-danger)" :copy="false" stack />
      <template v-else-if="gcdR && lcmR">
        <PkRow label="最大公因数 GCD" :value="gcdR.result" color="var(--pk-accent)" big />
        <PkRow label="最小公倍数 LCM" :value="lcmR.result" color="var(--pk-accent)" big />
        <PkRow label="参与的数" :value="gcdR.inputs.join(' 、 ')" mono :copy="false" stack />
        <view class="steps">
          <text class="steps__h">欧几里得算法逐步归约</text>
          <text v-for="(s, i) in gcdR.steps.slice(0, STEP_VIEW)" :key="'g' + i" class="steps__l">{{ s }}</text>
        </view>
        <view class="steps">
          <text class="steps__h">LCM 两两累加</text>
          <text v-for="(s, i) in lcmR.steps.slice(0, STEP_VIEW)" :key="'l' + i" class="steps__l">{{ s }}</text>
          <text v-if="lcmR.steps.length > STEP_VIEW" class="steps__m">…共 {{ lcmR.steps.length }} 步，只显示前 {{ STEP_VIEW }} 步。</text>
        </view>
        <view v-if="pairRows.length" class="tb">
          <view class="tb__h">
            <text class="tb__c tb__c--1">相邻两数</text>
            <text class="tb__c tb__c--2">gcd</text>
            <text class="tb__c tb__c--3">lcm</text>
            <text class="tb__c tb__c--4">互质</text>
          </view>
          <view v-for="(p, i) in pairRows" :key="i" class="tb__r">
            <text class="tb__c tb__c--1">{{ p.pair }}</text>
            <text class="tb__c tb__c--2">{{ p.g }}</text>
            <text class="tb__c tb__c--3">{{ p.l }}</text>
            <text class="tb__c tb__c--4">{{ p.cp }}</text>
          </view>
        </view>
        <text v-if="pairTruncated" class="tip">…相邻配对共 {{ pairTotal }} 对，只显示前 {{ PAIR_VIEW }} 对。</text>
        <text class="tip">GCD 用辗转相除，LCM 按 |a·b| ÷ GCD 累加；0 与任何数的 LCM 定义为 0。校验台只按绝对值算。</text>
      </template>
      <PkEmpty v-else title="填两个以上的整数" desc="例：48 36 60 → GCD 12、LCM 720" />
    </PkCard>

    <PkCard title="素数表与第 n 个素数" accent="#8C3E52">
      <text class="tip">筛法与序号查询都比较吃算力，所以这几格要点按钮才跑。筛的上限是 {{ SIEVE_TXT }}。</text>
      <PkField v-model="sieveLimit" type="number" :label="'≤ 多少（筛和 π(x) 共用这一个数，最多 ' + SIEVE_LIMIT + '）'" placeholder="100" />
      <view class="act-row">
        <PkBtn text="筛一遍" kind="primary" @tap="runSieve" />
        <PkBtn text="算素数个数 π(x)" kind="ghost" @tap="runPc" />
      </view>
      <template v-if="sieveOut">
        <view class="chips">
          <text v-for="(p, i) in sieveOut.shown" :key="i" class="chip chip--p">{{ p }}</text>
        </view>
        <text class="tip">
          ≤ {{ sieveOut.used }} 的素数共 {{ sieveOut.rows.length }} 个，这里显示 {{ sieveOut.shown.length }} 个{{ sieveOut.clamped ? '（已按筛上限截断）' : '' }}。
        </text>
      </template>
      <PkRow v-if="pcOut" label="π(x)" :value="pcOut.countText" :copy="false" stack />
      <PkRow v-if="pcOut" label="精确还是近似" :value="pcOut.note" :color="pcOut.exact ? '' : 'var(--pk-warn)'" :copy="false" stack />
      <PkField v-model="nthK" type="number" label="第几个素数" placeholder="100" />
      <text class="tip">
        nthPrime 名义上支持到第 {{ NTH_MAX }} 个，但它要先按估算区间筛素数，而筛子上限是 {{ SIEVE_TXT }}，
        所以实测最大只到第 {{ NTH_USABLE_TXT }} 个（即 {{ SIEVE_TXT }} 以内的素数个数），再大就会被 util 拒绝。
      </text>
      <view class="act-row">
        <PkBtn text="查第 n 个" kind="primary" @tap="runNth" />
      </view>
      <PkRow v-if="nthMsg" label="提示" :value="nthMsg" color="var(--pk-danger)" :copy="false" stack />
      <PkRow v-if="nthOut" label="结果" :value="nthOut" color="var(--pk-accent)" big />
    </PkCard>

    <PkCard title="完全数与亲和数" accent="#B08A2F">
      <text class="tip">偶完全数按欧几里得–欧拉定理生成：2^(p−1)(2^p−1)，其中 2^p−1 是梅森素数。</text>
      <view v-for="k in KNOWN_PERFECT" :key="k.index" class="krow" @tap="usePerfect(k)">
        <text class="krow__i">{{ k.index }}</text>
        <text class="krow__v">{{ k.value }}</text>
        <text class="krow__p">p = {{ k.p }}</text>
      </view>
      <text v-if="show && pf.v" class="tip">点一行可把该完全数填进最上面的输入框。当前 {{ n }} 的判定见「约数与完全性」卡。</text>
      <PkField v-model="amA" type="number" label="亲和数判定 a" placeholder="220" />
      <PkField v-model="amB" type="number" label="亲和数判定 b" placeholder="284" />
      <view class="quick-row">
        <text v-for="p in AMI_SAMPLES" :key="p.name" class="quick-i" @tap="amA = p.a; amB = p.b">{{ p.name }}</text>
      </view>
      <PkRow v-if="ami.e" label="判不了" :value="ami.e" color="var(--pk-danger)" :copy="false" stack />
      <template v-else-if="ami.v">
        <PkRow
          label="结论"
          :value="ami.v.yes ? 'a、b 互为亲和数' : '不是亲和数对'"
          :color="ami.v.yes ? 'var(--pk-accent)' : 'var(--pk-danger)'"
          :copy="false"
        />
        <PkRow label="σ(a) − a" :value="ami.v.aProperSum" mono />
        <PkRow label="σ(b) − b" :value="ami.v.bProperSum" mono />
        <text class="tip">{{ ami.v.note }}</text>
      </template>
      <PkField v-model="amiLimit" type="number" label="枚举 ≤ 多少的亲和数对（上限 200000）" placeholder="3000" />
      <view class="act-row">
        <PkBtn text="枚举亲和数对" kind="primary" @tap="runAmi" />
      </view>
      <template v-if="amiList">
        <view v-for="(p, i) in amiList.shown" :key="i" class="krow">
          <text class="krow__i">{{ i + 1 }}</text>
          <text class="krow__v">{{ p.a }}</text>
          <text class="krow__p">{{ p.b }}</text>
        </view>
        <text class="tip">
          ≤ {{ amiList.used }} 内共找到 {{ amiList.rows.length }} 对，这里显示 {{ amiList.shown.length }} 对{{ amiList.capped ? '（util 最多记 200 对）' : '' }}。
        </text>
      </template>
    </PkCard>

    <PkCard title="罗马数字互转" accent="#7A4A6B">
      <PkField v-model="arabic" type="number" label="十进制 → 罗马" placeholder="2026" />
      <PkRow v-if="tr.e" label="转不了" :value="tr.e" color="var(--pk-danger)" :copy="false" stack />
      <template v-else-if="tr.v">
        <view class="hero">
          <text class="hero__v">{{ tr.v.roman }}</text>
          <text class="hero__s">{{ tr.v.n }} 的罗马写法</text>
        </view>
        <view class="chips">
          <text v-for="(b, i) in tr.v.breakdown" :key="i" class="chip chip--r">{{ b.sym }} = {{ b.value }}</text>
        </view>
        <text class="tip">拆解顺序：{{ tr.v.breakdown.map((b) => b.note).join(' + ') || '—' }}</text>
      </template>
      <PkField v-model="roman" label="罗马 → 十进制" placeholder="MMXXVI" />
      <PkRow v-if="rf.e" label="读不懂" :value="rf.e" color="var(--pk-danger)" :copy="false" stack />
      <template v-else-if="rf.v">
        <PkRow label="值" :value="String(rf.v.value)" color="var(--pk-accent)" big />
        <PkRow label="规范写法" :value="rf.v.canonical || '—'" mono />
        <PkRow label="写法是否规范" :value="rf.v.strict ? '规范' : '非规范'" :color="rf.v.strict ? '' : 'var(--pk-warn)'" :copy="false" />
        <text class="tip">{{ rf.v.note }}</text>
        <view class="steps">
          <text class="steps__h">逐字符读取（小在大前作减法）</text>
          <text v-for="(s, i) in rf.v.steps.slice(0, STEP_VIEW)" :key="i" class="steps__l">{{ s }}</text>
          <text v-if="rf.v.steps.length > STEP_VIEW" class="steps__m">…共 {{ rf.v.steps.length }} 步，只显示前 {{ STEP_VIEW }} 步。</text>
        </view>
      </template>
      <text class="tip">{{ ROMAN_RANGE_NOTE }}</text>
      <view class="tb">
        <view class="tb__h">
          <text class="tb__c tb__c--1">符号</text>
          <text class="tb__c tb__c--2">数值</text>
          <text class="tb__c tb__c--3">用法</text>
        </view>
        <view v-for="t in ROMAN_TABLE" :key="t.sym" class="tb__r">
          <text class="tb__c tb__c--1">{{ t.sym }}</text>
          <text class="tb__c tb__c--2">{{ t.value }}</text>
          <text class="tb__c tb__c--3">{{ romanHint(t.sym) }}</text>
        </view>
      </view>
      <text class="tip">I V X L C D M 七个字母，按上表从大到小贪心匹配；同方向最多连写三个，所以 4 写作 IV、9 写作 IX。</text>
    </PkCard>

    <PkCard title="上限与算法说明" accent="var(--pk-accent)">
      <view v-for="r in limitRows" :key="r.t" class="note">
        <text class="note__t">{{ r.t }}</text>
        <text class="note__d">{{ r.d }}</text>
      </view>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  hasBigInt,
  MR_BASES,
  MR_LIMIT_NOTE,
  STEP_LIMIT,
  DIVISOR_LIST_LIMIT,
  SIEVE_LIMIT,
  toInt,
  isPrime,
  primeTest,
  factorize,
  divisors,
  gcdAll,
  gcd,
  lcmAll,
  lcm,
  coprime,
  phi,
  primeNeighbors,
  nthPrime,
  sievePrimes,
  primeCountUpTo,
  DIGIT_BASES,
  digitInfo,
  KNOWN_PERFECT,
  isPerfectNumber,
  amicablePair,
  amicablePairsUpTo,
  ROMAN_TABLE,
  ROMAN_RANGE_NOTE,
  toRoman,
  fromRoman,
  placeValue,
  powerCheck,
} from '@/utils/numtheory'
import { toast } from '@/utils/clipboard'

const STEP_VIEW = 24
const DIVISOR_VIEW = 120
const PAIR_VIEW = 12
const FACTOR_DIGITS = 15
const SIEVE_VIEW = 100
const AMI_VIEW = 30
const AMI_MAX = 200000
const NTH_MAX = 400000
/**
 * nthPrime 名义上限是 40 万，但它内部要靠 sievePrimes 筛到 p_n 的估算区间，
 * 而 sievePrimes 会被 SIEVE_LIMIT 截断，所以真正能算出来的最大序号是 π(SIEVE_LIMIT)。
 */
const NTH_USABLE = 348513
const SIEVE_TXT = thou(SIEVE_LIMIT)
const NTH_USABLE_TXT = thou(NTH_USABLE)

/** 千分位自己拼，不依赖运行环境的 locale */
function thou(v) {
  const s = String(Math.abs(Math.floor(Number(v) || 0)))
  const out = []
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out.push(',')
    out.push(s[i])
  }
  return (Number(v) < 0 ? '-' : '') + out.join('')
}

const N_SAMPLES = [
  { name: '360 高合成', v: '360' },
  { name: '完全数 28', v: '28' },
  { name: '素数 7919', v: '7919' },
  { name: '梅森 2^31−1', v: '2147483647' },
  { name: '亲和数 220', v: '220' },
  { name: '下划线写法', v: '1_000_000' },
  { name: '大合数', v: '999999999999999' },
  { name: '1', v: '1' },
  { name: '0', v: '0' },
  { name: '负数 −12', v: '-12' },
]

const MULTI_SAMPLES = [
  { name: '48 36 60', v: '48 36 60' },
  { name: '互质的一对', v: '17 19' },
  { name: '含 0', v: '12 0 18' },
  { name: '大数', v: '99991 99989' },
]

const AMI_SAMPLES = [
  { name: '220 与 284', a: '220', b: '284' },
  { name: '1184 与 1210', a: '1184', b: '1210' },
  { name: '2620 与 2924', a: '2620', b: '2924' },
  { name: '拿完全数试试', a: '28', b: '28' },
]

const n = ref('360')
const force = ref(false)
const baseKey = ref('10')
const multi = ref('48 36 60')
const sieveLimit = ref('100')
const sieveOut = ref(null)
const pcOut = ref(null)
const nthK = ref('100')
const nthOut = ref('')
const nthMsg = ref('')
const amA = ref('220')
const amB = ref('284')
const amiLimit = ref('3000')
const amiList = ref(null)
const arabic = ref('2026')
const roman = ref('MMXXVI')

function attempt(fn) {
  try {
    return { ok: true, v: fn(), e: '' }
  } catch (err) {
    return { ok: false, v: null, e: (err && err.message) || '算不出来' }
  }
}

/** 输入规整：toInt 会吃掉空格 / 下划线 / 千分位逗号，非整数直接抛错 */
const nv = computed(() => {
  const raw = String(n.value || '').trim()
  if (!raw) return { t: null, error: '' }
  const r = attempt(() => toInt(raw))
  return { t: r.v, error: r.e }
})
const digits = computed(() => (nv.value.t ? nv.value.t.str.replace(/^-/, '').length : 0))
const tooBig = computed(() => digits.value > FACTOR_DIGITS)
const show = computed(() => !!nv.value.t)
/** 超过 15 位且用户没点「仍然分解」时，跳过重的分解/约数/φ 计算 */
const lightOk = computed(() => show.value && (!tooBig.value || force.value))

const bigText = computed(() =>
  hasBigInt ? '本环境有 BigInt，大数走精确整数路径' : '本环境没有 BigInt，已降级为 Number，超过 2^53 不保证精确'
)

const pt = computed(() => (show.value ? attempt(() => primeTest(nv.value.t.str)) : { v: null, e: '' }))
const nb = computed(() => (show.value ? attempt(() => primeNeighbors(nv.value.t.str)) : { v: null, e: '' }))
const primeWord = computed(() => {
  if (!pt.value.v) return '判不了'
  const s = nv.value.t.str.replace(/^-/, '')
  if (s === '0' || s === '1') return s + ' 既不是素数也不是合数'
  return pt.value.v.prime ? '是素数' : '不是素数（合数）'
})

const ft = computed(() => (lightOk.value ? attempt(() => factorize(nv.value.t.str)) : { v: null, e: '' }))
const visibleSteps = computed(() => (ft.value.v ? ft.value.v.steps.slice(0, STEP_VIEW) : []))
function powText(f) {
  /* 用 BigInt() 调用而不是 1n 字面量，避开构建目标对 BigInt 字面量的语法限制 */
  if (hasBigInt) {
    let v = BigInt(1)
    const p = BigInt(f.prime)
    for (let i = 0; i < f.exp; i++) v = v * p
    return v.toString()
  }
  let v = 1
  for (let i = 0; i < f.exp; i++) v *= f.primeNum
  return v > Number.MAX_SAFE_INTEGER ? v.toExponential(3) : String(v)
}

const dv = computed(() => (lightOk.value ? attempt(() => divisors(nv.value.t.str)) : { v: null, e: '' }))
const visibleDivisors = computed(() => (dv.value.v ? dv.value.v.list.slice(0, DIVISOR_VIEW) : []))
const pf = computed(() => (lightOk.value ? attempt(() => isPerfectNumber(nv.value.t.str)) : { v: null, e: '' }))

const ph = computed(() => (lightOk.value ? attempt(() => phi(nv.value.t.str)) : { v: null, e: '' }))

const di = computed(() => (show.value ? attempt(() => digitInfo(nv.value.t.str, Number(baseKey.value))) : { v: null, e: '' }))
const baseName = computed(() => {
  const b = DIGIT_BASES.filter((x) => x.key === baseKey.value)[0]
  return b ? b.name : baseKey.value + ' 进制'
})
const pv = computed(() => (show.value ? attempt(() => placeValue(nv.value.t.str)) : { v: null, e: '' }))
const pc = computed(() => (show.value ? attempt(() => powerCheck(nv.value.t.str)) : { v: null, e: '' }))

/** GCD / LCM */
const glState = computed(() => {
  const raw = String(multi.value || '').trim()
  if (!raw) return { g: null, l: null, error: '' }
  const a = attempt(() => gcdAll(raw))
  if (!a.ok) return { g: null, l: null, error: a.e }
  const b = attempt(() => lcmAll(raw))
  return { g: a.v, l: b.v, error: b.e }
})
const gcdR = computed(() => glState.value.g)
const lcmR = computed(() => glState.value.l)
const glError = computed(() => glState.value.error)
const pairRows = computed(() => {
  const g = gcdR.value
  if (!g || g.inputs.length < 2) return []
  const rows = []
  for (let i = 0; i < Math.min(g.inputs.length - 1, PAIR_VIEW); i++) {
    const a = g.inputs[i]
    const b = g.inputs[i + 1]
    const c = attempt(() => coprime(a, b))
    rows.push({
      pair: a + ' , ' + b,
      g: gcd(a, b),
      l: lcm(a, b),
      cp: c.ok ? (c.v.yes ? '是' : '公因数 ' + c.v.gcd) : '—',
    })
  }
  return rows
})
const pairTotal = computed(() => (gcdR.value ? Math.max(0, gcdR.value.inputs.length - 1) : 0))
const pairTruncated = computed(() => pairTotal.value > PAIR_VIEW)

function runSieve() {
  const want = Math.floor(Number(sieveLimit.value))
  if (!(want >= 2)) {
    sieveOut.value = null
    toast('筛的起点至少要 2')
    return
  }
  const used = Math.min(want, SIEVE_LIMIT)
  const rows = sievePrimes(used)
  sieveOut.value = { rows, shown: rows.slice(0, SIEVE_VIEW), used, clamped: want > SIEVE_LIMIT }
  if (want > SIEVE_LIMIT) toast('已按筛上限截到 ' + SIEVE_LIMIT)
}

function runPc() {
  const want = Number(sieveLimit.value)
  if (!isFinite(want)) {
    pcOut.value = null
    toast('先填一个 x')
    return
  }
  const r = attempt(() => primeCountUpTo(want))
  if (!r.ok) {
    pcOut.value = null
    toast(r.e)
    return
  }
  pcOut.value = {
    countText: thou(r.v.count) + (r.v.exact ? '（精确）' : '（近似）'),
    note: r.v.note,
    exact: r.v.exact,
  }
}

function runNth() {
  nthMsg.value = ''
  nthOut.value = ''
  const k = Math.round(Number(nthK.value))
  if (!(k >= 1)) {
    nthMsg.value = '序号要是 1 以上的整数'
    return
  }
  if (k > NTH_MAX) {
    nthMsg.value = '序号超过 ' + thou(NTH_MAX) + '，util 直接拒绝'
    return
  }
  if (k > NTH_USABLE) {
    nthMsg.value =
      '第 ' + thou(k) + ' 个素数要筛到 ' + SIEVE_TXT + ' 以外，util 的筛上限不够用（实测最大第 ' + NTH_USABLE_TXT + ' 个）'
    return
  }
  const r = attempt(() => nthPrime(k))
  if (!r.ok) {
    nthMsg.value = r.e
    return
  }
  nthOut.value = '第 ' + k + ' 个素数是 ' + r.v
}

function usePerfect(k) {
  n.value = k.value
  force.value = true
  toast('已填入第 ' + k.index + ' 个完全数')
}

const ami = computed(() => {
  const a = String(amA.value || '').trim()
  const b = String(amB.value || '').trim()
  if (!a || !b) return { v: null, e: '' }
  return attempt(() => amicablePair(a, b))
})

function runAmi() {
  const want = Math.floor(Number(amiLimit.value))
  if (!(want >= 10)) {
    amiList.value = null
    toast('至少要 10 才谈得上亲和数对')
    return
  }
  const used = Math.min(want, AMI_MAX)
  const rows = amicablePairsUpTo(used)
  amiList.value = { rows, shown: rows.slice(0, AMI_VIEW), used, capped: rows.length >= 200 }
  if (want > AMI_MAX) toast('枚举上限 ' + AMI_MAX + '，已截断')
}

const tr = computed(() => {
  const raw = String(arabic.value || '').trim()
  if (!raw) return { v: null, e: '' }
  return attempt(() => toRoman(raw))
})
const rf = computed(() => {
  const raw = String(roman.value || '').trim()
  if (!raw) return { v: null, e: '' }
  return attempt(() => fromRoman(raw))
})
/** 单字母是基本符号，双字母（CM/XC/IV…）是减写法 */
function romanHint(sym) {
  return String(sym).length > 1 ? '减写法：小数写在大数左边相减' : '基本符号'
}

const limitRows = computed(() => [
  { t: 'STEP_LIMIT = ' + STEP_LIMIT, d: '分解过程最多记这么多步，多余的直接不记，避免长数列把页面拖死。' },
  { t: 'DIVISOR_LIST_LIMIT = ' + DIVISOR_LIST_LIMIT, d: '约数列表最多列这么多；再多只给个数与和（约数个数由分解式直接相乘得到，不用枚举）。' },
  { t: 'SIEVE_LIMIT = ' + thou(SIEVE_LIMIT), d: '埃氏筛的上限，超过就截断；π(x) 超出这个范围时改用 x/ln x 近似并标注不精确。' },
  {
    t: '第 n 个素数：名义 ' + thou(NTH_MAX) + '，实际 ' + NTH_USABLE_TXT,
    d:
      'nthPrime 声明支持到第 ' + thou(NTH_MAX) + ' 个，但它按估算区间调 sievePrimes，而后者被 SIEVE_LIMIT（' + SIEVE_TXT + '）截断，' +
      '超过第 ' + NTH_USABLE_TXT + ' 个会抛「估算区间不足」，界面上先替它拦下并说明原因。',
  },
  { t: '亲和数枚举上限 ' + thou(AMI_MAX), d: 'amicablePairsUpTo 内部还限最多记 200 对，超出会标注。' },
  { t: 'Miller–Rabin：' + MR_BASES.join('、'), d: MR_LIMIT_NOTE + '。低于这个界不是「大概率是素数」，而是确定是素数。' },
  { t: '试除小素数表', d: '2 到 997 的素数表用于快速排除与分解前段，能整除就立刻给出因子，比 MR 更便宜也更直观。' },
  { t: '纯数学结果', d: '素性、分解、盈亏与罗马数字都是数学口径，不构成任何密码学或工程建议。' },
])
</script>

<style scoped>
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 24rpx;
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
.act-row {
  display: flex;
  gap: 20rpx;
  padding: 10rpx 24rpx 16rpx;
}
.tip {
  display: block;
  font-size: 21rpx;
  line-height: 1.8;
  color: var(--pk-text-3);
  padding: 10rpx 24rpx 12rpx;
}
.hero {
  display: flex;
  flex-direction: column;
  padding: 18rpx 24rpx 10rpx;
}
.hero__v {
  font-size: 38rpx;
  font-weight: 600;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
  word-break: break-all;
  line-height: 1.4;
}
.hero__v--ok {
  color: var(--pk-accent);
}
.hero__v--no {
  color: var(--pk-warn);
}
.hero__s {
  font-size: 21rpx;
  color: var(--pk-text-3);
  margin-top: 4rpx;
  line-height: 1.7;
}
.tb {
  padding: 4rpx 24rpx 8rpx;
}
.tb__h {
  display: flex;
  align-items: baseline;
  padding: 12rpx 0 8rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line-strong);
}
.tb__r {
  display: flex;
  align-items: baseline;
  padding: 12rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.tb__c {
  font-size: 23rpx;
  color: var(--pk-text-2);
  font-family: Menlo, Consolas, monospace;
  word-break: break-all;
}
.tb__h .tb__c {
  font-size: 21rpx;
  color: var(--pk-text-3);
}
.tb__c--1 {
  width: 200rpx;
  flex-shrink: 0;
}
.tb__c--2,
.tb__c--3,
.tb__c--4 {
  flex: 1;
  text-align: right;
}
.steps {
  padding: 12rpx 24rpx 14rpx;
  border-top: var(--pk-line-w) solid var(--pk-line);
}
.steps__h {
  display: block;
  font-size: 21rpx;
  color: var(--pk-text-3);
  line-height: 1.7;
  margin-bottom: 6rpx;
}
.steps__l {
  display: block;
  font-size: 22rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text-2);
  line-height: 1.8;
  word-break: break-all;
}
.steps__m {
  display: block;
  font-size: 21rpx;
  color: var(--pk-text-3);
  padding-top: 8rpx;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  padding: 12rpx 18rpx 4rpx;
}
.chip {
  font-size: 22rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text-2);
  background: var(--pk-bg-soft);
  border: var(--pk-line-w) solid var(--pk-line);
  border-radius: 8rpx;
  margin: 6rpx;
  padding: 8rpx 14rpx;
  line-height: 1.5;
}
.chip--p {
  color: var(--pk-accent);
  background: var(--pk-accent-soft);
}
.chip--r {
  color: var(--pk-text);
}
.bases {
  padding: 12rpx 24rpx 14rpx;
  border-top: var(--pk-line-w) solid var(--pk-line);
}
.bases__t {
  display: block;
  font-size: 21rpx;
  color: var(--pk-text-3);
  margin-bottom: 8rpx;
}
.bases__row {
  display: flex;
  flex-wrap: wrap;
}
.bases__i {
  font-size: 22rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-accent);
  background: var(--pk-accent-soft);
  border-radius: 8rpx;
  margin: 0 10rpx 8rpx 0;
  padding: 8rpx 16rpx;
}
.bases__n {
  display: block;
  font-size: 21rpx;
  line-height: 1.8;
  color: var(--pk-text-2);
}
.pv {
  padding: 14rpx 24rpx 6rpx;
  border-top: var(--pk-line-w) solid var(--pk-line);
}
.pv__h {
  display: block;
  font-size: 21rpx;
  color: var(--pk-text-3);
  line-height: 1.7;
}
.pv__row {
  display: flex;
  flex-wrap: wrap;
  margin-top: 8rpx;
}
.pv__c {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 92rpx;
  margin: 6rpx 10rpx 6rpx 0;
  padding: 10rpx 6rpx;
  border-radius: 10rpx;
  background: var(--pk-bg-soft);
}
.pv__d {
  font-size: 30rpx;
  font-weight: 600;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
}
.pv__u {
  font-size: 19rpx;
  color: var(--pk-text-3);
  margin-top: 2rpx;
}
.pv__e {
  font-size: 21rpx;
  color: var(--pk-text-3);
}
.krow {
  display: flex;
  align-items: baseline;
  padding: 14rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.krow__i {
  width: 56rpx;
  font-size: 21rpx;
  color: var(--pk-text-3);
  flex-shrink: 0;
}
.krow__v {
  flex: 1;
  font-size: 25rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
  word-break: break-all;
}
.krow__p {
  font-size: 21rpx;
  color: var(--pk-text-3);
  margin-left: 14rpx;
  flex-shrink: 0;
}
.note {
  padding: 18rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.note:last-child {
  border-bottom: none;
}
.note__t {
  display: block;
  font-size: 25rpx;
  color: var(--pk-text);
  font-weight: 600;
  margin-bottom: 8rpx;
  font-family: Menlo, Consolas, monospace;
  word-break: break-all;
}
.note__d {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  line-height: 1.75;
}
</style>
