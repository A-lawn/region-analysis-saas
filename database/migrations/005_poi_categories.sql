-- ============================================================
-- Migration 005: Expand POI Categories (14 → 40+)
-- Extends COLLECT_QUEUE categories in poiCollector.ts from
-- 14 to 40+ for 12-industry coverage
-- ============================================================

-- POI category reference table
CREATE TABLE IF NOT EXISTS poi_categories (
    category VARCHAR(50) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    amap_keyword VARCHAR(50) NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'amap',
    enabled BOOLEAN NOT NULL DEFAULT true,
    industry_relevance TEXT[] DEFAULT '{}',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE poi_categories IS 'POI collection category registry — replace hardcoded COLLECT_QUEUE';

-- Seed 40+ POI categories covering all 12 industries
INSERT INTO poi_categories (category, display_name, amap_keyword, source, industry_relevance, sort_order) VALUES
-- Core categories (existing)
('residential', '住宅小区', '住宅小区', 'amap', ARRAY['convenience','fresh_grocery','pharmacy','pet_service','logistics','education','beverage'], 1),
('office', '写字楼', '写字楼', 'amap', ARRAY['convenience','restaurant','beverage','hotel','medical_aesthetics'], 2),
('transport', '地铁站', '地铁站', 'amap', ARRAY['convenience','restaurant','beverage','hotel','supermarket','logistics'], 3),
('commercial', '商圈', '商圈', 'amap', ARRAY['all'], 4),
('medical', '医院', '医院', 'amap', ARRAY['pharmacy','medical_aesthetics'], 5),

-- Education
('school', '学校', '学校', 'amap', ARRAY['education','pharmacy','fresh_grocery'], 6),
('kindergarten', '幼儿园', '幼儿园', 'amap', ARRAY['education','pharmacy'], 7),
('training', '培训机构', '培训机构', 'amap', ARRAY['education'], 8),

-- Hotel
('hotel_poi', '酒店', '酒店', 'amap', ARRAY['hotel'], 9),

-- Transportation
('parking', '停车场', '停车场', 'amap', ARRAY['supermarket','medical_aesthetics','hotel'], 10),

-- Pet service
('pet', '宠物店', '宠物店', 'amap', ARRAY['pet_service'], 11),
('pet_hospital', '宠物医院', '宠物医院', 'amap', ARRAY['pet_service'], 12),
('veterinary', '兽医站', '兽医站', 'amap', ARRAY['pet_service'], 13),
('grooming', '宠物美容', '宠物美容', 'amap', ARRAY['pet_service'], 14),

-- Beverage
('beverage_poi', '咖啡厅', '咖啡厅', 'amap', ARRAY['beverage'], 15),
('tea_shop', '茶饮店', '茶饮店', 'amap', ARRAY['beverage'], 16),
('bakery', '面包甜点', '面包甜点', 'amap', ARRAY['beverage','convenience'], 17),

-- Restaurant
('restaurant_poi', '餐厅', '餐厅', 'amap', ARRAY['restaurant'], 18),
('fast_food', '快餐', '快餐', 'amap', ARRAY['restaurant','convenience'], 19),
('catering', '餐饮', '餐饮', 'amap', ARRAY['restaurant'], 20),

-- Retail
('supermarket_poi', '超市', '超市', 'amap', ARRAY['supermarket','fresh_grocery'], 21),
('convenience_poi', '便利店', '便利店', 'amap', ARRAY['convenience'], 22),
('pharmacy_poi', '药房', '药房', 'amap', ARRAY['pharmacy'], 23),

-- Medical aesthetics
('beauty', '美容院', '美容院', 'amap', ARRAY['medical_aesthetics'], 24),
('dental', '口腔诊所', '口腔诊所', 'amap', ARRAY['medical_aesthetics'], 25),
('plastic_surgery', '整形医院', '整形医院', 'amap', ARRAY['medical_aesthetics'], 26),

-- Lifestyle
('gym', '健身房', '健身房', 'amap', ARRAY['hotel','medical_aesthetics'], 27),
('bank', '银行', '银行', 'amap', ARRAY['all'], 28),
('post_office', '邮局', '邮局', 'amap', ARRAY['logistics'], 29),
('express_station', '快递站', '快递站', 'amap', ARRAY['logistics'], 30),

-- Automotive
('gas_station', '加油站', '加油站', 'amap', ARRAY['auto4s','logistics'], 31),
('auto_repair', '汽车维修', '汽车维修', 'amap', ARRAY['auto4s'], 32),
('auto_dealer', '汽车销售', '汽车销售', 'amap', ARRAY['auto4s'], 33),
('car_wash', '洗车场', '洗车场', 'amap', ARRAY['auto4s'], 34),

-- Market / Special
('wholesale_market', '批发市场', '批发市场', 'amap', ARRAY['fresh_grocery','logistics'], 35),
('farmers_market', '菜市场', '菜市场', 'amap', ARRAY['fresh_grocery'], 36),
('residential_community', '居民小区', '居民小区', 'amap', ARRAY['all'], 37),
('entertainment', '娱乐场所', '娱乐场所', 'amap', ARRAY['hotel','restaurant'], 38),
('scenic_spot', '景点', '景点', 'amap', ARRAY['hotel'], 39),
('industrial_zone', '工业园区', '工业园区', 'amap', ARRAY['logistics','auto4s'], 40)
ON CONFLICT (category) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    amap_keyword = EXCLUDED.amap_keyword,
    industry_relevance = EXCLUDED.industry_relevance,
    sort_order = EXCLUDED.sort_order;

-- Index for fast GIN lookups on industry_relevance array
CREATE INDEX IF NOT EXISTS idx_poi_categories_industry ON poi_categories USING GIN(industry_relevance);

-- Make public_poi.category referenceable against poi_categories
CREATE INDEX IF NOT EXISTS idx_poi_category_lookup ON public_poi(category, h3_index);
