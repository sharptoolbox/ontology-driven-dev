// Package store —— PostgreSQL 16 连接与数据访问。
//
// 经 OPIC-数据服务域(Pigsty)部署的 PostgreSQL 16;连接参数来自 configs/config.yml
// (生产环境连接串经数据服务域 FUNC-12 自助申请获取,不入库不落快照)。
//
// 数据访问口径:GORM 仅承担连接池与事务;业务查询用原生 SQL + map 行,
// 与 Python techbase(sqlite3 直连、不用 ORM)语义一一对应。
// DDL 迁移采用 goose(对齐 gopherforge:000NNN 序号 SQL 迁移,启动时自动 Up)。
package store

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/pressly/goose/v3"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/config"
)

var DB *gorm.DB

// Open 建立 PG16 连接并执行幂等 DDL。
func Open() error {
	cfg := config.Config.Database
	// 空密码必须省略该键 —— pgx 关键字解析会把 "password= dbname=x" 中的 dbname 吞掉
	dsn := fmt.Sprintf("host=%s port=%d user=%s dbname=%s sslmode=%s",
		cfg.Host, cfg.Port, cfg.UserName, cfg.DBName, cfg.SSLMode)
	if cfg.Password != "" {
		dsn = fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
			cfg.Host, cfg.Port, cfg.UserName, cfg.Password, cfg.DBName, cfg.SSLMode)
	}
	if cfg.Schema != "" {
		// ⚠ pgx DSN 的 search_path 值不能含逗号（解析会失效），只设中心单 schema；
		// 跨 schema 访问本就被 OPIC-DB-SCHEMA-01 禁止，public 无需在路径内
		dsn = fmt.Sprintf("%s search_path=%s", dsn, cfg.Schema)
	}
	if env := os.Getenv("GO_TECHBASE_DSN"); env != "" {
		dsn = env
	}
	lvl := logger.Warn
	if strings.EqualFold(config.Config.Log.Level, "debug") {
		lvl = logger.Info
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(lvl),
	})
	if err != nil {
		return fmt.Errorf("连接 PostgreSQL 失败: %w", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	if cfg.MaxConns > 0 {
		sqlDB.SetMaxOpenConns(cfg.MaxConns)
	}
	if cfg.MinConns > 0 {
		sqlDB.SetMaxIdleConns(cfg.MinConns)
	}
	sqlDB.SetConnMaxLifetime(time.Hour)
	DB = db

	if err := migrate(); err != nil {
		return err
	}
	log.Printf("[store] PostgreSQL(%s:%d/%s schema=%s) 就绪", cfg.Host, cfg.Port, cfg.DBName, cfg.Schema)
	return nil
}

// migrate 执行 goose SQL 迁移(migrations/000NNN_*.sql,启动时自动 Up)。
func migrate() error {
	dir := ""
	for _, p := range []string{"migrations", "../migrations"} {
		if st, err := os.Stat(p); err == nil && st.IsDir() {
			dir = p
			break
		}
	}
	if dir == "" {
		return fmt.Errorf("未找到 migrations 目录(请在仓库根目录下启动)")
	}
	sqlDB, err := DB.DB()
	if err != nil {
		return err
	}
	goose.SetDialect("postgres")
	goose.SetLogger(goose.NopLogger())
	if err := goose.UpContext(context.Background(), sqlDB, dir); err != nil {
		return fmt.Errorf("goose 迁移失败: %w", err)
	}
	version, _ := goose.GetDBVersion(sqlDB)
	log.Printf("[store] goose 迁移就绪, 当前版本 %d", version)
	return nil
}

// List 查询多行(map 行,列名为键)。db 为 nil 时使用默认连接。
func List(db *gorm.DB, sql string, args ...any) ([]map[string]any, error) {
	if db == nil {
		db = DB
	}
	var rows []map[string]any
	if err := db.Raw(sql, args...).Scan(&rows).Error; err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []map[string]any{}
	}
	return rows, nil
}

// One 查询单行(无结果返回 nil,不视为错误)。
func One(db *gorm.DB, sql string, args ...any) (map[string]any, error) {
	rows, err := List(db, sql, args...)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return rows[0], nil
}

// Count 计数。
func Count(db *gorm.DB, sql string, args ...any) (int64, error) {
	if db == nil {
		db = DB
	}
	var n int64
	err := db.Raw(sql, args...).Scan(&n).Error
	return n, err
}

// Exec 执行写语句,返回影响行数。
func Exec(db *gorm.DB, sql string, args ...any) (int64, error) {
	if db == nil {
		db = DB
	}
	res := db.Exec(sql, args...)
	if res.Error != nil {
		return 0, res.Error
	}
	return res.RowsAffected, nil
}

// LastID 取最近插入的自增主键(PostgreSQL LASTVAL,须与 INSERT 同会话/事务)。
func LastID(db *gorm.DB) (int64, error) {
	var id int64
	err := db.Raw("SELECT LASTVAL()").Scan(&id).Error
	return id, err
}
