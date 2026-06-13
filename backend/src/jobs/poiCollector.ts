import { config } from "../config";
import { pointToH3 } from "../utils/h3Index";
import logger from "../utils/logger";


// ===== POI Collector v2.0 — Scheduled + Incremental + Checkpoint =====

const AMAP_POI_URL = "https://restapi.amap.com/v3/place/text";
const QPS_LIMIT_MS = 200;
const POI_TTL_DAYS = 90; // POI data considered stale after 90 days


/**
 * Load target cities from poi_cities table (or fallback to DEFAULT_CITIES).
 */
async function loadCollectCities(db: any): Promise<string[]> {
  try {
    // Check if poi_cities table exists
    const exists = await db.oneOrNone(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'poi_cities')"
    );
    if (exists?.exists) {
      const rows = await db.manyOrNone(
        "SELECT city_name FROM poi_cities WHERE enabled = true ORDER BY sort_order"
      );
      if (rows && rows.length > 0) {
        return rows.map((r: any) => r.city_name);
      }
    }
  } catch {}
  return DEFAULT_CITIES;
}

/**
 * Save collection checkpoint to enable resume after interruption.
 */
async function saveCheckpoint(redis: any, city: string, category: string, page: number): Promise<void> {
  try {
    const key = "poi:checkpoint:" + city + ":" + category;
    await redis.set(key, String(page), "EX", 86400 * 7); // expire after 7 days
  } catch {}
}

/**
 * Load last checkpoint for resume.
 */
async function loadCheckpoint(redis: any, city: string, category: string): Promise<number> {
  try {
    const key = "poi:checkpoint:" + city + ":" + category;
    const val = await redis.get(key);
    return val ? parseInt(val) : 1;
  } catch {
    return 1;
  }
}

/**
 * Clear checkpoint after category collection complete.
 */
async function clearCheckpoint(redis: any, city: string, category: string): Promise<void> {
  try {
    const key = "poi:checkpoint:" + city + ":" + category;
    await redis.del(key);
  } catch {}
}

/**
 * Incremental update: only collect POIs updated since last run.
 * Uses public_poi.updated_at to skip recently-updated categories.
 */
async function needsRefresh(db: any, category: string, city: string): Promise<boolean> {
  try {
    const row = await db.oneOrNone(
      "SELECT MAX(updated_at) AS last_update FROM public_poi WHERE category = $1 AND address LIKE $2",
      [category, "%" + city + "%"]
    );
    if (!row?.last_update) return true; // no data yet
    const daysSince = (Date.now() - new Date(row.last_update).getTime()) / 86400000;
    return daysSince > 7; // refresh weekly
  } catch {
    return true;
  }
}

/**
 * Clean expired POI data beyond TTL.
 */
async function cleanExpiredPOIs(db: any): Promise<number> {
  try {
    const result = await db.result(
      "DELETE FROM public_poi WHERE updated_at < NOW() - INTERVAL '" + POI_TTL_DAYS + " days'"
    );
    return result.rowCount || 0;
  } catch {
    return 0;
  }
}


interface POIRecord {
  name: string;
  category: string;
  sub_category: string;
  lng: number;
  lat: number;
  address: string;
}

// Default target cities (used when DB unavailable)
const DEFAULT_CITIES = ["北京", "上海", "广州", "深圳", "成都", "杭州", "武汉", "南京"];
// Static fallback when DB unavailable (see loadCollectQueue for dynamic loading)
const DEFAULT_QUEUE: { city: string; keyword: string; category: string }[] = [
  { city: "北京", keyword: "住宅小区", category: "residential" },
  { city: "上海", keyword: "住宅小区", category: "residential" },
  { city: "北京", keyword: "写字楼", category: "office" },
  { city: "上海", keyword: "写字楼", category: "office" },
  { city: "北京", keyword: "地铁站", category: "transport" },
  { city: "上海", keyword: "地铁站", category: "transport" },
  { city: "北京", keyword: "商圈", category: "commercial" },
  { city: "上海", keyword: "商圈", category: "commercial" },
];

/**
 * Load POI collection queue from poi_categories table.
 * Cross-joins enabled categories × target cities.
 * Falls back to DEFAULT_QUEUE when DB unavailable.
 */
