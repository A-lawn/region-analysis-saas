// Configuration loaded from environment variables
import { resolve } from "path";

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET || "",
  db: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME || "region_analysis",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    max: parseInt(process.env.DB_POOL_MAX || "10", 10),
    idleTimeoutMillis: 30000,
  },
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    url: process.env.REDIS_URL || "",
  },
  cache: {
    ttl: parseInt(process.env.CACHE_TTL || "3600", 10), // seconds
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "465", 10),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    fromEmail: process.env.SMTP_FROM_EMAIL || "",
    fromName: process.env.SMTP_FROM_NAME || "区域数据分析平台",
  },
  amap: {
    webKey: process.env.AMAP_WEB_KEY || "",
    serverKey: process.env.AMAP_SERVER_KEY || "",
  },
  upload: {
    maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB || "50", 10),
  },
  analysis: {
    coverageRadii: [1000, 3000, 5000, 10000],
    dbscanEps: 500,
    dbscanMinPoints: 3,
    kdeBandwidth: 1000,
    kdeGridSize: 500,
  },
  coverage: {
    industryRadii: [
      { industry: "convenience", label: "便利店", radiusMeters: 300 },
      { industry: "restaurant", label: "餐饮", radiusMeters: 500 },
      { industry: "pharmacy", label: "药店", radiusMeters: 800 },
      { industry: "supermarket", label: "商超", radiusMeters: 3000 },
      { industry: "auto4s", label: "汽车4S店", radiusMeters: 10000 },
    ],
  },
  backup: {
    dir: resolve(__dirname, "..", "backups"),
    retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || "180", 10),
  },
};
