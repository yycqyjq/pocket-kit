<template>
  <view>
    <PkCard title="算哪一笔" accent="#7A6B4E" padded>
      <PkSeg v-model="tab" :items="tabs" />
      <text class="tip">三档共用同一套五险一金参数，改一次到处生效；下面每一档都只按公开口径做算术。</text>
    </PkCard>

    <template v-if="tab === 'salary'">
      <PkCard title="月薪与到手" accent="var(--pk-accent)" padded>
        <PkField v-model="gross" type="digit" label="税前月工资（元）" placeholder="25000" :maxlength="12" />
        <view class="row2">
          <PkField v-model="specialMonthly" type="digit" label="每月专项附加扣除（元）" placeholder="2000" :maxlength="10" />
          <PkField v-model="basicMonthly" type="digit" label="每月减除费用（元）" placeholder="5000" :maxlength="10" />
        </view>
        <view class="chips">
          <text v-for="s in SALARY_SAMPLES" :key="s.gross" class="chips__i" @tap="useSalarySample(s)">{{ s.name }}</text>
        </view>
        <PkRow v-if="salaryError" label="提示" :value="salaryError" color="var(--pk-danger)" :copy="false" stack />
        <template v-else-if="salary">
          <view class="hero">
            <text class="hero__v">{{ fmtYuan(salary.net) }}</text>
            <text class="hero__k">每月到手（元）</text>
          </view>
          <PkRow label="税前工资" :value="fmtYuan(salary.gross)" />
          <PkRow label="五险一金个人" :value="'− ' + fmtYuan(salary.personalSocial)" color="var(--pk-danger)" />
          <PkRow label="减除费用" :value="'− ' + fmtYuan(salary.basic)" />
          <PkRow label="专项附加" :value="'− ' + fmtYuan(salary.specialMonthly)" />
          <PkRow label="应纳税所得额" :value="fmtYuan(salary.taxable) + '（' + percentText(salary.percent, 0) + ' 档）'" :copy="false" />
          <PkRow label="代扣个税" :value="'− ' + fmtYuan(salary.tax)" color="var(--pk-danger)" />
          <PkRow label="到手" :value="fmtYuan(salary.net)" big color="var(--pk-accent)" />
          <PkRow label="到手 + 公积金双边" :value="fmtYuan(salary.netWide) + '（广义可支配）'" :copy="false" stack />
          <PkRow label="有效税率" :value="percentText(salary.effectiveRate) + '（税 ÷ 税前工资）'" :copy="false" />
          <text class="tip">{{ salary.note }}</text>
        </template>
      </PkCard>

      <PkCard title="五险一金逐险种" accent="var(--pk-accent)">
        <view class="tb">
          <view class="tb__h">
            <text class="tb__c tb__c--1">险种</text>
            <text class="tb__c tb__c--2">个人比例</text>
            <text class="tb__c tb__c--3">个人金额</text>
            <text class="tb__c tb__c--4">单位金额</text>
          </view>
          <view v-for="r in ins.rows" :key="r.key" class="tb__r">
            <text class="tb__c tb__c--1">{{ r.name }}</text>
            <text class="tb__c tb__c--2">{{ r.personalRate }}%</text>
            <text class="tb__c tb__c--3">{{ fmtYuan(r.personal) }}</text>
            <text class="tb__c tb__c--4">{{ fmtYuan(r.company) }}</text>
          </view>
        </view>
        <PkRow label="缴费基数" :value="fmtYuan(ins.base) + ' 元，' + insBaseNote" :copy="false" stack />
        <PkRow label="个人合计" :value="fmtYuan(ins.personalTotal)" color="var(--pk-danger)" />
        <PkRow label="单位合计" :value="fmtYuan(ins.companyTotal)" />
        <PkRow label="公积金双边进个人账户" :value="fmtYuan(ins.fundBoth)" color="var(--pk-accent)" />
        <PkRow label="用工总成本" :value="fmtYuan(ins.totalCost)" />
        <PkRow v-if="ins.capped" label="基数说明" :value="ins.capped" color="var(--pk-warn)" :copy="false" stack />
        <text v-for="r in ins.rows" :key="'n' + r.key" class="tip">{{ r.name }}：{{ r.note }}</text>
      </PkCard>

      <PkCard title="社保参数（示例默认值，务必照着当地通知改）" accent="var(--pk-warn)" padded>
        <view class="row2">
          <PkField v-model="base" type="digit" label="缴费基数（留空或 0 = 按工资）" placeholder="0" :maxlength="12" />
          <PkField v-model="baseLow" type="digit" label="基数下限（元）" placeholder="6000" :maxlength="12" />
        </view>
        <PkField v-model="baseHigh" type="digit" label="基数上限（元）" placeholder="30000" :maxlength="12" />
        <view class="ins">
          <view class="ins__h">
            <text class="ins__t">险种</text>
            <text class="ins__t">个人 %</text>
            <text class="ins__t">单位 %</text>
            <text class="ins__t">个人定额</text>
          </view>
          <view v-for="r in insRows" :key="r.key" class="ins__i">
            <text class="ins__n">{{ r.name }}</text>
            <view class="ins__f">
              <PkField v-model="r.pRate" type="digit" :maxlength="6" />
              <PkField v-model="r.cRate" type="digit" :maxlength="6" />
              <PkField v-model="r.extra" type="digit" :maxlength="8" />
            </view>
          </view>
        </view>
        <view class="act">
          <PkBtn text="恢复默认参数" kind="ghost" @tap="resetInsurance" />
        </view>
        <text class="tip">
          每次提交都是整表 {{ insParam.items.length }} 行：个人比例合计 {{ insParamPersonal }}%，另有定额
          {{ fmtYuan(insParamExtra) }} 元；单位比例合计 {{ insParamCompany }}%。基数区间 {{ fmtYuan(insParam.baseLow) }} ~
          {{ fmtYuan(insParam.baseHigh) }} 元，工资落在区间外会被夹到端点。 不想缴某个险种把它的比例改成 0，别删行。以上比例是示例值，不是当地口径。
        </text>
      </PkCard>
    </template>

    <template v-if="tab === 'annual'">
      <PkCard title="年度综合所得" accent="var(--pk-accent)" padded>
        <PkField v-model="income" type="digit" label="年度收入合计（元，不含单独计税的年终奖）" placeholder="300000" :maxlength="14" />
        <view class="row2">
          <PkField v-model="socialYear" type="digit" label="三险一金个人部分（元/年）" placeholder="60000" :maxlength="14" />
          <PkField v-model="otherDeduct" type="digit" label="其它扣除（元/年）" placeholder="0" :maxlength="14" />
        </view>
        <text class="tip">基本减除费用固定按 {{ fmtYuan(BASIC_DEDUCTION) }} 元/年（即每月 {{ BASIC_DEDUCTION_MONTHLY }} 元）扣，专项附加扣除按下面「专项附加扣除」卡的开关累加。</text>
        <PkRow label="年度应纳税所得额" :value="fmtYuan(annual.taxable)" />
        <PkRow label="落在档位" :value="annualHitText" :copy="false" stack />
        <PkRow label="全年个税" :value="fmtYuan(annual.tax)" big color="var(--pk-danger)" />
        <PkRow label="扣除后到手" :value="fmtYuan(annual.net)" color="var(--pk-accent)" />
        <PkRow label="有效税率" :value="percentText(annual.effectiveRate) + '（占收入）'" :copy="false" />
        <PkRow label="到手率" :value="percentText(annual.takeHomeRate)" />
        <PkRow v-if="annual.note" label="提示" :value="annual.note" color="var(--pk-warn)" :copy="false" stack />
        <view v-if="annual.rows.length" class="tb">
          <view class="tb__h">
            <text class="tb__c tb__c--1">逐档累加</text>
            <text class="tb__c tb__c--2">本档金额</text>
            <text class="tb__c tb__c--3">税率</text>
            <text class="tb__c tb__c--4">本档税</text>
          </view>
          <view v-for="(r, i) in annual.rows" :key="i" class="tb__r">
            <text class="tb__c tb__c--1">{{ r.range }}</text>
            <text class="tb__c tb__c--2">{{ fmtYuan(r.amount) }}</text>
            <text class="tb__c tb__c--3">{{ r.percent }}%</text>
            <text class="tb__c tb__c--4">{{ fmtYuan(r.tax) }}</text>
          </view>
        </view>
        <text class="tip">档位共 {{ ANNUAL_BRACKETS.length }} 级，本次命中的是第 {{ annualBracketHit + 1 }} 级；逐档累加的各行合计应等于上面「全年个税」，对不上说明输入越界了。</text>
      </PkCard>

      <PkCard title="专项附加扣除" accent="#7A6B4E">
        <PkSwitchRow v-model="onChildren" title="子女教育" :desc="specOf('childrenEdu').desc" />
        <PkField v-if="onChildren" v-model="childN" type="number" label="子女个数" placeholder="1" :maxlength="2" />
        <PkSwitchRow v-model="onInfant" title="3 岁以下婴幼儿照护" :desc="specOf('infantEdu').desc" />
        <PkField v-if="onInfant" v-model="infantN" type="number" label="婴幼儿个数" placeholder="1" :maxlength="2" />
        <PkSwitchRow v-model="onElder" title="赡养老人" :desc="specOf('elderCare').desc" />
        <template v-if="onElder">
          <PkSeg v-model="elderMode" :items="elderItems" />
          <PkField v-if="elderMode === 'shared'" v-model="elderShared" type="number" label="分摊人数（不含自己则 +1）" placeholder="2" :maxlength="2" />
        </template>
        <PkSwitchRow v-model="onLoan" title="住房贷款利息" :desc="specOf('homeLoan').desc" />
        <PkSwitchRow v-model="onRent" title="住房租金" :desc="specOf('homeRent').desc" />
        <PkSeg v-if="onRent" v-model="rentKey" :items="rentItems" />
        <text class="sub">继续教育</text>
        <PkSeg v-model="contEdu" :items="contItems" />
        <PkField v-model="medical" type="digit" label="大病医疗：医保目录内个人自付累计（元）" placeholder="0" :maxlength="12" />
        <view v-if="sd.rows.length" class="sdr">
          <view v-for="(r, i) in sd.rows" :key="i" class="sdr__i">
            <view class="sdr__top">
              <text class="sdr__n">{{ r.name }}</text>
              <text class="sdr__v">{{ fmtYuan(r.amount) }} / {{ r.per }}</text>
            </view>
            <text class="sdr__h">{{ r.how }}</text>
          </view>
        </view>
        <text v-if="!sd.rows.length" class="tip">一个都没勾，专项附加扣除按 0 计。</text>
        <PkRow label="每月合计" :value="fmtYuan(sd.monthlyTotal)" />
        <PkRow label="全年合计" :value="fmtYuan(sd.yearlyTotal)" big color="var(--pk-accent)" />
        <PkRow label="大病医疗（只在汇算扣）" :value="fmtYuan(sd.medicalYear)" />
        <text class="tip">{{ sd.note }}</text>
        <text v-for="(x, i) in SPECIAL_DEDUCTIONS" :key="i" class="tip">{{ x.name}}：{{ x.from }}</text>
      </PkCard>

      <PkCard title="累计预扣法逐月表" accent="var(--pk-accent)">
        <view class="row2">
          <PkField v-model="wsGross" type="digit" label="月工资（元）" placeholder="25000" :maxlength="12" />
          <PkField v-model="wsMonths" type="number" label="算几个月（1—12）" placeholder="12" :maxlength="2" />
        </view>
        <view class="row2">
          <PkField v-model="wsBonus" type="digit" label="奖金（元，发在指定月）" placeholder="0" :maxlength="12" />
          <PkField v-model="wsBonusMonth" type="number" label="奖金发在第几个月" placeholder="12" :maxlength="2" />
        </view>
        <text class="tip">月专项附加自动取上面「专项附加扣除」的 {{ fmtYuan(sd.monthlyTotal) }} 元，五险一金取「月薪到手」页里的社保参数（换页不会重置）。</text>
        <PkRow v-if="wsError" label="提示" :value="wsError" color="var(--pk-danger)" :copy="false" stack />
        <template v-else-if="ws">
          <view class="tb">
            <view class="tb__h">
              <text class="tb__c tb__c--1">月</text>
              <text class="tb__c tb__c--2">累计应税</text>
              <text class="tb__c tb__c--3">当月扣税</text>
              <text class="tb__c tb__c--4">当月到手</text>
            </view>
            <view v-for="r in ws.rows" :key="r.month" class="tb__r">
              <text class="tb__c tb__c--1">{{ r.month }}</text>
              <text class="tb__c tb__c--2">{{ fmtYuan(r.cumTaxable) }}</text>
              <text class="tb__c tb__c--3">{{ fmtYuan(r.tax) }}</text>
              <text class="tb__c tb__c--4">{{ fmtYuan(r.net) }}</text>
            </view>
          </view>
          <PkRow label="全年扣税" :value="fmtYuan(ws.totalTax)" color="var(--pk-danger)" />
          <PkRow label="全年到手" :value="fmtYuan(ws.totalNet)" big color="var(--pk-accent)" />
          <PkRow label="首次扣税月" :value="ws.firstTaxedMonth ? '第 ' + ws.firstTaxedMonth + ' 月' : '全年未扣税'" :copy="false" />
          <PkRow v-if="ws.jumpMonth" label="跳档月" :value="'第 ' + ws.jumpMonth + ' 月进入 ' + ws.jumpPercent + '% 档'" color="var(--pk-warn)" :copy="false" />
          <text class="tip">{{ ws.method }}：{{ ws.note }}</text>
          <text class="tip">逐月表最多 12 行，此处 {{ ws.rows.length }} 行全部列出；当月到手含奖金。</text>
        </template>
      </PkCard>
    </template>

    <template v-if="tab === 'bonus'">
      <PkCard title="年终奖怎么发更省" accent="var(--pk-accent)" padded>
        <PkField v-model="bonus" type="digit" label="年终奖金额（元）" placeholder="60000" :maxlength="14">
          <template #labelRight>
            <text class="mini-act" @tap="bonus = '36001'">试一下 36001</text>
          </template>
        </PkField>
        <view class="chips">
          <text v-for="b in BONUS_CHIPS" :key="b" class="chips__i" @tap="bonus = String(b)">{{ fmtYuan(b) }}</text>
        </view>
        <text class="tip">年度口径沿用上一档填的收入 {{ fmtYuan(annual.income) }} 元、三险一金 {{ fmtYuan(annual.social) }} 元与专项附加 {{ fmtYuan(annual.specialAdditional) }} 元（都不含这笔奖金）。</text>
        <view class="cmp">
          <view class="cmp__col" :class="{ 'cmp__col--on': cmp.better === 'separate' }">
            <text class="cmp__t">单独计税</text>
            <text class="cmp__v">{{ fmtYuan(cmp.separate.tax) }}</text>
            <text class="cmp__s">税（{{ percentText(cmp.separate.percent, 0) }} 档）</text>
            <text class="cmp__s">到手 {{ fmtYuan(cmp.separate.net) }}</text>
            <text class="cmp__s">{{ fmtYuan(cmp.separate.bonus) }} ÷ 12 = {{ fmtYuan(cmp.separate.perMonth) }}</text>
          </view>
          <view class="cmp__col" :class="{ 'cmp__col--on': cmp.better === 'merged' }">
            <text class="cmp__t">并入综合所得</text>
            <text class="cmp__v">{{ fmtYuan(cmp.merged.addedTax) }}</text>
            <text class="cmp__s">新增税负</text>
            <text class="cmp__s">到手 {{ fmtYuan(cmp.merged.net) }}</text>
            <text class="cmp__s">边际 {{ percentText(cmp.merged.effectiveRate) }}</text>
          </view>
        </view>
        <PkRow label="更省的做法" :value="cmp.betterName" big color="var(--pk-accent)" :copy="false" />
        <PkRow label="省多少" :value="fmtYuan(cmp.save) + ' 元'" color="var(--pk-accent)" />
        <text class="tip">{{ cmp.note }}</text>
        <text class="tip">{{ cmp.separate.note }}</text>
        <text class="tip">{{ cmp.separate.method }}；{{ cmp.merged.method }}</text>
      </PkCard>

      <PkCard title="年终奖无效区间" accent="var(--pk-danger)" padded>
        <PkRow
          label="当前这笔"
          :value="advice.inTrap ? '踩在无效区间里' : '不在无效区间'"
          :color="advice.inTrap ? 'var(--pk-danger)' : 'var(--pk-accent)'"
          :copy="false"
        />
        <text class="tip">{{ advice.note }}</text>
        <template v-if="advice.inTrap">
          <PkRow label="改成" :value="fmtYuan(advice.suggest) + ' 元'" color="var(--pk-accent)" />
          <PkRow label="到手反而多" :value="fmtYuan(advice.more) + ' 元'" big color="var(--pk-accent)" />
        </template>
        <view class="tb">
          <view class="tb__h">
            <text class="tb__c tb__c--1">无效区间</text>
            <text class="tb__c tb__c--2">临界点</text>
            <text class="tb__c tb__c--3">最多吃亏</text>
          </view>
          <view v-for="(t, i) in visibleTraps" :key="i" class="tb__r">
            <text class="tb__c tb__c--1">{{ fmtYuan(t.from) }} ~ {{ fmtYuan(t.to) }}</text>
            <text class="tb__c tb__c--2">{{ fmtYuan(t.boundary) }}</text>
            <text class="tb__c tb__c--3">{{ fmtYuan(t.lost) }}</text>
          </view>
        </view>
        <text v-if="traps.length > TRAP_LIMIT" class="tip">…共 {{ traps.length }} 段，只显示前 {{ TRAP_LIMIT }} 段。</text>
        <text v-else class="tip">共 {{ traps.length }} 段，全部列出。按 {{ MONTHLY_BRACKETS.length }} 级月度税率表的档位边界解出来的，与本文件税率表自洽。</text>
      </PkCard>
    </template>

    <PkCard title="反推：想到手 X，税前要多少" accent="#7A6B4E" padded>
      <PkField v-model="targetNet" type="digit" label="目标月到手（元）" placeholder="20000" :maxlength="12" />
      <PkSwitchRow v-model="wide" title="把公积金双边都算进「到手」" desc="开关后同一个目标反推出来的税前会低一些" last />
      <PkRow v-if="solveError" label="提示" :value="solveError" color="var(--pk-danger)" :copy="false" stack />
      <template v-else-if="solve">
        <PkRow label="需要税前" :value="fmtYuan(solve.gross) + ' 元/月'" big color="var(--pk-accent)" />
        <PkRow label="验证到手" :value="fmtYuan(wide ? solve.detail.netWide : solve.detail.net)" />
        <PkRow label="残差" :value="fmtYuan(solve.error) + ' 元'" />
        <PkRow label="五险一金个人" :value="fmtYuan(solve.detail.personalSocial)" color="var(--pk-danger)" />
        <PkRow label="代扣个税" :value="fmtYuan(solve.detail.tax)" color="var(--pk-danger)" />
        <view class="steps">
          <view v-for="(s, i) in solve.steps" :key="i" class="steps__r">
            <text class="steps__k">第 {{ s.i }} 次</text>
            <text class="steps__v">区间 {{ fmtYuan(s.lo) }} ~ {{ fmtYuan(s.hi) }}，试 {{ fmtYuan(s.mid) }} → 到手 {{ fmtYuan(s.net) }}</text>
          </view>
        </view>
        <text class="tip">二分迭代 {{ solve.iterations }} 次，上面只列最后 {{ solve.steps.length }} 步；{{ solve.note }}</text>
      </template>
    </PkCard>

    <PkCard title="同一笔钱：工资 / 劳务 / 稿酬 / 经营" accent="var(--pk-accent)" padded>
      <PkField v-model="formAmount" type="digit" label="金额（元）" placeholder="50000" :maxlength="14" />
      <text class="tip">月均 {{ fmtYuan(form.monthly) }} 元；下面四行是同一笔钱在不同税目下的算法结果，不是同一件事的四种做法。</text>
      <PkRow v-if="formError" label="提示" :value="formError" color="var(--pk-danger)" :copy="false" stack />
      <template v-else>
        <view class="tb">
          <view class="tb__h">
            <text class="tb__c tb__c--1">税目</text>
            <text class="tb__c tb__c--2">税/预扣</text>
            <text class="tb__c tb__c--3">到手</text>
            <text class="tb__c tb__c--4">税负率</text>
          </view>
          <view v-for="(r, i) in formRows" :key="i" class="tb__r">
            <text class="tb__c tb__c--1">{{ r.name }}</text>
            <text class="tb__c tb__c--2">{{ fmtYuan(r.tax) }}</text>
            <text class="tb__c tb__c--3">{{ fmtYuan(r.net) }}</text>
            <text class="tb__c tb__c--4">{{ r.rate }}</text>
          </view>
        </view>
        <PkRow label="三项中名义税负最低" :value="form.cheapest + '（稿酬不参与此项比较）'" color="var(--pk-accent)" :copy="false" stack />
        <PkRow label="稿酬实际计入" :value="fmtYuan(author.intoIncome) + ' 元，占 ' + percentText(author.intoIncomePercent) + '，预扣 ' + fmtYuan(author.tax) + ' 元'" :copy="false" stack />
        <PkRow label="劳务减除费用" :value="labor.deductionNote + '，减 ' + fmtYuan(labor.deduction)" :copy="false" stack />
        <text class="tip">{{ labor.note }}</text>
        <text class="tip">{{ author.note }}</text>
        <text class="tip">{{ form.note }}</text>
      </template>
    </PkCard>

    <PkCard title="政策口径与税率表" accent="var(--pk-warn)">
      <template #extra>
        <text class="mini-act" @tap="copyPolicy">复制口径说明</text>
      </template>
      <view class="src">
        <text class="src__k">口径年份</text>
        <text class="src__v">{{ POLICY_NOTE }}</text>
      </view>
      <view class="src">
        <text class="src__k">基本减除</text>
        <text class="src__v">年度 {{ fmtYuan(BASIC_DEDUCTION) }} 元 / 月 {{ BASIC_DEDUCTION_MONTHLY }} 元（预扣用）</text>
      </view>
      <view v-for="tb in tables" :key="tb.name" class="src">
        <text class="src__k">{{ tb.name }}</text>
        <view class="tb tb--in">
          <view class="tb__h">
            <text class="tb__c tb__c--1">区间</text>
            <text class="tb__c tb__c--2">税率</text>
            <text class="tb__c tb__c--3">速算扣除</text>
          </view>
          <view v-for="r in tb.rows" :key="r.index" class="tb__r">
            <text class="tb__c tb__c--1">{{ r.range }}</text>
            <text class="tb__c tb__c--2">{{ r.percent }}%</text>
            <text class="tb__c tb__c--3">{{ r.quick }}</text>
          </view>
        </view>
        <text class="src__v">{{ tb.note }}</text>
      </view>
      <view class="act">
        <PkBtn text="展开完整口径说明" kind="ghost" block @tap="policyOpen = !policyOpen" />
      </view>
      <view v-if="policyOpen" class="out">
        <text class="out__t">{{ policy }}</text>
      </view>
      <text class="tip">
        表格行数为各税率表的固定档位（{{ tables[0].rows.length }} / {{ tables[1].rows.length }} / {{ tables[2].rows.length }} / {{ tables[3].rows.length }} 级），
        不存在截断。以上只是按公开口径做的算术演示，不构成税务、社保、法律或投资建议；实际以税务机关核定与单位扣缴明细为准。
      </text>
    </PkCard>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  salaryMonthly,
  insuranceOf,
  normalizeInsurance,
  defaultInsurance,
  annualIit,
  specialDeductions,
  withholdingSchedule,
  bonusCompare,
  bonusAdvice,
  bonusTrapRanges,
  solveGrossForNet,
  laborPayment,
  businessIncome,
  authorRemuneration,
  incomeFormCompare,
  policyText,
  bracketTable,
  fmtYuan,
  percentText,
  bracketOf,
  POLICY_NOTE,
  SPECIAL_DEDUCTIONS,
  ANNUAL_BRACKETS,
  MONTHLY_BRACKETS,
  BUSINESS_BRACKETS,
  LABOR_BRACKETS,
  BASIC_DEDUCTION,
  BASIC_DEDUCTION_MONTHLY,
} from '@/utils/taxcn'
import { copyText } from '@/utils/clipboard'

