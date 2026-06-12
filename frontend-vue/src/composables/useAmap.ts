import { ref } from 'vue'

const MAP_KEY = import.meta.env.VITE_AMAP_WEB_KEY || ''
const MAP_SECRET = import.meta.env.VITE_AMAP_SECRET || ''
;(window as any)._AMapSecurityConfig = { securityJsCode: MAP_SECRET }

const amapInstance = ref<any>(null)
const clusterLayer = ref<any>(null)
const heatmapLayer = ref<any>(null)
const loadPromise = ref<Promise<void> | null>(null)
const loadError = ref<Error | null>(null)

function loadScript(): Promise<void> {
  if (loadPromise.value) return loadPromise.value
  if (loadError.value) return Promise.reject(loadError.value)
  if ((window as any).AMap?.Map) {
    loadPromise.value = Promise.resolve()
    return loadPromise.value
  }

  loadPromise.value = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      loadError.value = new Error('地图加载超时，请检查网络连接')
      reject(loadError.value)
    }, 20000)

    ;(window as any)._amapInitCallback = () => {
      clearTimeout(timeout)
      resolve()
    }

    const script = document.createElement('script')
    script.src = 'https://webapi.amap.com/maps?v=2.0&key=' + MAP_KEY + '&plugin=AMap.HeatMap,AMap.MarkerClusterer,AMap.GeoJSON&callback=_amapInitCallback'
    script.onerror = () => {
      clearTimeout(timeout)
      loadError.value = new Error('地图脚本加载失败')
      reject(loadError.value)
    }
    document.head.appendChild(script)
  })
  return loadPromise.value
}

