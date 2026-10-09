// Package flow —— 流程管理控制器(定义/实例/任务;契约与旧版一致)。
package flow

import (
	"github.com/gin-gonic/gin"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/api/common"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/service"
)

// DefinitionList GET /api/flow/definitions
func DefinitionList(c *gin.Context) {
	page, size := common.PageOf(c)
	p, err := service.ListDefinitions(page, size, c.Query("keyword"))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, p, "")
}

// DefinitionGet GET /api/flow/definitions/:id
func DefinitionGet(c *gin.Context) {
	row, err := service.GetDefinition(common.PathID(c, "id"))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, row, "")
}

// DefinitionGraph GET /api/flow/definitions/:id/graph
func DefinitionGraph(c *gin.Context) {
	g, err := service.GetDefinitionGraph(common.PathID(c, "id"))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, g, "")
}

// DefinitionCreate POST /api/flow/definitions
func DefinitionCreate(c *gin.Context) {
	id, err := service.CreateDefinition(common.BindJSON(c), common.UserOf(c).ID)
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, gin.H{"id": id}, "创建成功")
}

// DefinitionUpdate PUT /api/flow/definitions/:id
func DefinitionUpdate(c *gin.Context) {
	if err := service.UpdateDefinition(common.PathID(c, "id"), common.BindJSON(c)); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, nil, "更新成功")
}

// DefinitionPublish POST /api/flow/definitions/:id/publish
func DefinitionPublish(c *gin.Context) {
	if err := service.PublishDefinition(common.PathID(c, "id")); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, nil, "发布成功")
}

// InstanceList GET /api/flow/instances
func InstanceList(c *gin.Context) {
	page, size := common.PageOf(c)
	p, err := service.ListInstances(page, size, map[string]any{
		"status":  c.Query("status"),
		"keyword": c.Query("keyword"),
	})
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, p, "")
}

// InstanceGet GET /api/flow/instances/:id
func InstanceGet(c *gin.Context) {
	row, err := service.GetInstanceDetail(common.PathID(c, "id"))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, row, "")
}

// InstanceTerminate PUT /api/flow/instances/:id/terminate
func InstanceTerminate(c *gin.Context) {
	if err := service.TerminateInstance(common.PathID(c, "id"), common.UserOf(c)); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, nil, "已终止")
}

// TaskList GET /api/flow/tasks
func TaskList(c *gin.Context) {
	page, size := common.PageOf(c)
	p, err := service.ListTasks(page, size, map[string]any{
		"status": c.Query("status"),
	})
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, p, "")
}

// TaskTransfer PUT /api/flow/tasks/:id/transfer
func TaskTransfer(c *gin.Context) {
	body := common.BindJSON(c)
	assigneeID := service.Int(body["assignee_id"])
	if err := service.TransferTask(common.PathID(c, "id"), assigneeID); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, nil, "转办成功")
}

// TaskUrge PUT /api/flow/tasks/:id/urge
func TaskUrge(c *gin.Context) {
	if err := service.UrgeTask(common.PathID(c, "id"), common.UserOf(c)); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, nil, "催办成功")
}
