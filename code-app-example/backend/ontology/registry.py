import json
import os

import yaml

from config.settings import resolve_models_dir

# 运行时语义注册表：对齐《AI 原生应用技术架构设计文档》第 7 章
registry = {
    "aggregates": {},
    "entities": {},
    "data_dictionaries": {},
    "behaviors": {},
    "rules": {},
    "actors": {},
    "roles": {},
    "permissions": {},
    "flows": {},
    "query_reports": {},
    "screens": {},
    "menus": {},
    "api_capabilities": {},
    "ai_tools": {},
    "db_whitelist": {},
}


def _read_yaml(path):
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def load_ontology(models_dir=None):
    models_dir = models_dir or resolve_models_dir()
    manifest_path = os.path.join(models_dir, "manifest.json")
    model_files = []
    if os.path.exists(manifest_path):
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        model_files = [os.path.join(models_dir, m) for m in manifest.get("model_files", [])]

    for path in model_files:
        if not os.path.exists(path):
            continue
        data = _read_yaml(path)
        _register(data)

    return registry


def _register(data):
    mt = data.get("model_type")
    if mt == "OBJECT":
        for agg in data.get("aggregates", []):
            registry["aggregates"][agg["id"]] = agg
            alias = agg.get("alias", "")
            if alias:
                registry["db_whitelist"][_to_snake(alias)] = {
                    "table": _to_snake(alias),
                    "alias": alias,
                    "attributes": [a["name"] for a in agg.get("attributes", [])],
                }
                for e in agg.get("entities", []):
                    registry["entities"][e["alias"]] = e
                    registry["db_whitelist"][_to_snake(e["alias"])] = {
                        "table": _to_snake(e["alias"]),
                        "alias": e["alias"],
                        "attributes": [a["name"] for a in e.get("attributes", [])],
                    }
        for dic in data.get("data_dictionaries", []):
            registry["data_dictionaries"][dic["id"]] = dic
    elif mt == "BEHAVIOR":
        for b in data.get("behaviors", []):
            registry["behaviors"][b["id"]] = b
    elif mt == "RULE":
        for r in data.get("rules", []):
            registry["rules"][r["id"]] = r
    elif mt == "ACTOR":
        for r in data.get("roles", []):
            registry["roles"][r["roleId"]] = r
        for p in data.get("permissions", []):
            registry["permissions"][p["permissionId"]] = p
    elif mt == "FLOW":
        for f in data.get("flows", []):
            registry["flows"][f["id"]] = f
    elif mt == "REPORT":
        for r in data.get("query_reports", []):
            registry["query_reports"][r["id"]] = r
    elif mt == "UI":
        app = data.get("application", {})
        registry["menus"] = app.get("menus", [])
        for s in data.get("screens", []):
            registry["screens"][s["screenId"]] = s


def _to_snake(name):
    out = []
    for i, ch in enumerate(name):
        if ch.isupper() and i > 0:
            out.append("_")
        out.append(ch.lower())
    return "".join(out)


def get_dictionary_items(dict_id, type_code=None):
    dic = registry["data_dictionaries"].get(dict_id)
    if not dic:
        return []
    for t in dic.get("types", []):
        if type_code is None or t.get("typeCode") == type_code:
            return [
                {"code": it["code"], "label": it["label"]}
                for it in t.get("items", [])
                if it.get("enabled", True)
            ]
    return []
