import { v4 as uuidv4 } from "uuid";
import {
  analysisQueue,
  defaultJobOptions,
  AnalysisJobType,
  AnalysisJobData,
  AnalysisJobResult,
} from "../jobs/queue";

export type TaskStatus = "queued" | "running" | "completed" | "failed";

export interface TaskInfo {
  taskId: string;
  status: TaskStatus;
  result?: any;
  error?: string;
}

// In-memory task store (in production, use Redis)
const taskStore = new Map<string, TaskInfo>();

export async function submitAnalysis(
  type: AnalysisJobType,
  projectId: string,
  params: Record<string, any>
): Promise<{ taskId: string }> {
  const taskId = uuidv4();

  // Store initial task state
  taskStore.set(taskId, { taskId, status: "queued" });

  // Submit to BullMQ
  const job = await analysisQueue.add(
    type,
    { type, projectId, params } as AnalysisJobData,
    { ...defaultJobOptions, jobId: taskId }
  );

  // In production, a Worker processes this and updates the store.
  // For now, we run the job synchronously in the worker and store the result.

  return { taskId };
}

export function getTaskStatus(taskId: string): TaskInfo | null {
  return taskStore.get(taskId) || null;
}

export function updateTaskStatus(taskId: string, update: Partial<TaskInfo>): void {
  const existing = taskStore.get(taskId);
  if (existing) {
    taskStore.set(taskId, { ...existing, ...update });
  }
}
