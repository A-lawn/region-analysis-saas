<template>
  <Teleport to="body">
    <div class="consent-overlay">
      <div class="consent-card">
        <div class="consent-icon">
          <AppIcon name="alert" :size="32" color="var(--color-warning)" />
        </div>
        <h3>知情同意</h3>
        <div class="consent-body">
          <p><strong>区域数据分析平台</strong>提供的选址决策建议是基于空间数据模型的计算结果，旨在辅助您做出商业决策。</p>
          <ul>
            <li>本工具输出的评分、营收估算、市占率等指标为<strong>模拟值</strong>，具有不确定性，不构成对未来经营结果的承诺或保证</li>
            <li>竞品数据、人口数据等存在覆盖缺口和时效滞后，具体偏差已在分析结果中标注</li>
            <li><strong>最终选址决策权在您手中</strong>，平台不对任何经营损失承担法律责任</li>
            <li>继续使用即表示您已理解并接受以上声明</li>
          </ul>
        </div>
        <div class="consent-actions">
          <button class="btn btn-primary" @click="$emit('agree')">我已理解，开始使用</button>
          <button class="btn btn-text" @click="goBack">返回</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import AppIcon from '@/components/shared/AppIcon.vue'
defineEmits<{ agree: [] }>()
const router = useRouter()
function goBack() { router.push({ name: 'upload' }) }
</script>

<style scoped>
.consent-overlay {
  position: fixed; inset: 0; z-index: 2000;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
}
.consent-card {
  background: var(--color-bg-card); border-radius: var(--radius-lg);
  box-shadow: 0 25px 80px rgba(0,0,0,0.18);
  max-width: 480px; width: 92vw; padding: var(--space-6);
  text-align: center;
}
.consent-icon { margin-bottom: var(--space-3); }
.consent-card h3 { font-size: var(--text-lg); margin-bottom: var(--space-4); }
.consent-body { text-align: left; font-size: var(--text-sm); color: var(--color-text-secondary); line-height: 1.6; }
.consent-body ul { padding-left: var(--space-4); margin-top: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); }
.consent-actions { margin-top: var(--space-5); display: flex; flex-direction: column; gap: var(--space-2); align-items: center; }
</style>