const TRAP_LIMIT = 5

const tabs = [
  { key: 'salary', name: '月薪到手' },
  { key: 'annual', name: '年度汇算' },
  { key: 'bonus', name: '年终奖' },
]

const SALARY_SAMPLES = [
  { name: '10000 / 无附加', gross: '10000', special: '0' },
  { name: '25000 / 2000', gross: '25000', special: '2000' },
  { name: '50000 / 4000', gross: '50000', special: '4000' },
]

const BONUS_CHIPS = [36000, 36001, 88000, 144000, 300000, 420000]

function numOr(v) {
  const n = Number(String(v === null || v === undefined ? '' : v).replace(/[,¥￥\s]/g, ''))
  return isFinite(n) ? n : 0
}

/* ------------------------------------------------ 五险一金参数 */
const insRows = ref(
  defaultInsurance().items.map((it) => ({
    key: it.key,
    name: it.name,
    pRate: String(round4(it.personal * 100)),
    cRate: String(round4(it.company * 100)),
    extra: String(it.extra),
  }))
)
const base = ref('')
const baseLow = ref('6000')
const baseHigh = ref('30000')

function round4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000
}

function insuranceOpt() {
  return {
    base: numOr(base.value),
    baseLow: numOr(baseLow.value),
    baseHigh: numOr(baseHigh.value),
    items: insRows.value.map((r) => ({
      key: r.key,
      name: r.name,
      personal: numOr(r.pRate) / 100,
      company: numOr(r.cRate) / 100,
      extra: numOr(r.extra),
    })),
  }
}

