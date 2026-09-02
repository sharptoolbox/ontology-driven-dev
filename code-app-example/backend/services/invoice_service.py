import db
from engine.flow_engine import FlowEngine
from services import domain_rules, sync_service
from utils.codegen import generate_code

FLOW_CODE = "FLOW-INVOICE-APPROVAL-002"


def _validate(data, allocations):
    if not data.get("contract_id"):
        raise ValueError("对应合同必填")
    contract = db.query_one("SELECT * FROM contract WHERE id=? AND flag=1", (data["contract_id"],))
    if not contract:
        raise ValueError("合同不存在")
    domain_rules.rule_contract_invoice_eligible(data["contract_id"])
    amount = float(data.get("invoice_amount") or 0)
    if amount <= 0:
        raise ValueError("开票金额必须大于 0")
    tax = float(data.get("invoice_tax_rate") or 0)
    if tax < 0 or tax > 1:
        raise ValueError("开票税率取值应在 0 到 1 之间")
    domain_rules.rule_invoice_taxrate_consistent(data["contract_id"], tax)
    if not data.get("invoice_date"):
        raise ValueError("开票时间必填")
    if not allocations:
        raise ValueError("至少需要一条付款阶段分摊")
    total_alloc = 0.0
    for a in allocations:
        if not a.get("stage_id"):
            raise ValueError("分摊必须选择付款阶段")
        amt = float(a.get("allocated_amount") or 0)
        if amt <= 0:
            raise ValueError("分摊金额必须大于 0")
        domain_rules.rule_allocation_contract_consistent(data["contract_id"], a.get("contract_id", data["contract_id"]))
        domain_rules.rule_paystage_remain_quota(data["contract_id"], a["stage_id"], amt)
        total_alloc += amt
    if abs(total_alloc - amount) > 1e-6:
        raise ValueError("分摊金额合计必须等于开票金额")
    return contract


def _alloc_rows(invoice_id, conn):
    return db.query("SELECT * FROM invoice_allocation WHERE invoice_id=? AND flag=1 ORDER BY id", (invoice_id,), conn)


def get_invoice(invoice_id):
    inv = db.query_one(
        """
        SELECT i.*, c.contract_no, c.contract_name
        FROM invoice i LEFT JOIN contract c ON c.id = i.contract_id
        WHERE i.id = ? AND i.flag = 1
        """,
        (invoice_id,))
    if not inv:
        return None
    inv["allocations"] = _alloc_rows(invoice_id, None)
    return inv


def list_invoices(page=1, size=10, filters=None):
    filters = filters or {}
    where = "WHERE i.flag = 1"
    params = []
    if filters.get("invoice_no"):
        where += " AND i.invoice_no LIKE ?"
        params.append(f"%{filters['invoice_no']}%")
    if filters.get("contract_id"):
        where += " AND i.contract_id = ?"
        params.append(filters["contract_id"])
    if filters.get("approval_status"):
        where += " AND i.approval_status = ?"
        params.append(filters["approval_status"])
    base = "FROM invoice i LEFT JOIN contract c ON c.id = i.contract_id"
    total = db.query_one(f"SELECT COUNT(*) AS c {base} {where}", params)["c"]
    rows = db.query(
        f"SELECT i.*, c.contract_no, c.contract_name {base} {where} ORDER BY i.id DESC LIMIT ? OFFSET ?",
        params + [size, (page - 1) * size],
    )
    return {"list": rows, "total": total, "page": page, "size": size}


