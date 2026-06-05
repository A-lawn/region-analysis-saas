import { detectColumns, validateDetection } from "../src/utils/columnDetector";

describe("Column Detector", () => {
  it("should detect Chinese headers", () => {
    const headers = ["名称", "地址", "经度", "纬度"];
    const result = detectColumns(headers);
    expect(result.nameCol).toBe(0);
    expect(result.addressCol).toBe(1);
    expect(result.lngCol).toBe(2);
    expect(result.latCol).toBe(3);
    expect(validateDetection(result)).toHaveLength(0);
  });

  it("should detect English headers", () => {
    const headers = ["Name", "Address", "Longitude", "Latitude"];
    const result = detectColumns(headers);
    expect(result.nameCol).toBe(0);
    expect(result.addressCol).toBe(1);
    expect(result.lngCol).toBe(2);
    expect(result.latCol).toBe(3);
  });

  it("should warn when lng/lat columns missing", () => {
    const headers = ["名称", "描述", "数量"];
    const result = detectColumns(headers);
    const errors = validateDetection(result);
    expect(errors.length).toBeGreaterThan(0);
  });
});

