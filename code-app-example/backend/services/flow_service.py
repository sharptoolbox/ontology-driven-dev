import json

import db
from engine.flow_engine import FlowEngine


def list_definitions(page=1, size=10, keyword=""):
    where = ""
    params = []
    if keyword:
        where = "WHERE name LIKE ? OR code LIKE ?"
        kw = f"%{keyword}%"
        params = [kw, kw]
    total = db.query_one(f"SELECT COUNT(*) AS c FROM flow_definition {where}", params)["c"]
    rows = db.query(
        f"SELECT id, code, name, flow_type, trigger_type, trigger_behavior, description, version, status, created_at, updated_at FROM flow_definition {where} ORDER BY id LIMIT ? OFFSET ?",
        params + [size, (page - 1) * size],
    )
    return {"list": rows, "total": total, "page": page, "size": size}


def get_definition(def_id):
    row = db.query_one("SELECT * FROM flow_definition WHERE id = ?", (def_id,))
    if row:
        row["node_graph"] = json.loads(row["node_graph"] or "{}")
    return row


def create_definition(data, user_id):
    code = data["code"]
    if db.query_one("SELECT id FROM flow_definition WHERE code = ?", (code,)):
        raise ValueError("流程编码已存在")
    node_graph = data.get("node_graph", {"nodes": [], "edges": []})
    def_id = db.execute(
        """
        INSERT INTO flow_definition (code, name, flow_type, trigger_type, trigger_behavior, description, node_graph, version, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?)
        """,
        (
            code, data["name"], data.get("flow_type", "APPROVAL"), data.get("trigger_type", "MANUAL"),
            data.get("trigger_behavior"), data.get("description"),
            json.dumps(node_graph, ensure_ascii=False), user_id,
        ),
    )[0]
    return def_id


def update_definition(def_id, data):
    existing = db.query_one("SELECT * FROM flow_definition WHERE id = ?", (def_id,))
    if not existing:
        raise ValueError("流程定义不存在")
    if existing["status"] == 1:
        raise ValueError("已发布流程不可直接编辑，请停用后修改或新建版本")
    node_graph = data.get("node_graph", json.loads(existing["node_graph"] or "{}"))
    db.execute(
        """
        UPDATE flow_definition SET name=?, flow_type=?, trigger_type=?, trigger_behavior=?, description=?, node_graph=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
        """,
        (
            data.get("name", existing["name"]), data.get("flow_type", existing["flow_type"]),
            data.get("trigger_type", existing["trigger_type"]), data.get("trigger_behavior"),
            data.get("description", existing["description"]),
            json.dumps(node_graph, ensure_ascii=False), def_id,
        ),
    )
    return def_id


def publish_definition(def_id):
    existing = db.query_one("SELECT * FROM flow_definition WHERE id = ?", (def_id,))
    if not existing:
        raise ValueError("流程定义不存在")
    graph = json.loads(existing["node_graph"] or "{}")
    _validate_graph(graph)
    db.execute(
        "UPDATE flow_definition SET status = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (def_id,),
    )
    return def_id


def _validate_graph(graph):
    nodes = graph.get("nodes", [])
    types = [n.get("type") for n in nodes]
    if types.count("start") != 1:
        raise ValueError("流程必须包含且仅包含一个开始节点")
    if types.count("end") < 1:
        raise ValueError("流程必须包含至少一个结束节点")
    for n in nodes:
        if n.get("type") in ("approval_task", "user_task") and not n.get("role_ref"):
            raise ValueError(f"节点「{n.get('name')}」必须配置角色 role_ref")


