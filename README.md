# 区域数据分析平台 v1.0

基于 PostGIS + Express + Vue3 的空间数据分析 SaaS 平台，支持多点位覆盖分析、热力图、聚类分析、选址优化、竞争分析等功能，前端基于高德地图可视化。

---

## 技术栈

| 层 | 技术 |
|------|------|
| 前端 | Vue 3 + TypeScript + Vite + 高德地图 JS API 2.0 |
| 后端 | Express + TypeScript + pg-promise + BullMQ |
| 数据库 | PostgreSQL 16 + PostGIS 3 |
| 缓存 | Redis 7 |
| 可视化 | AMap (GCJ-02), AMap.HeatMap, AMap.MarkerClusterer, AMap.GeoJSON |
| 编排 | Docker Compose (postgis/redis/backend/frontend) |
| 坐标系 | WGS-84 / GCJ-02 / BD-09 互转 (coordtransform) |

---

## 项目结构

`
区域数据分析/
+-- backend/                    # Express TypeScript 后端
    +-- src/
        +-- controllers/       # 路由控制器 (auth/web/apiV1)
        +-- services/          # 核心业务逻辑 (15个服务)
        +-- middleware/         # 中间件
        +-- jobs/              # BullMQ 异步任务
        +-- workers/           # 任务执行器
        +-- utils/             # 工具函数
        +-- validators/        # 参数校验
        +-- config.ts          # 环境变量配置
        +-- db.ts              # 数据库连接
        +-- index.ts           # 应用入口
    +-- package.json
    +-- tsconfig.json
+-- frontend-vue/              # Vue 3 + TypeScript 前端
    +-- src/
        +-- views/            # 5个页面
        +-- components/       # 15个组件
        +-- composables/      # useAmap / useToast
        +-- stores/           # Pinia 状态管理
        +-- api/              # axios 封装
        +-- router/           # Vue Router
        +-- types/            # 类型定义
    +-- vite.config.ts
    +-- tsconfig.json
+-- database/
    +-- init.sql              # 数据库建表脚本
+-- nginx/
    +-- default.conf          # Nginx 配置
+-- public/                   # 构建产物
+-- sample-data/              # 测试数据
+-- docs/                     # 文档
+-- docker-compose.yml        # 服务编排
+-- .env.example              # 环境变量示例
`

---

## 快速开始

### 环境要求

- Docker & Docker Compose
- Node.js 18+ (开发模式)

### Docker 一键启动

`bash
cp .env.example .env
# 编辑 .env 填入 JWT_SECRET、SMTP、高德API Key
docker compose up -d
# 前端: http://localhost:8080
# 后端: http://localhost:3000
# 健康检查: http://localhost:3000/api/health
`

### 开发模式

`bash
cd backend && npm install && npm run dev
cd frontend-vue && npm install && npm run dev
# 编译检查
cd backend && npx tsc --noEmit
cd frontend-vue && npx vue-tsc --noEmit
`

---

## 核心功能

### 端到端可用 (10项)

| 功能 | 技术实现 | 前端组件 |
|------|----------|----------|
| 覆盖范围分析 | PostGIS ST_Buffer + ST_Union + ST_ConvexHull | CoveragePanel |
| 热力图 | PostGIS KDE + AMap.HeatMap | HeatmapPanel |
| 聚类分析 | PostGIS ST_ClusterDBSCAN | ClusterPanel |
| 选址优化 | 多因子加权 (distance/blind/density/competition) | SiteOptimizationPanel |
| H3 等值区域 | h3-js 六边形网格聚合 | H3HexagonPanel |
| 竞争分析 | 500m/1km 竞对密度 + saturation 三级 | 内嵌于选址优化 |
| 地址解析 | 高德地理编码/逆地理编码 | 内嵌于选址面板 |
| 文件上传 | xlsx/xls/csv 解析 + 列映射 + 坐标转换 | UploadView |
| 报告导出 | JSON驱动报告页 + 浏览器打印/PDF | ReportView |
| 点位分页 | GET /points API 分页查询 | projectStore |

