import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import svgCaptcha from "svg-captcha";
import db from "../db";
import {
  generateAccessToken,
  generateRefreshToken,
  authRequired,
} from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import {
  loginLimiter,
  registerLimiter,
  otpLimiter,
  resetLimiter,
} from "../middleware/rateLimit";
import { sendEmail } from "../services/emailService";

const router = Router();

function asyncHandler(fn: (req: Request, res: Response) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

// Dummy bcrypt hash for timing-attack resistant comparison when user not found
const FAKE_HASH =
  "$2a$12$LJ3m4ys3Lk0TSwHCgNwFruRpMOBL4SHxpANCF6lsM50GflOC.rniK";

// -------- Captcha helpers --------

const captchaStore = new Map<
  string,
  { text?: string; count?: number; expires: number }
>();

function createCaptcha(): { captchaId: string; svg: string } {
  const captcha = svgCaptcha.create({
    size: 4,
    noise: 3,
    ignoreChars: "0o1il",
    color: true,
  });

  const captchaId = crypto.randomBytes(8).toString("hex");

  captchaStore.set(captchaId, {
    text: captcha.text.toLowerCase(),
    expires: Date.now() + 5 * 60 * 1000,
  });

  // Clean expired entries

  for (const [k, v] of captchaStore) {
    if (v.expires < Date.now()) captchaStore.delete(k);
  }

  return { captchaId, svg: captcha.data };
}

function verifyCaptcha(
  captchaId: string | undefined,
  captchaCode: string | undefined,
): void {
  const stored = captchaStore.get(captchaId || "");

  if (
    !stored ||
    stored.expires < Date.now() ||
    stored.text !== (captchaCode || "").toLowerCase()
  ) {
    throw new AppError(400, "验证码错误或已过期", "INVALID_CAPTCHA");
  }

  captchaStore.delete(captchaId!);
}

// -------- GET /api/auth/captcha --------

router.get("/captcha", (req, res) => {
  res.json(createCaptcha());
});

// -------- POST /api/auth/register --------

router.post(
  "/register",
  registerLimiter,
  asyncHandler(async (req, res) => {
    const { email, password, captchaId, captchaCode } = req.body;

    verifyCaptcha(captchaId, captchaCode);

    if (!email || !password) {
      throw new AppError(400, "邮箱和密码不能为空", "MISSING_CREDENTIALS");
    }

    if (typeof email !== "string" || !email.includes("@")) {
      throw new AppError(400, "邮箱格式不正确", "INVALID_EMAIL");
    }

    if (typeof password !== "string") {
      throw new AppError(400, "密码格式不正确", "WEAK_PASSWORD");
    }

    const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d).{8,}$/;

    if (!passwordRegex.test(password)) {
      throw new AppError(
        400,
        "密码至少8位，且必须同时包含字母和数字",
        "WEAK_PASSWORD",
      );
    }

    const existing = await db.oneOrNone(
      "SELECT id, status FROM users WHERE email = $[email]",

      { email },
    );

    if (existing) {
      if (existing.status === "pending") {
        await db.none("DELETE FROM users WHERE id = $[id]", {
          id: existing.id,
        });
      } else {
        throw new AppError(409, "该邮箱已注册", "EMAIL_EXISTS");
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const otp = String(Math.floor(100000 + Math.random() * 900000));

    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const tenantId =
      "tenant_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8);

    await db.one(
      "INSERT INTO users (email, password_hash, tenant_id, role, status, email_otp, otp_expires_at) VALUES ($[email], $[passwordHash], $[tenantId], 'user', 'pending', $[otp], $[otpExpiresAt]) RETURNING id, email",

      { email, passwordHash, tenantId, otp, otpExpiresAt },
    );

    await sendEmail({
      to: email,

      subject: "区域数据分析平台 - 邮箱验证码",

      text: "您的验证码是" + otp + "，10分钟内有效。如非本人操作请忽略此邮件。",
    });

    res
      .status(201)
      .json({
        message: "注册成功，验证码已发送至您的邮箱，请查收并完成验证",
        requiresVerification: true,
      });
  }),
);

// -------- POST /api/auth/verify-email --------

router.post(
  "/verify-email",
  otpLimiter,
  asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp)
      throw new AppError(400, "邮箱和验证码不能为空", "MISSING_PARAMS");

    const user = await db.oneOrNone(
      "SELECT id, email, tenant_id, role FROM users WHERE email = $[email] AND status = 'pending' AND email_otp = $[otp] AND otp_expires_at > NOW()",

      { email, otp },
    );

    if (!user) {
      const failKey = "otp_fail:" + email;

      const fails = (captchaStore.get(failKey) as any)?.count || 0;

      if (fails >= 2) {
        await db.none(
          "UPDATE users SET email_otp = NULL, otp_expires_at = NOW() WHERE email = $[email] AND status = 'pending'",
          { email },
        );

        captchaStore.delete(failKey);

        throw new AppError(
          400,
          "验证码尝试次数过多，请重新注册获取新验证码",
          "OTP_BRUTE_FORCE",
        );
      }

      captchaStore.set(failKey, {
        count: fails + 1,
        expires: Date.now() + 60 * 60 * 1000,
      });

      throw new AppError(400, "验证码已过期或错误", "INVALID_OTP");
    }

    captchaStore.delete("otp_fail:" + email);

    await db.none(
      "UPDATE users SET status = 'active', email_otp = NULL, otp_expires_at = NULL WHERE id = $[id]",
      { id: user.id },
    );

    const accessToken = await generateAccessToken({
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = generateRefreshToken(user.id);

    await db.none("DELETE FROM refresh_tokens WHERE user_id = $[userId]", {
      userId: user.id,
    });

    await db.none(
      "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($[userId], $[token], NOW() + INTERVAL '30 days'))",
      { userId: user.id, token: refreshToken },
    );
  }),
);

// -------- POST /api/auth/login --------

router.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password, captchaId, captchaCode } = req.body;

    verifyCaptcha(captchaId, captchaCode);

    if (!email || !password)
      throw new AppError(400, "邮箱和密码不能为空", "MISSING_CREDENTIALS");

    const user = await db.oneOrNone(
      "SELECT id, email, password_hash, tenant_id, role, status, failed_attempts, locked_until FROM users WHERE email = $[email]",

      { email },
    );

    if (!user) {
      await bcrypt.compare("dummy", FAKE_HASH);
      throw new AppError(401, "邮箱或密码不正确", "INVALID_CREDENTIALS");
    }

    if (user.status === "pending")
      throw new AppError(
        401,
        "该邮箱尚未验证，请先完成邮箱验证",
        "EMAIL_NOT_VERIFIED",
      );

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remaining = Math.ceil(
        (new Date(user.locked_until).getTime() - Date.now()) / 60000,
      );

      throw new AppError(
        429,
        "账户已被锁定，请 " + remaining + " 分钟后重试",
        "ACCOUNT_LOCKED",
      );
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      const newAttempts = (user.failed_attempts || 0) + 1;

      if (newAttempts >= 5) {
        await db.none(
          "UPDATE users SET failed_attempts = $[a], locked_until = NOW() + INTERVAL '15 minutes' WHERE id = $[id]",
          { a: newAttempts, id: user.id },
        );

        throw new AppError(
          429,
          "密码错误次数过多，账户已锁定 15 分钟",
          "ACCOUNT_LOCKED",
        );
      }

      await db.none(
        "UPDATE users SET failed_attempts = $[a] WHERE id = $[id]",
        { a: newAttempts, id: user.id },
      );

      throw new AppError(401, "邮箱或密码不正确", "INVALID_CREDENTIALS");
    }

    await db.none(
      "UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $[id]",
      { id: user.id },
    );

    const accessToken = await generateAccessToken({
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = generateRefreshToken(user.id);

    await db.none("DELETE FROM refresh_tokens WHERE user_id = $[userId]", {
      userId: user.id,
    });

    await db.none(
      "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($[userId], $[token], NOW() + INTERVAL '30 days')",
      { userId: user.id, token: refreshToken },
    );

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        tenantId: user.tenant_id,
        role: user.role,
      },
    });
  }),
);

