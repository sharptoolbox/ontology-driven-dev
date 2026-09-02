import db
from services import domain_rules, sync_service
from utils.codegen import generate_code


def get_receipt(receipt_id):
    return db.query_one(
        """
        SELECT r.*, c.contract_no, c.contract_name, i.invoice_no, i.invoice_amount
        FROM receipt r
        LEFT JOIN contract c ON c.id = r.contract_id
        LEFT JOIN invoice i ON i.id = r.invoice_id
        WHERE r.id = ? AND r.flag = 1
        """,
        (receipt_id,))


def list_receipts(page=1, size=10, filters=None):
    filters = filters or {}
    where = "WHERE r.flag = 1"
    params = []
    if filters.get("receipt_no"):
        where += " AND r.receipt_no LIKE ?"
        params.append(f"%{filters['receipt_no']}%")
    if filters.get("contract_id"):
        where += " AND r.contract_id = ?"
        params.append(filters["contract_id"])
    if filters.get("invoice_id"):
        where += " AND r.invoice_id = ?"
        params.append(filters["invoice_id"])
    base = """
        FROM receipt r
        LEFT JOIN contract c ON c.id = r.contract_id
        LEFT JOIN invoice i ON i.id = r.invoice_id
    """
    total = db.query_one(f"SELECT COUNT(*) AS c {base} {where}", params)["c"]
    rows = db.query(
        f"SELECT r.*, c.contract_no, c.contract_name, i.invoice_no, i.invoice_amount {base} {where} ORDER BY r.id DESC LIMIT ? OFFSET ?",
        params + [size, (page - 1) * size],
    )
    return {"list": rows, "total": total, "page": page, "size": size}


def record(data, user):
    if not data.get("invoice_id"):
        raise ValueError("对应开票必填")
    inv = db.query_one("SELECT * FROM invoice WHERE id=? AND flag=1", (data["invoice_id"],))
    if not inv:
        raise ValueError("开票不存在")
    if inv["approval_status"] != "已批准":
        raise ValueError("仅已批准的开票可收款")
    contract_id = data.get("contract_id") or inv["contract_id"]
    domain_rules.rule_receipt_contract_consistent(contract_id, inv["contract_id"])
    amount = float(data.get("receipt_amount") or 0)
    if amount <= 0:
        raise ValueError("收款金额必须大于 0")
    domain_rules.rule_invoice_remain_receipt_quota(inv["id"], amount)

    def _do(conn):
        no = generate_code("Receipt", "receipt", "receipt_no", conn)
        rid = db.execute(
            """
            INSERT INTO receipt (receipt_no, contract_id, invoice_id, receipt_amount, receipt_time, receipt_method, status, remark, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, '已登记', ?, ?, ?)
            """,
            (no, contract_id, inv["id"], amount, data.get("receipt_time"), data.get("receipt_method"), data.get("remark"), user["id"], user["id"]),
            conn,
        )[0]
        sync_service.update_invoice_receipt_status(inv["id"], conn)
        return rid

    rid = db.transaction(_do)
    return get_receipt(rid)


def reverse(receipt_id, user):
    r = db.query_one("SELECT * FROM receipt WHERE id=? AND flag=1", (receipt_id,))
    if not r:
        raise ValueError("收款不存在")
    if r["status"] != "已登记":
        raise ValueError("仅已登记的收款可冲销")

    def _do(conn):
        db.execute("UPDATE receipt SET status='已冲销', updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (user["id"], receipt_id), conn)
        sync_service.update_invoice_receipt_status(r["invoice_id"], conn)

    db.transaction(_do)
    return get_receipt(receipt_id)
