import db from "../db";
import { CrsType, convertCoord as convertCoordLib } from "../utils/coordTransform";
import { normalizeIndustry } from "../config/industry.config";
import pgPromise from "pg-promise";
import { pointToH3 } from "../utils/h3Index";

const pgp = pgPromise();

export interface ExcelRow { name: string; address: string; lng: number; lat: number; category?: string; revenue?: number; floor_area?: number; brand_score?: number; tags?: string; avg_cost?: number; rating?: number; open_time?: string; parking?: string; }
export interface UploadResult { projectId: string; rowsParsed: number; rowsInserted: number; errors: string[]; }

export async function processUpload(
  rows: any[][],
  columnMapping: { nameCol: number | null; addressCol: number | null; lngCol: number; latCol: number; categoryCol?: number | null; revenueCol?: number | null; floorAreaCol?: number | null; brandScoreCol?: number | null; tagsCol?: number | null; avgCostCol?: number | null; ratingCol?: number | null; openTimeCol?: number | null; parkingCol?: number | null },
  sourceCrs: CrsType,
  projectName: string,
  tenantId: string = "default"
): Promise<UploadResult> {
  const errors: string[] = [];
  const MAX_ROWS = 50000;
  if (rows.length > MAX_ROWS) {
    return { projectId: "", rowsParsed: rows.length, rowsInserted: 0, errors: [`文件超过最大行数限制 (${MAX_ROWS}行)，请拆分后上传`] };
  }
  const truncate = (s: string, max: number) => s.length > max ? s.substring(0, max) : s;
  const points: { name: string; address: string; lng: number; lat: number; category?: string; revenue?: number; floor_area?: number; brand_score?: number; tags?: string; avg_cost?: number; rating?: number; open_time?: string; parking?: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const rawLng = columnMapping.lngCol !== null ? parseFloat(row[columnMapping.lngCol]) : NaN;
    const rawLat = columnMapping.latCol !== null ? parseFloat(row[columnMapping.latCol]) : NaN;
    if (isNaN(rawLng) || isNaN(rawLat)) continue;
    if (rawLng < -180 || rawLng > 180 || rawLat < -90 || rawLat > 90) continue;

    const rawName = columnMapping.nameCol !== null ? String(row[columnMapping.nameCol] || "").trim() : "";
    const name = rawName ? truncate(rawName, 255) : "Point" + (i + 1);
    const address = columnMapping.addressCol !== null ? truncate(String(row[columnMapping.addressCol] || "").trim(), 1000) : "";
            const category = columnMapping.categoryCol != null ? truncate(String(row[columnMapping.categoryCol] || '').trim(), 100) : '';
    const revenue = columnMapping.revenueCol != null ? parseFloat(row[columnMapping.revenueCol]) || 0 : 0;
    const floor_area = columnMapping.floorAreaCol != null ? parseFloat(row[columnMapping.floorAreaCol]) || 0 : 0;
    const brand_score = columnMapping.brandScoreCol != null ? parseFloat(row[columnMapping.brandScoreCol]) || 0 : 0;
    const tags = columnMapping.tagsCol != null ? truncate(String(row[columnMapping.tagsCol] || '').trim(), 500) : '';
    const avgCost = columnMapping.avgCostCol != null ? parseFloat(row[columnMapping.avgCostCol]) || 0 : 0;
    const rating = columnMapping.ratingCol != null ? parseFloat(row[columnMapping.ratingCol]) || 0 : 0;
    const openTime = columnMapping.openTimeCol != null ? truncate(String(row[columnMapping.openTimeCol] || '').trim(), 200) : '';
    const parking = columnMapping.parkingCol != null ? truncate(String(row[columnMapping.parkingCol] || '').trim(), 200) : '';
    points.push({ name, address, lng: rawLng, lat: rawLat, category, revenue, floor_area, brand_score, tags, avg_cost: avgCost, rating, open_time: openTime, parking });
  }

  if (points.length === 0) {
    return { projectId: "", rowsParsed: rows.length, rowsInserted: 0, errors: ["No valid coordinates found"] };
  }

  // Convert source CRS -> WGS-84 for storage
  let convertedPoints: { lng: number; lat: number }[];
  try {
    convertedPoints = points.map(p => {
      return convertCoordLib(p.lng, p.lat, sourceCrs, "wgs84");
    });
  } catch (err: any) {
    return { projectId: "", rowsParsed: rows.length, rowsInserted: 0, errors: ["CRS conversion failed: " + err.message] };
  }

  const project = await db.one(
    "INSERT INTO analysis_projects (tenant_id, name, source_crs, point_count, status) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [tenantId, projectName, sourceCrs, points.length, "ready"]
  );

    // 2.3 Batch insert in chunks. Insert lng/lat first, then bulk-update geom+h3.
  const BATCH_SIZE = 2000;
    // Include metadata column if any point has category or revenue
  const hasMetadata = points.some((p: any) => p.category || p.revenue || p.floor_area || p.brand_score || p.tags || p.avg_cost || p.rating || p.open_time || p.parking);
  const columns = hasMetadata
    ? ["project_id", "name", "address", "lng", "lat", { name: "metadata", mod: ":json" }]
    : ["project_id", "name", "address", "lng", "lat"];
  const cs = new pgp.helpers.ColumnSet(columns, { table: "spatial_points" });

  // Points are already in WGS-84 from step above, no further conversion needed

  let inserted = 0;
  let batch: any[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const c = convertedPoints[i];
    if (isNaN(c.lng) || isNaN(c.lat) || !isFinite(c.lng) || !isFinite(c.lat)) continue;
    const row: any = {
      project_id: project.id,
      name: p.name,
      address: p.address,
      lng: c.lng,
      lat: c.lat,
    };
    if (hasMetadata) {
      const meta: Record<string, any> = {};
      const cat = (p as any).category;
      if (cat) {
        // Normalize user category to system industry code
        const normalized = normalizeIndustry(cat);
        if (normalized) {
          meta.industry = normalized.industry;
          if (normalized.subCategory) {
            meta.sub_category = truncate(normalized.subCategory, 100);
          }
        }
      }
      const rev = (p as any).revenue;
      if (rev && rev > 0) meta.daily_revenue = Math.round(rev);
      const fa = (p as any).floor_area;
      if (fa && fa > 0) meta.floor_area = fa;
      const bs = (p as any).brand_score;
      if (bs && bs > 0) meta.brand_score = bs;
      const tg = (p as any).tags;
      if (tg) meta.tags = tg;
      const ac = (p as any).avg_cost;
      if (ac && ac > 0) meta.avg_cost = Math.round(ac);
      const rt = (p as any).rating;
      if (rt && rt > 0) meta.rating = rt;
      const ot = (p as any).open_time;
      if (ot) meta.open_time = ot;
      const pk = (p as any).parking;
      if (pk) meta.parking = pk;
      if (Object.keys(meta).length > 0) row.metadata = meta;
    }
    batch.push(row);
        inserted++;

    if (batch.length >= BATCH_SIZE) {
      const query = pgp.helpers.insert(batch, cs);
      await db.none(query);
      batch = [];
    }
  }

  if (batch.length > 0) {
    const query = pgp.helpers.insert(batch, cs);
    await db.none(query);
  }

  // Bulk-update geom
  await db.none(
    'UPDATE spatial_points SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326) WHERE project_id = ${pid} AND geom IS NULL',
    { pid: project.id }
  );

  // Update h3_index in application code
  const pointRows = await db.manyOrNone(
    'SELECT id, lng, lat FROM spatial_points WHERE project_id = ${pid} AND h3_index IS NULL',
    { pid: project.id }
  );
  if (pointRows && pointRows.length > 0) {
    const h3Updates = pointRows
      .map((r: any) => ({ id: r.id, h3_index: pointToH3(parseFloat(r.lng), parseFloat(r.lat), 9) }))
      .filter((u: any) => u.h3_index);
    if (h3Updates.length > 0) {
      await db.tx(async (t: any) => {
        for (const u of h3Updates) {
          await t.none('UPDATE spatial_points SET h3_index = $[h3] WHERE id = $[id]', { id: u.id, h3: u.h3_index });
        }
      });
    }
  }// Update project bounds and final point count
  await db.none(
    "UPDATE analysis_projects SET bounds = (SELECT ST_Envelope(ST_Collect(geom)) FROM spatial_points WHERE project_id = $1), point_count = $2 WHERE id = $1",
    [project.id, inserted]
  );

  return { projectId: project.id, rowsParsed: rows.length, rowsInserted: inserted, errors };
}

