# Sample Data — v3.0 选址博弈测试数据

## sample_v3_convenience_xiaozhai_40.csv

**用途**: 测试 Huff MLE 拟合 + 博弈选址 + A/B 对比全流程

| 属性 | 值 |
|------|-----|
| 点位数 | 40 |
| 行业 | 便利店 |
| 区域 | 西安小寨商圈 |
| 日营收范围 | 5,500 ~ 23,500 |
| 面积范围 | 40 ~ 120 sqm |
| 品牌分范围 | 0.42 ~ 0.96 |
| 品牌分布 | 7-ELEVEN(5), 罗森(5), 便利蜂(5), 每一天(7), 唐久便利(5), 美宜佳(4), FamilyMart(2), 苏宁小店(3), 京东便利店(3) |

### 测试场景

1. **Huff MLE 拟合**: 40 条数据均含 daily_revenue, floor_area, brand_score
2. **博弈求解**: 我方选核心商圈2点 vs 竞品从40点池选
3. **A/B 对比**: 方案A小寨3点 vs 方案B曲江3点

### 字段说明

| 列 | 数据库映射 |
|----|-----------|
| 名称 | spatial_points.name |
| 地址 | spatial_points.address |
| 经度/纬度 | GCJ-02 |
| 类别 | metadata.industry |
| 日营业额 | metadata.daily_revenue |
| 面积_㎡ | metadata.floor_area |
| 品牌分 | metadata.brand_score |
| 标签 | metadata.tags |
