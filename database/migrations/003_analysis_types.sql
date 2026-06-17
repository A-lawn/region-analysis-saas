-- ============================================================
-- Migration 003: Create analysis_types registry
-- Replaces hardcoded analysis type strings scattered across
-- quota.ts, queue.ts, apiV1Controller.ts, analysisWorker.ts
-- ============================================================

CREATE TABLE IF NOT EXISTS analysis_types (
  type VARCHAR(50) PRIMARY KEY,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  default_params JSONB DEFAULT '{}',
  requires_poi BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO analysis_types (type, display_name, description, default_params, requires_poi) VALUES
  ('coverage', '覆盖分析', '门店服务半径覆盖范围与盲区分析', '{"radius_meters": 3000, "decay": false, "whitespace": false}', false),
  ('heatmap', '热力图', '基于KDE核密度估计的门店密度热力分布', '{"bandwidth_meters": 1000, "grid_size_meters": 500}', false),
  ('cluster', '聚类分析', '基于DBSCAN的门店空间聚类识别', '{"eps_meters": 500, "min_points": 3}', false),
  ('site-optimization', '选址优化', '多因子加权选址评分与推荐', '{"top_k": 5}', true),
  ('voronoi', '泰森多边形', '门店服务区泰森多边形划分', '{}', false),
  ('h3-hexagon', 'H3等值区域', '基于H3六边形网格的空间聚合分析', '{"resolution": 9}', false)
ON CONFLICT (type) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  default_params = EXCLUDED.default_params,
  requires_poi = EXCLUDED.requires_poi;

-- Link analysis types to subscription plans
CREATE TABLE IF NOT EXISTS plan_analysis_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan VARCHAR(20) NOT NULL,
  analysis_type VARCHAR(50) NOT NULL REFERENCES analysis_types(type) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plan, analysis_type)
);

INSERT INTO plan_analysis_access (plan, analysis_type) VALUES
  ('free', 'coverage'),
  ('free', 'cluster'),
  ('free', 'h3-hexagon'),
  ('pro', 'coverage'),
  ('pro', 'heatmap'),
  ('pro', 'cluster'),
  ('pro', 'site-optimization'),
  ('pro', 'voronoi'),
  ('pro', 'h3-hexagon'),
  ('enterprise', 'coverage'),
  ('enterprise', 'heatmap'),
  ('enterprise', 'cluster'),
  ('enterprise', 'site-optimization'),
  ('enterprise', 'voronoi'),
  ('enterprise', 'h3-hexagon')
ON CONFLICT (plan, analysis_type) DO NOTHING;
