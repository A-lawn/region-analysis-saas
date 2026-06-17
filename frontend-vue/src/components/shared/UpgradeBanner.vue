<template>
  <div class="upgrade-banner">
    <div class="upgrade-banner-content">
      <div class="upgrade-text">
        <AppIcon name="star" :size="18" color="var(--color-accent)" />
        <span>升级专业版，解锁自有数据上传与完整分析能力</span>
      </div>
      <router-link to="/pricing" class="btn btn-sm btn-primary upgrade-btn">了解更多</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppIcon from '@/components/shared/AppIcon.vue'
</script>

<style scoped>
.upgrade-banner {
  background: linear-gradient(135deg, rgba(0,122,255,0.08), rgba(0,122,255,0.03));
  border: 1px solid rgba(0,122,255,0.15);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-4);
}
.upgrade-banner-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.upgrade-text {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}
.upgrade-btn {
  flex-shrink: 0;
}
</style>
