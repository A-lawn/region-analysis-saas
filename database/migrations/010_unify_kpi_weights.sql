-- ============================================================
-- Migration 010: Unify KPI weights & extract scoring_algorithm
-- 1. Add scoring_algorithm column to site_optimization_models
-- 2. Migrate weights.algorithm -> scoring_algorithm
-- 3. Backfill kpi_weights for first 5 industries from weights.kpi_mapping
-- 4. Comment: weights column is now deprecated
-- ============================================================

-- Step 1: Add scoring_algorithm column
ALTER TABLE site_optimization_models
  ADD COLUMN IF NOT EXISTS scoring_algorithm VARCHAR(30) DEFAULT 'weighted_sum';

COMMENT ON COLUMN site_optimization_models.scoring_algorithm IS 'Scoring algorithm: weighted_sum, weighted_product, topsis, ahp';

-- Step 2: Migrate algorithm from weights JSONB to scoring_algorithm column
UPDATE site_optimization_models
SET scoring_algorithm = weights->>'algorithm'
WHERE weights ? 'algorithm'
  AND weights->>'algorithm' IS NOT NULL
  AND weights->>'algorithm' <> '';

-- Step 3: Backfill kpi_weights for industries that still have empty kpi_weights
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

-- Step 4: Mark weights column as deprecated
COMMENT ON COLUMN site_optimization_models.weights IS 'DEPRECATED: Use kpi_weights + scoring_algorithm instead. Kept for backward compatibility.';

-- Verification query (run manually if needed):
-- SELECT industry, scoring_algorithm, kpi_weights, weights->'kpi_mapping' as old_kpi_mapping
-- FROM site_optimization_models ORDER BY sort_order;
