-- ============================================================
-- init_v3_1.sql — 选址决策引擎 v3.1 幂等全量初始化
-- 生成: 2026-06-16
-- 合并来源: init.sql + 根目录迁移脚本 + migrations/001-017
-- 运行方式: psql -h <host> -U postgres -d postgres -f init_v3_1.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

BEGIN;


-- ============================================================
-- Part 1: 基础表与模式定义 (来源: init.sql + 根目录迁移脚本)
-- ============================================================

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

-- 预置五个行业模型 (algorithm + kpi_mapping 格式)
INSERT INTO site_optimization_models (industry, display_name, weights, description, is_default, radius_meters) VALUES
('convenience', '便利店',
 '{"algorithm":"weighted_sum","kpi_mapping":{"walkableRatio":0.40,"competitorAvoidance":0.25,"poiDensity":0.20,"rentFactor":0.15}}',
 '便利店选址：步行可达优先，回避已有竞品，关注周边人口密度',
 true, 300),
('restaurant', '餐饮',
 '{"algorithm":"weighted_sum","kpi_mapping":{"footTraffic":0.35,"visibility":0.25,"competitionDensity":0.20,"deliveryCoverage":0.20}}',
 '餐饮选址：客流热度与可见度优先，竞争适中最优，关注外卖覆盖范围',
 true, 500),
('pharmacy', '药店/诊所',
 '{"algorithm":"weighted_sum","kpi_mapping":{"populationStructure":0.30,"medicalCoverage":0.25,"competitorDistance":0.20,"transportConvenience":0.15,"policyCompliance":0.10}}',
 '药店选址：人口结构与医保覆盖优先，竞品距离越远越好，关注政策合规',
 true, 800),
('supermarket', '商超',
 '{"algorithm":"weighted_sum","kpi_mapping":{"populationDensity":0.30,"trafficAccessibility":0.25,"competitorDistance":0.20,"parkingAvailability":0.15,"rentLevel":0.10}}',
 '商超选址：人口密度与交通可达性优先，回避竞品，关注停车位与租金',
 true, 3000),
('auto4s', '汽车4S店',
 '{"algorithm":"weighted_sum","kpi_mapping":{"roadFrontage":0.25,"landAvailability":0.25,"competitorClustering":0.20,"regionalCarOwnership":0.20,"zoningCompliance":0.10}}',
 '汽车4S店选址：临路面宽与地块面积优先，产业集群效应明显，关注区域保有量',
 true, 10000)
ON CONFLICT (industry) DO UPDATE SET
  weights = EXCLUDED.weights,
  description = EXCLUDED.description,
  radius_meters = EXCLUDED.radius_meters;

-- KPI 分类映射表（覆盖选址评分 + 覆盖范围分析通用）
CREATE TABLE IF NOT EXISTS kpi_category_map (
  kpi_name VARCHAR(64) PRIMARY KEY,
  category VARCHAR(20) NOT NULL CHECK (category IN ('reach', 'competition', 'density', 'site')),
  display_name VARCHAR(100),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO kpi_category_map (kpi_name, category, display_name, description) VALUES
  ('walkableRatio',        'reach',       '步行可达比',   '500m步行范围内覆盖居民比例'),
  ('footTraffic',          'reach',       '客流热度',     '周边日均人流量指数'),
  ('visibility',           'reach',       '可见度',       '门店临街面数及视距评分'),
  ('competitorAvoidance',  'competition', '竞品回避',     '周边竞品门店数反比'),
  ('competitionDensity',   'competition', '竞争密度',     '区域内同业态门店密度'),
  ('competitorDistance',   'competition', '竞品距离',     '最近竞品门店距离(m)'),
  ('competitorClustering', 'competition', '产业集群度',   '同业聚集程度'),
  ('populationStructure',  'density',     '人口结构',     '年龄/收入/家庭结构适配度'),
  ('populationDensity',    'density',     '人口密度',     '常住人口密度(人/km²)'),
  ('poiDensity',           'density',     '商业密度',     '周边POI数量'),
  ('deliveryCoverage',     'density',     '外卖覆盖',     '3km内外卖配送覆盖率'),
  ('medicalCoverage',      'density',     '医保覆盖',     '周边医保定点机构密度'),
  ('trafficAccessibility', 'density',     '交通可达',     '公交/地铁站点数量'),
  ('regionalCarOwnership', 'density',     '汽车保有量',   '区域百人汽车保有量'),
  ('parkingAvailability',  'density',     '停车配套',     '500m内停车位数'),
  ('rentFactor',           'site',        '租金系数',     '单位面积租金/区域均价'),
  ('rentLevel',            'site',        '租金水平',     '周边商铺租金等级'),
  ('roadFrontage',         'site',        '临路面宽',     '地块临主干道面宽(m)'),
  ('landAvailability',     'site',        '地块面积',     '可开发用地面积(m²)'),
  ('zoningCompliance',     'site',        '规划合规',     '用地性质与规划匹配度'),
  ('policyCompliance',     'site',        '政策合规',     '行业许可及监管政策契合度'),
  ('transportConvenience', 'site',        '交通便利',     '距地铁/高架/快速路距离')
ON CONFLICT (kpi_name) DO UPDATE SET
  category = EXCLUDED.category,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;

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


-- ============================================================
-- Part 2: v2.0 扩展 (来源: init_v2.sql / migrations 001-008)
-- ============================================================


-- ============================================================
-- Migration 001: 扩展 site_optimization_models — v2.0 行业参数支持
-- 添加行业级分析参数、决策阈值、基准数据和 KPI 权重
-- 支持12行业定制化分析
-- ============================================================

ALTER TABLE site_optimization_models
  ADD COLUMN IF NOT EXISTS analysis_params JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS decision_thresholds JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS benchbarks JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS kpi_weights JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

COMMENT ON COLUMN site_optimization_models.analysis_params IS '行业级算法参数 (coverage/competition/scoring/KDE/cluster) (coverage/competition/scoring/KDE/cluster)';
COMMENT ON COLUMN site_optimization_models.decision_thresholds IS '行业决策引擎规则阈值';
COMMENT ON COLUMN site_optimization_models.benchbarks IS '行业基准数据 (用于对比分析)';
COMMENT ON COLUMN site_optimization_models.kpi_weights IS '行业默认 KPI 权重向量';

-- 更新前5个行业的默认 analysis_params
UPDATE site_optimization_models SET analysis_params = '{
  "coverage": {"radius_meters": 300},
  "decay": {"core_ratio": 0.4, "mid_ratio": 0.7, "core_weight": 1.0, "mid_weight": 0.5, "edge_weight": 0.25},
  "competition": {"near_radius_m": 300, "far_radius_m": 500, "normalization": {"max_competitors": 3, "function": "linear_down"}},
  "scoring": {"distance_normalize_m": 500, "density_normalize_count": 50, "blindspot_normalize_m": 3000},
  "overlap": {"triple_fractions": [0.7, 0.4, 0.2]},
  "kde": {"bandwidth_m": 1000, "grid_size_m": 500, "max_grid_cells": 80, "cutoff_factor": 3.0},
  "cluster": {"eps_m": 500, "min_points": 3}
}'::jsonb WHERE industry = 'convenience';

UPDATE site_optimization_models SET analysis_params = '{
  "coverage": {"radius_meters": 500},
  "decay": {"core_ratio": 0.4, "mid_ratio": 0.7, "core_weight": 1.0, "mid_weight": 0.5, "edge_weight": 0.25},
  "competition": {"near_radius_m": 500, "far_radius_m": 1000, "normalization": {"max_competitors": 5, "function": "sweet_spot"}},
  "scoring": {"distance_normalize_m": 500, "density_normalize_count": 50, "blindspot_normalize_m": 3000},
  "overlap": {"triple_fractions": [0.7, 0.4, 0.2]},
  "kde": {"bandwidth_m": 1000, "grid_size_m": 500, "max_grid_cells": 80, "cutoff_factor": 3.0},
  "cluster": {"eps_m": 500, "min_points": 3}
}'::jsonb WHERE industry = 'restaurant';

UPDATE site_optimization_models SET analysis_params = '{
  "coverage": {"radius_meters": 800},
  "decay": {"core_ratio": 0.4, "mid_ratio": 0.7, "core_weight": 1.0, "mid_weight": 0.5, "edge_weight": 0.25},
  "competition": {"near_radius_m": 350, "far_radius_m": 800, "hard_filter_m": 350, "normalization": {"max_competitors": 3, "function": "linear_down"}},
  "scoring": {"distance_normalize_m": 800, "density_normalize_count": 50, "blindspot_normalize_m": 3000},
  "overlap": {"triple_fractions": [0.7, 0.4, 0.2]},
  "kde": {"bandwidth_m": 1000, "grid_size_m": 500, "max_grid_cells": 80, "cutoff_factor": 3.0},
  "cluster": {"eps_m": 500, "min_points": 3}
}'::jsonb WHERE industry = 'pharmacy';

UPDATE site_optimization_models SET analysis_params = '{
  "coverage": {"radius_meters": 3000},
  "decay": {"core_ratio": 0.4, "mid_ratio": 0.7, "core_weight": 1.0, "mid_weight": 0.5, "edge_weight": 0.25},
  "competition": {"near_radius_m": 1000, "far_radius_m": 3000, "normalization": {"max_competitors": 5, "function": "linear_down"}},
  "scoring": {"distance_normalize_m": 1000, "density_normalize_count": 50, "blindspot_normalize_m": 3000},
  "overlap": {"triple_fractions": [0.7, 0.4, 0.2]},
  "kde": {"bandwidth_m": 2000, "grid_size_m": 1000, "max_grid_cells": 80, "cutoff_factor": 3.0},
  "cluster": {"eps_m": 1000, "min_points": 3}
}'::jsonb WHERE industry = 'supermarket';

UPDATE site_optimization_models SET analysis_params = '{
  "coverage": {"radius_meters": 10000},
  "decay": {"core_ratio": 0.4, "mid_ratio": 0.7, "core_weight": 1.0, "mid_weight": 0.5, "edge_weight": 0.25},
  "competition": {"near_radius_m": 3000, "far_radius_m": 5000, "normalization": {"max_competitors": 10, "function": "cluster_u"}},
  "scoring": {"distance_normalize_m": 3000, "density_normalize_count": 50, "blindspot_normalize_m": 10000},
  "overlap": {"triple_fractions": [0.7, 0.4, 0.2]},
  "kde": {"bandwidth_m": 5000, "grid_size_m": 2000, "max_grid_cells": 80, "cutoff_factor": 3.0},
  "cluster": {"eps_m": 3000, "min_points": 2}
}'::jsonb WHERE industry = 'auto4s';


-- ============================================================
-- Migration 002: 插入7个新行业模型 (v2.0)
-- beverage, fresh_grocery, hotel, medical_aesthetics,
-- education, pet_service, logistics
-- ============================================================

