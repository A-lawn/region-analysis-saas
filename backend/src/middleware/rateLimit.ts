import rateLimit from "express-rate-limit";

function getClientIp(req: any): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "\u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5",
    code: "RATE_LIMIT",
  },
  validate: { ip: false },
} as any);

export const registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "\u6ce8\u518c\u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7 1 \u5206\u949f\u540e\u518d\u8bd5",
    code: "REGISTER_RATE_LIMIT",
  },
  validate: { ip: false },
} as any);

export const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "\u767b\u5f55\u5c1d\u8bd5\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7 1 \u5206\u949f\u540e\u518d\u8bd5",
    code: "LOGIN_RATE_LIMIT",
  },
  keyGenerator: (req: any) => {
    const email = req.body?.email || "";
    return getClientIp(req) + "@" + email;
  },
  validate: { ip: false },
} as any);

export const analysisLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "\u5206\u6790\u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5",
    code: "ANALYSIS_RATE_LIMIT",
  },
  keyGenerator: (req: any) => {
    return req.tenantId || getClientIp(req);
  },
  validate: { ip: false },
} as any);
export const otpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "验证码尝试过于频繁，请1分钟后再试",
    code: "OTP_RATE_LIMIT",
  },
  validate: { ip: false },
} as any);

export const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "重置请求过于频繁，请15分钟后再试",
    code: "RESET_RATE_LIMIT",
  },
  validate: { ip: false },
} as any);