<template>
  <div class="map-wrapper">
    <div v-if="error" class="map-error">
      <h3>地图加载失败</h3>
      <p>{{ error }}</p>
    </div>
    <div v-show="!error" :id="mapId" class="map-container"></div>
    <div v-if="loading" class="map-loading">
      <div class="spinner"></div>
      <span>加载地图中...</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useAmap } from '@/composables/useAmap'

const props = defineProps<{
  points: { lng: number; lat: number; name?: string }[]
  center?: [number, number]
  zoom?: number
  clickEnabled?: boolean
}>()

const emit = defineEmits<{
  ready: [map: any]
  mapClick: [lngLat: { lng: number; lat: number }]
}>()

const mapId = 'map-' + Math.random().toString(36).substring(2, 8)
const { initMap, getMap, fitBounds, clearOverlays, addClusterLayer, addMarkers } = useAmap()
const loading = ref(true)
const error = ref<string | null>(null)

let clickHandler: any = null

onMounted(async () => {
  try {
    const map = await initMap(mapId, props.center, props.zoom)
    emit('ready', map)
    renderPoints()
    toggleMapClick(map, props.clickEnabled ?? false)
  } catch (e: any) {
    error.value = e.message || '地图加载失败'
  } finally {
    loading.value = false
  }
})

function toggleMapClick(map: any, enabled: boolean) {
  if (clickHandler) {
    map.off('click', clickHandler)
    clickHandler = null
  }
  if (enabled) {
    clickHandler = (e: any) => {
      emit('mapClick', { lng: e.lnglat.getLng(), lat: e.lnglat.getLat() })
    }
    map.on('click', clickHandler)
  }
}

function renderPoints() {
  if (!props.points.length) return
  fitBounds(props.points)
  clearOverlays()
  // 2.5: Use clustering for >200 points, simple markers otherwise
  if (props.points.length > 200) {
    addClusterLayer(props.points)
  } else {
    addMarkers(props.points)
  }
}

// Watch points changes
watch(
  () => props.points,
  () => {
    if (!loading.value && props.points) renderPoints()
  }
)

// Watch clickEnabled to dynamically toggle map click
watch(
  () => props.clickEnabled,
  (enabled) => {
    const map = getMap()
    if (!map) return
    toggleMapClick(map, enabled ?? false)
  }
)
</script>

<style scoped>
.map-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}
.map-container {
  width: 100%;
  height: 100%;
}
.map-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: #fff5f5;
  color: #ff4d4f;
}
.map-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.7);
  z-index: 10;
}
.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e8e8e8;
  border-top-color: #1677ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 8px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
@media (max-width: 768px) {
  .map-container {
    min-height: 300px;
  }
}