<template>
  <div class="pricing-view">
    <div class="pricing-hero">
      <h1>选择适合你的方案</h1>
      <p>从快速分析到自有数据深度洞察，满足不同阶段的选址需求</p>
    </div>

    <div class="pricing-grid">
      <!-- Free tier -->
      <div class="pricing-card">
        <div class="plan-header">
          <h2>免费版</h2>
          <p class="plan-price">免费</p>
          <p class="plan-desc">适合初步选址探索</p>
        </div>
        <ul class="plan-features">
          <li><AppIcon name="check" :size="14" color="var(--color-success)" /> 快速选址分析</li>
          <li><AppIcon name="check" :size="14" color="var(--color-success)" /> 基于平台公开 POI 数据</li>
          <li><AppIcon name="check" :size="14" color="var(--color-success)" /> 候选点位打分排名</li>
          <li><AppIcon name="check" :size="14" color="var(--color-success)" /> 分析报告导出</li>
          <li><AppIcon name="check" :size="14" color="var(--color-success)" /> 分析记录保存</li>
          <li class="feature-disabled"><AppIcon name="x" :size="14" color="var(--color-text-tertiary)" /> 上传自有数据</li>
          <li class="feature-disabled"><AppIcon name="x" :size="14" color="var(--color-text-tertiary)" /> 覆盖分析 / 热力图</li>
          <li class="feature-disabled"><AppIcon name="x" :size="14" color="var(--color-text-tertiary)" /> 聚类分析 / H3 栅格</li>
        </ul>
        <div class="plan-action">
          <button class="btn btn-outline btn-block" disabled>当前方案</button>
        </div>
      </div>

      <!-- Pro tier -->
      <div class="pricing-card pricing-pro">
        <div class="plan-badge">推荐</div>
        <div class="plan-header">
          <h2>专业版</h2>
          <p class="plan-price">联系客服</p>
          <p class="plan-desc">适合自有数据的深度分析</p>
        </div>
        <ul class="plan-features">
          <li><AppIcon name="check" :size="14" color="var(--color-success)" /> 免费版全部功能</li>
          <li><AppIcon name="check" :size="14" color="var(--color-success)" /> 上传自有数据（Excel/CSV）</li>
          <li><AppIcon name="check" :size="14" color="var(--color-success)" /> 完整覆盖分析</li>
          <li><AppIcon name="check" :size="14" color="var(--color-success)" /> 热力图 / 聚类分析</li>
          <li><AppIcon name="check" :size="14" color="var(--color-success)" /> H3 六边形等值区域</li>
          <li><AppIcon name="check" :size="14" color="var(--color-success)" /> 选址优化 / 博弈模型</li>
          <li><AppIcon name="check" :size="14" color="var(--color-success)" /> 行业基准对标</li>
          <li><AppIcon name="check" :size="14" color="var(--color-success)" /> 完整分析报告</li>
        </ul>
        <div class="plan-action">
          <button class="btn btn-primary btn-block" @click="showContact = true">升级专业版</button>
        </div>
      </div>
    </div>

    <!-- Contact modal -->
    <Teleport to="body">
      <div v-if="showContact" class="contact-overlay" @click.self="showContact = false">
        <div class="contact-card">
          <h3>升级专业版</h3>
          <p>专业版目前通过人工开通，请联系管理员：</p>
          <div class="contact-info">
            <div class="contact-item">
              <AppIcon name="mail" :size="16" color="var(--color-accent)" />
              <span>发送邮件至：<strong>admin@example.com</strong></span>
            </div>
            <p class="contact-note">请在邮件中注明您的注册邮箱和申请原由，我们将在 1 个工作日内为您开通。</p>
          </div>
          <button class="btn btn-outline" @click="showContact = false">关闭</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'

const showContact = ref(false)
</script>

<style scoped>
.pricing-view {
  max-width: 900px;
  margin: 0 auto;
  padding: var(--space-8) var(--space-4);
}

.pricing-hero {
  text-align: center;
  margin-bottom: var(--space-8);
}

.pricing-hero h1 {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  margin-bottom: var(--space-2);
}

.pricing-hero p {
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
}

.pricing-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-6);
}

.pricing-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  position: relative;
}

.pricing-pro {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px var(--color-accent), var(--shadow-card);
}

.plan-badge {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-accent);
  color: #fff;
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  padding: 2px 12px;
  border-radius: var(--radius-full);
}

.plan-header {
  text-align: center;
  margin-bottom: var(--space-5);
}

.plan-header h2 {
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  margin-bottom: var(--space-1);
}

.plan-price {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--color-accent);
  margin-bottom: var(--space-1);
}

.plan-desc {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
}

.plan-features {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.plan-features li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-primary);
}

.feature-disabled {
  color: var(--color-text-tertiary) !important;
}

.plan-action {
  text-align: center;
}

/* Contact modal */
.contact-overlay {
  position: fixed; inset: 0; z-index: 2000;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
}

.contact-card {
  background: var(--color-bg-card);
  border-radius: var(--radius-lg);
  box-shadow: 0 25px 80px rgba(0,0,0,0.18);
  max-width: 420px; width: 92vw;
  padding: var(--space-6);
  text-align: center;
}

.contact-card h3 {
  font-size: var(--text-lg);
  margin-bottom: var(--space-3);
}

.contact-card p {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-4);
}

.contact-info {
  text-align: left;
  margin-bottom: var(--space-4);
}

.contact-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  margin-bottom: var(--space-2);
}

.contact-note {
  font-size: var(--text-xs) !important;
  color: var(--color-text-tertiary) !important;
}

@media (max-width: 640px) {
  .pricing-grid {
    grid-template-columns: 1fr;
  }
}
</style>
