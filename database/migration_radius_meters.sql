-- 2024-06-12: Add radius_meters to site_optimization_models for coverage analysis presets
ALTER TABLE site_optimization_models ADD COLUMN IF NOT EXISTS radius_meters INTEGER;

UPDATE site_optimization_models SET radius_meters = 300 WHERE industry = 'convenience';
UPDATE site_optimization_models SET radius_meters = 1000 WHERE industry = 'restaurant';
UPDATE site_optimization_models SET radius_meters = 1500 WHERE industry = 'pharmacy';
