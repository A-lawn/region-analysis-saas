<template>
  <div class="preview-table-wrapper">
    <table class="preview-table" v-if="headers.length">
      <thead>
        <tr>
          <th v-for="(h, i) in headers" :key="i">{{ h || '列' + (i + 1) }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, ri) in rows" :key="ri">
          <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  headers: string[]
  rows: string[][]
}>()
</script>

<style scoped>
.preview-table-wrapper {
  overflow-x: auto;
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.preview-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--text-sm);
}

.preview-table th,
.preview-table td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview-table th {
  background: var(--color-bg-input);
  font-weight: var(--font-semibold);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary);
  position: sticky;
  top: 0;
}
</style>
