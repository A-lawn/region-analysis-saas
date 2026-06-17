-- ============================================================
-- Migration 016: Industry Insights Seed Data
-- 12 industries × hard_constraints + soft_penalties + nonlinear_rules
-- Stored in site_optimization_models.decision_thresholds.insights JSONB
-- ============================================================

-- 1. 便利店 (convenience): 半径300m, 高密度, 线性竞争衰减
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"conv_competitor_density","description":"300m内竞品≥3家直接淘汰","condition":{"field":"competitorCount300m","op":"gte","value":3},"message":"竞品过密（300m内≥3家），自相残杀风险极高"}
    ],
    "soft_penalties": [
      {"id":"conv_competitor_warn","description":"500m内竞品2-3家扣分30%","condition":{"field":"competitorCount500m","op":"between","min":2,"max":3},"penalty":0.3,"message":"竞品中度饱和（500m内2-3家），营收分流风险"}
    ],
    "nonlinear_rules": [
      {"id":"conv_metro_bonus","description":"地铁口100m内加分15%","condition":{"field":"nearMetro","op":"eq","value":1},"bonus":0.15,"message":"邻近地铁口（<100m），客流保障充足"}
    ]
  }'::jsonb
)
WHERE industry = 'convenience';

-- 2. 茶饮/咖啡 (beverage): 半径400m, 甜点竞争
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"bev_no_walkway","description":"非商业区淘汰","condition":{"field":"isCommercialZone","op":"eq","value":0},"message":"非商业区/步行街，茶饮依赖冲动消费，不适合在此开店"}
    ],
    "soft_penalties": [
      {"id":"bev_no_competitor","description":"周边无竞品扣分30%","condition":{"field":"competitorCount200m","op":"eq","value":0},"penalty":0.3,"message":"周边无竞品，可能缺少已验证的消费需求"}
    ],
    "nonlinear_rules": [
      {"id":"bev_sweet_spot","description":"竞品1-3家甜点区加分15%","condition":{"field":"competitorCount200m","op":"between","min":1,"max":3},"bonus":0.15,"message":"茶饮甜点区（竞品1-3家），区域已验证有消费需求"}
    ]
  }'::jsonb
)
WHERE industry = 'beverage';

-- 3. 餐饮 (restaurant): 半径500m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"rest_pure_residential","description":"纯住宅区淘汰","condition":{"field":"isCommercialZone","op":"eq","value":0},"penalty":0,"message":"纯住宅区不适合餐饮，无自然客流且可能有扰民风险"}
    ],
    "soft_penalties": [
      {"id":"rest_too_many","description":"竞品>8家扣分40%","condition":{"field":"competitorCount1000m","op":"gte","value":8},"penalty":0.4,"message":"竞品过饱和（1000m内≥8家），市场已极度拥挤"}
    ],
    "nonlinear_rules": [
      {"id":"rest_food_street","description":"美食街集群加分10%","condition":{"field":"competitorCount500m","op":"between","min":3,"max":8},"bonus":0.1,"message":"美食街集群效应（3-8家），多品牌聚集提升区域餐饮吸引力"}
    ]
  }'::jsonb
)
WHERE industry = 'restaurant';

-- 4. 药店/诊所 (pharmacy): 半径800m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"pharm_competitor_close","description":"竞品<350m淘汰","condition":{"field":"competitorCount300m","op":"gte","value":1},"message":"竞品距离过近（<350m），药店通常需300m以上间距"}
    ],
    "soft_penalties": [
      {"id":"pharm_no_medicare","description":"非医保区扣50%","condition":{"field":"populationDensity","op":"lt","value":3000},"penalty":0.5,"message":"常住人口密度不足，药店客群基础薄弱"}
    ],
    "nonlinear_rules": [
      {"id":"pharm_near_hospital","description":"医院300-800m加分20%","condition":{"field":"nearHospital","op":"eq","value":1},"bonus":0.2,"message":"邻近医院（<800m），处方外流和术后康复需求充足"}
    ]
  }'::jsonb
)
WHERE industry = 'pharmacy';

-- 5. 生鲜超市 (fresh_grocery): 半径800m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"fgr_area_small","description":"面积<200㎡淘汰","condition":{"field":"area","op":"lt","value":200},"message":"面积不足200㎡，无法满足生鲜超市的商品陈列和仓储需求"}
    ],
    "soft_penalties": [
      {"id":"fgr_too_many","description":"竞品>5家扣分30%","condition":{"field":"competitorCount1000m","op":"gt","value":5},"penalty":0.3,"message":"竞品过多（1000m内>5家），生鲜品类价格战激烈"}
    ],
    "nonlinear_rules": [
      {"id":"fgr_community","description":"社区>3000户加分10%","condition":{"field":"populationDensity","op":"gte","value":5000},"bonus":0.1,"message":"高密度居住区（>5000人/km²），生鲜消费频次保障"}
    ]
  }'::jsonb
)
WHERE industry = 'fresh_grocery';

-- 6. 商超 (supermarket): 半径3000m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"smkt_area_small","description":"面积<3000㎡淘汰","condition":{"field":"area","op":"lt","value":3000},"message":"面积不足3000㎡，无法满足商超全品类运营需求"}
    ],
    "soft_penalties": [
      {"id":"smkt_parking_low","description":"停车位<50扣分20%","condition":{"field":"parkingAvailability","op":"lt","value":50},"penalty":0.2,"message":"停车配套不足，商超客群以驾车为主"}
    ],
    "nonlinear_rules": [
      {"id":"smkt_commercial_center","description":"商圈中心加分15%","condition":{"field":"isCommercialZone","op":"eq","value":1},"bonus":0.15,"message":"商圈中心位置，综合商业体自然引流效应"}
    ]
  }'::jsonb
)
WHERE industry = 'supermarket';

