# 区域数据分析平台 v1.0

基于 PostGIS + Express + Vue3 的空间数据分析 SaaS 平台，支持多点位覆盖分析、热力图、聚类分析、选址优化、竞争分析等功能，前端基于高德地图可视化。当前项目仅为 MVP 阶段。

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

```
区域数据分析/
+-- backend/                    # Express TypeScript 后端
    +-- src/
        +-- controllers/       # 路由控制器 (auth/web/apiV1)
        +-- services/          # 核心业务逻辑 (10个服务)
        +-- middleware/         # 中间件 (auth/quota/rateLimit/errorHandler)
        +-- jobs/              # BullMQ 异步任务 (6个 Job 定义)
        +-- workers/           # 任务执行器 (analysisWorker)
        +-- utils/             # 工具函数
        +-- validators/        # 参数校验 (3个 validator)
        +-- config.ts          # 环境变量配置
        +-- db.ts              # 数据库连接
        +-- index.ts           # 应用入口
    +-- Dockerfile
    +-- jest.config.js
    +-- package.json
    +-- tsconfig.json
+-- frontend-vue/              # Vue 3 + TypeScript 前端
    +-- src/
        +-- views/            # 5个页面 (Upload/Dashboard/Report/Login/ApiKeys)
        +-- components/       # 16个组件 (dashboard/shared/upload 三组)
        +-- composables/      # useAmap / useToast
        +-- stores/           # Pinia 状态管理 (auth/project/analysis)
        +-- styles/           # CSS tokens 设计系统
        +-- api/              # axios 封装
        +-- router/           # Vue Router (5条路由 + auth guard)
        +-- types/            # TypeScript 类型定义
    +-- vite.config.ts
    +-- tsconfig.json
+-- database/
    +-- init.sql              # 数据库建表脚本
    +-- backup.sh             # 数据库备份脚本
+-- nginx/
    +-- default.conf          # Nginx 反向代理配置
+-- public/                   # 前端构建产物 + 静态页
    +-- assets/             # JS/CSS 构建产物 (Vite build)
    +-- favicon.svg         # 站点图标
    +-- icons.svg           # SVG 图标 sprite
    +-- index.html          # SPA 入口
    +-- privacy.html        # 隐私政策
    +-- terms.html          # 服务条款
    
+-- sample-data/              # 测试数据 (5个文件)
+-- docker-compose.yml        # 服务编排
+-- .env.example              # 环境变量示例
```

---

## 快速开始

### 环境要求

- Docker & Docker Compose
- Node.js 18+ (开发模式)

### Docker 一键启动

```bash
cp .env.example .env
# 编辑 .env 填入 JWT_SECRET、SMTP、高德 API Key
docker compose up -d
# 前端: http://localhost:8080
# 后端: http://localhost:3000
# 健康检查: http://localhost:3000/api/health
```

> 首次部署或前端代码更新后需执行：
> ```bash
> cd frontend-vue && npm run build:deploy
> ```

### 开发模式

```bash
cd backend && npm install && npm run dev
cd frontend-vue && npm install && npm run dev
# 编译检查
cd backend && npx tsc --noEmit
cd frontend-vue && npx vue-tsc --noEmit
```

---

## 核心功能

### 端到端可用 (10项)

| 功能 | 技术实现 | 前端组件 |
|------|----------|----------|
| 覆盖范围分析 | PostGIS ST_Buffer + ST_Union + ST_ConvexHull; 输出坐标根据 source_crs 动态转换 | CoveragePanel |
| 热力图 | PostGIS KDE 核密度估计 + AMap.HeatMap | HeatmapPanel |
| 聚类分析 | PostGIS ST_ClusterDBSCAN | ClusterPanel |
| 选址优化 | 多因子加权 (minDist/blindSpot/competition/density); 500m 内竞对粒度 | SiteOptimizationPanel |
| H3 等值区域 | h3-js 六边形网格聚合 | H3HexagonPanel |
| 竞争分析 | 500m/1km 竞对密度 + 竞争得分归一化 | 内嵌于选址优化 |
| 地址解析 | 高德地理编码/逆地理编码 | 内嵌于选址面板 |
| 文件上传 | xlsx/xls/csv 解析 + 列映射 + CRS 选择 | UploadView |
| 报告导出 | JSON 驱动报告页 + 浏览器打印/PDF; 路由已加认证 | ReportView |
| 点位分页 | GET /projects/:id/points 分页查询 | projectStore |

### 已实现但未接入 (8项)

