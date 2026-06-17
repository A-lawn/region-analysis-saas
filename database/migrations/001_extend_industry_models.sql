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
