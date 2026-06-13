# 区域数据分析平台 v2.0

基于 PostGIS + Express + Vue3 的空间数据分析 SaaS 平台，支持多点位覆盖分析、热力图、聚类分析、选址优化、竞争分析、12 行业深度模型、决策建议引擎、路网等时圈等功能。

---

## 技术栈

| 层 | 技术 |
|------|------|
| 前端 | Vue 3 + TypeScript + Vite + 高德地图 JS API 2.0 |
| 后端 | Express + TypeScript + pg-promise + BullMQ |
| 数据库 | PostgreSQL 16 + PostGIS 3 |
| 缓存 | Redis 7 |
| 路网 | OSRM (Docker) + 高德公交 API |
| 可视化 | AMap (GCJ-02), AMap.HeatMap, AMap.GeoJSON |
| 编排 | Docker Compose (postgis/redis/osrm/backend/frontend) |
| 坐标系 | WGS-84 / GCJ-02 / BD-09 互转 (coordtransform) |

---

## 项目结构

`
区域数据分析/
├── backend/                    # Express TypeScript 后端
│   ├── src/
│   │   ├── config/            # 配置模块 (app/analysis/industry)
│   │   ├── controllers/       # 路由控制器
│   │   ├── services/          # 核心业务逻辑
│   │   │   ├── analysis/      # 分析服务 (benchmark/hull/kpi正常izer/industryLoader)
│   │   │   ├── competitionService.ts
│   │   │   ├── decisionEngine.ts
│   │   │   ├── routingService.ts
│   │   │   └── spatialAnalysis.ts
│   │   ├── middleware/         # 中间件 (auth/quota/rateLimit/errorHandler/requestLogger)
│   │   ├── jobs/              # BullMQ 异步任务 + POI 采集器
│   │   ├── workers/           # 任务执行器
│   │   ├── utils/             # 工具函数 (coordTransform/columnDetector/desensitize/logger)
│   │   └── validators/        # 参数校验
│   └── package.json
├── frontend-vue/              # Vue 3 + TypeScript 前端
│   └── src/
│       ├── views/             # 页面
│       ├── components/        # 组件 (dashboard/shared/upload)
│       ├── composables/       # useAmap / useToast
│       ├── stores/            # Pinia (auth/project/analysis/industry)
│       ├── api/               # axios 封装
│       ├── router/            # Vue Router + auth guard
│       └── types/             # TypeScript 类型
├── database/
│   ├── init_v2.sql            # v2.0 完整建库脚本
│   └── migrations/            # 增量迁移 (001-011)
├── nginx/                     # Nginx 反向代理
├── public/                    # 前端构建产物
├── sample-data/               # 测试数据
├── docker-compose.yml         # 服务编排 (含 OSRM)
└── .env.example               # 环境变量示例
`

---

## 快速开始

### OSRM 路网数据 (可选)

`ash
# 下载中国路网数据
wget https://download.geofabrik.de/asia/china-latest.osm.pbf

# 预处理 (步行 + 驾车)
docker run -t -v C:\Users\User\Documents\区域数据分析/china-latest.osm.pbf:/data/osm.pbf osrm/osrm-backend osrm-extract -p /opt/car.lua /data/osm.pbf
docker run -t -v C:\Users\User\Documents\区域数据分析:/data osrm/osrm-backend osrm-partition /data/osrm-data.osrm

# 启动 (含 OSRM)
docker compose --profile with-osrm up -d
`

### 无 OSRM 模式

`ash
cp .env.example .env
# 编辑 .env 填入 JWT_SECRET、SMTP、高德 API Key
docker compose up -d
# 前端: http://localhost:8080
# 后端: http://localhost:3000
# 健康检查: http://localhost:3000/api/health
`

---

## v2.0 核心升级 (vs v1.0 MVP)

### 1. 12 行业深度模型

| 行业 | 服务半径 | 竞争模式 | KPI 数 |
|------|----------|----------|--------|
| 便利店 | 300m | linear_down | 4 |
| 茶饮/咖啡 | 400m | sweet_spot | 4 |
| 餐饮 | 500m | sweet_spot | 4 |
| 药店/诊所 | 800m | linear_down + hard_filter(350m) | 5 |
| 生鲜超市 | 800m | linear_down | 5 |
| 物流/快递 | 500m | linear_down | 4 |
| 教育培训 | 1500m | linear_down | 5 |
| 宠物服务 | 2000m | linear_down | 4 |
| 酒店/住宿 | 2000m | cluster_u | 5 |
| 商超 | 3000m | linear_down | 5 |
| 医美/口腔 | 3000m | cluster_u | 5 |
| 汽车4S店 | 10000m | cluster_u | 5 |

- 每个行业独立 KPI 权重 + 决策阈值 + 基准对标数据
- 全量 DB 可配置，前端行业选择器自动适配

### 2. KPI 归一化引擎

- 42 个 KPI 指标，4 大分类 (reach/competition/density/site)
- 8 种归一化算法: linearUp, linearDown, sweetSpot, step, clusterU, binary, hardFilter
- 每个 KPI 独立归一化后加权求和，替换旧版 4 分类粗糙合并
- kpi_category_map 表的 normalization_type/params 驱动计算

### 3. 决策建议引擎 v2.0

