-- 区域数据分析平台 - 数据库初始化脚本
-- 需要 PostgreSQL 16 + PostGIS 3

CREATE EXTENSION IF NOT EXISTS postgis;

-- 分析项目表
CREATE TABLE IF NOT EXISTS analysis_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    name VARCHAR(255) NOT NULL,
    source_crs VARCHAR(16) NOT NULL DEFAULT 'gcj02',
    point_count INTEGER NOT NULL DEFAULT 0,
    bounds geometry(Polygon, 4326),
    status VARCHAR(20) NOT NULL DEFAULT 'processing',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_tenant ON analysis_projects(tenant_id);
CREATE INDEX idx_projects_created ON analysis_projects(created_at DESC);

-- 空间点位表
CREATE TABLE IF NOT EXISTS spatial_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES analysis_projects(id) ON DELETE CASCADE,
    name VARCHAR(255),
    address TEXT,
    lng DOUBLE PRECISION NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    geom geometry(Point, 4326),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_points_project ON spatial_points(project_id);
CREATE INDEX idx_points_geom ON spatial_points USING GIST(geom);

-- 分析结果缓存表
CREATE TABLE IF NOT EXISTS analysis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES analysis_projects(id) ON DELETE CASCADE,
    analysis_type VARCHAR(50) NOT NULL,
    params JSONB DEFAULT '{}',
    result JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_results_project_type ON analysis_results(project_id, analysis_type);

-- 选址候选点表
CREATE TABLE IF NOT EXISTS site_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES analysis_projects(id) ON DELETE CASCADE,
    name VARCHAR(255),
    lng DOUBLE PRECISION NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    geom geometry(Point, 4326),
    score DOUBLE PRECISION DEFAULT 0,
    dimensions JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_candidates_project ON site_candidates(project_id);
CREATE INDEX idx_candidates_geom ON site_candidates USING GIST(geom);

-- API Key表（开放API认证）
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    api_key VARCHAR(64) UNIQUE NOT NULL,
    secret VARCHAR(128) NOT NULL,
    name VARCHAR(255) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_apikeys_key ON api_keys(api_key);


-- 用户认证表
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    email_otp VARCHAR(6),
    otp_expires_at TIMESTAMPTZ,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_tenant ON users(tenant_id);

-- 刷新令牌表
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);


-- H3 六边形网格索引（分辨率 9 = ~174m）
ALTER TABLE spatial_points ADD COLUMN IF NOT EXISTS h3_index VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_points_h3 ON spatial_points(h3_index);


-- 行业选址模型表
CREATE TABLE IF NOT EXISTS site_optimization_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    weights JSONB NOT NULL DEFAULT '{}',
    description TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 预置三个行业模型
INSERT INTO site_optimization_models (industry, display_name, weights, description, is_default) VALUES
('convenience', '便利店',
 '{"walkableRatio": 0.40, "competitorAvoidance": 0.25, "poiDensity": 0.20, "rentFactor": 0.15}',
 '便利店选址：步行可达优先，回避已有竞品，关注周边人口密度',
 true),
('restaurant', '餐饮',
 '{"footTraffic": 0.35, "visibility": 0.25, "competitionDensity": 0.20, "deliveryCoverage": 0.20}',
 '餐饮选址：客流热度与可见度优先，竞争适中最优，关注外卖覆盖范围',
 true),
('pharmacy', '药店/诊所',
 '{"populationStructure": 0.30, "medicalCoverage": 0.25, "competitorDistance": 0.20, "transportConvenience": 0.15, "policyCompliance": 0.10}',
 '药店选址：人口结构与医保覆盖优先，竞品距离越远越好，关注政策合规',
 true)
ON CONFLICT (industry) DO NOTHING;

-- 数据来源标记（自有 vs 竞品）
ALTER TABLE spatial_points ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'owner';
CREATE INDEX IF NOT EXISTS idx_points_source ON spatial_points(project_id, source);

-- POI 公共数据表（数据壁垒核心资产）
CREATE TABLE IF NOT EXISTS public_poi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    h3_index VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    sub_category VARCHAR(50),
    lng DOUBLE PRECISION NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    geom geometry(Point, 4326),
    address TEXT,
    source VARCHAR(20) DEFAULT 'amap',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poi_h3 ON public_poi(h3_index);
CREATE INDEX IF NOT EXISTS idx_poi_category ON public_poi(category);
CREATE INDEX IF NOT EXISTS idx_poi_geom ON public_poi USING GIST(geom);

-- POI 密度聚合视图（仅对外暴露统计，不暴露原始 POI 数据）
CREATE OR REPLACE VIEW poi_density AS
SELECT
  h3_index,
  category,
  COUNT(*) AS poi_count
FROM public_poi
GROUP BY h3_index, category;

-- 套餐与订阅表
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    plan VARCHAR(20) NOT NULL DEFAULT 'free',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);

-- API 用量日志表
CREATE TABLE IF NOT EXISTS api_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    endpoint VARCHAR(255),
    points_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_tenant ON api_usage_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_created ON api_usage_logs(created_at);

-- 新增 deleted_at 软删字段
ALTER TABLE analysis_projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
-- 密码重置令牌表
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(128) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens(token);

-- 对已有数据库的幂等迁移 (ALTER TABLE IF NOT EXISTS)
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_otp VARCHAR(6);
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
UPDATE users SET status = 'active' WHERE status IS NULL;