<template>
  <view>
    <PkCard title="挑一类尺码" :accent="TINT">
      <PkSeg v-model="kind" :items="KIND_ITEMS" />
      <PkRow label="这一类在看什么" :value="kindNote" :copy="false" stack />
      <text class="prose">{{ DATA_NOTE }}</text>
    </PkCard>

    <!-- ============ 鞋 ============ -->
    <template v-if="kind === 'shoe'">
      <PkCard title="鞋码：给任意一个号码" :accent="TINT" padded>
        <PkSeg v-model="shoeSystem" :items="SHOE_SYSTEMS" />
        <PkField v-model="shoeValue" type="digit" :label="'号码（' + shoeSystemName + '）'" :placeholder="shoeSystemHint">
          <template #labelRight>
            <text class="mini-act" @tap="shoeValue = ''">清空</text>
          </template>
        </PkField>
        <view class="chip-row">
          <text v-for="s in SHOE_SAMPLES" :key="s.value + s.system" class="chip" @tap="useSample(s)">{{ s.text }}</text>
        </view>
        <text class="cap">适用人群（决定美/英码用哪套刻度）</text>
        <PkSeg v-model="shoeAudience" :items="audienceItems" />
        <text class="cap">放余量：脚长 → 鞋楦内长，差 1cm 就是一个码</text>
        <view class="chip-row">
          <text
            v-for="a in SHOE_ALLOWANCES"
            :key="a.key"
            class="chip"
            :class="{ 'chip--on': shoeAllowance === a.key }"
            @tap="shoeAllowance = a.key"
          >{{ a.name }} +{{ a.value }}</text>
        </view>
        <PkRow label="放余量说明" :value="allowanceNote" :copy="false" stack />
        <PkRow v-if="shoeError" label="提示" :value="shoeError" color="var(--pk-danger)" :copy="false" stack />
      </PkCard>

      <PkCard v-if="shoe" title="一次列出所有体系" accent="var(--pk-accent)">
        <template #extra>
          <text class="mini-act" @tap="copyText(shoeSummaryText(shoe))">复制小结</text>
        </template>
        <view class="hero">
          <text class="hero__t">{{ shoe.label }}</text>
          <text class="hero__s">脚长 {{ shoe.mm }} mm</text>
        </view>
        <text class="sum">{{ shoeLine }}</text>
        <PkRow label="CN 新码（毫米，国标口径）" :value="shoe.cn + ' mm'" />
        <PkRow label="CN 旧码（厘米 × 2 − 10）" :value="shoe.cnOld + ' 码'" />
        <PkRow label="欧码 EU" :value="shoe.eu + '（公式 ' + shoe.euExact + '）'" />
        <PkRow :label="shoe.audienceName + ' US'" :value="shoe.usDisplay + '（公式 ' + shoe.usExact + '）'" />
        <PkRow label="英码 UK" :value="shoe.ukDisplay" />
        <PkRow label="日码 JP（脚长厘米数）" :value="shoe.jpText" />
        <PkRow label="男/女/童 US 同脚长对照" :value="'男 ' + shoe.usMen + ' · 女 ' + shoe.usWomen + ' · 童 ' + shoe.usKids" :copy="false" />
        <PkRow label="鞋楦内长建议" :value="shoe.lastMm + ' mm（' + shoe.lastCm + ' cm / ' + shoe.lastIn + ' 英寸）'" />
        <PkRow label="反推脚长" :value="shoe.inputMm + ' mm'" />
        <PkRow
          label="回代偏差"
          :value="shoe.codeDrift === 0 ? '0（号码正好落在半步网格上）' : shoe.backCode + '（偏 ' + shoe.codeDrift + '，市售那半码与公式值不重合）'"
          :copy="false"
          stack
        />
        <PkRow label="算法" :value="shoe.note" :copy="false" stack />
        <view v-for="(n, i) in shoe.notes" :key="i" class="li">
          <text class="li__dot">·</text>
          <text class="li__t">{{ n }}</text>
        </view>
        <view v-for="(w, i) in shoeWarn" :key="'w' + i" class="li li--warn">
          <text class="li__dot">!</text>
          <text class="li__t">{{ w.text }}</text>
        </view>
      </PkCard>

      <PkEmpty
        v-if="!shoe && !shoeError"
        title="还没给出号码"
        desc="按任意体系填一个号码（脚长毫米最准），这里会一次列出所有体系的对照、鞋楦内长与回代偏差"
      />

      <PkCard title="品牌偏码（经验值，不是官方表）" :accent="TINT" padded>
        <PkField v-model="brand" label="输入品牌名" placeholder="nike / 匡威 / vans">
          <template #labelRight>
            <text class="mini-act" @tap="brand = ''">看全部</text>
          </template>
        </PkField>
        <template v-if="fit.matched">
          <PkRow label="品牌" :value="fit.brand" :copy="false" />
          <PkRow label="普遍反馈" :value="fit.fits" :copy="false" stack />
          <PkRow label="相对公式值" :value="fitDeltaText" :copy="false" stack />
          <PkRow label="怎么买" :value="fit.advice" :copy="false" stack />
          <PkRow label="和公式合起来用" :value="fit.formulaNote" color="var(--pk-accent)" :copy="false" stack />
          <PkRow label="出处" :value="fit.source" :copy="false" stack />
        </template>
        <template v-else>
          <PkRow label="提示" :value="fit.note" :copy="false" stack />
          <view v-for="(f, i) in fit.list" :key="i" class="li">
            <text class="li__dot">·</text>
            <text class="li__t">{{ f.brand }}：{{ f.fits }}｜{{ f.advice }}</text>
          </view>
        </template>
      </PkCard>

      <PkCard title="脚长 → 各体系对照表" accent="var(--pk-accent)">
        <view class="tbl">
          <view class="tbl__r tbl__r--h">
            <text v-for="c in shoeTableData.columns" :key="c" class="tbl__c">{{ c }}</text>
          </view>
          <view v-for="r in shoeTableData.rows" :key="r.mm" class="tbl__r">
            <text class="tbl__c">{{ r.mm }}</text>
            <text class="tbl__c">{{ r.cnOld }}</text>
            <text class="tbl__c">{{ r.eu }}</text>
            <text class="tbl__c">{{ r.us }}</text>
            <text class="tbl__c">{{ r.uk }}</text>
            <text class="tbl__c">{{ r.jp }}</text>
          </view>
        </view>
        <text class="prose">表按人群「{{ shoeAudienceName }}」与放余量 {{ shoeAllowanceValue }}cm 生成，步长 5mm；脚长以傍晚实测、两只脚取较大值为准。</text>
      </PkCard>
    </template>

    <!-- ============ 服装 ============ -->
    <template v-if="kind === 'clothing'">
      <PkCard title="净体尺寸 → 号型与字母码" :accent="TINT" padded>
        <PkSeg v-model="sex" :items="CLOTHING_SEXES" />
        <view class="grid">
          <view class="cell"><PkField v-model="height" type="digit" label="身高 cm" placeholder="176" /></view>
          <view class="cell"><PkField v-model="chest" type="digit" label="胸围 cm" placeholder="97" /></view>
          <view class="cell"><PkField v-model="waist" type="digit" label="腰围 cm" placeholder="82" /></view>
          <view class="cell"><PkField v-model="hip" type="digit" label="臀围 cm" placeholder="98" /></view>
        </view>
        <text class="cap">号 = 身高，型 = 上装胸围 / 下装腰围；围度是净体，不含放松量</text>
        <PkRow v-if="clothError" label="提示" :value="clothError" color="var(--pk-danger)" :copy="false" stack />
      </PkCard>

      <PkCard v-if="cloth" title="推荐档位" accent="var(--pk-accent)">
        <template #extra>
          <text class="mini-act" @tap="copyText(clothSummary)">复制小结</text>
        </template>
        <view class="hero">
          <text class="hero__t">{{ cloth.sex }}装 {{ cloth.label }}</text>
          <text class="hero__s">号型 {{ cloth.seq }}</text>
        </view>
        <text class="sum">{{ clothLine }}</text>
        <PkRow label="字母码" :value="cloth.label + '（第 ' + (cloth.order + 1) + ' 档 / 共 9 档）'" :copy="false" />
        <PkRow label="国际码" :value="'欧码 ' + cloth.eu + ' · 美码 ' + cloth.us" :copy="false" />
        <PkRow label="适穿区间" :value="cloth.rangeText" :copy="false" stack />
        <PkRow v-if="cloth.alternatives.length" label="相邻可考虑" :value="cloth.alternatives.join(' / ') + '（贴边档位，按版型偏好挑）'" :copy="false" stack />
        <PkRow v-if="cloth.bodyType" label="体型后缀" :value="cloth.bodyType.name + '：胸腰差 ' + cloth.bodyType.diff + 'cm（' + cloth.bodyType.range + '）'" :copy="false" stack />
        <PkRow v-if="cloth.bodyType" label="体型依据" :value="cloth.bodyType.basis" :copy="false" stack />
        <view v-for="(a, i) in cloth.advice" :key="i" class="li li--warn">
          <text class="li__dot">!</text>
          <text class="li__t">{{ a }}</text>
        </view>
        <view v-for="(w, i) in clothWarn" :key="'cw' + i" class="li li--warn">
          <text class="li__dot">!</text>
          <text class="li__t">{{ w.text }}</text>
        </view>
        <text class="prose">{{ cloth.note }}</text>
      </PkCard>

      <PkCard title="反着查：已知标码问适穿区间" :accent="TINT" padded>
        <PkField v-model="labelInput" label="衣服上写的码" placeholder="L / 175/96A / 48 / 38">
          <template #labelRight>
            <text v-for="q in LABEL_SAMPLES" :key="q" class="mini-act" @tap="labelInput = q">{{ q }}</text>
          </template>
        </PkField>
        <template v-if="labelRow">
          <PkRow label="号型" :value="labelRow.row.cn + '（' + labelRow.sex + '装）'" :copy="false" />
          <PkRow label="字母码" :value="labelRow.row.label + ' · 欧码 ' + labelRow.row.eu + ' · 美码 ' + labelRow.row.us" :copy="false" />
          <PkRow label="适穿区间" :value="labelRow.rangeText" :copy="false" stack />
          <PkRow label="说明" :value="labelRow.note" :copy="false" stack />
        </template>
        <PkRow v-if="labelError" label="提示" :value="labelError" color="var(--pk-danger)" :copy="false" stack />
      </PkCard>

      <PkCard title="腰围 → 牛仔裤码 / 市尺" accent="var(--pk-accent)" padded>
        <PkField v-model="waist" type="digit" label="腰围 cm（与上面共用）" placeholder="80" />
        <template v-if="jeans">
          <PkRow label="英寸" :value="jeans.inch + ' in → 牛仔码 ' + jeans.size" :copy="false" />
          <PkRow label="市尺" :value="jeans.chiText + ' → 口算 ' + jeans.folk + ' 码'" :copy="false" />
          <PkRow label="算法" :value="jeans.note" :copy="false" stack />
          <PkRow label="注意" :value="jeans.advice" :copy="false" stack />
        </template>
        <PkRow v-if="jeansError" label="提示" :value="jeansError" color="var(--pk-danger)" :copy="false" stack />
      </PkCard>

      <PkCard title="号型表与胸腰差分档" accent="var(--pk-accent)">
        <view class="tbl">
          <view class="tbl__r tbl__r--h">
            <text class="tbl__c">字母</text>
            <text class="tbl__c">号型</text>
            <text class="tbl__c">身高</text>
            <text class="tbl__c">胸围</text>
            <text class="tbl__c">腰围</text>
            <text class="tbl__c">欧/美</text>
          </view>
          <view v-for="r in clothRows" :key="r.cn" class="tbl__r">
            <text class="tbl__c">{{ r.label }}</text>
            <text class="tbl__c">{{ r.cn }}</text>
            <text class="tbl__c">{{ r.height[0] }}~{{ r.height[1] }}</text>
            <text class="tbl__c">{{ r.chest[0] }}~{{ r.chest[1] }}</text>
            <text class="tbl__c">{{ r.waist[0] }}~{{ r.waist[1] }}</text>
            <text class="tbl__c">{{ r.eu }}/{{ r.us }}</text>
          </view>
        </view>
        <view v-for="t in BODY_TYPES" :key="t.key" class="li">
          <text class="li__dot">·</text>
          <text class="li__t">{{ t.name }}：胸腰差 {{ t.range }}cm｜{{ t.note }}</text>
        </view>
        <view v-for="(l, i) in WAIST_LINES" :key="i" class="li">
          <text class="li__dot">·</text>
          <text class="li__t">{{ l.text }}</text>
        </view>
      </PkCard>
    </template>

    <!-- ============ 文胸 ============ -->
    <template v-if="kind === 'bra'">
      <PkCard title="下胸围 + 上胸围（cm）" :accent="TINT" padded>
        <view class="grid">
          <view class="cell"><PkField v-model="under" type="digit" label="下胸围" placeholder="75" /></view>
          <view class="cell"><PkField v-model="over" type="digit" label="上胸围" placeholder="87.5" /></view>
        </view>
        <view class="chip-row">
          <text v-for="s in BRA_SAMPLES" :key="s.under" class="chip" @tap="useBraSample(s)">{{ s.text }}</text>
        </view>
        <text class="cap">下胸围贴着皮肤量、呼气末读数；上胸围放松直立与身体前倾 45° 各量一次取平均</text>
        <PkRow v-if="braError" label="提示" :value="braError" color="var(--pk-danger)" :copy="false" stack />
      </PkCard>

      <PkCard v-if="bra" title="四套体系同时给" accent="var(--pk-accent)">
        <template #extra>
          <text class="mini-act" @tap="copyText(braSummary)">复制小结</text>
        </template>
        <view class="hero">
          <text class="hero__t">{{ bra.cn }}</text>
          <text class="hero__s">上下差 {{ bra.diff }} cm</text>
        </view>
        <text class="sum">{{ braLine }}</text>
        <PkRow label="CN" :value="bra.cn + '（罩杯 ' + bra.cupCn + '）'" />
        <PkRow label="JP（罩杯写在前面）" :value="bra.jp" />
        <PkRow label="EU" :value="bra.eu + '（罩杯 ' + bra.cupEu + '）'" />
        <PkRow label="UK" :value="bra.uk + '（罩杯 ' + bra.cupUk + '）'" />
        <PkRow label="US" :value="bra.us + '（罩杯 ' + bra.cupUs + '）'" />
        <PkRow label="底围" :value="bra.bandCm + ' cm 档 / ' + bra.bandIn + ' 英寸档'" :copy="false" />
        <PkRow label="算法" :value="bra.note" :copy="false" stack />
        <PkRow label="跨体系换穿" :value="bra.crossNote" :copy="false" stack />
        <view v-for="(w, i) in braWarn" :key="i" class="li li--warn">
          <text class="li__dot">!</text>
          <text class="li__t">{{ w.text }}</text>
        </view>
      </PkCard>

      <PkCard v-if="bra && bra.sisters.list.length" title="同容积相邻码（换底围不退罩杯）" accent="var(--pk-warn)">
        <PkRow label="当前" :value="bra.sisters.from" :copy="false" />
        <PkRow v-for="s in bra.sisters.list" :key="s.code" :label="s.code" :value="s.tag" :copy="false" />
        <text class="prose">{{ bra.sisters.note }}</text>
      </PkCard>

      <PkCard title="罩杯进档对照（为什么同字母不一样大）" accent="var(--pk-accent)">
        <view class="tbl">
          <view class="tbl__r tbl__r--h">
            <text v-for="c in cupTable.columns" :key="c" class="tbl__c">{{ c }}</text>
          </view>
          <view v-for="r in cupTable.rows" :key="r.diff" class="tbl__r">
            <text class="tbl__c">{{ r.diff }}</text>
            <text class="tbl__c">{{ r.cn }}</text>
            <text class="tbl__c">{{ r.eu }}</text>
            <text class="tbl__c">{{ r.uk }}</text>
            <text class="tbl__c">{{ r.us }}</text>
          </view>
        </view>
        <view v-for="c in CUP_STEP_LIST" :key="c.key" class="li">
          <text class="li__dot">·</text>
          <text class="li__t">{{ c.name }}：A 起 {{ c.start }}cm，每 {{ c.step }}cm 一档｜{{ c.from }}</text>
        </view>
      </PkCard>
    </template>

    <!-- ============ 戒指 ============ -->
    <template v-if="kind === 'ring'">
      <PkCard title="戒圈：周长 / 直径 / 号数任给其一" :accent="TINT" padded>
        <PkSeg v-model="ringMode" :items="RING_MODES" />
        <PkField v-model="ringValue" type="digit" :label="ringModeName" :placeholder="ringModeHint">
          <template #labelRight>
            <text class="mini-act" @tap="ringValue = ''">清空</text>
          </template>
        </PkField>
        <view class="chip-row">
          <text v-for="s in RING_SAMPLES" :key="s.text" class="chip" @tap="useRingSample(s)">{{ s.text }}</text>
        </view>
        <text class="cap">量的是内周长：细绳绕指根一圈做记号再量长度，别绕指关节</text>
        <PkRow v-if="ringError" label="提示" :value="ringError" color="var(--pk-danger)" :copy="false" stack />
      </PkCard>

      <PkCard v-if="ring" title="各体系戒圈号" accent="var(--pk-accent)">
        <template #extra>
          <text class="mini-act" @tap="copyText(ringSummary)">复制小结</text>
        </template>
        <view class="hero">
          <text class="hero__t">美码 {{ ring.us }} 号</text>
          <text class="hero__s">按{{ ring.from }}</text>
        </view>
        <text class="sum">{{ ringLine }}</text>
        <PkRow label="内周长" :value="ring.circ + ' mm'" />
        <PkRow label="内直径" :value="ring.diameter + ' mm（' + ring.diameterIn + ' 英寸）'" />
        <PkRow label="美码 US" :value="ring.us + ' 号（公式 ' + ring.usExact + '）'" />
        <PkRow label="英码 UK" :value="ring.uk + '（' + ring.ukNote + '）'" :copy="false" stack />
        <PkRow label="港号 / 大陆号（民间近似）" :value="ring.hk + ' 号'" />
        <PkRow label="ISO / 欧码" :value="ring.iso + '（直接取内周长毫米数）'" :copy="false" />
        <PkRow label="算法" :value="ring.note" :copy="false" stack />
        <PkRow v-if="ring.warning" label="注意" :value="ring.warning" color="var(--pk-warn)" :copy="false" stack />
        <view v-for="(w, i) in ringWarn" :key="'rw' + i" class="li li--warn">
          <text class="li__dot">!</text>
          <text class="li__t">{{ w.text }}</text>
        </view>
        <view v-for="(t, i) in RING_TIPS" :key="i" class="li">
          <text class="li__dot">·</text>
          <text class="li__t">{{ t }}</text>
        </view>
      </PkCard>

      <PkCard title="周长对照表" accent="var(--pk-accent)">
        <view class="tbl">
          <view class="tbl__r tbl__r--h">
            <text v-for="c in ringTableData.columns" :key="c" class="tbl__c">{{ c }}</text>
          </view>
          <view v-for="r in ringTableData.rows" :key="r.circ" class="tbl__r">
            <text class="tbl__c">{{ r.circ }}</text>
            <text class="tbl__c">{{ r.diameter }}</text>
            <text class="tbl__c">{{ r.us }}</text>
            <text class="tbl__c">{{ r.hk }}</text>
            <text class="tbl__c">{{ r.iso }}</text>
          </view>
        </view>
        <text class="prose">常规区间 {{ fmtMm(RING_CIRC_MIN) }} ~ {{ fmtMm(RING_CIRC_MAX) }}；宽版戒指（≥6mm）比细圈紧，通常要在原号上加半号。</text>
      </PkCard>
    </template>

    <!-- ============ 共有：口径与依据 ============ -->
    <PkCard title="号码从哪来的" :accent="TINT">
      <PkRow v-for="(s, i) in SIZE_SOURCES" :key="i" :label="s.name" :value="s.text" :copy="false" stack />
    </PkCard>

    <PkCard title="常见参照与坑" accent="var(--pk-accent)">
      <PkRow label="脚长常规区间" :value="fmtMm(FOOT_MM_MIN) + ' ~ ' + fmtMm(FOOT_MM_MAX) + '（超过 ' + KIDS_MM_MAX + 'mm 就不再按童码排）'" :copy="false" stack />
      <PkRow label="放余量默认值" :value="DEFAULT_ALLOWANCE + ' cm（凉鞋 0.5 与跑鞋 2.0 之间差一个码）'" :copy="false" stack />
      <PkRow label="同一脚长三种刻度" value="毫米码（国标）线性无损；欧码按 2/3cm 进步；英美码按 1/3 英寸进步，取整后必然出现 ±0.5 码出入" :copy="false" stack />
      <PkRow label="字母码不是标准" value="S/M/L 由各厂自定义，只有「号型」（如 175/96A）才有公制含义；跨店比较请比号型与净体围度" :copy="false" stack />
      <PkRow label="罩杯同字母不同体积" value="CN/JP 每 2.5cm 进档、EU 每 2cm、UK/US 每 1 英寸，且底围不同容积也不同——只看字母必然买错" :copy="false" stack />
      <PkRow label="英/美老式算法" value="老算法把实测下胸围 + 4 英寸再取底围，新算法直接取最近档；同一副身体能差两个底围，别混用" :copy="false" stack />
      <PkRow label="戒指港号是民间口径" value="号数 ≈ 内周长 − 40，与美码的线性拟合公式并不等价；贵重戒指以珠宝店实量为准" :copy="false" stack />
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  DATA_NOTE,
  SIZE_SOURCES,
  SHOE_SYSTEMS,
  SHOE_AUDIENCES,
  SHOE_ALLOWANCES,
  FOOT_MM_MIN,
  FOOT_MM_MAX,
  KIDS_MM_MAX,
  DEFAULT_ALLOWANCE,
  RING_CIRC_MIN,
  RING_CIRC_MAX,
  RING_TIPS,
  CLOTHING_SEXES,
  BODY_TYPES,
  WAIST_LINES,
  convertSize,
  shoeSummaryText,
  shoeTable,
  shoeFitAdvice,
  ringTable,
  clothingFromLabel,
  clothingTable,
  jeansFromWaist,
  braTable,
  CUP_STEPS,
  sizeSummaryText,
  fmtMm,
} from '@/utils/bodysize'
import { copyText } from '@/utils/clipboard'

