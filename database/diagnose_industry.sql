-- 诊断：检查当前项目中有多少门店有 industry 字段
SELECT 
  COUNT(*) AS total_points,
  COUNT(*) FILTER (WHERE metadata ? 'industry') AS with_industry,
  COUNT(*) FILTER (WHERE NOT metadata ? 'industry') AS without_industry,
  jsonb_object_agg(DISTINCT metadata->>'industry', cnt) AS industry_distribution
FROM (
  SELECT metadata, COUNT(*) AS cnt
  FROM spatial_points
  WHERE project_id = '<YOUR_PROJECT_ID>'
  GROUP BY metadata
) sub;
