import { latLngToCell, cellToBoundary, gridDisk, UNITS } from "h3-js";

/**
 * Convert a lat/lng coordinate to an H3 index.
 * Resolution 9 = ~174m edge, good for urban-level analysis.
 */
export function pointToH3(lng: number, lat: number, resolution: number = 9): string {
  return latLngToCell(lat, lng, resolution);
}

/**
 * Get the boundary vertices of an H3 cell for rendering a hexagon on a map.
 * Returns [lng, lat] pairs.
 */
export function h3ToGeoBoundary(h3Index: string): [number, number][] {
  return cellToBoundary(h3Index).map(([lat, lng]) => [lng, lat]);
}

/**
 * Aggregate spatial points by H3 hexagons.
 * Returns each hex with its point count and boundary.
 */
export interface H3Hexagon {
  h3Index: string;
  count: number;
  boundary: [number, number][];
  areaKm2: number;
}

export function aggregateByH3(
  points: { lng: number; lat: number }[],
  resolution: number = 9
): H3Hexagon[] {
  const hexMap = new Map<string, number>();

  for (const p of points) {
    const h3 = pointToH3(p.lng, p.lat, resolution);
    hexMap.set(h3, (hexMap.get(h3) || 0) + 1);
  }

  const result: H3Hexagon[] = [];
  for (const [h3Index, count] of hexMap) {
    result.push({
      h3Index,
      count,
      boundary: h3ToGeoBoundary(h3Index),
      areaKm2: (UNITS as any).km2[h3Index],
    });
  }

  return result;
}

/**
 * Get all H3 indices within a given radius from a center point.
 * Useful for spatial queries around a candidate site.
 */
export function h3Neighbors(h3Index: string, ringSize: number = 1): string[] {
  return gridDisk(h3Index, ringSize);
}

