import db


def list_permissions(page=1, size=10, keyword=""):
    where = ""
    params = []
    if keyword:
        where = "WHERE code LIKE ? OR name LIKE ?"
        kw = f"%{keyword}%"
        params = [kw, kw]
    total = db.query_one(f"SELECT COUNT(*) AS c FROM sys_permission {where}", params)["c"]
    rows = db.query(
        f"SELECT * FROM sys_permission {where} ORDER BY id LIMIT ? OFFSET ?",
        params + [size, (page - 1) * size],
    )
    return {"list": rows, "total": total, "page": page, "size": size}


def list_all():
    return db.query("SELECT * FROM sys_permission WHERE status = 1 ORDER BY id")


def create_permission(data):
    code = data["code"]
    if db.query_one("SELECT id FROM sys_permission WHERE code = ?", (code,)):
        raise ValueError("权限编码已存在")
    if data.get("data_scope") == "CUSTOM" and not data.get("abac_condition"):
        raise ValueError("CUSTOM 数据范围必须填写 abac_condition")
    return db.execute(
        """
        INSERT INTO sys_permission (code, name, target_type, target_ref, data_scope, abac_condition, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            code, data["name"], data["target_type"], data["target_ref"],
            data.get("data_scope", "ALL"), data.get("abac_condition"), data.get("status", 1),
        ),
    )[0]


def update_permission(permission_id, data):
    db.execute(
        """
        UPDATE sys_permission SET name=?, target_type=?, target_ref=?, data_scope=?, abac_condition=?, status=?
        WHERE id=?
        """,
        (
            data.get("name"), data.get("target_type"), data.get("target_ref"),
            data.get("data_scope", "ALL"), data.get("abac_condition"), data.get("status", 1),
            permission_id,
        ),
    )
    return permission_id


def delete_permission(permission_id):
    db.execute("DELETE FROM sys_role_permission WHERE permission_id = ?", (permission_id,))
    db.execute("DELETE FROM sys_permission WHERE id = ?", (permission_id,))
