-- ============================================================
-- init.sql v2.0 — Idempotent rollup of all v2.0 migrations
-- Generated: 2026-06-13
-- Includes: 001-008 migrations for 12-industry support
-- ============================================================

-- >>>>> BEGIN 001_extend_industry_models.sql
-- ============================================================
-- Migration 001: Extend site_optimization_models for v2.0
-- Adds industry-specific analysis params, decision thresholds,
-- benchmarks, and KPI weights for 12-industry support
-- ============================================================

ALTER TABLE site_optimization_models
  ADD COLUMN IF NOT EXISTS analysis_params JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS decision_thresholds JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS benchbarks JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS kpi_weights JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

COMMENT ON COLUMN site_optimization_models.analysis_params IS 'Industry-specific algorithm parameters (coverage/competition/scoring/KDE/cluster)';
COMMENT ON COLUMN site_optimization_models.decision_thresholds IS 'Threshold values for decision engine rules per industry';
COMMENT ON COLUMN site_optimization_models.benchbarks IS 'Industry benchmark data for comparative analysis';
COMMENT ON COLUMN site_optimization_models.kpi_weights IS 'Default KPI weight vector for the industry';

-- Update existing 5 industries with default analysis_params
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

-- <<<<< END 001_extend_industry_models.sql

-- >>>>> BEGIN 002_new_industries.sql
-- ============================================================
-- Migration 004: Insert 7 new industry models (v2.0)
-- beverage, fresh_grocery, hotel, medical_aesthetics,
-- education, pet_service, logistics
-- ============================================================

-- 1. Beverage (tea/coffee)
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

-- 2. Fresh Grocery
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

-- 3. Hotel
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

-- 5. Education
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

-- 6. Pet Service
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

-- 7. Logistics
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

-- <<<<< END 002_new_industries.sql

-- >>>>> BEGIN 003_analysis_types.sql
-- ============================================================
-- Migration 003: Create analysis_types registry
-- Replaces hardcoded analysis type strings scattered across
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

-- Link analysis types to subscription plans
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

-- <<<<< END 003_analysis_types.sql

-- >>>>> BEGIN 004_industry_keywords.sql
-- ============================================================
-- Migration 002: Create industry_keywords table
-- Maps Chinese/English keywords to industry codes for auto-detection
-- Replaces hardcoded if-else chain in projectService.ts
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

-- Seed keywords for 12 industries (priority: higher = matched first)
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

-- <<<<< END 004_industry_keywords.sql

-- >>>>> BEGIN 005_poi_categories.sql
-- ============================================================
-- Migration 005: Expand POI Categories (14 → 40+)
-- Extends COLLECT_QUEUE categories in poiCollector.ts from
-- 14 to 40+ for 12-industry coverage
-- ============================================================

-- POI category reference table
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

COMMENT ON TABLE poi_categories IS 'POI collection category registry — replace hardcoded COLLECT_QUEUE';

-- Seed 40+ POI categories covering all 12 industries
INSERT INTO poi_categories (category, display_name, amap_keyword, source, industry_relevance, sort_order) VALUES
-- Core categories (existing)
('residential', '住宅小区', '住宅小区', 'amap', ARRAY['convenience','fresh_grocery','pharmacy','pet_service','logistics','education','beverage'], 1),
('office', '写字楼', '写字楼', 'amap', ARRAY['convenience','restaurant','beverage','hotel','medical_aesthetics'], 2),
('transport', '地铁站', '地铁站', 'amap', ARRAY['convenience','restaurant','beverage','hotel','supermarket','logistics'], 3),
('commercial', '商圈', '商圈', 'amap', ARRAY['all'], 4),
('medical', '医院', '医院', 'amap', ARRAY['pharmacy','medical_aesthetics'], 5),

-- Education
('school', '学校', '学校', 'amap', ARRAY['education','pharmacy','fresh_grocery'], 6),
('kindergarten', '幼儿园', '幼儿园', 'amap', ARRAY['education','pharmacy'], 7),
('training', '培训机构', '培训机构', 'amap', ARRAY['education'], 8),

-- Hotel
('hotel_poi', '酒店', '酒店', 'amap', ARRAY['hotel'], 9),

-- Transportation
('parking', '停车场', '停车场', 'amap', ARRAY['supermarket','medical_aesthetics','hotel'], 10),

