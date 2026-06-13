# Sprint 4 补充: 日志与脱敏改造 (新增2人天)

## 日志审计发现
- console.* 15处未迁移到logger (9个文件)
- emailService 邮箱明文输出到日志 (2处)
- errorHandler 开发环境泄露堆栈给客户端
- 无日志持久化 (仅stdout, 容器重启丢失)
- 无请求追踪 (requestId缺失)

## 新增任务 (Sprint 4内)

### 任务1: console.* -> logger迁移 (0.5天)
文件: apiV1Controller/webController/poiCollector/auth/errorHandler/
      competitionService/geocodingService/spatialAnalysis/voronoiService
15处全部替换, 新增标签前缀统一格式

### 任务2: 日志脱敏实现 (0.5天)
新增: backend/src/utils/logRedactor.ts
脱敏字段: password/hash/secret/token/apiKey/otp/captcha/cookie/authorization
脱敏模式: email(***@***.***) phone(138****1234)
集成到pino序列化器 + emailService去敏

### 任务3: 日志持久化 (0.3天)
安装pino-roll, pino双流输出
logs/app.log (info+, 30天轮转) + logs/error.log (error+, 90天轮转)
Dockerfile创建logs/目录, docker-compose挂载volume

### 任务4: 请求追踪中间件 (0.4天)
新增: backend/src/middleware/requestContext.ts
注入requestId + tenantId + startTime, 使用AsyncLocalStorage
响应时记录: method/url/statusCode/durationMs/requestId/tenantId

### 任务5: 启动日志标准化 (0.2天)
index.ts启动输出: nodeEnv/port/nodeVersion/pid/DBhost/DBport/RedisHost
禁止输出: password/secret/apiKey/连接字符串

### 任务6: Docker日志配置 (0.1天)
docker-compose.yml: json-file driver, max-size:50m, max-file:10

---
Sprint 4 人天更新: 11.0 + 2.0 = 13.0天
总人天: 50.0 + 2.0 = 52.0天