/** 本工具的品牌色（唯一的硬编码颜色，其余全走 CSS 变量） */
const TINT = '#3F7A6E'

const KIND_ITEMS = [
  { key: 'shoe', name: '鞋码' },
  { key: 'ring', name: '戒指' },
  { key: 'clothing', name: '服装' },
  { key: 'bra', name: '文胸' },
]

const KIND_NOTES = {
  shoe: '鞋看的是脚长毫米数：CN 新码就是毫米，旧码、欧码、英美码、日码都是从同一个楦长推出来的不同刻度。',
  clothing: '服装看号型：号 = 身高，型 = 胸围 / 腰围，后缀 Y·A·B·C 是胸腰差体型；字母码只是各厂自定义的外号。',
  bra: '文胸是底围 + 罩杯两个量，而四套体系的罩杯进档宽度不同（2.5cm / 2cm / 1 英寸），所以必须同时看。',
  ring: '戒圈真正决定合不合手的是内周长毫米数；美码、港号、ISO 都只是给它起的别名。',
}

const SHOE_SAMPLES = [
  { text: '脚长 240mm', value: '240', system: 'mm' },
  { text: '脚长 265mm', value: '265', system: 'mm' },
  { text: '旧码 38', value: '38', system: 'cn' },
  { text: '欧码 40', value: '40', system: 'eu' },
  { text: '美码男 8', value: '8', system: 'us' },
  { text: '日码 24.5', value: '24.5', system: 'jp' },
]

