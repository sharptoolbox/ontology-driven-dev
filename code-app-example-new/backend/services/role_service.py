import db


def list_roles(page=1, size=10, keyword=""):
    where = ""
    params = []
    if keyword:
        where = "WHERE name LIKE ? OR code LIKE ?"
        kw = f"%{keyword}%"
        params = [kw, kw]
    total = db.query_one(f"SELECT COUNT(*) AS c FROM sys_role {where}", params)["c"]
    rows = db.query(
        f"SELECT * FROM sys_role {where} ORDER BY id LIMIT ? OFFSET ?",
        params + [size, (page - 1) * size],
    )
    roles = []
    for r in rows:
        r["permissions"] = _perm_ids(r["id"])
        r["resources"] = _res_ids(r["id"])
        roles.append(r)
    return {"list": roles, "total": total, "page": page, "size": size}


def _perm_ids(role_id):
    return [p["permission_id"] for p in db.query(
        "SELECT permission_id FROM sys_role_permission WHERE role_id = ?", (role_id,))]


def _res_ids(role_id):
    return [p["resource_id"] for p in db.query(
        "SELECT resource_id FROM sys_role_resource WHERE role_id = ?", (role_id,))]


def get_role(role_id):
    r = db.query_one("SELECT * FROM sys_role WHERE id = ?", (role_id,))
    if r:
        r["permissions"] = _perm_ids(role_id)
        r["resources"] = _res_ids(role_id)
    return r


def create_role(data):
    code = data["code"]
    if db.query_one("SELECT id FROM sys_role WHERE code = ?", (code,)):
        raise ValueError("角色编码已存在")
    role_id = db.execute(
        "INSERT INTO sys_role (name, code, parent_id, description, status) VALUES (?, ?, ?, ?, ?)",
        (data["name"], code, data.get("parent_id", 0), data.get("description"), data.get("status", 1)),
    )[0]
    if data.get("permission_ids"):
        _set_permissions(role_id, data["permission_ids"])
    if data.get("resource_ids"):
        _set_resources(role_id, data["resource_ids"])
    return role_id


def update_role(role_id, data):
    db.execute(
        "UPDATE sys_role SET name=?, parent_id=?, description=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (data.get("name"), data.get("parent_id", 0), data.get("description"), data.get("status", 1), role_id),
    )
    if "permission_ids" in data:
        _set_permissions(role_id, data.get("permission_ids") or [])
    if "resource_ids" in data:
        _set_resources(role_id, data.get("resource_ids") or [])
    return role_id


def delete_role(role_id):
    role = db.query_one("SELECT * FROM sys_role WHERE id = ?", (role_id,))
    if not role:
        raise ValueError("角色不存在")
    if role["code"] == "admin":
        raise ValueError("内置角色 admin 不允许删除")
    db.execute("DELETE FROM sys_user_role WHERE role_id = ?", (role_id,))
    db.execute("DELETE FROM sys_role_permission WHERE role_id = ?", (role_id,))
    db.execute("DELETE FROM sys_role_resource WHERE role_id = ?", (role_id,))
    db.execute("DELETE FROM sys_role WHERE id = ?", (role_id,))


def assign_permissions(role_id, permission_ids):
    _set_permissions(role_id, permission_ids)


def assign_resources(role_id, resource_ids):
    _set_resources(role_id, resource_ids)


def _set_permissions(role_id, ids):
    db.execute("DELETE FROM sys_role_permission WHERE role_id = ?", (role_id,))
    for pid in ids:
        db.execute("INSERT OR IGNORE INTO sys_role_permission (role_id, permission_id) VALUES (?, ?)", (role_id, pid))


def _set_resources(role_id, ids):
    db.execute("DELETE FROM sys_role_resource WHERE role_id = ?", (role_id,))
    for rid in ids:
        db.execute("INSERT OR IGNORE INTO sys_role_resource (role_id, resource_id) VALUES (?, ?)", (role_id, rid))