-- 1. 茶饮/咖啡 (beverage)
INSERT INTO site_optimization_models (industry, display_name, weights, description, is_default, radius_meters, analysis_params, decision_thresholds, benchbarks, kpi_weights, sort_order) VALUES
('beverage', '茶饮/咖啡',
 '{"algorithm":"weighted_sum","kpi_mapping":{"footTraffic":0.30,"competitionSweetSpot":0.25,"deliveryCoverage":0.25,"visibility":0.20}}',
 '茶饮咖啡选址：客流热度优先，竞争甜点区间(1-3家最优)，关注外卖覆盖与可见度',
 true, 400,
 '{"coverage":{"radius_meters":400},"decay":{"core_ratio":0.35,"mid_ratio":0.65,"core_weight":1.0,"mid_weight":0.5,"edge_weight":0.2},"competition":{"near_radius_m":200,"far_radius_m":400,"normalization":{"max_competitors":6,"function":"sweet_spot","sweet_peak":2}},"scoring":{"distance_normalize_m":400,"density_normalize_count":40,"blindspot_normalize_m":2000},"overlap":{"triple_fractions":[0.7,0.4,0.2]},"kde":{"bandwidth_m":500,"grid_size_m":200,"max_grid_cells":100,"cutoff_factor":3.0},"cluster":{"eps_m":300,"min_points":3}}'::jsonb,
 '{"gap_ratio":{"critical":40,"warning":30},"overlap_ratio":{"critical":60,"warning":40},"coverage_ratio":{"low":35,"medium":60,"high":80},"top_site_score":{"high":0.75,"medium":0.4},"cannibalization_index":{"critical":30}}'::jsonb,
 '{"coverage_ratio":{"median":62,"p75":78,"p90":88},"avg_neighbor_dist_m":{"median":200,"p75":280},"cannibalization_index_max":25}'::jsonb,
 '{"footTraffic":0.30,"competitionSweetSpot":0.25,"deliveryCoverage":0.25,"visibility":0.20}'::jsonb,
 6)
ON CONFLICT (industry) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  weights = EXCLUDED.weights,
  description = EXCLUDED.description,
  radius_meters = EXCLUDED.radius_meters,
  analysis_params = EXCLUDED.analysis_params,
  decision_thresholds = EXCLUDED.decision_thresholds,
  benchbarks = EXCLUDED.benchbarks,
  kpi_weights = EXCLUDED.kpi_weights,
  sort_order = EXCLUDED.sort_order;

-- 2. 生鲜超市 (fresh_grocery)
INSERT INTO site_optimization_models (industry, display_name, weights, description, is_default, radius_meters, analysis_params, decision_thresholds, benchbarks, kpi_weights, sort_order) VALUES
('fresh_grocery', '生鲜超市',
 '{"algorithm":"weighted_sum","kpi_mapping":{"populationDensity":0.30,"competitorDistance":0.25,"communityMaturity":0.20,"rentFactor":0.15,"barrierBonus":0.10}}',
 '生鲜选址：居住密度优先，竞品距离保护500-1000m，社区成熟度与屏障加成',
 true, 800,
 '{"coverage":{"radius_meters":800},"decay":{"core_ratio":0.4,"mid_ratio":0.7,"core_weight":1.0,"mid_weight":0.5,"edge_weight":0.25},"competition":{"near_radius_m":500,"far_radius_m":1000,"normalization":{"max_competitors":3,"function":"linear_down"}},"scoring":{"distance_normalize_m":800,"density_normalize_count":50,"blindspot_normalize_m":3000},"overlap":{"triple_fractions":[0.7,0.4,0.2]},"kde":{"bandwidth_m":800,"grid_size_m":400,"max_grid_cells":80,"cutoff_factor":3.0},"cluster":{"eps_m":500,"min_points":3}}'::jsonb,
 '{"gap_ratio":{"critical":35,"warning":25},"overlap_ratio":{"critical":50,"warning":35},"coverage_ratio":{"low":40,"medium":65,"high":82},"competitor_distance":{"critical":300,"warning":500}}'::jsonb,
 '{"coverage_ratio":{"median":55,"p75":70,"p90":85},"avg_neighbor_dist_m":{"median":350,"p75":500},"cannibalization_index_max":30}'::jsonb,
 '{"populationDensity":0.30,"competitorDistance":0.25,"communityMaturity":0.20,"rentFactor":0.15,"barrierBonus":0.10}'::jsonb,
 7)
ON CONFLICT (industry) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  weights = EXCLUDED.weights,
  description = EXCLUDED.description,
  radius_meters = EXCLUDED.radius_meters,
  analysis_params = EXCLUDED.analysis_params,
  decision_thresholds = EXCLUDED.decision_thresholds,
  benchbarks = EXCLUDED.benchbarks,
  kpi_weights = EXCLUDED.kpi_weights,
  sort_order = EXCLUDED.sort_order;

-- 3. 酒店/住宿 (hotel)
INSERT INTO site_optimization_models (industry, display_name, weights, description, is_default, radius_meters, analysis_params, decision_thresholds, benchbarks, kpi_weights, sort_order) VALUES
('hotel', '酒店/住宿',
 '{"algorithm":"weighted_sum","kpi_mapping":{"trafficAccessibility":0.28,"commercialDensity":0.22,"hotelCluster":0.25,"brandProtection":0.15,"roadFrontageBonus":0.10}}',
 '酒店选址：交通可达优先(含铁路航空)，产业集群正U型(2-10家最优)，主干道临街加成',
 true, 2000,
 '{"coverage":{"radius_meters":2000},"decay":{"core_ratio":0.4,"mid_ratio":0.7,"core_weight":1.0,"mid_weight":0.5,"edge_weight":0.25},"competition":{"near_radius_m":2000,"far_radius_m":5000,"normalization":{"max_competitors":15,"function":"cluster_u","cluster_best":6}},"scoring":{"distance_normalize_m":2000,"density_normalize_count":30,"blindspot_normalize_m":5000},"overlap":{"triple_fractions":[0.7,0.4,0.2]},"kde":{"bandwidth_m":2000,"grid_size_m":1000,"max_grid_cells":80,"cutoff_factor":3.0},"cluster":{"eps_m":1000,"min_points":2}}'::jsonb,
 '{"gap_ratio":{"critical":50,"warning":35},"overlap_ratio":{"critical":60,"warning":40},"coverage_ratio":{"low":25,"medium":50,"high":70},"top_site_score":{"high":0.7,"medium":0.35}}'::jsonb,
 '{"coverage_ratio":{"median":45,"p75":62,"p90":78},"avg_neighbor_dist_m":{"median":800,"p75":1200}}'::jsonb,
 '{"trafficAccessibility":0.28,"commercialDensity":0.22,"hotelCluster":0.25,"brandProtection":0.15,"roadFrontageBonus":0.10}'::jsonb,
 8)
ON CONFLICT (industry) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  weights = EXCLUDED.weights,
  description = EXCLUDED.description,
  radius_meters = EXCLUDED.radius_meters,
  analysis_params = EXCLUDED.analysis_params,
  decision_thresholds = EXCLUDED.decision_thresholds,
  benchbarks = EXCLUDED.benchbarks,
  kpi_weights = EXCLUDED.kpi_weights,
  sort_order = EXCLUDED.sort_order;

-- 4. Medical Aesthetics
INSERT INTO site_optimization_models (industry, display_name, weights, description, is_default, radius_meters, analysis_params, decision_thresholds, benchbarks, kpi_weights, sort_order) VALUES
('medical_aesthetics', '医美/口腔',
 '{"algorithm":"weighted_sum","kpi_mapping":{"highIncomeDensity":0.30,"beautyCluster":0.25,"commercialDensity":0.20,"parkingAvailability":0.15,"visibility":0.10}}',
 '医美选址：高收入人群密度优先(高端办公+高租金住宅)，正向集聚效应，停车配套',
 true, 3000,
 '{"coverage":{"radius_meters":3000},"decay":{"core_ratio":0.4,"mid_ratio":0.7,"core_weight":1.0,"mid_weight":0.5,"edge_weight":0.25},"competition":{"near_radius_m":3000,"far_radius_m":5000,"normalization":{"max_competitors":12,"function":"cluster_u","cluster_best":5}},"scoring":{"distance_normalize_m":3000,"density_normalize_count":50,"blindspot_normalize_m":5000},"overlap":{"triple_fractions":[0.7,0.4,0.2]},"kde":{"bandwidth_m":2000,"grid_size_m":1000,"max_grid_cells":80,"cutoff_factor":3.0},"cluster":{"eps_m":1000,"min_points":3}}'::jsonb,
 '{"gap_ratio":{"critical":40,"warning":30},"overlap_ratio":{"critical":50,"warning":35},"coverage_ratio":{"low":30,"medium":55,"high":75}}'::jsonb,
 '{"coverage_ratio":{"median":50,"p75":68,"p90":82},"avg_neighbor_dist_m":{"median":1000,"p75":1500}}'::jsonb,
 '{"highIncomeDensity":0.30,"beautyCluster":0.25,"commercialDensity":0.20,"parkingAvailability":0.15,"visibility":0.10}'::jsonb,
 9)
ON CONFLICT (industry) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  weights = EXCLUDED.weights,
  description = EXCLUDED.description,
  radius_meters = EXCLUDED.radius_meters,
  analysis_params = EXCLUDED.analysis_params,
  decision_thresholds = EXCLUDED.decision_thresholds,
  benchbarks = EXCLUDED.benchbarks,
  kpi_weights = EXCLUDED.kpi_weights,
  sort_order = EXCLUDED.sort_order;

-- 5. 教育培训
INSERT INTO site_optimization_models (industry, display_name, weights, description, is_default, radius_meters, analysis_params, decision_thresholds, benchbarks, kpi_weights, sort_order) VALUES
('education', '教育培训',
 '{"algorithm":"weighted_sum","kpi_mapping":{"familyDensity":0.30,"competitorDistance":0.25,"schoolProximity":0.20,"commercialDensity":0.15,"transportConvenience":0.10}}',
 '教育培训选址：家庭密度优先，距学校越近越好(500m内)，竞品距离保护',
 true, 1500,
 '{"coverage":{"radius_meters":1500},"decay":{"core_ratio":0.4,"mid_ratio":0.7,"core_weight":1.0,"mid_weight":0.5,"edge_weight":0.25},"competition":{"near_radius_m":500,"far_radius_m":1000,"normalization":{"max_competitors":5,"function":"linear_down"}},"scoring":{"distance_normalize_m":1000,"density_normalize_count":40,"blindspot_normalize_m":3000},"overlap":{"triple_fractions":[0.7,0.4,0.2]},"kde":{"bandwidth_m":1000,"grid_size_m":500,"max_grid_cells":80,"cutoff_factor":3.0},"cluster":{"eps_m":500,"min_points":3}}'::jsonb,
 '{"gap_ratio":{"critical":35,"warning":25},"overlap_ratio":{"critical":45,"warning":30},"coverage_ratio":{"low":35,"medium":60,"high":78},"competitor_distance":{"critical":500,"warning":800}}'::jsonb,
 '{"coverage_ratio":{"median":55,"p75":72,"p90":85},"avg_neighbor_dist_m":{"median":500,"p75":800}}'::jsonb,
 '{"familyDensity":0.30,"competitorDistance":0.25,"schoolProximity":0.20,"commercialDensity":0.15,"transportConvenience":0.10}'::jsonb,
 10)
ON CONFLICT (industry) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  weights = EXCLUDED.weights,
  description = EXCLUDED.description,
  radius_meters = EXCLUDED.radius_meters,
  analysis_params = EXCLUDED.analysis_params,
  decision_thresholds = EXCLUDED.decision_thresholds,
  benchbarks = EXCLUDED.benchbarks,
  kpi_weights = EXCLUDED.kpi_weights,
  sort_order = EXCLUDED.sort_order;

