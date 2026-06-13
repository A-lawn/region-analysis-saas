import crypto from "crypto";
import { cacheGet, cacheSet } from "../cacheService";

export async function cached<T>(key: string, ttl: number, compute: () => Promise<T>): Promise<T> {
  const cached = await cacheGet(key);
  if (cached) {
    return JSON.parse(cached) as T;
  }
  const result = await compute();
  await cacheSet(key, JSON.stringify(result), ttl);
  return result;
}

export function paramsHash(params: Record<string, any>): string {
  return crypto.createHash("md5").update(JSON.stringify(params)).digest("hex").slice(0, 12);
}
