"""开票（OBJ-003）行为与规则实现。

覆盖 M2：FUN-009 开票登记、FUN-010 开票信息查询。
覆盖 M3：RULE-003 阶段开票唯一性、RULE-004 开票金额与税率取值、RULE-008、RULE-009。
"""

import datetime

import db
from services import contract_service, scope_service
from utils import codegen
from utils.rules import money

RECEIVE_LABELS = {
    "UNRECEIVED": "未收款",
    "PARTIAL": "部分收款",
    "RECEIVED": "已收款",
}

INVOICE_SELECT = """
SELECT i.*, c.contract_name, c.dept_no, d.dept_name,
       COALESCE(st.stage_name, i.stage_no) AS stage_name
FROM contract_invoice i
LEFT JOIN contract c ON c.contract_no = i.contract_no
LEFT JOIN mdm_department d ON d.dept_no = c.dept_no
LEFT JOIN contract_stage st ON st.contract_id = c.id AND st.stage_no = i.stage_no AND st.flag = 1
"""


class BusinessError(ValueError):
    pass


def _decorate(row):
    item = dict(row)
    item["receive_status_label"] = RECEIVE_LABELS.get(item.get("receive_status"), item.get("receive_status"))
    return item


def list_invoices(ctx, params):
    page = max(1, int(params.get("page") or 1))
    size = min(200, max(1, int(params.get("size") or 10)))
    where = ["i.flag=1"]
    values = []

    for field, column in (
        ("invoice_no", "i.invoice_no"),
        ("contract_no", "i.contract_no"),
        ("contract_name", "c.contract_name"),
    ):
        value = (params.get(field) or "").strip()
        if value:
            where.append("{} LIKE ?".format(column))
            values.append("%{}%".format(value))

    if (params.get("receive_status") or "").strip():
        where.append("i.receive_status = ?")
        values.append(params["receive_status"].strip())
    if (params.get("invoice_date_from") or "").strip():
        where.append("i.invoice_date >= ?")
        values.append(params["invoice_date_from"].strip())
    if (params.get("invoice_date_to") or "").strip():
        where.append("i.invoice_date <= ?")
        values.append(params["invoice_date_to"].strip())

    scope_sql, scope_values = scope_service.contract_scope_clause(ctx, "c")
    where.append(scope_sql)
    values.extend(scope_values)

    where_sql = " AND ".join(where)
    total = db.query_one(
        """
        SELECT COUNT(*) AS c FROM contract_invoice i
        LEFT JOIN contract c ON c.contract_no = i.contract_no
        WHERE {}
        """.format(where_sql),
        values,
    )["c"]
    rows = db.query(
        INVOICE_SELECT
        + " WHERE {} ORDER BY i.invoice_date DESC, i.id DESC LIMIT ? OFFSET ?".format(where_sql),
        values + [size, (page - 1) * size],
    )
    return {"list": [_decorate(r) for r in rows], "total": total, "page": page, "size": size}


def invoice_options(ctx):
    """开票登记可选的合同及其未开票阶段（仅已生效合同）。"""
    scope_sql, scope_values = scope_service.contract_scope_clause(ctx, "c")
    contracts = db.query(
        """
        SELECT c.id, c.contract_no, c.contract_name, c.tax_rate, c.effective_time, c.total_amount
        FROM contract c
        WHERE c.flag=1 AND c.status='EFFECTIVE' AND {}
        ORDER BY c.sign_date DESC, c.id DESC
        """.format(scope_sql),
        scope_values,
    )
    result = []
    for contract in contracts:
        stages = db.query(
            """
            SELECT stage_no, stage_name, stage_amount, ratio
            FROM contract_stage
            WHERE contract_id=? AND flag=1 AND invoice_status='未开票'
            ORDER BY CAST(stage_no AS INTEGER), id
            """,
            (contract["id"],),
        )
        if not stages:
            continue
        result.append({
            "contract_no": contract["contract_no"],
            "contract_name": contract["contract_name"],
            "tax_rate": contract["tax_rate"],
            "effective_time": contract["effective_time"],
            "stages": [dict(s) for s in stages],
        })
    return result


