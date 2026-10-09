// Package business —— 业务域控制器(客户申请 + 审批中心;契约与旧版一致)。
package business

import (
	"fmt"

	"github.com/gin-gonic/gin"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/api/common"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/service"
)

// ---------- 客户申请(customer) ----------

// CustomerList GET /api/customer
func CustomerList(c *gin.Context) {
	page, size := common.PageOf(c)
	p, err := service.ListCustomers(page, size, map[string]any{
		"customer_no":   c.Query("customer_no"),
		"customer_name": c.Query("customer_name"),
		"status":        c.Query("status"),
	})
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, p, "")
}

// CustomerGet GET /api/customer/:id
func CustomerGet(c *gin.Context) {
	row, err := service.GetCustomer(common.PathID(c, "id"))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, row, "")
}

// CustomerCreateDraft POST /api/customer/draft
func CustomerCreateDraft(c *gin.Context) {
	row, err := service.CreateCustomerDraft(common.BindJSON(c), common.UserOf(c))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, row, "暂存成功")
}

// CustomerUpdateDraft PUT /api/customer/:id/draft
func CustomerUpdateDraft(c *gin.Context) {
	row, err := service.UpdateCustomerDraft(common.PathID(c, "id"), common.BindJSON(c), common.UserOf(c))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, row, "暂存成功")
}

// CustomerSubmit POST /api/customer/:id/submit
func CustomerSubmit(c *gin.Context) {
	row, err := service.SubmitCustomer(common.PathID(c, "id"), common.UserOf(c))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	u := common.UserOf(c)
	service.WriteAudit(nil, u.ID, u.Username, "SUBMIT", fmt.Sprintf("提交客户申请 #%d %s", common.PathID(c, "id"), service.Str(row["customer_no"])))
	common.OKJSON(c, row, "提交成功")
}

// CustomerWithdraw POST /api/customer/:id/withdraw
func CustomerWithdraw(c *gin.Context) {
	row, err := service.WithdrawCustomer(common.PathID(c, "id"), common.UserOf(c))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, row, "已撤回")
}
