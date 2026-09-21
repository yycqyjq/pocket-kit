<template>
  <view>
    <PkCard padded>
      <PkField v-model="text" type="textarea" :area-height="200" label="一列数字" placeholder="换行、空格、逗号、分号都能分隔；支持 3x7 这种重复记法与 1,234,567 千分位">
        <template #labelRight>
          <text class="mini-act" @tap="text = ''">清空</text>
        </template>
      </PkField>
      <view class="quick-row">
        <text v-for="s in SAMPLES" :key="s.name" class="quick-i" @tap="text = s.text">{{ s.name }}</text>
      </view>
      <text class="tip">单次最多 {{ MAX_POINTS }} 个数据点；重复记法 AxN 的 N 不超过 {{ MAX_REPEAT }}。超出的部分会被丢掉并在下面提示。</text>
      <PkRow label="有效数据点" :value="String(values.length)" :copy="false" />
      <PkRow v-if="parsed.repeats" label="重复记法展开" :value="parsed.repeats + ' 个（展开后计入总数）'" :copy="false" />
      <PkRow v-if="parsed.notice" label="提示" :value="parsed.notice" color="var(--pk-warn)" :copy="false" stack />
      <PkRow v-if="skippedText" label="跳过的内容" :value="skippedText" color="var(--pk-danger)" :copy="false" stack />
    </PkCard>

    <PkCard v-if="!st.empty" title="描述统计" accent="var(--pk-accent)">
      <template #extra>
        <text class="mini-act" @tap="copyAll">复制全部</text>
      </template>
      <PkRow v-for="r in statRows" :key="r.k" :label="r.k" :value="r.v" :color="r.c || ''" :copy="true" />
      <text v-if="st.gmNote" class="tip">{{ st.gmNote }}</text>
      <view class="pct">
        <text class="pct__t">常用百分位（R-7 线性插值，与 Excel PERCENTILE.INC 同口径）</text>
        <view v-for="p in pctRows" :key="p.p" class="pct__row">
          <text class="pct__k">P{{ p.p }}</text>
          <text class="pct__v">{{ p.v }}</text>
        </view>
      </view>
      <PkField v-model="pInput" type="number" label="自定义百分位 P（0~100）" placeholder="例如 95" />
      <PkRow v-if="pResult" label="对应分位值" :value="pResult" color="var(--pk-accent)" />
      <PkRow v-else-if="pBad" label="提示" value="百分位要填 0 到 100 之间的数" color="var(--pk-danger)" :copy="false" />
    </PkCard>
    <PkCard v-else title="描述统计" accent="var(--pk-accent)">
      <PkEmpty title="还没有可用的数字" desc="粘一列数字进来，或点上面的样例。统计为数学结果，不构成医学 / 金融 / 工程建议。" />
    </PkCard>

    <PkCard v-if="!st.empty" title="五数概括与异常值" accent="#4A6FA5">
      <PkRow label="最小值 min" :value="fv(vn.min)" />
      <PkRow label="下四分位 Q1" :value="fv(vn.q1)" />
      <PkRow label="中位数 Q2" :value="fv(vn.median)" color="var(--pk-accent)" />
      <PkRow label="上四分位 Q3" :value="fv(vn.q3)" />
      <PkRow label="最大值 max" :value="fv(vn.max)" />
      <view class="box">
        <view class="box__track">
          <view class="box__whisk" :style="{ left: boxStyle.lo.left, width: boxStyle.lo.width }"></view>
          <view class="box__body" :style="{ left: boxStyle.body.left, width: boxStyle.body.width }"></view>
          <view class="box__whisk box__whisk--r" :style="{ left: boxStyle.hi.left, width: boxStyle.hi.width }"></view>
          <view class="box__med" :style="{ left: boxStyle.med }"></view>
        </view>
        <view class="box__axis">
          <text class="box__ax box__ax--l">{{ fv(vn.min) }}</text>
          <text class="box__ax box__ax--r">{{ fv(vn.max) }}</text>
        </view>
      </view>
      <PkRow label="IQR（Q3 − Q1）" :value="fv(st.iqr)" />
      <PkRow label="下围栏 Q1 − 1.5·IQR" :value="fv(st.lowerFence)" />
      <PkRow label="上围栏 Q3 + 1.5·IQR" :value="fv(st.upperFence)" />
      <PkRow label="极端下围栏 −3·IQR" :value="fv(st.lowerExtremeFence)" />
      <PkRow label="极端上围栏 +3·IQR" :value="fv(st.upperExtremeFence)" />
      <view v-if="st.outlierCount" class="out">
        <text class="out__h">异常值共 {{ st.outlierCount }} 个（Tukey 围栏之外），按偏离均值的远近排序：</text>
        <view v-for="(o, i) in visibleOutliers" :key="i" class="out__row">
          <text class="out__v">{{ fv(o.value) }}</text>
          <text class="out__s">{{ o.side === 'low' ? '低侧' : '高侧' }}</text>
          <text class="out__d" :class="{ 'out__d--x': o.extreme }">{{ o.extreme ? '极端（3·IQR 外）' : '温和' }}</text>
          <text class="out__x">越界 {{ fv(o.distance) }}</text>
        </view>
        <text v-if="st.outliers.length > OUT_LIMIT" class="tip">…共 {{ st.outliers.length }} 条，只显示前 {{ OUT_LIMIT }} 条。</text>
      </view>
      <text v-else class="tip">没有落在 1.5×IQR 围栏之外的点，这组数据里没有统计学意义上的离群值。</text>
    </PkCard>

    <PkCard v-if="!st.empty" title="分组频数表" accent="#6B5B95">
      <template #extra>
        <text class="mini-act" @tap="showAllFreq = !showAllFreq">{{ showAllFreq ? '只看前 15 组' : '展开全部' }}</text>
      </template>
      <view class="tb">
        <view class="tb__h">
          <text class="tb__c tb__c--1">取值</text>
          <text class="tb__c tb__c--2">次数</text>
          <text class="tb__c tb__c--3">频率</text>
          <text class="tb__c tb__c--4">累计</text>
        </view>
        <view v-for="(r, i) in freqRows" :key="i" class="tb__g">
          <view class="tb__r">
            <text class="tb__c tb__c--1">{{ fv(r.value) }}</text>
            <text class="tb__c tb__c--2">{{ r.count }}</text>
            <text class="tb__c tb__c--3">{{ fp(r.percent) }}</text>
            <text class="tb__c tb__c--4">{{ fp(r.cumPercent) }}</text>
          </view>
          <view class="tb__bar">
            <view class="tb__fill" :style="{ width: barW(r.count, freqMax) }"></view>
          </view>
        </view>
      </view>
      <text class="tip">
        离散取值共 {{ freqAll.rows.length }} 个，只显示前 {{ freqRows.length }} 组{{ freqAll.rows.length > freqRows.length ? '（点右上角可展开全部）' : '' }}；
        取值很碎时改看下面的直方图。
      </text>
    </PkCard>

    <PkCard v-if="!st.empty" title="直方图（等宽分组）" accent="#8A6D3B">
      <PkField v-model="binInput" type="number" :label="'分组数（留空 = 自动，Sturges 建议 ' + autoBins + ' 组）'" placeholder="留空自动" />
      <view class="quick-row">
        <text v-for="b in BIN_CHIPS" :key="b" class="quick-i" :class="{ 'quick-i--on': String(b) === binInput }" @tap="binInput = String(b)">{{ b }} 组</text>
        <text class="quick-i" :class="{ 'quick-i--on': binInput === '' }" @tap="binInput = ''">自动</text>
      </view>
      <scroll-view v-if="hist.bins.length" scroll-x class="hist">
        <view class="hist__inner">
          <view v-for="b in hist.bins" :key="b.index" class="col">
            <text class="col__c">{{ b.count }}</text>
            <view class="col__track">
              <view class="col__bar" :style="{ height: barH(b.count, hist.max) }"></view>
            </view>
            <text class="col__lb">{{ fv(b.lower) }}</text>
            <text class="col__lb col__lb--to">~ {{ fv(b.upper) }}</text>
          </view>
        </view>
      </scroll-view>
      <text v-else class="tip">至少要有 2 个不同的数据点才分得出组，现在只有 {{ values.length }} 个。</text>
      <PkRow v-if="hist.bins.length" label="组数" :value="hist.binCount + ' 组（' + hist.method + '）'" :copy="false" />
      <PkRow v-if="hist.bins.length && hist.binWidth" label="组距" :value="fv(hist.binWidth)" />
      <PkRow v-if="hist.bins.length" label="最多的一组" :value="topBin" :copy="false" stack />
      <text v-if="hist.bins.length" class="tip">柱子高度按最大频数 {{ hist.max }} 归一，共 {{ hist.binCount }} 组（组数会被夹在 1~40 之间）；最后一组含右端点，横向滑动可以看完所有的柱。</text>
    </PkCard>

    <PkCard title="加权平均" accent="#B5527A">
      <PkField v-model="pairText" type="textarea" :area-height="170" label="值 权重（每行一组，空格或逗号分隔）" placeholder="88, 3&#10;76, 2&#10;95, 5">
        <template #labelRight>
          <text class="mini-act" @tap="pairText = PAIR_SAMPLE">填样例</text>
          <text class="mini-act" @tap="pairText = ''">清空</text>
        </template>
      </PkField>
      <view class="quick-row">
        <text v-for="s in PAIR_SAMPLES" :key="s.name" class="quick-i" @tap="pairText = s.text">{{ s.name }}</text>
      </view>
      <PkRow v-if="pairError" label="无法计算" :value="pairError" color="var(--pk-danger)" :copy="false" stack />
      <template v-else-if="pairs.length">
        <view class="tb">
          <view class="tb__h">
            <text class="tb__c tb__c--1">值</text>
            <text class="tb__c tb__c--2">权重</text>
            <text class="tb__c tb__c--3">权重占比</text>
            <text class="tb__c tb__c--4">值×权重</text>
          </view>
          <view v-for="(p, i) in visiblePairs" :key="i" class="tb__r">
            <text class="tb__c tb__c--1">{{ fv(p.value) }}</text>
            <text class="tb__c tb__c--2">{{ fv(p.weight) }}</text>
            <text class="tb__c tb__c--3">{{ fp(weightSum ? (p.weight / weightSum) * 100 : 0) }}</text>
            <text class="tb__c tb__c--4">{{ fv(p.value * p.weight) }}</text>
          </view>
        </view>
        <text v-if="pairs.length > PAIR_LIMIT" class="tip">…共 {{ pairs.length }} 组，只显示前 {{ PAIR_LIMIT }} 组。</text>
        <PkRow label="加权平均" :value="fv(wm.value)" color="var(--pk-accent)" big />
        <PkRow label="权重之和" :value="fv(weightSum)" />
        <PkRow label="组数" :value="String(wm.count)" :copy="false" />
        <PkRow label="简单平均（对照）" :value="fv(simpleOfPairs)" />
        <PkRow label="加权方差" :value="fv(wVar)" />
        <PkRow label="加权方差（无偏口径）" :value="fv(wVarU)" />
        <text v-if="pairData.badWeight" class="tip warn-t">出现了负权重，加权平均的常规解释（占比）在这里不成立。</text>
        <text v-if="pairData.skipped.length" class="tip">有 {{ pairData.skipped.length }} 行没解析成功：{{ pairData.skipped.slice(0, 5).join(' / ') }}</text>
        <text class="tip">只写一个数时按权重 1 处理，所以这个框也能当单列数据用。</text>
      </template>
      <PkEmpty v-else title="填两组以上的「值 权重」" desc="成绩加权、混合浓度、平均成本都能用这里算" />
    </PkCard>

    <PkCard title="线性回归（最小二乘）" accent="#3E7A4E">
      <PkField v-model="xyText" type="textarea" :area-height="170" label="x y（每行一组）" placeholder="1, 2.1&#10;2, 4.0&#10;3, 5.8">
        <template #labelRight>
          <text class="mini-act" @tap="xyText = XY_SAMPLE">填样例</text>
          <text class="mini-act" @tap="xyText = ''">清空</text>
        </template>
      </PkField>
      <view class="quick-row">
        <text v-for="s in XY_SAMPLES" :key="s.name" class="quick-i" @tap="xyText = s.text">{{ s.name }}</text>
      </view>
      <PkRow v-if="fitError" label="无法拟合" :value="fitError" color="var(--pk-danger)" :copy="false" stack />
      <template v-else-if="fit">
        <view class="eq">
          <text class="eq__t">{{ fit.equation }}</text>
          <text class="eq__s">y = 截距 + 斜率 · x</text>
        </view>
        <PkRow label="斜率 b" :value="fv(fit.slope)" color="var(--pk-accent)" />
        <PkRow label="截距 a" :value="fv(fit.intercept)" />
        <PkRow label="R²" :value="fv(fit.r2)" color="var(--pk-accent)" />
        <PkRow label="Pearson r" :value="pearsonText" :copy="false" />
        <PkRow label="样本对数 n" :value="String(fit.n)" :copy="false" />
        <PkRow label="x 均值 / y 均值" :value="fv(fit.meanX) + ' / ' + fv(fit.meanY)" :copy="false" stack />
        <PkRow label="斜率标准误" :value="fv(fit.seSlope)" />
        <PkRow label="截距标准误" :value="fv(fit.seIntercept)" />
        <PkRow label="斜率 t 值" :value="fv(fit.tSlope)" />
        <PkRow label="残差标准误" :value="fv(fit.residualStdError)" />
        <PkRow label="离差平方和" :value="'SST ' + fv(fit.sst) + ' = SSR ' + fv(fit.ssr) + ' + SSE ' + fv(fit.sse)" :copy="false" stack />
        <PkRow label="残差最大处 x" :value="String(fit.worst)" />
        <PkField v-model="predX" type="digit" label="预测：给定 x" :placeholder="'留空用 x 均值 ' + fv(fit.meanX)" />
        <PkRow v-if="predY !== ''" label="预测 y" :value="predY" color="var(--pk-accent)" big />
        <text v-if="fit.note" class="tip warn-t">{{ fit.note }}</text>
        <view class="tb">
          <view class="tb__h">
            <text class="tb__c tb__c--1">x</text>
            <text class="tb__c tb__c--2">y</text>
            <text class="tb__c tb__c--3">拟合值</text>
            <text class="tb__c tb__c--4">残差</text>
          </view>
          <view v-for="(r, i) in visibleResiduals" :key="i" class="tb__r">
            <text class="tb__c tb__c--1">{{ fv(r.x) }}</text>
            <text class="tb__c tb__c--2">{{ fv(r.y) }}</text>
            <text class="tb__c tb__c--3">{{ fv(r.fit) }}</text>
            <text class="tb__c tb__c--4" :class="{ 'tb__neg': r.residual < 0 }">{{ (r.residual < 0 ? '' : '+') + fv(r.residual) }}</text>
          </view>
        </view>
        <text v-if="fit.residuals.length > RES_LIMIT" class="tip">…共 {{ fit.residuals.length }} 组，只显示前 {{ RES_LIMIT }} 组。</text>
      </template>
      <PkEmpty v-else title="填两列 x / y" desc="至少 2 组才能拟合；x 不能全相同" />
      <text v-if="xyData.skipped.length" class="tip">有 {{ xyData.skipped.length }} 行没解析成功：{{ xyData.skipped.slice(0, 5).join(' / ') }}</text>
    </PkCard>

    <PkCard title="口径说明" accent="#2F7A8C">
      <view v-for="n in NOTES" :key="n.t" class="note">
        <text class="note__t">{{ n.t }}</text>
        <text class="note__d">{{ n.d }}</text>
      </view>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  MAX_POINTS,
  MAX_REPEAT,
  fmtNum,
  parseNumbers,
  quantileSorted,
  cleanValues,
  modeOf,
  describe,
  fiveNumber,
  freqTable,
  suggestBins,
  histogram,
  parsePairs,
  weightedMean,
  weightedVariance,
  parseXY,
  linearFit,
  pearson,
  summaryText,
} from '@/utils/stats'
import { copyText, toast } from '@/utils/clipboard'

