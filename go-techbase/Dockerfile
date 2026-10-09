# go-techbase 后端镜像(gopherforge 通用 Dockerfile 模式:多阶段构建)
FROM golang:1.27-alpine AS builder
ENV GOPROXY=https://goproxy.cn,direct
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/techbase ./cmd/techbase

FROM alpine:3.20
# 无网络运行时:CA 证书与 zoneinfo 直接取自构建器(golang:1.27-alpine),不依赖 apk 在线安装
ENV TZ=Asia/Shanghai ZONEINFO=/usr/local/go/lib/time/zoneinfo.zip
COPY --from=builder /etc/ssl/certs/ /etc/ssl/certs/
COPY --from=builder /usr/local/go/lib/time/zoneinfo.zip /usr/local/go/lib/time/zoneinfo.zip
RUN adduser -D -u 10001 app
WORKDIR /app
COPY --from=builder /out/techbase ./techbase
COPY configs ./configs
COPY models ./models
COPY migrations ./migrations
USER app
EXPOSE 9680
ENTRYPOINT ["/app/techbase"]
