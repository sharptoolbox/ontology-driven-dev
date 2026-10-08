// 多供应商账号管理 —— 模型设置（对齐"填入各提供商 API 密钥即可使用其模型"形态）。
//
// 存储：opicdb.otechbase.ai_provider_account 多行表（账号=提供商+密钥+模型目录）。
// 旧单行表 ai_model_config 保留只读兼容（首次建账号时自动迁移一行）。
// 密钥只存 DB/环境，接口一律打码（回 has_key）。provider 目录内置（openai/deepseek/kimi/zai/anthropic/自定义）。
package llmcfg

import (
	"strings"
	"sync"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/store"
)

// Account 供应商账号（多行）。
type Account struct {
	ID           int64   `json:"id"`
	Name         string  `json:"name"`          // 账号显示名(如 zai-coding-cn)
	Provider     string  `json:"provider"`      // 目录键:openai/deepseek/kimi/zai/anthropic/custom
	BaseURL      string  `json:"base_url"`      // 空=提供商默认
	APIKey       string  `json:"api_key"`       // 读取一律打码
	Models       string  `json:"models"`        // 模型目录,逗号分隔(空=使用适配器默认模型)
	DefaultModel string  `json:"default_model"` // 默认模型(空=目录第一个/适配器默认)
	Temperature  float64 `json:"temperature"`   // 账号级默认温度(0=模型默认)
	Enabled      bool    `json:"enabled"`
	HasKey       bool    `json:"has_key"` // 仅出参
}

// ProviderDir 内置提供商目录。
type ProviderDir struct {
	Key     string `json:"key"`
	Label   string `json:"label"`
	BaseURL string `json:"base_url"`
	Models  string `json:"models"` // 预置常用模型(逗号分隔)
}

// Catalog 内置目录（OpenAI 兼容协议为主;anthropic 走兼容网关或标注仅兼容端点）。
func Catalog() []ProviderDir {
	return []ProviderDir{
		{Key: "zai", Label: "智谱 zai（GLM）", BaseURL: "https://open.bigmodel.cn/api/paas/v4", Models: "glm-4.7,glm-4.6,glm-4.5-air"},
		{Key: "deepseek", Label: "DeepSeek", BaseURL: "https://api.deepseek.com/v1", Models: "deepseek-chat,deepseek-reasoner"},
		{Key: "kimi", Label: "Kimi（月之暗面）", BaseURL: "https://api.moonshot.cn/v1", Models: "kimi-k2-0905-preview,moonshot-v1-32k"},
		{Key: "openai", Label: "OpenAI", BaseURL: "https://api.openai.com/v1", Models: "gpt-4o,gpt-4o-mini"},
		{Key: "anthropic", Label: "Anthropic（OpenAI 兼容网关）", BaseURL: "", Models: "claude-sonnet-4-5"},
		{Key: "custom", Label: "自定义 OpenAI 兼容", BaseURL: "", Models: ""},
	}
}

// CatalogByKey 按 key 查目录项。
func CatalogByKey(key string) (ProviderDir, bool) {
	for _, d := range Catalog() {
		if d.Key == key {
			return d, true
		}
	}
	return ProviderDir{}, false
}

// ResolveBaseURL 账号实际 base_url(空则用提供商默认)。
func (a *Account) ResolveBaseURL() string {
	if a.BaseURL != "" {
		return strings.TrimRight(a.BaseURL, "/")
	}
	if d, ok := CatalogByKey(a.Provider); ok && d.BaseURL != "" {
		return strings.TrimRight(d.BaseURL, "/")
	}
	return ""
}

// ModelList models 逗号分隔 → 切片(空=用目录预置;保证非 nil,JSON 输出 [])。
func (a *Account) ModelList() []string {
	out := make([]string, 0, 8)
	src := a.Models
	if src == "" {
		if d, ok := CatalogByKey(a.Provider); ok {
			src = d.Models
		}
	}
	for _, m := range strings.Split(src, ",") {
		if m = strings.TrimSpace(m); m != "" {
			out = append(out, m)
		}
	}
	return out
}

// DefaultModelResolve 实际默认模型(空→目录第一个)。
func (a *Account) DefaultModelResolve() string {
	if a.DefaultModel != "" {
		return a.DefaultModel
	}
	if l := a.ModelList(); len(l) > 0 {
		return l[0]
	}
	return ""
}

var accountsMu sync.RWMutex

// EnsureAccountsTable 建表（幂等）。
func EnsureAccountsTable() error {
	_, err := store.Exec(nil, `CREATE TABLE IF NOT EXISTS ai_provider_account (
		id            BIGSERIAL PRIMARY KEY,
		name          TEXT NOT NULL UNIQUE,
		provider      TEXT NOT NULL DEFAULT 'openai',
		base_url      TEXT NOT NULL DEFAULT '',
		api_key       TEXT NOT NULL DEFAULT '',
		models        TEXT NOT NULL DEFAULT '',
		default_model TEXT NOT NULL DEFAULT '',
		temperature   REAL NOT NULL DEFAULT 0.3,
		enabled       BOOLEAN NOT NULL DEFAULT true,
		updated_at    TIMESTAMPTZ DEFAULT now()
	)`)
	return err
}

