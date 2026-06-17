// Analysis engine configuration
// All algorithm parameters are loaded from DB (industry-specific),
// these are fallback defaults when DB is unavailable

export interface AnalysisDefaults {
  coverageRadii: number[];
  dbscanEps: number;
  dbscanMinPoints: number;
  kdeBandwidth: number;
  kdeGridSize: number;
  h3Resolution: number;
  maxClusterCount: number;
  scoring: {
    distanceNormalizeMeters: number;
    densityNormalizeCount: number;
    blindspotNormalizeMeters: number;
  };
  overlap: {
    tripleFractions: number[];
  };
  decay: {
    coreRatio: number;
    midRatio: number;
    coreWeight: number;
    midWeight: number;
    edgeWeight: number;
  };
  competition: {
    nearRadiusMeters: number;
    farRadiusMeters: number;
    normalization: {
      maxCompetitors: number;
      function: string;
    };
  };
}

export const DEFAULT_ANALYSIS_CONFIG: AnalysisDefaults = {
  coverageRadii: [1000, 3000, 5000, 10000],
  dbscanEps: 500,
  dbscanMinPoints: 3,
  kdeBandwidth: 1000,
  kdeGridSize: 500,
  h3Resolution: 9,
  maxClusterCount: 80,
  scoring: {
    distanceNormalizeMeters: 500,
    densityNormalizeCount: 50,
    blindspotNormalizeMeters: 3000,
  },
  overlap: {
    tripleFractions: [0.7, 0.4, 0.2],
  },
  decay: {
    coreRatio: 0.4,
    midRatio: 0.7,
    coreWeight: 1.0,
    midWeight: 0.5,
    edgeWeight: 0.25,
  },
  competition: {
    nearRadiusMeters: 300,
    farRadiusMeters: 500,
    normalization: {
      maxCompetitors: 3,
      function: "linear_down",
    },
  },
};
