<template>
  <div class="legal-page">
    <div class="legal-container">
      <h1>数据来源与算法说明</h1>
      <p class="legal-update">最后更新日期：2026年6月17日</p>

      <section>
        <h2>一、竞品 POI 数据</h2>
        <table class="data-table">
          <tr><td class="td-label">数据来源</td><td>高德地图开放平台 POI 搜索 API（/v3/place/text）及详情 API（/v3/place/detail）</td></tr>
          <tr><td class="td-label">覆盖范围</td><td>搜索接口返回的公开商户信息，不包含未在高德注册的个体工商户、临时摊点</td></tr>
          <tr><td class="td-label">更新频率</td><td>按需采集（首次全量 + 后续增量），高德数据本身有数天至数周的更新延迟</td></tr>
          <tr><td class="td-label">包含字段</td><td>名称、坐标、分类、评分、人均消费、营业时间、商圈归属、标签、图片数</td></tr>
          <tr><td class="td-label">覆盖率</td><td>约 73% 的 POI 返回人均消费，96% 返回营业时间，72% 返回商圈信息</td></tr>
          <tr><td class="td-label">局限性</td><td>新开业门店可能有 2-4 周收录延迟；已关闭门店可能未被及时清理；连锁品牌加盟店 vs 直营店不做区分</td></tr>
        </table>
      </section>

      <section>
        <h2>二、人口数据</h2>
        <table class="data-table">
          <tr><td class="td-label">数据来源</td><td>2020年第七次全国人口普查（区县级常住人口）+ 省级年均人口增长率推算</td></tr>
          <tr><td class="td-label">空间分辨率</td><td>H3 分辨率9六边形网格（边长约 200m），区县级 uniform 分配</td></tr>
          <tr><td class="td-label">空间误差</td><td>区县内部分配采用均匀分布假设，与实际人口聚集模式存在 ±5%~10% 偏差</td></tr>
          <tr><td class="td-label">时效性</td><td>2020年普查基准 + 推算至 2026 年（年均增长率 -0.03%），未考虑区县间人口迁移</td></tr>
          <tr><td class="td-label">局限性</td><td>不支持昼夜人口差异（工作人口 vs 居住人口）；不反映短期人口流动（旅游、学生假期等）</td></tr>
        </table>
      </section>

      <section>
        <h2>三、评分算法</h2>
        <p><strong>核心模型</strong>：加权多因子评分（Weighted Sum Model），综合 40+ 个 KPI 指标。</p>
        <p><strong>KPI 分类</strong>：</p>
        <ul>
          <li><strong>几何类</strong>（距离/覆盖/盲区）：基于候选点与竞品门店的球面距离计算</li>
          <li><strong>竞争类</strong>（竞品密度/蚕食指数/甜点区间）：基于商业体元数据的聚合统计</li>
          <li><strong>密度类</strong>（人口/商业/居住密度）：基于人口栅格与 POI 密度</li>
          <li><strong>区位类</strong>（交通/停车/商圈）：基于商业体标签与空间查询</li>
        </ul>
        <p><strong>权重体系</strong>：各行业采用不同的 KPI 权重向量，如：</p>
        <ul>
          <li>便利店：距离 35% + 竞争 25% + 密度 25% + 盲区 15%</li>
          <li>茶饮：客流 30% + 竞争甜点 25% + 外卖覆盖 25% + 可见度 20%</li>
          <li>酒店：交通可达 28% + 商业密度 22% + 集群度 25% + 品牌保护 15% + 临街加分 10%</li>
        </ul>
        <p><strong>归一化</strong>：原始 KPI 值通过线性/分段/甜点函数归一化至 [0,1] 区间后加权求和，最终评分 = 加权总分 × 100。</p>
      </section>

      <section>
        <h2>四、Huff 引力模型</h2>
        <p>营收估算与市场份额推演基于 Huff 引力模型：</p>
        <p class="formula">P<sub>ij</sub> = A<sub>j</sub><sup>α_area</sup> × B<sub>j</sub><sup>α_brand</sup> / D<sub>ij</sub><sup>λ</sup></p>
        <p>其中 A 为门店面积、B 为品牌力、D 为顾客-门店距离、λ/α_area/α_brand 为行业参数。</p>
        <p><strong>参数来源</strong>：行业基准值（零售选址文献 + 行业经验校准），尚未基于实际经营数据进行 MLE 标定。</p>
        <p><strong>模型假设</strong>：顾客选择仅取决于距离、面积、品牌三个因素；消费需求均匀分布；所有竞品信息对顾客完全透明。实际消费行为可能存在显著偏差。</p>
      </section>

      <section>
        <h2>五、置信度标注</h2>
        <p>每条选址建议均附带置信度标签：</p>
        <ul>
          <li><span class="confidence-tag high">高置信度</span>：核心数据覆盖率 >80%，关键 KPI 均有真实数据支撑</li>
          <li><span class="confidence-tag medium">中置信度</span>：部分 KPI 使用估算值替代，数据存在中等缺口</li>
          <li><span class="confidence-tag low">低置信度</span>：多项关键数据缺失，建议结合实地考察判断</li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.legal-page { min-height: 100vh; background: var(--color-bg-primary); padding: var(--space-8) var(--space-4); }
.legal-container { max-width: 720px; margin: 0 auto; }
.legal-container h1 { font-size: var(--text-2xl); font-weight: var(--font-bold); margin-bottom: var(--space-1); }
.legal-update { font-size: var(--text-xs); color: var(--color-text-tertiary); margin-bottom: var(--space-6); }
.legal-container section { margin-bottom: var(--space-6); }
.legal-container h2 { font-size: var(--text-base); font-weight: var(--font-semibold); margin-bottom: var(--space-2); color: var(--color-text-primary); }
.legal-container p, .legal-container li { font-size: var(--text-sm); color: var(--color-text-secondary); line-height: 1.7; }
.legal-container ul { padding-left: var(--space-4); display: flex; flex-direction: column; gap: var(--space-1); margin-top: var(--space-1); }
.data-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); margin-top: var(--space-2); }
.data-table td { padding: 8px 0; border-bottom: 1px solid var(--color-border-light); vertical-align: top; line-height: 1.6; }
.td-label { color: var(--color-text-primary); font-weight: var(--font-medium); width: 100px; flex-shrink: 0; }
.formula { font-family: var(--font-mono); font-size: var(--text-base); text-align: center; padding: var(--space-3); background: var(--color-bg-secondary); border-radius: var(--radius-sm); margin: var(--space-2) 0; }
.confidence-tag { font-size: var(--text-xs); padding: 1px 8px; border-radius: var(--radius-full); font-weight: var(--font-medium); }
.confidence-tag.high { background: rgba(34,197,94,0.12); color: #16a34a; }
.confidence-tag.medium { background: rgba(245,158,11,0.12); color: #d97706; }
.confidence-tag.low { background: rgba(239,68,68,0.12); color: #dc2626; }
</style>