-- 6. 宠物服务 (pet_service)
INSERT INTO site_optimization_models (industry, display_name, weights, description, is_default, radius_meters, analysis_params, decision_thresholds, benchbarks, kpi_weights, sort_order) VALUES
('pet_service', '宠物服务',
 '{"algorithm":"weighted_sum","kpi_mapping":{"residentialDensity":0.32,"competitorDistance":0.28,"communityMaturity":0.22,"walkableRatio":0.18}}',
 '宠物选址：社区配套型，居住密度唯一核心，竞品保护距离2000m',
 true, 2000,
 '{"coverage":{"radius_meters":2000},"decay":{"core_ratio":0.4,"mid_ratio":0.7,"core_weight":1.0,"mid_weight":0.5,"edge_weight":0.25},"competition":{"near_radius_m":1000,"far_radius_m":2000,"normalization":{"max_competitors":3,"function":"linear_down"}},"scoring":{"distance_normalize_m":1500,"density_normalize_count":30,"blindspot_normalize_m":3000},"overlap":{"triple_fractions":[0.7,0.4,0.2]},"kde":{"bandwidth_m":1500,"grid_size_m":800,"max_grid_cells":80,"cutoff_factor":3.0},"cluster":{"eps_m":1000,"min_points":2}}'::jsonb,
 '{"gap_ratio":{"critical":35,"warning":25},"overlap_ratio":{"critical":40,"warning":25},"coverage_ratio":{"low":30,"medium":55,"high":75},"competitor_distance":{"critical":1000,"warning":1500}}'::jsonb,
 '{"coverage_ratio":{"median":50,"p75":68,"p90":80},"avg_neighbor_dist_m":{"median":800,"p75":1200}}'::jsonb,
 '{"residentialDensity":0.32,"competitorDistance":0.28,"communityMaturity":0.22,"walkableRatio":0.18}'::jsonb,
 11)
ON CONFLICT (industry) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  weights = EXCLUDED.weights,
  description = EXCLUDED.description,
  radius_meters = EXCLUDED.radius_meters,
  analysis_params = EXCLUDED.analysis_params,
  decision_thresholds = EXCLUDED.decision_thresholds,
  benchbarks = EXCLUDED.benchbarks,
  kpi_weights = EXCLUDED.kpi_weights,
  sort_order = EXCLUDED.sort_order;

-- 7. 物流/快递驿站 (logistics)
INSERT INTO site_optimization_models (industry, display_name, weights, description, is_default, radius_meters, analysis_params, decision_thresholds, benchbarks, kpi_weights, sort_order) VALUES
('logistics', '物流/快递驿站',
 '{"algorithm":"weighted_sum","kpi_mapping":{"residentialDensity":0.35,"competitorDistance":0.30,"streetAccess":0.20,"commercialDensity":0.15}}',
 '物流驿站选址：居住密度核心，竞品保护500m，主干道通达性二元判断',
 true, 500,
 '{"coverage":{"radius_meters":500},"decay":{"core_ratio":0.5,"mid_ratio":0.8,"core_weight":1.0,"mid_weight":0.6,"edge_weight":0.3},"competition":{"near_radius_m":500,"far_radius_m":1000,"normalization":{"max_competitors":2,"function":"linear_down"}},"scoring":{"distance_normalize_m":500,"density_normalize_count":40,"blindspot_normalize_m":2000},"overlap":{"triple_fractions":[0.7,0.4,0.2]},"kde":{"bandwidth_m":500,"grid_size_m":200,"max_grid_cells":100,"cutoff_factor":3.0},"cluster":{"eps_m":300,"min_points":2}}'::jsonb,
 '{"gap_ratio":{"critical":25,"warning":15},"overlap_ratio":{"critical":30,"warning":20},"coverage_ratio":{"low":40,"medium":65,"high":82},"competitor_distance":{"critical":500,"warning":800}}'::jsonb,
 '{"coverage_ratio":{"median":65,"p75":82,"p90":92},"avg_neighbor_dist_m":{"median":300,"p75":450}}'::jsonb,
 '{"residentialDensity":0.35,"competitorDistance":0.30,"streetAccess":0.20,"commercialDensity":0.15}'::jsonb,
 12)
ON CONFLICT (industry) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  weights = EXCLUDED.weights,
  description = EXCLUDED.description,
  radius_meters = EXCLUDED.radius_meters,
  analysis_params = EXCLUDED.analysis_params,
  decision_thresholds = EXCLUDED.decision_thresholds,
  benchbarks = EXCLUDED.benchbarks,
  kpi_weights = EXCLUDED.kpi_weights,
  sort_order = EXCLUDED.sort_order;


-- ============================================================
-- Migration 003: 创建分析类型注册表
-- 替代代码中分散的硬编码分析类型字符串
-- quota.ts, queue.ts, apiV1Controller.ts, analysisWorker.ts
-- ============================================================

CREATE TABLE IF NOT EXISTS analysis_types (
  type VARCHAR(50) PRIMARY KEY,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  default_params JSONB DEFAULT '{}',
  requires_poi BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO analysis_types (type, display_name, description, default_params, requires_poi) VALUES
  ('coverage', '覆盖分析', '门店服务半径覆盖范围与盲区分析', '{"radius_meters": 3000, "decay": false, "whitespace": false}', false),
  ('heatmap', '热力图', '基于KDE核密度估计的门店密度热力分布', '{"bandwidth_meters": 1000, "grid_size_meters": 500}', false),
  ('cluster', '聚类分析', '基于DBSCAN的门店空间聚类识别', '{"eps_meters": 500, "min_points": 3}', false),
  ('site-optimization', '选址优化', '多因子加权选址评分与推荐', '{"top_k": 5}', true),
  ('voronoi', '泰森多边形', '门店服务区泰森多边形划分', '{}', false),
  ('h3-hexagon', 'H3等值区域', '基于H3六边形网格的空间聚合分析', '{"resolution": 9}', false)
ON CONFLICT (type) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  default_params = EXCLUDED.default_params,
  requires_poi = EXCLUDED.requires_poi;

-- 分析类型与套餐关联
CREATE TABLE IF NOT EXISTS plan_analysis_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan VARCHAR(20) NOT NULL,
  analysis_type VARCHAR(50) NOT NULL REFERENCES analysis_types(type) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plan, analysis_type)
);

INSERT INTO plan_analysis_access (plan, analysis_type) VALUES
  ('free', 'coverage'),
  ('free', 'cluster'),
  ('free', 'h3-hexagon'),
  ('pro', 'coverage'),
  ('pro', 'heatmap'),
  ('pro', 'cluster'),
  ('pro', 'site-optimization'),
  ('pro', 'voronoi'),
  ('pro', 'h3-hexagon'),
  ('enterprise', 'coverage'),
  ('enterprise', 'heatmap'),
  ('enterprise', 'cluster'),
  ('enterprise', 'site-optimization'),
  ('enterprise', 'voronoi'),
  ('enterprise', 'h3-hexagon')
ON CONFLICT (plan, analysis_type) DO NOTHING;


-- ============================================================
-- Migration 004: 创建行业关键词自动检测表
-- 中英文关键词 → 行业代码映射，用于自动检测项目行业
-- 替代 projectService.ts 中的硬编码 if-else 链
-- ============================================================

CREATE TABLE IF NOT EXISTS industry_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry VARCHAR(50) NOT NULL REFERENCES site_optimization_models(industry) ON DELETE CASCADE,
  keyword VARCHAR(50) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(industry, keyword)
);

CREATE INDEX IF NOT EXISTS idx_industry_keywords_industry ON industry_keywords(industry);
CREATE INDEX IF NOT EXISTS idx_industry_keywords_priority ON industry_keywords(priority DESC);

-- 预置12行业关键词种子 (priority: higher = matched first)
INSERT INTO industry_keywords (industry, keyword, priority) VALUES
  -- convenience
  ('convenience', '便利店', 10),
  ('convenience', '便利', 5),
  ('convenience', '零售', 2),
  ('convenience', '杂货', 2),
  -- beverage
  ('beverage', '奶茶', 10),
  ('beverage', '茶饮', 10),
  ('beverage', '咖啡', 8),
  ('beverage', '饮品', 5),
  ('beverage', '甜品', 3),
  -- restaurant
  ('restaurant', '餐饮', 10),
  ('restaurant', '餐厅', 9),
  ('restaurant', '美食', 7),
  ('restaurant', '火锅', 7),
  ('restaurant', '小吃', 5),
  ('restaurant', '面食', 5),
  -- pharmacy
  ('pharmacy', '药店', 10),
  ('pharmacy', '药房', 9),
  ('pharmacy', '诊所', 5),
  ('pharmacy', '医疗', 3),
  -- fresh_grocery
  ('fresh_grocery', '生鲜', 10),
  ('fresh_grocery', '水果', 8),
  ('fresh_grocery', '蔬菜', 7),
  ('fresh_grocery', '菜市场', 5),
  ('fresh_grocery', '农贸', 5),
  -- supermarket
  ('supermarket', '商超', 10),
  ('supermarket', '超市', 9),
  ('supermarket', '百货', 7),
  ('supermarket', '商场', 5),
  -- hotel
  ('hotel', '酒店', 10),
  ('hotel', '宾馆', 9),
  ('hotel', '住宿', 7),
  ('hotel', '旅店', 6),
  -- medical_aesthetics
  ('medical_aesthetics', '医美', 10),
  ('medical_aesthetics', '美容', 8),
  ('medical_aesthetics', '口腔', 7),
  ('medical_aesthetics', '美发', 3),
  ('medical_aesthetics', '理发', 2),
  -- education
  ('education', '教育', 10),
  ('education', '培训', 9),
  ('education', '辅导', 7),
  ('education', '学校', 6),
  -- pet_service
  ('pet_service', '宠物', 10),
  ('pet_service', '宠物店', 10),
  ('pet_service', '宠物医院', 8),
  -- auto4s
  ('auto4s', '汽车', 10),
  ('auto4s', '4S', 10),
  ('auto4s', '4S店', 10),
  ('auto4s', '汽贸', 5),
  -- logistics
  ('logistics', '物流', 10),
  ('logistics', '快递', 9),
  ('logistics', '驿站', 8),
  ('logistics', '配送', 7)
ON CONFLICT (industry, keyword) DO UPDATE SET priority = EXCLUDED.priority;


-- ============================================================
-- Migration 005: 扩展 POI 类别 (14 → 40+)
-- 扩展 poiCollector.ts 的 COLLECT_QUEUE 类别
-- 从14个增至40+个，覆盖全部12行业
-- ============================================================

