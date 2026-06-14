-- Fix all missing columns and tables on server
ALTER TABLE analysis_projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE spatial_points ADD COLUMN IF NOT EXISTS h3_index VARCHAR(20);
ALTER TABLE spatial_points ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'owner';
ALTER TABLE site_optimization_models ADD COLUMN IF NOT EXISTS radius_meters INTEGER;
CREATE INDEX IF NOT EXISTS idx_points_source ON spatial_points(project_id, source);