const OUT_LIMIT = 24
const PAIR_LIMIT = 20
const RES_LIMIT = 15
const FREQ_LIMIT = 15
const BIN_CHIPS = [4, 6, 8, 10, 12, 16, 20, 30]

const SAMPLES = [
  { name: '成绩（含异常值）', text: '88, 92, 76, 90, 85, 79, 88, 91, 23, 87' },
  { name: '重复记法', text: '3x7 4x12 5x9 6x2' },
  { name: '温度（有负数）', text: '-3.5 -1.2 0.4 2.8 3.1 3.1 4.6 5.2' },
  { name: '千分位', text: '1,234,567\n2,345,000\n3,456,789' },
  { name: '身高 cm', text: '158 162 165 165 168 170 171 174 178 180 165 169' },
]

const PAIR_SAMPLES = [
  { name: '科目加权', text: '88, 3\n76, 2\n95, 5\n70, 1' },
  { name: '混合单价', text: '12 40\n18 60\n25 100' },
  { name: '调查权重', text: '4, 0.2\n3, 0.35\n5, 0.45' },
]

const XY_SAMPLES = [
  { name: '投放与销量', text: '1, 2.2\n2, 3.9\n3, 6.1\n4, 7.8\n5, 10.2\n6, 11.6' },
  { name: '完全线性', text: '1, 3\n2, 5\n3, 7\n4, 9' },
  { name: '负相关', text: '10, 1\n20, 4\n30, 6\n40, 9\n50, 12' },
]

