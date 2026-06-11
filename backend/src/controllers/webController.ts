import { Router, Request, Response } from "express";
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
import { getTaskStatus } from "../services/analysisService";

const router = Router();



// ---- Tenant helper ----
function getTenantId(req: Request): string {
  return (req as any).tenantId || "default";
}

// ---- Multer for file uploads ----
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxFileSizeMB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase();
    if (ext.endsWith(".xlsx") || ext.endsWith(".xls") || ext.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new AppError(400, "鍙敮鎸?.xlsx, .xls, .csv 鏍煎紡", "INVALID_FILE_TYPE"));
    }
  },
});

// ---- In-memory storage for upload session (temporary, 10 min TTL) ----
const uploadSessions = new Map<string, { data: any[][]; headers: string[]; sourceCrs: string; fileName: string }>();

// ---- POST /api/web/upload (auth required) ----
router.post("/upload", authRequired, upload.single("file"), validateUpload, async (req: Request, res: Response) => {
  if (!req.file) throw new AppError(400, "璇蜂笂浼燛xcel鏂囦欢", "FILE_REQUIRED");

  const sourceCrs = (req.body.source_crs || "gcj02") as CrsType;
  const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (data.length < 2) throw new AppError(400, "Excel至少需要包含标题行和一行数据", "INSUFFICIENT_DATA");

  const headers = data[0].map((h: any) => String(h || ""));
  const rows = data.slice(1);
  const detection = detectColumns(headers);
  const errors = validateDetection(detection);

  const uploadId = uuidv4();
  uploadSessions.set(uploadId, { data: rows, headers, sourceCrs, fileName: req.file.originalname });

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
    fileName: req.file.originalname,
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
    throw new AppError(400, "蹇呴』鎸囧畾缁忓害鍜岀含搴﹀垪", "MISSING_COORD_COLUMNS");
  }

  const session = uploadSessions.get(uploadId);
  if (!session) throw new AppError(400, "上传会话已过期,请重新上传文件", "SESSION_EXPIRED");

  const result = await processUpload(
    session.data,
    columnMapping,
    session.sourceCrs as CrsType,
    session.fileName || "瀵煎叆_" + new Date().toISOString().slice(0, 10),
    getTenantId(req)
  );

  uploadSessions.delete(uploadId);

  if (!result.projectId) {
    throw new AppError(400, result.errors.join("; ") || "鏁版嵁瀵煎叆澶辫触", "IMPORT_FAILED");
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
  res.json(await computeCoverage(req.params.id, radius));
});

router.get("/projects/:id/analysis/heatmap", authRequired, analysisLimiter, validateHeatmapParams, async (req: Request, res: Response) => {
  const bandwidth = parseInt(req.query.bandwidth as string) || config.analysis.kdeBandwidth;
  const gridSize = parseInt(req.query.gridSize as string) || config.analysis.kdeGridSize;
  const points = await computeKDEHeatmap(req.params.id, bandwidth, gridSize);
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
  if (!address) throw new AppError(400, "璇锋彁渚涘湴鍧€", "ADDRESS_REQUIRED");
  const result = await geocode(address);
  if (!result) throw new AppError(404, "鍦板潃瑙ｆ瀽澶辫触锛岃妫€鏌ュ湴鍧€鏄惁姝ｇ‘", "GEOCODE_FAILED");
  res.json(result);
});

// ---- POST /api/web/reverse-geocode (auth required) ----
router.post("/reverse-geocode", authRequired, async (req: Request, res: Response) => {
  const { lng, lat } = req.body;
  if (lng == null || lat == null) throw new AppError(400, "请提供坐标", "COORDS_REQUIRED");
  const { reverseGeocode } = require("../services/geocodingService");
  const address = await reverseGeocode(lng, lat);
  if (!address) throw new AppError(404, "鍙嶅悜鍦板潃瑙ｆ瀽澶辫触", "REVERSE_GEOCODE_FAILED");
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

// ---- GET /api/web/tasks/:taskId (auth required) ----
router.get("/tasks/:taskId", authRequired, async (req: Request, res: Response) => {
  const task = getTaskStatus(req.params.taskId);
  if (!task) throw new AppError(404, "任务不存在或已过期", "TASK_NOT_FOUND");
  res.json(task);
});

// ---- GET /api/web/industries (auth required) ----
router.get("/industries", authRequired, async (_req: Request, res: Response) => {
  const db = require("../db").default;
  const models = await db.manyOrNone("SELECT id, industry, display_name, weights, description FROM site_optimization_models WHERE is_default = true ORDER BY display_name");
  res.json({ models });
});

// ---- GET /api/web/industries/:id/model (auth required) ----
router.get("/industries/:id/model", authRequired, async (req: Request, res: Response) => {
  const db = require("../db").default;
  const model = await db.oneOrNone("SELECT id, industry, display_name, weights, description FROM site_optimization_models WHERE id = $[id]", { id: req.params.id });
  if (!model) throw new AppError(404, "行业模型不存在", "MODEL_NOT_FOUND");
  res.json(model);
});

export default router;
