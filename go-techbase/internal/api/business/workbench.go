package business

import (
	"fmt"

	"github.com/gin-gonic/gin"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/api/common"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/service"
)

// ---------- 审批中心(workbench) ----------

// WorkbenchTodo GET /api/workbench/todo
func WorkbenchTodo(c *gin.Context) {
	page, size := common.PageOf(c)
	p, err := service.WorkbenchTodo(common.UserOf(c).ID, page, size)
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, p, "")
}

// WorkbenchDone GET /api/workbench/done
func WorkbenchDone(c *gin.Context) {
	page, size := common.PageOf(c)
	p, err := service.WorkbenchDone(common.UserOf(c).ID, page, size)
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, p, "")
}

// WorkbenchRequested GET /api/workbench/requested
func WorkbenchRequested(c *gin.Context) {
	page, size := common.PageOf(c)
	p, err := service.WorkbenchRequested(common.UserOf(c).ID, page, size)
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, p, "")
}

// WorkbenchApprove POST /api/workbench/todo/:id/approve
func WorkbenchApprove(c *gin.Context) {
	body := common.BindJSON(c)
	out, err := service.ApproveTask(common.PathID(c, "id"), service.Str(body["comment"]), common.UserOf(c))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	u := common.UserOf(c)
	service.WriteAudit(nil, u.ID, u.Username, "APPROVE", fmt.Sprintf("审批任务 #%d %s", common.PathID(c, "id"), service.Str(body["comment"])))
	common.OKJSON(c, out, "审批通过")
}

// WorkbenchReject POST /api/workbench/todo/:id/reject
func WorkbenchReject(c *gin.Context) {
	body := common.BindJSON(c)
	out, err := service.RejectTask(common.PathID(c, "id"), service.Str(body["comment"]), common.UserOf(c))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	u := common.UserOf(c)
	service.WriteAudit(nil, u.ID, u.Username, "REJECT", fmt.Sprintf("驳回任务 #%d %s", common.PathID(c, "id"), service.Str(body["comment"])))
	common.OKJSON(c, out, "已驳回")
}

// WorkbenchReturn POST /api/workbench/todo/:id/return
func WorkbenchReturn(c *gin.Context) {
	body := common.BindJSON(c)
	out, err := service.ReturnTask(common.PathID(c, "id"), service.Str(body["target_activity_id"]),
		service.Str(body["comment"]), common.UserOf(c))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	u := common.UserOf(c)
	service.WriteAudit(nil, u.ID, u.Username, "RETURN", fmt.Sprintf("退回任务 #%d %s", common.PathID(c, "id"), service.Str(body["comment"])))
	common.OKJSON(c, out, "已退回")
}