const PAIR_SAMPLE = '88, 3\n76, 2\n95, 5\n70, 1'
const XY_SAMPLE = '1, 2.2\n2, 3.9\n3, 6.1\n4, 7.8\n5, 10.2\n6, 11.6'

const NOTES = [
  { t: '分位数：R-7 线性插值', d: '与 Excel 的 PERCENTILE.INC、numpy 默认口径一致。样本量很小时分位数会明显受排序两端影响。' },
  { t: '方差给了两套口径', d: '总体方差除以 n，样本方差除以 n − 1（贝塞尔校正）。手头的数就是全部对象时用总体，用它推断更大的总体时用样本。' },
  { t: '异常值：Tukey 箱线图围栏', d: 'Q1 − 1.5·IQR 与 Q3 + 1.5·IQR 之外的点算温和异常，超出 3·IQR 算极端。这是筛查信号，不是自动删数据的理由。' },
  { t: '几何平均与调和平均', d: '几何平均适合平均比率（多年涨幅、缩放比例），调和平均适合平均速率（往返速度）。数据里有非正数时两者无定义。' },
  { t: '回归：普通最小二乘', d: '最小化残差平方和，R² 就是 Pearson 相关系数的平方。相关不等于因果，外推到 x 范围之外要格外小心。' },
  { t: '截断策略', d: '异常值列表、频数表、权重表、残差表都只渲染前若干条并标出总条数，数据量大时也不会卡住。' },
]

