import { Router, Request, Response } from "express";
import logger from "../utils/logger";
import multer from "multer";
import * as XLSX from "xlsx";
import { v4 as uuidv4 } from "uuid";
import { detectColumns, validateDetection } from "../utils/columnDetector";
import { processUpload, getProjectSummary, listProjects } from "../services/projectService";
import {
  computeCoverage,
  computeKDEHeatmap,
  computeClusters,
  computeSiteOptimization,
} from "../services/spatialAnalysis";
import { geocode } from "../services/geocodingService";
import { CrsType } from "../utils/coordTransform";
import { config } from "../config";
import { AppError } from "../middleware/errorHandler";
import { authRequired } from "../middleware/auth";
import { validateUpload } from "../validators/uploadValidator";
import {
  validateCoverageParams,
  validateHeatmapParams,
  validateClusterParams,
  validateSiteOptimizationParams,
} from "../validators/analysisValidator";
import { analysisLimiter } from "../middleware/rateLimit";

import { validateProjectName } from "../validators/projectValidator";
import { aggregateByH3 } from "../utils/h3Index";
import { computeVoronoi } from "../services/voronoiService";
import { getTaskStatus } from "../services/analysisService";
import { backupProject, listBackups, restoreProject, removeBackupFile, ensureBackupDir } from "../services/backupService";
import { loadAllIndustryConfigs, loadIndustryConfig } from "../services/analysis/industryLoader";

const router = Router();



// ---- Tenant helper ----
function getTenantId(req: Request): string {
  return (req as any).tenantId || "default";
}

// ---- Safe filename decode: handle Latin-1 → UTF-8 encoding issues on Windows ----
function safeFileName(originalname: string): string {
  try {
    // Check if original has actual Chinese characters (already correct)
    if (/[一-鿿]/.test(originalname)) return originalname;
    
    // Detect double-encoded UTF-8: treat string as Latin-1 bytes, decode as UTF-8
    // If result contains Chinese but original doesn't, we have a garbled name
    const latin1Bytes = Buffer.from(originalname, "latin1");
    const utf8Decoded = latin1Bytes.toString("utf-8");
    if (/[一-鿿]/.test(utf8Decoded)) {
      return utf8Decoded;
    }
  } catch {}
  return originalname;
}

// ---- Multer for file uploads ----
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxFileSizeMB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = safeFileName(file.originalname).toLowerCase();
    if (ext.endsWith(".xlsx") || ext.endsWith(".xls") || ext.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new AppError(400, "只支持 .xlsx, .xls, .csv 格式", "INVALID_FILE_TYPE"));
    }
  },
});

// ---- In-memory storage for upload session (temporary, 10 min TTL) ----
const uploadSessions = new Map<string, { data: any[][]; headers: string[]; sourceCrs: string; fileName: string }>();

// ---- POST /api/web/upload (auth required) ----
router.post("/upload", authRequired, upload.single("file"), validateUpload, async (req: Request, res: Response) => {
  if (!req.file) throw new AppError(400, "请上传Excel文件", "FILE_REQUIRED");

  const sourceCrs = (req.body.source_crs || "gcj02") as CrsType;
  const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (data.length < 2) throw new AppError(400, "Excel文件需要至少包含两行数据", "INSUFFICIENT_DATA");

  const headers = data[0].map((h: any) => String(h || ""));
  const rows = data.slice(1);
  const detection = detectColumns(headers);
  const errors = validateDetection(detection);

  const uploadId = uuidv4();
  uploadSessions.set(uploadId, { data: rows, headers, sourceCrs, fileName: safeFileName(req.file.originalname) });

  // Auto-clean expired sessions (older than 10 min)
  const now = Date.now();
  // Simple cleanup: we use the session only once, so just keep last 50
  if (uploadSessions.size > 50) {
    const keys = [...uploadSessions.keys()];
    for (let i = 0; i < keys.length - 50; i++) uploadSessions.delete(keys[i]);
  }

  const preview = rows.slice(0, 5).map((row, idx) => ({
    rowIndex: idx + 2,
    values: headers.map((h: string, ci: number) => ({ header: h, value: String(row[ci] || "") })),
  }));

  res.json({
    uploadId,
    fileName: safeFileName(req.file.originalname),
    sheetName,
    sourceCrs,
    totalRows: rows.length,
    headers,
    detectedColumns: {
      nameCol: detection.nameCol,
      addressCol: detection.addressCol,
      lngCol: detection.lngCol,
      latCol: detection.latCol,
    },
    warnings: errors,
    preview,
  });
});