-- POI 类别参考表
CREATE TABLE IF NOT EXISTS poi_categories (
    category VARCHAR(50) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    amap_keyword VARCHAR(50) NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'amap',
    enabled BOOLEAN NOT NULL DEFAULT true,
    industry_relevance TEXT[] DEFAULT '{}',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE poi_categories IS 'POI 采集类别注册表 — 替代硬编码的 COLLECT_QUEUE';

-- 预置40+个 POI 类别，覆盖全部12行业
INSERT INTO poi_categories (category, display_name, amap_keyword, source, industry_relevance, sort_order) VALUES
-- 核心类别 (已有)
('residential', '住宅小区', '住宅小区', 'amap', ARRAY['convenience','fresh_grocery','pharmacy','pet_service','logistics','education','beverage'], 1),
('office', '写字楼', '写字楼', 'amap', ARRAY['convenience','restaurant','beverage','hotel','medical_aesthetics'], 2),
('transport', '地铁站', '地铁站', 'amap', ARRAY['convenience','restaurant','beverage','hotel','supermarket','logistics'], 3),
('commercial', '商圈', '商圈', 'amap', ARRAY['all'], 4),
('medical', '医院', '医院', 'amap', ARRAY['pharmacy','medical_aesthetics'], 5),

-- 教育培训
('school', '学校', '学校', 'amap', ARRAY['education','pharmacy','fresh_grocery'], 6),
('kindergarten', '幼儿园', '幼儿园', 'amap', ARRAY['education','pharmacy'], 7),
('training', '培训机构', '培训机构', 'amap', ARRAY['education'], 8),

-- 酒店住宿
('hotel_poi', '酒店', '酒店', 'amap', ARRAY['hotel'], 9),

-- 交通出行
('parking', '停车场', '停车场', 'amap', ARRAY['supermarket','medical_aesthetics','hotel'], 10),

-- 宠物服务
('pet', '宠物店', '宠物店', 'amap', ARRAY['pet_service'], 11),
('pet_hospital', '宠物医院', '宠物医院', 'amap', ARRAY['pet_service'], 12),
('veterinary', '兽医站', '兽医站', 'amap', ARRAY['pet_service'], 13),
('grooming', '宠物美容', '宠物美容', 'amap', ARRAY['pet_service'], 14),

-- 茶饮咖啡
('beverage_poi', '咖啡厅', '咖啡厅', 'amap', ARRAY['beverage'], 15),
('tea_shop', '茶饮店', '茶饮店', 'amap', ARRAY['beverage'], 16),
('bakery', '面包甜点', '面包甜点', 'amap', ARRAY['beverage','convenience'], 17),

-- 餐饮美食
('restaurant_poi', '餐厅', '餐厅', 'amap', ARRAY['restaurant'], 18),
('fast_food', '快餐', '快餐', 'amap', ARRAY['restaurant','convenience'], 19),
('catering', '餐饮', '餐饮', 'amap', ARRAY['restaurant'], 20),

-- 零售购物
('supermarket_poi', '超市', '超市', 'amap', ARRAY['supermarket','fresh_grocery'], 21),
('convenience_poi', '便利店', '便利店', 'amap', ARRAY['convenience'], 22),
('pharmacy_poi', '药房', '药房', 'amap', ARRAY['pharmacy'], 23),

-- 医美健康
('beauty', '美容院', '美容院', 'amap', ARRAY['medical_aesthetics'], 24),
('dental', '口腔诊所', '口腔诊所', 'amap', ARRAY['medical_aesthetics'], 25),
('plastic_surgery', '整形医院', '整形医院', 'amap', ARRAY['medical_aesthetics'], 26),

-- 生活服务
('gym', '健身房', '健身房', 'amap', ARRAY['hotel','medical_aesthetics'], 27),
('bank', '银行', '银行', 'amap', ARRAY['all'], 28),
('post_office', '邮局', '邮局', 'amap', ARRAY['logistics'], 29),
('express_station', '快递站', '快递站', 'amap', ARRAY['logistics'], 30),

-- 汽车相关
('gas_station', '加油站', '加油站', 'amap', ARRAY['auto4s','logistics'], 31),
('auto_repair', '汽车维修', '汽车维修', 'amap', ARRAY['auto4s'], 32),
('auto_dealer', '汽车销售', '汽车销售', 'amap', ARRAY['auto4s'], 33),
('car_wash', '洗车场', '洗车场', 'amap', ARRAY['auto4s'], 34),

-- 市场/特色
('wholesale_market', '批发市场', '批发市场', 'amap', ARRAY['fresh_grocery','logistics'], 35),
('farmers_market', '菜市场', '菜市场', 'amap', ARRAY['fresh_grocery'], 36),
('residential_community', '居民小区', '居民小区', 'amap', ARRAY['all'], 37),
('entertainment', '娱乐场所', '娱乐场所', 'amap', ARRAY['hotel','restaurant'], 38),
('scenic_spot', '景点', '景点', 'amap', ARRAY['hotel'], 39),
('industrial_zone', '工业园区', '工业园区', 'amap', ARRAY['logistics','auto4s'], 40)
ON CONFLICT (category) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    amap_keyword = EXCLUDED.amap_keyword,
    industry_relevance = EXCLUDED.industry_relevance,
    sort_order = EXCLUDED.sort_order;

-- industry_relevance 数组 GIN 索引 (快速查找)
CREATE INDEX IF NOT EXISTS idx_poi_categories_industry ON poi_categories USING GIN(industry_relevance);

-- public_poi.category 与 poi_categories 关联索引
CREATE INDEX IF NOT EXISTS idx_poi_category_lookup ON public_poi(category, h3_index);


-- ============================================================
-- Migration 006: 预置12行业基准数据
-- 填充全部12个行业的 benchbarks JSONB 基准数据
-- 基准值为行业关键指标的中位数/P75/P90
-- ============================================================

-- ===== 1. 便利店 (convenience) =====
UPDATE site_optimization_models SET benchbarks = '{
    "coverage_ratio": {"median": 65, "p75": 78, "p90": 88},
    "avg_neighbor_dist_m": {"median": 250, "p75": 350},
    "competition_density_per_km2": {"median": 1.5, "p75": 3.0},
    "cannibalization_index_max": 35,
    "walkable_ratio_p50": 0.45,
    "poi_density_p50": 30,
    "rent_index_p50": 1.0
}'::jsonb WHERE industry = 'convenience';

-- ===== 2. 茶饮/咖啡 (beverage) =====
UPDATE site_optimization_models SET benchbarks = '{
    "coverage_ratio": {"median": 62, "p75": 78, "p90": 88},
    "avg_neighbor_dist_m": {"median": 200, "p75": 280},
    "competition_density_per_km2": {"median": 3.0, "p75": 6.0},
    "cannibalization_index_max": 25,
    "foot_traffic_p50": 40,
    "delivery_coverage_p50": 0.70,
    "visibility_p50": 25
}'::jsonb WHERE industry = 'beverage';

-- ===== 3. 餐饮 (restaurant) =====
UPDATE site_optimization_models SET benchbarks = '{
    "coverage_ratio": {"median": 55, "p75": 68, "p90": 80},
    "avg_neighbor_dist_m": {"median": 300, "p75": 450},
    "competition_density_per_km2": {"median": 4.0, "p75": 8.0},
    "cannibalization_index_max": 30,
    "foot_traffic_p50": 50,
    "delivery_coverage_p50": 0.65,
    "visibility_p50": 20
}'::jsonb WHERE industry = 'restaurant';

-- ===== 4. 药店 (pharmacy) =====
UPDATE site_optimization_models SET benchbarks = '{
    "coverage_ratio": {"median": 50, "p75": 65, "p90": 75},
    "avg_neighbor_dist_m": {"median": 500, "p75": 700},
    "competition_density_per_km2": {"median": 1.0, "p75": 2.5},
    "cannibalization_index_max": 40,
    "population_structure_p50": 0.55,
    "medical_coverage_p50": 0.50,
    "competitor_distance_safe_p50": 600
}'::jsonb WHERE industry = 'pharmacy';

-- ===== 5. 生鲜超市 (fresh_grocery) =====
UPDATE site_optimization_models SET benchbarks = '{
    "coverage_ratio": {"median": 55, "p75": 70, "p90": 85},
    "avg_neighbor_dist_m": {"median": 350, "p75": 500},
    "competition_density_per_km2": {"median": 2.0, "p75": 4.0},
    "cannibalization_index_max": 30,
    "population_density_p50": 8000,
    "competitor_distance_p50": 600,
    "community_maturity_p50": 0.60
}'::jsonb WHERE industry = 'fresh_grocery';

-- ===== 6. 商超 (supermarket) =====
UPDATE site_optimization_models SET benchbarks = '{
    "coverage_ratio": {"median": 45, "p75": 58, "p90": 70},
    "avg_neighbor_dist_m": {"median": 1500, "p75": 2500},
    "competition_density_per_km2": {"median": 0.5, "p75": 1.0},
    "cannibalization_index_max": 45,
    "population_density_p50": 12000,
    "traffic_accessibility_p50": 5,
    "parking_availability_p50": 15
}'::jsonb WHERE industry = 'supermarket';

-- ===== 7. 酒店 (hotel) =====
UPDATE site_optimization_models SET benchbarks = '{
    "coverage_ratio": {"median": 40, "p75": 52, "p90": 65},
    "avg_neighbor_dist_m": {"median": 1200, "p75": 2000},
    "competition_density_per_km2": {"median": 1.5, "p75": 3.0},
    "cannibalization_index_max": 50,
    "traffic_accessibility_p50": 7,
    "commercial_density_p50": 40,
    "hotel_cluster_optimal": 6
}'::jsonb WHERE industry = 'hotel';

-- ===== 8. 医美/口腔 (medical_aesthetics) =====
UPDATE site_optimization_models SET benchbarks = '{
    "coverage_ratio": {"median": 35, "p75": 48, "p90": 60},
    "avg_neighbor_dist_m": {"median": 1500, "p75": 2500},
    "competition_density_per_km2": {"median": 0.8, "p75": 2.0},
    "cannibalization_index_max": 55,
    "high_income_density_p50": 3000,
    "beauty_cluster_optimal": 5,
    "commercial_density_p50": 35
}'::jsonb WHERE industry = 'medical_aesthetics';

-- ===== 9. 教育培训 (education) =====
UPDATE site_optimization_models SET benchbarks = '{
    "coverage_ratio": {"median": 45, "p75": 58, "p90": 72},
    "avg_neighbor_dist_m": {"median": 800, "p75": 1200},
    "competition_density_per_km2": {"median": 2.0, "p75": 4.0},
    "cannibalization_index_max": 35,
    "family_density_p50": 5000,
    "competitor_distance_p50": 600,
    "school_proximity_optimal": 300
}'::jsonb WHERE industry = 'education';

-- ===== 10. 宠物服务 (pet_service) =====
UPDATE site_optimization_models SET benchbarks = '{
    "coverage_ratio": {"median": 50, "p75": 65, "p90": 78},
    "avg_neighbor_dist_m": {"median": 600, "p75": 900},
    "competition_density_per_km2": {"median": 1.5, "p75": 3.0},
    "cannibalization_index_max": 30,
    "residential_density_p50": 10000,
    "competitor_distance_p50": 800,
    "community_maturity_p50": 0.55
}'::jsonb WHERE industry = 'pet_service';

-- ===== 11. 汽车4S店 (auto4s) =====
UPDATE site_optimization_models SET benchbarks = '{
    "coverage_ratio": {"median": 25, "p75": 38, "p90": 50},
    "avg_neighbor_dist_m": {"median": 5000, "p75": 8000},
    "competition_density_per_km2": {"median": 0.3, "p75": 0.8},
    "cannibalization_index_max": 60,
    "road_frontage_min_m": 30,
    "land_availability_min_m2": 5000,
    "car_ownership_density_p50": 200
}'::jsonb WHERE industry = 'auto4s';

-- ===== 12. 物流/快递驿站 (logistics) =====
UPDATE site_optimization_models SET benchbarks = '{
    "coverage_ratio": {"median": 60, "p75": 75, "p90": 85},
    "avg_neighbor_dist_m": {"median": 200, "p75": 350},
    "competition_density_per_km2": {"median": 1.0, "p75": 2.5},
    "cannibalization_index_max": 20,
    "residential_density_p50": 12000,
    "competitor_distance_p50": 300,
    "street_access_p50": 1.0
}'::jsonb WHERE industry = 'logistics';


-- ============================================================
-- Migration 007: 预置 KPI 注册表种子数据
-- 扩展现有 kpi_category_map 至42个 KPI 条目（含归一化配置）
-- ============================================================