const text = ref('88, 92, 76, 90, 85, 79, 88, 91, 23, 87')
const pInput = ref('95')
const binInput = ref('')
const showAllFreq = ref(false)
const pairText = ref(PAIR_SAMPLE)
const xyText = ref(XY_SAMPLE)
const predX = ref('')

/** 数字解析：视图层不抛错，非法 token 进 skipped */
const parsed = computed(() => parseNumbers(text.value, { limit: MAX_POINTS }))
const values = computed(() => parsed.value.values)
const skippedText = computed(() => {
  const s = parsed.value.skipped
  if (!s.length) return ''
  return s.slice(0, 12).join(' / ') + (s.length > 12 ? '…（共 ' + s.length + ' 个）' : '')
})

const st = computed(() => describe(values.value))
const vn = computed(() => fiveNumber(values.value))
const fv = (n) => fmtNum(n, 4)
const fp = (n) => (isFinite(n) ? fmtNum(n, 2) + '%' : '—')

const modeInfo = computed(() => (st.value.empty ? null : modeOf(values.value)))

const statRows = computed(() => {
  const s = st.value
  if (s.empty) return []
  const out = [
    { k: '样本量 n', v: String(s.n), c: '' },
    { k: '总和', v: fmtNum(s.sum, 6), c: '' },
    { k: '均值', v: fmtNum(s.mean, 6), c: 'var(--pk-accent)' },
    { k: '中位数', v: fmtNum(s.median, 6), c: 'var(--pk-accent)' },
    { k: '众数', v: modeText(), c: '' },
    { k: '中程数 (min+max)/2', v: fmtNum(s.midrange, 6), c: '' },
    { k: '截尾均值 10%', v: fmtNum(s.trimmedMean10, 6), c: '' },
    { k: '截尾均值 25%', v: fmtNum(s.trimmedMean25, 6), c: '' },
    { k: '最小值', v: fmtNum(s.min, 6), c: '' },
    { k: '最大值', v: fmtNum(s.max, 6), c: '' },
    { k: '极差', v: fmtNum(s.range, 6), c: '' },
    { k: '方差（总体）', v: fmtNum(s.variancePop, 6), c: '' },
    { k: '方差（样本）', v: fmtNum(s.varianceSample, 6), c: '' },
    { k: '标准差（总体）', v: fmtNum(s.stdevPop, 6), c: '' },
    { k: '标准差（样本）', v: fmtNum(s.stdevSample, 6), c: 'var(--pk-accent)' },
    { k: '变异系数 CV', v: fmtNum(s.cv, 6), c: '' },
    { k: '标准误 SEM', v: fmtNum(s.sem, 6), c: '' },
    { k: '平均绝对偏差（对中位数）', v: fmtNum(s.mad, 6), c: '' },
    { k: 'Q1', v: fmtNum(s.q1, 6), c: '' },
    { k: 'Q2', v: fmtNum(s.q2, 6), c: '' },
    { k: 'Q3', v: fmtNum(s.q3, 6), c: '' },
    { k: 'IQR', v: fmtNum(s.iqr, 6), c: '' },
    { k: '偏度（总体三阶矩）', v: fmtNum(s.skewness, 6), c: skewNote(s.skewness) },
  ]
  if (isFinite(s.geometricMean)) {
    out.push({ k: '几何平均', v: fmtNum(s.geometricMean, 6), c: '' })
    out.push({ k: '调和平均', v: fmtNum(s.harmonicMean, 6), c: '' })
  }
  return out
})