// ---- POST /api/web/upload/confirm (auth required) ----
router.post("/upload/confirm", authRequired, validateProjectName, async (req: Request, res: Response) => {
  const { uploadId, columnMapping } = req.body;

  if (!columnMapping || columnMapping.lngCol === null || columnMapping.latCol === null) {
    throw new AppError(400, "必须指定经度和纬度列", "MISSING_COORD_COLUMNS");
  }

  const session = uploadSessions.get(uploadId);
  if (!session) throw new AppError(400, "上传会话已过期，请重新上传文件", "SESSION_EXPIRED");

  const result = await processUpload(
    session.data,
    columnMapping,
    session.sourceCrs as CrsType,
    session.fileName || "导入_" + new Date().toISOString().slice(0, 10),
    getTenantId(req)
  );

  uploadSessions.delete(uploadId);

  if (!result.projectId) {
    throw new AppError(400, result.errors.join("; ") || "数据导入失败", "IMPORT_FAILED");
  }

  res.json({
    projectId: result.projectId,
    rowsParsed: result.rowsParsed,
    rowsInserted: result.rowsInserted,
    errors: result.errors,
  });
});

// ---- GET /api/web/projects (auth required, tenant-scoped) ----
router.get("/projects", authRequired, async (req: Request, res: Response) => {
  const result = await listProjects(getTenantId(req), {
    search: req.query.search as string,
    page: parseInt(req.query.page as string) || 1,
    limit: parseInt(req.query.limit as string) || 20,
  });
  res.json(result);
});

// ---- GET /api/web/projects/:id/summary (auth required) ----
router.get("/projects/:id/summary", authRequired, async (req: Request, res: Response) => {
  const summary = await getProjectSummary(req.params.id);
  if (!summary) throw new AppError(404, "项目不存在", "PROJECT_NOT_FOUND");
  res.json(summary);
});

// ---- Analysis endpoints (auth required) ----
router.get("/projects/:id/analysis/coverage", authRequired, analysisLimiter, validateCoverageParams, async (req: Request, res: Response) => {
  const radius = parseInt(req.query.radius as string) || config.analysis.coverageRadii[0];
  const decayMode = req.query.decay === "true" || req.query.decay === "1";
  const includeWhiteSpace = req.query.whitespace === "true" || req.query.whitespace === "1";
  const rawNetwork = req.query.network as string; const networkMode: "walking" | "driving" | undefined = rawNetwork === "walking" ? "walking" : rawNetwork === "driving" ? "driving" : undefined;
  let clipGeojson: any = undefined;
  if (req.query.clip) { try { clipGeojson = JSON.parse(req.query.clip as string); } catch {} }

  const industry = req.query.industry as string || undefined;
    const opts = { decayMode, includeWhiteSpace, clipGeojson, networkMode, industry };

  // For large datasets (>500 points), use async task queue to avoid timeout
  const db = require("../db").default;
  const cntRow = await db.oneOrNone(
    "SELECT COUNT(*)::INTEGER AS cnt FROM spatial_points WHERE project_id = $[pid]",
    { pid: req.params.id }
  );
  const pointCount = cntRow?.cnt || 0;

  if (pointCount > 500) {
    const { submitAnalysis } = require("../services/analysisService");
    const { taskId } = await submitAnalysis("coverage", req.params.id, { radius, ...opts });
    res.json({ taskId, status: "queued" });
  } else {
    res.json(await computeCoverage(req.params.id, radius, opts));
  }
});

router.get("/projects/:id/analysis/heatmap", authRequired, analysisLimiter, validateHeatmapParams, async (req: Request, res: Response) => {
  const bandwidth = parseInt(req.query.bandwidth as string) || undefined;
  const gridSize = parseInt(req.query.gridSize as string) || undefined;
  let industry = req.query.industry as string || undefined;
  // Auto-detect industry from most common category in project points
  if (!industry) {
    try {
      const db = require("../db").default;
      const row = await db.one(
        "SELECT metadata->>'industry' AS ind, COUNT(*)::INTEGER AS cnt FROM spatial_points WHERE project_id = $1 AND metadata->>'industry' IS NOT NULL GROUP BY metadata->>'industry' ORDER BY cnt DESC LIMIT 1",
        [req.params.id]
      );
      if (row?.ind) industry = row.ind;
    } catch { /* fallback to default KDE params */ }
  }
  const points = await computeKDEHeatmap(req.params.id, bandwidth, gridSize, { industry });
  res.json({ points });
});

router.get("/projects/:id/analysis/clusters", authRequired, analysisLimiter, validateClusterParams, async (req: Request, res: Response) => {
  const eps = parseInt(req.query.eps as string) || config.analysis.dbscanEps;
  const minPoints = parseInt(req.query.minPoints as string) || config.analysis.dbscanMinPoints;
  res.json(await computeClusters(req.params.id, eps, minPoints));
});

