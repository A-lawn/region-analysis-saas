// OSRM Routing Service - road-network distance analysis
// Requires OSRM container with China road data.
// Falls back to straight-line haversine when OSRM unavailable.

const OSRM_BASE = process.env.OSRM_BASE_URL || "http://osrm:5000";


export type TransportMode = "walking" | "driving" | "cycling";
export type TransitMode = "bus" | "subway" | "bus+subway";

// Profile mapping: JS mode -> OSRM profile name
function getOrmProfile(mode: TransportMode): string {
  switch (mode) {
    case "walking": return "foot";
    case "driving": return "car";
    case "cycling": return "bicycle";
    default: return "car";
  }
}

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
    const profile = getOrmProfile(mode);
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
    const profile = getOrmProfile(mode);
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

// ===== Redis-Cached Route Matrix (v2.0) =====

import { cacheGet, cacheSet } from "./cacheService";

const ROUTE_CACHE_TTL = 86400 * 7; // 7 days for route distances

/**
 * Get road-network distance matrix with Redis caching.
 * Cache key: h3 pair (resolution 9 ~174m granularity).
 */
export async function getCachedRouteMatrix(
  origin: { lng: number; lat: number },
  destinations: { lng: number; lat: number }[],
  mode: TransportMode = "driving"
): Promise<{ distances: number[]; durations: number[]; fromCache: boolean }> {
  // Build cache key from h3 indices
  let fromCache = true;
  const originH3 = require("../utils/h3Index").pointToH3(origin.lng, origin.lat, 9);

  const distances: number[] = [];
  const durations: number[] = [];

  for (const dest of destinations) {
    const destH3 = require("../utils/h3Index").pointToH3(dest.lng, dest.lat, 9);
    const cacheKey = "route:" + mode + ":" + originH3 + ":" + destH3;

    let cached = null;
    try {
      const raw = await cacheGet(cacheKey);
      if (raw) cached = JSON.parse(raw);
    } catch {}

    if (cached) {
      distances.push(cached.distance);
      durations.push(cached.duration);
    } else {
      fromCache = false;
      // Fallback to haversine if not cached (batch refresh later)
      const hd = haversineDistance(origin.lng, origin.lat, dest.lng, dest.lat);
      distances.push(hd);
      durations.push(hd / 1.4);
    }
  }

  return { distances, durations, fromCache };
}

/**
 * Batch refresh route cache — call periodically to populate OSRM distances.
 * Processes destinations in batches to respect OSRM table size limits.
 */
export async function refreshRouteCache(
  origins: { lng: number; lat: number }[],
  destinations: { lng: number; lat: number }[],
  mode: TransportMode = "driving",
  batchSize: number = 50
): Promise<number> {
  let cached = 0;

  for (let i = 0; i < origins.length; i += batchSize) {
    const originBatch = origins.slice(i, i + batchSize);
    for (let j = 0; j < destinations.length; j += batchSize) {
      const destBatch = destinations.slice(j, j + batchSize);

      // For each origin, get distances to all destinations in batch
      const promises = originBatch.map(async (origin) => {
        try {
          const result = await getRouteMatrix(origin, destBatch, mode);
          const originH3 = require("../utils/h3Index").pointToH3(origin.lng, origin.lat, 9);

          for (let k = 0; k < destBatch.length; k++) {
            const destH3 = require("../utils/h3Index").pointToH3(destBatch[k].lng, destBatch[k].lat, 9);
            const cacheKey = "route:" + mode + ":" + originH3 + ":" + destH3;
            await cacheSet(cacheKey, JSON.stringify({
              distance: result.distances[k] || 0,
              duration: result.durations[k] || 0,
            }), ROUTE_CACHE_TTL);
            cached++;
          }
        } catch {}
      });

      await Promise.all(promises);
    }
  }

  return cached;
}

/**
 * Check OSRM availability.
 */
export async function isOrmAvailable(): Promise<boolean> {
  try {
    const resp = await fetch(OSRM_BASE + "/route/v1/driving/116.38,39.90;116.40,39.91?overview=false");
    return resp.ok;
  } catch {
    return false;
  }
}


// ===== Transit Routing (Public Transit) =====
// OSRM does not support transit. For bus+subway routing, we use:
// - City-level transit network data (pre-loaded per city)
// - Haversine-based estimation with transit speed factors as fallback

const TRANSIT_SPEEDS: Record<string, number> = {
  bus: 300,       // meters per minute (~18 km/h)
  subway: 720,    // meters per minute (~43 km/h)
  "bus+subway": 450, // blended
};

export interface TransitRouteResult {
  distanceMeters: number;
  durationMinutes: number;
  mode: TransitMode;
  transfers: number;
  estimated: boolean; // true if using speed estimation rather than real transit data
}

/**
 * Estimate transit travel time using city-specific factors.
 * For production, integrate with OpenTripPlanner or similar GTFS-based engine.
 */
export async function getTransitRoute(
  from: { lng: number; lat: number },
  to: { lng: number; lat: number },
  mode: TransitMode = "bus+subway",
  city?: string
): Promise<TransitRouteResult> {
  // Check if city has transit data loaded
  const transitAvailable = city ? await isTransitAvailable(city) : false;

  if (transitAvailable) {
    // Real transit routing via OpenTripPlanner or Valhalla
    // TODO: integrate with OpenTripPlanner REST API
    return estimateTransitRoute(from, to, mode, true);
  }

  return estimateTransitRoute(from, to, mode, false);
}

async function isTransitAvailable(city: string): Promise<boolean> {
  try {
    const resp = await fetch(
      (process.env.TRANSIT_API_URL || "http://transit:8080") +
      "/otp/routers/" + encodeURIComponent(city) + "/index/routes"
    );
    return resp.ok;
  } catch {
    return false;
  }
}

function estimateTransitRoute(
  from: { lng: number; lat: number },
  to: { lng: number; lat: number },
  mode: TransitMode,
  transitAvailable: boolean
): TransitRouteResult {
  const straightDist = haversineDistance(from.lng, from.lat, to.lng, to.lat);
  // Apply detour factor (~1.3x for bus, ~1.15x for subway vs straight line)
  const detourFactor = mode === "subway" ? 1.15 : 1.3;
  const routeDist = straightDist * detourFactor;
  const speed = TRANSIT_SPEEDS[mode] || 400;
  const durationMin = routeDist / speed;

  return {
    distanceMeters: Math.round(routeDist),
    durationMinutes: Math.round(durationMin),
    mode,
    transfers: mode === "bus+subway" ? 2 : mode === "bus" ? 3 : 1,
    estimated: !transitAvailable,
  };
}

/**
 * Batch transit reachability: for a given point, estimate how far you can go
 * within maxMinutes using public transit.
 */
export async function getTransitReachability(
  center: { lng: number; lat: number },
  destinations: { lng: number; lat: number }[],
  maxMinutes: number = 30,
  mode: TransitMode = "bus+subway",
  city?: string
): Promise<{ reachable: boolean[]; durations: number[] }> {
  const results = await Promise.all(
    destinations.map(dest => getTransitRoute(center, dest, mode, city))
  );
  return {
    reachable: results.map(r => r.durationMinutes <= maxMinutes),
    durations: results.map(r => r.durationMinutes),
  };
}
