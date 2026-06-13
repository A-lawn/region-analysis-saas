import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env manually
try {
  const envPath = resolve(__dirname, "..", "..", ".env");
  const envFile = readFileSync(envPath, "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        const val = trimmed.substring(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
} catch (e) {
  // .env file not found, use system env vars
}

import 'express-async-errors';
import express from "express";
import cors from "cors";
import path from "path";
import { config } from "./config";
import { testConnection } from "./db";
import { connectRedis } from "./services/cacheService";
import './workers/analysisWorker';
import webController from "./controllers/webController";
import apiV1Controller from "./controllers/apiV1Controller";
import authController from "./controllers/authController";
import { authRequired } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import logger from "./utils/logger";
import { ensureBackupDir, cleanExpiredBackups } from "./services/backupService";
import { globalLimiter } from "./middleware/rateLimit";

const app = express();

const allowedOrigin = process.env.APP_URL || "http://localhost:8080";
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(globalLimiter);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const publicPath = path.resolve(__dirname, "..", "..", "public");
app.use(express.static(publicPath));

app.use("/api/web", webController);
app.use("/api/auth", authController);
app.use("/api/v1", apiV1Controller);

// 4.5 Enhanced health check with Redis status
app.get("/api/health", async (_req, res) => {
  try {
    const { testConnection } = require("./db");
    const { getRedis } = require("./services/cacheService");
    const dbOk = await testConnection();
    const redisOk = getRedis()?.status === "ready" || getRedis()?.status === "connect";

    res.json({
      status: dbOk ? "healthy" : "degraded",
      database: dbOk ? "connected" : "disconnected",
      redis: redisOk ? "connected" : "disconnected",
      uptime: process.uptime(),
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ status: "unhealthy" });
  }
});

// 4.5 Readiness probe: checks DB + Redis
app.get("/api/health/readiness", async (_req, res) => {
  try {
    const { testConnection } = require("./db");
    const { getRedis } = require("./services/cacheService");
    const dbOk = await testConnection();
    const redisOk = getRedis()?.status === "ready" || getRedis()?.status === "connect";

    if (dbOk && redisOk) {
      res.json({ status: "ready" });
    } else {
      res.status(503).json({ status: "not_ready", database: dbOk, redis: redisOk });
    }
  } catch {
    res.status(503).json({ status: "not_ready" });
  }
});


// 4.11 Report export — full analysis report with industry-aware insights
app.get("/api/web/projects/:id/export/report", authRequired, async (req, res) => {
  try {
    const { getProjectSummary } = require("./services/projectService");
    const { computeCoverage, computeKDEHeatmap, computeClusters } = require("./services/spatialAnalysis");
    const { generateAdvice } = require("./services/decisionEngine");
    const { compareWithBenchmarks } = require("./services/analysis/benchmarkService");
    const { loadIndustryConfig } = require("./services/analysis/industryLoader");

    const projectId = req.params.id;
    const summary = await getProjectSummary(projectId);
    if (!summary) { res.status(404).json({ error: "项目不存在" }); return; }

    const industry = (req.query.industry as string) || summary.industry || undefined;

    let industryConfig: any = null;
    if (industry) {
      try { industryConfig = await loadIndustryConfig(industry); } catch {}
    }
    const serviceRadius = industryConfig?.radiusMeters || summary.stats?.avgNeighborDistM || 1000;

    const report: any = {
      summary,
      generatedAt: new Date().toISOString(),
    };

    // ---- 1. Multi-radius Coverage ----
    const radii = [Math.round(serviceRadius * 0.6), serviceRadius, Math.round(serviceRadius * 1.5)]
      .filter((v, i, a) => a.indexOf(v) === i);
    report.coverageAnalysis = { radii: [] as any[] };
    for (const r of radii) {
      try {
        const cov = await computeCoverage(projectId, r, { industry, decayMode: true, includeWhiteSpace: true });
        report.coverageAnalysis.radii.push({
          radiusMeters: r,
          coveredAreaSqm: cov.coveredArea,
          effectiveCoverageRatio: cov.effectiveCoverageRatio,
          overlapRatio: cov.triangulation?.overlapRatio,
          gapRatio: cov.triangulation?.gapRatio,
          cannibalizationIndex: cov.cannibalizationIndex,
          connectivity: cov.triangulation?.coverageConnectivity,
        });
      } catch (e: any) {
        report.coverageAnalysis.radii.push({ radiusMeters: r, error: e.message });
      }
    }

    // ---- 2. Decision Advice ----
    try {
      const mainCov = await computeCoverage(projectId, serviceRadius, { industry });
      report.decisionAdvice = await generateAdvice({
        pointCount: summary.stats?.pointCount || 0,
        triangulation: mainCov.triangulation,
        cannibalizationIndex: mainCov.cannibalizationIndex,
        industry,
      });
    } catch (e: any) {
      report.decisionAdvice = [{ priority: "medium", message: "决策分析暂不可用: " + e.message }];
    }

    // ---- 3. Benchmark Comparison ----
    if (industry) {
      try {
        const mainCov = await computeCoverage(projectId, serviceRadius, { industry });
        report.benchmarkComparison = await compareWithBenchmarks(industry, {
          coverageRatio: mainCov.effectiveCoverageRatio,
          overlapRatio: mainCov.triangulation?.overlapRatio,
          gapRatio: mainCov.triangulation?.gapRatio,
          cannibalizationIndex: mainCov.cannibalizationIndex,
          pointCount: summary.stats?.pointCount || 0,
          avgNeighborDistM: summary.stats?.avgNeighborDistM || 0,
        });
        report.industryInfo = {
          industry,
          displayName: industryConfig?.displayName,
          serviceRadiusMeters: serviceRadius,
          kpiWeights: industryConfig?.kpiWeights || {},
          decisionThresholds: industryConfig?.decisionThresholds || {},
        };
      } catch (e: any) {
        report.benchmarkComparison = { error: e.message };
      }
    }

    // ---- 4. Heatmap ----
    try { report.heatmap = await computeKDEHeatmap(projectId, undefined, undefined, { industry }); } catch (e: any) { report.heatmap = { error: e.message }; }

    // ---- 5. Clusters ----
    try { report.clusters = await computeClusters(projectId); } catch (e: any) { report.clusters = { error: e.message }; }

    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// Unified error handler (must be registered last)
app.use(errorHandler);

async function start() {
  const dbOk = await testConnection();
  if (!dbOk) {
    logger.fatal("Cannot start without database");
    process.exit(1);
  }

  // Connect Redis (non-fatal)
  await connectRedis();

  // Initialize backup directory
  try {
    await ensureBackupDir();
    // Run cleanup every 24 hours
    setInterval(() => {
      cleanExpiredBackups(config.backup.retentionDays).catch((err: any) =>
        logger.error({ err }, "Backup cleanup failed")
      );
    }, 24 * 3600 * 1000);
    logger.info({ dir: config.backup.dir, retentionDays: config.backup.retentionDays }, "Backup system initialized");
  } catch (err: any) {
    logger.error({ err }, "Backup system initialization failed");
  }

  app.listen(config.port, () => {
    logger.info("=============================================");
    logger.info("  区域数据分析平台 v1.0");
    logger.info({ port: config.port, env: config.nodeEnv }, "Server listening");
    logger.info("=============================================");
  });
}

start().catch((err) => logger.fatal(err, "Startup failed"));

export default app;