export function useAmap() {
  const overlayRefs = ref<any[]>([])

  async function initMap(containerId: string, center: [number, number] = [116.397, 39.909], zoom = 12) {
    await loadScript()
    if (amapInstance.value) {
      amapInstance.value.destroy()
    }
    amapInstance.value = new (window as any).AMap.Map(containerId, {
      zoom,
      center,
      mapStyle: 'amap://styles/light',
      resizeEnable: true,
    })
    return amapInstance.value
  }

  function getMap() {
    return amapInstance.value
  }

  function fitBounds(points: { lng: number; lat: number }[]) {
    const map = amapInstance.value
    if (!map || !points.length) return
    const valid = points.filter(
      (p) => !isNaN(p.lng) && !isNaN(p.lat) && isFinite(p.lng) && isFinite(p.lat)
    )
    if (!valid.length) return
    const sumLng = valid.reduce((s, p) => s + p.lng, 0)
    const sumLat = valid.reduce((s, p) => s + p.lat, 0)
    map.setZoomAndCenter(12, [sumLng / valid.length, sumLat / valid.length])
  }

  function clearOverlays() {
    // AMap clearMap() does not remove HeatMap canvas overlay, so remove explicitly
    if (heatmapLayer.value) {
      heatmapLayer.value.setMap(null)
      heatmapLayer.value = null
    }
    if (clusterLayer.value) {
      clusterLayer.value.setMap(null)
      clusterLayer.value = null
    }
    amapInstance.value?.clearMap()
    overlayRefs.value = []
  }

  function addClusterLayer(points: { lng: number; lat: number; name?: string }[]) {
    if (!amapInstance.value || !(window as any).AMap.MarkerClusterer) return
    if (clusterLayer.value) clusterLayer.value.setMap(null)
    const markers = points.map((p) => new (window as any).AMap.Marker({ position: [p.lng, p.lat], title: p.name || '' }))
    clusterLayer.value = new (window as any).AMap.MarkerClusterer(amapInstance.value, markers, { gridSize: 80, maxZoom: 18, averageCenter: true })
    return clusterLayer.value
  }

  function addMarkers(points: { lng: number; lat: number; name?: string; label?: string; color?: string }[]) {
    const map = amapInstance.value
    if (!map) return
    points.forEach((p) => {
      const opts: any = { position: [p.lng, p.lat], title: p.name || '' }
      if (p.label) {
        opts.label = {
          content: '<div style="background:' + (p.color || '#1677ff') + ';color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;white-space:nowrap">' + p.label + '</div>',
          offset: [0, -24],
        }
      } else if (p.name) {
        opts.label = { content: p.name, offset: [0, -20], direction: 'top' as any }
      }
      map.add(new (window as any).AMap.Marker(opts))
    })
  }

  function addHeatmapLayer(points: { lng: number; lat: number; weight: number }[]) {
    const map = amapInstance.value
    if (!map || !(window as any).AMap.HeatMap) return
    if (heatmapLayer.value) heatmapLayer.value.setMap(null)
    heatmapLayer.value = new (window as any).AMap.HeatMap(map, {
      radius: 25,
      opacity: [0, 0.8],
      gradient: { 0: 'rgba(102, 255, 0, 0)', 0.25: 'rgb(102,255,0)', 0.5: 'rgb(255,255,0)', 0.75: 'rgb(255,102,0)', 1: 'rgb(255,0,0)' },
    })
    heatmapLayer.value.setDataSet({ data: points.map(p => ({ lng: p.lng, lat: p.lat, count: Math.round(p.weight * 100) })), max: 100 })
    return heatmapLayer.value
  }

  function addGeoJSONPolygons(geojson: any, fillColor: string, strokeColor: string, fillOpacity = 0.3): number {
    const map = amapInstance.value
    if (!map || !geojson || !geojson.coordinates || !geojson.coordinates.length) return 0

    // Flatten MultiPolygon/Polygon geometry into simple polygon paths
    const polygons: [number, number][][] = []
    
    function extractPolygons(coords: any) {
      if (!coords) return
      if (coords.length && typeof coords[0][0] === 'number') {
        // Simple polygon: coords is [[lng,lat],...]
        polygons.push(coords.map((p: number[]) => [p[0], p[1]] as [number, number]))
      } else if (Array.isArray(coords[0])) {
        // Check if first element is a coordinate pair -> Polygon (possibly with holes)
        if (Array.isArray(coords[0][0]) && typeof coords[0][0][0] === 'number') {
          // Polygon: coords[0] is outer ring, coords[1+] are holes. Only render outer ring.
          polygons.push(coords[0].map((p: number[]) => [p[0], p[1]] as [number, number]))
        } else {
          // MultiPolygon: each element is a polygon (ring array)
          for (const poly of coords) {
            if (Array.isArray(poly) && poly.length > 0 && Array.isArray(poly[0]) && typeof poly[0][0] === 'number') {
              polygons.push(poly[0].map((p: number[]) => [p[0], p[1]] as [number, number]))
            }
          }
        }
      }
    }

    if (geojson.type === 'MultiPolygon') {
      for (const poly of geojson.coordinates) {
        extractPolygons(poly)
      }
    } else {
      extractPolygons(geojson.coordinates)
    }

    let rendered = 0
    for (const path of polygons) {
      if (path.length < 3) continue
      const poly = new (window as any).AMap.Polygon({
        path: path,
        fillColor,
        fillOpacity,
        strokeColor,
        strokeWeight: 2,
        strokeOpacity: 0.8,
      })
      poly.setMap(map)
      overlayRefs.value.push(poly)
      rendered++
    }
    return rendered
  }

  function addCircles(circles: { lng: number; lat: number; radius: number; fillColor?: string; label?: string }[]) {
    const map = amapInstance.value
    if (!map) return
    circles.forEach((c) => {
      const circle = new (window as any).AMap.CircleMarker({
        center: [c.lng, c.lat],
        radius: c.radius,
        fillColor: c.fillColor || '#1677ff',
        fillOpacity: 0.4,
        strokeColor: '#0958d9',
        strokeWeight: 2,
        zIndex: 10,
      })
      circle.setMap(map)
      overlayRefs.value.push(circle)
    })
  }

  function addPolygons(paths: [number, number][][], fillColor: string, fillOpacity = 0.5) {
    const map = amapInstance.value
    if (!map) return
    paths.forEach((path) => {
      const poly = new (window as any).AMap.Polygon({
        path: path,
        fillColor,
        fillOpacity,
        strokeColor: fillColor,
        strokeWeight: 1,
        strokeOpacity: 0.8,
      })
      poly.setMap(map)
      overlayRefs.value.push(poly)
    })
  }

  return {
    initMap, getMap, fitBounds, clearOverlays, loadScript,
    addClusterLayer, addMarkers, addHeatmapLayer, addGeoJSONPolygons, addCircles, addPolygons,
  }
}

