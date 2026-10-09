// Package redisx —— Redis 客户端(gopherforge shared/pkg/redis 模式:可选启用,故障降级)。
//
// 底座对 Redis 是"可用则增强"(令牌吊销黑名单),未启用或连接失败时功能静默降级,
// 不影响既有行为 —— 这是与 gopherforge 强依赖模式的唯一差异,见 README 重构说明。
package redisx

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

var Client *redis.Client

// Init 建立 Redis 连接(enabled=false 时不初始化)。连接后 Ping 验证。
func Init(enabled bool, host string, port int, password string, db int) error {
	if !enabled {
		Client = nil
		return nil
	}
	c := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%d", host, port),
		Password: password,
		DB:       db,
		PoolSize: 10,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := c.Ping(ctx).Err(); err != nil {
		_ = c.Close()
		return fmt.Errorf("连接 Redis 失败: %w", err)
	}
	Client = c
	return nil
}

// Enabled 是否已启用(客户端就绪)。
func Enabled() bool { return Client != nil }

// Close 关闭连接(未启用时为空操作)。
func Close() {
	if Client != nil {
		_ = Client.Close()
		Client = nil
	}
}
