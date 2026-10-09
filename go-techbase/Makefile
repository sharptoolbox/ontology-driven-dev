# go-techbase —— gopherforge 工程模式 Makefile
SHELL := /bin/bash

DSN ?= postgres://postgres:postgres@localhost:5432/go_techbase?sslmode=disable
GOOSE := go run github.com/pressly/goose/v3/cmd/goose

.PHONY: setup dev build test lint clean frontend-install frontend-build \
        migrate-up migrate-status migrate-down migrate-create \
        compose-up compose-down compose-logs docker-build

setup: ## 初始化:下载依赖 + 复制 .env
	go mod download
	@test -f .env || cp .env.example .env
	@echo "setup 完成"

dev: ## 本地启动后端(:9680,自动 goose 迁移 + 种子)
	go run ./cmd/techbase

dev-frontend: ## 本地启动前端(:5173,proxy → 9680)
	cd frontend && npm run dev

build: ## 编译后端二进制
	go build -o bin/techbase ./cmd/techbase

test: ## 单元测试
	go test ./...

lint: ## go vet
	go vet ./...

frontend-install: ## 安装前端依赖
	cd frontend && npm install

frontend-build: ## 构建前端产物(frontend/dist)
	cd frontend && npm run build

migrate-up: ## goose 迁移 Up(DSN 变量可覆盖)
	$(GOOSE) -dir migrations postgres "$(DSN)" up

migrate-status: ## goose 迁移状态
	$(GOOSE) -dir migrations postgres "$(DSN)" status

migrate-down: ## goose 回滚最近一笔
	$(GOOSE) -dir migrations postgres "$(DSN)" down

migrate-create: ## goose 新建迁移(make migrate-create MIGRATION_NAME=add_xxx)
	$(GOOSE) -dir migrations create $(MIGRATION_NAME) sql

compose-up: ## 拉起数据栈 + 应用栈(含网关/前端)
	docker compose -f docker-compose.infra.yml -p go-techbase-infra up -d --wait
	docker compose -p go-techbase up -d --build

compose-down: ## 停止应用栈与数据栈
	docker compose -p go-techbase down
	docker compose -f docker-compose.infra.yml -p go-techbase-infra down

compose-logs: ## 跟踪应用栈日志
	docker compose -p go-techbase logs -f

docker-build: ## 构建后端镜像
	docker build -t go-techbase:latest .

clean: ## 清理构建产物
	rm -rf bin frontend/dist frontend/node_modules log

# ── step1 基础设施集成（Harbor 镜像仓 + 生产部署）─────────────────────────────
HARBOR_REGISTRY ?= 192.168.3.200:18700
HARBOR_PROJECT  ?= opic
PROD_HOST       ?= root@192.168.3.200
PROD_DIR        ?= /opt/opic-prod/apps/techbase
BASE_DOMAIN     ?= opic-ai.ccoe.tech

harbor-build: ## 构建并打 Harbor 镜像 tag（后端+前端）
	docker build -t $(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/techbase:latest .
	docker build -t $(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/techbase-frontend:latest ./frontend

# ⚠ harbor push 前需 docker daemon insecure-registries 含 $(HARBOR_REGISTRY)（变更窗口重启 daemon）
harbor-push: harbor-build ## 推送镜像到 Harbor
	docker push $(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/techbase:latest
	docker push $(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/techbase-frontend:latest

deploy-prod: ## 同步源码到生产构建并拉起（实测流程：服务器 build 需 --network host 绕 DNS 脏条目）
	ssh $(PROD_HOST) "mkdir -p $(PROD_DIR)-src $(PROD_DIR)"
	rsync -a --delete --exclude '.git' --exclude 'node_modules' --exclude 'frontend/dist' --exclude 'log' ./ $(PROD_HOST):$(PROD_DIR)-src/
	rsync -a --delete $(PROD_HOST):$(PROD_DIR)-src/configs/ /dev/null 2>/dev/null || true
	ssh $(PROD_HOST) "cd $(PROD_DIR)-src && docker build --network host -t $(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/techbase:latest . && \
		docker build --network host -t $(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/techbase-frontend:latest ./frontend && \
		cp -a docker-compose.yml configs $(PROD_DIR)/ 2>/dev/null; cp -a configs $(PROD_DIR)/ && \
		cp -f /opt/opic-prod/certs/ca.crt $(PROD_DIR)/ca.crt && chmod 644 $(PROD_DIR)/ca.crt && \
		test -f $(PROD_DIR)/.env || (printf 'JWT_SECRET=%s\nEVENTBUS_PASSWORD=%s\n' \"\$$(openssl rand -hex 32)\" \"\$$(grep '^NATS_PASSWORD=' /opt/opic-prod/.env | cut -d= -f2)\" > $(PROD_DIR)/.env && chmod 600 $(PROD_DIR)/.env) && \
		cd $(PROD_DIR) && set -a && source .env && set +a && set -a && source /opt/opic-prod/.env && set +a && \
		BASE_DOMAIN=$(BASE_DOMAIN) TRAEFIK_ENTRYPOINT=websecure docker compose up -d && docker compose ps"
	@echo "验证: curl -ks https://techbase.$(BASE_DOMAIN)/health/live"

deploy-prod-down: ## 停止生产 techbase 栈
	ssh $(PROD_HOST) "cd $(PROD_DIR) && docker compose down"
