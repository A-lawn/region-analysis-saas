import Redis from "ioredis";
import logger from "../utils/logger";

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

let redis: Redis | null = null;
let redisAvailable = false;

export function getRedis(): Redis | null {
  return redisAvailable ? redis : null;
}

export async function connectRedis(): Promise<boolean> {
  try {
    redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      maxRetriesPerRequest: 1,
      retryStrategy() {
        return null;
      },
      lazyConnect: true,
      connectTimeout: 3000,
      enableOfflineQueue: false,
    });

    redis.on("error", (err: Error) => {
      if (!redisAvailable) return;
      logger.warn({ err: err.message }, "Redis runtime error");
    });

    await redis.connect();
    redisAvailable = true;
    logger.info("Redis connected");
    return true;
  } catch (err: any) {
    logger.warn({ err: err.message }, "Redis unavailable, continuing without cache");
    redisAvailable = false;
    redis?.disconnect();
    redis = null;
    return false;
  }
}

export async function cacheGet(key: string): Promise<string | null> {
  if (!redisAvailable || !redis) return null;
  try {
    return await redis.get(key);
  } catch (err) {
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds: number = 3600): Promise<void> {
  if (!redisAvailable || !redis) return;
  try {
    await redis.setex(key, ttlSeconds, value);
  } catch (err) {}
}

export async function cacheDelete(pattern: string): Promise<void> {
  if (!redisAvailable || !redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {}
}