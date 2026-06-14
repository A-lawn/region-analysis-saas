"""asyncpg连接池 -- 直连PostGIS（不经Express）"""
import asyncpg
from app.config import settings
from app.utils.logger import get_logger, get_db_handler

logger = get_logger(__name__)
pool: asyncpg.Pool = None


async def init_db():
    """初始化数据库连接池"""
    global pool
    try:
        pool = await asyncpg.create_pool(
            host=settings.db_host,
            port=settings.db_port,
            database=settings.db_name,
            user=settings.db_user,
            password=settings.db_password,
            min_size=settings.db_pool_min,
            max_size=settings.db_pool_max,
            command_timeout=60,
        )
        # 验证连接并检查PostGIS
        async with pool.acquire() as conn:
            version = await conn.fetchval("SELECT PostGIS_full_version()")
            logger.info("PostGIS connected: %s", str(version)[:80])

        # 将连接池注入DB日志处理器
        db_handler = get_db_handler()
        if db_handler:
            db_handler.set_pool(pool)
            logger.info("DB log handler ready")

    except Exception as e:
        logger.error("DB connection failed: %s", e)
        raise


async def close_db():
    """关闭连接池"""
    global pool
    if pool:
        await pool.close()
        pool = None
        logger.info("DB pool closed")


async def get_db() -> asyncpg.Pool:
    """获取连接池"""
    if pool is None:
        await init_db()
    return pool
