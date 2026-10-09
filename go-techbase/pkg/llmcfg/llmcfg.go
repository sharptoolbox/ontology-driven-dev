// Package llmcfg —— AI 模型配置（管理控制台可配；工作台/控制台 AI 助理共用）。
//
// 存储：opicdb.otechbase.ai_model_config 单行表（migration 000004）。
// 优先级：环境变量(LLM_API_KEY 等) > DB 配置 > 内置规则匹配引擎（零依赖降级）。
// 密钥只存 DB/环境，接口返回时打码（只回是否已配置）。
package llmcfg

import (
	"sync"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/store"
)

// Config AI 模型配置（单行）。
type Config struct {
	Provider    string  `json:"provider"` // openai 兼容（含 deepseek/qwen/vllm 等）
	BaseURL     string  `json:"base_url"` // 如 https://api.deepseek.com/v1
	Model       string  `json:"model"`    // 如 deepseek-chat
	APIKey      string  `json:"api_key"`  // 写入后读取打码
	Temperature float64 `json:"temperature"`
	Enabled     bool    `json:"enabled"`
}

var mu sync.RWMutex

// EnsureTable 建表（幂等，启动调用）。
func EnsureTable() error {
	_, err := store.Exec(nil, `CREATE TABLE IF NOT EXISTS ai_model_config (
		id         BIGSERIAL PRIMARY KEY,
		provider   TEXT NOT NULL DEFAULT 'openai',
		base_url   TEXT NOT NULL DEFAULT '',
		model      TEXT NOT NULL DEFAULT '',
		api_key    TEXT NOT NULL DEFAULT '',
		temperature REAL NOT NULL DEFAULT 0.3,
		enabled    BOOLEAN NOT NULL DEFAULT false,
		updated_at TIMESTAMPTZ DEFAULT now()
	)`)
	return err
}

// Get 读取配置（api_key 打码为 has_key 标记；返回 nil=未配置）。
func Get() (*Config, bool) {
	mu.RLock()
	defer mu.RUnlock()
	row, err := store.One(nil, `SELECT provider, base_url, model, api_key, temperature, enabled
		FROM ai_model_config ORDER BY id LIMIT 1`)
	if err != nil || row == nil {
		return nil, false
	}
	key, _ := row["api_key"].(string)
	enabled := false
	if v, ok := row["enabled"].(bool); ok {
		enabled = v
	}
	temp := 0.3
	if f, ok := row["temperature"].(float64); ok {
		temp = f
	}
	return &Config{
		Provider: s(row["provider"]), BaseURL: s(row["base_url"]),
		Model: s(row["model"]), APIKey: key,
		Temperature: temp, Enabled: enabled && key != "",
	}, key != ""
}

// HasKey 是否已配置密钥。
func HasKey() bool {
	_, has := Get()
	return has
}

// Current 返回已启用的配置（未启用返回 nil，调用方降级规则匹配引擎）。
func Current() *Config {
	c, has := Get()
	if !has || !c.Enabled {
		return nil
	}
	return c
}

// Save 保存配置（upsert 单行）。
func Save(c *Config) error {
	mu.Lock()
	defer mu.Unlock()
	_, err := store.Exec(nil, `
		INSERT INTO ai_model_config (id, provider, base_url, model, api_key, temperature, enabled)
		VALUES (1,?,?,?,?,?,?)
		ON CONFLICT (id) DO UPDATE SET provider=EXCLUDED.provider, base_url=EXCLUDED.base_url,
			model=EXCLUDED.model, api_key=EXCLUDED.api_key,
			temperature=EXCLUDED.temperature, enabled=EXCLUDED.enabled, updated_at=now()`,
		c.Provider, c.BaseURL, c.Model, c.APIKey, c.Temperature, c.Enabled)
	return err
}

func s(v any) string {
	if v == nil {
		return ""
	}
	if b, ok := v.([]byte); ok {
		return string(b)
	}
	if x, ok := v.(string); ok {
		return x
	}
	return ""
}