function modeText() {
  const m = modeInfo.value
  if (!m) return '—'
  if (m.uniform) return '无（每个值都只出现一次）'
  return m.values.map((v) => fmtNum(v, 6)).join('、') + '（各 ' + m.count + ' 次）' + (m.multi ? '，共 ' + m.values.length + ' 个并列' : '')
}

function skewNote(k) {
  if (!isFinite(k)) return ''
  return k > 0.5 || k < -0.5 ? 'var(--pk-warn)' : ''
}

const pctRows = computed(() => {
  const s = st.value
  if (s.empty) return []
  return [1, 5, 10, 25, 50, 75, 90, 95, 99].map((p) => ({ p, v: fmtNum(quantileSorted(s.sorted, p / 100), 6) }))
})

const pResult = computed(() => {
  const s = st.value
  if (s.empty) return ''
  const raw = String(pInput.value || '').trim()
  if (!raw) return ''
  const p = Number(raw)
  if (!isFinite(p) || p < 0 || p > 100) return ''
  return fmtNum(quantileSorted(s.sorted, p / 100), 6)
})
const pBad = computed(() => {
  const raw = String(pInput.value || '').trim()
  if (!raw || st.value.empty) return false
  const p = Number(raw)
  return !isFinite(p) || p < 0 || p > 100
})

