// @ts-nocheck
import coordtransform from "coordtransform";

export type CrsType = "wgs84" | "gcj02" | "bd09";

export function convertCoord(
  lng: number,
  lat: number,
  from: CrsType,
  to: CrsType = "gcj02"
): { lng: number; lat: number } {
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    throw new Error("Coordinate out of range: lng=" + lng + ", lat=" + lat);
  }
  if (isNaN(lng) || isNaN(lat)) {
    throw new Error("Invalid coordinate: lng=" + lng + ", lat=" + lat);
  }
  if (from === to) return { lng, lat };

  if (from === "bd09") {
    const wgs = coordtransform.bd09togcj02(lng, lat);
    if (to === "wgs84") {
      const wgs2 = coordtransform.gcj02towgs84(wgs[0], wgs[1]);
      return { lng: wgs2[0], lat: wgs2[1] };
    }
    return { lng: wgs[0], lat: wgs[1] };
  }

  if (from === "gcj02") {
    if (to === "wgs84") {
      const wgs = coordtransform.gcj02towgs84(lng, lat);
      return { lng: wgs[0], lat: wgs[1] };
    }
    if (to === "bd09") {
      const bd = coordtransform.gcj02tobd09(lng, lat);
      return { lng: bd[0], lat: bd[1] };
    }
  }

  if (from === "wgs84") {
    if (to === "gcj02") {
      const gcj = coordtransform.wgs84togcj02(lng, lat);
      return { lng: gcj[0], lat: gcj[1] };
    }
    if (to === "bd09") {
      const gcj = coordtransform.wgs84togcj02(lng, lat);
      const bd = coordtransform.gcj02tobd09(gcj[0], gcj[1]);
      return { lng: bd[0], lat: bd[1] };
    }
  }

  return { lng, lat };
}

export function convertPointsToGcj02(
  points: { lng: number; lat: number }[],
  from: CrsType
): { lng: number; lat: number }[] {
  return points.map((p) => convertCoord(p.lng, p.lat, from, "gcj02"));
}