// -------- POST /api/auth/forgot-password --------

router.post(
  "/forgot-password",
  resetLimiter,
  asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) throw new AppError(400, "请输入邮箱地址", "MISSING_EMAIL");

    const user = await db.oneOrNone(
      "SELECT id FROM users WHERE email = $[email] AND status = 'active'",
      { email },
    );

    if (!user) {
      await new Promise((r) => setTimeout(r, 200));
      return res.json({ message: "如果该邮箱已注册，重置密码邮件已发送" });
    }

    const token = crypto.randomBytes(32).toString("hex");

    await db.none(
      "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($[userId], $[token], NOW() + INTERVAL '1 hour')",
      { userId: user.id, token },
    );

    const resetLink =
      (process.env.APP_URL || "http://localhost:8080") +
      "/#/reset-password?token=" +
      token;

    await sendEmail({
      to: email,
      subject: "区域数据分析平台 - 密码重置",
      text:
        "您请求了密码重置。请点击以下链接重置密码（1小时内有效）：\n" +
        resetLink +
        "\n\n如非本人操作请忽略。",
    });

    res.json({ message: "如果该邮箱已注册，重置密码邮件已发送" });
  }),
);

// -------- POST /api/auth/reset-password --------

router.post(
  "/reset-password",
  resetLimiter,
  asyncHandler(async (req, res) => {
    const { token, password } = req.body;

    if (!token || !password)
      throw new AppError(400, "令牌和新密码不能为空", "MISSING_PARAMS");

    const pwRegex = /^(?=.*[a-zA-Z])(?=.*\d).{8,}$/;

    if (!pwRegex.test(password))
      throw new AppError(
        400,
        "密码至少8位，且必须同时包含字母和数字",
        "WEAK_PASSWORD",
      );

    const record = await db.oneOrNone(
      "SELECT user_id, used FROM password_reset_tokens WHERE token = $[token] AND expires_at > NOW()",
      { token },
    );

    if (!record)
      throw new AppError(400, "重置链接无效或已过期", "INVALID_RESET_TOKEN");

    if (record.used)
      throw new AppError(400, "重置链接已被使用", "TOKEN_ALREADY_USED");

    const passwordHash = await bcrypt.hash(password, 12);

    await db.tx(async (t: any) => {
      await t.none(
        "UPDATE users SET password_hash = $[h], failed_attempts = 0, locked_until = NULL WHERE id = $[id]",
        { h: passwordHash, id: record.user_id },
      );

      await t.none(
        "UPDATE password_reset_tokens SET used = true WHERE token = $[token]",
        { token },
      );
    });

    res.json({ message: "密码重置成功，请使用新密码登录" });
  }),
);

