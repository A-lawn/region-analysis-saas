"""日志系统 — 支持落盘 + 落库双重持久化"""
import os
import sys
import logging
import logging.handlers
from datetime import datetime
from pythonjsonlogger import jsonlogger
from app.config import Settings


class DBLogHandler(logging.Handler):
    """将日志写入PostgreSQL application_logs表"""

    def __init__(self):
        super().__init__()
        self._pool = None

    def set_pool(self, pool):
        self._pool = pool

    def emit(self, record: logging.LogRecord):
        if self._pool is None:
            return  # DB连接池未就绪时跳过
        try:
            import asyncio
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(self._emit_async(record))
        except Exception:
            pass

    async def _emit_async(self, record: logging.LogRecord):
        try:
            async with self._pool.acquire() as conn:
                await conn.execute(
                    """INSERT INTO application_logs
                       (timestamp, level, module, operation, message, meta, trace_id)
                       VALUES ($1, $2, $3, $4, $5, $6, $7)""",
                    datetime.utcnow(),
                    record.levelname,
                    getattr(record, "module", "compute-engine"),
                    getattr(record, "operation", "unknown"),
                    record.getMessage(),
                    getattr(record, "meta", "{}"),
                    getattr(record, "trace_id", ""),
                )
        except Exception:
            pass


class CustomJsonFormatter(jsonlogger.JsonFormatter):
    def add_fields(self, log_record, record, message_dict):
        super().add_fields(log_record, record, message_dict)
        log_record["timestamp"] = datetime.utcnow().isoformat() + "Z"
        log_record["module"] = getattr(record, "module", record.name)
        log_record["operation"] = getattr(record, "operation", "")
        log_record["trace_id"] = getattr(record, "trace_id", "")


# 全局处理器引用，供外部设置DB连接池
_db_handler: DBLogHandler = None


def get_db_handler() -> DBLogHandler:
    global _db_handler
    return _db_handler


def configure_logging(settings: Settings):
    """配置双重日志：文件(JSON) + DB"""
    global _db_handler

    root = logging.getLogger()
    root.setLevel(getattr(logging, settings.log_level.upper(), logging.INFO))
    root.handlers.clear()

    # 1. 控制台输出（开发环境）
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(logging.Formatter(
        "[%(asctime)s] %(levelname)-7s [%(module)s] %(message)s",
        datefmt="%H:%M:%S",
    ))
    root.addHandler(console)

    # 2. 文件输出（JSON格式，落盘）
    if settings.log_to_file:
        os.makedirs(settings.log_dir, exist_ok=True)
        file_handler = logging.handlers.RotatingFileHandler(
            os.path.join(settings.log_dir, "compute-engine.log"),
            maxBytes=50 * 1024 * 1024,  # 50MB
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setFormatter(CustomJsonFormatter())
        root.addHandler(file_handler)

    # 3. DB输出
    if settings.log_to_db:
        _db_handler = DBLogHandler()
        _db_handler.setLevel(logging.INFO)
        root.addHandler(_db_handler)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