-- 幂等建表 (来自 migration_kpi_category_map.sql)
CREATE TABLE IF NOT EXISTS kpi_category_map (
    kpi_name VARCHAR(64) PRIMARY KEY,
    category VARCHAR(20) NOT NULL CHECK (category IN ('reach', 'competition', 'density', 'site')),
    display_name VARCHAR(100),
    description TEXT,
    normalization_type VARCHAR(30) DEFAULT 'linearUp',
    normalization_params JSONB DEFAULT '{}',
    data_source VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== REACH category (可达性/覆盖) =====
INSERT INTO kpi_category_map (kpi_name, category, display_name, description, normalization_type, normalization_params, data_source) VALUES
('walkableRatio',        'reach', '步行可达比',   '500m步行范围内覆盖居民比例',               'linearUp', '{"max":"median_of_project"}', 'POI_RES ring1'),
('coverageRatio',        'reach', '覆盖率',       '服务半径内覆盖的目标客群比例',             'linearUp', '{"max":"highest_in_project"}', 'POI_RES ring1..ringN'),
('footTraffic',          'reach', '客流热度',     '周边日均人流量指数',                       'linearUp', '{"max":"city_p95"}', 'POI_TRN+POI_COM ring1'),
('visibility',           'reach', '可见度',       '门店临街面数及视距评分',                   'linearUp', '{"max":"highest_in_project"}', 'POI_COM ring0'),
('deliveryCoverage',     'reach', '外卖覆盖',     '3km内外卖配送覆盖率',                      'linearUp', '{"max":"highest_in_project"}', 'POI_RES ring3'),
('brandProtection',      'reach', '品牌保护',     '同品牌门店距离保护',                       'linearUp', '{"max":3000}', 'COMP brand-distance'),
('schoolProximity',      'reach', '学校临近度',   '最近小学/幼儿园距离倒数',                  'linearDown', '{"max":500}', 'POI school distance'),
('dineInRadius',         'reach', '堂食半径',     '堂食覆盖半径内居民密度',                  'linearUp', '{"max":"highest_in_project"}', 'POI_RES ring1')
ON CONFLICT (kpi_name) DO UPDATE SET
    category = EXCLUDED.category,
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    normalization_type = EXCLUDED.normalization_type,
    normalization_params = EXCLUDED.normalization_params,
    data_source = EXCLUDED.data_source;

-- ===== COMPETITION category (竞争) =====
INSERT INTO kpi_category_map (kpi_name, category, display_name, description, normalization_type, normalization_params, data_source) VALUES
('competitorAvoidance',  'competition', '竞品回避',     '周边竞品门店数反比',                     'linearDown', '{"max":3}', 'COMP 300m'),
('competitionDensity',   'competition', '竞争密度',     '区域内同业态门店密度',                   'linearDown', '{"max":3}', 'COMP / area_km2'),
('competitorDistance',   'competition', '竞品距离',     '最近竞品门店距离(m)',                    'linearUp', '{"max":1000}', 'COMP_DIST_MIN'),
('competitorClustering', 'competition', '产业集群度',   '同业聚集程度',                           'sweetSpot', '{"min":0,"peak":3,"max":8}', 'COMP cluster_count'),
('competitionSweetSpot', 'competition', '竞争甜点',     '竞争数量适中最优区间',                   'sweetSpot', '{"min":0,"peak":2,"max":6}', 'COMP 200m'),
('cannibalizationIndex', 'competition', '蚕食指数',     '自有门店互相蚕食程度',                   'linearDown', '{"max":30}', 'OWN overlap_ratio'),
('gapRatio',             'competition', '空白比例',     '服务半径覆盖空白区域占比',               'linearDown', '{"max":40}', 'OWN coverage_gap'),
('overlapRatio',         'competition', '重叠比例',     '门店间服务半径重叠程度',                 'linearDown', '{"max":60}', 'OWN overlap'),
('hotelCluster',         'competition', '酒店集群度',   '酒店行业集群效应(正向)',                 'clusterU', '{"low":2,"best":6,"high":15}', 'COMP 2000m'),
('beautyCluster',        'competition', '医美集群度',   '医美行业集群效应(正向)',                 'clusterU', '{"low":1,"best":5,"high":12}', 'COMP 3000m'),
('autoCluster',          'competition', '汽车集群度',   '汽车4S店集群效应(正向)',                 'clusterU', '{"low":1,"best":5,"high":10}', 'COMP 3000m'),
('competitorDistanceHard','competition', '竞品硬约束',   '竞品距离不满足直接淘汰(hardFilter)',     'hardFilter', '{"threshold":350,"direction":"lt"}', 'COMP_DIST_MIN'),
('competitorDistanceSafe','competition', '竞品安全距',   '通过硬约束后的竞品安全距离',             'linearUp', '{"max":800}', 'COMP_DIST_MIN filtered')
ON CONFLICT (kpi_name) DO UPDATE SET
    category = EXCLUDED.category,
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    normalization_type = EXCLUDED.normalization_type,
    normalization_params = EXCLUDED.normalization_params,
    data_source = EXCLUDED.data_source;

-- ===== DENSITY category (密度/人口) =====
INSERT INTO kpi_category_map (kpi_name, category, display_name, description, normalization_type, normalization_params, data_source) VALUES
('populationStructure',  'density', '人口结构',     '年龄/收入/家庭结构适配度',                 'linearUp', '{"max":1.0}', 'POI_RES+POI_MED ring1'),
('populationDensity',    'density', '人口密度',     '常住人口密度(人/km²)',                     'linearUp', '{"max":"city_p95"}', 'POI_RES ring1'),
('poiDensity',           'density', '商业密度',     '周边POI数量',                              'linearUp', '{"max":"median_x2"}', 'POI_ALL ring1'),
('medicalCoverage',      'density', '医保覆盖',     '周边医保定点机构密度',                     'linearUp', '{"max":"city_median"}', 'POI_MED ring2'),
('trafficAccessibility', 'density', '交通可达',     '公交/地铁站点数量',                        'linearUp', '{"max":10}', 'POI_TRN ring1'),
('regionalCarOwnership', 'density', '汽车保有量',   '区域百人汽车保有量',                       'linearUp', '{"max":"city_max"}', 'city_level'),
('parkingAvailability',  'density', '停车配套',     '500m内停车位数',                           'linearUp', '{"max":"city_p90"}', 'POI_PKG ring1'),
('residentialDensity',   'density', '居住密度',     '周边居民密度',                             'linearUp', '{"max":"city_p90"}', 'POI_RES ring1'),
('commercialDensity',    'density', '商圈密度',     '周边商业设施密度',                         'linearUp', '{"max":"city_p90"}', 'POI_COM+POI_OFF ring2'),
('communityMaturity',    'density', '社区成熟度',   '社区配套完备程度',                         'linearUp', '{"max":"project_p90"}', 'POI_ALL ring1'),
('highIncomeDensity',    'density', '高收入密度',   '高净值人群聚集度',                         'linearUp', '{"max":"city_p95"}', 'POI_OFF+high_rent ring2'),
('familyDensity',        'density', '家庭密度',     '有孩家庭聚集度',                           'linearUp', '{"max":"city_p90"}', 'POI_RES+school ring1'),
('carOwnershipDensity',  'density', '保有量密度',   '区域汽车保有量密度(4S行业专用)',           'linearUp', '{"max":"city_max"}', 'city_level')
ON CONFLICT (kpi_name) DO UPDATE SET
    category = EXCLUDED.category,
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    normalization_type = EXCLUDED.normalization_type,
    normalization_params = EXCLUDED.normalization_params,
    data_source = EXCLUDED.data_source;

-- ===== SITE category (场地/区位) =====
INSERT INTO kpi_category_map (kpi_name, category, display_name, description, normalization_type, normalization_params, data_source) VALUES
('rentFactor',           'site', '租金系数',     '单位面积租金/区域均价',                     'linearDown', '{"max":2.0}', 'POI_COM ring1'),
('rentLevel',            'site', '租金水平',     '周边商铺租金等级',                         'step', '{"steps":[[0,1.0],[0.3,0.7],[0.6,0.3]]}', 'POI_COM ring1'),
('roadFrontage',         'site', '临路面宽',     '地块临主干道面宽(m)',                      'step', '{"steps":[[0,0],[100,0.3],[300,0.7],[500,1.0]]}', 'OSM road'),
('roadFrontageBonus',    'site', '主干道加分',   '靠近主干道额外加分(酒店)',                 'binary', '{"true_val":1.0,"false_val":0.3}', 'OSM road'),
('streetAccess',         'site', '临街通达',     '临主干道通达性(物流)',                     'binary', '{"true_val":1.0,"false_val":0.3}', 'OSM road'),
('landAvailability',     'site', '地块面积',     '可开发用地面积(m²)',                       'step', '{"steps":[[1000,0],[3000,0.3],[5000,0.7],[8000,1.0]]}', 'OSM land'),
('zoningCompliance',     'site', '规划合规',     '用地性质与规划匹配度',                     'step', '{"steps":[["residential",0.3],["commercial",1.0],["industrial",0.7]]}', 'OSM zoning'),
('policyCompliance',     'site', '政策合规',     '行业许可及监管政策契合度',                 'step', '{"steps":[[100,1.0],[200,0.7],[0,0.3]]}', 'distance to restricted'),
('transportConvenience', 'site', '交通便利',     '距地铁/高架/快速路距离',                   'linearUp', '{"max":5}', 'POI_TRN ring1'),
('barrierBonus',         'site', '屏障加成',     '天然屏障(河流/道路)带来的竞争壁垒',        'binary', '{"true_val":1.0,"false_val":0.5}', 'OSM barrier')
ON CONFLICT (kpi_name) DO UPDATE SET
    category = EXCLUDED.category,
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    normalization_type = EXCLUDED.normalization_type,
    normalization_params = EXCLUDED.normalization_params,
    data_source = EXCLUDED.data_source;

-- 汇总: 42条 KPI，覆盖4大类别
-- reach: 8, competition: 13, density: 13, site: 10


-- ============================================================
-- Migration 008: 日志保留与隐私脱敏
-- 添加日志保留配置、隐私脱敏规则和结构化日志表
-- 
-- ============================================================

-- ===== 8.1 日志保留配置 =====
CREATE TABLE IF NOT EXISTS log_retention_config (
    config_key VARCHAR(50) PRIMARY KEY,
    config_value TEXT NOT NULL,
    config_type VARCHAR(20) NOT NULL DEFAULT 'string',
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO log_retention_config (config_key, config_value, config_type, description) VALUES
    ('api_log_retention_days', '90', 'integer', 'API usage log retention period in days'),
    ('error_log_retention_days', '180', 'integer', 'Error log retention period in days'),
    ('audit_log_retention_days', '365', 'integer', 'Audit log retention period in days'),
    ('analysis_result_retention_days', '30', 'integer', 'Cached analysis result retention in days'),
    ('log_level', 'info', 'string', 'Default log level: debug|info|warn|error'),
    ('structured_logging', 'true', 'boolean', 'Enable structured JSON logging'),
    ('log_to_db', 'true', 'boolean', 'Whether to persist logs to database')
ON CONFLICT (config_key) DO UPDATE SET
    config_value = EXCLUDED.config_value,
    config_type = EXCLUDED.config_type,
    description = EXCLUDED.description;

-- ===== 8.2 结构化应用日志表 =====
CREATE TABLE IF NOT EXISTS application_logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    level VARCHAR(10) NOT NULL DEFAULT 'info',
    module VARCHAR(100),
    operation VARCHAR(100),
    message TEXT,
    context JSONB DEFAULT '{}',
    trace_id VARCHAR(64),
    user_id VARCHAR(64),
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_logs_timestamp ON application_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level ON application_logs(level);
CREATE INDEX IF NOT EXISTS idx_app_logs_module ON application_logs(module);
CREATE INDEX IF NOT EXISTS idx_app_logs_trace ON application_logs(trace_id);
CREATE INDEX IF NOT EXISTS idx_app_logs_user ON application_logs(user_id);

COMMENT ON TABLE application_logs IS '结构化应用日志 (含上下文和链路追踪)';

-- ===== 8.3 隐私脱敏规则 =====
CREATE TABLE IF NOT EXISTS privacy_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    field_pattern VARCHAR(200) NOT NULL,
    field_type VARCHAR(30) NOT NULL CHECK (field_type IN ('email', 'phone', 'id_card', 'name', 'address', 'ip', 'custom')),
    mask_strategy VARCHAR(30) NOT NULL DEFAULT 'partial_mask' CHECK (mask_strategy IN ('partial_mask', 'full_mask', 'hash', 'replace')),
    mask_char VARCHAR(5) DEFAULT '*',
    keep_prefix INTEGER DEFAULT 3,
    keep_suffix INTEGER DEFAULT 2,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 预置隐私脱敏规则
INSERT INTO privacy_rules (field_pattern, field_type, mask_strategy, mask_char, keep_prefix, keep_suffix) VALUES
    ('email', 'email', 'partial_mask', '*', 2, 3),
    ('phone', 'phone', 'partial_mask', '*', 3, 4),
    ('id_card', 'id_card', 'partial_mask', '*', 4, 4),
    ('password', 'custom', 'full_mask', '*', 0, 0),
    ('address', 'address', 'partial_mask', '*', 6, 0),
    ('ip_address', 'ip', 'partial_mask', '*', 3, 0),
    ('lat|lng|latitude|longitude', 'custom', 'partial_mask', '*', 2, 2),
    ('name|姓名|contact', 'name', 'partial_mask', '*', 1, 1),
    ('token|secret|key', 'custom', 'full_mask', '*', 0, 0),
    ('metadata|raw_data|payload', 'custom', 'hash', '', 0, 0)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE privacy_rules IS '结构化日志的隐私脱敏规则';

-- ===== 8.4 定时清理函数 =====
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS TABLE(table_name TEXT, rows_deleted BIGINT) AS $$
DECLARE
    retention_days INTEGER;
    row_count BIGINT;
    log_table RECORD;
BEGIN
    FOR log_table IN
        SELECT t.table_name
        FROM information_schema.tables t
        WHERE t.table_schema = 'public'
          AND t.table_name IN ('api_usage_logs', 'application_logs', 'analysis_results')
    LOOP
        SELECT COALESCE(
            (SELECT config_value::INTEGER FROM log_retention_config
             WHERE config_key = CASE
                WHEN log_table.table_name = 'api_usage_logs' THEN 'api_log_retention_days'
                WHEN log_table.table_name = 'application_logs' THEN 'error_log_retention_days'
                WHEN log_table.table_name = 'analysis_results' THEN 'analysis_result_retention_days'
                ELSE '90'
             END),
            90
        ) INTO retention_days;

        EXECUTE format(
            'WITH deleted AS (DELETE FROM %I WHERE created_at < NOW() - INTERVAL ''%s days'' RETURNING 1)
             SELECT COUNT(*) FROM deleted',
            log_table.table_name, retention_days
        ) INTO row_count;

        table_name := log_table.table_name;
        rows_deleted := row_count;
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_logs() IS '定时清理函数，按保留策略清理过期日志';





-- ============================================================
-- Part 3: v3.0/v3.1 扩展 (来源: migrations 009-017)
-- ============================================================

-- --------------------------------------------
-- Migration 009: POI 采集城市配置表
-- --------------------------------------------

CREATE TABLE IF NOT EXISTS poi_cities (
    city_name VARCHAR(50) PRIMARY KEY,
    adcode VARCHAR(10),
    enabled BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE poi_cities IS 'POI 采集目标城市配置表 — 替代硬编码的 DEFAULT_CITIES';

INSERT INTO poi_cities (city_name, adcode, enabled, sort_order) VALUES
    ('北京', '110000', true, 1),
    ('上海', '310000', true, 2),
    ('广州', '440100', true, 3),
    ('深圳', '440300', true, 4),
    ('成都', '510100', true, 5),
    ('杭州', '330100', true, 6),
    ('武汉', '420100', true, 7),
    ('南京', '320100', true, 8),
    ('重庆', '500000', true, 9),
    ('苏州', '320500', true, 10),
    ('西安', '610100', true, 11),
    ('长沙', '430100', true, 12)
ON CONFLICT (city_name) DO UPDATE SET
    adcode = EXCLUDED.adcode,
    sort_order = EXCLUDED.sort_order;


-- --------------------------------------------
-- Migration 010: 统一 KPI 权重 + 提取评分算法列
-- --------------------------------------------

-- Step 1: 添加 scoring_algorithm 列
ALTER TABLE site_optimization_models
  ADD COLUMN IF NOT EXISTS scoring_algorithm VARCHAR(30) DEFAULT 'weighted_sum';

COMMENT ON COLUMN site_optimization_models.scoring_algorithm IS '评分算法: weighted_sum, weighted_product, TOPSIS, AHP';

-- Step 2: 从 weights JSONB 迁移 algorithm 到 scoring_algorithm 列
UPDATE site_optimization_models
SET scoring_algorithm = weights->>'algorithm'
WHERE weights ? 'algorithm'
  AND weights->>'algorithm' IS NOT NULL
  AND weights->>'algorithm' <> '';

-- Step 3: 回填空 kpi_weights 的行业
-- convenience
UPDATE site_optimization_models
SET kpi_weights = weights->'kpi_mapping'
WHERE industry = 'convenience'
  AND (kpi_weights IS NULL OR kpi_weights = '{}'::jsonb)
  AND weights ? 'kpi_mapping';

-- pharmacy
UPDATE site_optimization_models
SET kpi_weights = weights->'kpi_mapping'
WHERE industry = 'pharmacy'
  AND (kpi_weights IS NULL OR kpi_weights = '{}'::jsonb)
  AND weights ? 'kpi_mapping';

-- restaurant
UPDATE site_optimization_models
SET kpi_weights = weights->'kpi_mapping'
WHERE industry = 'restaurant'
  AND (kpi_weights IS NULL OR kpi_weights = '{}'::jsonb)
  AND weights ? 'kpi_mapping';

-- supermarket
UPDATE site_optimization_models
SET kpi_weights = weights->'kpi_mapping'
WHERE industry = 'supermarket'
  AND (kpi_weights IS NULL OR kpi_weights = '{}'::jsonb)
  AND weights ? 'kpi_mapping';

-- auto4s
UPDATE site_optimization_models
SET kpi_weights = weights->'kpi_mapping'
WHERE industry = 'auto4s'
  AND (kpi_weights IS NULL OR kpi_weights = '{}'::jsonb)
  AND weights ? 'kpi_mapping';

-- Step 4: 标记 weights 列为已弃用
COMMENT ON COLUMN site_optimization_models.weights IS '已弃用: 请使用 kpi_weights + scoring_algorithm (保留用于向后兼容)';

-- 手动验证查询 (按需执行):
-- SELECT industry, scoring_algorithm, kpi_weights, weights->'kpi_mapping' as old_kpi_mapping
-- FROM site_optimization_models ORDER BY sort_order;


-- --------------------------------------------
-- Migration 011: 回填前5个行业的决策阈值
-- --------------------------------------------

-- 1. 便利店 (convenience) (便利店): radius=300m, linear_down competition, high density
--    Small radius means gaps are less tolerable. Competition within 300m is critical.
UPDATE site_optimization_models
SET decision_thresholds = '{
  "gap_ratio": {"warning": 20, "critical": 30},
  "overlap_ratio": {"warning": 25, "critical": 40},
  "coverage_ratio": {"low": 40, "medium": 65, "high": 80},
  "cannibalization_index": {"critical": 25},
  "competitor_distance": {"warning": 300, "critical": 150}
}'::jsonb
WHERE industry = 'convenience' AND (decision_thresholds IS NULL OR decision_thresholds = '{}'::jsonb);

-- 2. 药店 (pharmacy) (药店): radius=800m, linear_down with hard_filter=350m
--    Moderate radius, policy-sensitive. Hard filter means competitor distance CRITICAL.
UPDATE site_optimization_models
SET decision_thresholds = '{
  "gap_ratio": {"warning": 25, "critical": 35},
  "overlap_ratio": {"warning": 30, "critical": 45},
  "coverage_ratio": {"low": 35, "medium": 60, "high": 78},
  "cannibalization_index": {"critical": 30},
  "competitor_distance": {"warning": 500, "critical": 350}
}'::jsonb
WHERE industry = 'pharmacy' AND (decision_thresholds IS NULL OR decision_thresholds = '{}'::jsonb);

-- 3. 餐饮美食 (餐饮): radius=500m, sweet_spot competition
--    Cluster effect is positive up to a point, so overlap tolerance is higher.
UPDATE site_optimization_models
SET decision_thresholds = '{
  "gap_ratio": {"warning": 20, "critical": 30},
  "overlap_ratio": {"warning": 35, "critical": 50},
  "coverage_ratio": {"low": 30, "medium": 55, "high": 75},
  "top_site_score": {"high": 0.70, "medium": 0.35},
  "cannibalization_index": {"critical": 28},
  "competitor_distance": {"warning": 400, "critical": 200}
}'::jsonb
WHERE industry = 'restaurant' AND (decision_thresholds IS NULL OR decision_thresholds = '{}'::jsonb);

