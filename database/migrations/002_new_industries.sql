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
