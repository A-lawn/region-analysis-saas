// Industry configuration types & constants
// All industry-specific parameters originate from site_optimization_models table

export interface IndustryConfig {
  industry: string;
  displayName: string;
  radiusMeters: number;
  weights: Record<string, number>;
  analysisParams: {
    coverage: { radiusMeters: number };
    decay: { coreRatio: number; midRatio: number; coreWeight: number; midWeight: number; edgeWeight: number };
    competition: { nearRadiusM: number; farRadiusM: number; hardFilterM?: number; normalization: { maxCompetitors: number; function: string; sweetPeak?: number } };
    scoring: { distanceNormalizeM: number; densityNormalizeCount: number; blindspotNormalizeM: number };
    overlap: { tripleFractions: number[] };
    kde: { bandwidthM: number; gridSizeM: number; maxGridCells: number; cutoffFactor: number };
    cluster: { epsM: number; minPoints: number };
  };
  decisionThresholds: Record<string, number>;
  benchmarks: Record<string, unknown>;
  kpiWeights: Record<string, number>;
  keywords: string[];
}

// Default industry radius config (used only when DB is unavailable)
// At runtime, actual values come from site_optimization_models.radius_meters
export const DEFAULT_INDUSTRY_RADII: { industry: string; label: string; radiusMeters: number }[] = [
  { industry: "convenience", label: "便利店", radiusMeters: 300 },
  { industry: "beverage", label: "茶饮/咖啡", radiusMeters: 400 },
  { industry: "restaurant", label: "餐饮", radiusMeters: 500 },
  { industry: "pharmacy", label: "药店/诊所", radiusMeters: 800 },
  { industry: "fresh_grocery", label: "生鲜超市", radiusMeters: 800 },
  { industry: "education", label: "教育培训", radiusMeters: 1500 },
  { industry: "pet_service", label: "宠物服务", radiusMeters: 2000 },
  { industry: "hotel", label: "酒店/住宿", radiusMeters: 2000 },
  { industry: "supermarket", label: "商超", radiusMeters: 3000 },
  { industry: "medical_aesthetics", label: "医美/口腔", radiusMeters: 3000 },
  { industry: "logistics", label: "物流/快递驿站", radiusMeters: 500 },
  { industry: "auto4s", label: "汽车4S店", radiusMeters: 10000 },
];

// Industry category mapping for auto-detection
export const INDUSTRY_CATEGORY_MAP: Record<string, string[]> = {
  convenience: ["便利店", "小卖部", "24小时", "烟酒"],
  beverage: ["茶饮", "咖啡", "奶茶", "饮品", "星巴克", "瑞幸"],
  restaurant: ["餐饮", "餐厅", "食堂", "小吃", "快餐", "火锅"],
  pharmacy: ["药店", "药房", "诊所", "医保", "中药"],
  fresh_grocery: ["生鲜", "菜市场", "蔬菜", "水果", "农贸"],
  supermarket: ["超市", "百货", "购物中心", "仓储"],
  hotel: ["酒店", "宾馆", "住宿", "民宿"],
  medical_aesthetics: ["医美", "口腔", "整形", "美容", "牙科"],
  education: ["培训", "教育", "学校", "幼教", "补习"],
  pet_service: ["宠物", "动物", "兽医"],
  logistics: ["快递", "物流", "驿站", "配送", "仓储"],
  auto4s: ["4S", "汽车销售", "汽车维修", "二手车"],
};
