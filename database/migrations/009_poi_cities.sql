-- ============================================================
-- Migration 009: POI Cities configuration table
-- ============================================================

CREATE TABLE IF NOT EXISTS poi_cities (
    city_name VARCHAR(50) PRIMARY KEY,
    adcode VARCHAR(10),
    enabled BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE poi_cities IS 'Target cities for POI collection — replaces hardcoded DEFAULT_CITIES';

INSERT INTO poi_cities (city_name, adcode, enabled, sort_order) VALUES
    ('北京', '110000', true, 1),
    ('上海', '310000', true, 2),
    ('广州', '440100', true, 3),
    ('深圳', '440300', true, 4),
    ('成都', '510100', true, 5),
    ('杭州', '330100', true, 6),
    ('武汉', '420100', true, 7),
    ('南京', '320100', true, 8),
    ('重庆', '500000', true, 9),
    ('苏州', '320500', true, 10),
    ('西安', '610100', true, 11),
    ('长沙', '430100', true, 12)
ON CONFLICT (city_name) DO UPDATE SET
    adcode = EXCLUDED.adcode,
    sort_order = EXCLUDED.sort_order;