router.post("/projects/:id/analysis/site-optimization", authRequired, analysisLimiter, validateSiteOptimizationParams, async (req: Request, res: Response) => {
  const { candidates, weights, topK, industry } = req.body;
  const defaultWeights = { distanceWeight: 0.4, blindSpotWeight: 0.35, densityWeight: 0.25 };
  const mergedWeights = { ...defaultWeights, ...(weights || {}) };
  res.json(await computeSiteOptimization(req.params.id, { candidates, weights: mergedWeights, topK: topK || 5, industry: industry || undefined }));
});

// ---- POST /api/web/geocode (auth required) ----
router.post("/geocode", authRequired, async (req: Request, res: Response) => {
  const { address } = req.body;
  if (!address) throw new AppError(400, "请提供地址", "ADDRESS_REQUIRED");
  const result = await geocode(address);
  if (!result) throw new AppError(404, "地址解析失败，请检查地址是否正确", "GEOCODE_FAILED");
  res.json(result);
});

// ---- POST /api/web/reverse-geocode (auth required) ----
router.post("/reverse-geocode", authRequired, async (req: Request, res: Response) => {
  const { lng, lat } = req.body;
  if (lng == null || lat == null) throw new AppError(400, "请提供坐标", "COORDS_REQUIRED");
  const { reverseGeocode } = require("../services/geocodingService");
  const address = await reverseGeocode(lng, lat);
  if (!address) throw new AppError(404, "反向地址解析失败", "REVERSE_GEOCODE_FAILED");
  res.json({ lng, lat, address });
});

// ---- GET /api/web/projects/:id/points (auth required, paginated) ----
router.get("/projects/:id/points", authRequired, async (req: Request, res: Response) => {
  const db = require("../db").default;
  const projectId = req.params.id;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(2000, Math.max(1, parseInt(req.query.limit as string) || 500));
  const offset = (page - 1) * limit;

  // Fetch project source_crs and points in parallel
  const projectRow = await db.oneOrNone(
    "SELECT source_crs FROM analysis_projects WHERE id = $[projectId]",
    { projectId }
  );
  const projectCrs = projectRow?.source_crs || "gcj02";
  
  const [points, countResult] = await Promise.all([
    db.manyOrNone(
      "SELECT id, name, address, lng, lat, metadata FROM spatial_points WHERE project_id = $[projectId] ORDER BY id LIMIT $[limit] OFFSET $[offset]",
      { projectId, limit, offset }
    ),
    db.one("SELECT COUNT(*)::INTEGER AS total FROM spatial_points WHERE project_id = $[projectId]", { projectId }),
  ]);

  // Convert from WGS-84 (DB) to original source CRS for frontend display
  const { convertCoord } = require('../utils/coordTransform');
  const displayPoints = (points || []).map((p: any) => {
    try {
      const crs = convertCoord(p.lng, p.lat, 'wgs84', projectCrs);
      return { ...p, lng: crs.lng, lat: crs.lat };
    } catch { return p; }
  });

  res.json({ points: displayPoints, total: countResult.total, page, totalPages: Math.ceil(countResult.total / limit) });
});

// ---- GET /api/web/projects/:id/analysis/voronoi (auth required) ----
router.get("/projects/:id/analysis/voronoi", authRequired, async (req: Request, res: Response) => {
  const polygons = await computeVoronoi(req.params.id);
  res.json({ polygons });
});

// ---- GET /api/web/projects/:id/analysis/h3-hexagons (auth required) ----
router.get("/projects/:id/analysis/h3-hexagons", authRequired, async (req: Request, res: Response) => {
  const resolution = parseInt(req.query.resolution as string) || 9;
  if (resolution < 0 || resolution > 15) throw new AppError(400, "H3 resolution must be 0-15", "INVALID_H3_RESOLUTION");

  const db = require("../db").default;
  const points = await db.manyOrNone("SELECT lng, lat FROM spatial_points WHERE project_id = $[projectId]", { projectId: req.params.id });
  if (!points || points.length === 0) return res.json({ hexagons: [], resolution });

  const hexagons = aggregateByH3(
    points.map((p: any) => ({ lng: parseFloat(p.lng), lat: parseFloat(p.lat) })),
    resolution
  );
  res.json({ hexagons, resolution });
});

// ---- GET /api/web/coverage/industry-radii (auth required) ----
router.get("/coverage/industry-radii", authRequired, async (_req: Request, res: Response) => {
  try {
    const db = require("../db").default;
    const rows = await db.manyOrNone(
      "SELECT industry, display_name AS label, COALESCE(radius_meters, 1000) AS radius_meters FROM site_optimization_models ORDER BY radius_meters"
    );
    if (rows && rows.length > 0) {
      return res.json({
        industries: rows.map((r: any) => ({
          industry: r.industry,
          label: r.label,
          radiusMeters: parseInt(r.radius_meters),
        })),
        source: "database",
      });
    }
  } catch (e: any) {
    console.warn("[industry-radii] DB query failed, using config fallback:", e.message);
  }
  // Fallback to hardcoded config
  const industries = config.coverage.industryRadii.map((r: any) => ({
    industry: r.industry,
    label: r.label,
    radiusMeters: r.radiusMeters,
  }));
  res.json({ industries, source: "config" });
});

