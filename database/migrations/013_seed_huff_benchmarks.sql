-- ============================================================
-- Migration 013: 为12个行业预置Huff基准参数
-- 数据来源：零售选址文献 + 行业常识校准
-- ============================================================

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
