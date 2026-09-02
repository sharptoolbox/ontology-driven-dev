"""M7 查询报表实现：REP-03 / REP-04 / REP-05。"""
import db


def execution_analysis(page=1, size=10, filters=None):
    """REP-03 合同执行情况分析：按合同汇总收款进度。"""
    filters = filters or {}
    where = "WHERE c.flag = 1"
    params = []
    if filters.get("department_id"):
        where += " AND c.department_id = ?"
        params.append(filters["department_id"])
    if filters.get("owner_id"):
        where += " AND c.owner_id = ?"
        params.append(filters["owner_id"])
    base = """
        FROM contract c
        LEFT JOIN (SELECT contract_id, SUM(invoice_amount) AS invoiced FROM invoice WHERE flag=1 AND approval_status='已批准' GROUP BY contract_id) inv ON inv.contract_id = c.id
        LEFT JOIN (SELECT contract_id, SUM(receipt_amount) AS received FROM receipt WHERE flag=1 AND status='已登记' GROUP BY contract_id) rcp ON rcp.contract_id = c.id
    """
    total = db.query_one(f"SELECT COUNT(*) AS c {base} {where}", params)["c"]
    rows = db.query(
        f"""
        SELECT c.contract_no, c.contract_name, c.total_amount,
               COALESCE(inv.invoiced, 0) AS invoiced_amount,
               COALESCE(rcp.received, 0) AS received_amount,
               c.status, c.sign_date
        {base} {where} ORDER BY c.id DESC LIMIT ? OFFSET ?
        """,
        params + [size, (page - 1) * size],
    )
    for r in rows:
        r["unreceived_amount"] = round(r["total_amount"] - r["received_amount"], 2)
        r["receipt_rate"] = round(r["received_amount"] / r["total_amount"], 4) if r["total_amount"] else 0
    return {"list": rows, "total": total, "page": page, "size": size}


def dept_summary(filters=None):
    """REP-04 部门合同统计分析：按部门汇总。"""
    filters = filters or {}
    where = "WHERE c.flag = 1"
    params = []
    if filters.get("department_id"):
        where += " AND c.department_id = ?"
        params.append(filters["department_id"])
    rows = db.query(
        f"""
        SELECT d.id AS department_id, d.department_name, c.contract_no, c.contract_name, c.total_amount,
               COALESCE(inv.invoiced, 0) AS invoiced_amount,
               COALESCE(rcp.received, 0) AS received_amount,
               c.status
        FROM department d
        LEFT JOIN contract c ON c.department_id = d.id AND c.flag = 1
        LEFT JOIN (SELECT contract_id, SUM(invoice_amount) AS invoiced FROM invoice WHERE flag=1 AND approval_status='已批准' GROUP BY contract_id) inv ON inv.contract_id = c.id
        LEFT JOIN (SELECT contract_id, SUM(receipt_amount) AS received FROM receipt WHERE flag=1 AND status='已登记' GROUP BY contract_id) rcp ON rcp.contract_id = c.id
        {where.replace('c.flag', 'c.flag')} ORDER BY d.id
        """,
        params,
    )
    agg = {}
    for r in rows:
        key = r["department_id"]
        if key not in agg:
            agg[key] = {"department_name": r["department_name"], "contract_count": 0, "contract_amount": 0,
                        "invoiced_amount": 0, "received_amount": 0, "settled_count": 0}
        if r["contract_no"]:
            agg[key]["contract_count"] += 1
            agg[key]["contract_amount"] += r["total_amount"] or 0
            agg[key]["invoiced_amount"] += r["invoiced_amount"] or 0
            agg[key]["received_amount"] += r["received_amount"] or 0
            if r["status"] == "已结清":
                agg[key]["settled_count"] += 1
    result = []
    for k, v in agg.items():
        v["unreceived_amount"] = round(v["invoiced_amount"] - v["received_amount"], 2)
        result.append(v)
    return result


def unreceived(page=1, size=10, filters=None):
    """REP-05 已开票未收款分析。"""
    filters = filters or {}
    where = "WHERE i.flag = 1 AND i.approval_status = '已批准' AND COALESCE(rcp.received, 0) < i.invoice_amount"
    params = []
    if filters.get("department_id"):
        where += " AND c.department_id = ?"
        params.append(filters["department_id"])
    base = """
        FROM invoice i
        JOIN contract c ON c.id = i.contract_id
        LEFT JOIN (SELECT invoice_id, SUM(receipt_amount) AS received, MAX(receipt_time) AS latest FROM receipt WHERE flag=1 AND status='已登记' GROUP BY invoice_id) rcp ON rcp.invoice_id = i.id
    """
    total = db.query_one(f"SELECT COUNT(*) AS c {base} {where}", params)["c"]
    rows = db.query(
        f"""
        SELECT i.invoice_no, i.invoice_date, i.invoice_amount, COALESCE(rcp.received, 0) AS received_amount,
               rcp.latest AS latest_receipt_time, c.contract_no, c.contract_name
        {base} {where} ORDER BY i.id DESC LIMIT ? OFFSET ?
        """,
        params + [size, (page - 1) * size],
    )
    for r in rows:
        r["outstanding_amount"] = round(r["invoice_amount"] - r["received_amount"], 2)
    return {"list": rows, "total": total, "page": page, "size": size}
