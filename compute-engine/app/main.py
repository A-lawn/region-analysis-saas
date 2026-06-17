"""区域数据分析平台 计算引擎 v3.0 — FastAPI入口"""
import logging
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.config import settings
from app.db import init_db, close_db
from app.middleware import InternalAuthMiddleware
from app.router import router
from app.utils.logger import configure_logging, get_logger

configure_logging(settings)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化DB连接池，关闭时释放"""
    logger.info("=" * 60)
    logger.info(f"  区域数据分析计算引擎 v{__import__('app').__version__}")
    logger.info(f"  Python {sys.version.split()[0]}")
    logger.info("=" * 60)
    await init_db()
    yield
    logger.info("计算引擎关闭中...")
    await close_db()
    logger.info("计算引擎已关闭")


app = FastAPI(
    title="区域数据分析计算引擎",
    version=__import__("app").__version__,
    lifespan=lifespan,
)

# 内部认证中间件
app.add_middleware(InternalAuthMiddleware)

# 路由注册
app.include_router(router)


@app.get("/health")
async def health():
    """健康检查 — Docker healthcheck使用"""
    try:
        from app.db import pool
        if pool:
            return {"status": "healthy", "version": __import__("app").__version__}
    except Exception:
        pass
    return {"status": "starting"}


@app.get("/health/ready")
async def readiness():
    """就绪检查"""
    from app.db import pool
    if pool:
        return {"status": "ready"}
    return JSONResponse({"status": "not_ready"}, status_code=503)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("未捕获异常")
    return JSONResponse(
        {"success": False, "error": {"code": "INTERNAL", "message": str(exc)}},
        status_code=500,
    )
