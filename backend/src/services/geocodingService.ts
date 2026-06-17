import logger from "../utils/logger";
import { config } from "../config";

export async function geocode(address: string): Promise<{ lng: number; lat: number; formattedAddress: string } | null> {
  const key = config.amap.serverKey;
  if (!key) {
    throw new Error("AMAP_SERVER_KEY not configured");
  }
  const url = `https://restapi.amap.com/v3/geocode/geo?key=${key}&address=${encodeURIComponent(address)}&output=JSON`;
  try {
    const response = await fetch(url);
    const data: any = await response.json();
    if (data.status === "1" && data.geocodes && data.geocodes.length > 0) {
      const geo = data.geocodes[0];
      const loc = geo.location.split(",");
      return {
        lng: parseFloat(loc[0]),
        lat: parseFloat(loc[1]),
        formattedAddress: geo.formatted_address || address,
      };
    }
    return null;
  } catch (err) {
    logger.warn({ error: (err as any).message || String(err) }, "[Geocode] Failed");
    return null;
  }
}

export async function reverseGeocode(lng: number, lat: number): Promise<string | null> {
  const key = config.amap.serverKey;
  if (!key) {
    throw new Error("AMAP_SERVER_KEY not configured");
  }
  const url = `https://restapi.amap.com/v3/geocode/regeo?key=${key}&location=${lng},${lat}&output=JSON`;
  try {
    const response = await fetch(url);
    const data: any = await response.json();
    if (data.status === "1" && data.regeocode) {
      return data.regeocode.formatted_address || null;
    }
    return null;
  } catch (err) {
    logger.warn({ error: (err as any).message || String(err) }, "[ReverseGeocode] Failed");
    return null;
  }
}