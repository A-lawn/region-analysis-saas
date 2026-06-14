"""内部认证中间件 — HMAC-SHA256签名校验"""
import hmac
import hashlib
import time
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from app.config import settings
from app.utils.logger import get_logger

logger = get_logger(__name__)

# 不需要认证的路径
PUBLIC_PATHS = {"/health", "/health/ready", "/docs", "/openapi.json", "/redoc"}


class InternalAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # 公开路径跳过
        if request.url.path in PUBLIC_PATHS:
            return await call_next(request)

        if not settings.internal_auth_enabled:
            return await call_next(request)

        signature = request.headers.get("X-Internal-Signature", "")
        if not signature:
            logger.warning(
                "缺少内部签名",
                extra={"module": "auth", "operation": "verify", "meta": str(dict(request.headers))},
            )
            return JSONResponse(
                {"success": False, "error": {"code": "AUTH_FAILED", "message": "缺少内部签名"}},
                status_code=403,
            )

        # 读取请求体用于签名校验
        body = await request.body()
        expected = hmac.new(
            key=settings.jwt_secret.encode("utf-8"),
            msg=body,
            digestmod=hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(signature, expected):
            logger.warning(
                "签名校验失败",
                extra={"module": "auth", "operation": "verify", "meta": f"expected={expected[:16]}..., got={signature[:16]}..."},
            )
            return JSONResponse(
                {"success": False, "error": {"code": "AUTH_FAILED", "message": "签名校验失败"}},
                status_code=403,
            )

        return await call_next(request)