-- Pet service
('pet', '宠物店', '宠物店', 'amap', ARRAY['pet_service'], 11),
('pet_hospital', '宠物医院', '宠物医院', 'amap', ARRAY['pet_service'], 12),
('veterinary', '兽医站', '兽医站', 'amap', ARRAY['pet_service'], 13),
('grooming', '宠物美容', '宠物美容', 'amap', ARRAY['pet_service'], 14),

-- Beverage
('beverage_poi', '咖啡厅', '咖啡厅', 'amap', ARRAY['beverage'], 15),
('tea_shop', '茶饮店', '茶饮店', 'amap', ARRAY['beverage'], 16),
('bakery', '面包甜点', '面包甜点', 'amap', ARRAY['beverage','convenience'], 17),

-- Restaurant
('restaurant_poi', '餐厅', '餐厅', 'amap', ARRAY['restaurant'], 18),
('fast_food', '快餐', '快餐', 'amap', ARRAY['restaurant','convenience'], 19),
('catering', '餐饮', '餐饮', 'amap', ARRAY['restaurant'], 20),

-- Retail
('supermarket_poi', '超市', '超市', 'amap', ARRAY['supermarket','fresh_grocery'], 21),
('convenience_poi', '便利店', '便利店', 'amap', ARRAY['convenience'], 22),
('pharmacy_poi', '药房', '药房', 'amap', ARRAY['pharmacy'], 23),

-- Medical aesthetics
('beauty', '美容院', '美容院', 'amap', ARRAY['medical_aesthetics'], 24),
('dental', '口腔诊所', '口腔诊所', 'amap', ARRAY['medical_aesthetics'], 25),
('plastic_surgery', '整形医院', '整形医院', 'amap', ARRAY['medical_aesthetics'], 26),

-- Lifestyle
('gym', '健身房', '健身房', 'amap', ARRAY['hotel','medical_aesthetics'], 27),
('bank', '银行', '银行', 'amap', ARRAY['all'], 28),
('post_office', '邮局', '邮局', 'amap', ARRAY['logistics'], 29),
('express_station', '快递站', '快递站', 'amap', ARRAY['logistics'], 30),

-- Automotive
('gas_station', '加油站', '加油站', 'amap', ARRAY['auto4s','logistics'], 31),
('auto_repair', '汽车维修', '汽车维修', 'amap', ARRAY['auto4s'], 32),
('auto_dealer', '汽车销售', '汽车销售', 'amap', ARRAY['auto4s'], 33),
('car_wash', '洗车场', '洗车场', 'amap', ARRAY['auto4s'], 34),

-- Market / Special
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

-- Index for fast GIN lookups on industry_relevance array
CREATE INDEX IF NOT EXISTS idx_poi_categories_industry ON poi_categories USING GIN(industry_relevance);

-- Make public_poi.category referenceable against poi_categories
CREATE INDEX IF NOT EXISTS idx_poi_category_lookup ON public_poi(category, h3_index);

-- <<<<< END 005_poi_categories.sql

-- >>>>> BEGIN 006_industry_benchmarks.sql
-- ============================================================
-- Migration 006: Seed Industry Benchmark Data
-- Populates benchbarks JSONB for all 12 industries
-- Benchmarks are industry median/P75/P90 values for key indicators
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

-- <<<<< END 006_industry_benchmarks.sql

-- >>>>> BEGIN 007_seed_kpi_registry.sql
-- ============================================================
-- Migration 007: Seed KPI Registry Data
-- Expands existing kpi_category_map with 55 KPI entries
-- ============================================================

-- Ensure table exists (idempotent from migration_kpi_category_map.sql)
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

-- Summary: 42 KPI entries across 4 categories
-- reach: 8, competition: 13, density: 13, site: 10

-- <<<<< END 007_seed_kpi_registry.sql

-- >>>>> BEGIN 008_log_retention.sql
-- ============================================================
-- Migration 008: Log Retention & Privacy Desensitization
-- Adds log retention config, privacy desensitization rules,
-- and structured logging tables
-- ============================================================

-- ===== 8.1 Log Retention Configuration =====
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

-- ===== 8.2 Structured Application Log Table =====
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

COMMENT ON TABLE application_logs IS 'Structured application logs with context and trace support';

-- ===== 8.3 Privacy Desensitization Rules =====
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

-- Seed desensitization rules
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

COMMENT ON TABLE privacy_rules IS 'Privacy desensitization rules for structured logging';

-- ===== 8.4 Scheduled Cleanup Function =====
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

COMMENT ON FUNCTION cleanup_old_logs() IS 'Scheduled cleanup function for log retention policies';

-- <<<<< END 008_log_retention.sql

