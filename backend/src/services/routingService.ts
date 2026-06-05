// OSRM Routing Service - road-network distance analysis
// Requires OSRM container with China road data.
// Falls back to straight-line haversine when OSRM unavailable.

const OSRM_BASE = process.env.OSRM_BASE_URL || "http://osrm:5000";

export type TransportMode = "walking" | "driving" | "cycling";

export interface IsochroneResult {
  geojson: any;
  center: { lng: number; lat: number };
  minutes: number;
  mode: TransportMode;
}

function haversineDistance(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function getIsochrone(
  lng: number, lat: number, minutes: number, mode: TransportMode = "walking"
): Promise<IsochroneResult | null> {
  try {
    const profile = mode === "walking" ? "foot" : mode;
    const url = OSRM_BASE + "/isochrone/v1/" + profile + "/" + lng + "," + lat + "?contours_minutes=" + minutes + "&polygons=true";
    const resp = await fetch(url);
    if (resp.ok) {
      const geojson = await resp.json();
      return { geojson, center: { lng, lat }, minutes, mode };
    }
  } catch {}
  return null;
}

export async function getRouteMatrix(
  origin: { lng: number; lat: number },
  destinations: { lng: number; lat: number }[],
  mode: TransportMode = "walking"
): Promise<{ distances: number[]; durations: number[] }> {
  try {
    const profile = mode === "walking" ? "foot" : mode;
    const coords = [origin, ...destinations].map(p => p.lng + "," + p.lat).join(";");
    const url = OSRM_BASE + "/table/v1/" + profile + "/" + coords + "?sources=0&annotations=distance,duration";
    const resp = await fetch(url);
    if (resp.ok) {
      const data: any = await resp.json();
      return {
        distances: data.distances?.[0]?.slice(1) || [],
        durations: data.durations?.[0]?.slice(1) || [],
      };
    }
  } catch {}
  return {
    distances: destinations.map(d => haversineDistance(origin.lng, origin.lat, d.lng, d.lat)),
    durations: destinations.map(d => haversineDistance(origin.lng, origin.lat, d.lng, d.lat) / 1.4),
  };
}

export async function batchRouteDistances(
  candidate: { lng: number; lat: number },
  points: { lng: number; lat: number }[],
  mode: TransportMode = "walking"
): Promise<number[]> {
  const { distances } = await getRouteMatrix(candidate, points, mode);
  return distances;
}

export async function computeWalkableRatio(
  candidate: { lng: number; lat: number },
  points: { lng: number; lat: number }[],
  maxWalkMeters: number = 800
): Promise<number> {
  const distances = await batchRouteDistances(candidate, points, "walking");
  if (!distances.length) return 0;
  const walkable = distances.filter(d => d <= maxWalkMeters).length;
  return walkable / distances.length;
}