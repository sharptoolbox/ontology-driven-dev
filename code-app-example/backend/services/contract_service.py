import json

import db
from engine.flow_engine import FlowEngine
from services import domain_rules, sync_service
from utils.codegen import generate_code

FLOW_CODE = "FLOW-CONTRACT-APPROVAL-001"


def _validate(data, stages):
    if not data.get("contract_name"):
        raise ValueError("合同名称必填")
    if len(data["contract_name"]) > 100:
        raise ValueError("合同名称不能超过 100 个字符")
    for f in ("product_id", "customer_id", "department_id", "contract_type", "sign_date", "owner_id"):
        if not data.get(f):
            raise ValueError("必填字段不能为空")
    total = float(data.get("total_amount") or 0)
    if total <= 0:
        raise ValueError("合同总金额必须大于 0")
    purchase = float(data.get("purchase_amount") or 0)
    if purchase < 0:
        raise ValueError("对外采购金额不能小于 0")
    if purchase > total:
        raise ValueError("对外采购金额不得大于合同总金额")
    tax = float(data.get("tax_rate") or 0)
    if tax < 0 or tax > 1:
        raise ValueError("税率取值应在 0 到 1 之间")
    if not stages:
        raise ValueError("至少需要一条付款阶段")
    total_ratio = 0.0
    for s in stages:
        ratio = float(s.get("pay_ratio") or 0)
        if ratio <= 0 or ratio > 100:
            raise ValueError("付款比例应大于 0 且不超过 100")
        total_ratio += ratio
    if abs(total_ratio - 100) > 1e-6:
        raise ValueError("付款阶段付款比例合计必须等于 100")
    domain_rules.rule_owner_dept_consistent(data.get("owner_id"), data.get("department_id"))


def _stage_rows(contract_id, conn):
    return db.query("SELECT * FROM contract_stage WHERE contract_id=? AND flag=1 ORDER BY id", (contract_id,), conn)


def get_contract(contract_id):
    c = db.query_one(
        """
        SELECT c.*, p.product_name, cu.customer_name, d.department_name, e.employee_name AS owner_name
        FROM contract c
        LEFT JOIN product p ON p.id = c.product_id
        LEFT JOIN customer cu ON cu.id = c.customer_id
        LEFT JOIN department d ON d.id = c.department_id
        LEFT JOIN employee e ON e.id = c.owner_id
        WHERE c.id = ? AND c.flag = 1
        """,
        (contract_id,))
    if not c:
        return None
    c["stages"] = _stage_rows(contract_id, None)
    c["invoices"] = db.query("SELECT * FROM invoice WHERE contract_id=? AND flag=1 ORDER BY id", (contract_id,))
    c["receipts"] = db.query("SELECT * FROM receipt WHERE contract_id=? AND flag=1 ORDER BY id", (contract_id,))
    c["approval_records"] = db.query(
        "SELECT * FROM approval_record WHERE biz_no=? AND flag=1 ORDER BY id", (c["contract_no"],))
    return c


def list_contracts(page=1, size=10, filters=None):
    filters = filters or {}
    where = "WHERE c.flag = 1"
    params = []
    if filters.get("contract_no"):
        where += " AND c.contract_no LIKE ?"
        params.append(f"%{filters['contract_no']}%")
    if filters.get("contract_name"):
        where += " AND c.contract_name LIKE ?"
        params.append(f"%{filters['contract_name']}%")
    if filters.get("product_id"):
        where += " AND c.product_id = ?"
        params.append(filters["product_id"])
    if filters.get("customer_id"):
        where += " AND c.customer_id = ?"
        params.append(filters["customer_id"])
    if filters.get("department_id"):
        where += " AND c.department_id = ?"
        params.append(filters["department_id"])
    if filters.get("contract_type"):
        where += " AND c.contract_type = ?"
        params.append(filters["contract_type"])
    if filters.get("status"):
        where += " AND c.status = ?"
        params.append(filters["status"])
    if filters.get("sign_date_from"):
        where += " AND c.sign_date >= ?"
        params.append(filters["sign_date_from"])
    if filters.get("sign_date_to"):
        where += " AND c.sign_date <= ?"
        params.append(filters["sign_date_to"])
    base = """
        FROM contract c
        LEFT JOIN product p ON p.id = c.product_id
        LEFT JOIN customer cu ON cu.id = c.customer_id
        LEFT JOIN department d ON d.id = c.department_id
        LEFT JOIN employee e ON e.id = c.owner_id
    """
    total = db.query_one(f"SELECT COUNT(*) AS c {base} {where}", params)["c"]
    rows = db.query(
        f"""
        SELECT c.*, p.product_name, cu.customer_name, d.department_name, e.employee_name AS owner_name
        {base} {where} ORDER BY c.id DESC LIMIT ? OFFSET ?
        """,
        params + [size, (page - 1) * size],
    )
    return {"list": rows, "total": total, "page": page, "size": size}


