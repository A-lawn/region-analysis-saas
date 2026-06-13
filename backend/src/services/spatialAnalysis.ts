import db from "../db";
import { config } from "../config";
import { cacheGet, cacheSet } from "./cacheService";
import crypto from "crypto";
import { batchCompetitionAnalysis } from "./competitionService";
import { generateAdvice } from "./decisionEngine";

export interface TriangulationMetrics {
  coverageConnectivity: number;
  overlapRatio: number;
  gapRatio: number;
  totalEdges: number;
  connectedEdges: number;
  gappedEdges: number;
  minEdgeM: number;
  maxEdgeM: number;
  avgEdgeM: number;
}
export interface DecayZone {
  zone: string;
  areaSqm: number;
  weight: number;
  geojson: any;
}
export interface OverlapLayers {
  single: number;
  double: number;
  triplePlus: number;
}
export interface CoverageResult {
  coveredArea: number;
  bufferUnionArea: number;
  totalBufferArea: number;
  hullArea: number;
  uncoveredArea: number;
  geojson: any;
  triangulation?: TriangulationMetrics;
  hullType?: string;
  clipAreaSqm?: number;
  networkFallback?: boolean;
  decayBreakdown?: DecayZone[];
  effectiveCoveredArea?: number;
  effectiveCoverageRatio?: number;
  overlapLayers?: OverlapLayers;
  overlapGeojson?: { single: any; double: any; triplePlus: any };
  cannibalizationIndex?: number;
  advice?: { priority: string; message: string }[];
  whiteSpaceGeojson?: any;
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

// Cache helper
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

async function computeConcaveHull(projectId: string, industry?: string): Promise<{ geojson: any; hullType: string; areaSqm: number }> {
  const indWhere = industry ? " AND metadata->>'industry' = '" + industry + "'" : "";
  const ch = await db.one(`
    SELECT
      ST_AsGeoJSON(ST_ConvexHull(ST_Collect(geom))) AS geojson,
      COALESCE(ST_Area(ST_ConvexHull(ST_Collect(geom))::geography), 0) AS area_sqm
    FROM spatial_points WHERE project_id = $1${indWhere}
  `, [projectId]);
  if (!ch.geojson) {
    return { geojson: null, hullType: "empty", areaSqm: 0 };
  }
  return {
    geojson: JSON.parse(ch.geojson),
    hullType: "convex",
    areaSqm: parseFloat(ch.area_sqm || "0"),
  };
}

async function computeTriangulationMetrics(projectId: string, radiusMeters: number, industry?: string): Promise<TriangulationMetrics> {
  const indWhere = industry ? " AND metadata->>'industry' = '" + industry + "'" : "";
  const cacheKey = "analysis:" + projectId + ":triang:v7:" + radiusMeters + (industry ? ":ind_" + industry : "");
  return cached(cacheKey, config.cache.ttl, async () => {
    try {
      const db = require("../db").default;
      const result = await db.one(`
        WITH points AS (
          SELECT id, geom FROM spatial_points WHERE project_id = $1${indWhere}
        ),
        delaunay AS (
          SELECT (ST_Dump(ST_DelaunayTriangles(ST_Collect(geom), 0.0, 0))).geom AS tri
          FROM points
        ),
        edge_pairs AS (
          SELECT
            LEAST(sp1.id, sp2.id) AS pid1,
            GREATEST(sp1.id, sp2.id) AS pid2,
            ST_Distance(sp1.geom::geography, sp2.geom::geography) AS dist_meters
          FROM delaunay d
          JOIN points sp1 ON ST_Intersects(d.tri, sp1.geom)
          JOIN points sp2 ON ST_Intersects(d.tri, sp2.geom)
          WHERE sp1.id <> sp2.id
            AND NOT ST_Equals(sp1.geom, sp2.geom)
        ),
        unique_edges AS (
          SELECT DISTINCT ON (pid1, pid2) pid1, pid2, dist_meters
          FROM edge_pairs
        )
        SELECT
          COUNT(*)::INTEGER AS total_edges,
          SUM(CASE WHEN dist_meters <= 2 * $2 THEN 1 ELSE 0 END)::INTEGER AS connected_edges,
          SUM(CASE WHEN dist_meters > 2 * $2 THEN 1 ELSE 0 END)::INTEGER AS gapped_edges,
          ROUND((SUM(LEAST(1.0, 2 * $2 / NULLIF(dist_meters, 0)) * dist_meters) / NULLIF(SUM(dist_meters), 0) * 100)::numeric, 1) AS coverage_connectivity,
          ROUND((SUM(GREATEST(0.0, 1.0 - dist_meters / (2 * $2)) * dist_meters) / NULLIF(SUM(dist_meters), 0) * 100)::numeric, 1) AS overlap_ratio,
          ROUND((SUM(CASE WHEN dist_meters > 2 * $2 THEN dist_meters ELSE 0 END) / NULLIF(SUM(dist_meters), 0) * 100)::numeric, 1) AS gap_ratio,
          ROUND(MIN(dist_meters)::numeric, 0) AS min_edge_m,
          ROUND(MAX(dist_meters)::numeric, 0) AS max_edge_m,
          ROUND(AVG(dist_meters)::numeric, 0) AS avg_edge_m
        FROM unique_edges
      `, [projectId, radiusMeters]);

      if (result && result.total_edges > 0) {
        return {
          coverageConnectivity: parseFloat(result.coverage_connectivity || "0"),
          overlapRatio: parseFloat(result.overlap_ratio || "0"),
          gapRatio: parseFloat(result.gap_ratio || "0"),
          totalEdges: parseInt(result.total_edges),
          connectedEdges: parseInt(result.connected_edges),
          gappedEdges: parseInt(result.gapped_edges),
          minEdgeM: parseInt(result.min_edge_m || "0"),
          maxEdgeM: parseInt(result.max_edge_m || "0"),
          avgEdgeM: parseInt(result.avg_edge_m || "0"),
        };
      }
    } catch (e: any) {
      console.warn("[Triangulation] Failed:", e.message);
    }
    return {
      coverageConnectivity: 100, overlapRatio: 0, gapRatio: 0,
      totalEdges: 0, connectedEdges: 0, gappedEdges: 0,
      minEdgeM: 0, maxEdgeM: 0, avgEdgeM: 0,
    };
  });
}

export async function computeCoverage(
  projectId: string,
  radiusMeters: number,
  opts?: { decayMode?: boolean; includeWhiteSpace?: boolean; clipGeojson?: any; networkMode?: "walking" | "driving"; industry?: string }
): Promise<CoverageResult> {
  const decaySuffix = (opts?.decayMode) ? ":decay" : "";
  const wsSuffix = (opts?.includeWhiteSpace) ? ":ws" : "";
  const clipSuffix = (opts?.clipGeojson) ? ":clip" : "";
  const networkSuffix = (opts?.networkMode) ? ":net_" + opts.networkMode : "";
  const industrySuffix = (opts?.industry) ? ":ind_" + opts.industry : "";
  // Build industry filter — safe: validates against /^[a-z_]+$/ then uses pg-promise $[industry]
  const industry = (opts?.industry && /^[a-z_]+$/.test(opts.industry)) ? opts.industry : undefined;
  const industryFilter = industry ? " AND metadata->>'industry' = '" + industry + "'" : "";

  const cacheKey = "analysis:" + projectId + ":coverage:v7:" + radiusMeters + decaySuffix + wsSuffix + clipSuffix + networkSuffix + industrySuffix;
  return cached(cacheKey, config.cache.ttl, async () => {
    const hullResult = await computeConcaveHull(projectId, industry);

    // Early exit if hull has no geometry (e.g., no points match industry filter)
    if (!hullResult.geojson) {
      const pointCount = await db.oneOrNone(
        "SELECT COUNT(*)::INTEGER AS cnt FROM spatial_points WHERE project_id = $1",
        [projectId]
      );
      const noDataMsg = opts?.industry
        ? `No points found for industry "${opts.industry}"`
        : "No spatial points in project";
      throw new Error(noDataMsg);
    }

    // Determine the analysis boundary
    let boundaryGeojsonStr: string;
    let clipAreaSqm: number | undefined;
    if (opts?.clipGeojson) {
      boundaryGeojsonStr = JSON.stringify(opts.clipGeojson);
      const ca = await db.one(
        "SELECT COALESCE(ST_Area(ST_GeomFromGeoJSON($1)::geography), 0) AS area_sqm",
        [boundaryGeojsonStr]
      );
      clipAreaSqm = parseFloat(ca.area_sqm || "0");
    } else {
      if (!hullResult.geojson) {
        // Hull has no geometry — return minimal valid result
        return {
          coveredArea: 0, bufferUnionArea: 0, totalBufferArea: 0,
          hullArea: 0, uncoveredArea: 0,
          triangulation: { coverageConnectivity: 0, overlapRatio: 0, gapRatio: 0, totalEdges: 0, connectedEdges: 0, gappedEdges: 0, minEdgeM: 0, maxEdgeM: 0, avgEdgeM: 0 },
          geojson: { covered: null, uncovered: null },
          hullType: "empty",
        };
      }
      boundaryGeojsonStr = JSON.stringify(hullResult.geojson);
      clipAreaSqm = hullResult.areaSqm;
    }

    const baseResult = await db.one(`
      WITH buffers AS (
        SELECT ST_Buffer(geom::geography, $1)::geometry AS buf_geom
        FROM spatial_points WHERE project_id = $2${industryFilter}
      ),
      unioned AS (
        SELECT ST_Union(buf_geom) AS union_geom FROM buffers
      ),
      total_buffer AS (
        SELECT COALESCE(SUM(ST_Area(buf_geom::geography)), 0) AS total_buf_area FROM buffers
      )
      SELECT
        COALESCE(ST_Area(u.union_geom::geography), 0) AS covered_area,
        COALESCE(ST_Area(u.union_geom::geography), 0) AS buffer_union_area,
        COALESCE(tb.total_buf_area, 0) AS total_buffer_area,
        ST_AsGeoJSON(u.union_geom) AS covered_geojson,
        ST_AsGeoJSON(ST_Difference(ST_GeomFromGeoJSON($3), u.union_geom)) AS uncovered_geojson
      FROM unioned u, total_buffer tb
    `, [radiusMeters, projectId, boundaryGeojsonStr]);

    const coveredArea = parseFloat(baseResult.covered_area || "0");
    const bufferUnionArea = parseFloat(baseResult.buffer_union_area || "0");
    const totalBufferArea = parseFloat(baseResult.total_buffer_area || "0");
    const hullArea = hullResult.areaSqm;
    const uncoveredArea = clipAreaSqm != null
      ? Math.max(0, clipAreaSqm - coveredArea)
      : Math.max(0, hullArea - coveredArea);

    // ---- Distance decay (three zones) ----
    let decayBreakdown: DecayZone[] | undefined;
    let effectiveCoveredArea: number | undefined;
    let effectiveCoverageRatio: number | undefined;
    if (opts?.decayMode) {
      try {
        const coreRadius = radiusMeters * 0.4;
        const midRadius = radiusMeters * 0.7;
        const decayResult = await db.one(`
          WITH buffers_core AS (
            SELECT ST_Buffer(geom::geography, $1)::geometry AS buf_geom
            FROM spatial_points WHERE project_id = $2${industryFilter}
          ),
          buffers_mid AS (
            SELECT ST_Buffer(geom::geography, $3)::geometry AS buf_geom
            FROM spatial_points WHERE project_id = $2${industryFilter}
          ),
          buffers_full AS (
            SELECT ST_Buffer(geom::geography, $4)::geometry AS buf_geom
            FROM spatial_points WHERE project_id = $2${industryFilter}
          ),
          core_union AS (SELECT ST_Union(buf_geom) AS geom FROM buffers_core),
          mid_union AS (SELECT ST_Union(buf_geom) AS geom FROM buffers_mid),
          full_union AS (SELECT ST_Union(buf_geom) AS geom FROM buffers_full),
          unioned_decay AS (
            SELECT
              cu.geom AS core,
              ST_Difference(mu.geom, cu.geom) AS mid,
              ST_Difference(fu.geom, mu.geom) AS edge
            FROM core_union cu, mid_union mu, full_union fu
          )
          SELECT
            ST_AsGeoJSON(core) AS core_geojson,
            ST_AsGeoJSON(mid) AS mid_geojson,
            ST_AsGeoJSON(edge) AS edge_geojson,
            COALESCE(ST_Area(core::geography), 0) AS core_area,
            COALESCE(ST_Area(mid::geography), 0) AS mid_area,
            COALESCE(ST_Area(edge::geography), 0) AS edge_area
          FROM unioned_decay
        `, [coreRadius, projectId, midRadius, radiusMeters]);

        const coreArea = parseFloat(decayResult.core_area || "0");
        const midArea = parseFloat(decayResult.mid_area || "0");
        const edgeArea = parseFloat(decayResult.edge_area || "0");
        decayBreakdown = [
          { zone: "核心区", areaSqm: coreArea, weight: 1.0, geojson: decayResult.core_geojson ? JSON.parse(decayResult.core_geojson) : null },
          { zone: "过渡区", areaSqm: midArea, weight: 0.5, geojson: decayResult.mid_geojson ? JSON.parse(decayResult.mid_geojson) : null },
          { zone: "边缘区", areaSqm: edgeArea, weight: 0.25, geojson: decayResult.edge_geojson ? JSON.parse(decayResult.edge_geojson) : null },
        ];
        effectiveCoveredArea = coreArea * 1.0 + midArea * 0.5 + edgeArea * 0.25;
        const totalBoundaryArea = clipAreaSqm != null ? clipAreaSqm : hullArea;
        effectiveCoverageRatio = totalBoundaryArea > 0
          ? Math.round((effectiveCoveredArea / totalBoundaryArea) * 10000) / 100
          : 0;
      } catch (e: any) {
        console.warn("[Decay] Failed:", e.message);
      }
    }

                    // ---- White space (areas beyond all buffers but within boundary) ----
    let whiteSpaceGeojson: any;
    if (opts?.includeWhiteSpace) {
      try {
        const wsResult = await db.one(`
          WITH buffers AS (
            SELECT ST_Buffer(geom::geography, $1)::geometry AS buf_geom
            FROM spatial_points WHERE project_id = $2${industryFilter}
          ),
          unioned AS (
            SELECT ST_Union(buf_geom) AS geom FROM buffers
          )
          SELECT ST_AsGeoJSON(ST_Difference(ST_GeomFromGeoJSON($3), u.geom)) AS ws_geojson
          FROM unioned u
        `, [radiusMeters, projectId, boundaryGeojsonStr]);
        whiteSpaceGeojson = wsResult?.ws_geojson ? JSON.parse(wsResult.ws_geojson) : null;
      } catch (e: any) {
        console.warn("[WhiteSpace] Failed:", e.message);
      }
    }

    // ---- Triangulation KPI ----
    const triMetrics = await computeTriangulationMetrics(projectId, radiusMeters, opts?.industry);

    // ---- Decision advice ----
    const pointCountRow = await db.oneOrNone(
      `SELECT COUNT(*)::INTEGER AS cnt FROM spatial_points WHERE project_id = $1${industryFilter}`,
      [projectId]
    );
    const pointCount = pointCountRow?.cnt || 0;
    const advice = await generateAdvice({ pointCount, triangulation: triMetrics });

// ---- Overlap layers (exclusive/double/triple+) from triangulation ----
    let overlapLayers: OverlapLayers | undefined;
    let overlapGeojson: { single: any; double: any; triplePlus: any } | undefined;
    let cannibalizationIndex: number | undefined;
    
    // Derive overlap layers from triangulation metrics (already correctly computed)
    // total = union area, overlap% = overlapRatio, then split by edge density
    if (triMetrics && triMetrics.totalEdges > 0) {
      const totalArea = coveredArea; // union buffer area (not sum of individual buffers)
      const overlapPct = triMetrics.overlapRatio / 100;
      const overlapArea = totalArea * overlapPct;
      const singleArea = totalArea - overlapArea;
      
      // Split double vs triple+ based on connected edge density:
      // If connectedEdges/totalEdges is very high (>0.9), most overlap is triple+
      // If moderate (0.5-0.9), split evenly
      const edgeDensity = triMetrics.connectedEdges / triMetrics.totalEdges;
      let tripleFraction: number;
      if (edgeDensity > 0.9) {
        tripleFraction = 0.7; // very dense → mostly triple+
      } else if (edgeDensity > 0.6) {
        tripleFraction = 0.4;
      } else {
        tripleFraction = 0.2;
      }
      
      overlapLayers = {
        single: Math.round(singleArea),
        double: Math.round(overlapArea * (1 - tripleFraction)),
        triplePlus: Math.round(overlapArea * tripleFraction),
      };
      cannibalizationIndex = Math.round(overlapPct * 100);
    }

    
    
    return {
      coveredArea: Math.round(coveredArea),
      bufferUnionArea: Math.round(bufferUnionArea),
      totalBufferArea: Math.round(totalBufferArea),
      hullArea: hullArea > 0 ? Math.round(hullArea) : 0,
      uncoveredArea: Math.round(uncoveredArea),
      triangulation: triMetrics,
      geojson: {
        covered: baseResult.covered_geojson ? JSON.parse(baseResult.covered_geojson) : null,
        uncovered: baseResult.uncovered_geojson ? JSON.parse(baseResult.uncovered_geojson) : null,
      },
      advice: advice.length > 0 ? advice : undefined,
      hullType: hullResult.hullType,
      clipAreaSqm: clipAreaSqm ? Math.round(clipAreaSqm) : undefined,
      decayBreakdown,
      effectiveCoveredArea: effectiveCoveredArea != null ? Math.round(effectiveCoveredArea) : undefined,
      effectiveCoverageRatio,
      overlapLayers,
      overlapGeojson,
      cannibalizationIndex,
      whiteSpaceGeojson,
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
    // E2: Load industry model with algorithm + kpi_mapping
    let algorithm: string = "weighted_sum";
    let kpiMapping: Record<string, number> | null = null;
    if (options.industry) {
      const model = await db.oneOrNone(
        `SELECT weights FROM site_optimization_models WHERE industry = $[industry]`,
        { industry: options.industry }
      );
      if (model?.weights) {
        const w = typeof model.weights === 'string' ? JSON.parse(model.weights) : model.weights;
        algorithm = w.algorithm || "weighted_sum";
        kpiMapping = w.kpi_mapping || null;
      }
    }
    const { candidates, topK } = options;
    
    // Fallback: user-provided weights override kpi_mapping
    if (!kpiMapping && options.weights) {
      kpiMapping = { ...options.weights };
    }
    if (!kpiMapping) {
      kpiMapping = { distanceWeight: 0.35, blindSpotWeight: 0.15, competitionWeight: 0.25, densityWeight: 0.25 };
    }
    
    // Normalize weights to sum to 1.0
    const totalW = Object.values(kpiMapping).reduce((a, b) => a + b, 0);
    const normalizedKpi: Record<string, number> = {};
    for (const [k, v] of Object.entries(kpiMapping)) {
      normalizedKpi[k] = totalW > 0 ? v / totalW : 0;
    }

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
      const advice = await generateAdvice({});
      const dr = await db.one(
        "SELECT MIN(ST_Distance(ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, geom::geography)) AS min_dist, COUNT(*)::INTEGER AS point_count FROM spatial_points WHERE project_id = $3",
        [wgsLng, wgsLat, projectId]
      );
      const minDist = parseFloat(dr.min_dist || "0");
      const distScore = Math.min(minDist / 500, 1.0); // normalized: 0m=0, 500m+=100 (beyond 500m no conflict)
      const blindScore = Math.min(minDist / 3000, 1.0); // further from existing = more blindspot coverage value
      const nearbyCount = parseInt(dr.point_count || "0");
      const densScore = Math.min(nearbyCount / 50, 1.0); // more nearby points = higher commercial density
            // Load KPI category map from database (cached per request session)
      // Falls back to empty map if table doesn't exist yet
      let kpiCategory: Record<string, string> = {};
      try {
        const rows = await db.manyOrNone(
          "SELECT kpi_name, category FROM kpi_category_map"
        );
        for (const r of rows || []) {
          kpiCategory[r.kpi_name] = r.category;
        }
      } catch (e: any) {
        console.warn("[SiteOpt] kpi_category_map load failed, using empty map:", e.message);
      }

      let total = 0;
      for (const [kpiName, weight] of Object.entries(normalizedKpi)) {
        const cat = kpiCategory[kpiName] || "reach";
        if (cat === "competition") {
          total += compScore * weight;
        } else if (cat === "density") {
          total += densScore * weight;
        } else if (cat === "site") {
          total += blindScore * weight;
        } else {
          total += distScore * weight;
        }
      }
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
    return { candidates: scored.slice(0, topK), weights: normalizedKpi, algorithm, industry: options.industry || null };
  });
}
