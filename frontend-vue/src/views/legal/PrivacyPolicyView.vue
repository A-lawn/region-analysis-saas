<template>
  <div class="legal-page">
    <div class="legal-container">
      <h1>隐私政策</h1>
      <p class="legal-update">最后更新日期：2026年6月17日</p>

      <section>
        <h2>一、我们收集的信息</h2>
        <p>区域数据分析平台（以下简称"本平台"）在您使用选址决策服务时，可能收集以下信息：</p>
        <ul>
          <li><strong>账户信息</strong>：注册时提供的电子邮箱地址，用于身份识别与密码重置。</li>
          <li><strong>上传数据</strong>：您上传的 Excel/CSV 文件中的门店坐标、名称、地址等空间数据。</li>
          <li><strong>候选点位</strong>：您在选址地图上手动标注的候选开店位置坐标。</li>
          <li><strong>使用日志</strong>：API 调用记录、分析任务执行记录（不含业务数据内容）。</li>
          <li><strong>合规记录</strong>：注册时记录您同意协议的客户端 IP 地址与浏览器 User-Agent，仅用于法律合规追溯，不对外展示或共享。</li>
        </ul>
        <p>本平台<strong>不收集</strong>：个人身份信息（身份证号、手机号）、支付信息、设备指纹、位置追踪数据。</p>
      </section>

      <section>
        <h2>二、信息的使用方式</h2>
        <ul>
          <li>账户信息仅用于登录认证与密码重置邮件的发送。</li>
          <li>上传的空间数据仅用于您指定项目的选址分析计算，<strong>不会</strong>被用于其他用户的分析。</li>
          <li>分析结果（评分、营收估算等）仅在您当前会话中展示，不会主动共享给第三方。</li>
          <li>注册时记录的 IP 地址与 User-Agent 仅用于合规存证（证明您本人同意协议），不会被用于用户画像或其他分析目的。</li>
          <li>聚合后的匿名统计数据（如行业平均评分分布）可能用于模型优化，但无法追溯到单个用户。</li>
        </ul>
      </section>

      <section>
        <h2>三、数据存储与安全</h2>
        <ul>
          <li>所有数据存储在境内的 PostgreSQL 数据库中，不传输至境外服务器。</li>
          <li>用户密码采用 bcrypt 加盐哈希存储，不可逆。</li>
          <li>JWT 签名密钥采用 AES-256-GCM 信封加密后存储于数据库，密钥与数据物理分离。</li>
          <li>API 请求日志中的敏感字段（邮箱、手机号等）自动执行脱敏处理。</li>
        </ul>
      </section>

      <section>
        <h2>四、第三方数据来源</h2>
        <p>本平台的竞品 POI 数据通过高德地图开放 API 获取。人口数据基于第七次全国人口普查公开数据推算。所有第三方数据均来自合法公开渠道。</p>
      </section>

      <section>
        <h2>五、您的权利</h2>
        <ul>
          <li><strong>查阅权</strong>：您可随时查看已上传的项目数据与分析结果。</li>
          <li><strong>删除权</strong>：您可删除任意项目及其关联的所有空间数据。删除操作为软删除（30天可恢复），逾期后永久清除。</li>
          <li><strong>账户注销</strong>：请联系管理员申请账户注销，注销后所有关联数据将被永久删除。</li>
        </ul>
      </section>

      <section>
        <h2>六、Cookie 与追踪</h2>
        <p>本平台当前不使用 Cookie、本地存储或任何形式的用户行为追踪技术。登录状态通过 JWT Token 在请求头中传递。</p>
      </section>

      <section>
        <h2>七、政策更新</h2>
        <p>如本隐私政策发生变更，我们将在平台上发布更新版本。重大变更可能通过注册邮箱通知。</p>
      </section>

      <section>
        <h2>八、联系方式</h2>
        <p>如对本隐私政策有任何疑问，请联系平台管理员。</p>
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
