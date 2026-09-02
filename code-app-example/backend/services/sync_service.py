"""同步联动（syncTriggers）自动行为 B-01 / B-02 / B-03，及审批记录。"""
import db
from utils.codegen import generate_code


def write_approval_record(conn, biz_type, biz_no, node_name, role_id, approver_id, result, comment):
    no = generate_code("ApprovalRecord", "approval_record", "approval_no", conn)
    db.execute(
        """
        INSERT INTO approval_record
            (approval_no, biz_type, biz_no, approval_node, approval_role_id, approver_id, approval_result, approval_comment, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (no, biz_type, biz_no, node_name, role_id, approver_id, result, comment, approver_id, approver_id),
        conn,
    )


# B-01 更新付款阶段开票状态（开票批准或作废后触发）
def update_payment_stage_invoice_status(contract_id, conn):
    stages = db.query("SELECT * FROM contract_stage WHERE contract_id=? AND flag=1", (contract_id,), conn)
    for s in stages:
        row = db.query_one(
            """
            SELECT COALESCE(SUM(a.allocated_amount), 0) AS amt
            FROM invoice_allocation a JOIN invoice i ON i.id = a.invoice_id
            WHERE a.stage_id=? AND a.contract_id=? AND a.flag=1 AND i.approval_status='已批准'
            """,
            (s["stage_id"], contract_id),
            conn,
        )
        amt = row["amt"] if row else 0
        status = "已足额开票" if amt >= s["stage_amount"] else ("部分开票" if amt > 0 else "未开票")
        db.execute("UPDATE contract_stage SET invoice_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (status, s["id"]), conn)
    update_contract_settlement(contract_id, conn)


# B-02 更新开票收款状态（收款登记或冲销后触发）
def update_invoice_receipt_status(invoice_id, conn):
    inv = db.query_one("SELECT * FROM invoice WHERE id=? AND flag=1", (invoice_id,), conn)
    if not inv:
        return
    row = db.query_one(
        "SELECT COALESCE(SUM(receipt_amount),0) AS amt, MAX(receipt_time) AS t FROM receipt WHERE invoice_id=? AND flag=1 AND status='已登记'",
        (invoice_id,),
        conn,
    )
    amt = row["amt"] if row else 0
    received_flag = 1 if amt >= inv["invoice_amount"] else 0
    received_date = row["t"] if received_flag else None
    db.execute(
        "UPDATE invoice SET received_amount=?, received_flag=?, received_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (amt, received_flag, received_date, invoice_id),
        conn,
    )
    update_contract_settlement(inv["contract_id"], conn)


# B-03 更新合同结清状态（R-10 判定后触发）
def update_contract_settlement(contract_id, conn):
    contract = db.query_one("SELECT * FROM contract WHERE id=? AND flag=1", (contract_id,), conn)
    if not contract:
        return
    stages = db.query("SELECT * FROM contract_stage WHERE contract_id=? AND flag=1", (contract_id,), conn)
    invoices = db.query(
        "SELECT * FROM invoice WHERE contract_id=? AND flag=1 AND approval_status='已批准'", (contract_id,), conn)
    all_stages_fully = bool(stages) and all(s["invoice_status"] == "已足额开票" for s in stages)
    all_invoices_received = bool(invoices) and all(i["received_flag"] == 1 for i in invoices)
    if all_stages_fully and all_invoices_received:
        if contract["status"] not in ("已作废", "已归档"):
            db.execute("UPDATE contract SET status='已结清', updated_at=CURRENT_TIMESTAMP WHERE id=?", (contract_id,), conn)
    else:
        if contract["status"] == "已结清":
            db.execute("UPDATE contract SET status='已纳入管理', updated_at=CURRENT_TIMESTAMP WHERE id=?", (contract_id,), conn)