const LABEL_SAMPLES = ['M', 'L', '175/96A', '48']

const BRA_SAMPLES = [
  { text: '75 / 87.5', under: '75', over: '87.5' },
  { text: '70 / 80', under: '70', over: '80' },
  { text: '68 / 85', under: '68', over: '85' },
]

const RING_MODES = [
  { key: 'circ', name: '内周长 mm' },
  { key: 'diameter', name: '内直径 mm' },
  { key: 'us', name: '美码' },
  { key: 'hk', name: '港/大陆号' },
  { key: 'iso', name: 'ISO 周长' },
]

const RING_SAMPLES = [
  { text: '周长 52mm', mode: 'circ', value: '52' },
  { text: '直径 16.5', mode: 'diameter', value: '16.5' },
  { text: '美码 7', mode: 'us', value: '7' },
  { text: '港号 14', mode: 'hk', value: '14' },
]

const CUP_STEP_LIST = Object.keys(CUP_STEPS).map((k) => ({
  key: k,
  name: k.toUpperCase(),
  start: CUP_STEPS[k].start,
  step: CUP_STEPS[k].step,
  from: CUP_STEPS[k].from,
}))

const kind = ref('shoe')
const kindNote = computed(() => KIND_NOTES[kind.value])

/** util 的中文报错统一在这里接住，界面走 PkRow「提示」而不是弹窗 */
function attempt(fn) {
  try {
    return { data: fn(), error: '' }
  } catch (e) {
    return { data: null, error: e.message }
  }
}

