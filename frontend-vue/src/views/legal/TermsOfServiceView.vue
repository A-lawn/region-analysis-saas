<template>
  <div class="legal-page">
    <div class="legal-container">
      <h1>用户服务协议</h1>
      <p class="legal-update">最后更新日期：2026年6月17日</p>

      <section>
        <h2>一、服务说明</h2>
        <p>区域数据分析平台（以下简称"本平台"）是一个基于空间数据模型的选址决策辅助工具。本平台提供的服务包括但不限于：竞品分析、覆盖分析、选址评分、营收估算、博弈推演。</p>
        <p><strong>本平台不构成商业投资建议。</strong>所有分析结果均为基于数学模型和数据算法的输出，仅供用户在商业决策过程中参考。</p>
      </section>

      <section>
        <h2>二、用户责任</h2>
        <ul>
          <li>用户应自行核实上传数据的真实性与准确性。</li>
          <li>用户应对基于平台分析结果所做出的商业决策独立承担责任。</li>
          <li>用户不得利用本平台从事任何违法违规活动，包括但不限于：侵犯他人商业秘密、进行不正当竞争、传播虚假数据。</li>
        </ul>
      </section>

      <section>
        <h2>三、免责声明</h2>
        <ul>
          <li><strong>数据局限性</strong>：竞品 POI 数据来源于高德地图开放 API，可能存在覆盖缺口（未收录的个体工商户、新开业/已关闭门店）和时效滞后。人口数据基于第七次全国人口普查及推算，存在 ±5%~10% 的空间误差。</li>
          <li><strong>模型局限性</strong>：选址评分与营收估算基于 Huff 引力模型等空间经济模型。模型假设（如距离衰减服从指数分布、顾客选择仅取决于距离和品牌）可能与实际消费行为存在偏差。模型未考虑的因素包括但不限于：门店运营能力、供应链效率、季节性波动、突发公共事件、政策法规变化。</li>
          <li><strong>结果不确定性</strong>：评分、排名、营收预测等数值均为模拟值，不能作为未来经营业绩的承诺或保证。</li>
          <li><strong>责任豁免</strong>：在法律允许的最大范围内，平台方不对用户因使用或依赖本平台分析结果而产生的任何直接或间接损失（包括但不限于经营亏损、投资损失、机会成本）承担法律责任。</li>
        </ul>
      </section>

      <section>
        <h2>四、知识产权</h2>
        <ul>
          <li>本平台的算法模型、评分体系、KPI 归一化规则、行业决策洞察等知识产权归平台方所有。</li>
          <li>用户上传的业务数据（门店坐标、名称等）的知识产权仍归用户所有。</li>
          <li>未经平台方书面许可，用户不得反向工程、复制或向第三方分发平台的核心算法。</li>
        </ul>
      </section>

      <section>
        <h2>五、服务可用性</h2>
        <p>本平台将尽合理努力保证服务的连续性和稳定性，但不对因系统维护、网络故障、第三方 API 配额耗尽、不可抗力等原因导致的服务中断承担责任。</p>
      </section>

      <section>
        <h2>六、协议变更</h2>
        <p>本平台保留随时修改本协议的权利。修改后的协议将在平台上公布，重大变更可能通过注册邮箱通知。继续使用本平台服务即表示接受修改后的协议。</p>
      </section>

      <section>
        <h2>七、适用法律与争议解决</h2>
        <p>本协议适用中华人民共和国法律。因本协议引起的争议，双方应友好协商解决；协商不成的，提交平台方所在地有管辖权的人民法院裁决。</p>
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
</style>