def create(ctx, payload):
    def _do(conn):
        contract_no = (payload.get("contract_no") or "").strip()
        stage_no = str(payload.get("stage_no") or "").strip()
        if not contract_no:
            raise BusinessError("请选择对应合同")
        if not stage_no:
            raise BusinessError("请选择对应付款阶段")

        contract = db.query_one("SELECT * FROM contract WHERE contract_no=? AND flag=1", (contract_no,), conn)
        if not contract:
            raise BusinessError("合同不存在")
        if not scope_service.can_see_contract(ctx, contract):
            raise BusinessError("无权对该合同开票")
        # RULE-008 开票登记仅可选中已生效合同
        if contract["status"] != "EFFECTIVE":
            raise BusinessError("只有已生效的合同可以开票，当前状态：{}".format(
                contract_service.STATUS_LABELS.get(contract["status"], contract["status"])
            ))

        stage = db.query_one(
            "SELECT * FROM contract_stage WHERE contract_id=? AND stage_no=? AND flag=1",
            (contract["id"], stage_no),
            conn,
        )
        if not stage:
            raise BusinessError("付款阶段不存在")

        # RULE-003 付款阶段开票唯一性
        if stage["invoice_status"] == "已开票":
            raise BusinessError("该付款阶段已开票，不允许重复开票")
        exists = db.query_one(
            "SELECT id FROM contract_invoice WHERE contract_no=? AND stage_no=? AND flag=1",
            (contract_no, stage_no),
            conn,
        )
        if exists:
            raise BusinessError("该付款阶段已开票，不允许重复开票")

        # RULE-004 开票金额取阶段金额，税率默认合同税率
        invoice_amount = money(stage["stage_amount"])
        try:
            tax_rate = round(float(payload.get("tax_rate", contract["tax_rate"])), 2)
        except (TypeError, ValueError):
            raise BusinessError("开票税率必须为数字")
        if tax_rate < 0 or tax_rate > 100:
            raise BusinessError("开票税率取值范围为 0~100")

        invoice_date = (payload.get("invoice_date") or "").strip() or datetime.date.today().isoformat()
        try:
            day = datetime.date.fromisoformat(invoice_date)
        except ValueError:
            raise BusinessError("开票时间格式不正确")
        if day > datetime.date.today():
            raise BusinessError("开票时间不得晚于当前日期")
        effective_day = (contract["effective_time"] or "")[:10]
        if effective_day and invoice_date < effective_day:
            raise BusinessError("开票时间不得早于合同生效日期 {}".format(effective_day))

        remark = (payload.get("remark") or "").strip()
        if len(remark) > 200:
            raise BusinessError("备注不能超过 200 个字符")

        invoice_no = codegen.next_invoice_no(conn)
        db.execute(
            """
            INSERT INTO contract_invoice (invoice_no, contract_no, stage_no, invoice_amount, tax_rate,
                invoice_date, receive_status, received_amount, unreceived_amount, invoice_by, remark,
                created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, 'UNRECEIVED', 0, ?, ?, ?, ?, ?)
            """,
            (
                invoice_no, contract_no, stage_no, invoice_amount, tax_rate, invoice_date,
                invoice_amount, ctx["name"], remark, ctx["id"], ctx["id"],
            ),
            conn,
        )
        db.execute(
            """
            UPDATE contract_stage SET invoice_status='已开票', invoice_no=?, updated_by=?,
                updated_at=CURRENT_TIMESTAMP
            WHERE id=?
            """,
            (invoice_no, ctx["id"], stage["id"]),
            conn,
        )
        contract_service.recalc_contract_amounts(conn, contract_no)
        return {"invoice_no": invoice_no, "invoice_amount": invoice_amount}

    return db.transaction(_do)