def _save_allocations(conn, invoice_id, allocations, user):
    db.execute("UPDATE invoice_allocation SET flag=0 WHERE invoice_id=?", (invoice_id,), conn)
    for a in allocations:
        db.execute(
            """
            INSERT INTO invoice_allocation (invoice_id, contract_id, stage_id, allocated_amount, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (invoice_id, a.get("contract_id"), a["stage_id"], a["allocated_amount"], user["id"], user["id"]),
            conn,
        )


def create_draft(data, user):
    allocations = data.get("allocations") or []
    contract = _validate(data, allocations)
    for a in allocations:
        a["contract_id"] = contract["id"]

    def _do(conn):
        no = generate_code("Invoice", "invoice", "invoice_no", conn)
        iid = db.execute(
            """
            INSERT INTO invoice (invoice_no, contract_id, invoice_amount, invoice_tax_rate, invoice_date, approval_status, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, '草稿', ?, ?)
            """,
            (no, contract["id"], data["invoice_amount"], data.get("invoice_tax_rate") or 0, data["invoice_date"], user["id"], user["id"]),
            conn,
        )[0]
        _save_allocations(conn, iid, allocations, user)
        return iid

    iid = db.transaction(_do)
    return get_invoice(iid)


def update_draft(invoice_id, data, user):
    inv = db.query_one("SELECT * FROM invoice WHERE id=? AND flag=1", (invoice_id,))
    if not inv:
        raise ValueError("开票不存在")
    if inv["approval_status"] not in ("草稿", "已驳回"):
        raise ValueError("仅草稿或已驳回状态的开票可修改")
    allocations = data.get("allocations") or []
    contract = _validate(data, allocations)
    for a in allocations:
        a["contract_id"] = contract["id"]

    def _do(conn):
        db.execute(
            "UPDATE invoice SET contract_id=?, invoice_amount=?, invoice_tax_rate=?, invoice_date=?, approval_status='草稿', updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (contract["id"], data["invoice_amount"], data.get("invoice_tax_rate") or 0, data["invoice_date"], user["id"], invoice_id),
            conn,
        )
        _save_allocations(conn, invoice_id, allocations, user)

    db.transaction(_do)
    return get_invoice(invoice_id)


def submit(invoice_id, user):
    inv = db.query_one("SELECT * FROM invoice WHERE id=? AND flag=1", (invoice_id,))
    if not inv:
        raise ValueError("开票不存在")
    if inv["approval_status"] not in ("草稿", "已驳回"):
        raise ValueError("当前状态不可提交")
    allocations = _alloc_rows(invoice_id, None)
    _validate(inv, allocations)

    def _do(conn):
        definition = db.query_one("SELECT * FROM flow_definition WHERE code=? AND status=1", (FLOW_CODE,), conn)
        if not definition:
            raise ValueError("开票审批流程未发布")
        instance_id = FlowEngine(conn).start(
            definition["id"],
            inv["invoice_no"],
            ["AGG-INVOICE-001"],
            {"biz_type": "INVOICE", "biz_id": invoice_id, "biz_no": inv["invoice_no"], "biz_name": inv["invoice_no"],
             "submitter_id": user["id"]},
            user["id"],
        )
        db.execute(
            "UPDATE invoice SET approval_status='待财务经理审批', instance_id=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (instance_id, user["id"], invoice_id),
            conn,
        )

    db.transaction(_do)
    return get_invoice(invoice_id)


def withdraw(invoice_id, user):
    inv = db.query_one("SELECT * FROM invoice WHERE id=? AND flag=1", (invoice_id,))
    if not inv:
        raise ValueError("开票不存在")
    if inv["approval_status"] != "待财务经理审批" or not inv["instance_id"]:
        raise ValueError("仅待财务经理审批且未处理前可撤回")

    def _do(conn):
        done = db.query_one(
            "SELECT COUNT(*) AS c FROM flow_task WHERE instance_id=? AND status IN ('DONE','CANCEL') AND action IS NOT NULL",
            (inv["instance_id"],), conn)["c"]
        if done > 0:
            raise ValueError("审批人已处理，无法撤回")
        db.execute("UPDATE flow_instance SET status='TERMINATED', ended_at=CURRENT_TIMESTAMP WHERE id=?", (inv["instance_id"],), conn)
        db.execute("UPDATE flow_task SET status='CANCEL' WHERE instance_id=? AND status='TODO'", (inv["instance_id"],), conn)
        db.execute("UPDATE invoice SET approval_status='草稿', instance_id=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?", (invoice_id,), conn)

    db.transaction(_do)
    return get_invoice(invoice_id)


def void(invoice_id, user):
    inv = db.query_one("SELECT * FROM invoice WHERE id=? AND flag=1", (invoice_id,))
    if not inv:
        raise ValueError("开票不存在")
    if inv["approval_status"] != "已批准":
        raise ValueError("仅已批准的开票可作废")
    domain_rules.rule_invoice_void_eligible(invoice_id)

    def _do(conn):
        db.execute("UPDATE invoice SET approval_status='已作废', updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                   (user["id"], invoice_id), conn)
        sync_service.update_payment_stage_invoice_status(inv["contract_id"], conn)

    db.transaction(_do)
    return get_invoice(invoice_id)


def sync_status_from_instance(instance_id, conn):
    inst = db.query_one("SELECT * FROM flow_instance WHERE id=?", (instance_id,), conn)
    if not inst:
        return None
    inv = db.query_one("SELECT * FROM invoice WHERE instance_id=? AND flag=1", (instance_id,), conn)
    if not inv:
        return None
    status = None
    if inst["status"] == "APPROVED":
        status = "已批准"
    elif inst["status"] == "REJECTED":
        status = "已驳回"
    if status and status != inv["approval_status"]:
        db.execute("UPDATE invoice SET approval_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (status, inv["id"]), conn)
        if status == "已批准":
            sync_service.update_payment_stage_invoice_status(inv["contract_id"], conn)
    return status
