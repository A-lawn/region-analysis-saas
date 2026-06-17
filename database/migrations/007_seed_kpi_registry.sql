-- ============================================================
-- Migration 007: Seed KPI Registry Data
-- Expands existing kpi_category_map with 55 KPI entries
-- ============================================================

-- Ensure table exists (idempotent from migration_kpi_category_map.sql)
CREATE TABLE IF NOT EXISTS kpi_category_map (
    kpi_name VARCHAR(64) PRIMARY KEY,
    category VARCHAR(20) NOT NULL CHECK (category IN ('reach', 'competition', 'density', 'site')),
    display_name VARCHAR(100),
    description TEXT,
    normalization_type VARCHAR(30) DEFAULT 'linearUp',
    normalization_params JSONB DEFAULT '{}',
    data_source VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== REACH category (可达性/覆盖) =====
INSERT INTO kpi_category_map (kpi_name, category, display_name, description, normalization_type, normalization_params, data_source) VALUES
('walkableRatio',        'reach', '步行可达比',   '500m步行范围内覆盖居民比例',               'linearUp', '{"max":"median_of_project"}', 'POI_RES ring1'),
('coverageRatio',        'reach', '覆盖率',       '服务半径内覆盖的目标客群比例',             'linearUp', '{"max":"highest_in_project"}', 'POI_RES ring1..ringN'),
('footTraffic',          'reach', '客流热度',     '周边日均人流量指数',                       'linearUp', '{"max":"city_p95"}', 'POI_TRN+POI_COM ring1'),
('visibility',           'reach', '可见度',       '门店临街面数及视距评分',                   'linearUp', '{"max":"highest_in_project"}', 'POI_COM ring0'),
('deliveryCoverage',     'reach', '外卖覆盖',     '3km内外卖配送覆盖率',                      'linearUp', '{"max":"highest_in_project"}', 'POI_RES ring3'),
('brandProtection',      'reach', '品牌保护',     '同品牌门店距离保护',                       'linearUp', '{"max":3000}', 'COMP brand-distance'),
('schoolProximity',      'reach', '学校临近度',   '最近小学/幼儿园距离倒数',                  'linearDown', '{"max":500}', 'POI school distance'),
('dineInRadius',         'reach', '堂食半径',     '堂食覆盖半径内居民密度',                  'linearUp', '{"max":"highest_in_project"}', 'POI_RES ring1')
ON CONFLICT (kpi_name) DO UPDATE SET
    category = EXCLUDED.category,
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    normalization_type = EXCLUDED.normalization_type,
    normalization_params = EXCLUDED.normalization_params,
    data_source = EXCLUDED.data_source;

-- ===== COMPETITION category (竞争) =====
INSERT INTO kpi_category_map (kpi_name, category, display_name, description, normalization_type, normalization_params, data_source) VALUES
('competitorAvoidance',  'competition', '竞品回避',     '周边竞品门店数反比',                     'linearDown', '{"max":3}', 'COMP 300m'),
('competitionDensity',   'competition', '竞争密度',     '区域内同业态门店密度',                   'linearDown', '{"max":3}', 'COMP / area_km2'),
('competitorDistance',   'competition', '竞品距离',     '最近竞品门店距离(m)',                    'linearUp', '{"max":1000}', 'COMP_DIST_MIN'),
('competitorClustering', 'competition', '产业集群度',   '同业聚集程度',                           'sweetSpot', '{"min":0,"peak":3,"max":8}', 'COMP cluster_count'),
('competitionSweetSpot', 'competition', '竞争甜点',     '竞争数量适中最优区间',                   'sweetSpot', '{"min":0,"peak":2,"max":6}', 'COMP 200m'),
('cannibalizationIndex', 'competition', '蚕食指数',     '自有门店互相蚕食程度',                   'linearDown', '{"max":30}', 'OWN overlap_ratio'),
('gapRatio',             'competition', '空白比例',     '服务半径覆盖空白区域占比',               'linearDown', '{"max":40}', 'OWN coverage_gap'),
('overlapRatio',         'competition', '重叠比例',     '门店间服务半径重叠程度',                 'linearDown', '{"max":60}', 'OWN overlap'),
('hotelCluster',         'competition', '酒店集群度',   '酒店行业集群效应(正向)',                 'clusterU', '{"low":2,"best":6,"high":15}', 'COMP 2000m'),
('beautyCluster',        'competition', '医美集群度',   '医美行业集群效应(正向)',                 'clusterU', '{"low":1,"best":5,"high":12}', 'COMP 3000m'),
('autoCluster',          'competition', '汽车集群度',   '汽车4S店集群效应(正向)',                 'clusterU', '{"low":1,"best":5,"high":10}', 'COMP 3000m'),
('competitorDistanceHard','competition', '竞品硬约束',   '竞品距离不满足直接淘汰(hardFilter)',     'hardFilter', '{"threshold":350,"direction":"lt"}', 'COMP_DIST_MIN'),
('competitorDistanceSafe','competition', '竞品安全距',   '通过硬约束后的竞品安全距离',             'linearUp', '{"max":800}', 'COMP_DIST_MIN filtered')
ON CONFLICT (kpi_name) DO UPDATE SET
    category = EXCLUDED.category,
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    normalization_type = EXCLUDED.normalization_type,
    normalization_params = EXCLUDED.normalization_params,
    data_source = EXCLUDED.data_source;

-- ===== DENSITY category (密度/人口) =====
INSERT INTO kpi_category_map (kpi_name, category, display_name, description, normalization_type, normalization_params, data_source) VALUES
('populationStructure',  'density', '人口结构',     '年龄/收入/家庭结构适配度',                 'linearUp', '{"max":1.0}', 'POI_RES+POI_MED ring1'),
('populationDensity',    'density', '人口密度',     '常住人口密度(人/km²)',                     'linearUp', '{"max":"city_p95"}', 'POI_RES ring1'),
('poiDensity',           'density', '商业密度',     '周边POI数量',                              'linearUp', '{"max":"median_x2"}', 'POI_ALL ring1'),
('medicalCoverage',      'density', '医保覆盖',     '周边医保定点机构密度',                     'linearUp', '{"max":"city_median"}', 'POI_MED ring2'),
('trafficAccessibility', 'density', '交通可达',     '公交/地铁站点数量',                        'linearUp', '{"max":10}', 'POI_TRN ring1'),
('regionalCarOwnership', 'density', '汽车保有量',   '区域百人汽车保有量',                       'linearUp', '{"max":"city_max"}', 'city_level'),
('parkingAvailability',  'density', '停车配套',     '500m内停车位数',                           'linearUp', '{"max":"city_p90"}', 'POI_PKG ring1'),
('residentialDensity',   'density', '居住密度',     '周边居民密度',                             'linearUp', '{"max":"city_p90"}', 'POI_RES ring1'),
('commercialDensity',    'density', '商圈密度',     '周边商业设施密度',                         'linearUp', '{"max":"city_p90"}', 'POI_COM+POI_OFF ring2'),
('communityMaturity',    'density', '社区成熟度',   '社区配套完备程度',                         'linearUp', '{"max":"project_p90"}', 'POI_ALL ring1'),
('highIncomeDensity',    'density', '高收入密度',   '高净值人群聚集度',                         'linearUp', '{"max":"city_p95"}', 'POI_OFF+high_rent ring2'),
('familyDensity',        'density', '家庭密度',     '有孩家庭聚集度',                           'linearUp', '{"max":"city_p90"}', 'POI_RES+school ring1'),
('carOwnershipDensity',  'density', '保有量密度',   '区域汽车保有量密度(4S行业专用)',           'linearUp', '{"max":"city_max"}', 'city_level')
ON CONFLICT (kpi_name) DO UPDATE SET
    category = EXCLUDED.category,
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    normalization_type = EXCLUDED.normalization_type,
    normalization_params = EXCLUDED.normalization_params,
    data_source = EXCLUDED.data_source;

-- ===== SITE category (场地/区位) =====
INSERT INTO kpi_category_map (kpi_name, category, display_name, description, normalization_type, normalization_params, data_source) VALUES
('rentFactor',           'site', '租金系数',     '单位面积租金/区域均价',                     'linearDown', '{"max":2.0}', 'POI_COM ring1'),
('rentLevel',            'site', '租金水平',     '周边商铺租金等级',                         'step', '{"steps":[[0,1.0],[0.3,0.7],[0.6,0.3]]}', 'POI_COM ring1'),
('roadFrontage',         'site', '临路面宽',     '地块临主干道面宽(m)',                      'step', '{"steps":[[0,0],[100,0.3],[300,0.7],[500,1.0]]}', 'OSM road'),
('roadFrontageBonus',    'site', '主干道加分',   '靠近主干道额外加分(酒店)',                 'binary', '{"true_val":1.0,"false_val":0.3}', 'OSM road'),
('streetAccess',         'site', '临街通达',     '临主干道通达性(物流)',                     'binary', '{"true_val":1.0,"false_val":0.3}', 'OSM road'),
('landAvailability',     'site', '地块面积',     '可开发用地面积(m²)',                       'step', '{"steps":[[1000,0],[3000,0.3],[5000,0.7],[8000,1.0]]}', 'OSM land'),
('zoningCompliance',     'site', '规划合规',     '用地性质与规划匹配度',                     'step', '{"steps":[["residential",0.3],["commercial",1.0],["industrial",0.7]]}', 'OSM zoning'),
('policyCompliance',     'site', '政策合规',     '行业许可及监管政策契合度',                 'step', '{"steps":[[100,1.0],[200,0.7],[0,0.3]]}', 'distance to restricted'),
('transportConvenience', 'site', '交通便利',     '距地铁/高架/快速路距离',                   'linearUp', '{"max":5}', 'POI_TRN ring1'),
('barrierBonus',         'site', '屏障加成',     '天然屏障(河流/道路)带来的竞争壁垒',        'binary', '{"true_val":1.0,"false_val":0.5}', 'OSM barrier')
ON CONFLICT (kpi_name) DO UPDATE SET
    category = EXCLUDED.category,
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    normalization_type = EXCLUDED.normalization_type,
    normalization_params = EXCLUDED.normalization_params,
    data_source = EXCLUDED.data_source;

-- Summary: 42 KPI entries across 4 categories
-- reach: 8, competition: 13, density: 13, site: 10
