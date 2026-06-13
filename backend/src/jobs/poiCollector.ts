import { config } from "../config";
import { pointToH3 } from "../utils/h3Index";
import logger from "../utils/logger";

const AMAP_POI_URL = "https://restapi.amap.com/v3/place/text";
const QPS_LIMIT_MS = 200;

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

if (require.main === module) {
  const { db } = require("../db");
  runCollector(db).catch((e: any) => logger.error(e)).finally(() => process.exit(0));
}