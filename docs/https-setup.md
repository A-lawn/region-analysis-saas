# HTTPS 部署指南

## 前提条件
- 已拥有域名（如 example.com）并完成 DNS 解析
- 服务器已安装 Docker 和 docker-compose
- 80/443 端口已开放

## 步骤

### 1. 停止现有 nginx 容器
```bash
docker compose stop frontend
```

### 2. 使用 certbot 获取 SSL 证书（standalone 模式）
```bash
# 安装 certbot
sudo apt update && sudo apt install certbot -y

# 申请证书（将 example.com 替换为实际域名）
sudo certbot certonly --standalone -d example.com -d www.example.com
```

证书生成路径：/etc/letsencrypt/live/example.com/

### 3. 替换 nginx 配置

将以下内容保存为 nginx/default.conf：

```nginx
server {
    listen 80;
    server_name example.com www.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name example.com www.example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 前端静态文件
    location / {
        root   /usr/share/nginx/html;
        index  index.html;
        try_files $uri $uri/ /index.html;
    }

    # API 反向代理
    location /api/ {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 4. 更新 docker-compose.yml

修改 frontend 服务，挂载证书目录：

```yaml
frontend:
    image: nginx:alpine
    container_name: region-analysis-web
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./public:/usr/share/nginx/html:ro
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - backend
    restart: unless-stopped
```

### 5. 设置证书自动续签

```bash
# 添加 crontab（每月 1 号凌晨 3 点续签）
echo "0 3 1 * * certbot renew --quiet --pre-hook 'docker compose -f /path/to/docker-compose.yml stop frontend' --post-hook 'docker compose -f /path/to/docker-compose.yml start frontend'" | sudo crontab -
```

### 6. 更新环境变量

```bash
# 修改 .env 中的 APP_URL
APP_URL=https://example.com
```

### 7. 重启服务

```bash
docker compose up -d
```

### 8. 验证

```bash
# 检查 HTTPS 是否生效
curl -I https://example.com

# 在线 SSL 检测
# 访问 https://www.ssllabs.com/ssltest/analyze.html?d=example.com
```