function resetInsurance() {
  const d = defaultInsurance()
  insRows.value = d.items.map((it) => ({
    key: it.key,
    name: it.name,
    pRate: String(round4(it.personal * 100)),
    cRate: String(round4(it.company * 100)),
    extra: String(it.extra),
  }))
  base.value = ''
  baseLow.value = String(d.baseLow)
  baseHigh.value = String(d.baseHigh)
}

const insParam = computed(() => normalizeInsurance(insuranceOpt()))
function rateSum(which) {
  let sum = 0
  insParam.value.items.forEach((x) => {
    sum += Number(x[which]) || 0
  })
  return round4(sum * 100)
}
const insParamPersonal = computed(() => rateSum('personal'))
const insParamCompany = computed(() => rateSum('company'))
const insParamExtra = computed(() => {
  let sum = 0
  insParam.value.items.forEach((x) => {
    sum += Number(x.extra) || 0
  })
  return Math.round(sum * 100) / 100
})

/* ------------------------------------------------ ① 月薪 */
const tab = ref('salary')
const gross = ref('25000')
const specialMonthly = ref('2000')
const basicMonthly = ref(String(BASIC_DEDUCTION_MONTHLY))

const salaryWrap = computed(() => {
  try {
    return {
      r: salaryMonthly({
        gross: numOr(gross.value),
        insurance: insuranceOpt(),
        specialMonthly: numOr(specialMonthly.value),
        basic: basicMonthly.value === '' ? undefined : numOr(basicMonthly.value),
      }),
      err: '',
    }
  } catch (e) {
    return { r: null, err: e.message || '算不出来' }
  }
})
const salary = computed(() => salaryWrap.value.r)
const salaryError = computed(() => (String(gross.value).trim() === '' ? '先填税前月工资' : salaryWrap.value.err))

