// Package token —— 会话令牌吊销黑名单(gopherforge JWT 黑名单模式)。
//
// 经 Redis 记录已登出令牌的 jti,键 opic:techbase:jwt:blacklist:<jti>,TTL=令牌剩余有效期。
// Redis 未启用时全部空操作(保持旧行为:登出不吊销令牌)。
package token

import (
	"context"
	"time"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/redisx"
)

const keyPrefix = "opic:techbase:jwt:blacklist:"

// Revoke 吊销令牌(jti 黑名单,TTL 至令牌自然过期)。
func Revoke(jti string, ttl time.Duration) error {
	if !redisx.Enabled() || jti == "" {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return redisx.Client.Set(ctx, keyPrefix+jti, 1, ttl).Err()
}

// Revoked 是否已被吊销(Redis 未启用恒为 false)。
func Revoked(jti string) bool {
	if !redisx.Enabled() || jti == "" {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	n, err := redisx.Client.Exists(ctx, keyPrefix+jti).Result()
	if err != nil {
		// Redis 故障按未吊销处理(可用性优先,与 gopherforge fail-open 口径一致)
		return false
	}
	return n > 0
}