| 功能 | 文件 | 状态 |
|------|------|------|
| 泰森多边形 | backend/src/services/voronoiService.ts | 无路由/前端面板 |
| OSRM 路网等时圈 | backend/src/services/routingService.ts | 无路由/前端面板 |
| 决策建议引擎 | backend/src/services/decisionEngine.ts | 调用时传入空对象 |
| POI 数据采集 | backend/src/jobs/poiCollector.ts | 仅手动执行 |
| 套餐配额 | backend/src/middleware/quota.ts | 未被 controller 引用 |
| 多租户订阅 | subscriptions 表 | 未接入 |
| 异步任务队列 | BullMQ + analysisWorker | 队列空转; 分析接口均为同步 |
| 前端任务轮询 | frontend-vue/src/stores/analysis.ts → pollTask | 无组件调用 |

### API v1 开放接口

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | /api/v1/analysis/run | API Key + HMAC | 同步分析（直接返回结果） |
| POST | /api/v1/analysis/run-async | API Key | 异步分析（当前降级为同步） |
| GET | /api/v1/analysis/:taskId/result | API Key | 异步结果查询（当前始终返回 completed） |
| GET/POST/DELETE | /api/v1/apikeys | JWT | API 密钥管理 |

---

## 数据库表结构

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| analysis_projects | 分析项目 | tenant_id, source_crs, point_count, status, deleted_at |
| spatial_points | 空间点位 | project_id, geom(Point,4326), name, address, metadata(JSONB) |
| analysis_results | 分析结果缓存 | project_id, analysis_type, params, result(JSONB) |
| users | 用户 | email, password_hash, tenant_id, role, status |
| refresh_tokens | JWT 刷新令牌 | user_id, token, expires_at |
| api_keys | 开放 API 密钥 | tenant_id, api_key, secret, enabled |
| password_reset_tokens | 密码重置 | user_id, token, expires_at, used |
| site_optimization_models | 行业选址模型 | industry, weights(JSONB) |
| subscriptions | 租户订阅 | tenant_id, plan, quota_limit, expires_at |

---

## 安全机制

| 类别 | 措施 |
|------|------|
| 认证 | JWT (30min access + 30d refresh) + 图形验证码 + 邮箱 OTP |
| 授权 | authRequired 中间件 + 多租户 tenant_id 隔离 |
| API 开放 | API Key + HMAC-SHA256 签名校验 |
| 限流 | 全局 100/min, 登录 5/min, 分析 10/min, OTP 5/min |
| 账号保护 | 密码错误 5 次锁定 15min + bcrypt 12 轮 |
| OTP 保护 | 3 次失败作废 + 频率限制 |
| SQL 注入 | pg-promise 全量参数化查询 |
| CORS | 白名单 + credentials |
| 生产环境 | 堆栈追踪不泄露 + HTTPS 支持 |
| 健康检查 | /api/health (含 DB+Redis 状态) + /api/health/readiness |

---

## 坐标系处理链路

```
用户上传 (GCJ-02 / WGS-84 / BD-09)
  -> convertPointsToGcj02 统一转 GCJ-02
  -> convertCoord(GCJ-02 -> WGS-84) 写入 DB
  -> PostGIS geography 球面计算
  -> ST_AsGeoJSON 返回 WGS-84 坐标
  -> convertGeoJSONCoords(WGS-84 -> 项目 source_crs)  // 根据项目设定动态转换
  -> 前端 AMap 渲染 (GCJ-02 底图)
```

---

## 测试数据

| 文件 | 点位数 | 区域 |
|------|:------:|------|
| sample_beijing_stores.csv/xlsx | 210 | 北京市 (10 商圈) |
| sample_xian_stores.csv | 249 | 西安市 (10 商圈) |
| sample_xiaozhai_stores.csv | 210 | 西安小寨商圈 |
| sample_zhonglou_stores.csv | 50 | 西安钟楼商圈 |

---

## 版本历史

### v1.0 (Current)

- 端到端可用：覆盖分析 / 热力图 / 聚类 / 选址优化 / H3 / 上传 / 报告
- 安全四阶段加固全部完成
- 覆盖算法 ST_Envelope → ST_ConvexHull
- 多半径对比 (2km/3km/5km)
- API v1 开放接口 + HMAC 签名
- CRS 动态转换：覆盖分析和选址优化的坐标输出根据项目 source_crs 自动适配
- 选址优化评分算法改进：minDist (最近距离) 替代 avgDist，500m 内竞对计数替代三级饱和
- 健康检查增强：/api/health 含 DB + Redis 状态，/api/health/readiness 就绪探针
- 前端设计系统升级：CSS tokens (tokens.css) + AppIcon SVG 图标组件
- 报告导出路由加 authRequired 认证
- 静态资源架构重构：Vite 构建产物回归 dist/，Nginx 简化为单前端 SPA
- 商业可用度：~40%