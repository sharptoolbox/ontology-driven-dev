# OPIC 技术底座 · 运维手册

> 事实源：[go-techbase](https://github.com/opic-ai/ontology-driven-dev/go-techbase) 仓库 `docs/OPERATIONS.md`。生产环境 192.168.3.200（opic-ai），入口 `https://techbase.opic-ai.ccoe.tech`。

## 1. 日常健康检查

```bash
# 存活/就绪（ready 含 DB ping，503=数据库不可达）
curl -sk https://techbase.opic-ai.ccoe.tech/health/live
curl -sk https://techbase.opic-ai.ccoe.tech/health/ready

# 容器状态
ssh root@192.168.3.200 'docker ps --format "{{.Names}} {{.Status}}" | grep techbase'
```

## 2. 监控与告警（Pigsty 栈）

| 项 | 入口 |
|---|---|
| 指标抓取 | VictoriaMetrics `:8428`（job=techbase，经 Traefik 抓 /metrics，file_sd 5s 刷新） |
| Grafana 面板 | `http://192.168.3.200:3000` →「OPIC 技术底座 · 应用监控」：up / QPS / 5xx 率 / P95 / goroutine / DB 连接池 |
| 告警规则 | vmalert `/infra/rules/techbase.yml`：应用失联(critical)、5xx 率>5%(warning)、DB 池≥16(warning) |

接入配置归档于 opic-deploy 仓 `observability/techbase/`（`install.sh` 幂等安装）。

## 3. 日志体系（三页面 + 采集）

- **操作日志**：`/api/admin/*` 写操作由 OperationAudit 中间件自动记录（action=OPERATE，请求体摘要含敏感字段脱敏）；
- **审计日志**：业务动作显式埋点（SUBMIT/APPROVE/REJECT/RETURN，覆盖 V1 审批与 Temporal 任务）；
- **登录日志**：LOGIN/LOGOUT；
- 以上落 `audit_logs` 表，管理控制台「日志审计」三视图查询。NATS 访问日志/应用 stdout 走 `docker logs go-techbase-app`。

## 4. 数据面（Pigsty 纳管）

| 库/Schema | 用途 |
|---|---|
| opicdb.otechbase | 业务数据（19 表，goose 迁移至 v3） |
| casdoor | Casdoor 身份库 |
| temporal / temporal_visibility | Temporal 持久化（2026-10-03 迁入，旧 pgdata 目录 `/opt/opic/temporal/pgdata` 保留可回滚） |
| NATS | 无外部数据库——JetStream 文件存储 `/opt/opic/nats/data/jetstream`，随部署目录备份 |

隔离边界实时视图：管理控制台「系统工具 → 隔离信息」。

## 5. 备份与恢复

- Pigsty 自带备份（pgbackrest，Pigsty 栈纳管）覆盖全部库；
- NATS JetStream：随 `/opt/opic` 部署目录周期备份（BACKUP_DIR）；
- 应用无状态：镜像 + git 任意重建；`.env`（凭据）务必备份且勿入库。

## 6. 凭据管理（台账制）

统一在 `192.168.3.200:/opt/opic-prod/.env`（chmod 600）：ZITADEL_ADMIN_PASSWORD、ZITADEL_TECHBASE_ADMIN_PASSWORD（admin）、TEMPORAL_PG_PASSWORD 等。**口令不进 git、不进聊天记录归档**。管理员 SSO：登录名 `admin`。

## 7. 常见运维任务

```bash
# 重启应用
ssh root@192.168.3.200 'cd /opt/opic-prod/apps/techbase && set -a && source .env && set +a && \
  set -a && source /opt/opic-prod/.env && set +a && BASE_DOMAIN=opic-ai.ccoe.tech \
  TRAEFIK_ENTRYPOINT=websecure docker compose restart'
# 看实时日志
ssh root@192.168.3.200 'docker logs -f --tail 100 go-techbase-app'
# Temporal 栈（独立 compose）
ssh root@192.168.3.200 'cd /opt/opic-prod/stacks/temporal && docker compose ps'
```

## 8. 故障速查

| 症状 | 首查 | 处置 |
|---|---|---|
| 整页打不开 | Traefik/容器状态 | `docker ps`；Traefik 面板看路由 |
| /health/ready 503 | Pigsty/haproxy :5433 | haproxy 状态、opicdb 连接 |
| 接口 401 | SSO/会话 | 重新登录；查 ZITADEL/Casdoor 可达性 |
| 接口 404 | 路由注册 | 前后端契约比对（gin 重复注册会 panic） |
| AI 助理"暂时不可用" | 模型账号 | 管理台「AI 模型配置」点测试；看 `docker logs | grep assistant` |
| 流程不流转 | Temporal | UI :8088？→ Temporal UI 容器；查 worker（techbase 内嵌）日志 |
| SQL 42601 类 | 业务空参数 | 空集合勿拼 `IN ()`（已修 todo/done，新增查询注意） |

更多历史踩坑 → [FAQ](/docs/techbase/faq)。