/** 箱线图的归一化位置：把 min~max 映射到 0%~100% */
const boxStyle = computed(() => {
  const s = st.value
  const v = vn.value
  if (s.empty) return emptyBox()
  const lo = v.min
  const hi = v.max
  if (!(hi > lo)) return emptyBox()
  const pos = (x) => (((x - lo) / (hi - lo)) * 100).toFixed(2) + '%'
  const w = (a, b) => (((b - a) / (hi - lo)) * 100).toFixed(2) + '%'
  return {
    lo: { left: '0%', width: w(lo, v.q1) },
    body: { left: pos(v.q1), width: w(v.q1, v.q3) },
    hi: { left: pos(v.q3), width: w(v.q3, hi) },
    med: pos(v.median),
  }
})
function emptyBox() {
  return { lo: { left: '0%', width: '0%' }, body: { left: '0%', width: '0%' }, hi: { left: '0%', width: '0%' }, med: '0%' }
}

const visibleOutliers = computed(() => (st.value.outliers || []).slice(0, OUT_LIMIT))

const freqAll = computed(() => freqTable(values.value, { top: 0 }))
const freqRows = computed(() => {
  const rows = freqAll.value.rows
  return showAllFreq.value ? rows : rows.slice(0, FREQ_LIMIT)
})
const freqMax = computed(() => freqAll.value.max || 1)

