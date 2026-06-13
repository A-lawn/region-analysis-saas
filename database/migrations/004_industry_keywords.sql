-- ============================================================
-- Migration 002: Create industry_keywords table
-- Maps Chinese/English keywords to industry codes for auto-detection
-- Replaces hardcoded if-else chain in projectService.ts
-- ============================================================

CREATE TABLE IF NOT EXISTS industry_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry VARCHAR(50) NOT NULL REFERENCES site_optimization_models(industry) ON DELETE CASCADE,
  keyword VARCHAR(50) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(industry, keyword)
);

CREATE INDEX IF NOT EXISTS idx_industry_keywords_industry ON industry_keywords(industry);
CREATE INDEX IF NOT EXISTS idx_industry_keywords_priority ON industry_keywords(priority DESC);

-- Seed keywords for 12 industries (priority: higher = matched first)
INSERT INTO industry_keywords (industry, keyword, priority) VALUES
  -- convenience
  ('convenience', '便利店', 10),
  ('convenience', '便利', 5),
  ('convenience', '零售', 2),
  ('convenience', '杂货', 2),
  -- beverage
  ('beverage', '奶茶', 10),
  ('beverage', '茶饮', 10),
  ('beverage', '咖啡', 8),
  ('beverage', '饮品', 5),
  ('beverage', '甜品', 3),
  -- restaurant
  ('restaurant', '餐饮', 10),
  ('restaurant', '餐厅', 9),
  ('restaurant', '美食', 7),
  ('restaurant', '火锅', 7),
  ('restaurant', '小吃', 5),
  ('restaurant', '面食', 5),
  -- pharmacy
  ('pharmacy', '药店', 10),
  ('pharmacy', '药房', 9),
  ('pharmacy', '诊所', 5),
  ('pharmacy', '医疗', 3),
  -- fresh_grocery
  ('fresh_grocery', '生鲜', 10),
  ('fresh_grocery', '水果', 8),
  ('fresh_grocery', '蔬菜', 7),
  ('fresh_grocery', '菜市场', 5),
  ('fresh_grocery', '农贸', 5),
  -- supermarket
  ('supermarket', '商超', 10),
  ('supermarket', '超市', 9),
  ('supermarket', '百货', 7),
  ('supermarket', '商场', 5),
  -- hotel
  ('hotel', '酒店', 10),
  ('hotel', '宾馆', 9),
  ('hotel', '住宿', 7),
  ('hotel', '旅店', 6),
  -- medical_aesthetics
  ('medical_aesthetics', '医美', 10),
  ('medical_aesthetics', '美容', 8),
  ('medical_aesthetics', '口腔', 7),
  ('medical_aesthetics', '美发', 3),
  ('medical_aesthetics', '理发', 2),
  -- education
  ('education', '教育', 10),
  ('education', '培训', 9),
  ('education', '辅导', 7),
  ('education', '学校', 6),
  -- pet_service
  ('pet_service', '宠物', 10),
  ('pet_service', '宠物店', 10),
  ('pet_service', '宠物医院', 8),
  -- auto4s
  ('auto4s', '汽车', 10),
  ('auto4s', '4S', 10),
  ('auto4s', '4S店', 10),
  ('auto4s', '汽贸', 5),
  -- logistics
  ('logistics', '物流', 10),
  ('logistics', '快递', 9),
  ('logistics', '驿站', 8),
  ('logistics', '配送', 7)
ON CONFLICT (industry, keyword) DO UPDATE SET priority = EXCLUDED.priority;
