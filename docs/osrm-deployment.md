# OSRM 路由引擎部署指南

OSRM (Open Source Routing Machine) 是可选的路线规划后端，用于计算真实路网距离而非直线距离。

## v1.0 降级策略

v1.0 默认**不依赖 OSRM**。若未部署 OSRM，所有路线相关计算自动降级为 **Haversine 直线距离**。
这对覆盖分析和聚类分析的结果影响较小（误差通常 < 30%），不影响核心功能。

## 部署步骤（可选 v1.1+）

### 1. 下载地图数据

从 [Geofabrik](https://download.geofabrik.de/) 下载对应区域的 `.osm.pbf` 文件。

中国全境：
```
wget https://download.geofabrik.de/asia/china-latest.osm.pbf
```

### 2. 提取并预处理数据

```bash
docker run -t -v "$(pwd):/data" osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/china-latest.osm.pbf

docker run -t -v "$(pwd):/data" osrm/osrm-backend \
  osrm-partition /data/china-latest.osrm

docker run -t -v "$(pwd):/data" osrm/osrm-backend \
  osrm-customize /data/china-latest.osrm
```

### 3. 启动 OSRM 服务

```bash
docker run -t -i -p 5000:5000 -v "$(pwd):/data" osrm/osrm-backend \
  osrm-routed --algorithm mld /data/china-latest.osrm
```

### 4. 配置环境变量

在 `.env` 中添加：
```
OSRM_BASE_URL=http://localhost:5000
```

添加后，`routingService.ts` 将自动检测并使用 OSRM 服务。

## 资源需求

- 磁盘：中国全境约 2-3GB
- 内存：建议 4GB+
- CPU：预处理约 30 分钟（中国全境）