/* ---------------- 鞋 ---------------- */

const shoeValue = ref('240')
const shoeSystem = ref('mm')
const shoeAudience = ref('men')
const shoeAllowance = ref('sneaker')
const brand = ref('')

const audienceItems = SHOE_AUDIENCES.map((a) => ({ key: a.key, name: a.name }))
const shoeSystemName = computed(() => SHOE_SYSTEMS.filter((s) => s.key === shoeSystem.value)[0].name)
const shoeSystemHint = computed(() => SHOE_SYSTEMS.filter((s) => s.key === shoeSystem.value)[0].hint)
const shoeAudienceName = computed(() => SHOE_AUDIENCES.filter((a) => a.key === shoeAudience.value)[0].name)
const allowanceNote = computed(() => {
  const hit = SHOE_ALLOWANCES.filter((a) => a.key === shoeAllowance.value)[0]
  return '当前 ' + shoeAllowanceValue.value + 'cm：' + (hit ? hit.note : '自定义') + '。放余量一换，号码整档移动'
})
const shoeAllowanceValue = computed(() => {
  const hit = SHOE_ALLOWANCES.filter((a) => a.key === shoeAllowance.value)[0]
  return hit ? hit.value : DEFAULT_ALLOWANCE
})

const shoeRun = computed(() =>
  attempt(() =>
    convertSize({
      kind: 'shoe',
      value: shoeValue.value,
      system: shoeSystem.value,
      audience: shoeAudience.value,
      allowanceKey: shoeAllowance.value,
    })
  )
)
const shoe = computed(() => (kind.value === 'shoe' && shoeRun.value.data ? shoeRun.value.data.shoe : null))
const shoeError = computed(() => (kind.value === 'shoe' && shoeValue.value.trim() !== '' ? shoeRun.value.error : ''))
const shoeWarn = computed(() => (shoeRun.value.data ? shoeRun.value.data.warnings : []))
const fit = computed(() => shoeFitAdvice(brand.value))
const fitDeltaText = computed(() => {
  if (!fit.value.matched) return ''
  const d = fit.value.delta
  if (d > 0) return '比公式值加 ' + d + ' 码'
  if (d < 0) return '比公式值减 ' + -d + ' 码'
  return '与公式值基本一致（差 0 码）'
})
// 一屏放得下的窗口：成人看 190~300mm，童码看 120~190mm
const shoeTableData = computed(() =>
  shoeAudience.value === 'kids'
    ? shoeTable({ audience: 'kids', allowanceKey: shoeAllowance.value, from: 120, to: 190 })
    : shoeTable({ audience: shoeAudience.value, allowanceKey: shoeAllowance.value, from: 190, to: 300 })
)

