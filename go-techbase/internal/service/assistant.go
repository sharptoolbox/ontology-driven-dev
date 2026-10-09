// Package service —— AI 智能助理（v3 补齐：工作台业务问答与操作指引）。
//
// 口径：LLM 优先（管理控制台配置启用时，OpenAI 兼容协议），失败/未配置降级为
// 规则式应答（待办/客户/流程/指引，全部走既有只读查询）。
package service

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/llmcfg"
)

// AssistantReply 助理应答。
type AssistantReply struct {
	Answer string   `json:"answer"`
	Hints  []string `json:"hints"`  // 建议追问
	Action string   `json:"action"` // 建议跳转路径(可空)
}

// AssistantChat 助理问答入口。accountID=0 → 首个启用账号;model 空 → 账号默认模型;
// temperature<=0 → 账号默认温度。LLM 失败/未配置一律降级规则应答。
func AssistantChat(uid int64, question string, accountID int64, model string, temperature float64) (*AssistantReply, error) {
	q := strings.TrimSpace(question)

	// LLM 优先（多供应商账号;系统提示词声明只读边界与角色）
	if acct := pickAccount(accountID); acct != nil {
		if model == "" {
			model = acct.DefaultModelResolve()
		}
		answer, err := llmcfg.ChatAccount(context.Background(), acct, model, temperature, []llmcfg.Message{
			{Role: "system", Content: "你是 OPIC 技术底座的 AI 智能助理。只回答与本系统相关的问题" +
				"（待办/客户/审批/流程/操作指引）。你只能给出文字指引，不能执行任何写操作。" +
				"与系统无关的问题请礼貌拒绝。用中文简洁回答。"},
			{Role: "user", Content: q},
		})
		if err == nil {
			return &AssistantReply{Answer: answer, Hints: []string{"我有哪些待办？", "我的客户申请进展？"}}, nil
		}
		log.Printf("[assistant] LLM(%s/%s) 调用失败,降级规则匹配: %v", acct.Name, model, err)
	} else if cfg := llmcfg.Current(); cfg != nil {
		// 兼容旧单行配置(未迁移成账号时)
		answer, err := llmcfg.Chat(context.Background(), cfg, []llmcfg.Message{
			{Role: "system", Content: "你是 OPIC 技术底座的 AI 智能助理。只回答与本系统相关的问题" +
				"（待办/客户/审批/流程/操作指引）。你只能给出文字指引，不能执行任何写操作。" +
				"与系统无关的问题请礼貌拒绝。用中文简洁回答。"},
			{Role: "user", Content: q},
		})
		if err == nil {
			return &AssistantReply{Answer: answer, Hints: []string{"我有哪些待办？", "我的客户申请进展？"}}, nil
		}
		log.Printf("[assistant] LLM 调用失败,降级规则匹配: %v", err)
	}

	lq := strings.ToLower(q)
	switch {
	case strings.Contains(q, "待办") || strings.Contains(lq, "todo"):
		tasks, err := WorkbenchTodo(uid, 1, 10)
		if err != nil {
			return nil, err
		}
		var b strings.Builder
		fmt.Fprintf(&b, "您当前有 %d 条待办任务。", tasks.Total)
		for i, t := range tasks.List {
			if i >= 5 {
				break
			}
			fmt.Fprintf(&b, "\n%d. %s（%s，来自 %s）", i+1, t["activity_name"], t["customer_name"], t["applicant_name"])
		}
		if tasks.Total > 5 {
			fmt.Fprintf(&b, "\n……其余 %d 条请在「审批中心-我的待办」查看。", tasks.Total-5)
		}
		return &AssistantReply{Answer: b.String(), Action: "/workbench/todo",
			Hints: []string{"如何审批任务？", "我的客户申请进展？"}}, nil
	case strings.Contains(q, "客户") || strings.Contains(lq, "customer"):
		row, err := qOne(`SELECT COUNT(*) AS n, SUM(CASE WHEN status = '已通过' THEN 1 ELSE 0 END) AS passed
			FROM customer_application WHERE applicant_id = ?`, uid)
		if err != nil {
			return nil, err
		}
		return &AssistantReply{
			Answer: fmt.Sprintf("您累计提交 %d 条客户申请，其中 %d 条已通过。",
				Int(row["n"]), Int(row["passed"])),
			Action: "/customer/query", Hints: []string{"我有哪些待办？", "如何发起新申请？"},
		}, nil
	case strings.Contains(q, "审批") || strings.Contains(q, "怎么操作") || strings.Contains(q, "如何"):
		return &AssistantReply{
			Answer: "审批操作指引：① 进入「审批中心-我的待办」；② 查看申请详情与流转意见；" +
				"③ 通过/驳回/退回并填写意见。经理审批后自动流转部门总经理终审，全程留痕可查。" +
				"系统管理人员可从右上角进入「管理控制台」维护用户、角色与权限。",
			Action: "/workbench/todo", Hints: []string{"我有哪些待办？", "流程有哪些节点？"},
		}, nil
	case strings.Contains(q, "流程") || strings.Contains(q, "节点"):
		return &AssistantReply{
			Answer: "客户申请流程为三级流转：提交 → 客户经理审批 → 部门总经理终审 → 归档。" +
				"驳回后申请人可修改重新提交；流程定义可在「流程管理-流程定义」可视化调整。",
			Action: "/flow/definitions", Hints: []string{"我有哪些待办？", "审批怎么操作？"},
		}, nil
	case strings.Contains(q, "管理台") || strings.Contains(q, "管理控制台") || strings.Contains(q, "admin"):
		return &AssistantReply{
			Answer: "管理控制台（/admin）面向系统管理员：仪表盘、用户/角色/权限/资源管理、流程管理。" +
				"工作台右上角头像菜单可直达。gopherforge 视觉体系，深空玻璃双主题。",
			Action: "/admin/dashboard", Hints: []string{"我有哪些待办？"},
		}, nil
	default:
		return &AssistantReply{
			Answer: "我是 OPIC 工作台助理，可以帮您查询待办任务、客户申请进展、解释审批流程、" +
				"指引管理控制台使用。试试下方建议问题。",
			Hints: []string{"我有哪些待办？", "我的客户申请进展？", "审批怎么操作？", "流程有哪些节点？"},
		}, nil
	}
}

// pickAccount 选定供应商账号（accountID=0 → 首个启用账号;指定 id 须已启用）。
func pickAccount(accountID int64) *llmcfg.Account {
	accts := llmcfg.EnabledAccounts()
	if len(accts) == 0 {
		return nil
	}
	if accountID == 0 {
		return &accts[0]
	}
	for i := range accts {
		if accts[i].ID == accountID {
			return &accts[i]
		}
	}
	return nil
}

// AssistantModels 登录用户可选的模型清单（启用账号 × 模型目录）。
type AssistantModel struct {
	AccountID    int64    `json:"account_id"`
	AccountName  string   `json:"account_name"`
	Provider     string   `json:"provider"`
	Models       []string `json:"models"`
	DefaultModel string   `json:"default_model"`
}

// AssistantModelOptions 助理模型选择器数据源。
func AssistantModelOptions() []AssistantModel {
	accts := llmcfg.EnabledAccounts()
	out := make([]AssistantModel, 0, len(accts))
	for _, a := range accts {
		out = append(out, AssistantModel{
			AccountID: a.ID, AccountName: a.Name, Provider: a.Provider,
			Models: a.ModelList(), DefaultModel: a.DefaultModelResolve(),
		})
	}
	return out
}
