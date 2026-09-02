import db
from utils.codegen import generate_code

_KINDS = {
    "product": {"table": "product", "alias": "Product", "no": "product_no", "name": "product_name", "type": "product_type"},
    "customer": {"table": "customer", "alias": "Customer", "no": "customer_no", "name": "customer_name", "type": "customer_type"},
    "department": {"table": "department", "alias": "Department", "no": "department_no", "name": "department_name", "type": None},
    "employee": {"table": "employee", "alias": "Employee", "no": "employee_no", "name": "employee_name", "type": None},
}


def list_items(kind, page=1, size=10, keyword=""):
    cfg = _KINDS[kind]
    t = cfg["table"]
    if kind == "employee":
        from_clause = "employee e LEFT JOIN department d ON d.id = e.department_id"
        select = "e.*, d.department_name"
        where = "WHERE e.flag=1"
        order = "ORDER BY e.id"
        prefix = "e."
    else:
        from_clause = t
        select = "*"
        where = "WHERE flag=1"
        order = "ORDER BY id"
        prefix = ""
    params = []
    if keyword:
        where += f" AND ({prefix}{cfg['no']} LIKE ? OR {prefix}{cfg['name']} LIKE ?)"
        params += [f"%{keyword}%", f"%{keyword}%"]
    total = db.query_one(f"SELECT COUNT(*) AS c FROM {from_clause} {where}", params)["c"]
    rows = db.query(f"SELECT {select} FROM {from_clause} {where} {order} LIMIT ? OFFSET ?",
                    params + [size, (page - 1) * size])
    return {"list": rows, "total": total, "page": page, "size": size}


def options(kind):
    cfg = _KINDS[kind]
    t = cfg["table"]
    rows = db.query(f"SELECT id, {cfg['no']} AS no, {cfg['name']} AS name FROM {t} WHERE flag=1 AND status='在用' ORDER BY id")
    return rows


def get(kind, item_id):
    cfg = _KINDS[kind]
    t = cfg["table"]
    if kind == "employee":
        return db.query_one(
            f"SELECT e.*, d.department_name FROM {t} e LEFT JOIN department d ON d.id = e.department_id WHERE e.id=? AND e.flag=1",
            (item_id,))
    return db.query_one(f"SELECT * FROM {t} WHERE id=? AND flag=1", (item_id,))


def create(kind, data, user):
    cfg = _KINDS[kind]
    t = cfg["table"]
    no = generate_code(cfg["alias"], t, cfg["no"])
    if kind == "product":
        if not data.get("product_name"):
            raise ValueError("产品名称必填")
        return db.execute(
            f"INSERT INTO {t} (product_no, product_type, product_name, status, created_by, updated_by) VALUES (?, ?, ?, '在用', ?, ?)",
            (no, data.get("product_type"), data["product_name"], user["id"], user["id"]),
        )[0]
    if kind == "customer":
        if not data.get("customer_name"):
            raise ValueError("客户名称必填")
        return db.execute(
            f"INSERT INTO {t} (customer_no, customer_type, customer_name, status, created_by, updated_by) VALUES (?, ?, ?, '在用', ?, ?)",
            (no, data.get("customer_type"), data["customer_name"], user["id"], user["id"]),
        )[0]
    if kind == "department":
        if not data.get("department_name"):
            raise ValueError("部门名称必填")
        return db.execute(
            f"INSERT INTO {t} (department_no, department_name, status, created_by, updated_by) VALUES (?, ?, '在用', ?, ?)",
            (no, data["department_name"], user["id"], user["id"]),
        )[0]
    if kind == "employee":
        if not data.get("employee_name"):
            raise ValueError("人员名称必填")
        return db.execute(
            f"INSERT INTO {t} (employee_no, employee_name, department_id, status, created_by, updated_by) VALUES (?, ?, ?, '在用', ?, ?)",
            (no, data["employee_name"], data.get("department_id"), user["id"], user["id"]),
        )[0]


def update(kind, item_id, data, user):
    cfg = _KINDS[kind]
    t = cfg["table"]
    if kind == "product":
        db.execute(f"UPDATE {t} SET product_type=?, product_name=?, status=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                   (data.get("product_type"), data.get("product_name"), data.get("status", "在用"), user["id"], item_id))
    elif kind == "customer":
        db.execute(f"UPDATE {t} SET customer_type=?, customer_name=?, status=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                   (data.get("customer_type"), data.get("customer_name"), data.get("status", "在用"), user["id"], item_id))
    elif kind == "department":
        db.execute(f"UPDATE {t} SET department_name=?, status=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                   (data.get("department_name"), data.get("status", "在用"), user["id"], item_id))
    elif kind == "employee":
        db.execute(f"UPDATE {t} SET employee_name=?, department_id=?, status=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                   (data.get("employee_name"), data.get("department_id"), data.get("status", "在用"), user["id"], item_id))
    return item_id


def remove(kind, item_id):
    cfg = _KINDS[kind]
    t = cfg["table"]
    db.execute(f"UPDATE {t} SET flag=0, updated_at=CURRENT_TIMESTAMP WHERE id=?", (item_id,))