def _save_stages(conn, contract_id, stages, user):
    db.execute("UPDATE contract_stage SET flag=0 WHERE contract_id=?", (contract_id,), conn)
    for i, s in enumerate(stages):
        ratio = float(s["pay_ratio"])
        total = float(s.get("_total_amount") or 0)
        stage_amount = round(total * ratio / 100.0, 2)
        db.execute(
            """
            INSERT INTO contract_stage (contract_id, stage_id, stage_name, pay_ratio, stage_amount, invoice_status, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, '未开票', ?, ?)
            """,
            (contract_id, str(i + 1), s["stage_name"], ratio, stage_amount, user["id"], user["id"]),
            conn,
        )


def create_draft(data, user):
    stages = data.get("stages") or []
    _validate(data, stages)
    for s in stages:
        s["_total_amount"] = data["total_amount"]

    def _do(conn):
        no = generate_code("Contract", "contract", "contract_no", conn)
        cid = db.execute(
            """
            INSERT INTO contract (contract_no, contract_name, product_id, customer_id, department_id, contract_type,
                sign_date, owner_id, total_amount, purchase_amount, tax_rate, status, registrant_id, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '草稿', ?, ?, ?)
            """,
            (
                no, data["contract_name"], data["product_id"], data["customer_id"], data["department_id"],
                data["contract_type"], data["sign_date"], data["owner_id"], data["total_amount"],
                data.get("purchase_amount") or 0, data.get("tax_rate") or 0, data["owner_id"], user["id"], user["id"],
            ),
            conn,
        )[0]
        _save_stages(conn, cid, stages, user)
        return cid

    cid = db.transaction(_do)
    return get_contract(cid)


def update_draft(contract_id, data, user):
    c = db.query_one("SELECT * FROM contract WHERE id=? AND flag=1", (contract_id,))
    if not c:
        raise ValueError("合同不存在")
    if c["status"] not in ("草稿", "已驳回"):
        raise ValueError("仅草稿或已驳回状态的合同可修改")
    stages = data.get("stages") or []
    _validate(data, stages)
    for s in stages:
        s["_total_amount"] = data["total_amount"]

    def _do(conn):
        db.execute(
            """
            UPDATE contract SET contract_name=?, product_id=?, customer_id=?, department_id=?, contract_type=?,
                sign_date=?, owner_id=?, total_amount=?, purchase_amount=?, tax_rate=?, status='草稿', registrant_id=?,
                updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
            """,
            (
                data["contract_name"], data["product_id"], data["customer_id"], data["department_id"],
                data["contract_type"], data["sign_date"], data["owner_id"], data["total_amount"],
                data.get("purchase_amount") or 0, data.get("tax_rate") or 0, data["owner_id"], user["id"], contract_id,
            ),
            conn,
        )
        _save_stages(conn, contract_id, stages, user)

    db.transaction(_do)
    return get_contract(contract_id)


