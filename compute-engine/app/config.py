"""计算引擎配置"""
import os
from dataclasses import dataclass, field
from typing import Optional

# 从项目根目录 .env 加载环境变量（本地开发用，Docker 环境下文件不存在则跳过）
_env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
if os.path.exists(_env_path):
    with open(_env_path, encoding="utf-8") as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _key, _, _val = _line.partition("=")
                _key, _val = _key.strip(), _val.strip()
                if _key not in os.environ:
                    os.environ[_key] = _val

@dataclass
class Settings:
    # 数据库
    db_host: str = os.getenv("DB_HOST", "localhost")
    db_port: int = int(os.getenv("DB_PORT", "5432"))
    db_name: str = os.getenv("DB_NAME", "region_analysis")
    db_user: str = os.getenv("DB_USER", "postgres")
    db_password: str = os.getenv("DB_PASSWORD", "postgres")
    db_pool_min: int = 2
    db_pool_max: int = 10

    # Redis
    redis_host: str = os.getenv("REDIS_HOST", "localhost")
    redis_port: int = int(os.getenv("REDIS_PORT", "6379"))

    # 安全
    jwt_secret: str = os.getenv("JWT_SECRET", "")
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
