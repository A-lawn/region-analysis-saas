-- ============================================================
-- Migration 017: 数据底座升级 — 公共POI表对齐v3.1规范 + H3需求栅格表 + Huff基准表
-- ============================================================

-- 017a: 升级 public_poi 表，对齐决策引擎接口需求
ALTER TABLE public_poi ADD COLUMN IF NOT EXISTS industry VARCHAR(32);
ALTER TABLE public_poi ADD COLUMN IF NOT EXISTS city VARCHAR(64);
ALTER TABLE public_poi ADD COLUMN IF NOT EXISTS district VARCHAR(64);
ALTER TABLE public_poi ADD COLUMN IF NOT EXISTS brand_chain VARCHAR(128);
ALTER TABLE public_poi ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public_poi ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 从旧 category 列填充 industry（category 存储的是 industry 代码）
UPDATE public_poi SET industry = category WHERE industry IS NULL AND category IS NOT NULL;
UPDATE public_poi SET city = '西安' WHERE city IS NULL AND industry IS NOT NULL;

-- 迁移索引
CREATE INDEX IF NOT EXISTS idx_poi_industry ON public_poi(industry, city);
CREATE INDEX IF NOT EXISTS idx_poi_collected ON public_poi(collected_at DESC);

COMMENT ON TABLE public_poi IS '公共竞品POI数据（平台核心数据资产）';
COMMENT ON COLUMN public_poi.industry IS '行业代码: convenience/beverage/restaurant/...';
COMMENT ON COLUMN public_poi.brand_chain IS '连锁品牌名: 罗森/7-ELEVEN/每一天/...';
COMMENT ON COLUMN public_poi.collected_at IS '数据采集时间';

-- ============================================================
-- 017b: H3需求栅格表（人口 + 消费力）
-- ============================================================
CREATE TABLE IF NOT EXISTS h3_demand_grid (
    h3_index VARCHAR(20) PRIMARY KEY,
    lng DOUBLE PRECISION NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    population FLOAT DEFAULT 0,
    consumption_index FLOAT DEFAULT 1.0,
    residential_ratio FLOAT DEFAULT 0.5,
    commercial_ratio FLOAT DEFAULT 0.2,
    data_source VARCHAR(64) DEFAULT 'worldpop',
    data_year INTEGER DEFAULT 2020,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_h3_demand_lnglat ON h3_demand_grid(lng, lat);
CREATE INDEX IF NOT EXISTS idx_h3_demand_geom ON h3_demand_grid
    USING GIST (ST_SetSRID(ST_MakePoint(lng, lat), 4326));

COMMENT ON TABLE h3_demand_grid IS 'H3分辨率9人口/消费力需求栅格';
COMMENT ON COLUMN h3_demand_grid.population IS '常住人口估算（来源: WorldPop / 高德 / 统计年鉴）';
COMMENT ON COLUMN h3_demand_grid.consumption_index IS '消费力指数（城市均值=1.0）';
COMMENT ON COLUMN h3_demand_grid.residential_ratio IS '居住用地占比';
COMMENT ON COLUMN h3_demand_grid.commercial_ratio IS '商业用地占比';
COMMENT ON COLUMN h3_demand_grid.data_source IS '数据来源标识';
COMMENT ON COLUMN h3_demand_grid.data_year IS '数据年份';

-- ============================================================
-- 017c: Huff参数基准表（平台级，按行业+城市分类）
-- ============================================================
CREATE TABLE IF NOT EXISTS huff_benchmarks (
    id SERIAL PRIMARY KEY,
    industry VARCHAR(32) NOT NULL,
    city VARCHAR(64) DEFAULT 'all',
    lambda DOUBLE PRECISION NOT NULL,
    alpha_area DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    alpha_brand DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    r_squared DOUBLE PRECISION,
    aic DOUBLE PRECISION,
    n_observations INTEGER,
    source VARCHAR(64) DEFAULT 'benchmark'
        CHECK (source IN ('mle', 'cached_mle', 'benchmark', 'default')),
    fitted_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    UNIQUE(industry, city, source)
);

CREATE INDEX IF NOT EXISTS idx_huff_benchmarks_industry ON huff_benchmarks(industry, city);

COMMENT ON TABLE huff_benchmarks IS 'Huff引力模型参数基准（按行业+城市分类）';
COMMENT ON COLUMN huff_benchmarks.lambda IS '距离衰减系数（正数，越大越不愿走远路）';
COMMENT ON COLUMN huff_benchmarks.alpha_area IS '面积吸引力弹性';
COMMENT ON COLUMN huff_benchmarks.alpha_brand IS '品牌吸引力弹性';
COMMENT ON COLUMN huff_benchmarks.r_squared IS '模型拟合优度';
COMMENT ON COLUMN huff_benchmarks.source IS '参数来源: mle/Cached_mle/benchmark/default';

-- ============================================================
-- 017d: 预置12行业默认Huff基准参数到 huff_benchmarks 表
--       数值继承自 Migration 013 + huffService.ts INDUSTRY_DEFAULT_HUFF
-- ============================================================
INSERT INTO huff_benchmarks (industry, city, lambda, alpha_area, alpha_brand, source, r_squared, n_observations)
VALUES
    ('convenience',       'all', 2.0, 0.5, 0.8, 'benchmark', NULL, NULL),
    ('beverage',          'all', 2.5, 0.3, 0.9, 'benchmark', NULL, NULL),
    ('restaurant',        'all', 1.5, 0.8, 0.7, 'benchmark', NULL, NULL),
    ('pharmacy',          'all', 1.2, 0.4, 0.6, 'benchmark', NULL, NULL),
    ('fresh_grocery',     'all', 1.0, 1.0, 0.5, 'benchmark', NULL, NULL),
    ('supermarket',       'all', 0.3, 1.2, 0.8, 'benchmark', NULL, NULL),
    ('hotel',             'all', 0.15, 0.9, 1.2, 'benchmark', NULL, NULL),
    ('medical_aesthetics','all', 0.2, 0.4, 1.5, 'benchmark', NULL, NULL),
    ('education',         'all', 1.0, 0.3, 0.8, 'benchmark', NULL, NULL),
    ('pet_service',       'all', 1.0, 0.5, 0.6, 'benchmark', NULL, NULL),
    ('auto4s',            'all', 0.05, 1.5, 1.0, 'benchmark', NULL, NULL),
    ('logistics',         'all', 0.8, 0.2, 0.3, 'benchmark', NULL, NULL)
ON CONFLICT (industry, city, source) DO NOTHING;

-- 017e: 修复 h3_index NOT NULL 约束（后续由触发器或批量UPDATE填充）
ALTER TABLE public_poi ALTER COLUMN h3_index DROP NOT NULL;
