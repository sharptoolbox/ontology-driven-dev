"""基础主数据（MDM-001 ~ MDM-004）与可维护字典（DIC-001/004/005/006）维护。

覆盖 M2：FUN-015 ~ FUN-019；覆盖 M3：RULE-010 主数据引用保护。
后端强校验与前端提示使用同一组中文错误信息。
"""

import re

import db
from services import scope_service

CODE_PATTERN = re.compile(r"^[A-Za-z0-9]{1,20}$")

ENTITIES = {
    "product": {
        "table": "mdm_product",
        "no": "product_no",
        "name": "product_name",
        "name_label": "产品名称",
        "no_label": "产品编号",
        "name_max": 100,
        "extra": [("product_type", "PRODUCT_TYPE", "产品类型")],
        "refs": [(("contract", "product_no"), "该产品已被合同引用，不允许删除")],
    },
    "customer": {
        "table": "mdm_customer",
        "no": "customer_no",
        "name": "customer_name",
        "name_label": "客户名称",
        "no_label": "客户编号",
        "name_max": 100,
        "extra": [("customer_type", "CUSTOMER_TYPE", "客户类型")],
        "refs": [(("contract", "customer_no"), "该客户已被合同引用，不允许删除")],
    },
    "department": {
        "table": "mdm_department",
        "no": "dept_no",
        "name": "dept_name",
        "name_label": "部门名称",
        "no_label": "部门编号",
        "name_max": 50,
        "extra": [],
        "refs": [
            (("contract", "dept_no"), "该部门已被合同或人员引用，不允许删除"),
            (("mdm_person", "dept_no"), "该部门已被合同或人员引用，不允许删除"),
        ],
    },
    "person": {
        "table": "mdm_person",
        "no": "person_no",
        "name": "person_name",
        "name_label": "人员名称",
        "no_label": "人员编号",
        "name_max": 50,
        "extra": [("dept_no", None, "所属部门")],
        "refs": [(("contract", "owner_no"), "该人员已被合同引用，不允许删除")],
    },
}

DICT_TYPES = {
    "CONTRACT_TYPE": "合同类型",
    "PRODUCT_TYPE": "产品类型",
    "CUSTOMER_TYPE": "客户类型",
    "RECEIVE_METHOD": "收款方式",
}

READONLY_DICT_TYPES = {
    "CONTRACT_STATUS": {
        "name": "合同状态",
        "items": [
            {"dict_code": "DRAFT", "dict_name": "草稿"},
            {"dict_code": "APPROVING", "dict_name": "审批中"},
            {"dict_code": "EFFECTIVE", "dict_name": "已生效"},
            {"dict_code": "CLOSED", "dict_name": "已关闭"},
        ],
    },
    "RECEIVE_STATUS": {
        "name": "开票收款状态",
        "items": [
            {"dict_code": "UNRECEIVED", "dict_name": "未收款"},
            {"dict_code": "PARTIAL", "dict_name": "部分收款"},
            {"dict_code": "RECEIVED", "dict_name": "已收款"},
        ],
    },
}

DICT_REFERENCES = {
    "CONTRACT_TYPE": (("contract", "contract_type"),),
    "PRODUCT_TYPE": (("mdm_product", "product_type"),),
    "CUSTOMER_TYPE": (("mdm_customer", "customer_type"),),
    "RECEIVE_METHOD": (("contract_receipt", "receive_method"),),
}


class BusinessError(ValueError):
    pass


def _config(entity):
    config = ENTITIES.get(entity)
    if not config:
        raise BusinessError("不支持的基础数据类型")
    return config


def _ensure_dict_item(dict_type, code, label):
    row = db.query_one(
        "SELECT id FROM dict_item WHERE dict_type=? AND dict_code=? AND flag=1", (dict_type, code)
    )
    if not row:
        raise BusinessError("{}不存在或已停用".format(label))


# ---------------------------------------------------------------- 主数据

