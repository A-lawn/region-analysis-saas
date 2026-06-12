-- 验证 metadata 内容和 industry 过滤是否生效
SELECT 
  id, name, metadata,
  metadata->>'industry' AS industry_val,
  metadata->>'dailyRevenue' AS revenue_val
FROM spatial_points
WHERE project_id = '<YOUR_PROJECT_ID>'
LIMIT 5;

-- 测试 industry 过滤 SQL
SELECT COUNT(*) AS pharmacy_count
FROM spatial_points
WHERE project_id = '<YOUR_PROJECT_ID>'
  AND metadata->>'industry' = 'pharmacy';