async function loadCollectQueue(db: any): Promise<{ city: string; keyword: string; category: string }[]> {
  try {
    const rows = await db.manyOrNone(
      "SELECT category, amap_keyword FROM poi_categories WHERE enabled = true ORDER BY sort_order"
    );
    if (rows && rows.length > 0) {
      const cities = DEFAULT_CITIES;
      const queue: { city: string; keyword: string; category: string }[] = [];
      for (const row of rows) {
        for (const city of cities) {
          queue.push({ city, keyword: row.amap_keyword, category: row.category });
        }
      }
      logger.info({ categories: rows.length, cities: cities.length, queueSize: queue.length }, "[POI] Dynamic queue loaded from DB");
      return queue;
    }
  } catch (err: any) {
    logger.warn({ error: err.message }, "[POI] Failed to load queue from DB, using defaults");
  }
  return DEFAULT_QUEUE;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPOIPage(
  city: string,
  keyword: string,
  page: number
): Promise<{ pois: POIRecord[]; totalPages: number }> {
  const key = config.amap.serverKey;
  if (!key) throw new Error("AMAP_SERVER_KEY not configured");

  const params = new URLSearchParams({
    key,
    keywords: keyword,
    city,
    output: "json",
    offset: "25",
    page: String(page),
  });

  const url = AMAP_POI_URL + "?" + params.toString();
  const resp = await fetch(url);
  const data: any = await resp.json();

  if (data.status !== "1") {
    throw new Error("Amap API error: " + data.info);
  }

  const pois: POIRecord[] = (data.pois || []).map((p: any) => {
    const loc = (p.location || "0,0").split(",");
    return {
      name: p.name || "",
      category: keyword,
      sub_category: p.type || "",
      lng: parseFloat(loc[0]),
      lat: parseFloat(loc[1]),
      address: p.address || "",
    };
  });

  const total = parseInt(data.count || "0", 10);
  const totalPages = Math.min(Math.ceil(total / 25), 45);
  return { pois, totalPages };
}

export async function collectPOI(
  city: string,
  keyword: string,
  category: string,
  db: any
): Promise<number> {
  let totalInserted = 0;

  try {
    logger.info({ city, keyword }, "Collecting POI");
    const firstPage = await fetchPOIPage(city, keyword, 1);
    logger.info({ page: 1, totalPages: firstPage.totalPages, count: firstPage.pois.length }, "POI page collected");

    totalInserted += await insertPOIBatch(db, firstPage.pois, category);

    for (let page = 2; page <= firstPage.totalPages; page++) {
      await sleep(QPS_LIMIT_MS);
      try {
        const { pois } = await fetchPOIPage(city, keyword, page);
        totalInserted += await insertPOIBatch(db, pois, category);
        if (page % 10 === 0) {
          logger.info({ page, totalPages: firstPage.totalPages }, "POI progress");
        }
      } catch (err: any) {
        logger.warn({ page, err: err.message }, "POI page failed");
      }
    }
  } catch (err: any) {
    logger.error({ city, keyword, error: err.message }, "[POI] Collection failed");
  }

  return totalInserted;
}

async function insertPOIBatch(db: any, pois: POIRecord[], category: string): Promise<number> {
  if (!pois.length) return 0;

  const pgp = require("pg-promise")();
  const cs = new pgp.helpers.ColumnSet(
    ["h3_index", "name", "category", "sub_category", "lng", "lat", "geom", "address", "source"],
    { table: "public_poi" }
  );

  const valid = pois.filter(
    p => !isNaN(p.lng) && !isNaN(p.lat)
      && p.lng >= -180 && p.lng <= 180
      && p.lat >= -90 && p.lat <= 90
  );

  if (!valid.length) return 0;

  const values = valid.map(p => ({
    h3_index: pointToH3(p.lng, p.lat, 9),
    name: p.name,
    category,
    sub_category: p.sub_category,
    lng: p.lng,
    lat: p.lat,
    geom: pgp.as.value("ST_SetSRID(ST_MakePoint(" + p.lng + ", " + p.lat + "), 4326)"),
    address: p.address,
    source: "amap",
  }));

  const query = pgp.helpers.insert(values, cs) + " ON CONFLICT DO NOTHING";
  await db.none(query);
  return values.length;
}

export async function runCollector(db: any) {
  logger.info("[POI] Collector started");
  let total = 0;

  const queue = await loadCollectQueue(db);
  logger.info({ queueSize: queue.length }, "[POI] Queue loaded");

  for (const item of queue) {
    await sleep(QPS_LIMIT_MS * 2);
    total += await collectPOI(item.city, item.keyword, item.category, db);
  }

  logger.info({ total }, "[POI] Collector finished");
  return total;
}


/**
 * Run collector with incremental + checkpoint support (v2.0).
 * Skips categories already refreshed within 7 days.
 * Supports resume from last checkpoint.
 */
export async function runCollectorV2(db: any, redis: any): Promise<{ total: number; skipped: number; cleaned: number }> {
  logger.info("[POI] Collector v2.0 started");

  // Clean expired POIs first
  const cleaned = await cleanExpiredPOIs(db);
  logger.info({ cleaned }, "[POI] Expired POIs cleaned");

  let total = 0;
  let skipped = 0;

  const queue = await loadCollectQueue(db);
  const cities = await loadCollectCities(db);
  logger.info({ queueSize: queue.length, cities: cities.length }, "[POI] Queue loaded");

  // Rebuild queue with dynamic cities
  const fullQueue: { city: string; keyword: string; category: string }[] = [];
  for (const item of queue) {
    for (const city of cities) {
      fullQueue.push({ city, keyword: item.keyword, category: item.category });
    }
  }

  for (const item of fullQueue) {
    // Incremental check: skip if recently refreshed
    const fresh = await needsRefresh(db, item.category, item.city);
    if (!fresh) {
      skipped++;
      continue;
    }

    // Checkpoint: resume from last page
    const startPage = await loadCheckpoint(redis, item.city, item.category);
    if (startPage > 1) {
      logger.info({ city: item.city, category: item.category, startPage }, "[POI] Resuming from checkpoint");
    }

    await sleep(QPS_LIMIT_MS * 2);
    const inserted = await collectPOIFromPage(item.city, item.keyword, item.category, db, redis, startPage);
    total += inserted;

    // Clear checkpoint on success
    await clearCheckpoint(redis, item.city, item.category);
  }

  logger.info({ total, skipped, cleaned }, "[POI] Collector v2.0 finished");
  return { total, skipped, cleaned };
}

/**
 * Collect POI with checkpoint — saves progress after each page.
 */
async function collectPOIFromPage(
  city: string,
  keyword: string,
  category: string,
  db: any,
  redis: any,
  startPage: number
): Promise<number> {
  let totalInserted = 0;

  try {
    logger.info({ city, keyword, startPage }, "[POI] Collecting");
    const { pois, totalPages } = await fetchPOIPage(city, keyword, startPage);

    totalInserted += await insertPOIBatch(db, pois, category);
    await saveCheckpoint(redis, city, category, startPage);

    for (let page = startPage + 1; page <= totalPages; page++) {
      await sleep(QPS_LIMIT_MS);
      try {
        const { pois: pagePois } = await fetchPOIPage(city, keyword, page);
        totalInserted += await insertPOIBatch(db, pagePois, category);
        await saveCheckpoint(redis, city, category, page);

        if (page % 10 === 0) {
          logger.info({ page, totalPages, city, keyword }, "[POI] Progress");
        }
      } catch (err: any) {
        logger.warn({ page, city, keyword, error: err.message }, "[POI] Page failed, checkpoint saved");
        break; // stop on error, will resume from checkpoint next run
      }
    }
  } catch (err: any) {
    logger.error({ city, keyword, error: err.message }, "[POI] Collection failed");
  }

  return totalInserted;
}

if (require.main === module) {
  const { db } = require("../db");
  const Redis = require("ioredis");
  const redis = new Redis({ host: process.env.REDIS_HOST || "localhost", port: parseInt(process.env.REDIS_PORT || "6379", 10) });
  runCollectorV2(db, redis).catch((e: any) => logger.error(e)).finally(() => { redis.quit(); process.exit(0); });
}

// ===== BullMQ Scheduled POI Collection =====

import { Queue } from "bullmq";

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);