func accountFromRow(row map[string]any) *Account {
	a := &Account{
		ID:           i64(row["id"]),
		Name:         s(row["name"]),
		Provider:     s(row["provider"]),
		BaseURL:      s(row["base_url"]),
		APIKey:       s(row["api_key"]),
		Models:       s(row["models"]),
		DefaultModel: s(row["default_model"]),
		Enabled:      b(row["enabled"]),
	}
	if f, ok := row["temperature"].(float64); ok {
		a.Temperature = f
	}
	a.HasKey = a.APIKey != ""
	return a
}

func i64(v any) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case float64:
		return int64(x)
	}
	return 0
}

func b(v any) bool {
	x, _ := v.(bool)
	return x
}

// ListAccounts 账号列表（打码）。
func ListAccounts() []Account {
	accountsMu.RLock()
	defer accountsMu.RUnlock()
	rows, err := store.List(nil, `SELECT id, name, provider, base_url, api_key, models, default_model, temperature, enabled
		FROM ai_provider_account ORDER BY id`)
	if err != nil {
		return nil
	}
	out := make([]Account, 0, len(rows))
	for _, r := range rows {
		a := accountFromRow(r)
		a.APIKey = ""
		out = append(out, *a)
	}
	return out
}

// GetAccountFull 按 id 取全量（含密钥,仅服务端内部/保存留空回填用）。
func GetAccountFull(id int64) (*Account, error) {
	accountsMu.RLock()
	defer accountsMu.RUnlock()
	row, err := store.One(nil, `SELECT id, name, provider, base_url, api_key, models, default_model, temperature, enabled
		FROM ai_provider_account WHERE id = ?`, id)
	if err != nil || row == nil {
		return nil, err
	}
	return accountFromRow(row), nil
}

// CreateAccount 新建（首次建账号时把旧单行配置迁移为一个账号）。
func CreateAccount(a *Account) error {
	accountsMu.Lock()
	defer accountsMu.Unlock()
	migrateLegacyOnce()
	var id int64
	row, err := store.One(nil, `
		INSERT INTO ai_provider_account (name, provider, base_url, api_key, models, default_model, temperature, enabled)
		VALUES (?,?,?,?,?,?,?,?)
		RETURNING id`,
		a.Name, a.Provider, a.BaseURL, a.APIKey, a.Models, a.DefaultModel, a.Temperature, a.Enabled)
	if err != nil {
		return err
	}
	id = i64(row["id"])
	a.ID = id
	return nil
}

// UpdateAccount 更新（apiKey 空=保留原值;改名查重由 UNIQUE 约束兜底）。
func UpdateAccount(a *Account) error {
	accountsMu.Lock()
	defer accountsMu.Unlock()
	if a.APIKey == "" {
		_, err := store.Exec(nil, `UPDATE ai_provider_account SET name=?, provider=?, base_url=?, models=?,
			default_model=?, temperature=?, enabled=?, updated_at=now() WHERE id=?`,
			a.Name, a.Provider, a.BaseURL, a.Models, a.DefaultModel, a.Temperature, a.Enabled, a.ID)
		return err
	}
	_, err := store.Exec(nil, `UPDATE ai_provider_account SET name=?, provider=?, base_url=?, api_key=?, models=?,
		default_model=?, temperature=?, enabled=?, updated_at=now() WHERE id=?`,
		a.Name, a.Provider, a.BaseURL, a.APIKey, a.Models, a.DefaultModel, a.Temperature, a.Enabled, a.ID)
	return err
}

// DeleteAccount 删除。
func DeleteAccount(id int64) error {
	accountsMu.Lock()
	defer accountsMu.Unlock()
	_, err := store.Exec(nil, `DELETE FROM ai_provider_account WHERE id = ?`, id)
	return err
}

// EnabledAccounts 已启用账号（assistant 用;按 id 升序,首个为默认账号）。
// ⚠ 供服务端内部调用,含密钥——严禁直接序列化返回给前端。
func EnabledAccounts() []Account {
	accountsMu.RLock()
	defer accountsMu.RUnlock()
	rows, err := store.List(nil, `SELECT id, name, provider, base_url, api_key, models, default_model, temperature, enabled
		FROM ai_provider_account WHERE enabled = true ORDER BY id`)
	if err != nil {
		return nil
	}
	out := make([]Account, 0, len(rows))
	for _, r := range rows {
		out = append(out, *accountFromRow(r))
	}
	return out
}

var legacyMigrated bool

// migrateLegacyOnce 旧单行表迁移（有 key 且尚未迁移过时,导入为一个启用账号）。
func migrateLegacyOnce() {
	if legacyMigrated {
		return
	}
	legacyMigrated = true
	n, err := store.Count(nil, `SELECT count(*) FROM ai_provider_account`)
	if err != nil || n > 0 {
		return
	}
	old, has := Get()
	if !has || old.APIKey == "" {
		return
	}
	_, _ = store.Exec(nil, `
		INSERT INTO ai_provider_account (name, provider, base_url, api_key, models, default_model, temperature, enabled)
		VALUES ('默认账号', ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (name) DO NOTHING`,
		old.Provider, old.BaseURL, old.APIKey, old.Model, old.Model, old.Temperature, old.Enabled)
}