// ---- GET /api/web/tasks/:taskId (auth required) ----
router.get("/tasks/:taskId", authRequired, async (req: Request, res: Response) => {
  const task = getTaskStatus(req.params.taskId);
  if (!task) throw new AppError(404, "任务不存在", "TASK_NOT_FOUND");
  res.json(task);
});

// ---- GET /api/web/industries (auth required) ----
// Returns 12 industries with camelCase fields matching frontend store expectations
router.get("/industries", authRequired, async (_req: Request, res: Response) => {
  const db = require("../db").default;
  const rows = await db.manyOrNone(
    "SELECT id, industry, display_name, COALESCE(radius_meters, 500) AS radius_meters, COALESCE(weights::text, '{}') AS weights_text, COALESCE(kpi_weights::text, '{}') AS kpi_weights_text, COALESCE(benchbarks::text, '{}') AS benchbarks_text, COALESCE(decision_thresholds::text, '{}') AS decision_thresholds_text FROM site_optimization_models ORDER BY sort_order ASC, display_name ASC"
  );

  // Load KPI Chinese display names for frontend rendering
  let kpiDisplayNames: Record<string, string> = {};
  try {
    const kpiRows = await db.manyOrNone(
      "SELECT kpi_name, display_name FROM kpi_category_map WHERE display_name IS NOT NULL"
    );
    for (const kr of kpiRows || []) {
      kpiDisplayNames[kr.kpi_name] = kr.display_name;
    }
  } catch { /* non-critical, frontend falls back to kpi_name */ }
  const models = rows.map((r: any) => {
    let weights = {}; let kpiWeights = {}; let benchmarks = {}; let decisionThresholds = {};
    try { weights = typeof r.weights_text === 'string' ? JSON.parse(r.weights_text) : r.weights_text; } catch {}
    try { kpiWeights = typeof r.kpi_weights_text === 'string' ? JSON.parse(r.kpi_weights_text) : r.kpi_weights_text; } catch {}
    try { benchmarks = typeof r.benchbarks_text === 'string' ? JSON.parse(r.benchbarks_text) : r.benchbarks_text; } catch {}
    try { decisionThresholds = typeof r.decision_thresholds_text === 'string' ? JSON.parse(r.decision_thresholds_text) : r.decision_thresholds_text; } catch {}
    return {
      id: r.id,
      industry: r.industry,
      displayName: r.display_name,
      radiusMeters: parseInt(r.radius_meters) || 500,
      weights: (weights as any).kpi_mapping || weights,
      kpiWeights,
      benchmarks,
      decisionThresholds,
      keywords: [],
    };
  });
  res.json({ models, kpiDisplayNames });
});

