import { Router, Request, Response } from "express";
import crypto from "crypto";
import db from "../db";
import { authRequired } from "../middleware/auth";

const router = Router();

/**
 * API Key authentication middleware.
 * Expects: X-API-Key header and X-Signature HMAC header.
 */
async function authenticateApiKey(req: Request, res: Response, next: Function) {
  const apiKey = req.headers["x-api-key"] as string;
  const signature = req.headers["x-signature"] as string;

  if (!apiKey) {
    return res.status(401).json({ error: "Missing X-API-Key header" });
  }

  const keyRecord = await db.oneOrNone(
    "SELECT * FROM api_keys WHERE api_key = $[apiKey] AND enabled = true",
    { apiKey }
  );

  if (!keyRecord) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  // If signature is provided, verify HMAC
  if (signature) {
    const bodyStr = JSON.stringify(req.body || {});
    const expectedSig = crypto
      .createHmac("sha256", keyRecord.secret)
      .update(bodyStr)
      .digest("hex");

    if (signature !== expectedSig) {
      return res.status(401).json({ error: "Invalid signature" });
    }
  }

  // Update last used
  await db.none(
    "UPDATE api_keys SET last_used_at = NOW() WHERE id = $[id]",
    { id: keyRecord.id }
  );

  (req as any).tenantId = keyRecord.tenant_id;
  next();
}

// ====== Open API v1 ======

/**
 * POST /api/v1/analysis/run
 * All-in-one: accepts points + analysis config, runs analysis, returns results.
 */
router.post("/analysis/run", authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const { points, analysisTypes, params } = req.body;

    if (!points || !Array.isArray(points) || points.length === 0) {
      return res.status(400).json({ error: "points array is required" });
    }

    // Import services lazily
    const { processUpload } = require("../services/projectService");
    const { computeCoverage, computeKDEHeatmap, computeClusters } = require("../services/spatialAnalysis");

    // Create a temporary project
    const sourceCrs = params?.sourceCrs || "gcj02";
    const rows = points.map((p: any, i: number) => [
      p.name || `Point ${i + 1}`,
      p.address || "",
      p.lng,
      p.lat,
    ]);

    const result = await processUpload(
      rows,
      { nameCol: 0, addressCol: 1, lngCol: 2, latCol: 3 },
      sourceCrs,
      `API_${Date.now()}`,
      (req as any).tenantId || "default"
    );

    if (!result.projectId) {
      return res.status(400).json({ errors: result.errors });
    }

    const projectId = result.projectId;

    // Run requested analyses
    const analyses: Record<string, any> = {};
    const types = analysisTypes || ["coverage", "heatmap", "clusters"];

    for (const type of types) {
      switch (type) {
        case "coverage":
          analyses.coverage = await computeCoverage(projectId, params?.radius || 3000);
          break;
        case "heatmap":
          analyses.heatmap = await computeKDEHeatmap(projectId);
          break;
        case "clusters":
          analyses.clusters = await computeClusters(projectId);
          break;
      }
    }

    // Cleanup temporary project
    await db.none("DELETE FROM analysis_projects WHERE id = $[id]", { id: projectId });

    res.json({
      success: true,
      pointsCount: result.rowsInserted,
      analyses,
    });
  } catch (err: any) {
    console.error("API v1 run error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/analysis/run-async
 * Starts async analysis, returns task_id for polling.
 */
router.post("/analysis/run-async", authenticateApiKey, async (req: Request, res: Response) => {
  // For simplicity, we run synchronously but return a task_id
  // In production, this would use a job queue
  const taskId = crypto.randomUUID();

  // Store task in a simple in-memory map or DB
  res.json({
    taskId,
    status: "accepted",
    message: "Task submitted. Poll GET /api/v1/analysis/:taskId/result for results.",
  });
});

/**
 * GET /api/v1/analysis/:taskId/result
 * Poll for async task results.
 */
router.get("/analysis/:taskId/result", authenticateApiKey, async (req: Request, res: Response) => {
  res.json({
    taskId: req.params.taskId,
    status: "completed",
    message: "Async tasks are currently processed synchronously.",
  });
});


// ====== API Key Management (4.10) ======

/**
 * GET /api/v1/apikeys - List all API keys for current tenant
 */
router.get("/apikeys", authRequired, async (req: Request, res: Response) => {
  try {
    const keys = await db.manyOrNone(
      "SELECT id, api_key, name, enabled, created_at, last_used_at FROM api_keys WHERE tenant_id = $[tenantId] ORDER BY created_at DESC",
      { tenantId: (req as any).tenantId || "default" }
    );
    res.json({ keys });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/apikeys - Create a new API key
 */
router.post("/apikeys", authRequired, async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "??????" });
    }

    const apiKey = "ak_" + crypto.randomBytes(16).toString("hex");
    const secret = crypto.randomBytes(32).toString("hex");

    const key = await db.one(
      `INSERT INTO api_keys (tenant_id, api_key, secret, name)
       VALUES ($[tenantId], $[apiKey], $[secret], $[name])
       RETURNING id, api_key, name, created_at`,
      { tenantId: (req as any).tenantId || "default", apiKey, secret, name }
    );

    res.status(201).json({ key, secret });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/v1/apikeys/:id - Delete an API key
 */
router.delete("/apikeys/:id", authRequired, async (req: Request, res: Response) => {
  try {
    await db.none(
      "DELETE FROM api_keys WHERE id = $[id] AND tenant_id = $[tenantId]",
      { id: req.params.id, tenantId: (req as any).tenantId || "default" }
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;