const ins = computed(() => insuranceOf(numOr(gross.value), insuranceOpt()))
const insBaseNote = computed(() => {
  const b = numOr(base.value)
  if (b > 0) return '按你在参数里单填的基数'
  return '未单填基数，按税前工资取'
})

function useSalarySample(s) {
  gross.value = s.gross
  specialMonthly.value = s.special
}

/* ------------------------------------------------ ② 年度 */
const income = ref('300000')
const socialYear = ref('60000')
const otherDeduct = ref('0')

const onChildren = ref(true)
const childN = ref('1')
const onInfant = ref(false)
const infantN = ref('1')
const onElder = ref(true)
const elderMode = ref('only')
const elderShared = ref('2')
const onLoan = ref(false)
const onRent = ref(false)
const rentKey = ref('1500')
const contEdu = ref('none')
const medical = ref('0')

const elderItems = [
  { key: 'only', name: '独生子女' },
  { key: 'shared', name: '与人分摊' },
]
const rentItems = (SPECIAL_DEDUCTIONS.filter((x) => x.key === 'homeRent')[0].tiers || []).map((t) => ({ key: t.key, name: t.name }))
const contItems = [
  { key: 'none', name: '不扣' },
  { key: 'academic', name: '学历 400/月' },
  { key: 'exam', name: '职业资格 3600/年' },
]