/* ---------------- 服装 ---------------- */

const sex = ref('male')
const height = ref('176')
const chest = ref('97')
const waist = ref('82')
const hip = ref('98')
const labelInput = ref('L')

const clothRun = computed(() =>
  attempt(() =>
    convertSize({
      kind: 'clothing',
      sex: sex.value,
      height: height.value,
      chest: chest.value,
      waist: waist.value,
      hip: hip.value,
    })
  )
)
const cloth = computed(() => (kind.value === 'clothing' && clothRun.value.data ? clothRun.value.data.clothing : null))
const clothError = computed(() => (kind.value === 'clothing' ? clothRun.value.error : ''))
const clothWarn = computed(() => (clothRun.value.data ? clothRun.value.data.warnings : []))
const clothRows = computed(() => clothingTable(sex.value))
const clothSummary = computed(() =>
  sizeSummaryText({ kind: '服装', clothing: cloth.value, warnings: clothWarn.value })
)

const labelRun = computed(() => attempt(() => clothingFromLabel(labelInput.value, sex.value)))
const labelRow = computed(() => (kind.value === 'clothing' ? labelRun.value.data : null))
const labelError = computed(() => (kind.value === 'clothing' && labelInput.value.trim() !== '' ? labelRun.value.error : ''))

const jeansRun = computed(() => attempt(() => jeansFromWaist(waist.value)))
const jeans = computed(() => (kind.value === 'clothing' ? jeansRun.value.data : null))
const jeansError = computed(() => (kind.value === 'clothing' && waist.value.trim() !== '' ? jeansRun.value.error : ''))

