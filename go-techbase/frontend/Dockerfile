# 前端镜像(gopherforge web/Dockerfile 模式:node 构建 → nginx 托管 SPA)
FROM node:24-alpine AS builder
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --registry=https://registry.npmmirror.com || npm install --registry=https://registry.npmmirror.com
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /src/dist /usr/share/nginx/html
EXPOSE 80
