<template>
  <svg class="app-icon" :style="{ width: size + 'px', height: size + 'px', color }" aria-hidden="true">
    <use :href="'/icons.svg#icon-' + name" />
  </svg>
</template>

<script setup lang="ts">
defineProps<{
  name: string
  size?: number
  color?: string
}>()
</script>

<style scoped>
.app-icon {
  display: inline-block;
  flex-shrink: 0;
  vertical-align: middle;
}
</style>
