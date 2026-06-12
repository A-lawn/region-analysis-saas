-- 2024-06-12: Create kpi_category_map table for dynamic KPI classification
-- Run this on existing databases that already have site_optimization_models

CREATE TABLE IF NOT EXISTS kpi_category_map (
  kpi_name VARCHAR(64) PRIMARY KEY,
  category VARCHAR(20) NOT NULL CHECK (category IN ('reach', 'competition', 'density', 'site')),
  display_name VARCHAR(100),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO kpi_category_map (kpi_name, category, display_name, description) VALUES
  ('walkableRatio',        'reach',       '步行可达比',   '500m步行范围内覆盖居民比例'),
  ('footTraffic',          'reach',       '客流热度',     '周边日均人流量指数'),
  ('visibility',           'reach',       '可见度',       '门店临街面数及视距评分'),
  ('competitorAvoidance',  'competition', '竞品回避',     '周边竞品门店数反比'),
  ('competitionDensity',   'competition', '竞争密度',     '区域内同业态门店密度'),
  ('competitorDistance',   'competition', '竞品距离',     '最近竞品门店距离(m)'),
  ('competitorClustering', 'competition', '产业集群度',   '同业聚集程度'),
  ('populationStructure',  'density',     '人口结构',     '年龄/收入/家庭结构适配度'),
  ('populationDensity',    'density',     '人口密度',     '常住人口密度(人/km²)'),
  ('poiDensity',           'density',     '商业密度',     '周边POI数量'),
  ('deliveryCoverage',     'density',     '外卖覆盖',     '3km内外卖配送覆盖率'),
  ('medicalCoverage',      'density',     '医保覆盖',     '周边医保定点机构密度'),
  ('trafficAccessibility', 'density',     '交通可达',     '公交/地铁站点数量'),
  ('regionalCarOwnership', 'density',     '汽车保有量',   '区域百人汽车保有量'),
  ('parkingAvailability',  'density',     '停车配套',     '500m内停车位数'),
  ('rentFactor',           'site',        '租金系数',     '单位面积租金/区域均价'),
  ('rentLevel',            'site',        '租金水平',     '周边商铺租金等级'),
  ('roadFrontage',         'site',        '临路面宽',     '地块临主干道面宽(m)'),
  ('landAvailability',     'site',        '地块面积',     '可开发用地面积(m²)'),
  ('zoningCompliance',     'site',        '规划合规',     '用地性质与规划匹配度'),
  ('policyCompliance',     'site',        '政策合规',     '行业许可及监管政策契合度'),
  ('transportConvenience', 'site',        '交通便利',     '距地铁/高架/快速路距离')
ON CONFLICT (kpi_name) DO UPDATE SET
  category = EXCLUDED.category,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;
