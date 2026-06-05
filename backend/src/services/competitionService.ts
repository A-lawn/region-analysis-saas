import db from "../db";

export interface CompetitionResult {
  candidateName: string;
  lng: number;
  lat: number;
  competitorCount500m: number;
  competitorCount1000m: number;
  ownerCount500m: number;
  ownerCount1000m: number;
  gapRatio: number;
  saturation: "low" | "medium" | "high";
}

export async function computeCompetitionAnalysis(
  projectId: string,
  candidate: { name: string; lng: number; lat: number }
): Promise<CompetitionResult> {
  try {
    const [comp500, comp1000, owner500, owner1000] = await Promise.all([
      db.one(
        "SELECT COUNT(*)::INTEGER AS cnt FROM spatial_points WHERE project_id = $1 AND source = 'competitor' AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 500)",
        [projectId, candidate.lng, candidate.lat]
      ),
      db.one(
        "SELECT COUNT(*)::INTEGER AS cnt FROM spatial_points WHERE project_id = $1 AND source = 'competitor' AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 1000)",
        [projectId, candidate.lng, candidate.lat]
      ),
      db.one(
        "SELECT COUNT(*)::INTEGER AS cnt FROM spatial_points WHERE project_id = $1 AND source = 'owner' AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 500)",
        [projectId, candidate.lng, candidate.lat]
      ),
      db.one(
        "SELECT COUNT(*)::INTEGER AS cnt FROM spatial_points WHERE project_id = $1 AND source = 'owner' AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 1000)",
        [projectId, candidate.lng, candidate.lat]
      ),
    ]);

    const c500 = comp500.cnt || 0;
    const c1000 = comp1000.cnt || 0;
    const o500 = owner500.cnt || 0;
    const o1000 = owner1000.cnt || 0;
    const gapRatio = c1000 > 0 ? o1000 / c1000 : (o1000 > 0 ? 999 : 1);

    let saturation: CompetitionResult["saturation"] = "low";
    if (c500 >= 5 || (gapRatio < 0.5 && c1000 >= 3)) saturation = "high";
    else if (c500 >= 2 || c1000 >= 5) saturation = "medium";

    return {
      candidateName: candidate.name,
      lng: candidate.lng,
      lat: candidate.lat,
      competitorCount500m: c500,
      competitorCount1000m: c1000,
      ownerCount500m: o500,
      ownerCount1000m: o1000,
      gapRatio: Math.round(gapRatio * 100) / 100,
      saturation,
    };
  } catch (err: any) {
    console.error("Competition analysis error:", err.message);
    return {
      candidateName: candidate.name,
      lng: candidate.lng,
      lat: candidate.lat,
      competitorCount500m: 0,
      competitorCount1000m: 0,
      ownerCount500m: 0,
      ownerCount1000m: 0,
      gapRatio: 1,
      saturation: "low",
    };
  }
}

export async function batchCompetitionAnalysis(
  projectId: string,
  candidates: { name: string; lng: number; lat: number }[]
): Promise<CompetitionResult[]> {
  return Promise.all(candidates.map(c => computeCompetitionAnalysis(projectId, c)));
}