# 12行业 x 55KPI 完整规格表

## 归一化函数类型
linearUp(v,max):      Math.min(v/max,1.0)
linearDown(v,max):    Math.max(0,1-v/max)
sweetSpot(v,min,peak,max):  倒U型(0->0.5->1.0->0)
clusterU(v,low,best,high):  正U型(0->0.3->1.0->0.1)
hardFilter(v,threshold,direction): 不满足->null(过滤)
step(v,[[t,score],...]):  阶梯型

## 数据源代号
POI_RES = poi_density WHERE category='residential'
POI_OFF = poi_density WHERE category='office'
POI_TRN = poi_density WHERE category='transport'
POI_COM = poi_density WHERE category='commercial'
POI_MED = poi_density WHERE category='medical'
POI_ALL = poi_density(不限类别)
POI_PKG = poi_density WHERE category='parking'
POI_IND = poi_density WHERE category='industrial'
COMP = spatial_points WHERE source='competitor'
OWN  = spatial_points WHERE source='owner'
DIST_MIN = MIN(ST_Distance) FROM spatial_points

---

## 1. 便利店 (convenience) 半径300m
walkableRatio          0.40 linearUp    POI_RES ring1  max=中位数
competitorAvoidance    0.25 linearDown  COMP 300m       max=3
poiDensity             0.20 linearUp    POI_ALL ring1   max=中位数
rentFactor             0.15 linearDown  POI_COM ring1   max=中位数x2
footTraffic            加入  linearUp    POI_TRN ring1   max=10

## 2. 茶饮/咖啡 (beverage) 半径400m
footTraffic            0.30 linearUp    POI_TRN+COM ring1 max=30
competitionSweetSpot   0.25 sweetSpot   COMP 200m       min=0 peak=2 max=6
deliveryCoverage       0.25 linearUp    POI_RES ring2   max=最高值
visibility             0.20 linearUp    POI_COM ring0   max=50

## 3. 餐饮 (restaurant) 半径500m
footTraffic            0.30 linearUp    四源加权(TRN*2+OFF*1.5+COM*1+RES*0.5) max=50
visibility             0.20 linearUp    POI_COM ring0   max=30
competitionSweetSpot   0.25 sweetSpot   COMP 500m       min=1 peak=3 max=8
deliveryCoverage       0.25 linearUp    POI_RES ring3   max=最高值
dineInRadius           并入  linearUp    POI_RES ring1

## 4. 药店 (pharmacy) 半径800m
[硬约束] competitorDistanceHard 前置 hardFilter COMP_DIST_MIN 350m lt过滤
populationStructure    0.30 linearUp    POI_RES+MED ring1  max=最高(老龄化proxy)
medicalCoverage        0.25 linearUp    POI_MED ring2   max=城市中位数
competitorDistanceSafe 0.20 linearUp    过滤后竞品距离  max=800
transportConvenience   0.15 linearUp    POI_TRN ring1   max=5
policyCompliance       0.10 step        学校/幼儿园距离 [(200,1)(100,0.7)(0,0.3)]

## 5. 生鲜超市 (fresh_grocery) 半径800m
populationDensity      0.30 linearUp    POI_RES ring1   max=城市P90
competitorDistance     0.25 linearUp    COMP_DIST_MIN   max=1000
communityMaturity      0.20 linearUp    POI_ALL ring1   max=项目P90
rentFactor             0.15 linearDown  POI_COM ring1   max=城市P90
barrierBonus           0.10 step        OSM道路/河流    有天然屏障:1.0 无:0.5

## 6. 商超 (supermarket) 半径3000m
populationDensity      0.30 linearUp    多环累积ring1*1+ring2*0.7+ring3*0.4+ring4*0.2 max=城市P95
trafficAccessibility   0.25 linearUp    POI_TRN ring1+OSM主干道 max=10
competitorDistance     0.20 linearUp    COMP_DIST_MIN   max=1000
parkingAvailability    0.15 linearUp    POI_PKG ring1   max=城市P90
rentLevel              0.10 step        POI_COM ring1   低密度:1.0 中:0.7 高:0.3

## 7. 酒店 (hotel) 半径2000m
trafficAccessibility   0.28 linearUp    POI_TRN ring2+铁路航空 max=15
commercialDensity      0.22 linearUp    POI_COM+OFF ring2 max=城市P90
hotelCluster           0.25 clusterU    COMP 2000m      low=2 best=6 high=15
brandProtection        0.15 linearUp    同品牌距离      max=3000
roadFrontageBonus      0.10 二元        主干道50m判断   是:1.0 否:0.3

## 8. 医美/口腔 (medical_aesthetics) 半径3000m
highIncomeDensity      0.30 linearUp    POI_OFF+高租金RES ring2 max=城市P95
beautyCluster          0.25 clusterU    COMP 3000m      low=1 best=5 high=12
commercialDensity      0.20 linearUp    POI_COM ring2   max=城市P90
parkingAvailability    0.15 linearUp    POI_PKG ring1   max=10
visibility             0.10 linearUp    POI_COM ring0   max=30

## 9. 教育培训 (education) 半径1500m
familyDensity          0.30 linearUp    POI_RES+学校 ring1 max=城市P90
competitorDistance     0.25 linearUp    COMP_DIST_MIN   max=1000
schoolProximity        0.20 linearDown  最近小学/幼儿园  max=500
commercialDensity      0.15 linearUp    POI_COM ring1   max=项目P90
transportConvenience   0.10 linearUp    POI_TRN ring1   max=5

## 10. 宠物服务 (pet_service) 半径2000m
residentialDensity     0.32 linearUp    POI_RES ring1   max=城市P90
competitorDistance     0.28 linearUp    COMP_DIST_MIN   max=2000
communityMaturity      0.22 linearUp    POI_ALL ring1   max=项目P90
walkableRatio          0.18 linearUp    POI_RES ring0   max=中位数

## 11. 汽车4S店 (auto4s) 半径10000m
roadFrontage           0.25 step        OSM道路等级     临primary:1 <100m:0.7 <300m:0.3 >300m:0
landAvailability       0.25 step        OSM土地利用     industrial:1 commercial:1 residential:0.3
autoCluster            0.20 clusterU    COMP 3000m      low=1 best=5 high=10 (正向)
carOwnershipDensity    0.20 linearUp    城市级别常数    max=城市最高值
zoningCompliance       0.10 step        OSM土地利用     commercial:1 industrial:0.7 其他:0.2

## 12. 物流/快递驿站 (logistics) 半径500m
residentialDensity     0.35 linearUp    POI_RES ring1   max=城市P95
competitorDistance     0.30 linearUp    COMP_DIST_MIN   max=500
streetAccess           0.20 二元        主干道距离      <=50m:1.0 else:0.3
commercialDensity      0.15 linearUp    POI_COM ring1   max=项目P90

---
汇总: 12行业 / 55个KPI
归一化类型分布: linearUp:32 linearDown:3 sweetSpot:2 clusterU:3 hardFilter:1 step:5 二元:2
