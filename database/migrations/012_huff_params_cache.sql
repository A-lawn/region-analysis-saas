-- ============================================================
-- Migration 012: 项目级Huff参数缓存表
-- 用于存储MLE拟合结果，避免重复拟合
-- ============================================================

CREATE TABLE IF NOT EXISTS project_huff_params (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES analysis_projects(id) ON DELETE CASCADE,
    lambda DOUBLE PRECISION NOT NULL,
    alpha_area DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    alpha_brand DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    r_squared DOUBLE PRECISION,
    aic DOUBLE PRECISION,
    n_observations INTEGER,
    source VARCHAR(20) NOT NULL DEFAULT 'default'
        CHECK (source IN ('mle', 'benchmark', 'default')),
    fitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_huff_params_project
    ON project_huff_params(project_id);

COMMENT ON TABLE project_huff_params IS '项目级Huff引力模型参数缓存';
COMMENT ON COLUMN project_huff_params.lambda IS '距离衰减系数';
COMMENT ON COLUMN project_huff_params.alpha_area IS '面积吸引力弹性';
COMMENT ON COLUMN project_huff_params.alpha_brand IS '品牌吸引力弹性';
COMMENT ON COLUMN project_huff_params.source IS '参数来源: mle=最大似然估计, benchmark=行业基准, default=默认值';
