import json

import db
from engine.flow_engine import FlowEngine
from services import auth_service, contract_service, invoice_service, sync_service


def _vars(inst):
    try:
        return json.loads(inst["variables"] or "{}")
    except Exception:
        return {}


def _biz_status(biz_type, biz_id):
    if biz_type == "CONTRACT":
        row = db.query_one("SELECT status FROM contract WHERE id=? AND flag=1", (biz_id,))
        return row["status"] if row else None
    if biz_type == "INVOICE":
        row = db.query_one("SELECT approval_status FROM invoice WHERE id=? AND flag=1", (biz_id,))
        return row["approval_status"] if row else None
    return None


def _user_role_codes(user_id):
    return [r["code"] for r in auth_service.get_user_roles(user_id)]


def _role_in_clause(role_codes):
    if not role_codes:
        return "NULL"
    return ",".join("?" for _ in role_codes)


def _is_admin_id(user_id):
    return "*" in auth_service.get_permission_codes(user_id)


def todo(user_id, page=1, size=10):
    if _is_admin_id(user_id):
        where = "t.status='TODO'"
        params: list = []
    else:
        role_codes = _user_role_codes(user_id)
        where = f"t.status='TODO' AND (t.assignee_id=? OR t.role_ref IN ({_role_in_clause(role_codes)}))"
        params = [user_id] + role_codes
    total = db.query_one(f"SELECT COUNT(*) AS c FROM flow_task t WHERE {where}", params)["c"]
    rows = db.query(
        f"""
        SELECT t.*, i.variables, i.creator_id, i.started_at
        FROM flow_task t JOIN flow_instance i ON i.id = t.instance_id
        WHERE {where}
        ORDER BY t.created_at DESC LIMIT ? OFFSET ?
        """,
        params + [size, (page - 1) * size],
    )
    for r in rows:
        v = _vars(r)
        r["biz_type"] = v.get("biz_type")
        r["biz_id"] = v.get("biz_id")
        r["biz_no"] = v.get("biz_no")
        r["biz_name"] = v.get("biz_name")
    return {"list": rows, "total": total, "page": page, "size": size}


def done(user_id, page=1, size=10):
    if _is_admin_id(user_id):
        where = "t.status IN ('DONE','CANCEL')"
        params: list = []
    else:
        role_codes = _user_role_codes(user_id)
        where = f"t.status IN ('DONE','CANCEL') AND (t.assignee_id=? OR t.role_ref IN ({_role_in_clause(role_codes)}))"
        params = [user_id] + role_codes
    total = db.query_one(f"SELECT COUNT(*) AS c FROM flow_task t WHERE {where}", params)["c"]
    rows = db.query(
        f"""
        SELECT t.*, i.variables
        FROM flow_task t JOIN flow_instance i ON i.id = t.instance_id
        WHERE {where}
        ORDER BY t.done_at DESC LIMIT ? OFFSET ?
        """,
        params + [size, (page - 1) * size],
    )
    for r in rows:
        v = _vars(r)
        r["biz_type"] = v.get("biz_type")
        r["biz_id"] = v.get("biz_id")
        r["biz_no"] = v.get("biz_no")
        r["biz_name"] = v.get("biz_name")
    return {"list": rows, "total": total, "page": page, "size": size}


def requested(user_id, page=1, size=10):
    total = db.query_one("SELECT COUNT(*) AS c FROM flow_instance WHERE creator_id=?", (user_id,))["c"]
    rows = db.query(
        "SELECT * FROM flow_instance WHERE creator_id=? ORDER BY id DESC LIMIT ? OFFSET ?",
        (user_id, size, (page - 1) * size),
    )
    for r in rows:
        v = _vars(r)
        r["biz_type"] = v.get("biz_type")
        r["biz_id"] = v.get("biz_id")
        r["biz_no"] = v.get("biz_no")
        r["biz_name"] = v.get("biz_name")
        r["biz_status"] = _biz_status(v.get("biz_type"), v.get("biz_id"))
    return {"list": rows, "total": total, "page": page, "size": size}


def is_admin(user):
    if not user:
        return False
    return "*" in auth_service.get_permission_codes(user["id"])


def _load_task_and_check(task_id, user, conn=None):
    task = db.query_one("SELECT * FROM flow_task WHERE id = ?", (task_id,), conn)
    if not task:
        raise ValueError("任务不存在")
    if task["status"] != "TODO":
        raise ValueError("任务已处理，不能重复操作")
    if is_admin(user):
        return task
    if task["assignee_id"] == user["id"]:
        return task
    role_codes = _user_role_codes(user["id"])
    if task["role_ref"] and task["role_ref"] in role_codes:
        return task
    raise ValueError("该任务不属于当前用户")


def _write_record_and_sync(conn, task, action, comment, user):
    inst = db.query_one("SELECT * FROM flow_instance WHERE id = ?", (task["instance_id"],), conn)
    v = _vars(inst)
    result = "APPROVE" if action == "APPROVE" else "REJECT"
    sync_service.write_approval_record(
        conn, v.get("biz_type"), v.get("biz_no"), task["activity_name"], task["role_ref"], user["id"], result, comment)
    bt = v.get("biz_type")
    if bt == "CONTRACT":
        contract_service.sync_status_from_instance(task["instance_id"], conn)
    elif bt == "INVOICE":
        invoice_service.sync_status_from_instance(task["instance_id"], conn)


def approve(task_id, comment, user):
    def _do(conn):
        task = _load_task_and_check(task_id, user, conn)
        inst = db.query_one("SELECT * FROM flow_instance WHERE id=?", (task["instance_id"],), conn)
        v = _vars(inst)
        if v.get("submitter_id") == user["id"] and not is_admin(user):
            raise ValueError("不能审批本人提交的单据")
        FlowEngine(conn).approve(task_id, comment, user["id"], user["real_name"])
        _write_record_and_sync(conn, task, "APPROVE", comment, user)

    db.transaction(_do)
    return True


def reject(task_id, comment, user):
    def _do(conn):
        task = _load_task_and_check(task_id, user, conn)
        FlowEngine(conn).reject(task_id, comment, user["id"], user["real_name"])
        _write_record_and_sync(conn, task, "REJECT", comment, user)

    db.transaction(_do)
    return True


def return_task(task_id, target_activity_id, comment, user):
    def _do(conn):
        task = _load_task_and_check(task_id, user, conn)
        if not target_activity_id:
            target_activity_id = _first_approval_node(conn, task["instance_id"])
        FlowEngine(conn).return_to(task_id, target_activity_id, comment, user["id"], user["real_name"])
        inst = db.query_one("SELECT * FROM flow_instance WHERE id=?", (task["instance_id"],), conn)
        v = _vars(inst)
        bt = v.get("biz_type")
        if bt == "CONTRACT":
            contract_service.sync_status_from_instance(task["instance_id"], conn)
        elif bt == "INVOICE":
            invoice_service.sync_status_from_instance(task["instance_id"], conn)

    db.transaction(_do)
    return True


def _first_approval_node(conn, instance_id):
    inst = db.query_one("SELECT * FROM flow_instance WHERE id = ?", (instance_id,), conn)
    definition = db.query_one("SELECT * FROM flow_definition WHERE id = ?", (inst["def_id"],), conn)
    graph = json.loads(definition["node_graph"] or "{}")
    start = next((n for n in graph["nodes"] if n["type"] == "start"), None)
    if not start:
        return None
    out = [e["target"] for e in graph["edges"] if e["source"] == start["id"]]
    return out[0] if out else None