function specOf(key) {
  return SPECIAL_DEDUCTIONS.filter((x) => x.key === key)[0] || { desc: '', from: '' }
}

const sdSel = computed(() => ({
  childrenEdu: onChildren.value ? numOr(childN.value) : 0,
  infantEdu: onInfant.value ? numOr(infantN.value) : 0,
  elderCare: !onElder.value ? 'none' : elderMode.value === 'shared' ? { shared: numOr(elderShared.value) } : 'only',
  homeLoan: onLoan.value,
  homeRent: onRent.value ? numOr(rentKey.value) : 0,
  continueEdu: contEdu.value,
  medical: numOr(medical.value),
}))
const sd = computed(() => specialDeductions(sdSel.value))

function annualArgs() {
  return {
    income: numOr(income.value),
    social: numOr(socialYear.value),
    other: numOr(otherDeduct.value),
    deductions: sd.value,
  }
}
const annual = computed(() => annualIit(annualArgs()))
const annualBracketHit = computed(() => bracketOf(annual.value.taxable, ANNUAL_BRACKETS).index)
const annualHitText = computed(() => {
  const a = annual.value
  if (!a.rows.length) return '应纳税所得额为 0，不进税档'
  return a.bracketNote + '（' + percentText(a.percent, 0) + ' 档，速算扣除 ' + a.quick + '）'
})