const autoBins = computed(() => suggestBins(values.value))
const hist = computed(() => histogram(values.value, binCountArg.value))
const binCountArg = computed(() => {
  const raw = String(binInput.value || '').trim()
  if (!raw) return undefined
  const k = Number(raw)
  return isFinite(k) && k > 0 ? k : undefined
})
const topBin = computed(() => {
  const bins = hist.value.bins
  if (!bins.length) return '—'
  let best = bins[0]
  for (const b of bins) if (b.count > best.count) best = b
  return best.label + ' 共 ' + best.count + ' 个（' + fp(best.percent) + '）'
})

function barW(count, max) {
  if (!max) return '0%'
  return Math.max(1, Math.round((count / max) * 100)) + '%'
}
function barH(count, max) {
  if (!max) return '4rpx'
  const h = Math.round((count / max) * 180)
  return Math.max(count > 0 ? 8 : 3, h) + 'rpx'
}

/** 加权平均：weights 和为 0 时 util 会抛错 */
const pairData = computed(() => parsePairs(pairText.value))
const pairs = computed(() => pairData.value.pairs)
const wmState = computed(() => {
  if (!pairs.value.length) return { r: null, error: '' }
  try {
    return { r: weightedMean(pairs.value), error: '' }
  } catch (e) {
    return { r: null, error: e.message }
  }
})
const wm = computed(() => wmState.value.r || { value: NaN, weightSum: NaN, count: 0 })
const pairError = computed(() => wmState.value.error)
const weightSum = computed(() => pairs.value.reduce((a, p) => a + Number(p.weight), 0))
const simpleOfPairs = computed(() => (pairs.value.length ? cleanValues(pairs.value.map((p) => p.value)).reduce((a, b) => a + b, 0) / pairs.value.length : NaN))
const wVar = computed(() => tryVar(false))
const wVarU = computed(() => tryVar(true))
function tryVar(unbiased) {
  if (!pairs.value.length) return NaN
  try {
    return weightedVariance(pairs.value, unbiased)
  } catch (e) {
    return NaN
  }
}
const visiblePairs = computed(() => pairs.value.slice(0, PAIR_LIMIT))

/** 线性回归 */
const xyData = computed(() => parseXY(xyText.value))
const fitState = computed(() => {
  const pts = xyData.value.points
  if (pts.length < 2) return { fit: null, error: '' }
  const xs = cleanValues(pts.map((p) => p.x))
  const ys = cleanValues(pts.map((p) => p.y))
  try {
    return { fit: linearFit(xs, ys), error: '', pr: pearson(xs, ys) }
  } catch (e) {
    return { fit: null, error: e.message }
  }
})
const fit = computed(() => fitState.value.fit)
const fitError = computed(() => fitState.value.error)
const pearsonText = computed(() => {
  const pr = fitState.value.pr
  if (!pr) return '—'
  return fmtNum(pr.r, 6) + '（R² ' + fmtNum(pr.r2, 6) + '，n = ' + pr.n + '）'
})
const predY = computed(() => {
  const f = fit.value
  if (!f) return ''
  const raw = String(predX.value || '').trim()
  const x = raw === '' ? f.meanX : Number(raw)
  if (!isFinite(x)) return ''
  return fmtNum(f.predict(x), 6)
})
const visibleResiduals = computed(() => (fit.value ? fit.value.residuals.slice(0, RES_LIMIT) : []))

