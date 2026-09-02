"""跨对象业务规则（M3 规则模型的完整实现，规则 ID 与 m3-rule-model.yaml 对齐）。"""
import db


def rule_contract_invoice_eligible(contract_id):
    c = db.query_one("SELECT status FROM contract WHERE id=? AND flag=1", (contract_id,))
    if not c:
        raise ValueError("合同不存在")
    if c["status"] not in ("已纳入管理", "已结清"):
        raise ValueError("仅已纳入管理或已结清的合同可开票")


def rule_paystage_remain_quota(contract_id, stage_id, current_amount):
    stage = db.query_one(
        "SELECT * FROM contract_stage WHERE contract_id=? AND stage_id=? AND flag=1", (contract_id, stage_id))
    if not stage:
        raise ValueError("付款阶段不存在")
    row = db.query_one(
        """
        SELECT COALESCE(SUM(a.allocated_amount), 0) AS amt FROM invoice_allocation a
        JOIN invoice i ON i.id = a.invoice_id
        WHERE a.contract_id=? AND a.stage_id=? AND a.flag=1 AND i.approval_status='已批准'
        """,
        (contract_id, stage_id))
    hist = row["amt"] if row else 0
    if hist + current_amount > stage["stage_amount"]:
        raise ValueError(f"付款阶段「{stage['stage_name']}」剩余可开票额度不足")


def rule_invoice_remain_receipt_quota(invoice_id, current_amount):
    inv = db.query_one("SELECT invoice_amount FROM invoice WHERE id=? AND flag=1", (invoice_id,))
    if not inv:
        raise ValueError("开票不存在")
    row = db.query_one(
        "SELECT COALESCE(SUM(receipt_amount),0) AS amt FROM receipt WHERE invoice_id=? AND flag=1 AND status='已登记'",
        (invoice_id,))
    hist = row["amt"] if row else 0
    if hist + current_amount > inv["invoice_amount"]:
        raise ValueError("累计收款金额不得超过开票金额")


def rule_invoice_taxrate_consistent(contract_id, invoice_tax_rate):
    c = db.query_one("SELECT tax_rate FROM contract WHERE id=? AND flag=1", (contract_id,))
    if c and abs(c["tax_rate"] - float(invoice_tax_rate)) > 1e-9:
        raise ValueError("开票税率必须与合同税率一致")


def rule_allocation_contract_consistent(invoice_contract_id, allocation_contract_id):
    if invoice_contract_id != allocation_contract_id:
        raise ValueError("分摊记录所属合同必须与开票所属合同一致")


def rule_receipt_contract_consistent(receipt_contract_id, invoice_contract_id):
    if receipt_contract_id != invoice_contract_id:
        raise ValueError("收款所属合同必须与开票所属合同一致")


def rule_owner_dept_consistent(owner_id, contract_department_id):
    e = db.query_one("SELECT department_id FROM employee WHERE id=? AND flag=1", (owner_id,))
    if e and e["department_id"] != contract_department_id:
        raise ValueError("责任人所属部门必须与合同所属部门一致")


def rule_contract_void_eligible(contract_id):
    approved = db.query_one(
        "SELECT COUNT(*) AS c FROM invoice WHERE contract_id=? AND flag=1 AND approval_status='已批准'", (contract_id,))["c"]
    receipt = db.query_one(
        "SELECT COUNT(*) AS c FROM receipt WHERE contract_id=? AND flag=1 AND status='已登记'", (contract_id,))["c"]
    if approved > 0 or receipt > 0:
        raise ValueError("存在已批准开票或有效收款，合同不可作废")


def rule_invoice_void_eligible(invoice_id):
    receipt = db.query_one(
        "SELECT COUNT(*) AS c FROM receipt WHERE invoice_id=? AND flag=1 AND status='已登记'", (invoice_id,))["c"]
    if receipt > 0:
        raise ValueError("存在有效收款，开票不可作废")
