import db


def list_resources():
    return db.query("SELECT * FROM sys_resource ORDER BY sort_order, id")


def tree():
    rows = list_resources()
    by_id = {r["id"]: dict(r) for r in rows}
    for r in by_id.values():
        r["children"] = []
    roots = []
    for r in rows:
        node = by_id[r["id"]]
        parent_id = r["parent_id"]
        if parent_id and parent_id in by_id:
            by_id[parent_id]["children"].append(node)
        else:
            roots.append(node)
    return roots


def create_resource(data):
    code = data["code"]
    if db.query_one("SELECT id FROM sys_resource WHERE code = ?", (code,)):
        raise ValueError("资源编码已存在")
    if data["type"] == "MENU" and not data.get("path"):
        raise ValueError("MENU 必须配置 path")
    if data["type"] in ("BUTTON", "API") and not data.get("permission_code"):
        raise ValueError("BUTTON/API 必须配置 permission_code")
    return db.execute(
        """
        INSERT INTO sys_resource (parent_id, name, code, permission_code, type, path, component, icon, http_method, sort_order, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data.get("parent_id", 0), data["name"], code, data.get("permission_code"),
            data["type"], data.get("path"), data.get("component"), data.get("icon"),
            data.get("http_method"), data.get("sort_order", 0), data.get("status", 1),
        ),
    )[0]


def update_resource(resource_id, data):
    db.execute(
        """
        UPDATE sys_resource SET parent_id=?, name=?, permission_code=?, type=?, path=?, component=?, icon=?, http_method=?, sort_order=?, status=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
        """,
        (
            data.get("parent_id", 0), data.get("name"), data.get("permission_code"),
            data.get("type"), data.get("path"), data.get("component"), data.get("icon"),
            data.get("http_method"), data.get("sort_order", 0), data.get("status", 1),
            resource_id,
        ),
    )
    return resource_id


def delete_resource(resource_id):
    db.execute("DELETE FROM sys_role_resource WHERE resource_id = ?", (resource_id,))
    db.execute("DELETE FROM sys_resource WHERE id = ? OR parent_id = ?", (resource_id, resource_id))
