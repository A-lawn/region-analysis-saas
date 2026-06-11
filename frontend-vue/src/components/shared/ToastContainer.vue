<template>
  <div class="toast-container">
    <transition-group name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast-item"
        :class="toast.type"
      >
        <span class="toast-icon">
          <AppIcon v-if="toast.type === 'success'" name="check" :size="16" />
          <AppIcon v-else-if="toast.type === 'error'" name="alert" :size="16" />
          <AppIcon v-else name="info" :size="16" />
        </span>
        {{ toast.message }}
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { useToast } from '@/composables/useToast'
import AppIcon from '@/components/shared/AppIcon.vue'

const { toasts } = useToast()
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: calc(var(--nav-height) + var(--space-3));
  right: var(--space-5);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  pointer-events: none;
}

.toast-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  box-shadow: var(--shadow-elevated);
  backdrop-filter: var(--glass-blur-light);
  -webkit-backdrop-filter: var(--glass-blur-light);
  min-width: 240px;
  pointer-events: auto;
}

.toast-icon {
  flex-shrink: 0;
  display: flex;
}

.toast-item.success {
  background: var(--color-success-bg);
  color: var(--color-success);
  border: 1px solid rgba(52, 199, 89, 0.12);
}

.toast-item.error {
  background: var(--color-error-bg);
  color: var(--color-error);
  border: 1px solid rgba(255, 59, 48, 0.12);
}

.toast-item.info {
  background: var(--color-accent-subtle);
  color: var(--color-accent);
  border: 1px solid rgba(0, 122, 255, 0.12);
}

.toast-enter-active {
  transition: all var(--duration-normal) var(--ease-spring);
}

.toast-leave-active {
  transition: all var(--duration-fast) var(--ease-smooth);
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(-12px) scale(0.96);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