-- 4. 商超 (supermarket) (商超): radius=3000m, linear_down competition, low density
--    Large radius means coverage expectations are lower. Fewer competitors expected.
UPDATE site_optimization_models
SET decision_thresholds = '{
  "gap_ratio": {"warning": 35, "critical": 50},
  "overlap_ratio": {"warning": 40, "critical": 55},
  "coverage_ratio": {"low": 25, "medium": 50, "high": 70},
  "top_site_score": {"high": 0.70, "medium": 0.35},
  "cannibalization_index": {"critical": 40},
  "competitor_distance": {"warning": 2000, "critical": 1200}
}'::jsonb
WHERE industry = 'supermarket' AND (decision_thresholds IS NULL OR decision_thresholds = '{}'::jsonb);

-- 5. 汽车4S店 (auto4s) (汽车4S店): radius=10000m, cluster_u competition, very low density
--    Enormous radius, cluster is desirable. Coverage expectations dramatically lower.
UPDATE site_optimization_models
SET decision_thresholds = '{
  "gap_ratio": {"warning": 45, "critical": 65},
  "overlap_ratio": {"warning": 50, "critical": 65},
  "coverage_ratio": {"low": 15, "medium": 35, "high": 60},
  "top_site_score": {"high": 0.70, "medium": 0.30},
  "cannibalization_index": {"critical": 55},
  "competitor_distance": {"warning": 5000, "critical": 3000}
}'::jsonb
WHERE industry = 'auto4s' AND (decision_thresholds IS NULL OR decision_thresholds = '{}'::jsonb);

-- 验证:
-- SELECT industry, decision_thresholds FROM site_optimization_models ORDER BY sort_order;


-- --------------------------------------------
-- Migration 012: 项目级 Huff 参数缓存表
-- --------------------------------------------

