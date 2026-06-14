<template>
  <div class="map-wrapper">
    <div v-if="error" class="map-error">
      <AppIcon name="alert" :size="28" color="var(--color-error)" />
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
import AppIcon from '@/components/shared/AppIcon.vue'

const props = defineProps<{
  points: { lng: number; lat: number; name?: string }[]
  markerGroups?: { groupId: string; points: { lng: number; lat: number; name?: string; label?: string; color?: string }[] }[]
  center?: [number, number]
  zoom?: number
  clickEnabled?: boolean
}>()

const emit = defineEmits<{
  ready: [map: any]
  mapClick: [lngLat: { lng: number; lat: number }]
}>()

const mapId = 'map-' + Math.random().toString(36).substring(2, 8)
const { initMap, getMap, fitBounds, clearOverlays, addClusterLayer, addMarkers, addMarkersByGroup } = useAmap()
const loading = ref(true)
const error = ref<string | null>(null)

let clickHandler: any = null

onMounted(async () => {
  try {
    const map = await initMap(mapId, props.center, props.zoom)
    emit('ready', map)
    renderPoints()
    if (props.markerGroups && props.markerGroups.length) renderMarkerGroups()
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

function renderMarkerGroups() {
  if (props.markerGroups && props.markerGroups.length) {
    addMarkersByGroup(props.markerGroups)
  }
}

function renderPoints() {
  if (!props.points.length) return
  fitBounds(props.points)
  clearOverlays()
  if (props.points.length > 200) {
    addClusterLayer(props.points)
  } else {
    addMarkers(props.points)
  }
}

watch(
  () => props.markerGroups,
  (newVal) => {
    if (!loading.value && newVal) renderMarkerGroups()
  },
  { deep: true }
)

watch(
  () => props.points,
  () => {
    if (!loading.value && props.points) renderPoints()
  }
)

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
  gap: var(--space-2);
  background: var(--color-error-bg);
  color: var(--color-error);
}

.map-error h3 {
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
}

.map-error p {
  font-size: var(--text-sm);
}

.map-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  background: rgba(242, 242, 247, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 10;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

@media (max-width: 768px) {
  .map-container {
    min-height: 300px;
  }
}
</style>
