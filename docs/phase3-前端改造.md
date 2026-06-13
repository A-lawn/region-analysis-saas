# Phase 3 详细内容：前端改造 + 集成

## M4.5 用户上传字段扩展

### 前端 ColumnMapper.vue
字段: 名称/地址/经度*/纬度*/类别/营业额/门店面积/月租金/品牌/开业日期/来源标记/员工数
可选字段默认折叠("更多字段"展开)

### 前端 columnDetector.ts 5个新模式组
AREA_PATTERNS:   面积|经营面积|建筑面积|area|sqm
RENT_PATTERNS:   租金|月租|房租|rent|lease
BRAND_PATTERNS:  品牌|加盟|brand|franchise
OPENED_AT_PATTERNS: 开业|开业日期|opened|since
SOURCE_PATTERNS: 来源|source|归属|属性

### UploadView 数据来源选择
自有门店数据 | 竞品调查数据 | 混合数据(由来源标记列区分)

### 其他前端改动
SiteOptimizationPanel行业下拉: onMounted调用GET /api/web/industries
ApiKeysView: axios -> apiClient修复401
App.vue: 导航栏加API Key入口
选址面板KPI蜘蛛图UI(替代4条柱状图)
决策建议面板结构化展示

## 新增解析字段 -> metadata
areaCol       -> metadata.areaSqm
rentCol       -> metadata.monthlyRent  
brandCol      -> metadata.brand
openedAtCol   -> metadata.openedAt
sourceCol     -> spatial_points.source
