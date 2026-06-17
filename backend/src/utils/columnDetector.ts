/**
 * Smart column detection for Excel uploads.
 * Core columns (name/address/lng/lat/category) require user confirmation if auto-detect fails.
 * Extended columns auto-detected and stored in metadata without blocking upload flow.
 */

export interface DetectedColumns {
  nameCol: number | null;
  addressCol: number | null;
  lngCol: number | null;
  latCol: number | null;
  categoryCol: number | null;
  // Extended columns — auto-detected, no user confirmation needed
  revenueCol: number | null;
  floorAreaCol: number | null;
  brandScoreCol: number | null;
  avgCostCol: number | null;        // 人均消费
  ratingCol: number | null;          // 评分/星级
  tagsCol: number | null;            // 标签
  openTimeCol: number | null;        // 营业时间
  parkingCol: number | null;         // 停车位
  headers: string[];
}

// ---- Core patterns (user must confirm if not detected) ----

const NAME_PATTERNS = [
  /^(名称|名字|网点|门店|站点|name|title|label|站点名|客户名|店名)/i,
];

const ADDRESS_PATTERNS = [
  /^(地址|address|addr|详细地址|位置|location|所在地)/i,
];

const LNG_PATTERNS = [
  /^(经度|lng|longitude|lon|经|x|x坐标|easting)/i,
];

const LAT_PATTERNS = [
  /^(纬度|lat|latitude|纬|y|y坐标|northing)/i,
];

const CATEGORY_PATTERNS = [
  /^(类别|分类|行业|业态|category|type|industry|品类|经营品类)/i,
];

// ---- Extended patterns (auto-detect, stored in metadata) ----

const REVENUE_PATTERNS = [
  /^(营业额|营收|日营业额|月营业额|年营业额|revenue|sales|income|流水|日均营收)/i,
];

const FLOOR_AREA_PATTERNS = [
  /^(面积|占地面积|营业面积|floor.area|area|sqm|m²|平米|平方米)/i,
];

const BRAND_SCORE_PATTERNS = [
  /^(品牌分|品牌评分|brand.score|brand|品牌等级|品牌力)/i,
];

const AVG_COST_PATTERNS = [
  /^(人均消费|人均|客单价|avg.cost|per.capita|均价|人均价格)/i,
];

const RATING_PATTERNS = [
  /^(评分|星级|rating|score|star|评价|口碑分|大众点评分)/i,
];

const TAGS_PATTERNS = [
  /^(标签|tags|特色|特点|tag|关键词)/i,
];

const OPEN_TIME_PATTERNS = [
  /^(营业时间|opentime|open.time|营业时段|工作时间|business.hours)/i,
];

const PARKING_PATTERNS = [
  /^(停车位|停车|parking|车位|停车场)/i,
];

function matchAny(header: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(header.trim()));
}

export function detectColumns(headers: string[]): DetectedColumns {
  const result: DetectedColumns = {
    nameCol: null,
    addressCol: null,
    lngCol: null,
    latCol: null,
    categoryCol: null,
    revenueCol: null,
    floorAreaCol: null,
    brandScoreCol: null,
    avgCostCol: null,
    ratingCol: null,
    tagsCol: null,
    openTimeCol: null,
    parkingCol: null,
    headers,
  };

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim();

    // Core columns (first-match wins, no override)
    if (result.nameCol === null && matchAny(h, NAME_PATTERNS)) result.nameCol = i;
    if (result.addressCol === null && matchAny(h, ADDRESS_PATTERNS)) result.addressCol = i;
    if (result.lngCol === null && matchAny(h, LNG_PATTERNS)) result.lngCol = i;
    if (result.latCol === null && matchAny(h, LAT_PATTERNS)) result.latCol = i;
    if (result.categoryCol === null && matchAny(h, CATEGORY_PATTERNS)) result.categoryCol = i;

    // Extended columns (also first-match, no override)
    if (result.revenueCol === null && matchAny(h, REVENUE_PATTERNS)) result.revenueCol = i;
    if (result.floorAreaCol === null && matchAny(h, FLOOR_AREA_PATTERNS)) result.floorAreaCol = i;
    if (result.brandScoreCol === null && matchAny(h, BRAND_SCORE_PATTERNS)) result.brandScoreCol = i;
    if (result.avgCostCol === null && matchAny(h, AVG_COST_PATTERNS)) result.avgCostCol = i;
    if (result.ratingCol === null && matchAny(h, RATING_PATTERNS)) result.ratingCol = i;
    if (result.tagsCol === null && matchAny(h, TAGS_PATTERNS)) result.tagsCol = i;
    if (result.openTimeCol === null && matchAny(h, OPEN_TIME_PATTERNS)) result.openTimeCol = i;
    if (result.parkingCol === null && matchAny(h, PARKING_PATTERNS)) result.parkingCol = i;
  }

  return result;
}

/**
 * Validate that minimum required columns are detected.
 */
export function validateDetection(detected: DetectedColumns): string[] {
  const errors: string[] = [];

  if (detected.lngCol === null && detected.latCol === null) {
    errors.push("未检测到经度/纬度列，请手动指定包含坐标的列");
  }
  if (detected.lngCol !== null && detected.latCol === null) {
    errors.push("检测到经度列但未检测到纬度列");
  }
  if (detected.lngCol === null && detected.latCol !== null) {
    errors.push("检测到纬度列但未检测到经度列");
  }

  return errors;
}