const wsGross = ref('25000')
const wsMonths = ref('12')
const wsBonus = ref('0')
const wsBonusMonth = ref('12')

const wsWrap = computed(() => {
  try {
    return {
      r: withholdingSchedule({
        gross: numOr(wsGross.value),
        months: numOr(wsMonths.value),
        insurance: insuranceOpt(),
        specialMonthly: sd.value.monthlyTotal,
        bonus: numOr(wsBonus.value),
        bonusMonth: numOr(wsBonusMonth.value),
      }),
      err: '',
    }
  } catch (e) {
    return { r: null, err: e.message || '逐月表算不出来' }
  }
})
const ws = computed(() => wsWrap.value.r)
const wsError = computed(() => (String(wsGross.value).trim() === '' ? '先填月工资' : wsWrap.value.err))

/* ------------------------------------------------ ③ 年终奖 */
const bonus = ref('60000')
const cmp = computed(() => bonusCompare(annualArgs(), numOr(bonus.value)))
const advice = computed(() => bonusAdvice(numOr(bonus.value)))
const traps = computed(() => bonusTrapRanges())
const visibleTraps = computed(() => traps.value.slice(0, TRAP_LIMIT))

/* ------------------------------------------------ 反推税前 */
const targetNet = ref('20000')
const wide = ref(false)
const solveWrap = computed(() => {
  const t = numOr(targetNet.value)
  if (!(t > 0)) return { r: null, err: '' }
  try {
    return {
      r: solveGrossForNet(t, {
        insurance: insuranceOpt(),
        specialMonthly: numOr(specialMonthly.value),
        wide: wide.value,
      }),
      err: '',
    }
  } catch (e) {
    return { r: null, err: e.message || '反推失败' }
  }
})
const solve = computed(() => solveWrap.value.r)
const solveError = computed(() => (solveWrap.value.err || (numOr(targetNet.value) > 0 ? '' : '填一个大于 0 的目标到手金额')))