def list_entity(ctx, entity, params):
    config = _config(entity)
    page = max(1, int(params.get("page") or 1))
    size = min(200, max(1, int(params.get("size") or 10)))
    where = ["flag=1"]
    values = []

    code = (params.get("code") or "").strip()
    if code:
        where.append("{} LIKE ?".format(config["no"]))
        values.append("%{}%".format(code))
    name = (params.get("name") or "").strip()
    if name:
        where.append("{} LIKE ?".format(config["name"]))
        values.append("%{}%".format(name))

    for column, dict_type, label in config["extra"]:
        value = (params.get(column) or "").strip()
        if value:
            where.append("{} = ?".format(column))
            values.append(value)

    if entity == "person":
        dept_no = (params.get("dept_no") or "").strip()
        if dept_no:
            where.append("dept_no = ?")
            values.append(dept_no)

    where_sql = " AND ".join(where)
    total = db.query_one(
        "SELECT COUNT(*) AS c FROM {} WHERE {}".format(config["table"], where_sql), values
    )["c"]
    rows = db.query(
        "SELECT * FROM {} WHERE {} ORDER BY {} LIMIT ? OFFSET ?".format(
            config["table"], where_sql, config["no"]
        ),
        values + [size, (page - 1) * size],
    )
    return {"list": [dict(r) for r in rows], "total": total, "page": page, "size": size}


def _validate_master(entity, payload, conn, current=None):
    config = _config(entity)
    code = (payload.get("code") or "").strip()
    name = (payload.get("name") or "").strip()

    if not code:
        raise BusinessError("{}不能为空".format(config["no_label"]))
    if not CODE_PATTERN.match(code):
        raise BusinessError("{}必须为 1~20 位字母或数字".format(config["no_label"]))
    if not name:
        raise BusinessError("{}不能为空".format(config["name_label"]))
    if len(name) > config["name_max"]:
        raise BusinessError("{}不能超过 {} 个字符".format(config["name_label"], config["name_max"]))

    if current is None:
        exists = db.query_one(
            "SELECT id FROM {} WHERE {} = ? AND flag=1".format(config["table"], config["no"]),
            (code,), conn,
        )
        if exists:
            raise BusinessError("{}已存在".format(config["no_label"]))
    elif code != current[config["no"]]:
        raise BusinessError("{}保存后不可修改".format(config["no_label"]))

    duplicate = db.query_one(
        "SELECT id FROM {} WHERE {} = ? AND flag=1 AND id <> ?".format(config["table"], config["name"]),
        (name, current["id"] if current else -1), conn,
    )
    if duplicate:
        raise BusinessError("{}已存在".format(config["name_label"]))

    values = {}
    for column, dict_type, label in config["extra"]:
        value = (payload.get(column) or "").strip()
        if not value:
            raise BusinessError("请选择{}".format(label))
        if dict_type:
            _ensure_dict_item(dict_type, value, label)
        elif column == "dept_no":
            if not db.query_one("SELECT id FROM mdm_department WHERE dept_no=? AND flag=1", (value,), conn):
                raise BusinessError("所属部门不存在")
        values[column] = value
    return code, name, values


def create_entity(ctx, entity, payload):
    config = _config(entity)

    def _do(conn):
        code, name, extras = _validate_master(entity, payload, conn)
        columns = [config["no"], config["name"]] + list(extras.keys()) + ["created_by", "updated_by"]
        placeholders = ",".join("?" for _ in columns)
        params = [code, name] + list(extras.values()) + [ctx["id"], ctx["id"]]
        db.execute(
            "INSERT INTO {} ({}) VALUES ({})".format(config["table"], ",".join(columns), placeholders),
            params,
            conn,
        )
        return code

    return db.transaction(_do)


def update_entity(ctx, entity, record_id, payload):
    config = _config(entity)

    def _do(conn):
        current = db.query_one(
            "SELECT * FROM {} WHERE id=? AND flag=1".format(config["table"]), (record_id,), conn
        )
        if not current:
            raise BusinessError("记录不存在")
        code, name, extras = _validate_master(entity, payload, conn, current)
        assignments = ["{} = ?".format(config["no"]), "{} = ?".format(config["name"])]
        params = [code, name]
        for column, value in extras.items():
            assignments.append("{} = ?".format(column))
            params.append(value)
        assignments.extend(["updated_by = ?", "updated_at = CURRENT_TIMESTAMP"])
        params.extend([ctx["id"], record_id])
        db.execute(
            "UPDATE {} SET {} WHERE id=?".format(config["table"], ", ".join(assignments)),
            params,
            conn,
        )
        return record_id

    return db.transaction(_do)


