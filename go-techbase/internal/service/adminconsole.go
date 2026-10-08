// Package service —— 管理控制台补齐（gopherforge 基准）：日志审计 / 在线用户 / 公告 / 系统监控。
// 全部只读或独立表写；权限统一 system:manage（admin 超管 * 放行）。
package service

import (
	"fmt"
	"runtime"
	"time"

)

// pageOf 归一化分页。
func adminPage(page, size int) (int, int) {
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 200 {
		size = 20
	}
	return page, size
}

// AdminLogs 按类别查 audit_logs：login=登录日志；audit=流程动作日志；operation=其余操作日志。
func AdminLogs(category string, page, size int) (*Page, error) {
	page, size = adminPage(page, size)
	var cond string
	switch category {
	case "login":
		cond = "action IN ('LOGIN','LOGOUT')"
	case "audit":
		cond = "action IN ('SUBMIT','APPROVE','REJECT','RETURN')"
	case "operation":
		cond = "action NOT IN ('LOGIN','LOGOUT','SUBMIT','APPROVE','REJECT','RETURN')"
	default:
		cond = "1=1"
	}
	total, err := qCount(fmt.Sprintf(`SELECT COUNT(*) FROM audit_logs WHERE %s`, cond))
	if err != nil {
		return nil, err
	}
	rows, err := qList(fmt.Sprintf(`SELECT id, user_id, username, action, detail, created_at FROM audit_logs
		WHERE %s ORDER BY id DESC LIMIT %d OFFSET %d`, cond, size, (page-1)*size))
	if err != nil {
		return nil, err
	}
	return &Page{List: rows, Total: total, PageV: page, Size: size}, nil
}

// AdminOnlineUsers 在线用户（近似口径：最近 30 分钟内 LOGIN 且其后无 LOGOUT 的用户）。
func AdminOnlineUsers() ([]map[string]any, error) {
	return qList(`
		SELECT username, MAX(created_at) AS last_login, COUNT(*) AS login_times
		FROM audit_logs
		WHERE action = 'LOGIN' AND created_at >= to_char(now() - interval '30 minutes', 'YYYY-MM-DD HH24:MI:SS')
		GROUP BY username
		ORDER BY last_login DESC`)
}

// ---------- 公告管理 ----------

// AdminNoticeList 公告分页。
func AdminNoticeList(page, size int) (*Page, error) {
	page, size = adminPage(page, size)
	total, err := qCount(`SELECT COUNT(*) FROM sys_notice`)
	if err != nil {
		return nil, err
	}
	rows, err := qList(fmt.Sprintf(`SELECT id, title, content, status, created_by_name, created_at, updated_at
		FROM sys_notice ORDER BY id DESC LIMIT %d OFFSET %d`, size, (page-1)*size))
	if err != nil {
		return nil, err
	}
	return &Page{List: rows, Total: total, PageV: page, Size: size}, nil
}

// AdminNoticeSave 新建/更新公告（id=0 新建）。
func AdminNoticeSave(id int64, title, content string, status int, byUserID int64, byName string) (int64, error) {
	if id == 0 {
		return qExec(`INSERT INTO sys_notice (title, content, status, created_by, created_by_name)
			VALUES (?, ?, ?, ?, ?)`, title, content, status, byUserID, byName)
	}
	return qExec(`UPDATE sys_notice SET title = ?, content = ?, status = ?,
		updated_at = to_char(now(), 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?`,
		title, content, status, id)
}

// AdminNoticeDelete 删除公告。
func AdminNoticeDelete(id int64) (int64, error) {
	return qExec(`DELETE FROM sys_notice WHERE id = ?`, id)
}

// ---------- 系统监控 ----------

// AdminSystemStats 系统监控（Go runtime + 进程 + 数据库 + 版本）。
func AdminSystemStats() (map[string]any, error) {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	tables, err := qList(`SELECT relname AS table_name, n_live_tup AS row_est
		FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 8`)
	if err != nil {
		tables = []map[string]any{}
	}
	return map[string]any{
		"version":      "v3 (dbedec0+组合根)",
		"go_version":   runtime.Version(),
		"goroutines":   runtime.NumGoroutine(),
		"uptime_sec":   int(time.Since(processStart).Seconds()),
		"heap_mb":      float64(mem.HeapAlloc) / 1024 / 1024,
		"sys_mb":       float64(mem.Sys) / 1024 / 1024,
		"num_cpu":      runtime.NumCPU(),
		"db_tables":    tables,
		"redis_enabled": false,
	}, nil
}

var processStart = time.Now()
