// ============================================================
// Industry Insight Engine Types
// ============================================================

export interface InsightCondition {
  field: string;
  op: "gte" | "lte" | "eq" | "between" | "gt" | "lt";
  value?: number;
  min?: number;
  max?: number;
}

export interface HardConstraint {
  id: string;
  description: string;
  condition: InsightCondition;
  message: string;
}

export interface SoftPenalty {
  id: string;
  description: string;
  condition: InsightCondition;
  penalty: number;
  message: string;
}

export interface NonlinearRule {
  id: string;
  description: string;
  condition: InsightCondition;
  bonus: number;
  message: string;
}

export interface IndustryInsightConfig {
  hard_constraints: HardConstraint[];
  soft_penalties: SoftPenalty[];
  nonlinear_rules: NonlinearRule[];
}

export interface InsightResult {
  candidateName: string;
  eliminated: boolean;
  eliminationReason?: string;
  penaltyFactors: { id: string; factor: number; message: string }[];
  bonuses: { id: string; bonus: number; message: string }[];
  insights: { type: "eliminated" | "warning" | "positive" | "info"; message: string }[];
}

export interface CandidateInsight {
  eliminated: boolean;
  eliminationReason?: string;
  insights: { type: "eliminated" | "warning" | "positive" | "info"; message: string }[];
}

// KPI context passed from spatial analysis to insight engine
export interface CandidateKpiContext {
  name: string;
  lng: number;
  lat: number;
  competitorCount300m: number;
  competitorCount500m: number;
  competitorCount1000m: number;
  minDistanceToExisting: number;
  area: number;
  brand: number;
  roadFrontage: number;
  populationDensity: number;
  footTraffic: number;
  parkingAvailability: number;
  nearMetro: boolean;
  nearHospital: boolean;
  nearSchool: boolean;
  isCommercialZone: boolean;
  isResidentialZone: boolean;
}

// ============================================================
// Industry Insight Engine Types
// ============================================================

export interface InsightCondition {
  field: string;
  op: "gte" | "lte" | "eq" | "between" | "gt" | "lt";
  value?: number;
  min?: number;
  max?: number;
}

export interface HardConstraint {
  id: string;
  description: string;
  condition: InsightCondition;
  message: string;
}

export interface SoftPenalty {
  id: string;
  description: string;
  condition: InsightCondition;
  penalty: number;
  message: string;
}

export interface NonlinearRule {
  id: string;
  description: string;
  condition: InsightCondition;
  bonus: number;
  message: string;
}

export interface IndustryInsightConfig {
  hard_constraints: HardConstraint[];
  soft_penalties: SoftPenalty[];
  nonlinear_rules: NonlinearRule[];
}

export interface InsightResult {
  candidateName: string;
  eliminated: boolean;
  eliminationReason?: string;
  penaltyFactors: { id: string; factor: number; message: string }[];
  bonuses: { id: string; bonus: number; message: string }[];
  insights: { type: "eliminated" | "warning" | "positive" | "info"; message: string }[];
}

export interface CandidateInsight {
  eliminated: boolean;
  eliminationReason?: string;
  insights: { type: "eliminated" | "warning" | "positive" | "info"; message: string }[];
}

// KPI context passed from spatial analysis to insight engine
export interface CandidateKpiContext {
  name: string;
  lng: number;
  lat: number;
  competitorCount300m: number;
  competitorCount500m: number;
  competitorCount1000m: number;
  minDistanceToExisting: number;
  area: number;
  brand: number;
  roadFrontage: number;
  populationDensity: number;
  footTraffic: number;
  parkingAvailability: number;
  nearMetro: boolean;
  nearHospital: boolean;
  nearSchool: boolean;
  isCommercialZone: boolean;
  isResidentialZone: boolean;
}