### 已实现但未接入 (8项)

| 功能 | 文件 | 状态 |
|------|------|------|
| 泰森多边形 | voronoiService.ts | 无路由/前端面板 |
| OSRM 路网等时圈 | routingService.ts | 无路由/前端面板 |
| 决策建议引擎 | decisionEngine.ts | 调用时传入空对象 |
| POI 数据采集 | poiCollector.ts | 仅手动执行 |
| 套餐配额 | quota.ts | 未被引用 |
| 多租户订阅 | subscriptions 表 | 未接入 |
| 异步任务队列 | BullMQ + analysisWorker | 队列空转 |
| 前端任务轮询 | analysisStore.pollTask | 无组件调用 |

### API v1 开放接口

| 方法 | 路径 | 认证 |
|------|------|------|
| POST | /api/v1/analysis/run | API Key + HMAC |
| POST | /api/v1/analysis/run-async | API Key |
| GET | /api/v1/analysis/:taskId/result | API Key |
| GET/POST/DELETE | /api/v1/apikeys | JWT |

---

## 数据库表结构

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| analysis_projects | 分析项目 | tenant_id, source_crs, point_count, status, deleted_at |
| spatial_points | 空间点位 | project_id, geom(Point,4326), name, address, metadata(JSONB) |
| analysis_results | 分析结果缓存 | project_id, analysis_type, params, result(JSONB) |
| users | 用户 | email, password_hash, tenant_id, role, status |
| refresh_tokens | JWT刷新令牌 | user_id, token, expires_at |
| api_keys | 开放API密钥 | tenant_id, api_key, secret, enabled |
| password_reset_tokens | 密码重置 | user_id, token, expires_at, used |
| site_optimization_models | 行业选址模型 | industry, weights(JSONB) |
| subscriptions | 租户订阅 | tenant_id, plan, quota_limit, expires_at |

---

## 安全机制

| 类别 | 措施 |
|------|------|
| 认证 | JWT (30min access + 30d refresh) + 图形验证码 + 邮箱OTP |
| 授权 | authRequired 中间件 + 多租户 tenant_id 隔离 |
| API开放 | API Key + HMAC-SHA256 签名校验 |
| 限流 | 全局100/min, 登录5/min, 分析10/min, OTP 5/min |
| 账号保护 | 密码错误5次锁定15min + bcrypt 12轮 |
| OTP保护 | 3次失败作废 + 频率限制 |
| SQL注入 | pg-promise $[param] 全量参数化 |
| CORS | 白名单 + credentials |
| 生产环境 | 堆栈追踪不泄露 + HTTPS支持 |

---

## 坐标系处理链路

`
用户上传 (GCJ-02/WGS-84/BD-09)
  -> convertPointsToGcj02 统一转 GCJ-02
  -> convertCoord(GCJ-02 -> WGS-84) 写入 DB
  -> PostGIS geography 球面计算
  -> ST_AsGeoJSON 返回 WGS-84 坐标
  -> convertGeoJSONCoords(WGS-84 -> GCJ-02)
  -> 前端 AMap 渲染 (GCJ-02 底图)
`

---

## 测试数据

| 文件 | 点位数 | 区域 |
|------|:------:|------|
| sample_beijing_stores.csv/xlsx | 210 | 北京市 (10商圈) |
| sample_xian_stores.csv | 249 | 西安市 (10商圈) |
| sample_xiaozhai_stores.csv | 210 | 西安小寨商圈 |

---

## 版本历史

### v1.0 (Current)

- 端到端可用: 覆盖分析 / 热力图 / 聚类 / 选址优化 / H3 / 上传 / 报告
- 安全四阶段加固全部完成
- 覆盖算法 ST_Envelope -> ST_ConvexHull
- 多半径对比 (2km/3km/5km)
- API v1 开放接口 + HMAC签名
- 商业可用度: ~40%