function copyAll() {
  if (st.value.empty) {
    toast('还没有可复制的统计结果')
    return
  }
  copyText(summaryText(st.value), '统计摘要已复制')
}
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
.quick-i--on {
  color: var(--pk-on-accent);
  background: var(--pk-accent);
}
.tip {
  display: block;
  font-size: 21rpx;
  line-height: 1.8;
  color: var(--pk-text-3);
  padding: 10rpx 24rpx 12rpx;
}
.warn-t {
  color: var(--pk-warn);
}
.pct {
  padding: 10rpx 24rpx 4rpx;
  border-top: var(--pk-line-w) solid var(--pk-line);
}
.pct__t {
  display: block;
  font-size: 21rpx;
  color: var(--pk-text-3);
  line-height: 1.7;
  margin-bottom: 8rpx;
}
.pct__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 8rpx 0;
}
.pct__k {
  font-size: 22rpx;
  color: var(--pk-text-3);
  font-family: Menlo, Consolas, monospace;
}
.pct__v {
  font-size: 24rpx;
  color: var(--pk-text);
  font-family: Menlo, Consolas, monospace;
}
.box {
  padding: 20rpx 24rpx 8rpx;
}
.box__track {
  position: relative;
  height: 40rpx;
}
.box__whisk {
  position: absolute;
  top: 18rpx;
  height: 4rpx;
  background: var(--pk-line-strong);
}
.box__body {
  position: absolute;
  top: 6rpx;
  height: 28rpx;
  border-radius: 6rpx;
  background: var(--pk-accent-soft);
  border: var(--pk-line-w) solid var(--pk-accent);
}
.box__med {
  position: absolute;
  top: 2rpx;
  width: var(--pk-line-w);
  height: 36rpx;
  background: var(--pk-accent);
}
.box__axis {
  display: flex;
  justify-content: space-between;
  margin-top: 10rpx;
}
.box__ax {
  font-size: 20rpx;
  color: var(--pk-text-3);
  font-family: Menlo, Consolas, monospace;
}
.out {
  padding: 6rpx 24rpx 4rpx;
  border-top: var(--pk-line-w) solid var(--pk-line);
}
.out__h {
  display: block;
  font-size: 22rpx;
  line-height: 1.7;
  color: var(--pk-warn);
  padding: 12rpx 0 6rpx;
}
.out__row {
  display: flex;
  align-items: baseline;
  padding: 8rpx 0;
  border-top: var(--pk-line-w) solid var(--pk-line);
}
.out__v {
  min-width: 130rpx;
  font-size: 25rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text);
}
.out__s {
  font-size: 21rpx;
  color: var(--pk-text-2);
  margin-right: 16rpx;
}
.out__d {
  flex: 1;
  font-size: 21rpx;
  color: var(--pk-text-3);
}
.out__d--x {
  color: var(--pk-danger);
}
.out__x {
  font-size: 21rpx;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-text-3);
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
.tb__g {
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.tb__g .tb__r {
  border-bottom: none;
  padding-bottom: 6rpx;
}
.tb__c {
  font-size: 23rpx;
  color: var(--pk-text-2);
  font-family: Menlo, Consolas, monospace;
}
.tb__h .tb__c {
  font-size: 21rpx;
  color: var(--pk-text-3);
}
.tb__c--1 {
  width: 150rpx;
  flex-shrink: 0;
  word-break: break-all;
}
.tb__c--2,
.tb__c--3,
.tb__c--4 {
  flex: 1;
  text-align: right;
}
.tb__neg {
  color: var(--pk-danger);
}
.tb__bar {
  height: 8rpx;
  margin: 0 0 12rpx;
  background: var(--pk-accent-soft);
  border-radius: 4rpx;
  overflow: hidden;
}
.tb__fill {
  height: 8rpx;
  background: var(--pk-accent);
  border-radius: 4rpx;
}
.hist {
  width: 100%;
  margin-top: 10rpx;
}
.hist__inner {
  display: inline-flex;
  align-items: flex-end;
  padding: 0 24rpx 10rpx;
}
.col {
  width: 118rpx;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-right: 8rpx;
}
.col__c {
  font-size: 20rpx;
  color: var(--pk-text-3);
  font-family: Menlo, Consolas, monospace;
}
.col__track {
  height: 190rpx;
  width: 74rpx;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  background: var(--pk-bg-soft);
  border-radius: 6rpx;
  overflow: hidden;
}
.col__bar {
  width: 74rpx;
  background: var(--pk-accent);
  border-radius: 6rpx 6rpx 0 0;
}
.col__lb {
  font-size: 18rpx;
  color: var(--pk-text-3);
  font-family: Menlo, Consolas, monospace;
  margin-top: 8rpx;
  text-align: center;
  word-break: break-all;
}
.col__lb--to {
  margin-top: 0;
}
.eq {
  padding: 20rpx 24rpx 12rpx;
}
.eq__t {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  font-family: Menlo, Consolas, monospace;
  color: var(--pk-accent);
  word-break: break-all;
  line-height: 1.5;
}
.eq__s {
  display: block;
  font-size: 20rpx;
  color: var(--pk-text-3);
  margin-top: 6rpx;
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
}
.note__d {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  line-height: 1.75;
}
</style>