export async function getProjectSummary(projectId: string) {
  const project = await db.oneOrNone("SELECT id, name, source_crs, point_count, status, created_at, is_temporary FROM analysis_projects WHERE id = $1 AND deleted_at IS NULL", [projectId]);
  if (!project) return null;

  const stats = await db.one(
    "SELECT COUNT(*)::INTEGER AS point_count, ROUND(CAST(ST_XMin(ST_Collect(geom)) AS NUMERIC), 6) AS min_lng, ROUND(CAST(ST_XMax(ST_Collect(geom)) AS NUMERIC), 6) AS max_lng, ROUND(CAST(ST_YMin(ST_Collect(geom)) AS NUMERIC), 6) AS min_lat, ROUND(CAST(ST_YMax(ST_Collect(geom)) AS NUMERIC), 6) AS max_lat, ROUND(CAST(AVG(ST_X(geom)) AS NUMERIC), 6) AS center_lng, ROUND(CAST(AVG(ST_Y(geom)) AS NUMERIC), 6) AS center_lat, ROUND(CAST(ST_Area(ST_Envelope(ST_Collect(geom))::geography) AS NUMERIC), 0) AS area_sqm FROM spatial_points WHERE project_id = $1",
    [projectId]
  );

  let density: any = { avg_neighbor_dist_m: "0", min_neighbor_dist_m: "0", max_neighbor_dist_m: "0" };
  try {
    density = await db.one(
      "WITH nearest AS (SELECT a.id, MIN(ST_Distance(a.geom::geography, b.geom::geography)) AS nearest_dist FROM spatial_points a CROSS JOIN spatial_points b WHERE a.project_id = $1 AND b.project_id = $1 AND a.id != b.id GROUP BY a.id) SELECT ROUND(AVG(nearest_dist)) AS avg_neighbor_dist_m, ROUND(MIN(nearest_dist)) AS min_neighbor_dist_m, ROUND(MAX(nearest_dist)) AS max_neighbor_dist_m FROM nearest",
      [projectId]
    );
  } catch (e) {}

  return {
    id: project.id, name: project.name, sourceCrs: project.source_crs, status: project.status, createdAt: project.created_at,
    isTemporary: project.is_temporary || false,
    stats: {
      pointCount: stats.point_count,
      bounds: { minLng: parseFloat(stats.min_lng), maxLng: parseFloat(stats.max_lng), minLat: parseFloat(stats.min_lat), maxLat: parseFloat(stats.max_lat) },
      center: { lng: parseFloat(stats.center_lng), lat: parseFloat(stats.center_lat) },
      areaSqm: parseFloat(stats.area_sqm),
      avgNeighborDistM: parseFloat(density.avg_neighbor_dist_m || "0"),
      minNeighborDistM: parseFloat(density.min_neighbor_dist_m || "0"),
      maxNeighborDistM: parseFloat(density.max_neighbor_dist_m || "0"),
    },
  };
}

export async function listProjects(
  tenantId: string = "default",
  opts?: { search?: string; page?: number; limit?: number }
) {
  const search = opts?.search?.trim() || "";
  const limit = Math.min(opts?.limit || 20, 50);
  const page = Math.max(opts?.page || 1, 1);
  const offset = (page - 1) * limit;

  let whereClause = "WHERE tenant_id = $[tenantId] AND deleted_at IS NULL";
  const params: any = { tenantId, limit, offset };

  if (search) {
    whereClause += " AND name ILIKE $[search]";
    params.search = "%" + search + "%";
  }

  const countResult = await db.one(
    "SELECT COUNT(*) as total FROM analysis_projects " + whereClause,
    params
  );
  const total = parseInt(countResult.total);

  const rows = await db.manyOrNone(
    "SELECT id, name, source_crs, point_count, status, created_at FROM analysis_projects " +
      whereClause +
      " ORDER BY created_at DESC LIMIT $[limit] OFFSET $[offset]",
    params
  );

  return {
    projects: rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

