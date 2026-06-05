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
  border: 1px solid #e8e8e8;
  border-radius: 8px;
}
.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.preview-table th,
.preview-table td {
  padding: 8px 12px;
  border-bottom: 1px solid #f0f0f0;
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preview-table th {
  background: #fafafa;
  font-weight: 600;
  position: sticky;
  top: 0;
}
</style>
