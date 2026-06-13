import { resolve } from "path";

// App-level configuration loaded from environment & DB
// Replaces scattered hardcoded values in config.ts

export interface AppConfig {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    max: number;
    idleTimeoutMillis: number;
  };
  redis: {
    host: string;
    port: number;
    url: string;
  };
  cache: {
    ttl: number; // seconds
  };
  smtp: {
    host: string;
    port: number;
    user: string;
    pass: string;
    fromEmail: string;
    fromName: string;
  };
  amap: {
    webKey: string;
    serverKey: string;
  };
  upload: {
    maxFileSizeMB: number;
  };
  backup: {
    dir: string;
    retentionDays: number;
  };
}

function getBackupDir(): string {
  // __dirname points to config/ directory
  return resolve(__dirname, "..", "..", "backups");
}

export function loadAppConfig(): AppConfig {
  return {
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
      ttl: parseInt(process.env.CACHE_TTL || "3600", 10),
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
    backup: {
      dir: getBackupDir(),
      retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || "180", 10),
    },
  };
}