/* ---------------- 文胸 ---------------- */

const under = ref('75')
const over = ref('87.5')

const braRun = computed(() => attempt(() => convertSize({ kind: 'bra', under: under.value, over: over.value })))
const bra = computed(() => (kind.value === 'bra' && braRun.value.data ? braRun.value.data.bra : null))
const braError = computed(() => (kind.value === 'bra' ? braRun.value.error : ''))
const braWarn = computed(() => (braRun.value.data ? braRun.value.data.warnings : []))
const cupTable = computed(() => braTable())
const braSummary = computed(() => sizeSummaryText({ kind: '文胸', bra: bra.value, warnings: braWarn.value }))

/* ---------------- 戒指 ---------------- */

const ringMode = ref('circ')
const ringValue = ref('52')

const ringModeName = computed(() => RING_MODES.filter((m) => m.key === ringMode.value)[0].name)
const ringModeHint = computed(() => ({ circ: '52', diameter: '16.5', us: '7', hk: '12', iso: '52' }[ringMode.value]))

const ringRun = computed(() => attempt(() => convertSize(Object.assign({ kind: 'ring' }, { [ringMode.value]: ringValue.value }))))
const ring = computed(() => (kind.value === 'ring' && ringRun.value.data ? ringRun.value.data.ring : null))
const ringError = computed(() => (kind.value === 'ring' && ringValue.value.trim() !== '' ? ringRun.value.error : ''))
const ringWarn = computed(() => (ringRun.value.data ? ringRun.value.data.warnings : []))
const ringTableData = computed(() => ringTable({ from: 44, to: 68 }))
const ringSummary = computed(() => sizeSummaryText({ kind: '戒指', ring: ring.value, warnings: ringWarn.value }))