CREATE TABLE IF NOT EXISTS project_huff_params (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES analysis_projects(id) ON DELETE CASCADE,
    lambda DOUBLE PRECISION NOT NULL,
    alpha_area DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    alpha_brand DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    r_squared DOUBLE PRECISION,
    aic DOUBLE PRECISION,
    n_observations INTEGER,
    source VARCHAR(20) NOT NULL DEFAULT 'default'
        CHECK (source IN ('mle', 'benchmark', 'default')),
    fitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_huff_params_project
    ON project_huff_params(project_id);

COMMENT ON TABLE project_huff_params IS '项目级Huff引力模型参数缓存';
COMMENT ON COLUMN project_huff_params.lambda IS '距离衰减系数';
COMMENT ON COLUMN project_huff_params.alpha_area IS '面积吸引力弹性';
COMMENT ON COLUMN project_huff_params.alpha_brand IS '品牌吸引力弹性';
COMMENT ON COLUMN project_huff_params.source IS '参数来源: mle=最大似然估计, benchmark=行业基准, default=默认值';


-- --------------------------------------------
-- Migration 013: 预置12行业 Huff 基准参数 (benchbarks)
-- --------------------------------------------

UPDATE site_optimization_models
SET benchbarks = benchbarks || '{"huff_params": {"lambda": 3.0, "alpha_area": 0.5, "alpha_brand": 0.5}}'::jsonb
WHERE industry = 'convenience';

UPDATE site_optimization_models
SET benchbarks = benchbarks || '{"huff_params": {"lambda": 2.5, "alpha_area": 0.3, "alpha_brand": 0.9}}'::jsonb
WHERE industry = 'beverage';

UPDATE site_optimization_models
SET benchbarks = benchbarks || '{"huff_params": {"lambda": 1.5, "alpha_area": 0.8, "alpha_brand": 0.7}}'::jsonb
WHERE industry = 'restaurant';

UPDATE site_optimization_models
SET benchbarks = benchbarks || '{"huff_params": {"lambda": 1.2, "alpha_area": 0.4, "alpha_brand": 0.6}}'::jsonb
WHERE industry = 'pharmacy';

UPDATE site_optimization_models
SET benchbarks = benchbarks || '{"huff_params": {"lambda": 1.0, "alpha_area": 1.0, "alpha_brand": 0.5}}'::jsonb
WHERE industry = 'fresh_grocery';

UPDATE site_optimization_models
SET benchbarks = benchbarks || '{"huff_params": {"lambda": 0.3, "alpha_area": 1.2, "alpha_brand": 0.8}}'::jsonb
WHERE industry = 'supermarket';

UPDATE site_optimization_models
SET benchbarks = benchbarks || '{"huff_params": {"lambda": 0.15, "alpha_area": 0.9, "alpha_brand": 1.2}}'::jsonb
WHERE industry = 'hotel';

UPDATE site_optimization_models
SET benchbarks = benchbarks || '{"huff_params": {"lambda": 0.2, "alpha_area": 0.4, "alpha_brand": 1.5}}'::jsonb
WHERE industry = 'medical_aesthetics';

UPDATE site_optimization_models
SET benchbarks = benchbarks || '{"huff_params": {"lambda": 1.0, "alpha_area": 0.3, "alpha_brand": 0.8}}'::jsonb
WHERE industry = 'education';

UPDATE site_optimization_models
SET benchbarks = benchbarks || '{"huff_params": {"lambda": 1.0, "alpha_area": 0.5, "alpha_brand": 0.6}}'::jsonb
WHERE industry = 'pet_service';

UPDATE site_optimization_models
SET benchbarks = benchbarks || '{"huff_params": {"lambda": 0.05, "alpha_area": 1.5, "alpha_brand": 1.0}}'::jsonb
WHERE industry = 'auto4s';

UPDATE site_optimization_models
SET benchbarks = benchbarks || '{"huff_params": {"lambda": 0.8, "alpha_area": 0.2, "alpha_brand": 0.3}}'::jsonb
WHERE industry = 'logistics';


-- --------------------------------------------
-- Migration 014: JWT 签名密钥表 (AES-256-GCM 信封加密)
-- --------------------------------------------

CREATE TABLE IF NOT EXISTS jwt_signing_keys (
    kid             VARCHAR(20) PRIMARY KEY,
    secret_encrypted TEXT NOT NULL,
    algorithm       VARCHAR(10) NOT NULL DEFAULT 'HS256',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    rotated_at      TIMESTAMPTZ
);

COMMENT ON TABLE jwt_signing_keys IS 'JWT签名密钥对 — AES-256-GCM信封加密存储';
COMMENT ON COLUMN jwt_signing_keys.kid IS '密钥ID，写入JWT Header供验签时查找';
COMMENT ON COLUMN jwt_signing_keys.secret_encrypted IS 'AES-256-GCM加密的HMAC密钥';
COMMENT ON COLUMN jwt_signing_keys.is_active IS 'true=签发新token用此密钥';
COMMENT ON COLUMN jwt_signing_keys.expires_at IS '过期后不再用于验签，可安全删除';
COMMENT ON COLUMN jwt_signing_keys.rotated_at IS '被轮换时间，用于清理旧密钥';


-- --------------------------------------------
-- Migration 015: 幂等修复缺失列和索引
-- --------------------------------------------
-- Fix all missing columns and tables on server
ALTER TABLE analysis_projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE spatial_points ADD COLUMN IF NOT EXISTS h3_index VARCHAR(20);
ALTER TABLE spatial_points ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'owner';
ALTER TABLE site_optimization_models ADD COLUMN IF NOT EXISTS radius_meters INTEGER;
CREATE INDEX IF NOT EXISTS idx_points_source ON spatial_points(project_id, source);


-- --------------------------------------------
-- Migration 016: 预置12行业决策洞察规则
-- --------------------------------------------

-- 1. 便利店 (convenience): 半径300m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"conv_competitor_density","description":"300m内竞品≥3家直接淘汰","condition":{"field":"competitorCount300m","op":"gte","value":3},"message":"竞品过密（300m内≥3家），自相残杀风险极高"}
    ],
    "soft_penalties": [
      {"id":"conv_competitor_warn","description":"500m内竞品2-3家扣分30%","condition":{"field":"competitorCount500m","op":"between","min":2,"max":3},"penalty":0.3,"message":"竞品中度饱和（500m内2-3家），营收分流风险"}
    ],
    "nonlinear_rules": [
      {"id":"conv_metro_bonus","description":"地铁口100m内加分15%","condition":{"field":"nearMetro","op":"eq","value":1},"bonus":0.15,"message":"邻近地铁口（<100m），客流保障充足"}
    ]
  }'::jsonb
)
WHERE industry = 'convenience';

-- 2. 茶饮/咖啡 (beverage): 半径400m, 甜点竞争
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"bev_no_walkway","description":"非商业区淘汰","condition":{"field":"isCommercialZone","op":"eq","value":0},"message":"非商业区/步行街，茶饮依赖冲动消费，不适合在此开店"}
    ],
    "soft_penalties": [
      {"id":"bev_no_competitor","description":"周边无竞品扣分30%","condition":{"field":"competitorCount200m","op":"eq","value":0},"penalty":0.3,"message":"周边无竞品，可能缺少已验证的消费需求"}
    ],
    "nonlinear_rules": [
      {"id":"bev_sweet_spot","description":"竞品1-3家甜点区加分15%","condition":{"field":"competitorCount200m","op":"between","min":1,"max":3},"bonus":0.15,"message":"茶饮甜点区（竞品1-3家），区域已验证有消费需求"}
    ]
  }'::jsonb
)
WHERE industry = 'beverage';

-- 3. 餐饮 (restaurant): 半径500m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"rest_pure_residential","description":"纯住宅区淘汰","condition":{"field":"isCommercialZone","op":"eq","value":0},"penalty":0,"message":"纯住宅区不适合餐饮，无自然客流且可能有扰民风险"}
    ],
    "soft_penalties": [
      {"id":"rest_too_many","description":"竞品>8家扣分40%","condition":{"field":"competitorCount1000m","op":"gte","value":8},"penalty":0.4,"message":"竞品过饱和（1000m内≥8家），市场已极度拥挤"}
    ],
    "nonlinear_rules": [
      {"id":"rest_food_street","description":"美食街集群加分10%","condition":{"field":"competitorCount500m","op":"between","min":3,"max":8},"bonus":0.1,"message":"美食街集群效应（3-8家），多品牌聚集提升区域餐饮吸引力"}
    ]
  }'::jsonb
)
WHERE industry = 'restaurant';

-- 4. 药店/诊所 (pharmacy): 半径800m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"pharm_competitor_close","description":"竞品<350m淘汰","condition":{"field":"competitorCount300m","op":"gte","value":1},"message":"竞品距离过近（<350m），药店通常需300m以上间距"}
    ],
    "soft_penalties": [
      {"id":"pharm_no_medicare","description":"非医保区扣50%","condition":{"field":"populationDensity","op":"lt","value":3000},"penalty":0.5,"message":"常住人口密度不足，药店客群基础薄弱"}
    ],
    "nonlinear_rules": [
      {"id":"pharm_near_hospital","description":"医院300-800m加分20%","condition":{"field":"nearHospital","op":"eq","value":1},"bonus":0.2,"message":"邻近医院（<800m），处方外流和术后康复需求充足"}
    ]
  }'::jsonb
)
WHERE industry = 'pharmacy';

-- 5. 生鲜超市 (fresh_grocery): 半径800m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"fgr_area_small","description":"面积<200㎡淘汰","condition":{"field":"area","op":"lt","value":200},"message":"面积不足200㎡，无法满足生鲜超市的商品陈列和仓储需求"}
    ],
    "soft_penalties": [
      {"id":"fgr_too_many","description":"竞品>5家扣分30%","condition":{"field":"competitorCount1000m","op":"gt","value":5},"penalty":0.3,"message":"竞品过多（1000m内>5家），生鲜品类价格战激烈"}
    ],
    "nonlinear_rules": [
      {"id":"fgr_community","description":"社区>3000户加分10%","condition":{"field":"populationDensity","op":"gte","value":5000},"bonus":0.1,"message":"高密度居住区（>5000人/km²），生鲜消费频次保障"}
    ]
  }'::jsonb
)
WHERE industry = 'fresh_grocery';

-- 6. 商超 (supermarket): 半径3000m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"smkt_area_small","description":"面积<3000㎡淘汰","condition":{"field":"area","op":"lt","value":3000},"message":"面积不足3000㎡，无法满足商超全品类运营需求"}
    ],
    "soft_penalties": [
      {"id":"smkt_parking_low","description":"停车位<50扣分20%","condition":{"field":"parkingAvailability","op":"lt","value":50},"penalty":0.2,"message":"停车配套不足，商超客群以驾车为主"}
    ],
    "nonlinear_rules": [
      {"id":"smkt_commercial_center","description":"商圈中心加分15%","condition":{"field":"isCommercialZone","op":"eq","value":1},"bonus":0.15,"message":"商圈中心位置，综合商业体自然引流效应"}
    ]
  }'::jsonb
)
WHERE industry = 'supermarket';

-- 7. 酒店/住宿 (hotel): 半径2000m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"hotel_far_from_transit","description":"离地铁>2km淘汰","condition":{"field":"minDistanceToExisting","op":"gt","value":2000},"penalty":0,"message":"交通便利度严重不足（距地铁>2km），差旅客群硬性需求无法满足"}
    ],
    "soft_penalties": [
      {"id":"hotel_too_few","description":"竞品<3家扣分20%","condition":{"field":"competitorCount2000m","op":"lt","value":3},"penalty":0.2,"message":"酒店集群度不足（<3家），OTA平台区域曝光度偏低"}
    ],
    "nonlinear_rules": [
      {"id":"hotel_cluster_optimum","description":"3-8家集群加分10%","condition":{"field":"competitorCount2000m","op":"between","min":3,"max":8},"bonus":0.1,"message":"酒店集群优区间（3-8家），在线预订平台区域排序优势"}
    ]
  }'::jsonb
)
WHERE industry = 'hotel';