def delete_entity(ctx, entity, record_id):
    config = _config(entity)

    def _do(conn):
        current = db.query_one(
            "SELECT * FROM {} WHERE id=? AND flag=1".format(config["table"]), (record_id,), conn
        )
        if not current:
            raise BusinessError("记录不存在")
        for (table, column), message in config["refs"]:
            count = db.query_one(
                "SELECT COUNT(*) AS c FROM {} WHERE {}=? AND flag=1".format(table, column),
                (current[config["no"]],), conn,
            )["c"]
            if count:
                raise BusinessError(message)
        db.execute(
            "UPDATE {} SET flag=0, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?".format(config["table"]),
            (ctx["id"], record_id),
            conn,
        )
        return True

    return db.transaction(_do)


# ---------------------------------------------------------------- 字典

def dict_types():
    maintainable = [{"type": code, "name": name, "editable": True} for code, name in DICT_TYPES.items()]
    readonly = [
        {"type": code, "name": meta["name"], "editable": False, "items": meta["items"]}
        for code, meta in READONLY_DICT_TYPES.items()
    ]
    return {"maintainable": maintainable, "readonly": readonly}


def list_dict_items(dict_type, params):
    if dict_type in READONLY_DICT_TYPES:
        keyword = (params.get("keyword") or "").strip()
        return {
            "list": [
                dict(item, enabled="是", sort_no=index + 1, readonly=True)
                for index, item in enumerate(READONLY_DICT_TYPES[dict_type]["items"])
                if not keyword or keyword in item["dict_name"] or keyword in item["dict_code"]
            ],
            "total": len(READONLY_DICT_TYPES[dict_type]["items"]),
            "readonly": True,
        }
    if dict_type not in DICT_TYPES:
        raise BusinessError("不支持的字典分类")
    where = ["dict_type=?", "flag=1"]
    values = [dict_type]
    keyword = (params.get("keyword") or "").strip()
    if keyword:
        where.append("(dict_code LIKE ? OR dict_name LIKE ?)")
        values.extend(["%{}%".format(keyword), "%{}%".format(keyword)])
    rows = db.query(
        "SELECT * FROM dict_item WHERE {} ORDER BY sort_no, dict_code".format(" AND ".join(where)), values
    )
    return {"list": [dict(r) for r in rows], "total": len(rows), "readonly": False}


