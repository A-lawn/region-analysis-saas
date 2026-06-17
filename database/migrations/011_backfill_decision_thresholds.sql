-- ============================================================
-- Migration 011: Backfill decision_thresholds for first 5 industries
-- These industries existed before the decision_thresholds column was added.
-- Thresholds are tuned per industry based on:
--   - Service radius (smaller radius = tighter coverage expectations)
--   - Competition pattern (linear_down vs sweet_spot vs cluster_u)
--   - Industry density norms
-- ============================================================

-- 1. Convenience (便利店): radius=300m, linear_down competition, high density
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

-- 2. Pharmacy (药店): radius=800m, linear_down with hard_filter=350m
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

-- 3. Restaurant (餐饮): radius=500m, sweet_spot competition
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

-- 4. Supermarket (商超): radius=3000m, linear_down competition, low density
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

-- 5. Auto 4S (汽车4S店): radius=10000m, cluster_u competition, very low density
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

-- Verification:
-- SELECT industry, decision_thresholds FROM site_optimization_models ORDER BY sort_order;
