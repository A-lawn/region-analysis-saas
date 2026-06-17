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