def create_dict_item(ctx, dict_type, payload):
    if dict_type not in DICT_TYPES:
        raise BusinessError("该字典分类不可维护")

    def _do(conn):
        code = (payload.get("dict_code") or "").strip()
        name = (payload.get("dict_name") or "").strip()
        if not code:
            raise BusinessError("字典编码不能为空")
        if not re.match(r"^[A-Za-z0-9_]{1,20}$", code):
            raise BusinessError("字典编码必须为 1~20 位字母、数字或下划线")
        if not name:
            raise BusinessError("字典项名称不能为空")
        if len(name) > 50:
            raise BusinessError("字典项名称不能超过 50 个字符")
        if db.query_one(
            "SELECT id FROM dict_item WHERE dict_type=? AND dict_code=? AND flag=1", (dict_type, code), conn
        ):
            raise BusinessError("字典编码已存在")
        if db.query_one(
            "SELECT id FROM dict_item WHERE dict_type=? AND dict_name=? AND flag=1", (dict_type, name), conn
        ):
            raise BusinessError("字典项名称已存在")
        sort_no = int(payload.get("sort_no") or 0)
        enabled = "是" if str(payload.get("enabled", "是")) in ("是", "true", "1", "True") else "否"
        db.execute(
            """
            INSERT INTO dict_item (dict_type, dict_code, dict_name, sort_no, enabled, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (dict_type, code, name, sort_no, enabled, ctx["id"], ctx["id"]),
            conn,
        )
        return code

    return db.transaction(_do)


def update_dict_item(ctx, item_id, payload):
    def _do(conn):
        current = db.query_one("SELECT * FROM dict_item WHERE id=? AND flag=1", (item_id,), conn)
        if not current:
            raise BusinessError("字典项不存在")
        if current["system_flag"]:
            raise BusinessError("系统预置字典项不允许修改")
        code = (payload.get("dict_code") or current["dict_code"]).strip()
        if code != current["dict_code"]:
            raise BusinessError("字典编码保存后不可修改")
        name = (payload.get("dict_name") or "").strip()
        if not name:
            raise BusinessError("字典项名称不能为空")
        duplicate = db.query_one(
            "SELECT id FROM dict_item WHERE dict_type=? AND dict_name=? AND flag=1 AND id<>?",
            (current["dict_type"], name, item_id),
            conn,
        )
        if duplicate:
            raise BusinessError("字典项名称已存在")
        sort_no = int(payload.get("sort_no", current["sort_no"]) or 0)
        enabled = payload.get("enabled", current["enabled"])
        enabled = "是" if str(enabled) in ("是", "true", "1", "True") else "否"
        db.execute(
            """
            UPDATE dict_item SET dict_name=?, sort_no=?, enabled=?, updated_by=?,
                updated_at=CURRENT_TIMESTAMP
            WHERE id=?
            """,
            (name, sort_no, enabled, ctx["id"], item_id),
            conn,
        )
        return item_id

    return db.transaction(_do)


def toggle_dict_item(ctx, item_id):
    def _do(conn):
        current = db.query_one("SELECT * FROM dict_item WHERE id=? AND flag=1", (item_id,), conn)
        if not current:
            raise BusinessError("字典项不存在")
        if current["system_flag"]:
            raise BusinessError("系统预置字典项不允许停用")
        enabled = "否" if current["enabled"] == "是" else "是"
        db.execute(
            "UPDATE dict_item SET enabled=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (enabled, ctx["id"], item_id),
            conn,
        )
        return enabled

    return db.transaction(_do)


def delete_dict_item(ctx, item_id):
    def _do(conn):
        current = db.query_one("SELECT * FROM dict_item WHERE id=? AND flag=1", (item_id,), conn)
        if not current:
            raise BusinessError("字典项不存在")
        if current["system_flag"]:
            raise BusinessError("系统预置字典项不允许删除")
        for table, column in DICT_REFERENCES.get(current["dict_type"], ()):
            count = db.query_one(
                "SELECT COUNT(*) AS c FROM {} WHERE {}=? AND flag=1".format(table, column),
                (current["dict_code"],), conn,
            )["c"]
            if count:
                raise BusinessError("该字典项已被业务数据引用，不允许删除，可改为停用")
        db.execute(
            "UPDATE dict_item SET flag=0, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (ctx["id"], item_id),
            conn,
        )
        return True

    return db.transaction(_do)


# ---------------------------------------------------------------- 下拉数据

def option_payload(ctx):
    """合同/基础数据表单需要的全部下拉选项。"""
    def items(dict_type):
        rows = db.query(
            "SELECT dict_code, dict_name FROM dict_item WHERE dict_type=? AND flag=1 AND enabled='是' "
            "ORDER BY sort_no, dict_code",
            (dict_type,),
        )
        return [{"code": r["dict_code"], "label": r["dict_name"]} for r in rows]

    return {
        "products": db.query(
            "SELECT product_no AS code, product_name AS label, product_type FROM mdm_product "
            "WHERE flag=1 ORDER BY product_no"
        ),
        "customers": db.query(
            "SELECT customer_no AS code, customer_name AS label, customer_type FROM mdm_customer "
            "WHERE flag=1 ORDER BY customer_no"
        ),
        "departments": db.query(
            "SELECT dept_no AS code, dept_name AS label FROM mdm_department WHERE flag=1 ORDER BY dept_no"
        ),
        "persons": db.query(
            "SELECT person_no AS code, person_name AS label, dept_no FROM mdm_person WHERE flag=1 ORDER BY person_no"
        ),
        "contract_types": items("CONTRACT_TYPE"),
        "product_types": items("PRODUCT_TYPE"),
        "customer_types": items("CUSTOMER_TYPE"),
        "receive_methods": items("RECEIVE_METHOD"),
    }
