import db from "../db";
import { config } from "../config";
import { cacheGet, cacheSet } from "./cacheService";
import crypto from "crypto";
import { batchCompetitionAnalysis } from "./competitionService";
import { generateAdvice } from "./decisionEngine";

export interface CoverageResult {
  coveredArea: number;
  totalBufferArea: number;
  uncoveredArea: number;
  coverageRatio: number;
  geojson: any;
}

export interface HeatmapPoint {
  lng: number;
  lat: number;
  weight: number;
}

export interface ClusterResult {
  clusters: { clusterId: number; pointCount: number; center: { lng: number; lat: number }; points: any[] }[];
  noise: number;
}

export interface SiteOptimizationOptions {
  candidates: { name: string; lng: number; lat: number }[];
  weights: Record<string, number> & { distanceWeight?: number; blindSpotWeight?: number; densityWeight?: number };
  topK: number;
}

// 4.3 Cache helper
async function cached<T>(key: string, ttl: number, compute: () => Promise<T>): Promise<T> {
  const cached = await cacheGet(key);
  if (cached) {
    return JSON.parse(cached) as T;
  }
  const result = await compute();
  await cacheSet(key, JSON.stringify(result), ttl);
  return result;
}

function paramsHash(params: Record<string, any>): string {
  return crypto.createHash("md5").update(JSON.stringify(params)).digest("hex").slice(0, 12);
}

export async function computeCoverage(projectId: string, radiusMeters: number): Promise<CoverageResult> {
  const cacheKey = `analysis:${projectId}:coverage:${radiusMeters}`;
  return cached(cacheKey, config.cache.ttl, async () => {
    // ...existing coverage computation...
    const result = await db.one(`
      WITH buffers AS (
        SELECT ST_Buffer(geom::geography, $1)::geometry AS buf_geom
        FROM spatial_points WHERE project_id = $2
      ),
      unioned AS (
        SELECT ST_Union(buf_geom) AS union_geom FROM buffers
      ),
      hull AS (
        SELECT ST_ConvexHull(ST_Collect(geom)) AS hull_geom
        FROM spatial_points WHERE project_id = $2
      )
      SELECT
        COALESCE(ST_Area(u.union_geom::geography), 0) AS covered_area,
        COALESCE(ST_Area(h.hull_geom::geography), 0) AS hull_area,
        ST_AsGeoJSON(u.union_geom) AS covered_geojson,
        ST_AsGeoJSON(ST_Difference(h.hull_geom, u.union_geom)) AS uncovered_geojson
      FROM unioned u, hull h
    `, [radiusMeters, projectId]);

    const coveredArea = parseFloat(result.covered_area || "0");
    const hullArea = parseFloat(result.hull_area || "1");
    const uncoveredArea = Math.max(0, hullArea - coveredArea);

    // Read project source_crs for coordinate output conversion
    const projectRow2 = await db.oneOrNone(
      "SELECT source_crs FROM analysis_projects WHERE id = $[pid]",
      { pid: projectId }
    );
    const projectCrs2 = (projectRow2?.source_crs || "gcj02") as string;

    // Convert GeoJSON coordinates from WGS-84 to project CRS for frontend (AMap)
    const { convertCoord } = require('../utils/coordTransform');
    function convertGeoJSONCoords(geom: any): any {
      if (!geom) return null;
      if (geom.type === 'Point') {
        const crs = convertCoord(geom.coordinates[0], geom.coordinates[1], 'wgs84', projectCrs2);
        return { ...geom, coordinates: [crs.lng, crs.lat] };
      }
      if (geom.type === 'Polygon' && geom.coordinates?.length) {
        return { ...geom, coordinates: geom.coordinates.map((ring: number[][]) =>
          ring.map((c: number[]) => {
            try { const crs = convertCoord(c[0], c[1], 'wgs84', projectCrs2); return [crs.lng, crs.lat]; }
            catch { return c; }
          })
        )};
      }
      if (geom.type === 'MultiPolygon' && geom.coordinates?.length) {
        return { ...geom, coordinates: geom.coordinates.map((poly: number[][][]) =>
          poly.map((ring: number[][]) =>
            ring.map((c: number[]) => {
              try { const crs = convertCoord(c[0], c[1], 'wgs84', projectCrs2); return [crs.lng, crs.lat]; }
              catch { return c; }
            })
          )
        )};
      }
      return geom;
    }

    return {
      coveredArea: Math.round(coveredArea),
      totalBufferArea: Math.round(hullArea),
      uncoveredArea: Math.round(uncoveredArea),
      coverageRatio: hullArea > 0 ? Math.round((coveredArea / hullArea) * 10000) / 100 : 0,
      geojson: {
        covered: result.covered_geojson ? convertGeoJSONCoords(JSON.parse(result.covered_geojson)) : null,
        uncovered: result.uncovered_geojson ? convertGeoJSONCoords(JSON.parse(result.uncovered_geojson)) : null,
      },
    };
  });
}

