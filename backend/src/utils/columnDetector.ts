/**
 * Smart column detection for Excel uploads.
 * Recognizes common Chinese/English/pinyin column headers.
 */

export interface DetectedColumns {
  nameCol: number | null;     // 0-based index
  addressCol: number | null;
  lngCol: number | null;
  latCol: number | null;
  headers: string[];
}

const NAME_PATTERNS = [
  /^(名称|名字|网点|门店|站点|name|title|label|站点名|客户名)/i,
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

const COMBINED_COORD_PATTERNS = [
  /^(坐标|coord|coordinate|position|point|点位)/i,
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
    headers,
  };

  // First, try matching combined coordinate columns (like "坐标" or "coord")
  // that might contain "lng,lat" format — we skip these for now, user select manually
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim();

    if (result.nameCol === null && matchAny(h, NAME_PATTERNS)) {
      result.nameCol = i;
    }

    if (result.addressCol === null && matchAny(h, ADDRESS_PATTERNS) && !matchAny(h, COMBINED_COORD_PATTERNS)) {
      result.addressCol = i;
    }

    if (result.lngCol === null && matchAny(h, LNG_PATTERNS) && !matchAny(h, COMBINED_COORD_PATTERNS)) {
      result.lngCol = i;
    }

    if (result.latCol === null && matchAny(h, LAT_PATTERNS) && !matchAny(h, COMBINED_COORD_PATTERNS)) {
      result.latCol = i;
    }
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