- 30 条规则 (12 通用 + 18 行业专属)
- 行业选择联动：只有当前行业的规则才触发
- 决策阈值 DB 可配，12 行业差异化 (gapRatio 临界值从 30 到 65)
- 条件守卫：数据缺失时不会误触发

### 4. 路网等时圈 (6 种出行方式)

- 步行/骑行/驾车 → OSRM 路网
- 公交/地铁/公交+地铁 → 高德公交 API
- 每日配额监控：/api/web/transit/quota
- Redis 缓存 (7 天 TTL)

### 5. POI 数据采集 v2.0

- 40 个 POI 类别，12 个城市
- 动态采集队列 + 增量更新 + 断点续传 (Redis)
- BullMQ 定时任务 (每周日 3AM)
- 过期数据清理 (90 天 TTL)

### 6. 分析报告 v2.0

- 多半径覆盖对比 (60%/100%/150% 服务半径)
- 行业感知决策建议
- 基准对标表 (当前值 vs 行业中位/P75)
- KPI 权重配置展示
- 打印/PDF 自定义页眉

### 7. 安全与隐私

- 请求日志中间件 (结构化 JSON + trace ID)
- 隐私脱敏工具 (邮箱/手机/坐标/token 脱敏)
- pplication_logs 表 + 保留策略
- SQL 注入修复

### 8. 用户体验优化

- KPI 权重中文显示 (walkableRatio → 步行可达比)
- 行业不匹配友好提示 (422 + 中文建议)
- 文件上传中文文件名修复
- 回收站一键清理

---

## 数据库表 (v2.0 新增)

| 表名 | 说明 |
|------|------|
| site_optimization_models | 行业模型 (增加 analysis_params/decision_thresholds/benchbarks/kpi_weights/scoring_algorithm) |
| kpi_category_map | KPI 注册表 (42 个 KPI，含归一化类型/参数/数据源) |
| industry_keywords | 行业关键词 (52 条，用于自动识别) |
| poi_categories | POI 类别表 (40 个类别) |
| poi_cities | POI 城市表 (12 个城市) |
| nalysis_types | 分析类型注册表 |
| pplication_logs | 应用日志 (含保留策略和脱敏规则) |

---

## API 接口 (v2.0 新增)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/web/industries | 12 行业列表 + KPI 中文映射 |
| GET | /api/web/industries/:id/model | 行业详细配置 |
| GET | /api/web/industries/:industry/benchmark | 行业基准对标 |
| GET | /api/web/transit/quota | 高德公交 API 配额查询 |
| GET | /api/web/coverage/industry-radii | 行业服务半径列表 |

---

## 安全机制

| 类别 | 措施 |
|------|------|
| 认证 | JWT (30min access + 30d refresh) + 图形验证码 + 邮箱 OTP |
| 授权 | authRequired 中间件 + 多租户 tenant_id 隔离 |
| API 开放 | API Key + HMAC-SHA256 签名校验 |
| 限流 | 全局 100/min, 登录 5/min, 分析 10/min, OTP 5/min |
| 账号保护 | 密码错误 5 次锁定 15min + bcrypt 12 轮 |
| SQL 注入 | pg-promise 全量参数化查询 |
| 日志 | 结构化 JSON + trace ID + 隐私脱敏 |
| 生产环境 | 堆栈追踪不泄露 + HTTPS 支持 |

---

## 迁移脚本

`
database/migrations/
├── 001_extend_industry_models.sql    # 扩展行业模型字段
├── 002_new_industries.sql            # 新增 7 个行业
├── 003_analysis_types.sql            # 分析类型注册
├── 004_industry_keywords.sql         # 行业关键词
├── 005_poi_categories.sql            # POI 类别
├── 006_industry_benchmarks.sql       # 行业基准数据
├── 007_seed_kpi_registry.sql         # KPI 注册表 (42 个)
├── 008_log_retention.sql             # 日志保留策略
├── 009_poi_cities.sql                # POI 城市
├── 010_unify_kpi_weights.sql         # KPI 权重统一
└── 011_backfill_decision_thresholds.sql  # 决策阈值补全
`

---

## 测试数据

| 文件 | 点位数 | 区域 | 行业 |
|------|:------:|------|------|
| 大唐不夜城_便利店_15家.csv | 15 | 西安大唐不夜城 | 便利店 |
| sample_xian_stores.csv | 249 | 西安市 | 混合 |
| sample_zhonglou_stores.csv | 50 | 西安钟楼 | 药店 |

---

## 版本历史

### v2.0 (Current) — codex/v2.0-refactor

- 12 行业深度模型 + DB 可配置
- KPI 归一化引擎 (42 KPI × 8 算法)
- 决策建议引擎 v2.0 (30 规则 + 行业阈值)
- 路网等时圈 (6 种出行方式: OSRM + 高德公交)
- POI 采集器 v2.0 (40 类别 × 12 城市)
- 分析报告 v2.0 (多半径/基准对标/决策建议)
- 日志系统 + 隐私脱敏
- KPI 中文显示 + 行业不匹配友好提示
- 安全审计: SQL 注入修复 / 请求日志 / 脱敏
- 商业可用度: ~70%

### v1.0 (MVP) — main

- 端到端可用：覆盖分析 / 热力图 / 聚类 / 选址优化 / H3 / 上传 / 报告
- 5 行业硬编码模型
- 软件用度: ~40%
