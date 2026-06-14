"""计算引擎配置"""
import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Settings:
    # 数据库
    db_host: str = os.getenv("DB_HOST", "192.168.31.102")
    db_port: int = int(os.getenv("DB_PORT", "5432"))
    db_name: str = os.getenv("DB_NAME", "postgres")
    db_user: str = os.getenv("DB_USER", "postgres")
    db_password: str = os.getenv("DB_PASSWORD", "Postgres@2026")
    db_pool_min: int = 2
    db_pool_max: int = 10

    # Redis
    redis_host: str = os.getenv("REDIS_HOST", "192.168.31.102")
    redis_port: int = int(os.getenv("REDIS_PORT", "6379"))

    # 安全
    jwt_secret: str = os.getenv("JWT_SECRET", "rfve8sCDymWSGLi23l4Qg6OYXB7UJnx01htczKdPkRwuA5NpEoFTHqaZI9bVjM")
    internal_auth_enabled: bool = True

    # 计算
    default_iterations: int = 200
    max_candidates: int = 100
    request_timeout_ms: int = 120_000

    # 日志
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    log_dir: str = os.getenv("LOG_DIR", "/app/logs")
    log_to_db: bool = os.getenv("LOG_TO_DB", "true").lower() == "true"
    log_to_file: bool = os.getenv("LOG_TO_FILE", "true").lower() == "true"


settings = Settings()
