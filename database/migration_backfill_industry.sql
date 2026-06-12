-- Backfill pharmacy industry metadata for Xi'an Bell Tower sample data
-- Maps CSV 类别='医药-药店' → metadata.industry = 'pharmacy'
UPDATE spatial_points
SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{industry}', '"pharmacy"')
WHERE name LIKE '%药%' OR name LIKE '%医药%' OR name LIKE '%堂%';

-- Also update public_poi if applicable
UPDATE public_poi
SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{industry}', '"pharmacy"')
WHERE (name LIKE '%药%' OR sub_category = '药店')
  AND (metadata IS NULL OR NOT metadata ? 'industry');

-- Also backfill daily revenue if you have a separate revenue column in your CSV.
-- Run this AFTER the industry update:
-- UPDATE spatial_points SET metadata = jsonb_set(metadata, '{dailyRevenue}', to_jsonb(<revenue_value>::int))
-- WHERE project_id = '<YOUR_ID>';