/* ------------------------------------------------ 所得形式对比 */
const formAmount = ref('50000')
const formWrap = computed(() => {
  const a = numOr(formAmount.value)
  if (!(a > 0)) return { r: null, labor: null, author: null, biz: null, err: '' }
  try {
    return {
      r: incomeFormCompare(a),
      labor: laborPayment(a),
      author: authorRemuneration(a),
      biz: businessIncome({ income: a, cost: round4(a * 0.2) }),
      err: '',
    }
  } catch (e) {
    return { r: null, labor: null, author: null, biz: null, err: e.message || '算不出来' }
  }
})
const form = computed(() => formWrap.value.r || { monthly: 0, cheapest: '—', note: '' })
const labor = computed(() => formWrap.value.labor || { deductionNote: '', deduction: 0, note: '' })
const author = computed(() => formWrap.value.author || { note: '', intoIncome: 0, intoIncomePercent: 0, tax: 0, gross: 0, net: 0 })
const formError = computed(() => (formWrap.value.err || (numOr(formAmount.value) > 0 ? '' : '填一个大于 0 的金额')))
const formRows = computed(() => {
  const f = formWrap.value
  if (!f.r) return []
  return [
    { name: '工资薪金（年度）', tax: f.r.salaryAsAnnual.tax, net: f.r.salaryAsAnnual.net, rate: percentText(f.r.salaryAsAnnual.effectiveRate) },
    { name: '劳务报酬（预扣）', tax: f.labor.tax, net: f.labor.net, rate: percentText(f.labor.effectiveRate) },
    { name: '稿酬（预扣）', tax: f.author.tax, net: f.author.net, rate: percentText(round4((f.author.tax / f.author.gross) * 100)) },
    { name: '经营所得（成本 20%）', tax: f.biz.tax, net: f.biz.net, rate: percentText(f.biz.effectiveRate) },
  ]
})

/* ------------------------------------------------ 口径 */
const policy = policyText()
const policyOpen = ref(false)
const tables = [
  { name: '综合所得年度税率表（七级）', rows: bracketTable(ANNUAL_BRACKETS), note: '工资薪金、劳务报酬、稿酬、特许权使用费四项合并为综合所得，按年计算。' },
  { name: '按月换算税率表（年终奖单独计适用）', rows: bracketTable(MONTHLY_BRACKETS), note: '奖金 ÷ 12 定档，再对全额套用该档税率与速算扣除数。' },
  { name: '经营所得五级', rows: bracketTable(BUSINESS_BRACKETS), note: '个体户、个人独资企业、承包承租经营所得。' },
  { name: '劳务报酬预扣三级', rows: bracketTable(LABOR_BRACKETS), note: '对减除费用后的余额适用，年度汇算时并入综合所得多退少补。' },
]

function copyPolicy() {
  copyText(policy, '已复制口径说明')
}
</script>

