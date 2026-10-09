// Package health —— 健康检查端点(gopherforge shared/pkg/health 模式:依赖注入式探测)。
//
// /health       总览(依赖全部可用 200,否则 503)
// /health/live  存活探针(进程在即 200)
// /health/ready 就绪探针(DB/Redis 探测失败 → 503)
// /health/check 明细(恒 200,供诊断)
package health

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type checkFn func() error

// Register 注册健康端点。dbCheck/redisCheck 为 nil 时跳过该项探测。
func Register(r *gin.Engine, dbCheck, redisCheck checkFn) {
	run := func(c *gin.Context) (bool, map[string]string) {
		details := map[string]string{}
		ok := true
		for name, fn := range map[string]checkFn{"db": dbCheck, "redis": redisCheck} {
			if fn == nil {
				continue
			}
			if err := fn(); err != nil {
				details[name] = "unavailable"
				ok = false
				continue
			}
			details[name] = "up"
		}
		return ok, details
	}

	r.GET("/health", func(c *gin.Context) {
		ok, details := run(c)
		status := http.StatusOK
		if !ok {
			status = http.StatusServiceUnavailable
		}
		c.JSON(status, gin.H{"status": upDown(ok), "checks": details})
	})
	r.GET("/health/live", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "up"})
	})
	r.GET("/health/ready", func(c *gin.Context) {
		ok, details := run(c)
		if !ok {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "down", "checks": details})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "up", "checks": details})
	})
	r.GET("/health/check", func(c *gin.Context) {
		_, details := run(c)
		c.JSON(http.StatusOK, gin.H{"status": upDown(true), "checks": details})
	})
}

func upDown(ok bool) string {
	if ok {
		return "up"
	}
	return "down"
}
