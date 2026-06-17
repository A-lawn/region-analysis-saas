# 区域数据分析平台

基于 PostGIS + Express + Vue3 的空间数据分析 SaaS 平台，支持快速选址分析、多点位覆盖分析、热力图、聚类分析、选址优化、竞争博弈、12 行业深度模型等功能。

---

## 效果预览

| 快速选址分析 | 我的数据 |
|:---:|:---:|
| ![快速分析](docs/screenshots/quick-analysis.png) | ![我的数据](docs/screenshots/my-data.png) |

| 覆盖分析 | Dashboard 分析 |
|:---:|:---:|
| ![定价](docs/screenshots/coverage-analysis.png) | ![Dashboard](docs/screenshots/dashboard.png) |

---

## 功能分层

### 免费版

- 快速选址分析（基于平台公开 POI 数据，无需上传）
- 候选点位打分排名
- 分析报告导出（PDF）
- 分析记录保存

### 专业版

免费版全部能力 +
- 上传自有数据（Excel / CSV，智能列识别）
- 完整覆盖分析（多半径对比、缓冲区叠加、盲区识别）
- 热力图 / 聚类分析 / H3 六边形栅格
- 选址优化（多候选点综合评分）
- 竞争博弈模型（leader-follower 求解）
- 行业基准对标
- 完整分析报告（含基准对标、决策建议）

> 升级方式：联系管理员开通，详见定价页。

---

## 技术栈

| 层 | 技术 |
|------|------|
| 前端 | Vue 3 + TypeScript + Vite + 高德地图 JS API 2.0 |
| 后端 | Express + TypeScript + pg-promise + BullMQ |
| 数据库 | PostgreSQL 16 + PostGIS 3 |
| 缓存 | Redis 7 |
| 路网 | OSRM (Docker) + 高德公交 API |
| 编排 | Docker Compose |

---

## 项目结构

```
├── backend/               # Express TypeScript 后端
│   └── src/
│       ├── controllers/   # 路由控制器
│       ├── services/      # 核心业务逻辑
│       ├── middleware/     # 中间件（认证/限流/日志）
│       ├── jobs/          # 异步任务 + POI 采集
│       └── validators/    # 参数校验
├── frontend-vue/          # Vue 3 + TypeScript 前端
│   └── src/
│       ├── views/         # 页面
│       ├── components/    # 组件
│       ├── stores/        # Pinia 状态管理
│       ├── composables/   # useAmap / useToast
│       └── router/        # 路由 + auth guard
├── database/              # 建库脚本 + 迁移
├── docker-compose.yml
└── sample-data/           # 测试数据
```

---

## 快速开始

```bash
cp .env.example .env
# 编辑 .env 填入 JWT_SECRET、SMTP、高德 API Key
docker compose up -d
# 前端: http://localhost:8080
# 后端: http://localhost:3000
```

---

## API 接口

| 方法 | 路径 | 认证 | 说明 |
|------|------|:---:|------|
| POST | /api/auth/register | | 注册 |
| POST | /api/auth/login | | 登录 |
| GET | /api/auth/me | ✓ | 当前用户信息 |
| POST | /api/web/upload | ✓ | 上传数据文件 |
| GET | /api/web/projects | ✓ | 项目列表 |
| GET | /api/web/projects/:id/summary | ✓ | 项目概览 |
| GET | /api/web/projects/:id/analysis/coverage | ✓ | 覆盖分析 |
| GET | /api/web/projects/:id/analysis/heatmap | ✓ | 热力图 |
| GET | /api/web/projects/:id/analysis/clusters | ✓ | 聚类分析 |
| POST | /api/web/projects/:id/analysis/site-optimization | ✓ | 选址优化 |
| POST | /api/web/quick-analysis/create-project | ✓ | 快速分析创建项目 |
| GET | /api/web/projects/:id/export/report | ✓ | 导出报告 |
| GET | /api/web/industries | ✓ | 行业列表 |
| GET | /api/web/system/config | | 系统配置 |

---

## 安全机制

| 类别 | 措施 |
|------|------|
| 认证 | JWT（30min access + 30d refresh）+ 图形验证码 + 邮箱 OTP |
| 授权 | authRequired 中间件 + 多租户隔离 |
| 限流 | 全局 100/min，登录 5/min，分析 10/min |
| 账号保护 | 密码错误 5 次锁定 15min，bcrypt 12 轮 |
| SQL 注入 | pg-promise 全量参数化查询 |
| 日志 | 结构化 JSON + trace ID + 隐私脱敏 |

---

## 版本历史

| 版本 | 主要变更 |
|------|---------|
| v3.2 | 两层订阅架构、Bug 修复、安全加固，详见 [CHANGELOG_v3.2.md](CHANGELOG_v3.2.md) |
| v3.0 | 混合计算引擎（Python/FastAPI）、Huff 引力模型、博弈选址求解 |
| v2.0 | 12 行业深度模型、KPI 归一化引擎、决策建议引擎、路网等时圈 |
| v1.0 | MVP：上传数据、覆盖分析、热力图、聚类 |