def submit(contract_id, user):
    c = db.query_one("SELECT * FROM contract WHERE id=? AND flag=1", (contract_id,))
    if not c:
        raise ValueError("合同不存在")
    if c["status"] not in ("草稿", "已驳回"):
        raise ValueError("当前状态不可提交")
    stages = _stage_rows(contract_id, None)
    data = dict(c)
    _validate(data, stages)

    def _do(conn):
        definition = db.query_one("SELECT * FROM flow_definition WHERE code=? AND status=1", (FLOW_CODE,), conn)
        if not definition:
            raise ValueError("合同登记审批流程未发布")
        instance_id = FlowEngine(conn).start(
            definition["id"],
            c["contract_no"],
            ["AGG-CONTRACT-001"],
            {"biz_type": "CONTRACT", "biz_id": contract_id, "biz_no": c["contract_no"], "biz_name": c["contract_name"],
             "total_amount": c["total_amount"], "totalAmount": c["total_amount"], "submitter_id": user["id"]},
            user["id"],
        )
        db.execute(
            "UPDATE contract SET status='待财务经理审批', instance_id=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (instance_id, user["id"], contract_id),
            conn,
        )

    db.transaction(_do)
    return get_contract(contract_id)


def withdraw(contract_id, user):
    c = db.query_one("SELECT * FROM contract WHERE id=? AND flag=1", (contract_id,))
    if not c:
        raise ValueError("合同不存在")
    if c["status"] != "待财务经理审批" or not c["instance_id"]:
        raise ValueError("仅待财务经理审批且未处理前可撤回")

    def _do(conn):
        done = db.query_one(
            "SELECT COUNT(*) AS c FROM flow_task WHERE instance_id=? AND status IN ('DONE','CANCEL') AND action IS NOT NULL",
            (c["instance_id"],), conn)["c"]
        if done > 0:
            raise ValueError("审批人已处理，无法撤回")
        db.execute("UPDATE flow_instance SET status='TERMINATED', ended_at=CURRENT_TIMESTAMP WHERE id=?", (c["instance_id"],), conn)
        db.execute("UPDATE flow_task SET status='CANCEL' WHERE instance_id=? AND status='TODO'", (c["instance_id"],), conn)
        db.execute("UPDATE contract SET status='草稿', instance_id=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?", (contract_id,), conn)

    db.transaction(_do)
    return get_contract(contract_id)


def void_or_archive(contract_id, action, user):
    c = db.query_one("SELECT * FROM contract WHERE id=? AND flag=1", (contract_id,))
    if not c:
        raise ValueError("合同不存在")
    if action == "void":
        domain_rules.rule_contract_void_eligible(contract_id)
        db.execute("UPDATE contract SET status='已作废', updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (user["id"], contract_id))
    elif action == "archive":
        if c["status"] not in ("已纳入管理", "已结清", "已作废"):
            raise ValueError("当前状态不可归档")
        db.execute("UPDATE contract SET status='已归档', updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (user["id"], contract_id))
    else:
        raise ValueError("无效操作")
    return get_contract(contract_id)


def sync_status_from_instance(instance_id, conn):
    inst = db.query_one("SELECT * FROM flow_instance WHERE id=?", (instance_id,), conn)
    if not inst:
        return None
    contract = db.query_one("SELECT * FROM contract WHERE instance_id=? AND flag=1", (instance_id,), conn)
    if not contract:
        return None
    status = None
    if inst["status"] == "APPROVED":
        status = "已纳入管理"
    elif inst["status"] == "REJECTED":
        status = "已驳回"
    elif inst["status"] == "RUNNING":
        todo = db.query_one(
            "SELECT * FROM flow_task WHERE instance_id=? AND status='TODO' ORDER BY id LIMIT 1", (instance_id,), conn)
        if todo:
            if todo["role_ref"] == "ROLE-GENERAL-MANAGER":
                status = "待总经理审批"
            elif todo["role_ref"] == "ROLE-FINANCE-MANAGER":
                status = "待财务经理审批"
    if status and status != contract["status"]:
        db.execute("UPDATE contract SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (status, contract["id"]), conn)
    return status
