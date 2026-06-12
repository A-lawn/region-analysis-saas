-- 修复双引号嵌套的 metadata（将 "{...}" 字符串转为纯 JSONB）
UPDATE spatial_points
SET metadata = (metadata #>> '{}')::jsonb
WHERE project_id = '<YOUR_PROJECT_ID>'
  AND jsonb_typeof(metadata) = 'string';

-- 再次验证
SELECT metadata->>'industry' AS industry_val FROM spatial_points WHERE project_id = '<YOUR_PROJECT_ID>' LIMIT 1;
