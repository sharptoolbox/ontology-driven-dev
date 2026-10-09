# OPIC 技术底座 · 新人培训入门

> 事实源：[go-techbase](https://github.com/opic-ai/ontology-driven-dev/go-techbase) 仓库 `docs/ONBOARDING.md`。读完本文，你应当能本地跑起底座、理解代码结构、并按规范提交第一个 PR。

## 1. 这是什么

OPIC 技术底座（go-techbase）是 OPIC 智能算力平台的**第一能力中心**，同时是其余 22 个能力中心的**工程模板**（新中心从本仓库 fork）。单体 Gin 后端 + React 19 双界面（用户工作台 / 管理控制台），技术栈对齐 [gopherforge](https://github.com/SuperiorChuo/gopherforge)。

一句话架构：

```
浏览器 ── Traefik(https, *.opic-ai.ccoe.tech) ── 前端容器(nginx)
        └─ /api /health /metrics ── techbase 容器(Gin :9680)
              ├─ PostgreSQL(Pigsty opicdb, schema otechbase)
              ├─ NATS JetStream(OPIC_TECHBASE / opic.techbase.>)
              ├─ Temporal(opic ns / techbase 队列)
              └─ Redis(可选, 会话吊销)
身份: 管理台 ZITADEL SSO / 工作台 Casdoor SSO / 本地账号
```

## 2. 环境准备（Mac/Linux）

| 工具 | 版本 | 用途 |
|---|---|---|
| Go | ≥ 1.23 | 后端 |
| Node.js | ≥ 20 | 前端 |
| Docker | 最近版 | 容器构建/依赖栈 |
| PostgreSQL 客户端 psql | 16 | 数据库操作 |

## 3. 本地首次启动（10 分钟）

```bash
git clone https://github.com/opic-ai/ontology-driven-dev/go-techbase.git && cd go-techbase
go mod download && (cd frontend && npm install)
cp configs/config.yml configs/config.local.yml   # 按需改数据库指向

make dev          # 后端 :9680（或 go run ./cmd/techbase）
cd frontend && npm run dev   # 前端 :5173，代理 /api → localhost:9680
```

默认账号：`admin / admin123`（本地登录入口，带图形验证码）。登录后：工作台办客户申请，管理控制台管用户/角色/流程/模型。

## 4. 代码结构（gopherforge 布局）

```
cmd/techbase/       组合根：配置→日志→PG(goose)→种子→Gin→优雅退出
configs/            config.yml（env > yaml > 默认）
internal/
  api/              routes.go 公开组+登录组+admin 组；auth/business/flow/adminconsole 控制器
  service/          业务逻辑（事务边界在此层）
  store/            gorm 封装（List/One/Count/Exec）
  middleware/       登录鉴权 / 权限 / 操作审计
  config/ infra/    配置与基础设施接线（事件总线/Temporal worker）
pkg/                可复用件：metrics/llmcfg/temporalflow/errcode/eventbus/workflowx/…
migrations/         goose SQL 迁移（禁止 AutoMigrate，改表结构只走这里）
frontend/           React19 + antd（src/pages 用户侧 / src/admin 控制台侧）
deploy 产线镜像     Dockerfile（多阶段）+ docker-compose.yml
```

三条铁律：
1. **改表结构只写 `migrations/`**（goose SQL，带 `-- +goose Up`），禁止 AutoMigrate；
2. **错误码不得自造**，统一 `pkg/errcode` 注册（格式 `[3位大写字母][4位数字]`，AMC 统一管理）；
3. **响应一律 OPIC 信封** `{"returnInfo":{"returnCode":"SUC0000"},"data":...}`（用 `common.OKJSON/FailJSON`）。

## 5. 开发流程（TDD + Conventional Commits）

1. 从 `main` 拉分支（`feat/xxx`），先写测试再实现（`go test ./...`）；
2. 提交信息：`feat|fix|refactor|docs|test|chore|perf|ci: 中文摘要`；
3. 自测清单：`make build test lint` + 前端 `npx tsc --noEmit`；
4. 合回 `main`（唯一活跃分支 = 发布基准；发布时打 `vX.Y.Z` tag）。

## 6. 关键业务入口（拿来熟悉代码）

| 功能 | 后端 | 前端 |
|---|---|---|
| 登录/SSO/验证码 | `internal/api/auth/` | `src/pages/login/` |
| 客户申请（示例业务） | `internal/api/business/customer.go` | `src/pages/customer/` |
| Temporal 流程设计器 | `internal/api/adminconsole/temporalflow.go` + `pkg/temporalflow/` | `src/pages/flow/TemporalFlowDesigner.tsx` |
| AI 助理（多模型） | `internal/api/business/assistant.go` + `pkg/llmcfg/` | `src/components/AIAssistantPanel.tsx`、`AIChatWorkspace.tsx` |
| 隔离信息/监控 | `internal/api/adminconsole/isolation.go`、`pkg/metrics/` | `src/admin/ai/IsolationInfo.tsx` |

## 7. 下一步阅读

- 编译与部署 → [部署指南](/docs/techbase/deployment)
- 日常运维/监控/备份 → [运维手册](/docs/techbase/operations)
- 踩坑速查 → [FAQ](/docs/techbase/faq)
