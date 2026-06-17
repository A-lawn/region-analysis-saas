import logger from "../utils/logger";
import db from "../db";

export interface VoronoiPolygon {
  pointId: string;
  pointName: string;
  geojson: any;
  areaSqm: number;
}

export interface ClusterVoronoiResult {
  clusterId: number;
  boundary: any;
  pointCount: number;
  areaSqm: number;
}

export async function computeVoronoi(projectId: string): Promise<VoronoiPolygon[]> {
  try {
    const rows = await db.manyOrNone(
      `WITH voronoi_raw AS (
         SELECT (ST_Dump(ST_VoronoiPolygons(ST_Collect(geom)))).geom AS cell_geom
         FROM spatial_points WHERE project_id = $1
       ),
       labeled AS (
         SELECT
           sp.id AS point_id,
           COALESCE(sp.name, 'Point') AS point_name,
           vr.cell_geom,
           ST_Area(vr.cell_geom::geography) AS area_sqm
         FROM voronoi_raw vr
         JOIN spatial_points sp
           ON sp.project_id = $1
          AND ST_Within(sp.geom, vr.cell_geom)
       )
       SELECT
         point_id,
         point_name,
         ST_AsGeoJSON(cell_geom) AS geojson,
         ROUND(area_sqm)::INTEGER AS area_sqm
       FROM labeled`,
      [projectId]
    );

    if (!rows || rows.length === 0) return [];

    return rows.map((r: any) => ({
      pointId: r.point_id,
      pointName: r.point_name,
      geojson: JSON.parse(r.geojson),
      areaSqm: r.area_sqm,
    }));
  } catch (err: any) {
    logger.error({ error: err.message }, "[Voronoi] Failed");
    return [];
  }
}

export async function computeClusterVoronoi(
  projectId: string,
  clusterResult: { clusters: { clusterId: number; points: { id: string }[] }[] }
): Promise<ClusterVoronoiResult[]> {
  try {
    const results: ClusterVoronoiResult[] = [];

    for (const cluster of clusterResult.clusters) {
      const pointIds = cluster.points.map(p => p.id);
      if (pointIds.length === 0) continue;

      const row = await db.oneOrNone(
        `WITH cluster_points AS (
           SELECT geom FROM spatial_points
           WHERE project_id = $[projectId] AND id = ANY($[pointIds]::uuid[])
         ),
         voronoi_raw AS (
           SELECT (ST_Dump(ST_VoronoiPolygons(ST_Collect(geom)))).geom AS cell_geom
           FROM cluster_points
         )
         SELECT
           ST_AsGeoJSON(ST_Union(cell_geom)) AS merged_geojson,
           ROUND(ST_Area(ST_Union(cell_geom)::geography))::INTEGER AS area_sqm
         FROM voronoi_raw`,
        { projectId, pointIds }
      );

      if (row) {
        results.push({
          clusterId: cluster.clusterId,
          boundary: row.merged_geojson ? JSON.parse(row.merged_geojson) : null,
          pointCount: cluster.points.length,
          areaSqm: row.area_sqm || 0,
        });
      }
    }

    return results;
  } catch (err: any) {
    logger.error({ error: err.message }, "[ClusterVoronoi] Failed");
    return [];
  }
}