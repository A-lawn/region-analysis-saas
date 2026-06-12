import { Worker } from "bullmq";
import logger from "../utils/logger";
import { processCoverageJob } from "../jobs/coverageJob";
import { processHeatmapJob } from "../jobs/heatmapJob";
import { processClusterJob } from "../jobs/clusterJob";
import { processSiteOptimizationJob } from "../jobs/siteOptimizationJob";
import type { AnalysisJobData, AnalysisJobResult } from "../jobs/queue";
import { updateTaskStatus } from "../services/analysisService";

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

const worker = new Worker<AnalysisJobData, AnalysisJobResult>(
  "analysis",
  async (job) => {
    const { type, projectId, params } = job.data;
    const taskId = job.id!;

    logger.info({ taskId, type, projectId }, "Processing analysis job");
    updateTaskStatus(taskId, { status: "running" });

    try {
      let result: any;
      switch (type) {
        case "coverage": result = await processCoverageJob({ projectId, radiusMeters: params.radius || 3000, opts: params as any });
          break;
        case "heatmap":
          result = await processHeatmapJob({
            projectId,
            bandwidthMeters: params.bandwidth || 1000,
            gridSizeMeters: params.gridSize || 500,
          });
          break;
        case "cluster":
          result = await processClusterJob({
            projectId,
            epsMeters: params.eps || 500,
            minPoints: params.minPoints || 3,
          });
          break;
        case "site-optimization":
          result = await processSiteOptimizationJob({ projectId, options: params as any });
          break;
        default:
          throw new Error(`Unknown analysis type: ${type}`);
      }

      updateTaskStatus(taskId, { status: "completed", result });
      logger.info({ taskId, type }, "Analysis job completed");
      return { type, data: result };
    } catch (err: any) {
      logger.error({ taskId, type, err: err.message }, "Analysis job failed");
      updateTaskStatus(taskId, { status: "failed", error: err.message });
      throw err;
    }
  },
  {
    connection: { host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASSWORD },
    concurrency: 5,
  }
);

logger.info("Analysis worker started");

