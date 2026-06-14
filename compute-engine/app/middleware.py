"""内部认证中间件 -- HMAC-SHA256签名校验"""
import hmac
import hashlib
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from app.config import settings
from app.utils.logger import get_logger

logger = get_logger(__name__)

PUBLIC_PATHS = {"/health", "/health/ready", "/docs", "/openapi.json", "/redoc"}


class InternalAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in PUBLIC_PATHS:
            return await call_next(request)

        if not settings.internal_auth_enabled:
            return await call_next(request)

        signature = request.headers.get("X-Internal-Signature", "")
        if not signature:
            logger.warning("Missing internal signature")
            return JSONResponse(
                {"success": False, "error": {"code": "AUTH_FAILED", "message": "Missing internal signature"}},
                status_code=403,
            )

        body = await request.body()
        expected = hmac.new(
            key=settings.jwt_secret.encode("utf-8"),
            msg=body,
            digestmod=hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(signature, expected):
            logger.warning("Signature mismatch: expected=%s..., got=%s...", expected[:16], signature[:16])
            return JSONResponse(
                {"success": False, "error": {"code": "AUTH_FAILED", "message": "Signature mismatch"}},
                status_code=403,
            )

        return await call_next(request)
