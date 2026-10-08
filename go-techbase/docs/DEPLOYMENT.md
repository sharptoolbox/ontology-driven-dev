# OPIC 技术底座 · 编译与部署指南

> 事实源：[go-techbase](https://github.com/opic-ai/ontology-driven-dev/go-techbase) 仓库 `docs/DEPLOYMENT.md`。生产环境 = 192.168.3.200（opic-ai），数据面由 Pigsty 承载。

## 1. 构建矩阵

| 产物 | 命令 | 说明 |
|---|---|---|
| 后端二进制 | `make build` | `bin/techbase` |
| 前端产物 | `cd frontend && npm run build` | `frontend/dist` |
| 本地全套 | `make dev` + `npm run dev` | :9680 / :5173 |
| 生产镜像 | `make deploy-prod`（服务器侧构建） | 见下文 |

## 2. 生产部署（make deploy-prod）

生产部署**一条命令**，流程为"源码上服务器 → 服务器侧 docker build → compose 拉起"：

```bash
make deploy-prod
# 等价于：
# 1) rsync 源码 → root@192.168.3.200:/opt/opic-prod/apps/techbase-src/
# 2) 服务器 docker build（--network host 绕 DNS 脏条目）：techbase + techbase-frontend 两镜像
# 3) 拷贝 compose/configs/CA 到 /opt/opic-prod/apps/techbase/
# 4) compose up -d（Traefik websecure 入口，BASE_DOMAIN=opic-ai.ccoe.tech）
# 5) 健康验证：curl -ks https://techbase.opic-ai.ccoe.tech/health/live
```

部署要点（踩坑沉淀）：
- **构建必须在服务器侧**（`--network host`）：本地构建 arm64 镜像无法在 amd64 主机运行；
- **迁移文件随包走**：`migrations/` 由 rsync 同步，goose 启动自动执行（漏传迁移会卡版本）；
- **凭据不进 git**：`/opt/opic-prod/apps/techbase/.env`（JWT_SECRET 等，chmod 600）首启自动生成；
- 部署是**滚动重建**：无内省内库，前后端镜像同时更新。

## 3. 运行形态与依赖

```
compose 栈（opic-net 网络）
  go-techbase-app       Gin :9680（DB 池 5~20 / metrics 开关 METRICS_ENABLED）
  go-techbase-frontend  nginx（静态 + /api 反代）
入口 Traefik :443         techbase.opic-ai.ccoe.tech
依赖（step1 基础设施栈，先行存在）
  Pigsty opicdb:5433(schema=otechbase) / NATS opic-nats:4222 / Temporal :7233 / Redis / ZITADEL / Casdoor
```

环境变量全集见 `configs/config.yml` 注释（env > yaml > 默认），常用项：

| 变量 | 说明 |
|---|---|
| `CENTER_CODE` | 中心域码（隔离三件套命名根，fork 时必须改） |
| `AUTH_MODE` / `USER_AUTH_MODE` | 管理台 zitadel / 工作台 casdoor（SSO 默认入口） |
| `METRICS_ENABLED` | /metrics 开关（默认 true，经 Pigsty vmetrics 抓取） |

## 4. 迁移与回滚

- **数据库迁移**：goose 自动执行 `migrations/*.sql`（按版本号递增）。新增迁移只追加文件，不改历史文件。
- **应用回滚**：`git checkout <上一 tag> && make deploy-prod`（镜像重建覆盖）。
- **迁移回滚**：goose down 需手写 down 段；生产原则"前向修复"（新增反向迁移）。

## 5. 多中心 fork 部署差异（fork 后 checklist）

新能力中心从本仓库 fork 后必改：
1. `CENTER_CODE=<新域码>` → schema 自动变为 `o<域码>`、NATS 流 `OPIC_<域码>`、主题 `opic.<域码>.>`、Temporal 队列 `<域码>`；
2. ZITADEL/Casdoor 各注册独立 OIDC 应用（中心间 SSO 隔离）；
3. 业务表沿用独立 schema，迁移文件从零版本起。

以上隔离边界可在管理控制台「系统工具 → 隔离信息」页实时查看。

## 6. 常见部署故障

| 现象 | 处置 |
|---|---|
| 404（接口存在却打不到） | 查后端路由是否注册（gin 重复注册会 panic，缺注册 404） |
| 本地构建后服务器跑不起来 | 平台架构不一致——用服务器侧构建 |
| 迁移卡住不执行 | 检查 `migrations/` 是否随 rsync 上传、goose 版本表是否脏 |
| 容器 DNS 解析异常 | compose `extra_hosts` 补域名→host-gateway（宿主 /etc/hosts 有 127.0.0.1 映射） |