// ---- GET /api/web/industries/:id/model (auth required) ----
router.get("/industries/:id/model", authRequired, async (req: Request, res: Response) => {
  try {
    const param = req.params.id;
    const isUuid = /^[0-9a-f-]{36}$/i.test(param);
    const db = require("../db").default;
    const row = await db.oneOrNone(
      isUuid ? "SELECT industry FROM site_optimization_models WHERE id = $[id]" : "SELECT industry FROM site_optimization_models WHERE industry = $[industry]",
      isUuid ? { id: param } : { industry: param }
    );
    if (!row) throw new AppError(404, "模型不存在", "MODEL_NOT_FOUND");
    const config = await loadIndustryConfig(row.industry);
    if (!config) throw new AppError(404, "模型配置加载失败", "MODEL_LOAD_FAILED");
    return res.json({
      id: config.industry,
      industry: config.industry,
      display_name: config.displayName,
      radius_meters: config.radiusMeters,
      weights: config.weights,
      kpi_weights: config.kpiWeights,
      keywords: config.keywords,
      analysis_params: config.analysisParams,
      decision_thresholds: config.decisionThresholds,
      benchmarks: config.benchmarks,
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    const db = require("../db").default;
    const model = await db.oneOrNone(
      "SELECT id, industry, display_name, radius_meters, weights, kpi_weights, benchbarks as benchmarks FROM site_optimization_models WHERE id = $[id] OR industry = $[industry]",
      { id: req.params.id, industry: req.params.id }
    );
    if (!model) throw new AppError(404, "模型不存在", "MODEL_NOT_FOUND");
    res.json(model);
  }
});



// ---- GET /api/web/industries/:industry/benchmark (auth required) ----
// Compare project analysis metrics against industry benchmarks
router.get("/industries/:industry/benchmark", authRequired, async (req: Request, res: Response) => {
  try {
    const { compareWithBenchmarks } = require("../services/analysis/benchmarkService");
    const metrics = req.query.metrics ? JSON.parse(req.query.metrics as string) : {};
    const result = await compareWithBenchmarks(req.params.industry, metrics);
    if (!result) throw new AppError(404, "该行业暂无 Benchmark 数据", "BENCHMARK_NOT_FOUND");
    res.json(result);
  } catch (err) {
    if (err instanceof SyntaxError) throw new AppError(400, "metrics 参数格式错误，需为 JSON 字符串", "INVALID_METRICS_JSON");
    if (err instanceof AppError) throw err;
    throw err;
  }
});

// ---- DELETE /api/web/projects/:id (soft-delete, auth required) ----
router.delete("/projects/:id", authRequired, async (req: Request, res: Response) => {
  const db = require("../db").default;
  const projectId = req.params.id;
  const tenantId = getTenantId(req);

  const project = await db.oneOrNone(
    "SELECT * FROM analysis_projects WHERE id = $[id] AND deleted_at IS NULL",
    { id: projectId }
  );
  if (!project) throw new AppError(404, "项目不存在或已删除", "PROJECT_NOT_FOUND");

  // Backup project data
  let backupPath = "";
  try {
    backupPath = await backupProject(projectId, tenantId);
  } catch (err: any) {
    throw new AppError(500, "备份项目数据失败: " + err.message, "BACKUP_FAILED");
  }

  // Soft-delete
  await db.none(
    "UPDATE analysis_projects SET deleted_at = NOW() WHERE id = $[id]",
    { id: projectId }
  );

  res.json({ deleted: true, backupPath });
});

// ---- GET /api/web/projects/deleted (recycle bin list, auth required) ----
router.get("/projects/deleted", authRequired, async (req: Request, res: Response) => {
  const backups = await listBackups(getTenantId(req));
  // Strip server file paths before returning to client
  res.json({ backups: backups.map(({ filePath, ...rest }) => rest) });
});

// ---- POST /api/web/projects/:id/restore (restore from backup, auth required) ----
router.post("/projects/:id/restore", authRequired, async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const backups = await listBackups(tenantId);
  const match = backups.find((b: any) => b.projectId === req.body.projectId);
  if (!match) throw new AppError(404, "未找到项目备份文件", "BACKUP_NOT_FOUND");

  const result = await restoreProject(match.filePath);
  // Remove backup file so it no longer appears in recycle bin
  await removeBackupFile(match.filePath);
  res.json(result);
});

// ---- DELETE /api/web/projects/deleted/purge (hard-delete, auth required) ----
router.delete("/projects/deleted/purge", authRequired, async (req: Request, res: Response) => {
  const { projectId } = req.body;
  const db = require("../db").default;
  if (!projectId) throw new AppError(400, "缺少 projectId", "MISSING_PROJECT_ID");

  // Verify project is soft-deleted
  const project = await db.oneOrNone(
    "SELECT id FROM analysis_projects WHERE id = $[id] AND deleted_at IS NOT NULL",
    { id: projectId }
  );
  if (!project) throw new AppError(404, "项目不存在或未删除", "PROJECT_NOT_FOUND");

  // Hard delete (CASCADE removes associated data)
  await db.none("DELETE FROM analysis_projects WHERE id = $[id]", { id: projectId });
  // Also remove backup file
  const _tenantId = getTenantId(req);
  const _backups = await listBackups(_tenantId);
  const _match = _backups.find((b: any) => b.projectId === projectId);
  if (_match) {
    await removeBackupFile(_match.filePath);
  }

  res.json({ purged: true });
});




// ---- DELETE /api/web/projects/deleted/purge-all (batch hard-delete all deleted projects, auth required) ----
router.delete("/projects/deleted/purge-all", authRequired, async (req: Request, res: Response) => {
  const db = require("../db").default;
  const tenantId = getTenantId(req);

  const projects = await db.manyOrNone(
    "SELECT id FROM analysis_projects WHERE tenant_id = $[tenantId] AND deleted_at IS NOT NULL",
    { tenantId }
  );

  if (!projects || projects.length === 0) {
    res.json({ purged: 0 });
    return;
  }

  const ids = projects.map((p: any) => p.id);
  await db.none("DELETE FROM analysis_projects WHERE id IN ($[ids:csv])", { ids });
  // Also remove backup files
  const backups = await listBackups(tenantId);
  for (const b of backups) {
    if (ids.includes(b.projectId)) {
      await removeBackupFile(b.filePath);
    }
  }

  res.json({ purged: ids.length });
});

// ---- GET /projects/:id/analysis/coverage/export (auth required) ----
router.get("/projects/:id/analysis/coverage/export", authRequired, analysisLimiter, async (req: Request, res: Response) => {
  const radius = parseInt(req.query.radius as string) || config.analysis.coverageRadii[0];
  const decayMode = req.query.decay === "true" || req.query.decay === "1";
  const includeWhiteSpace = req.query.whitespace === "true" || req.query.whitespace === "1";
  const rawNetwork = req.query.network as string;
  const networkMode: "walking" | "driving" | undefined = rawNetwork === "walking" ? "walking" : rawNetwork === "driving" ? "driving" : undefined;
  const format = (req.query.format as string) || "geojson";

  const industry = req.query.industry as string || undefined;
  const opts = { decayMode, includeWhiteSpace, networkMode, industry };
  const result = await computeCoverage(req.params.id, radius, opts);

  if (format === "excel") {
    const rows: Record<string, any>[] = [{
      "覆盖面积(km²)": ((result.coveredArea || 0) / 1000000).toFixed(2),
      "分布范围面积(km²)": ((result.hullArea || 0) / 1000000).toFixed(2),
      "总缓冲区面积(km²)": ((result.totalBufferArea || 0) / 1000000).toFixed(2),
      ...(result.effectiveCoveredArea != null ? { "有效覆盖面积(km²)": ((result.effectiveCoveredArea || 0) / 1000000).toFixed(2) } : {}),
      ...(result.effectiveCoverageRatio != null ? { "有效覆盖率(%)": result.effectiveCoverageRatio } : {}),
      ...(result.cannibalizationIndex != null ? { "蚕食指数(%)": result.cannibalizationIndex } : {}),
    }];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "覆盖分析");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="coverage_${req.params.id}.xlsx"`);
    return res.send(Buffer.from(buf));
  }

  // Default: GeoJSON export
  const exportGeojson: any = {
    type: "FeatureCollection",
    features: [
      result.geojson?.covered ? { type: "Feature", properties: { name: "覆盖区域" }, geometry: result.geojson.covered } : null,
      result.geojson?.uncovered ? { type: "Feature", properties: { name: "盲区" }, geometry: result.geojson.uncovered } : null,
      result.overlapGeojson?.single ? { type: "Feature", properties: { name: "独家覆盖" }, geometry: result.overlapGeojson.single } : null,
      result.overlapGeojson?.double ? { type: "Feature", properties: { name: "双重覆盖" }, geometry: result.overlapGeojson.double } : null,
      result.overlapGeojson?.triplePlus ? { type: "Feature", properties: { name: "三重及以上" }, geometry: result.overlapGeojson.triplePlus } : null,
      result.whiteSpaceGeojson ? { type: "Feature", properties: { name: "白空间" }, geometry: result.whiteSpaceGeojson } : null,
    ].filter(Boolean),
  };
  if (result.decayBreakdown) {
    for (const z of result.decayBreakdown) {
      if (z.geojson) {
        exportGeojson.features.push({ type: "Feature", properties: { name: z.zone }, geometry: z.geojson });
      }
    }
  }
  res.setHeader("Content-Type", "application/geo+json");
  res.setHeader("Content-Disposition", `attachment; filename="coverage_${req.params.id}.geojson"`);
  return res.json(exportGeojson);
});


// ---- GET /api/web/transit/quota (auth required) ----
router.get("/transit/quota", authRequired, async (_req: Request, res: Response) => {
  try {
    const { getTransitQuotaStats } = require("../services/routingService");
    res.json(getTransitQuotaStats());
  } catch {
    res.json({ used: 0, limit: 4500, remaining: 4500, estimated: false });
  }
});


// ================================================================
// v3.0 博弈选址路由 — Python计算引擎
// ================================================================

import { getHuffParams } from "../services/huffService";
import {
  solveGame, runScenarios, comparePlans, prepareGameData, checkEngineHealth,
} from "../services/computeClient";

// ---- GET /api/web/compute/health (auth required) ----
router.get("/compute/health", authRequired, async (_req: Request, res: Response) => {
  const healthy = await checkEngineHealth();
  res.json({ engine: healthy ? "available" : "unavailable" });
});

// ---- POST /api/web/projects/:id/game/solve (auth required) ----
router.post("/projects/:id/game/solve", authRequired, analysisLimiter, async (req: Request, res: Response) => {
  const projectId = req.params.id;
  const {
    leader_candidates, follower_candidates, leader_p, follower_q,
    industry, scenarios, iterations,
  } = req.body;

  if (!leader_candidates || !Array.isArray(leader_candidates) || leader_candidates.length === 0) {
    return res.status(400).json({ error: "请提供Leader候选点" });
  }

  try {
    // 1. 从Python引擎获取项目数据
    const dataRes = await prepareGameData(projectId, industry);

    // 2. 获取Huff参数 — 前端可手动覆盖
    const { huff_params: huffOverride } = req.body;
    let huffParams;
    if (huffOverride && typeof huffOverride.lambda === 'number') {
      huffParams = { ...huffOverride, source: "manual" as const };
      logger.info({ projectId, lambda: huffOverride.lambda }, "[Game] 使用前端手动Huff参数");
    } else {
      huffParams = await getHuffParams(projectId, industry);
    }

    // 3. 构建请求
    const gameReq: any = {
      project_id: projectId,
      industry,
      leader_candidates: leader_candidates.map((c: any) => ({
        id: c.id || c.name, lng: c.lng, lat: c.lat,
        area: c.area || 100, brand: c.brand || 0.5,
      })),
      follower_candidates: (follower_candidates || []).map((c: any) => ({
        id: c.id || c.name, lng: c.lng, lat: c.lat,
        area: c.area || 100, brand: c.brand || 0.5,
      })),
      leader_p: leader_p || 3,
      follower_q: follower_q ?? 2,
      h3_demand: dataRes.success ? (dataRes.data?.h3_demand || []) : [],
      huff_params: { lambda: huffParams.lambda, alpha_area: huffParams.alpha_area, alpha_brand: huffParams.alpha_brand },
      iterations: iterations || 200,
    };

    // 4. 调用Python引擎
    if (scenarios && scenarios.length > 0) {
      const result = await runScenarios({ ...gameReq, scenarios });
      if (result.success) {
        return res.json({ ...result.data, huff_source: huffParams.source });
      }
    } else {
      const result = await solveGame(gameReq);
      if (result.success) {
        return res.json({ ...result.data, huff_source: huffParams.source });
      }
    }

    // 5. 降级：使用旧版竞争分析
    logger.warn({ projectId }, "[GameSolve] 降级到静态竞争分析");
    const { batchCompetitionAnalysis } = require("../services/competitionService");
    const competition = await batchCompetitionAnalysis(projectId, leader_candidates, industry);
    return res.json({
      fallback: true,
      competition,
      message: "计算引擎不可用，显示静态竞争分析。启动docker compose python-compute服务启用博弈求解。",
    });

  } catch (err: any) {
    logger.error({ error: err.message }, "[GameSolve] Error");
    res.status(500).json({ error: err.message });
  }
});

// ---- POST /api/web/projects/:id/game/compare (auth required) ----
router.post("/projects/:id/game/compare", authRequired, analysisLimiter, async (req: Request, res: Response) => {
  const projectId = req.params.id;
  const { leader_candidates, follower_candidates, plan_a_sites, plan_b_sites, industry, follower_q } = req.body;

  if (!plan_a_sites?.length || !plan_b_sites?.length) {
    return res.status(400).json({ error: "请提供方案A和方案B的候选点ID列表" });
  }

  try {
    const dataRes = await prepareGameData(projectId, industry);
    const huffParams = await getHuffParams(projectId, industry);

    const result = await comparePlans({
      project_id: projectId,
      leader_candidates: (leader_candidates || []).map((c: any) => ({
        id: c.id || c.name, lng: c.lng, lat: c.lat, area: c.area || 100, brand: c.brand || 0.5,
      })),
      follower_candidates: (follower_candidates || []).map((c: any) => ({
        id: c.id || c.name, lng: c.lng, lat: c.lat, area: c.area || 100, brand: c.brand || 0.5,
      })),
      h3_demand: dataRes.success ? (dataRes.data?.h3_demand || []) : [],
      huff_params: { lambda: huffParams.lambda, alpha_area: huffParams.alpha_area, alpha_brand: huffParams.alpha_brand },
      plan_a_sites,
      plan_b_sites,
      follower_q: follower_q || 2,
    });

    if (result.success) {
      return res.json({ ...result.data, huff_source: huffParams.source });
    }

    return res.json({ fallback: true, message: "计算引擎不可用" });

  } catch (err: any) {
    logger.error({ error: err.message }, "[GameCompare] Error");
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/web/projects/:id/game/huff-params (auth required) ----
router.get("/projects/:id/game/huff-params", authRequired, async (req: Request, res: Response) => {
  const projectId = req.params.id;
  const industry = req.query.industry as string || undefined;

  try {
    const params = await getHuffParams(projectId, industry);
    res.json(params);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ================================================================
// v3.1: Platform data base APIs (接口预留 — 数据底座落成后生效)
// ================================================================

// GET /api/web/poi/search — 竞品POI查询
router.get("/poi/search", authRequired, async (req: Request, res: Response) => {
  try {
    const { industry, city, bounds, limit } = req.query as Record<string, string>;
    if (!industry || !city) {
      res.status(400).json({ error: "必须指定行业(industry)和城市(city)", code: "MISSING_PARAMS" });
      return;
    }
    const rowLimit = Math.min(parseInt(limit || "500"), 2000);

    let whereClause = "WHERE industry = $[industry] AND city = $[city]";
    const params: any = { industry, city, limit: rowLimit };

    if (bounds) {
      const [minLng, minLat, maxLng, maxLat] = bounds.split(",").map(Number);
      if (!isNaN(minLng) && !isNaN(minLat) && !isNaN(maxLng) && !isNaN(maxLat)) {
        whereClause += " AND geom && ST_MakeEnvelope($[minLng], $[minLat], $[maxLng], $[maxLat], 4326)";
        params.minLng = minLng; params.minLat = minLat; params.maxLng = maxLng; params.maxLat = maxLat;
      }
    }

    const db = require("../db").default;
    const rows = await db.manyOrNone(
      `SELECT id, name, industry, lng, lat, address, city, district, brand_chain, source, collected_at
       FROM public_poi ${whereClause}
       ORDER BY collected_at DESC LIMIT $[limit]`,
      params
    );

    res.json({
      points: rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        industry: r.industry,
        lng: parseFloat(r.lng),
        lat: parseFloat(r.lat),
        address: r.address,
        city: r.city,
        district: r.district,
        brandChain: r.brand_chain,
        source: r.source,
        collectedAt: r.collected_at,
      })),
      total: rows.length,
      dataCoverageNote: "竞品POI数据来源于公开渠道，存在覆盖缺口。当前数据覆盖行业={industry}，城市={city}。不包含无工商登记的个体工商户、临时摊点等。".replace("{industry}", industry).replace("{city}", city),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message, code: "POI_SEARCH_ERROR" });
  }
});

// GET /api/web/demand/h3-grid — 人口/消费力H3栅格查询
router.get("/demand/h3-grid", authRequired, async (req: Request, res: Response) => {
  try {
    const db = require("../db").default;
    const { bounds, resolution } = req.query as Record<string, string>;
    const resNum = parseInt(resolution || "9");

    let whereClause = "";
    const params: any = {};

    if (bounds) {
      const [minLng, minLat, maxLng, maxLat] = bounds.split(",").map(Number);
      if (!isNaN(minLng) && !isNaN(minLat) && !isNaN(maxLng) && !isNaN(maxLat)) {
        whereClause = "WHERE ST_Within(ST_SetSRID(ST_MakePoint(lng, lat), 4326), ST_MakeEnvelope($[minLng], $[minLat], $[maxLng], $[maxLat], 4326))";
        params.minLng = minLng; params.minLat = minLat; params.maxLng = maxLng; params.maxLat = maxLat;
      }
    }

    const rows = await db.manyOrNone(
      `SELECT h3_index, lng, lat, population, consumption_index, residential_ratio, commercial_ratio, data_source, data_year
       FROM h3_demand_grid ${whereClause}
       ORDER BY h3_index`,
      params
    );

    res.json({
      cells: rows.map((r: any) => ({
        h3: r.h3_index,
        lng: parseFloat(r.lng),
        lat: parseFloat(r.lat),
        population: parseFloat(r.population),
        consumptionIndex: parseFloat(r.consumption_index),
        residentialRatio: parseFloat(r.residential_ratio),
        commercialRatio: parseFloat(r.commercial_ratio),
        dataSource: r.data_source,
        dataYear: r.data_year,
      })),
      total: rows.length,
      resolution: resNum,
      dataCoverageNote: `人口数据来源于${rows.length > 0 ? (rows[0] as any).data_source || 'WorldPop' : 'WorldPop'}。实际人口分布可能存在空间误差，仅供选址分析参考。`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message, code: "DEMAND_GRID_ERROR" });
  }
});

// GET /api/web/demand/stats — 指定区域人口统计摘要
router.get("/demand/stats", authRequired, async (req: Request, res: Response) => {
  try {
    const { bounds } = req.query as Record<string, string>;
    const db = require("../db").default;
    if (!bounds) { res.status(400).json({ error: "必须指定bounds参数", code: "MISSING_PARAMS" }); return; }
    const [minLng, minLat, maxLng, maxLat] = bounds.split(",").map(Number);

    const row = await db.oneOrNone(
      `SELECT COUNT(*)::INTEGER AS cell_count,
              COALESCE(SUM(population), 0) AS total_population,
              COALESCE(AVG(consumption_index), 1.0) AS avg_consumption,
              COALESCE(AVG(residential_ratio), 0.5) AS avg_residential_ratio
       FROM h3_demand_grid
       WHERE ST_Within(ST_SetSRID(ST_MakePoint(lng, lat), 4326), ST_MakeEnvelope($[minLng], $[minLat], $[maxLng], $[maxLat], 4326))`,
      { minLng, minLat, maxLng, maxLat }
    );

    res.json({
      totalPopulation: row ? Math.round(parseFloat(row.total_population)) : 0,
      cellCount: row ? row.cell_count : 0,
      avgConsumptionIndex: row ? parseFloat(row.avg_consumption) : 1.0,
      avgResidentialRatio: row ? parseFloat(row.avg_residential_ratio) : 0.5,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message, code: "DEMAND_STATS_ERROR" });
  }
});

export default router;

