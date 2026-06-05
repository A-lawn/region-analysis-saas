import pgPromise from "pg-promise";
import { config } from "./config";
import logger from "./utils/logger";

const pgp = pgPromise({ capSQL: true });

export const db = pgp({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: config.db.max,
  idleTimeoutMillis: config.db.idleTimeoutMillis,
});

export async function testConnection(): Promise<boolean> {
  try {
    const result = await db.one("SELECT PostGIS_full_version()");
    logger.info({ version: result.postgis_full_version?.substring(0, 80) }, "PostGIS connected");
    return true;
  } catch (err) {
    logger.error({ err }, "Database connection failed");
    return false;
  }
}

export default db;
