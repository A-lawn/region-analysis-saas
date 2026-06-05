import { convertCoord } from "../src/utils/coordTransform";

describe("Coordinate Transform", () => {
  it("should return same when source == target", () => {
    const result = convertCoord(116.4, 39.9, "gcj02", "gcj02");
    expect(result.lng).toBeCloseTo(116.4, 6);
    expect(result.lat).toBeCloseTo(39.9, 6);
  });

  it("should convert WGS84 to GCJ02", () => {
    const result = convertCoord(116.397428, 39.90923, "wgs84", "gcj02");
    expect(result.lng).toBeGreaterThan(116);
    expect(result.lng).toBeLessThan(117);
    expect(result.lat).toBeGreaterThan(39);
    expect(result.lat).toBeLessThan(40);
  });

  it("should reject out-of-range coordinates", () => {
    expect(() => convertCoord(200, 50, "wgs84", "gcj02")).toThrow();
    expect(() => convertCoord(100, 100, "wgs84", "gcj02")).toThrow();
  });

  it("should reject NaN coordinates", () => {
    expect(() => convertCoord(NaN, 39, "wgs84", "gcj02")).toThrow();
  });

  it("should round-trip GCJ02 <-> BD09", () => {
    const original = { lng: 116.404, lat: 39.915 };
    const bd09 = convertCoord(original.lng, original.lat, "gcj02", "bd09");
    const back = convertCoord(bd09.lng, bd09.lat, "bd09", "gcj02");
    expect(back.lng).toBeCloseTo(original.lng, 5);
    expect(back.lat).toBeCloseTo(original.lat, 5);
  });
});