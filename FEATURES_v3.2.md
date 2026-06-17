# v3.2 特性能力更新解读

> 发布日期：2026-06-17

---

## 一句话概览

v3.2 重新定义了产品功能分层，引入**免费版 / 专业版**两层架构，修复了快速分析报告导出的核心 Bug，并全面加固了注册与接口安全。

---

## 功能分层总览

```
┌─────────────────────────────────────────────────────┐
│                    免费版（free）                      │
│  快速选址分析 → 基于平台公开 POI，无需上传数据即可评估    │
│  分析报告导出 → 一键 PDF 报告                          │
│  历史记录保存 → 分析结果保留在「我的数据」                 │
│  首次知情同意 → 同意后不再弹出                          │
├─────────────────────────────────────────────────────┤
│                 专业版（pro）= 免费版全部 +              │
│  上传自有数据 → Excel/CSV，智能列识别（13字段自动检测）   │
│  覆盖分析     → 多半径覆盖、缓冲区叠加、盲区识别           │
│  热力图/聚类  → KDE 密度 + DBSCAN 聚类                  │
│  H3 等值区域  → 六边形栅格密度可视化                    │
│  选址优化     → 多候选点综合评分排名                     │
│  博弈模型     → 竞争博弈求解、市占率预估                  │
│  行业基准对标 → 与行业 KPI 基准比较                     │
│  完整分析报告 → 含基准对标、决策建议的综合报告             │
└─────────────────────────────────────────────────────┘
```

### 升级方式

- **MVP 验证期**：管理员一条 SQL 切换全局 `full_access` 模式，所有用户自动获得专业能力，无需逐个配置
- **正式运营期**：管理员切回 `tiered` 分层模式，用户通过「我的数据 → 升级引导 → 了解更多」进入定价页
- 定价页展示免费版与专业版的完整能力对比，引导用户联系管理员升级

---

## Bug 修复

| 问题 | 现象 | 修复 |
|------|------|------|
| 导出报告失败 | 快速分析点击「导出报告」报 `invalid input syntax for type uuid` | 分析前通过 API 创建临时项目，使用真实 UUID |
| 报告页返回跳错 | 点击「返回」跳到其他项目的 Dashboard | 报告 API 增加 `projectType` 字段，前端据此决定返回目标 |
| 知情同意反复弹出 | 免费用户每次操作都看到知情同意弹窗 | 改为 `localStorage` 存储同意状态 |

---

## 安全加固

| 层面 | 措施 |
|------|------|
| 前端篡改防护 | `isPro` 不再从 `localStorage` 读取，仅从服务端返回的 `user` 对象获取 |
| 注册限流 | 全局 20/min 上限 + 单 IP/邮箱 5/min |
| 一次性邮箱拦截 | 38 个临时邮箱域名黑名单 |
| 注册安全头 | Helmet（XSS/点击劫持/MIME嗅探防护） |
| 协议存证 | 注册时记录 IP + UA，便于合规审计 |
| 密码安全 | bcrypt 12 轮 + 5 次错误锁定 15 分钟 |
| 防枚举 | 登录统一错误信息 |
| 接口限流 | 全局 100/min，分析 10/min |
| 候选点限制 | 快速分析上限 50 个候选点，名称截断 100 字符 |

---

## 上传增强

上传文件时，用户只需确认 5 个核心列（名称/地址/经度/纬度/类别），后端自动检测额外的 7 个扩展列：

| 扩展字段 | 自动识别关键词 |
|----------|---------------|
| 面积 | 面积、平方米、floor_area、sqm、m² |
| 人均消费 | 人均消费、客单价、avg_cost |
| 评分 | 评分、星级、rating、score、star |
| 品牌分 | 品牌分、brand_score |
| 营业时间 | 营业时间、opentime、open_time |
| 停车位 | 停车位、parking |
| 标签 | 标签、tags、特色 |

---

## 行业分类增强

支持 100+ 细粒度分类关键词自动映射到 12 个行业大类。例如上传 "火锅""小吃""快餐" → 系统自动归一化为 `restaurant` 大类，同时保留用户原始输入用于精准竞品筛选。

---

## 新增接口

| 方法 | 路径 | 认证 | 说明 |
|------|------|:---:|------|
| GET | `/api/web/system/config` | | 全局订阅模式（管理员控制） |
| POST | `/api/web/quick-analysis/create-project` | ✓ | 快速分析创建临时项目 |
| GET | `/api/auth/me` | ✓ | 当前用户信息（含 subscriptionTier） |
| GET | `/api/health` | | 健康检查（DB + Redis） |

---

## 管理员操作速查

```sql
-- 切换到全员专业模式（MVP 验证期使用）
INSERT INTO system_config (config_key, config_value, description)
VALUES ('subscription_mode', '"full_access"', '全员专业')
ON CONFLICT (config_key) DO UPDATE SET config_value = '"full_access"', updated_at = NOW();

-- 切回分层模式（正式上线使用）
UPDATE system_config SET config_value = '"tiered"' WHERE config_key = 'subscription_mode';

-- 单独升级某个用户
UPDATE users SET metadata = jsonb_set(metadata, '{subscription_tier}', '"pro"')
WHERE email = 'xxx@xxx.com';
```

---

## 新增页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 快速选址分析 | `/` | 免费用户首页，选行业/选区县/标候选点 |
| 定价对比 | `/pricing` | 免费版 vs 专业版能力对比 |

---

## 升级指南

已有数据库部署前执行：

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
