// Package ontology —— 运行时语义注册表(对齐《AI 原生应用技术架构设计文档》第 7 章)。
//
// 从 models/ 七模型 YAML(manifest.json 登记)加载聚合/实体/字典/行为/规则/主体/流程/报表/屏幕,
// 供流程网关规则求值、meta 接口、种子(流程定义)消费。
package ontology

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"gopkg.in/yaml.v3"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/config"
)

// Registry 运行时注册表(与 Python 版同构)。
type Registry struct {
	Aggregates       map[string]map[string]any `yaml:"-"`
	Entities         map[string]map[string]any
	DataDictionaries map[string]map[string]any
	Behaviors        map[string]map[string]any
	Rules            map[string]map[string]any
	Actors           map[string]map[string]any
	Roles            map[string]map[string]any
	Permissions      map[string]map[string]any
	Flows            map[string]map[string]any
	QueryReports     map[string]map[string]any
	Screens          map[string]map[string]any
	Menus            []any
	DBWhitelist      map[string]WhitelistEntry
}

// WhitelistEntry DB 白名单条目(只读 SQL 校验用)。
type WhitelistEntry struct {
	Table      string
	Alias      string
	Attributes []string
}

var (
	reg     *Registry
	regOnce sync.Once
)

// Load 加载七模型(幂等)。
func Load() *Registry {
	regOnce.Do(func() {
		reg = &Registry{
			Aggregates:       map[string]map[string]any{},
			Entities:         map[string]map[string]any{},
			DataDictionaries: map[string]map[string]any{},
			Behaviors:        map[string]map[string]any{},
			Rules:            map[string]map[string]any{},
			Actors:           map[string]map[string]any{},
			Roles:            map[string]map[string]any{},
			Permissions:      map[string]map[string]any{},
			Flows:            map[string]map[string]any{},
			QueryReports:     map[string]map[string]any{},
			Screens:          map[string]map[string]any{},
			DBWhitelist:      map[string]WhitelistEntry{},
		}
		dir := config.Config.Ontology.ModelsDir
		manifestPath := filepath.Join(dir, "manifest.json")
		var files []string
		if raw, err := os.ReadFile(manifestPath); err == nil {
			var manifest struct {
				ModelFiles []string `json:"model_files"`
			}
			// manifest 是 JSON,用 yaml 兼容解析(JSON 是 YAML 子集)
			if err := yaml.Unmarshal(raw, &manifest); err == nil {
				for _, f := range manifest.ModelFiles {
					files = append(files, filepath.Join(dir, f))
				}
			}
		}
		if files == nil {
			// 无 manifest 时扫描全部 yaml
			entries, _ := os.ReadDir(dir)
			for _, e := range entries {
				if !e.IsDir() && filepath.Ext(e.Name()) == ".yaml" {
					files = append(files, filepath.Join(dir, e.Name()))
				}
			}
		}
		for _, path := range files {
			raw, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			var data map[string]any
			if err := yaml.Unmarshal(raw, &data); err != nil {
				fmt.Printf("[ontology] 解析失败 %s: %v\n", path, err)
				continue
			}
			reg.register(data)
		}
	})
	return reg
}

func (r *Registry) register(data map[string]any) {
	mt, _ := data["model_type"].(string)
	asMaps := func(v any) []map[string]any {
		list, _ := v.([]any)
		out := make([]map[string]any, 0, len(list))
		for _, item := range list {
			if m, ok := item.(map[string]any); ok {
				out = append(out, m)
			}
		}
		return out
	}
	switch mt {
	case "OBJECT":
		for _, agg := range asMaps(data["aggregates"]) {
			id, _ := agg["id"].(string)
			r.Aggregates[id] = agg
			alias, _ := agg["alias"].(string)
			if alias == "" {
				continue
			}
			var attrs []string
			for _, a := range asMaps(agg["attributes"]) {
				if n, ok := a["name"].(string); ok {
					attrs = append(attrs, n)
				}
			}
			r.DBWhitelist[toSnake(alias)] = WhitelistEntry{Table: toSnake(alias), Alias: alias, Attributes: attrs}
			for _, e := range asMaps(agg["entities"]) {
				ealias, _ := e["alias"].(string)
				if ealias == "" {
					continue
				}
				r.Entities[ealias] = e
				var eattrs []string
				for _, a := range asMaps(e["attributes"]) {
					if n, ok := a["name"].(string); ok {
						eattrs = append(eattrs, n)
					}
				}
				r.DBWhitelist[toSnake(ealias)] = WhitelistEntry{Table: toSnake(ealias), Alias: ealias, Attributes: eattrs}
			}
		}
		for _, dic := range asMaps(data["data_dictionaries"]) {
			id, _ := dic["id"].(string)
			r.DataDictionaries[id] = dic
		}
	case "BEHAVIOR":
		for _, b := range asMaps(data["behaviors"]) {
			id, _ := b["id"].(string)
			r.Behaviors[id] = b
		}
	case "RULE":
		for _, rule := range asMaps(data["rules"]) {
			id, _ := rule["id"].(string)
			r.Rules[id] = rule
		}
	case "ACTOR":
		for _, role := range asMaps(data["roles"]) {
			id, _ := role["roleId"].(string)
			r.Roles[id] = role
		}
		for _, p := range asMaps(data["permissions"]) {
			id, _ := p["permissionId"].(string)
			r.Permissions[id] = p
		}
	case "FLOW":
		for _, f := range asMaps(data["flows"]) {
			id, _ := f["id"].(string)
			r.Flows[id] = f
		}
	case "REPORT":
		for _, q := range asMaps(data["query_reports"]) {
			id, _ := q["id"].(string)
			r.QueryReports[id] = q
		}
	case "UI":
		if app, ok := data["application"].(map[string]any); ok {
			r.Menus, _ = app["menus"].([]any)
		}
		for _, s := range asMaps(data["screens"]) {
			id, _ := s["screenId"].(string)
			r.Screens[id] = s
		}
	}
}

// GetDictionaryItems 取字典项(启用项),对齐 Python get_dictionary_items。
func (r *Registry) GetDictionaryItems(dictID, typeCode string) []map[string]string {
	dic, ok := r.DataDictionaries[dictID]
	if !ok {
		return nil
	}
	types, _ := dic["types"].([]any)
	for _, t := range types {
		tm, ok := t.(map[string]any)
		if !ok {
			continue
		}
		if typeCode != "" {
			tc, _ := tm["typeCode"].(string)
			if tc != typeCode {
				continue
			}
		}
		items, _ := tm["items"].([]any)
		var out []map[string]string
		for _, it := range items {
			im, ok := it.(map[string]any)
			if !ok {
				continue
			}
			if enabled, ok := im["enabled"].(bool); ok && !enabled {
				continue
			}
			code, _ := im["code"].(string)
			label, _ := im["label"].(string)
			out = append(out, map[string]string{"code": code, "label": label})
		}
		return out
	}
	return nil
}

func toSnake(name string) string {
	var out []byte
	for i := 0; i < len(name); i++ {
		c := name[i]
		if c >= 'A' && c <= 'Z' {
			if i > 0 {
				out = append(out, '_')
			}
			out = append(out, c+('a'-'A'))
		} else {
			out = append(out, c)
		}
	}
	return string(out)
}
