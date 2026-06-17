# v3.2 更新说明 — 两层订阅架构 & 安全加固

> 发布日期：2026-06-17

---

## 概述

本次更新重新设计了产品功能分层，修复了 3 个生产 Bug，并加强了前端安全防护。

---

## 功能分层设计

### 免费版（free）

| 能力 | 说明 |
|------|------|
| 快速选址分析 | 选行业 → 选区县 → 标候选点 → 打分排名，基于平台公开 POI 数据 |
| 分析报告导出 | 分析完成后一键导出 PDF 报告 |
| 历史记录保存 | 分析结果保留在「我的数据」中，可随时回顾 |
| 知情同意 | 首次使用弹窗确认，同意后不再提示 |

### 专业版（pro）

免费版全部能力 +
| 能力 | 说明 |
|------|------|
| 上传自有数据 | 支持 Excel / CSV，智能列识别 |
| 覆盖分析 | 多半径覆盖、缓冲区叠加、盲区识别 |
| 热力图 / 聚类 | KDE 密度分析、DBSCAN 聚类 |
| H3 等值区域 | 六边形栅格密度可视化 |
| 选址优化 | 多候选点综合评分排名 |
| 博弈模型 | 竞争博弈求解、市占率预估 |
| 行业基准对标 | 与行业 KPI 基准比较 |
| 完整分析报告 | 含基准对标、决策建议的综合报告 |

### 升级方式

- **MVP 验证期**：管理员通过 SQL 切换全局模式为 `full_access`，所有用户自动拥有专业能力
- **正式运营期**：管理员切回 `tiered` 分层模式，用户通过定价页联系管理员升级
- 定价页路径：我的数据 → 升级引导 Banner → 了解更多

---

## 管理员操作

### 切换全局模式

```sql
-- 全员专业模式（MVP 验证）
INSERT INTO system_config (config_key, config_value, description)
VALUES ('subscription_mode', '"full_access"', '全员专业')
ON CONFLICT (config_key) DO UPDATE SET config_value = '"full_access"', updated_at = NOW();

-- 切回分层模式（正式上线）
UPDATE system_config SET config_value = '"tiered"' WHERE config_key = 'subscription_mode';
```

### 单独升级用户

```sql
UPDATE users SET metadata = jsonb_set(metadata, '{subscription_tier}', '"pro"')
WHERE email = 'xxx@xxx.com';
```

---

## Bug 修复

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| 1 | 快速分析导出报告报 `invalid input syntax for type uuid: "demo"` | `goReport()` 使用硬编码 fallback `"demo"` 作为项目 ID | 改为分析前先通过 API 创建临时项目，使用真实 UUID |
| 2 | 报告页返回按钮跳到错误项目 | 报告 API 未返回 `projectType` 字段 | 增加 `projectType` 字段，前端据此决定返回目标 |
| 3 | 知情同意反复弹出 | `consented` 状态未持久化 | 改为 `localStorage` 存储，独立函数处理 |

---

## 安全加固

| 风险 | 修复 |
|------|------|
| `isPro` 从 `localStorage` 读取可被前端篡改 | 改为仅读取内存 `user` 对象，刷新后通过 `/api/auth/me` 恢复 |
| `create-project` 无限创建候选点 | 上限 50 个候选点，名称截断 100 字符 |
| `register` 接口 500 错误 | `users` 表新增 `metadata` 列，部署前需手动执行迁移 019 |

---

## 数据库变更

新增迁移文件 `database/migrations/019_quick_analysis_project.sql`：

- `analysis_projects` 表：新增 `is_temporary` 字段
- 新建 `system_config` 表：全局配置存储
- `users` 表：新增 `metadata JSONB` 列

**部署前必须执行**（已有数据库）：

```sql
ALTER TABLE analysis_projects ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

CREATE TABLE IF NOT EXISTS system_config (
    config_key VARCHAR(128) PRIMARY KEY,
    config_value JSONB NOT NULL DEFAULT 'null',
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO system_config (config_key, config_value, description)
VALUES ('subscription_mode', '"tiered"', '订阅模式')
ON CONFLICT (config_key) DO NOTHING;
```

---

## 新增文件

| 文件 | 说明 |
|------|------|
| `frontend-vue/src/stores/config.ts` | 全局配置 store（订阅模式） |
| `frontend-vue/src/views/PricingView.vue` | 定价对比页 |
| `frontend-vue/src/components/shared/UpgradeBanner.vue` | 升级引导组件 |
| `database/migrations/019_quick_analysis_project.sql` | 数据库迁移 |

## 新增接口

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/web/system/config` | 否 | 获取全局订阅模式 |
| POST | `/api/web/quick-analysis/create-project` | 是 | 快速分析创建临时项目 |
| GET | `/api/auth/me` | 是 | 当前用户信息（含 subscriptionTier） |
