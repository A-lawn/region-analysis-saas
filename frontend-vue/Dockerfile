# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Build-time env vars (Vite requires VITE_ prefix)
ARG VITE_AMAP_WEB_KEY
ARG VITE_AMAP_SECRET
ENV VITE_AMAP_WEB_KEY=${VITE_AMAP_WEB_KEY}
ENV VITE_AMAP_SECRET=${VITE_AMAP_SECRET}

RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
