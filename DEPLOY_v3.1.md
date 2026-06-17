# v3.1 部署操作手册

> 适用场景：从 v3.0 升级到 v3.1，或全新部署 v3.1

---

## 方式一：GitHub Actions 自动部署（推荐）

### 前置条件

在 GitHub 仓库 Settings → Secrets and variables → Actions 中配置以下 Secrets：

| Secret 名 | 说明 |
|-----------|------|
| `ALIYUN_HOST` | 阿里云服务器公网 IP |
| `ALIYUN_USER` | SSH 用户名（通常 `root`） |
| `ALIYUN_SSH_KEY` | SSH 私钥内容 |
| `ALIYUN_DOMAIN` | 应用域名（如 `https://your-domain.com`） |
| `DB_PASSWORD` | 数据库密码 |
| `JWT_SECRET` | JWT 签名密钥（64位 hex） |
| `ENC_KEY` | AES-256-GCM 信封加密主密钥（32字节 base64） |
| `AMAP_WEB_KEY` | 高德 Web JS API Key |
| `AMAP_SERVER_KEY` | 高德服务端 API Key |
| `SMTP_HOST` | SMTP 服务器地址 |
| `SMTP_PORT` | SMTP 端口（465） |
| `SMTP_USER` | SMTP 邮箱账号 |
| `SMTP_PASS` | SMTP 邮箱授权码 |
| `SMTP_FROM_EMAIL` | 发件人邮箱 |

### 触发部署

推送到 `v3.1-decision-engine` 分支即可自动触发部署：

```bash
git push origin v3.1-decision-engine
```

或在 GitHub Actions 页面手动触发 `Deploy` workflow。

---

## 方式二：SSH 手动部署

### 步骤 1：SSH 登录服务器

```bash
ssh root@<服务器IP>
```

### 步骤 2：拉取最新代码

```bash
cd /opt/region-analysis
git fetch origin
git checkout v3.1-decision-engine
git reset --hard origin/v3.1-decision-engine
```

### 步骤 3：确认 .env 环境变量

确保 `.env` 文件包含所有必需变量（v3.1 新增 `ENC_KEY`）：

```bash
cat .env
```

若有缺失，参考 `.env.example` 补充：

```bash
# 生成 ENC_KEY（如果还没有）
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 步骤 4：执行数据库迁移（已有数据库升级）

如果服务器已有 v3.0 数据库，需要额外执行迁移 019（docker-compose init 脚本只在**新 init** 时生效）：

```bash
docker compose exec postgres psql -U postgres -d postgres -c "
ALTER TABLE analysis_projects ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

CREATE TABLE IF NOT EXISTS system_config (
    config_key VARCHAR(128) PRIMARY KEY,
    config_value JSONB NOT NULL DEFAULT 'null',
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO system_config (config_key, config_value, description)
VALUES ('subscription_mode', '\"tiered\"', '订阅模式：tiered=分层, full_access=全员专业')
ON CONFLICT (config_key) DO NOTHING;
"
```

### 步骤 5：构建并重启服务

```bash
docker compose up -d --build --remove-orphans
```

### 步骤 6：验证健康状态

```bash
# 等待启动
sleep 10

# 检查服务
curl http://localhost:3000/api/health
# 预期: {"status":"ok","db":"connected","redis":"connected"}

# 检查系统配置接口
curl http://localhost:3000/api/web/system/config
# 预期: {"subscriptionMode":"tiered"}

# 检查各容器状态
docker compose ps
# 预期: postgres / redis / backend / python-compute / frontend 均为 Up
```

### 步骤 7（可选）：MVP 验证期 — 切换全员专业模式

```bash
docker compose exec postgres psql -U postgres -d postgres -c "
UPDATE system_config SET config_value = '\"full_access\"', updated_at = NOW()
WHERE config_key = 'subscription_mode';
"
```

### 步骤 8：清理旧镜像

```bash
docker image prune -af --filter "until=24h"
```

---

## 数据库迁移汇总

v3.0 → v3.1 需要执行的手工 SQL（迁移 019）：

```sql
ALTER TABLE analysis_projects ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

CREATE TABLE IF NOT EXISTS system_config (
    config_key VARCHAR(128) PRIMARY KEY,
    config_value JSONB NOT NULL DEFAULT 'null',
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO system_config (config_key, config_value, description)
VALUES ('subscription_mode', '"tiered"', '订阅模式：tiered=分层, full_access=全员专业')
ON CONFLICT (config_key) DO NOTHING;
```

---

## 回滚方案

如需回滚到 v3.0：

```bash
cd /opt/region-analysis
git fetch origin
git reset --hard origin/codex/v3.0-hybrid-compute-engine
docker compose up -d --build --remove-orphans
```

v3.1 新增的 `analysis_projects.is_temporary`、`users.metadata`、`system_config` 三个字段/表为纯扩展，向前兼容，回滚后可保留不动。
