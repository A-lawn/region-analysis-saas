"""Logging -- file + DB dual persistence"""
import os, sys, logging, logging.handlers
from datetime import datetime
from pythonjsonlogger import jsonlogger
from app.config import Settings


class DBLogHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self._pool = None

    def set_pool(self, pool):
        self._pool = pool

    def emit(self, record: logging.LogRecord):
        if self._pool is None:
            return
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
                    getattr(record, "src_module", record.name),
                    getattr(record, "src_operation", ""),
                    record.getMessage(),
                    getattr(record, "src_meta", "{}"),
                    getattr(record, "trace_id", ""),
                )
        except Exception:
            pass


class CustomJsonFormatter(jsonlogger.JsonFormatter):
    def add_fields(self, log_record, record, message_dict):
        super().add_fields(log_record, record, message_dict)
        log_record["timestamp"] = datetime.utcnow().isoformat() + "Z"
        log_record["src_module"] = getattr(record, "src_module", record.name)
        log_record["src_operation"] = getattr(record, "src_operation", "")
        log_record["trace_id"] = getattr(record, "trace_id", "")


_db_handler: DBLogHandler = None


def get_db_handler() -> DBLogHandler:
    global _db_handler
    return _db_handler


def configure_logging(settings: Settings):
    global _db_handler

    root = logging.getLogger()
    root.setLevel(getattr(logging, settings.log_level.upper(), logging.INFO))
    root.handlers.clear()

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(logging.Formatter(
        "[%(asctime)s] %(levelname)-7s [%(name)s] %(message)s",
        datefmt="%H:%M:%S",
    ))
    root.addHandler(console)

    if settings.log_to_file:
        os.makedirs(settings.log_dir, exist_ok=True)
        file_handler = logging.handlers.RotatingFileHandler(
            os.path.join(settings.log_dir, "compute-engine.log"),
            maxBytes=50 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setFormatter(CustomJsonFormatter())
        root.addHandler(file_handler)

    if settings.log_to_db:
        _db_handler = DBLogHandler()
        _db_handler.setLevel(logging.INFO)
        root.addHandler(_db_handler)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