-- 8. 医疗美容 (medical_aesthetics): 半径3000m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"beauty_not_commercial","description":"非商圈淘汰","condition":{"field":"isCommercialZone","op":"eq","value":0},"message":"非高端商圈，医美客群高度依赖商业综合体引流"}
    ],
    "soft_penalties": [
      {"id":"beauty_parking_low","description":"停车<20位扣分30%","condition":{"field":"parkingAvailability","op":"lt","value":20},"penalty":0.3,"message":"停车位不足，医美客户以驾车为主且停留时间长"}
    ],
    "nonlinear_rules": [
      {"id":"beauty_cluster","description":"同类集群加分15%","condition":{"field":"competitorCount2000m","op":"between","min":2,"max":6},"bonus":0.15,"message":"同类机构集群（2-6家），形成医美目的地效应"}
    ]
  }'::jsonb
)
WHERE industry = 'medical_aesthetics';

-- 9. 教育培训 (education): 半径1500m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"edu_far_from_school","description":"离小学>1km淘汰","condition":{"field":"minDistanceToExisting","op":"gt","value":1000},"message":"离学校过远（>1km），家长接送通勤时间不可接受"}
    ],
    "soft_penalties": [
      {"id":"edu_family_density_low","description":"家庭密度低扣分25%","condition":{"field":"populationDensity","op":"lt","value":3000},"penalty":0.25,"message":"周边有孩家庭密度偏低，招生基础薄弱"}
    ],
    "nonlinear_rules": [
      {"id":"edu_near_school","description":"学校邻近加分15%","condition":{"field":"nearSchool","op":"eq","value":1},"bonus":0.15,"message":"紧邻学校，放学后无缝衔接，家长接受度高"}
    ]
  }'::jsonb
)
WHERE industry = 'education';

-- 10. 宠物服务 (pet_service): 半径2000m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"pet_no_community","description":"无社区淘汰","condition":{"field":"isResidentialZone","op":"eq","value":0},"message":"非居住区，宠物服务依赖社区业主的步行可达性"}
    ],
    "soft_penalties": [
      {"id":"pet_too_many","description":"竞品>5家扣分20%","condition":{"field":"competitorCount1000m","op":"gt","value":5},"penalty":0.2,"message":"竞品过于密集（>5家/1000m），社区养宠率有限"}
    ],
    "nonlinear_rules": [
      {"id":"pet_cluster","description":"宠物店密集区加分10%","condition":{"field":"competitorCount1000m","op":"between","min":2,"max":5},"bonus":0.1,"message":"宠物店适中集群（2-5家），社区养宠意识成熟"}
    ]
  }'::jsonb
)
WHERE industry = 'pet_service';

-- 11. 汽车4S店 (auto4s): 半径10000m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"auto_area_small","description":"面积<1000㎡淘汰","condition":{"field":"area","op":"lt","value":1000},"message":"可用面积不足1000㎡，需同时容纳展车区+维修工位+客户接待"}
    ],
    "soft_penalties": [
      {"id":"auto_not_main_road","description":"非主干道扣分40%","condition":{"field":"roadFrontage","op":"lt","value":30},"penalty":0.4,"message":"临路面宽不足（<30m），4S店需高可见度和便利进出"}
    ],
    "nonlinear_rules": [
      {"id":"auto_row","description":"汽车城集群加分15%","condition":{"field":"competitorCount3000m","op":"between","min":3,"max":12},"bonus":0.15,"message":"汽车城集群（3-12家），品牌集聚形成一站式购车目的地"}
    ]
  }'::jsonb
)
WHERE industry = 'auto4s';

-- 12. 物流/快递驿站 (logistics): 半径500m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"log_no_truck","description":"无货车通道淘汰","condition":{"field":"roadFrontage","op":"lt","value":8},"message":"无货车可达通道，物流驿站依赖每日包裹装卸"}
    ],
    "soft_penalties": [
      {"id":"log_community_small","description":"小区<1000户扣分30%","condition":{"field":"populationDensity","op":"lt","value":3000},"penalty":0.3,"message":"社区规模偏小（<1000户），日均包裹量不足以支撑运营"}
    ],
    "nonlinear_rules": [
      {"id":"log_mixed_zone","description":"商住混合区加分10%","condition":{"field":"isCommercialZone","op":"eq","value":1},"bonus":0.1,"message":"商住混合区，兼顾居民包裹和写字楼快递，营收更稳定"}
    ]
  }'::jsonb
)
WHERE industry = 'logistics';


-- --------------------------------------------
-- Migration 017: 数据底座升级: public_poi 扩展 + H3 需求栅格 + Huff 基准表
-- --------------------------------------------

-- 017a: 升级 public_poi 表，对齐决策引擎接口需求
ALTER TABLE public_poi ADD COLUMN IF NOT EXISTS industry VARCHAR(32);
ALTER TABLE public_poi ADD COLUMN IF NOT EXISTS city VARCHAR(64);
ALTER TABLE public_poi ADD COLUMN IF NOT EXISTS district VARCHAR(64);
ALTER TABLE public_poi ADD COLUMN IF NOT EXISTS brand_chain VARCHAR(128);
ALTER TABLE public_poi ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public_poi ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 从旧 category 列填充 industry（category 存储的是 industry 代码）
UPDATE public_poi SET industry = category WHERE industry IS NULL AND category IS NOT NULL;
UPDATE public_poi SET city = '西安' WHERE city IS NULL AND industry IS NOT NULL;

-- 迁移索引
CREATE INDEX IF NOT EXISTS idx_poi_industry ON public_poi(industry, city);
CREATE INDEX IF NOT EXISTS idx_poi_collected ON public_poi(collected_at DESC);

COMMENT ON TABLE public_poi IS '公共竞品POI数据（平台核心数据资产）';
COMMENT ON COLUMN public_poi.industry IS '行业代码: convenience/beverage/restaurant/...';
COMMENT ON COLUMN public_poi.brand_chain IS '连锁品牌名: 罗森/7-ELEVEN/每一天/...';
COMMENT ON COLUMN public_poi.collected_at IS '数据采集时间';

-- ============================================================
-- 017b: H3需求栅格表（人口 + 消费力）
-- ============================================================
CREATE TABLE IF NOT EXISTS h3_demand_grid (
    h3_index VARCHAR(20) PRIMARY KEY,
    lng DOUBLE PRECISION NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    population FLOAT DEFAULT 0,
    consumption_index FLOAT DEFAULT 1.0,
    residential_ratio FLOAT DEFAULT 0.5,
    commercial_ratio FLOAT DEFAULT 0.2,
    data_source VARCHAR(64) DEFAULT 'worldpop',
    data_year INTEGER DEFAULT 2020,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_h3_demand_lnglat ON h3_demand_grid(lng, lat);
CREATE INDEX IF NOT EXISTS idx_h3_demand_geom ON h3_demand_grid
    USING GIST (ST_SetSRID(ST_MakePoint(lng, lat), 4326));

COMMENT ON TABLE h3_demand_grid IS 'H3分辨率9人口/消费力需求栅格';
COMMENT ON COLUMN h3_demand_grid.population IS '常住人口估算（来源: WorldPop / 高德 / 统计年鉴）';
COMMENT ON COLUMN h3_demand_grid.consumption_index IS '消费力指数（城市均值=1.0）';
COMMENT ON COLUMN h3_demand_grid.residential_ratio IS '居住用地占比';
COMMENT ON COLUMN h3_demand_grid.commercial_ratio IS '商业用地占比';
COMMENT ON COLUMN h3_demand_grid.data_source IS '数据来源标识';
COMMENT ON COLUMN h3_demand_grid.data_year IS '数据年份';

-- ============================================================
-- 017c: Huff参数基准表（平台级，按行业+城市分类）
-- ============================================================
CREATE TABLE IF NOT EXISTS huff_benchmarks (
    id SERIAL PRIMARY KEY,
    industry VARCHAR(32) NOT NULL,
    city VARCHAR(64) DEFAULT 'all',
    lambda DOUBLE PRECISION NOT NULL,
    alpha_area DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    alpha_brand DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    r_squared DOUBLE PRECISION,
    aic DOUBLE PRECISION,
    n_observations INTEGER,
    source VARCHAR(64) DEFAULT 'benchmark'
        CHECK (source IN ('mle', 'cached_mle', 'benchmark', 'default')),
    fitted_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    UNIQUE(industry, city, source)
);

CREATE INDEX IF NOT EXISTS idx_huff_benchmarks_industry ON huff_benchmarks(industry, city);

COMMENT ON TABLE huff_benchmarks IS 'Huff引力模型参数基准（按行业+城市分类）';
COMMENT ON COLUMN huff_benchmarks.lambda IS '距离衰减系数（正数，越大越不愿走远路）';
COMMENT ON COLUMN huff_benchmarks.alpha_area IS '面积吸引力弹性';
COMMENT ON COLUMN huff_benchmarks.alpha_brand IS '品牌吸引力弹性';
COMMENT ON COLUMN huff_benchmarks.r_squared IS '模型拟合优度';
COMMENT ON COLUMN huff_benchmarks.source IS '参数来源: mle/Cached_mle/benchmark/default';

-- ============================================================
-- 017d: 预置12行业默认Huff基准参数到 huff_benchmarks 表
--       数值继承自 Migration 013 + huffService.ts INDUSTRY_DEFAULT_HUFF
-- ============================================================
INSERT INTO huff_benchmarks (industry, city, lambda, alpha_area, alpha_brand, source, r_squared, n_observations)
VALUES
    ('convenience',       'all', 2.0, 0.5, 0.8, 'benchmark', NULL, NULL),
    ('beverage',          'all', 2.5, 0.3, 0.9, 'benchmark', NULL, NULL),
    ('restaurant',        'all', 1.5, 0.8, 0.7, 'benchmark', NULL, NULL),
    ('pharmacy',          'all', 1.2, 0.4, 0.6, 'benchmark', NULL, NULL),
    ('fresh_grocery',     'all', 1.0, 1.0, 0.5, 'benchmark', NULL, NULL),
    ('supermarket',       'all', 0.3, 1.2, 0.8, 'benchmark', NULL, NULL),
    ('hotel',             'all', 0.15, 0.9, 1.2, 'benchmark', NULL, NULL),
    ('medical_aesthetics','all', 0.2, 0.4, 1.5, 'benchmark', NULL, NULL),
    ('education',         'all', 1.0, 0.3, 0.8, 'benchmark', NULL, NULL),
    ('pet_service',       'all', 1.0, 0.5, 0.6, 'benchmark', NULL, NULL),
    ('auto4s',            'all', 0.05, 1.5, 1.0, 'benchmark', NULL, NULL),
    ('logistics',         'all', 0.8, 0.2, 0.3, 'benchmark', NULL, NULL)
ON CONFLICT (industry, city, source) DO NOTHING;

-- 017e: 修复 h3_index NOT NULL 约束（后续由触发器或批量UPDATE填充）
ALTER TABLE public_poi ALTER COLUMN h3_index DROP NOT NULL;


COMMIT;

SELECT 'init_v3_1 completed — ' || COUNT(*) || ' tables' AS summary
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
