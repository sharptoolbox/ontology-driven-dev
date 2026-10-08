// Package metrics —— Prometheus 文本格式指标(gopherforge shared/pkg/metrics 模式:零依赖手写)。
//
// 指标族 opic_techbase_*:HTTP 请求计数/延迟直方图(按路由模板)、goroutine、内存、DB 连接池。
// 通过 METRICS_ENABLED(默认 true)开关;健康探针与 /metrics 自身不计量。
package metrics

import (
	"fmt"
	"net/http"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

var (
	mu        sync.Mutex
	counts    = map[string]*uint64{}            // method|route|status → total
	durations = map[string]*histogramSnapshot{} // method|route → histogram
	dbStatsFn func() (sqlStats, bool)
	enabled   = true
)

type sqlStats struct {
	Open   uint64
	Idle   uint64
	InUse  uint64
	Wait   uint64
	WaitMS uint64
}

type histogramSnapshot struct {
	buckets []float64
	counts  []uint64 // len = len(buckets)+1(含 +Inf)
	sum     float64
	total   uint64
}

var defaultBuckets = []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10}

// SetEnabled 开关(env METRICS_ENABLED)。
func SetEnabled(v bool) { enabled = v }

// Enabled 当前是否启用。
func Enabled() bool { return enabled }

// SetDBStats 注册 DB 连接池采样函数(如 sqlDB.Stats)。
func SetDBStats(fn func() (open, idle, inUse, wait, waitMS uint64)) {
	mu.Lock()
	defer mu.Unlock()
	if fn == nil {
		dbStatsFn = nil
		return
	}
	dbStatsFn = func() (sqlStats, bool) {
		open, idle, inUse, wait, waitMS := fn()
		return sqlStats{open, idle, inUse, wait, waitMS}, true
	}
}

func key(method, route string, status int) string {
	return method + "|" + route + "|" + strconv.Itoa(status)
}

// IsHealthProbePath 健康探针路径(不计量、不打访问日志)。
func IsHealthProbePath(path string) bool {
	return path == "/health" || path == "/health/live" || path == "/health/ready" || path == "/health/check"
}

// Middleware 指标采集中间件(须最先注册)。
func Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !enabled || IsHealthProbePath(c.Request.URL.Path) {
			c.Next()
			return
		}
		start := time.Now()
		c.Next()
		route := c.FullPath()
		if route == "" {
			route = "unmatched"
		}
		k := key(c.Request.Method, route, c.Writer.Status())
		d := time.Since(start).Seconds()
		mu.Lock()
		defer mu.Unlock()
		if ctr, ok := counts[k]; ok {
			*ctr++
		} else {
			v := uint64(1)
			counts[k] = &v
		}
		h, ok := durations[k]
		if !ok {
			h = &histogramSnapshot{buckets: defaultBuckets, counts: make([]uint64, len(defaultBuckets)+1)}
			durations[k] = h
		}
		h.sum += d
		h.total++
		for i, b := range defaultBuckets {
			if d <= b {
				h.counts[i]++
			}
		}
		h.counts[len(defaultBuckets)]++
	}
}

// Handler 输出 Prometheus 文本格式。
func Handler() gin.HandlerFunc {
	return func(c *gin.Context) {
		var b strings.Builder
		writeCounter := func(k string, v uint64) {
			parts := strings.SplitN(k, "|", 3)
			b.WriteString(fmt.Sprintf(
				"opic_techbase_http_requests_total{method=%q,route=%q,status=%q} %d\n",
				parts[0], parts[1], parts[2], v))
		}
		mu.Lock()
		keys := make([]string, 0, len(counts))
		for k := range counts {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			writeCounter(k, *counts[k])
		}
		for _, k := range keys {
			h, ok := durations[k]
			if !ok {
				continue
			}
			parts := strings.SplitN(k, "|", 3)
			cumulative := uint64(0)
			for i, bound := range defaultBuckets {
				cumulative = h.counts[i]
				b.WriteString(fmt.Sprintf(
					"opic_techbase_http_request_duration_seconds_bucket{method=%q,route=%q,status=%q,le=%q} %d\n",
					parts[0], parts[1], parts[2], strconv.FormatFloat(bound, 'f', -1, 64), cumulative))
			}
			b.WriteString(fmt.Sprintf(
				"opic_techbase_http_request_duration_seconds_bucket{method=%q,route=%q,status=%q,le=\"+Inf\"} %d\n",
				parts[0], parts[1], parts[2], h.total))
			b.WriteString(fmt.Sprintf(
				"opic_techbase_http_request_duration_seconds_sum{method=%q,route=%q,status=%q} %f\n",
				parts[0], parts[1], parts[2], h.sum))
			b.WriteString(fmt.Sprintf(
				"opic_techbase_http_request_duration_seconds_count{method=%q,route=%q,status=%q} %d\n",
				parts[0], parts[1], parts[2], h.total))
		}
		var db sqlStats
		hasDB := false
		if dbStatsFn != nil {
			db, hasDB = dbStatsFn()
		}
		mu.Unlock()

		var ms runtime.MemStats
		runtime.ReadMemStats(&ms)
		b.WriteString(fmt.Sprintf("opic_techbase_go_goroutines %d\n", runtime.NumGoroutine()))
		b.WriteString(fmt.Sprintf("opic_techbase_process_resident_memory_bytes %d\n", ms.Sys))
		if hasDB {
			b.WriteString(fmt.Sprintf("opic_techbase_db_pool_open_connections %d\n", db.Open))
			b.WriteString(fmt.Sprintf("opic_techbase_db_pool_idle_connections %d\n", db.Idle))
			b.WriteString(fmt.Sprintf("opic_techbase_db_pool_in_use_connections %d\n", db.InUse))
			b.WriteString(fmt.Sprintf("opic_techbase_db_pool_wait_count_total %d\n", db.Wait))
		}
		c.Data(http.StatusOK, "text/plain; version=0.0.4; charset=utf-8", []byte(b.String()))
	}
}

// Install 注册 /metrics 与采集中间件(未启用时空操作)。
func Install(r *gin.Engine) {
	if !enabled {
		return
	}
	r.GET("/metrics", Handler())
	r.Use(Middleware())
}
