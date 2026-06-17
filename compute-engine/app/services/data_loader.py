"""Data loader -- pull project data from PostGIS"""
import asyncpg
from typing import List, Dict, Optional
from app.utils.logger import get_logger
from app.utils.h3_helpers import latlng_to_h3

logger = get_logger(__name__)


async def load_project_points(pool: asyncpg.Pool, project_id: str, industry: Optional[str] = None) -> Dict:
    logger.info("Loading project data: project=%s industry=%s", project_id, industry)

    async with pool.acquire() as conn:
        owner_rows = await conn.fetch(
            """SELECT id, name, ST_X(geom) AS lng, ST_Y(geom) AS lat,
                      COALESCE(metadata->>'daily_revenue', '0')::numeric AS daily_revenue
               FROM spatial_points WHERE project_id = $1 AND source = 'owner'""",
            project_id,
        )
        owners = [{"id": str(r["id"]), "lng": float(r["lng"]), "lat": float(r["lat"]),
                    "name": r["name"] or "", "area": 100.0, "brand": 0.5,
                    "daily_revenue": float(r["daily_revenue"] or 0)} for r in owner_rows]

        comp_rows = await conn.fetch(
            """SELECT id, name, ST_X(geom) AS lng, ST_Y(geom) AS lat
               FROM spatial_points WHERE project_id = $1 AND source = 'competitor'""",
            project_id,
        )
        competitors = [{"id": str(r["id"]), "lng": float(r["lng"]), "lat": float(r["lat"]),
                         "name": r["name"] or ""} for r in comp_rows]

        crs_row = await conn.fetchrow("SELECT source_crs FROM analysis_projects WHERE id = $1", project_id)
        source_crs = crs_row["source_crs"] if crs_row else "gcj02"

        h3_demand = await _build_h3_demand(conn, owners + competitors)

        logger.info("Data loaded: owners=%d competitors=%d h3=%d", len(owners), len(competitors), len(h3_demand))

        return {"owners": owners, "competitors": competitors, "h3_demand": h3_demand, "source_crs": source_crs}


async def _build_h3_demand(conn, points: List[Dict]) -> List[Dict]:
    if not points:
        return []
    lngs = [p["lng"] for p in points]
    lats = [p["lat"] for p in points]
    min_lng, max_lng = min(lngs) - 0.02, max(lngs) + 0.02
    min_lat, max_lat = min(lats) - 0.02, max(lats) + 0.02

    h3_cells = set()
    step = 0.01
    lat = min_lat
    while lat <= max_lat:
        lng = min_lng
        while lng <= max_lng:
            h3_cells.add(latlng_to_h3(lat, lng, 8))
            lng += step
        lat += step

    h3_demand = []
    for h3_idx in list(h3_cells)[:500]:
        from app.utils.h3_helpers import h3_to_latlng
        lat_c, lng_c = h3_to_latlng(h3_idx)
        population = 1000
        try:
            poi_row = await conn.fetchrow(
                "SELECT COALESCE(density_score, 0) AS density FROM poi_density WHERE h3_index = $1 LIMIT 1", h3_idx)
            if poi_row:
                population = max(float(poi_row["density"] or 0) * 100, 500)
        except Exception:
            pass
        h3_demand.append({"h3": h3_idx, "lng": lng_c, "lat": lat_c, "population": population, "consumption": 35.0})
    return h3_demand


async def load_huff_observations(pool: asyncpg.Pool, project_id: str) -> Optional[List[Dict]]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, ST_X(geom) AS lng, ST_Y(geom) AS lat,
                      COALESCE(metadata->>'daily_revenue', '0')::numeric AS daily_revenue,
                      COALESCE(metadata->>'floor_area', '100')::numeric AS floor_area,
                      COALESCE(metadata->>'brand_score', '0.5')::numeric AS brand_score
               FROM spatial_points WHERE project_id = $1
                 AND metadata->>'daily_revenue' IS NOT NULL
                 AND (metadata->>'daily_revenue')::numeric > 0""",
            project_id,
        )
        if len(rows) < 5:
            return None
        observations = []
        for r in rows:
            h3 = latlng_to_h3(float(r["lat"]), float(r["lng"]))
            observations.append({"demand_id": h3, "store_id": str(r["id"]), "weight": float(r["daily_revenue"]), "distance_m": 0})
        return observations