/* ---------------- 每张结果卡顶部的一句话 ---------------- */

/** sizeSummaryText 的第一行是抬头，第二行就是这一类的一句话结论 */
function summaryLine(t) {
  const lines = String(t).split('\n')
  return lines.length > 1 ? lines[1] : ''
}
const shoeLine = computed(() => (shoe.value ? summaryLine(sizeSummaryText({ kind: '鞋码', shoe: shoe.value })) : ''))
const ringLine = computed(() => (ring.value ? summaryLine(ringSummary.value) : ''))
const clothLine = computed(() => (cloth.value ? summaryLine(clothSummary.value) : ''))
const braLine = computed(() => (bra.value ? summaryLine(braSummary.value) : ''))

/* ---------------- 预填 ---------------- */

function useSample(s) {
  shoeSystem.value = s.system
  shoeValue.value = s.value
}

function useBraSample(s) {
  under.value = s.under
  over.value = s.over
}

function useRingSample(s) {
  ringMode.value = s.mode
  ringValue.value = s.value
}
</script>

<style scoped>
.prose {
  display: block;
  font-size: 22rpx;
  line-height: 1.75;
  color: var(--pk-text-3);
  padding: 10rpx 24rpx 18rpx;
}
.mini-act {
  font-size: 22rpx;
  color: var(--pk-accent);
  margin-left: 18rpx;
}
.cap {
  display: block;
  font-size: 22rpx;
  line-height: 1.7;
  color: var(--pk-text-3);
  margin: 6rpx 0 12rpx;
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 10rpx;
}
.chip {
  font-size: 22rpx;
  color: var(--pk-text-2);
  margin: 8rpx 12rpx 0 0;
  padding: 12rpx 18rpx;
  line-height: 1.3;
  border-radius: var(--pk-radius-sm);
  background: var(--pk-input);
  border: var(--pk-line-w) solid var(--pk-line);
}
.chip--on {
  color: var(--pk-accent);
  background: var(--pk-accent-soft);
}
.hero {
  display: flex;
  align-items: baseline;
  padding: 24rpx 24rpx 14rpx;
}
.hero__t {
  font-size: 44rpx;
  font-weight: 600;
  color: var(--pk-text);
  flex: 1;
}
.hero__s {
  font-size: 22rpx;
  color: var(--pk-text-3);
}
.sum {
  display: block;
  font-size: 22rpx;
  line-height: 1.7;
  color: var(--pk-accent);
  padding: 0 24rpx 12rpx;
}
.li {
  display: flex;
  align-items: flex-start;
  padding: 10rpx 24rpx;
}
.li__dot {
  width: 26rpx;
  font-size: 24rpx;
  color: var(--pk-text-3);
  flex-shrink: 0;
}
.li__t {
  flex: 1;
  font-size: 22rpx;
  line-height: 1.7;
  color: var(--pk-text-2);
}
.li--warn .li__dot,
.li--warn .li__t {
  color: var(--pk-warn);
}
.grid {
  display: flex;
  flex-wrap: wrap;
}
.cell {
  width: 48%;
  margin-right: 4%;
}
.cell:nth-child(2n) {
  margin-right: 0;
}
.tbl {
  padding: 4rpx 24rpx 14rpx;
}
.tbl__r {
  display: flex;
  align-items: center;
  padding: 10rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.tbl__r--h {
  border-bottom-color: var(--pk-line-strong);
}
.tbl__c {
  flex: 1;
  font-size: 22rpx;
  color: var(--pk-text-3);
  text-align: right;
}
.tbl__r--h .tbl__c {
  color: var(--pk-text-2);
  font-weight: 600;
}
.tbl__c:first-child {
  text-align: left;
}
</style>
