# go-techbase —— OPIC 技术底座(gopherforge 技术栈)

OPIC 开放智能算力平台的 **Go 技术底座**:《系统管理 + 流程引擎需求规格说明书》的可运行技术空框架,
含客户申请/客户查询两个示例功能(暂存→提交→客户经理审批→部门总经理审批的严格串行审批流)。

> **本目录是 ontology-driven-dev 技能的 Go 版技术底座**，与根目录 [`techbase/`](../techbase/)（Python 3.10 + Flask + SQLite 版）配套：同一套《系统管理 + 流程引擎需求规格说明书》与本体七模型语义，两种技术栈实现，按项目技术选型择一复制使用。
>
> ```bash
> cp -r <技能根目录>/go-techbase/. <当前项目>/code-app/
> ```
>
> | | techbase/（Python 版） | go-techbase/（Go 版，本目录） |
> |---|---|---|
> | 后端 | Python 3.10 + Flask，sqlite3 直连 | Go 1.27 + Gin，PostgreSQL 16（GORM 仅连接池，原生 SQL） |
> | 建表 | 启动时建表 | goose 迁移（`migrations/`，可回滚） |
> | 认证 | PyJWT 装饰器 | ZITADEL OIDC(PKCE) + 本地模式回退（图形验证码） |
> | 前端 | React 18 + TS + Vite | React 19 + Ant Design 6 + Redux Toolkit + Vite |
> | 缓存/可观测 | — | Redis 8（可选）+ /health 系列 + Prometheus 文本指标 |
> | 部署 | 单 compose | 数据栈/应用栈分离 + Traefik v3 label 路由 |
>
> v3 重构说明:技术栈基准由 hertz-admin(CloudWeGo Hertz)迁移至
> [gopherforge](https://github.com/SuperiorChuo/gopherforge)(MIT)的工程模式 —— **Gin 微服务脚手架栈**;
> 业务功能、API 契约、OPIC 统一错误码与本体七模型语义 **100% 保留**(见文末"重构映射与行为变更")。

## 0. 文档导航

| 文档 | 内容 |
|---|---|
| [新人培训入门](docs/ONBOARDING.md) | 背景/架构/环境/首次启动/开发流程 |
| [编译与部署指南](docs/DEPLOYMENT.md) | 构建、生产部署、迁移回滚、fork checklist |
| [运维手册](docs/OPERATIONS.md) | 健康检查/监控告警/日志/备份/凭据/故障速查 |
| [FAQ](docs/FAQ.md) | 18 条实战踩坑速查（SSO/SQL/部署/前端/AI） |


## 1. 技术选型(gopherforge 栈对齐)

| 层 | 选型 | 说明 |
|---|---|---|
| 后端框架 | **Gin**(gopherforge 同款,gin-gonic/gin v1.12) | 组合根 `cmd/techbase/main.go`;中间件链 metrics → recovery → CORS → 访问日志 → 路由 |
| 数据库 | **PostgreSQL 16**(OPIC-数据服务域集成 [Pigsty](https://pigsty.io) 部署) | GORM 仅承担连接池与事务,数据访问为原生 SQL + map 行(功能语义不变) |
| 迁移 | **goose**(gopherforge 同款) | `migrations/000NNN_*.sql`(`-- +goose Up/Down`),启动自动 Up,`make migrate-*` 手工管理 |
| 缓存/吊销 | **Redis 8**(go-redis v9,可选) | 登出令牌 jti 黑名单(`pkg/token`);未启用时静默降级为旧行为 |
| 认证 | **ZITADEL**(OPIC-零信任安全中心集成,保持不变) | OIDC Authorization Code + PKCE;JWKS(RS256)验签;角色声明映射 + 自动 provisioning;`mode=local` 保留本地回退 |
| 错误码 | **OPIC O-ARC 统一错误码**(保持不变) | 7 位 `[3 位前缀][4 位数字]`,成功码 `SUC0000`,响应 `{"returnInfo":{"returnCode","errorMsg"},"data":...}` |
| 日志 | **zap + lumberjack**(gopherforge 同款) | console + 可选文件双写轮转(`log.output: file`) |
| 可观测性 | **/health 系列 + /metrics**(gopherforge 同款) | `/health`、`/health/live`、`/health/ready`、`/health/check`;零依赖手写 Prometheus 文本指标 `opic_techbase_*` |
| 网关 | **Traefik v3**(gopherforge 同款,label 路由) | `/api`、`/health`、`/metrics` → 后端,`/` → 前端 |
| 部署 | **Docker Compose 数据栈/应用栈分离**(gopherforge 模式) | `docker-compose.infra.yml`(PG+Redis)/ `docker-compose.yml`(应用+前端+网关);12-factor 环境变量覆盖 |
| 前端 | **React 19 + Ant Design 6 + Redux Toolkit + React Router 7 + Axios + Vite**(gopherforge 栈) | 全部页面重建;流程设计器用 @xyflow/react v12;`request.ts` 沿用 returnInfo 解包与 `cp_token` 存储 |

## 2. 目录结构(gopherforge 工程布局)

```
go-techbase/
├── cmd/techbase/main.go          # 组合根:配置→日志→PG(goose)→种子→Redis→Gin→优雅退出
├── configs/config.yml            # 配置(env > yaml > 默认)
├── internal/
│   ├── api/                      # 路由与控制器(gin)
│   │   ├── routes.go             # /api 路由(公开组+登录组+权限中间件,与旧版逐条一致)
│   │   ├── common/               # returnInfo 响应助手/分页/路径参数
│   │   ├── auth/                 # 登录/登出/信息 + ZITADEL/Casdoor OIDC 回调与 provisioning + 图形验证码(本地登录前置)
│   │   ├── meta/                 # 字典/客户状态/M3 规则
│   │   ├── business/             # 客户申请 + 审批中心
│   │   ├── flow/                 # 流程定义/实例/任务
│   │   └── system/               # 用户/角色/权限/资源
│   ├── config/                   # 配置装配(含 env 覆盖)
│   ├── middleware/               # 认证(双令牌)/权限/CORS/访问日志
│   ├── service/                  # 业务服务(auth/user/rbac/flow/workbench/customer/seed)
│   │   └── engine/               # 轻量工作流引擎(start/approve/reject/return,语义不变)
│   ├── store/                    # GORM PG16 连接 + 原生 SQL 数据访问 + goose 迁移
│   └── pkg/                      # auth(ZITADEL)/ontology(七模型注册表)/expr(表达式)
├── pkg/                          # 共享库(gopherforge shared/pkg 模式)
│   ├── errcode/                  # OPIC 统一错误码(不变)
│   ├── logger/                   # zap 日志
│   ├── redisx/                   # Redis 客户端(可选)
│   ├── token/                    # JWT 吊销黑名单(Redis)
│   ├── metrics/                  # Prometheus 文本指标
│   ├── health/                   # 健康检查
│   └── graceful/                 # 优雅退出
├── migrations/000001_init_techbase.sql   # goose 迁移(13 表,与旧 schema.sql 同构)
├── models/                       # 七模型 YAML(M1/M2/M5/M6/MU,不变)
├── frontend/                     # React 19 + antd 6 + RTK(全部页面重建)
├── docker-compose.infra.yml      # 数据栈:postgres:16 + redis:8
├── docker-compose.yml            # 应用栈:techbase + frontend(nginx)+ traefik 网关
├── Dockerfile / frontend/Dockerfile
├── Makefile / .env.example / .golangci.yml / .editorconfig
```

## 3. 快速开始

前置:Go 1.27+;一个 PostgreSQL 16 实例(生产经 OPIC-DBS/Pigsty 供给;本机可用任意 PG;或直接用 compose)。

```bash
# 1) 建库(示例)
createdb go_techbase

# 2) 改 configs/config.yml 的 database 段(或用环境变量 DB_*;整串可用 GO_TECHBASE_DSN)

# 3) 启动(自动 goose 迁移 + 种子,幂等)
make dev          # 或 go run ./cmd/techbase → http://localhost:9680

# 4) 前端(开发模式)
make frontend-install && make dev-frontend   # http://localhost:5173,proxy → 9680
```

默认账号(local 模式):`admin/admin123`(超管)、`sales/123456`、`cmanager/123456`、`gm/123456`。

### 一键全栈(compose)

```bash
cp .env.example .env      # 按需修改
make compose-up           # 数据栈(--wait)→ 应用栈:网关 :8000 / 后端调试口 127.0.0.1:9680
make compose-down
```

### 冒烟自测

```
sales 登录 → 建草稿 → 提交(启动 FLOW-CUSTOMER-APPROVAL,状态「待客户经理审批」)
→ cmanager 待办通过 → gm 待办通过 → 客户状态「已通过」(flow_instance APPROVED,flow_history 完整)
```

## 4. 配置(环境变量 > config.yml)

| 环境变量 | 说明 | 默认 |
|---|---|---|
| `GO_TECHBASE_DSN` | 整串 DSN 覆盖 database 段 | - |
| `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME/DB_SSLMODE` | 分项覆盖 | config.yml |
| `APP_PORT` | HTTP 端口 | 9680 |
| `JWT_SECRET` | HS256 密钥 | go-techbase-dev-secret |
| `AUTH_MODE` | local / zitadel | local |
| `ZITADEL_ISSUER/ZITADEL_CLIENT_ID/ZITADEL_CLIENT_SECRET/ZITADEL_REDIRECT_URL` | ZITADEL OIDC 参数 | config.yml |
| `REDIS_ENABLED/REDIS_HOST/REDIS_PORT/REDIS_PASSWORD` | Redis(登出吊销黑名单) | disabled |
| `METRICS_ENABLED` | /metrics 与采集中间件 | true |
| `LOG_LEVEL` | 日志级别 | info |

## 5. ZITADEL 接入(mode=zitadel,不变)

1. 零信任中心 docker-compose 起 ZITADEL(未修改容器,Login UI 由其托管);
2. 在 ZITADEL 建项目/应用(Web OIDC),`redirect_uri` 填 `http://<host>:9680/api/auth/callback`;
3. `configs/config.yml`:`auth.mode: zitadel`,填 `issuer/client_id/client_secret/redirect_url`(或 env `ZITADEL_*`);
4. 浏览器访问 `GET /api/auth/login-url` 取授权地址跳转;回调后服务端换 token、读 userinfo、
   按角色声明(默认 `roles`)映射本地角色并自动建用户,随后签发底座会话令牌;
5. 中间件同时接受 ZITADEL 原生 access token(服务间调用),口径与零信任设计一致。

## 6. 重构映射与行为变更(v2 hertz-admin → v3 gopherforge 栈)

### 保留(功能基线 100% 不变)

- 57 个 API 的路径、方法、权限码、请求/响应字段与分页契约;统一 returnInfo 响应与 17 个 SYS 错误码;
- 认证:local HS256 会话(bcrypt)、ZITADEL OIDC+PKCE、双令牌中间件、角色沿父级聚合、`*` 超管位;
- 业务:客户申请状态机、轻量工作流引擎(start/approve/reject/return、网关 rule_ref/outcome/condition/default)、
  工作台归属口径、种子数据(4 角色/26 权限/16 资源/4 用户/流程定义导入)、本体注册表与表达式求值器。

### 变更(新增能力,均向后兼容)

| 项 | 旧(v2) | 新(v3) |
|---|---|---|
| Web 框架 | CloudWeGo Hertz | **Gin**(gopherforge 基准) |
| DDL | 启动整文件执行 schema.sql | **goose** 序号迁移(`000001_init_techbase.sql`),启动自动 Up + `make migrate-*` |
| 入口 | (缺失,仓库不可编译) | **补建 `cmd/techbase/main.go` 组合根** |
| 日志 | stdout printf | **zap** console+文件双写轮转 |
| 健康检查 | 无 | `/health` `/health/live` `/health/ready` `/health/check` |
| 指标 | 无 | `/metrics`(Prometheus 文本,`opic_techbase_*`) |
| 优雅退出 | 无 | SIGINT/SIGTERM LIFO 钩子(http/redis) |
| Redis | 无 | 可选:登出令牌 jti 吊销黑名单(未启用=旧行为) |
| 配置 | 仅 yaml | env 覆盖(12-factor,见上表) |
| 部署 | 无 | compose 双栈 + Traefik 网关 + 前后端 Dockerfile |
| 前端 | React 18 + 手写 CSS + Context | **React 19 + antd 6 + Redux Toolkit + axios + @xyflow/react 12**(页面与交互语义一致) |

### 修复(重构中发现并修正)

1. **重置密码契约**:旧前端发 `{password}` 而后端读 `new_password`,UI 必报 SYS1001;
   重建后的前端已按后端契约发送 `{new_password}`。
2. **任务转办下拉**:旧前端误用角色接口 `/users/options` 充当被转办人列表;
   重建后的前端改用 `/users` 用户列表。
3. 流程定义列表 `status=2` 的死分支(后端只会写 0/1)在前端不再展示。

### 上游引用声明

- gopherforge(MIT)作为**工程模式与技术选型基准**参考,未复制其源码;许可证与上游信息见
  `~/github/gopherforge`(本机克隆,未做任何修订)。
- 前端**管理控制台的视觉设计体系**(液态玻璃主题/玻璃登录页/Dashboard 样式)移植自
  gopherforge 前端([MIT License](https://github.com/SuperiorChuo/gopherforge)),已按本项目
  品牌与接口适配,移植文件头部均保留来源注释;用户工作台界面为本项目原有实现。

## 管理控制台基准差距（对照 gopherforge dashboard）

已落地：仪表盘｜系统管理(用户/角色/权限/资源≈菜单)｜日志审计(操作/登录/审计/在线用户)｜消息中心(公告管理)｜系统工具(错误码登记表/系统监控)｜审批中心(待办/我发起/流程定义)｜业务管理(v1 融合：客户管理)。

暂缓项（基准超集，需对应后端服务先行，记录为后续迭代）：部门管理/岗位管理/租户管理/租户套餐/系统设置/短信管理/代码生成/OAuth2 应用/Webhook 订阅/文件管理/定时任务/告警规则/Redis·MySQL 独立监控页。

---

## 九、step1 基础设施集成（2026-10-02 重构）

脚手架深度接入 opic-ai 生产环境（192.168.3.200，`*.opic-ai.ccoe.tech`，见 opic-deploy 仓与 118 号生产方案）：

| 基础设施 | 集成点 | 生产入口 |
|---|---|---|
| PostgreSQL（Pigsty） | `internal/store`（GORM 连接 + goose 迁移）；`database.schema` 落中心专属 schema（OPIC-DB-SCHEMA-01） | haproxy `:5433`(rw)/`:5434`(ro)，库 `opicdb` |
| Redis | `pkg/redisx`（登出令牌吊销黑名单） | opic-net 内 `opic-redis:6379`（宿主回环 26379） |
| NATS（事件总线） | **`pkg/eventbus`**：`driver=inproc`（默认，零依赖）/`driver=nats`（JetStream at-least-once）；主题域约定 `opic.<域码>.<...>` | opic-net 内 `opic-nats:4222`（宿主 14222），stream `OPIC`（`opic.>` 捕获） |
| Temporal（工作流） | **`pkg/workflowx`**：`driver=local`（默认）/`driver=temporal`（含 `NewWorkerWorker` worker 路由）；业务命名空间 `opic` | opic-net 内 `temporal:7233` |
| ZITADEL（零信任） | `internal/api/auth/zitadel.go`（OIDC+PKCE，JWKS 验签，角色声明映射） | `https://auth.opic-ai.ccoe.tech` |
| Harbor（镜像仓） | `make harbor-push`（镜像推 `192.168.3.200:18700/opic/techbase`；需 daemon insecure-registries 加 18700，变更窗口执行） | `http://192.168.3.200:18700` |
| Traefik（入口） | compose 只声明 labels（`opic.stack=techbase` + 子域路由），不自起网关 | 子域 `techbase.opic-ai.ccoe.tech` |

**中心仓复制改造三步**（以域码 `osys` 为例）：

1. `configs/config.yml`：`database.schema: osys`；`eventbus.driver: nats`；`workflow.driver: temporal`；`auth.issuer: https://auth.opic-ai.ccoe.tech`；
2. `migrations/`：本中心 DDL（goose 000NNN 序号，禁 AutoMigrate），首启自动落在 `osys` schema；
3. `docker-compose.yml`：`BASE_DOMAIN` 环境已全局注入，子域随域名自动生效。

**事件总线驱动切换语义**：`inproc` 为进程内直调（开发/降级兜底）；`nats` 为 JetStream durable 订阅，at-least-once——消费方必须幂等（115 号 §4.2）。接口契约两实现一致（`pkg/eventbus/contract_test.go`）。

**验证**：`cmd/smoke` 为 live 冒烟（pg/redis/nats/temporal 四项），生产实测四项全绿：

```bash
CGO_ENABLED=0 GOOS=linux go build -o smoke ./cmd/smoke
./smoke   # 需要 DB_PASSWORD(或PG_ADMIN_PASSWORD)/REDIS_PASSWORD/NATS_PASSWORD 等环境变量
```

> ⚠ pgx DSN 两个实测坑：空 `password=` 会吞掉后续 `dbname`；`search_path` 值不能含逗号（只设中心单 schema）。

### 九·一、流程引擎接线（2026-10-02，v1 语义 + step1 运行时）

`/api/flow` 与客户申请流程的执行架构为**语义/运行时分离**（对齐 115 号 §4.2 判据）：

| 层 | 承担 | 实现 |
|---|---|---|
| **流程语义**（不变） | 审批流转：Start/Approve/Reject/ReturnTo、网关路由、规则求值 | `internal/service/engine`（v1 状态机，flow_definition/instance/task） |
| **事件总线**（新增） | `opic.techbase.flow.{instance.started,task.created,instance.completed,sla.exceeded}` 四事件旁路发布 | `pkg/eventbus`（生产 driver=nats，stream `OPIC`） |
| **运行时看护**（新增） | 任务 SLA 看护工作流 `flowGuardian-task-<id>`：到期未处理 → sla.exceeded | `pkg/workflowx`（生产 driver=temporal：服务端持久化定时器，**进程重启不丢**；local 降级为 goroutine） |

- 装配：`internal/infra`（Init/EB/WF/Close，任一不可用降级 nil = 纯 v1 行为）；temporal worker 在 `cmd/techbase` 启动（TaskQueue `techbase`，workflow 名 `flowGuardian`）。
- 发布/看护全部**旁路化**：失败仅记日志，绝不阻塞审批主流程。
- 端到端实测（生产 192.168.3.200）：客户申请提交 → NATS 收到 `instance.started`/`task.created` + Temporal 出现 `flowGuardian-task-1`(Running)。

### 九·二、Temporal 流程设计器（2026-10-02，流程设计入口已切 Temporal）

管理控制台「流程设计」菜单现已指向 **Temporal 流程设计器**（`/admin/temporalflow`）：
xyflow 画布设计 **编排 DSL**（START/STEP/TIMER/CONDITION/END 五类节点；CONDITION 双出边 true/false 对启动变量表达式求值；STEP 可挂 Webhook；TIMER 秒级等待）→ 保存/发布（存 `flow_definition`，`flow_type='TEMPORAL'`，与 V1 审批流同表分流）→ 试运行启动 **通用解释器工作流**。

| 组件 | 位置 | 说明 |
|---|---|---|
| DSL 解析/校验/解释执行 | `pkg/temporalflow`（Parse/Run + 契约测试：顺序/条件真假/定时/缺分支/死循环护栏 MaxSteps=1000） | 解释器骨架驱动无关，Sleep/Emit/Webhook 原语由驱动提供 |
| temporal 驱动 | `pkg/temporalflow/temporal.go`：`TemporalExecutor`（workflow.Sleep **服务端持久化定时器**）+ Activities（EmitEvent→NATS / Webhook→HTTP）+ `StartInterpreter` | workflow 名 `temporalInterpreter`，activities `EmitEventActivity`/`WebhookActivity` |
| API | `/api/admin/temporalflow/*`（list/get/save/publish/run/validate；system:manage 权限） | run 接受启动变量（条件求值输入） |
| 执行证据 | Temporal UI 可见 `temporalflow-<code>-<run>`：COMPLETED `{"finished":true,"steps":4}`；NATS stream `OPIC` 收 step.started/completed/run.completed | 生产端到端已实测 |

V1 审批流设计器（FlowDesigner）保留在「V1 审批流定义」，两套语义互不影响。