def list_instances(page=1, size=10, filters=None):
    filters = filters or {}
    where = "WHERE 1=1"
    params = []
    if filters.get("status"):
        where += " AND i.status = ?"
        params.append(filters["status"])
    if filters.get("keyword"):
        where += " AND (i.business_key LIKE ?)"
        params.append(f"%{filters['keyword']}%")
    total = db.query_one(
        f"SELECT COUNT(*) AS c FROM flow_instance i JOIN flow_definition d ON d.id = i.def_id {where}",
        params,
    )["c"]
    rows = db.query(
        f"""
        SELECT i.*, d.name AS def_name, d.code AS def_code
        FROM flow_instance i JOIN flow_definition d ON d.id = i.def_id
        {where} ORDER BY i.id DESC LIMIT ? OFFSET ?
        """,
        params + [size, (page - 1) * size],
    )
    return {"list": rows, "total": total, "page": page, "size": size}


def get_instance(instance_id):
    inst = db.query_one("SELECT * FROM flow_instance WHERE id = ?", (instance_id,))
    if not inst:
        return None
    definition = db.query_one("SELECT * FROM flow_definition WHERE id = ?", (inst["def_id"],))
    inst["definition"] = {
        "id": definition["id"], "name": definition["name"], "code": definition["code"],
        "node_graph": json.loads(definition["node_graph"] or "{}"),
    }
    inst["tasks"] = db.query(
        "SELECT * FROM flow_task WHERE instance_id = ? ORDER BY id", (instance_id,))
    inst["history"] = db.query(
        "SELECT * FROM flow_history WHERE instance_id = ? ORDER BY id", (instance_id,))
    return inst


def terminate_instance(instance_id, user):
    inst = db.query_one("SELECT * FROM flow_instance WHERE id = ?", (instance_id,))
    if not inst:
        raise ValueError("流程实例不存在")
    if inst["status"] != "RUNNING":
        raise ValueError("仅运行中的实例可终止")
    db.execute(
        "UPDATE flow_instance SET status = 'TERMINATED', ended_at = CURRENT_TIMESTAMP WHERE id = ?",
        (instance_id,),
    )
    db.execute("UPDATE flow_task SET status = 'CANCEL' WHERE instance_id = ? AND status = 'TODO'", (instance_id,))
    db.execute(
        "INSERT INTO flow_history (instance_id, operator_id, operator_name, action, comment) VALUES (?, ?, ?, 'TERMINATE', ?)",
        (instance_id, user["id"], user["real_name"], "强制终止"),
    )


def list_tasks(page=1, size=10, filters=None):
    filters = filters or {}
    where = "WHERE 1=1"
    params = []
    if filters.get("status"):
        where += " AND t.status = ?"
        params.append(filters["status"])
    total = db.query_one(
        f"SELECT COUNT(*) AS c FROM flow_task t JOIN flow_instance i ON i.id = t.instance_id {where}",
        params,
    )["c"]
    rows = db.query(
        f"""
        SELECT t.*, i.business_key
        FROM flow_task t JOIN flow_instance i ON i.id = t.instance_id
        {where} ORDER BY t.id DESC LIMIT ? OFFSET ?
        """,
        params + [size, (page - 1) * size],
    )
    return {"list": rows, "total": total, "page": page, "size": size}


def transfer_task(task_id, assignee_id):
    task = db.query_one("SELECT * FROM flow_task WHERE id = ?", (task_id,))
    if not task or task["status"] != "TODO":
        raise ValueError("任务不存在或已处理")
    assignee = db.query_one("SELECT * FROM sys_user WHERE id = ?", (assignee_id,))
    if not assignee:
        raise ValueError("目标用户不存在")
    db.execute(
        "UPDATE flow_task SET assignee_id = ?, assignee_name = ? WHERE id = ?",
        (assignee_id, assignee["real_name"] or assignee["username"], task_id),
    )


def urge_task(task_id, user):
    task = db.query_one("SELECT * FROM flow_task WHERE id = ?", (task_id,))
    if not task or task["status"] != "TODO":
        raise ValueError("任务不存在或已处理")
    db.execute(
        "INSERT INTO flow_history (instance_id, activity_id, activity_name, operator_id, operator_name, action, comment) VALUES (?, ?, ?, ?, ?, 'URGE', ?)",
        (task["instance_id"], task["activity_id"], task["activity_name"], user["id"], user["real_name"], "催办"),
    )
