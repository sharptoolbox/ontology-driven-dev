// Package meta —— 元数据控制器(字典/客户状态/M3 规则;数据源为本体注册表)。
package meta

import (
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/api/common"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/pkg/ontology"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/service"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/errcode"
)

var customerStatuses = []string{"草稿", "待客户经理审批", "待部门总经理审批", "已通过", "已驳回"}

// Dictionaries GET /api/meta/dictionaries 字典项。
func Dictionaries(c *gin.Context) {
	reg := ontology.Load()
	c.JSON(200, errcode.OK(map[string]any{
		"CUSTOMER_TYPE":  common.OrEmpty(reg.GetDictionaryItems("DICT-CUSTOMER-TYPE", "CUSTOMER_TYPE")),
		"CUSTOMER_LEVEL": common.OrEmpty(reg.GetDictionaryItems("DICT-CUSTOMER-LEVEL", "CUSTOMER_LEVEL")),
	}))
}

// CustomerStatus GET /api/meta/customer-status 客户状态清单。
func CustomerStatus(c *gin.Context) {
	c.JSON(200, errcode.OK(customerStatuses))
}

// Rules GET /api/meta/rules M3 规则清单。
func Rules(c *gin.Context) {
	reg := ontology.Load()
	var out []map[string]any
	for _, r := range reg.Rules {
		out = append(out, map[string]any{
			"id":           r["id"],
			"name":         orDefaultStr(r["name"], r["id"]),
			"description":  r["description"],
			"expression":   strings.TrimSpace(service.Str(r["expression"])),
			"rule_type":    r["ruleType"],
			"input_params": common.OrEmpty(r["inputParams"]),
		})
	}
	if out == nil {
		out = []map[string]any{}
	}
	c.JSON(200, errcode.OK(out))
}

func orDefaultStr(v any, def any) any {
	if v == nil || service.Str(v) == "" {
		return def
	}
	return v
}