// -------- POST /api/auth/refresh --------

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken)
      throw new AppError(400, "缺少 refreshToken", "MISSING_REFRESH_TOKEN");

    const record = await db.oneOrNone(
      "SELECT rt.user_id, u.email, u.tenant_id, u.role FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE rt.token = $[token] AND rt.expires_at > NOW()",

      { token: refreshToken },
    );

    if (!record)
      throw new AppError(
        401,
        "无效或已过期的refreshToken",
        "INVALID_REFRESH_TOKEN",
      );

    await db.none("DELETE FROM refresh_tokens WHERE token = $[token]", {
      token: refreshToken,
    });

    const access = await generateAccessToken({
      userId: record.user_id,
      tenantId: record.tenant_id,
      email: record.email,
      role: record.role,
    });

    const newRefresh = generateRefreshToken(record.user_id);

    await db.none(
      "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($[u], $[t], NOW() + INTERVAL '30 days')",
      { u: record.user_id, t: newRefresh },
    );

    res.json({ accessToken: access, refreshToken: newRefresh });
  }),
);

// -------- GET /api/auth/me --------

router.get(
  "/me",
  authRequired,
  asyncHandler(async (req, res) => {
    res.json({
      id: req.userId,
      email: req.userEmail,
      tenantId: req.tenantId,
      role: req.userRole,
    });
  }),
);

// -------- POST /api/auth/logout --------

router.post(
  "/logout",
  authRequired,
  asyncHandler(async (req, res) => {
    await db.none("DELETE FROM refresh_tokens WHERE user_id = $[userId]", {
      userId: req.userId,
    });

    res.json({ success: true });
  }),
);

export default router;

