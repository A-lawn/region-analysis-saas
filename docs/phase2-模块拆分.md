# Phase 2 详细内容：配置层重构 + 模块拆分

## M2.1 config/ 配置模块
backend/src/config/
  index.ts         整合导出
  app.config.ts    端口/DB/Redis
  analysis.config.ts
  industry.config.ts

## M2.2 IndustryConfigService
backend/src/services/analysis/industryLoader.ts
load(industry) -> IndustryConfig, 含 DB 查询 + Redis 缓存 + fallback

## M2.3 硬编码消除对照
config.ts:49-53       行业半径     -> IndustryConfigService.load()
projectService.ts:84  行业检测     -> industry_keywords 表查询  
spatialAnalysis.ts:543 默认权重    -> IndustryConfigService.load()
spatialAnalysis.ts:256 衰减比例    -> config.analysis.decay
spatialAnalysis.ts:295 衰减权重    -> config.analysis.decayWeights
spatialAnalysis.ts:580 竞品归一化  -> config.competition.maxCompetitors
spatialAnalysis.ts:587 三项归一化  -> config.siteOptimization.scoring
competitionService:46  饱和阈值    -> config.competition.saturation
decisionEngine:26      决策阈值    -> IndustryConfigService.load()
spatialAnalysis:404    KDE参数     -> config.kde
spatialAnalysis:490    聚类参数    -> config.cluster
quota.ts:12            套餐限制    -> analysis_types表JOIN

## M3.1 spatialAnalysis.ts 拆分
637行 -> 7个文件, 每个<200行:
  services/analysis/types.ts
  services/analysis/coverageService.ts
  services/analysis/heatmapService.ts
  services/analysis/clusterService.ts
  services/analysis/siteOptimizationService.ts
  services/analysis/triangulationService.ts
  services/analysis/competitionService.ts

## M3.2 KPI 注册表 + 归一化函数
services/analysis/kpiRegistry.ts  25个KPI注册+分派
services/analysis/normalize.ts    6种归一化(linearUp/Down/sweetSpot/clusterU/hardFilter/step)

## M3.3 统一 dispatcher
services/analysis/dispatcher.ts
消除了 apiV1Controller/analysisWorker 重复

## M3.4 webController.ts 拆分
470行 -> controllers/web/upload|project|analysis|geocode|export + index.ts

## M4.1 12个行业评分函数
services/analysis/industries/
  convenience.ts  / beverage.ts  / restaurant.ts  / pharmacy.ts
  freshGrocery.ts / supermarket.ts / hotel.ts / medicalAesthetics.ts
  education.ts / petService.ts / auto4s.ts / logistics.ts / index.ts

## M4.2 POI 数据查询接入
统一模板: 候选点H3+ring邻居 -> poi_density视图 -> 7类POI密度

## M4.3 决策引擎参数化
行业化阈值 + 15+条量化规则 + benchmark对比

## M4.4 算法精度提升(6项)
重叠面积实测(PostGIS) | 指数衰减替代三段线性 | 营收加权KDE
分位数归一化 | 竞品距离加权计数 | Voronoi裁剪到凸包
