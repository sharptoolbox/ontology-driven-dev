import db
from utils.security import hash_password


def list_users(page=1, size=10, keyword=""):
    where = ""
    params = []
    if keyword:
        where = "WHERE username LIKE ? OR phone LIKE ? OR real_name LIKE ?"
        kw = f"%{keyword}%"
        params = [kw, kw, kw]
    total = db.query_one(f"SELECT COUNT(*) AS c FROM sys_user {where}", params)["c"]
    rows = db.query(
        f"SELECT * FROM sys_user {where} ORDER BY id LIMIT ? OFFSET ?",
        params + [size, (page - 1) * size],
    )
    users = []
    for u in rows:
        u["roles"] = _roles_of_user(u["id"])
        u.pop("password", None)
        users.append(u)
    return {"list": users, "total": total, "page": page, "size": size}


def _roles_of_user(user_id):
    return db.query(
        """
        SELECT r.id, r.name, r.code FROM sys_role r
        JOIN sys_user_role ur ON ur.role_id = r.id WHERE ur.user_id = ?
        """,
        (user_id,),
    )


def get_user(user_id):
    u = db.query_one("SELECT * FROM sys_user WHERE id = ?", (user_id,))
    if u:
        u["roles"] = _roles_of_user(u["id"])
        u.pop("password", None)
    return u


def create_user(data):
    username = data["username"]
    if db.query_one("SELECT id FROM sys_user WHERE username = ?", (username,)):
        raise ValueError("用户名已存在")
    pwd = data.get("password") or "123456"
    user_id = db.execute(
        """
        INSERT INTO sys_user (username, password, real_name, email, phone, actor_type, department_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            username, hash_password(pwd), data.get("real_name"), data.get("email"),
            data.get("phone"), data.get("actor_type", "HUMAN"), data.get("department_id"),
            data.get("status", 1),
        ),
    )[0]
    role_ids = data.get("role_ids") or []
    if role_ids:
        _set_roles(user_id, role_ids)
    return user_id


def update_user(user_id, data):
    db.execute(
        """
        UPDATE sys_user SET real_name=?, email=?, phone=?, actor_type=?, department_id=?, status=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
        """,
        (
            data.get("real_name"), data.get("email"), data.get("phone"),
            data.get("actor_type", "HUMAN"), data.get("department_id"), data.get("status", 1),
            user_id,
        ),
    )
    if "role_ids" in data:
        _set_roles(user_id, data.get("role_ids") or [])
    return user_id


def delete_user(user_id):
    user = db.query_one("SELECT * FROM sys_user WHERE id = ?", (user_id,))
    if not user:
        raise ValueError("用户不存在")
    if user["username"] == "admin":
        raise ValueError("禁止删除超级管理员 admin")
    db.execute("DELETE FROM sys_user_role WHERE user_id = ?", (user_id,))
    db.execute("DELETE FROM sys_user WHERE id = ?", (user_id,))


def assign_roles(user_id, role_ids):
    _set_roles(user_id, role_ids)


def _set_roles(user_id, role_ids):
    db.execute("DELETE FROM sys_user_role WHERE user_id = ?", (user_id,))
    for rid in role_ids:
        db.execute("INSERT OR IGNORE INTO sys_user_role (user_id, role_id) VALUES (?, ?)", (user_id, rid))


def reset_password(user_id, new_password):
    if not new_password:
        raise ValueError("新密码不能为空")
    db.execute(
        "UPDATE sys_user SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (hash_password(new_password), user_id),
    )


def list_role_options():
    return db.query("SELECT id, name, code FROM sys_role WHERE status = 1 ORDER BY id")
