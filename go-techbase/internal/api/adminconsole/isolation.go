// 中心隔离信息 —— 系统工具「隔离信息」页数据源（OPIC-DB-SCHEMA-01/中心级隔离三件套）。
// 展示本能力中心的隔离边界:PostgreSQL schema、NATS JetStream、Temporal、Redis 及中心标识。
// 配置态来自 config,运行态(schema/表数量/迁移版本)以实时 SQL 校验。
package adminconsole

import (
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/api/common"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/config"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/store"
)

// IsolationInfo GET /api/admin/isolation
func IsolationInfo(c *gin.Context) {
	cfg := config.Config
	cc := cfg.CenterCode

	// ── 运行态:PostgreSQL ──
	schemaExists, tableCount, migrationsVer := pgRuntimeFacts(cfg.Database.Schema)

	// ── 派生兜底(与 infra.Init 同规则:配置空时按中心域码推导) ──
	stream := cfg.EventBus.StreamName
	if stream == "" {
		stream = "OPIC_" + strings.ToUpper(cc)
	}
	subjectPrefix := cfg.EventBus.SubjectPrefix
	if subjectPrefix == "" {
		subjectPrefix = "opic." + cc
	}
	taskQueue := cfg.Workflow.TaskQueue
	if taskQueue == "" {
		taskQueue = cc
	}

	data := gin.H{
		"center": gin.H{
			"code":        cc,
			"description": "能力中心域码,隔离三件套(schema/事件主题/任务队列)的命名根",
		},
		"postgresql": gin.H{
			"host":              cfg.Database.Host,
			"port":              cfg.Database.Port,
			"database":          cfg.Database.DBName,
			"schema":            cfg.Database.Schema,
			"user":              cfg.Database.UserName,
			"sslmode":           cfg.Database.SSLMode,
			"pool":              fmt.Sprintf("%d~%d", cfg.Database.MinConns, cfg.Database.MaxConns),
			"schema_exists":     schemaExists,
			"table_count":       tableCount,
			"migration_version": migrationsVer,
		},
		"eventbus": gin.H{
			"driver":         cfg.EventBus.Driver,
			"url":            cfg.EventBus.URL,
			"stream":         stream,
			"subject_prefix": subjectPrefix,
			"max_age_days":   cfg.EventBus.MaxAgeDays,
			"note":           "JetStream 流与主题按中心隔离,跨中心事件互不可见",
		},
		"workflow": gin.H{
			"driver":     cfg.Workflow.Driver,
			"address":    cfg.Workflow.Address,
			"namespace":  cfg.Workflow.Namespace,
			"task_queue": taskQueue,
			"storage":    "Pigsty PostgreSQL(与 opicdb 同实例,独立库 temporal/temporal_visibility)——2026-10-03 由独立 pg 容器迁移纳管",
			"note":       "TaskQueue=中心域码,worker 只消费本中心任务",
		},
		"nats_storage": gin.H{
			"mode":  "JetStream 文件存储(NATS 产品形态,无外部数据库)",
			"path":  "/opt/opic/nats/data/jetstream",
			"note":  "随部署目录纳入备份;流按中心隔离(OPIC_<CODE>)",
		},
		"redis": gin.H{
			"enabled": cfg.Redis.Enabled,
			"host":    cfg.Redis.Host,
			"port":    cfg.Redis.Port,
			"db":      cfg.Redis.DB,
			"note":    "可选组件;会话令牌吊销等",
		},
	}
	common.OKJSON(c, data, "")
}

// pgRuntimeFacts 运行态事实:schema 存在性、本 schema 表数量、goose 迁移版本。
func pgRuntimeFacts(schema string) (schemaExists bool, tableCount int64, migrationVersion string) {
	if schema == "" {
		schema = "public"
	}
	if row, err := store.One(nil, `SELECT COUNT(*) AS n FROM information_schema.schemata WHERE schema_name=?`, schema); err == nil && row != nil {
		schemaExists = service2Int(row["n"]) > 0
	}
	if row, err := store.One(nil, `SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=?`, schema); err == nil && row != nil {
		tableCount = service2Int(row["n"])
	}
	if row, err := store.One(nil, `SELECT max(version_id) AS v FROM goose_db_version`); err == nil && row != nil && row["v"] != nil {
		migrationVersion = fmt.Sprint(row["v"])
	}
	return schemaExists, tableCount, migrationVersion
}

func service2Int(v any) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case float64:
		return int64(x)
	}
	return 0
}
