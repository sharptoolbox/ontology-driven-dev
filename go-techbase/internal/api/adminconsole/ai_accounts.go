// AI 模型设置 —— 多供应商账号管理（模型设置页对齐"填入各提供商 API 密钥即可使用其模型"形态）。
// 目录(GET catalog) / 账号 CRUD / 连通性测试 / 上游模型目录获取。
package adminconsole

import (
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/api/common"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/errcode"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/llmcfg"
)

// errcodeParam 参数类错误的统一信封。
func errcodeParam(msg string) any {
	return errcode.New(errcode.ErrParam, msg, nil)
}

// maskAccount 出参打码（密钥不回显,只给 has_key）。
func maskAccount(a *llmcfg.Account) *llmcfg.Account {
	if a == nil {
		return nil
	}
	cp := *a
	cp.APIKey = ""
	cp.HasKey = true
	return &cp
}

// AICatalog 内置提供商目录。
func AICatalog(c *gin.Context) {
	common.OKJSON(c, gin.H{"catalog": llmcfg.Catalog()}, "")
}

// aiAccountBody 账号入参（api_key 空=保留原值）。
type aiAccountBody struct {
	Name         string  `json:"name"`
	Provider     string  `json:"provider"`
	BaseURL      string  `json:"base_url"`
	APIKey       string  `json:"api_key"`
	Models       string  `json:"models"`
	DefaultModel string  `json:"default_model"`
	Temperature  float64 `json:"temperature"`
	Enabled      *bool   `json:"enabled"`
}

func (b *aiAccountBody) norm() {
	b.Name = strings.TrimSpace(b.Name)
	b.Provider = strings.TrimSpace(b.Provider)
	b.BaseURL = strings.TrimSpace(b.BaseURL)
	b.Models = strings.TrimSpace(b.Models)
	b.DefaultModel = strings.TrimSpace(b.DefaultModel)
}

// AIAccountList 账号列表（打码）。
func AIAccountList(c *gin.Context) {
	common.OKJSON(c, gin.H{"accounts": llmcfg.ListAccounts()}, "")
}

// AIAccountCreate 新建账号。
func AIAccountCreate(c *gin.Context) {
	var b aiAccountBody
	if err := c.ShouldBindJSON(&b); err != nil {
		common.FailJSON(c, err)
		return
	}
	b.norm()
	if b.Name == "" || b.Provider == "" {
		c.JSON(200, errcodeParam("账号名与提供商不能为空"))
		return
	}
	enabled := true
	if b.Enabled != nil {
		enabled = *b.Enabled
	}
	a := &llmcfg.Account{
		Name: b.Name, Provider: b.Provider, BaseURL: b.BaseURL, APIKey: b.APIKey,
		Models: b.Models, DefaultModel: b.DefaultModel, Temperature: b.Temperature, Enabled: enabled,
	}
	if err := llmcfg.CreateAccount(a); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, gin.H{"account": maskAccount(a)}, "账号已创建")
}

// AIAccountUpdate 更新账号（api_key 空=保留原值）。
func AIAccountUpdate(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(200, errcodeParam("id 无效"))
		return
	}
	var b aiAccountBody
	if err := c.ShouldBindJSON(&b); err != nil {
		common.FailJSON(c, err)
		return
	}
	b.norm()
	a := &llmcfg.Account{
		ID: id, Name: b.Name, Provider: b.Provider, BaseURL: b.BaseURL, APIKey: b.APIKey,
		Models: b.Models, DefaultModel: b.DefaultModel, Temperature: b.Temperature,
	}
	if b.Enabled != nil {
		a.Enabled = *b.Enabled
	} else {
		old, err := llmcfg.GetAccountFull(id)
		if err != nil || old == nil {
			c.JSON(200, errcodeParam("账号不存在"))
			return
		}
		a.Enabled = old.Enabled
	}
	if err := llmcfg.UpdateAccount(a); err != nil {
		common.FailJSON(c, err)
		return
	}
	full, _ := llmcfg.GetAccountFull(id)
	common.OKJSON(c, gin.H{"account": maskAccount(full)}, "账号已保存")
}

// AIAccountDelete 删除账号。
func AIAccountDelete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(200, errcodeParam("id 无效"))
		return
	}
	if err := llmcfg.DeleteAccount(id); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, gin.H{"deleted": true}, "账号已删除")
}

// AIAccountTest 连通性测试（绿点状态依据）。
func AIAccountTest(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(200, errcodeParam("id 无效"))
		return
	}
	a, err := llmcfg.GetAccountFull(id)
	if err != nil || a == nil {
		c.JSON(200, errcodeParam("账号不存在"))
		return
	}
	if err := llmcfg.TestAccount(c.Request.Context(), a); err != nil {
		common.OKJSON(c, gin.H{"ok": false, "error": err.Error()}, "")
		return
	}
	common.OKJSON(c, gin.H{"ok": true}, "连接正常")
}

// AIUpstreamModels 获取上游可用模型目录。
// 传 id → 用已存账号;否则用表单态 base_url/api_key(编辑中未保存也可获取)。
func AIUpstreamModels(c *gin.Context) {
	baseURL := strings.TrimSpace(c.Query("base_url"))
	apiKey := c.Query("api_key")
	if idStr := c.Query("id"); idStr != "" {
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err == nil && id > 0 {
			if a, _ := llmcfg.GetAccountFull(id); a != nil {
				if baseURL == "" {
					baseURL = a.ResolveBaseURL()
				}
				if apiKey == "" {
					apiKey = a.APIKey
				}
			}
		}
	}
	ids, err := llmcfg.ListUpstreamModels(c.Request.Context(), baseURL, apiKey)
	if err != nil {
		common.OKJSON(c, gin.H{"models": nil, "error": err.Error()}, "")
		return
	}
	common.OKJSON(c, gin.H{"models": ids}, "")
}
