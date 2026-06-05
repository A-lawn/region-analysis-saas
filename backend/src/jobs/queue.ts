import { Queue, Worker, Job } from "bullmq";

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
};

// Analysis job types
export type AnalysisJobType = "coverage" | "heatmap" | "cluster" | "site-optimization";

export interface AnalysisJobData {
  type: AnalysisJobType;
  projectId: string;
  params: Record<string, any>;
}

export interface AnalysisJobResult {
  type: AnalysisJobType;
  data: any;
}

// Queue names
export const analysisQueue = new Queue<AnalysisJobData, AnalysisJobResult>(
  "analysis",
  { connection }
);

// Config for retries
export const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 86400 },
};