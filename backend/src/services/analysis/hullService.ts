import db from "../../db";

export async function computeConcaveHull(projectId: string, industry?: string): Promise<{ geojson: any; hullType: string; areaSqm: number }> {
  const indWhere = industry ? ` AND metadata->>'industry' = $[industry]` : "";
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