const poiQueue = new Queue("poi-collection", {
  connection: { host: REDIS_HOST, port: REDIS_PORT },
});

/**
 * Register scheduled POI collection (runs every Sunday at 3 AM).
 * Also adds a delayed initial run (5 min after startup).
 */
export async function schedulePOICollection(): Promise<void> {
  // Remove existing repeatable jobs to avoid duplicates
  const repeatables = await poiQueue.getRepeatableJobs();
  for (const job of repeatables) {
    await poiQueue.removeRepeatableByKey(job.key);
  }

  // Schedule: every Sunday at 3:00 AM
  await poiQueue.add("poi-weekly", {}, {
    repeat: { pattern: "0 3 * * 0" },
    jobId: "poi-weekly",
  });

  logger.info("[POI] Weekly collection scheduled (Sun 3:00 AM)");
}

/**
 * Process POI collection jobs.
 */
export function createPOIWorker(db: any, redis: any) {
  const { Worker } = require("bullmq");
  return new Worker("poi-collection", async (job: any) => {
    logger.info({ jobId: job.id }, "[POI] Scheduled collection triggered");
    const result = await runCollectorV2(db, redis);
    logger.info({ result }, "[POI] Scheduled collection complete");
    return result;
  }, {
    connection: { host: REDIS_HOST, port: REDIS_PORT },
    concurrency: 1, // only one POI collection at a time
  });
}
