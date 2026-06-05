import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        }
      : undefined,
  mixin() {
    return {};
  },
});

// Helper for request-scoped logging (attaches requestId + tenantId)
export function reqLogger(req: { id?: string; tenantId?: string }) {
  return logger.child({
    requestId: (req as any).id || undefined,
    tenantId: (req as any).tenantId || undefined,
  });
}

export default logger;
