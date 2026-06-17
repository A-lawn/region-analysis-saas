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
  convenience: ["便利店", "小卖部", "24小时", "烟酒", "百货店", "杂货店"],
  beverage: ["茶饮", "咖啡", "奶茶", "饮品", "星巴克", "瑞幸", "喜茶", "蜜雪冰城", "霸王茶姬", "奈雪", "茶话弄", "冷饮", "果汁"],
  restaurant: [
    "餐饮", "餐厅", "食堂", "美食",
    // 中餐子类
    "中餐", "炒菜", "私房菜", "大排档", "家常菜", "湘菜", "川菜", "粤菜", "陕菜",
    // 火锅/烧烤
    "火锅", "涮肉", "串串", "冒菜", "麻辣烫", "烧烤", "烤肉",
    // 面馆/小吃
    "面馆", "面", "米线", "米粉", "凉皮", "肉夹馍", "泡馍",
    "小吃", "快餐", "简餐", "盖浇饭", "煲仔饭", "黄焖鸡",
    "饺子", "馄饨", "包子", "馒头",
    // 西餐/日料/东南亚
    "西餐", "牛排", "披萨", "汉堡", "意面", "法餐",
    "日料", "寿司", "拉面", "居酒屋", "韩餐", "韩国料理", "烤肉",
    "东南亚菜", "泰国菜", "越南菜",
    // 烘焙/甜品
    "烘焙", "面包", "蛋糕", "甜品", "糖水",
    // 自助/其他
    "自助餐", "自助", "海鲜", "小龙虾", "烤鱼", "酸菜鱼",
    // 品牌
    "海底捞", "巴奴", "必胜客", "肯德基", "麦当劳",
  ],
  pharmacy: ["药店", "药房", "诊所", "医保", "中药", "西药", "门诊"],
  fresh_grocery: ["生鲜", "菜市场", "蔬菜", "水果", "农贸", "水产", "肉铺"],
  supermarket: ["超市", "百货", "购物中心", "仓储", "商场", "商超", "mall", "购物广场"],
  hotel: ["酒店", "宾馆", "住宿", "民宿", "旅馆", "客栈", "青旅"],
  medical_aesthetics: ["医美", "口腔", "整形", "美容", "牙科", "植发", "眼科"],
  education: ["培训", "教育", "学校", "幼教", "补习", "托管", "早教", "驾校"],
  pet_service: ["宠物", "动物", "兽医", "猫", "狗", "宠物店", "宠物医院"],
  logistics: ["快递", "物流", "驿站", "配送", "仓储", "货运", "菜鸟", "顺丰"],
  auto4s: ["4S", "汽车销售", "汽车维修", "二手车", "汽修", "洗车", "汽车美容"],
};

/**
 * Normalize a user-provided category string to a system industry code.
 * Returns the normalized industry code, or undefined if unrecognized.
 * Also returns sub_category (the original user input) for fine-grained filtering.
 */
export function normalizeIndustry(category: string): { industry: string; subCategory?: string } | undefined {
  if (!category || typeof category !== "string") return undefined;
  const raw = category.trim();
  if (!raw) return undefined;

  // Direct system code match
  const KNOWN = Object.keys(INDUSTRY_CATEGORY_MAP);
  if (KNOWN.includes(raw.toLowerCase())) {
    return { industry: raw.toLowerCase() };
  }

  // Keyword match against INDUSTRY_CATEGORY_MAP
  for (const [industry, keywords] of Object.entries(INDUSTRY_CATEGORY_MAP)) {
    for (const kw of keywords) {
      if (raw.includes(kw)) {
        return { industry, subCategory: raw };
      }
    }
  }

  // Fallback: unrecognized category, keep as-is
  return { industry: raw, subCategory: raw };
}