-- 7. 酒店/住宿 (hotel): 半径2000m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"hotel_far_from_transit","description":"离地铁>2km淘汰","condition":{"field":"minDistanceToExisting","op":"gt","value":2000},"penalty":0,"message":"交通便利度严重不足（距地铁>2km），差旅客群硬性需求无法满足"}
    ],
    "soft_penalties": [
      {"id":"hotel_too_few","description":"竞品<3家扣分20%","condition":{"field":"competitorCount2000m","op":"lt","value":3},"penalty":0.2,"message":"酒店集群度不足（<3家），OTA平台区域曝光度偏低"}
    ],
    "nonlinear_rules": [
      {"id":"hotel_cluster_optimum","description":"3-8家集群加分10%","condition":{"field":"competitorCount2000m","op":"between","min":3,"max":8},"bonus":0.1,"message":"酒店集群优区间（3-8家），在线预订平台区域排序优势"}
    ]
  }'::jsonb
)
WHERE industry = 'hotel';

-- 8. 医疗美容 (medical_aesthetics): 半径3000m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"beauty_not_commercial","description":"非商圈淘汰","condition":{"field":"isCommercialZone","op":"eq","value":0},"message":"非高端商圈，医美客群高度依赖商业综合体引流"}
    ],
    "soft_penalties": [
      {"id":"beauty_parking_low","description":"停车<20位扣分30%","condition":{"field":"parkingAvailability","op":"lt","value":20},"penalty":0.3,"message":"停车位不足，医美客户以驾车为主且停留时间长"}
    ],
    "nonlinear_rules": [
      {"id":"beauty_cluster","description":"同类集群加分15%","condition":{"field":"competitorCount2000m","op":"between","min":2,"max":6},"bonus":0.15,"message":"同类机构集群（2-6家），形成医美目的地效应"}
    ]
  }'::jsonb
)
WHERE industry = 'medical_aesthetics';

-- 9. 教育培训 (education): 半径1500m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"edu_far_from_school","description":"离小学>1km淘汰","condition":{"field":"minDistanceToExisting","op":"gt","value":1000},"message":"离学校过远（>1km），家长接送通勤时间不可接受"}
    ],
    "soft_penalties": [
      {"id":"edu_family_density_low","description":"家庭密度低扣分25%","condition":{"field":"populationDensity","op":"lt","value":3000},"penalty":0.25,"message":"周边有孩家庭密度偏低，招生基础薄弱"}
    ],
    "nonlinear_rules": [
      {"id":"edu_near_school","description":"学校邻近加分15%","condition":{"field":"nearSchool","op":"eq","value":1},"bonus":0.15,"message":"紧邻学校，放学后无缝衔接，家长接受度高"}
    ]
  }'::jsonb
)
WHERE industry = 'education';

-- 10. 宠物服务 (pet_service): 半径2000m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"pet_no_community","description":"无社区淘汰","condition":{"field":"isResidentialZone","op":"eq","value":0},"message":"非居住区，宠物服务依赖社区业主的步行可达性"}
    ],
    "soft_penalties": [
      {"id":"pet_too_many","description":"竞品>5家扣分20%","condition":{"field":"competitorCount1000m","op":"gt","value":5},"penalty":0.2,"message":"竞品过于密集（>5家/1000m），社区养宠率有限"}
    ],
    "nonlinear_rules": [
      {"id":"pet_cluster","description":"宠物店密集区加分10%","condition":{"field":"competitorCount1000m","op":"between","min":2,"max":5},"bonus":0.1,"message":"宠物店适中集群（2-5家），社区养宠意识成熟"}
    ]
  }'::jsonb
)
WHERE industry = 'pet_service';

-- 11. 汽车4S店 (auto4s): 半径10000m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"auto_area_small","description":"面积<1000㎡淘汰","condition":{"field":"area","op":"lt","value":1000},"message":"可用面积不足1000㎡，需同时容纳展车区+维修工位+客户接待"}
    ],
    "soft_penalties": [
      {"id":"auto_not_main_road","description":"非主干道扣分40%","condition":{"field":"roadFrontage","op":"lt","value":30},"penalty":0.4,"message":"临路面宽不足（<30m），4S店需高可见度和便利进出"}
    ],
    "nonlinear_rules": [
      {"id":"auto_row","description":"汽车城集群加分15%","condition":{"field":"competitorCount3000m","op":"between","min":3,"max":12},"bonus":0.15,"message":"汽车城集群（3-12家），品牌集聚形成一站式购车目的地"}
    ]
  }'::jsonb
)
WHERE industry = 'auto4s';

-- 12. 物流/快递驿站 (logistics): 半径500m
UPDATE site_optimization_models
SET decision_thresholds = jsonb_set(
  COALESCE(decision_thresholds, '{}'::jsonb),
  '{insights}',
  '{
    "hard_constraints": [
      {"id":"log_no_truck","description":"无货车通道淘汰","condition":{"field":"roadFrontage","op":"lt","value":8},"message":"无货车可达通道，物流驿站依赖每日包裹装卸"}
    ],
    "soft_penalties": [
      {"id":"log_community_small","description":"小区<1000户扣分30%","condition":{"field":"populationDensity","op":"lt","value":3000},"penalty":0.3,"message":"社区规模偏小（<1000户），日均包裹量不足以支撑运营"}
    ],
    "nonlinear_rules": [
      {"id":"log_mixed_zone","description":"商住混合区加分10%","condition":{"field":"isCommercialZone","op":"eq","value":1},"bonus":0.1,"message":"商住混合区，兼顾居民包裹和写字楼快递，营收更稳定"}
    ]
  }'::jsonb
)
WHERE industry = 'logistics';