export async function computeKDEHeatmap(
  projectId: string,
  bandwidthMeters: number = 1000,
  gridSizeMeters: number = 500
): Promise<HeatmapPoint[]> {
  const cacheKey = `analysis:${projectId}:heatmap:${bandwidthMeters}:${gridSizeMeters}`;
  return cached(cacheKey, config.cache.ttl, async () => {
    const bandwidthDeg = bandwidthMeters / 111320.0;
    const gridSizeDeg = gridSizeMeters / 111320.0;
    const cutoffFactor = 3.0;

    const bounds = await db.one(
      "SELECT ST_XMin(ST_Collect(geom)) AS min_x, ST_XMax(ST_Collect(geom)) AS max_x, ST_YMin(ST_Collect(geom)) AS min_y, ST_YMax(ST_Collect(geom)) AS max_y FROM spatial_points WHERE project_id = $1",
      [projectId]
    );
    const minX = parseFloat(bounds.min_x), maxX = parseFloat(bounds.max_x);
    const minY = parseFloat(bounds.min_y), maxY = parseFloat(bounds.max_y);

    let pts = await db.manyOrNone(
      "SELECT ST_X(geom) AS x, ST_Y(geom) AS y FROM spatial_points WHERE project_id = $1",
      [projectId]
    );
    if (!pts || pts.length === 0) return [];

    if (pts.length > 3000) {
      const sampleRate = 3000 / pts.length;
      pts = pts.filter(() => Math.random() < sampleRate);
    }

    const extentX = maxX - minX;
    const extentY = maxY - minY;
    const maxGridCells = 80;
    const gridCols = Math.min(Math.ceil(extentX / gridSizeDeg), maxGridCells);
    const gridRows = Math.min(Math.ceil(extentY / gridSizeDeg), maxGridCells);

    const bucketSize = bandwidthDeg * cutoffFactor;
    const bucketMap = new Map<string, typeof pts>();

    for (const p of pts) {
      const bx = Math.floor((p.x as number - minX) / bucketSize);
      const by = Math.floor((p.y as number - minY) / bucketSize);
      const key = `${bx},${by}`;
      if (!bucketMap.has(key)) bucketMap.set(key, []);
      bucketMap.get(key)!.push(p);
    }

    const grid: { lng: number; lat: number; weight: number }[] = [];
    const normFactor = bandwidthDeg * Math.sqrt(2 * Math.PI);

    for (let row = 0; row <= gridRows; row++) {
      for (let col = 0; col <= gridCols; col++) {
        const gx = minX + col * gridSizeDeg;
        const gy = minY + row * gridSizeDeg;
        let w = 0;

        const gbx = Math.floor((gx - minX) / bucketSize);
        const gby = Math.floor((gy - minY) / bucketSize);

        for (let dbx = -1; dbx <= 1; dbx++) {
          for (let dby = -1; dby <= 1; dby++) {
            const bucket = bucketMap.get(`${gbx + dbx},${gby + dby}`);
            if (!bucket) continue;
            for (const p of bucket) {
              const dx = (gx - (p.x as number)) / bandwidthDeg;
              const dy = (gy - (p.y as number)) / bandwidthDeg;
              const distSq = dx * dx + dy * dy;
              if (distSq > cutoffFactor * cutoffFactor) continue;
              w += Math.exp(-0.5 * distSq);
            }
          }
        }

        w /= normFactor;
        grid.push({ lng: gx, lat: gy, weight: w });
      }
    }

    const maxW = Math.max(...grid.map(g => g.weight), 0.0001);
    return grid
      .map(g => ({ lng: g.lng, lat: g.lat, weight: g.weight / maxW }))
      .filter(g => g.weight > 0.01)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5000);
  });
}

export async function computeClusters(
  projectId: string,
  epsMeters: number = 500,
  minPoints: number = 3
): Promise<ClusterResult> {
  const cacheKey = `analysis:${projectId}:clusters:${epsMeters}:${minPoints}`;
  return cached(cacheKey, config.cache.ttl, async () => {
    const result = await db.manyOrNone(`
      WITH clusters AS (
        SELECT id, name, ST_X(geom) AS lng, ST_Y(geom) AS lat,
          ST_ClusterDBSCAN(geom, $1 / 111320.0, $2) OVER () AS cid
        FROM spatial_points WHERE project_id = $3
      )
      SELECT cid AS cluster_id, COUNT(*)::INTEGER AS point_count,
        AVG(lng) AS center_lng, AVG(lat) AS center_lat,
        json_agg(json_build_object('id', id, 'name', COALESCE(name, ''), 'lng', lng, 'lat', lat)) AS points
      FROM clusters GROUP BY cid ORDER BY cid
    `, [epsMeters, minPoints, projectId]);
    if (!result || result.length === 0) return { clusters: [], noise: 0 };
    let noise = 0;
    const clusters = [];
    for (const row of result) {
      if (row.cluster_id === null) { noise = row.point_count; }
      else { clusters.push({ clusterId: row.cluster_id, pointCount: row.point_count, center: { lng: parseFloat(row.center_lng), lat: parseFloat(row.center_lat) }, points: row.points || [] }); }
    }
    return { clusters, noise };
  });
}