<style scoped>
.tip {
  display: block;
  font-size: 22rpx;
  line-height: 1.8;
  color: var(--pk-text-3);
  padding: 10rpx 24rpx 6rpx;
}
.mini-act {
  font-size: 24rpx;
  color: var(--pk-accent);
}
.sub {
  display: block;
  font-size: 24rpx;
  color: var(--pk-text-2);
  padding: 8rpx 0 10rpx;
}
.row2 {
  display: flex;
  gap: 18rpx;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  padding: 4rpx 0 8rpx;
}
.chips__i {
  display: inline-block;
  font-size: 22rpx;
  color: var(--pk-accent);
  margin: 8rpx 12rpx 0 0;
  padding: 12rpx 18rpx;
  line-height: 1.3;
  border-radius: var(--pk-radius-sm);
  background: var(--pk-accent-soft);
}
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24rpx 24rpx 12rpx;
}
.hero__v {
  font-size: 56rpx;
  font-weight: 600;
  color: var(--pk-text);
  font-family: Menlo, Consolas, monospace;
}
.hero__k {
  font-size: 22rpx;
  color: var(--pk-text-3);
  margin-top: 10rpx;
}
.tb {
  padding: 6rpx 24rpx 10rpx;
}
.tb--in {
  padding: 6rpx 0 4rpx;
}
.tb__h {
  display: flex;
  padding: 8rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line-strong);
}
.tb__r {
  display: flex;
  padding: 14rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.tb__c {
  font-size: 22rpx;
  color: var(--pk-text-2);
}
.tb__h .tb__c {
  font-size: 22rpx;
  color: var(--pk-text-3);
}
.tb__c--1 {
  width: 250rpx;
  flex-shrink: 0;
}
.tb__c--2,
.tb__c--3,
.tb__c--4 {
  flex: 1;
  text-align: right;
  font-family: Menlo, Consolas, monospace;
}
.ins {
  padding-top: 8rpx;
}
.ins__h {
  display: flex;
  align-items: center;
  padding-bottom: 8rpx;
}
.ins__t {
  font-size: 22rpx;
  color: var(--pk-text-3);
}
.ins__h .ins__t {
  width: 150rpx;
  flex-shrink: 0;
}
.ins__h .ins__t:nth-child(n + 2) {
  flex: 1;
  text-align: center;
  width: auto;
}
.ins__i {
  display: flex;
  align-items: center;
}
.ins__n {
  width: 150rpx;
  flex-shrink: 0;
  font-size: 24rpx;
  color: var(--pk-text-2);
}
.ins__f {
  flex: 1;
  display: flex;
  gap: 10rpx;
}
.act {
  display: flex;
  gap: 18rpx;
  padding: 6rpx 0 10rpx;
}
.cmp {
  display: flex;
  gap: 16rpx;
  padding: 8rpx 24rpx 16rpx;
}
.cmp__col {
  flex: 1;
  padding: 20rpx 18rpx;
  border-radius: var(--pk-radius-md);
  background: var(--pk-seg-bg);
  border: var(--pk-line-w) solid var(--pk-line);
  display: flex;
  flex-direction: column;
}
.cmp__col--on {
  border-color: var(--pk-accent);
  background: var(--pk-accent-soft);
}
.cmp__t {
  font-size: 24rpx;
  color: var(--pk-text-2);
  font-weight: 600;
}
.cmp__v {
  font-size: 32rpx;
  color: var(--pk-text);
  margin: 10rpx 0 6rpx;
  font-weight: 600;
  font-family: Menlo, Consolas, monospace;
}
.cmp__s {
  font-size: 22rpx;
  color: var(--pk-text-3);
  line-height: 1.8;
}
.steps {
  padding: 6rpx 24rpx 4rpx;
}
.steps__r {
  display: flex;
  align-items: baseline;
  padding: 8rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.steps__k {
  font-size: 22rpx;
  color: var(--pk-text-3);
  width: 120rpx;
  flex-shrink: 0;
}
.steps__v {
  flex: 1;
  font-size: 22rpx;
  color: var(--pk-text-2);
  font-family: Menlo, Consolas, monospace;
  line-height: 1.7;
}
.src {
  display: flex;
  flex-direction: column;
  padding: 14rpx 24rpx;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.src__k {
  font-size: 22rpx;
  color: var(--pk-text-3);
}
.src__v {
  font-size: 24rpx;
  color: var(--pk-text-2);
  line-height: 1.8;
  margin-top: 6rpx;
}
.sdr {
  padding: 4rpx 24rpx 6rpx;
}
.sdr__i {
  padding: 14rpx 0;
  border-bottom: var(--pk-line-w) solid var(--pk-line);
}
.sdr__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.sdr__n {
  font-size: 24rpx;
  color: var(--pk-text);
  font-weight: 500;
}
.sdr__v {
  font-size: 24rpx;
  color: var(--pk-accent);
  font-family: Menlo, Consolas, monospace;
  margin-left: 16rpx;
}
.sdr__h {
  display: block;
  font-size: 22rpx;
  color: var(--pk-text-3);
  line-height: 1.7;
  margin-top: 6rpx;
}
.out {
  margin: 0 24rpx 12rpx;
  padding: 20rpx 22rpx;
  border-radius: var(--pk-radius-md);
  background: var(--pk-input);
  border: var(--pk-line-w) solid var(--pk-line);
}
.out__t {
  font-size: 22rpx;
  line-height: 1.9;
  color: var(--pk-text-2);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
