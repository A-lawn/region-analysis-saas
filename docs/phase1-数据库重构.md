# Phase 1 详细内容：数据库层重构

## M1.1 扩展 site_optimization_models 表
文件: database/migrations/008_extend_industry_models.sql

## M1.2 新增 industry_keywords 表  
文件: database/migrations/009_industry_keywords.sql
预置 12 行业 x 4 关键词 = 48 行

## M1.3 新增 analysis_types 注册表
文件: database/migrations/010_analysis_types.sql
预置 6 种分析类型 (coverage/heatmap/cluster/site-optimization/voronoi/h3-hexagon)

## M1.4 预置 7 个新行业模型
beverage/fresh_grocery/hotel/medical_aesthetics/education/pet_service/logistics
各自带完整 analysis_params + decision_thresholds + benchbarks + kpi_weights

## M1.5 POI 采集队列扩展  
backend/src/jobs/poiCollector.ts COLLECT_QUEUE: 14 -> 40 条
新增品类: hotel/school/training/parking/pet/beauty/beverage

## M1.6 迁移规范
database/migrations/ 目录, 序号前缀, 幂等 IF NOT EXISTS