export async function computeSiteOptimization(
  projectId: string, options: SiteOptimizationOptions & { industry?: string }
): Promise<any> {
  const cacheKey = `analysis:${projectId}:siteopt:${paramsHash(options as any)}`;
  return cached(cacheKey, config.cache.ttl, async () => {
    // E2: Load industry model weights if specified
    let industryWeights: Record<string, number> | null = null;
    if (options.industry) {
      const model = await db.oneOrNone(
        `SELECT weights FROM site_optimization_models WHERE industry = $[industry]`,
        { industry: options.industry }
      );
      if (model && model.weights) {
        industryWeights = typeof model.weights === 'string' ? JSON.parse(model.weights) : model.weights;
      }
    }
    const { candidates, weights, topK } = options;
    // E2: Normalize weights from user input or industry model
    const w = industryWeights || weights;
    const distW = w.distanceWeight ?? 0.35;
    const blindW = w.blindSpotWeight ?? 0.15;
    const compW = w.competitorAvoidance ?? w.competitionDensity ?? w.competitorDistance ?? 0.25;
    const densW = w.densityWeight ?? w.poiDensity ?? w.deliveryCoverage ?? w.transportConvenience ?? 0.25;

    // Run competition analysis for all candidates
    // Read project source_crs to correctly convert candidate coordinates
    const projectRow = await db.oneOrNone(
      "SELECT source_crs FROM analysis_projects WHERE id = $[pid]",
      { pid: projectId }
    );
    const projectCrs = (projectRow?.source_crs || "gcj02") as string;

    const compResults = await batchCompetitionAnalysis(projectId, candidates);

    const scored = [];
    const { convertCoord } = require('../utils/coordTransform');
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      // Convert candidate from project CRS to WGS-84 for DB comparison
      let wgsLng = c.lng, wgsLat = c.lat;
      try {
        const wgs = convertCoord(c.lng, c.lat, projectCrs, 'wgs84');
        wgsLng = wgs.lng;
        wgsLat = wgs.lat;
      } catch {
        // If conversion fails, use as-is and log warning
        console.warn("[SiteOpt] CRS conversion failed for candidate:", c.name);
      }
      const comp = compResults[i] || { saturation: 'medium' as const, competitorCount500m: 0, competitorCount1000m: 0, gapRatio: 1 };
      // Competition: penalize if competitors within 500m; 0 competitors=100, 5+=0
      const comp_500m = comp.competitorCount500m || 0;
      const compScore = Math.max(0, 1 - comp_500m / 5);
      const advice = generateAdvice({});
      const dr = await db.one(
        "SELECT MIN(ST_Distance(ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, geom::geography)) AS min_dist, COUNT(*)::INTEGER AS point_count FROM spatial_points WHERE project_id = $3",
        [wgsLng, wgsLat, projectId]
      );
      const minDist = parseFloat(dr.min_dist || "0");
      const distScore = Math.min(minDist / 500, 1.0); // normalized: 0m=0, 500m+=100 (beyond 500m no conflict)
      const blindScore = Math.min(minDist / 3000, 1.0); // further from existing = more blindspot coverage value
      const nearbyCount = parseInt(dr.point_count || "0");
      const densScore = Math.min(nearbyCount / 50, 1.0); // more nearby points = higher commercial density
      const total = distScore * distW + blindScore * blindW + compScore * compW + densScore * densW;
      scored.push({ name: c.name, lng: c.lng, lat: c.lat,
        score: Math.round(total * 100),
        dimensions: {
          distanceScore: Math.round(distScore * 100),
          blindSpotScore: Math.round(blindScore * 100),
          competitionScore: Math.round(compScore * 100),
          densityScore: Math.round(densScore * 100),
          minDistanceMeters: Math.round(minDist),
          nearbyPoints: nearbyCount,
          competitors500m: comp.competitorCount500m,
          competitors1000m: comp.competitorCount1000m,
          saturation: comp.saturation,
          gapRatio: comp.gapRatio,
        },
        advice: advice.map(a => ({ priority: a.priority, message: a.message })) });
    }
    scored.sort((a, b) => b.score - a.score);
    return { candidates: scored.slice(0, topK), weights: w, industry: options.industry || null };
  });
}
