"""收款（OBJ-004）行为与规则实现。

覆盖 M2：FUN-011 收款登记、FUN-012 收款信息查询。
覆盖 M3：RULE-005 收款金额上限、RULE-006 开票收款状态自动更新、
RULE-007 合同自动关闭、RULE-008、RULE-009。
"""

import datetime

import db
from services import contract_service, invoice_service, scope_service
from utils import codegen
from utils.rules import money

RECEIPT_SELECT = """
SELECT r.*, c.contract_name, c.dept_no, d.dept_name
FROM contract_receipt r
LEFT JOIN contract c ON c.contract_no = r.contract_no
LEFT JOIN mdm_department d ON d.dept_no = c.dept_no
"""


class BusinessError(ValueError):
    pass


def list_receipts(ctx, params):
    page = max(1, int(params.get("page") or 1))
    size = min(200, max(1, int(params.get("size") or 10)))
    where = ["r.flag=1"]
    values = []

    for field, column in (
        ("receive_no", "r.receive_no"),
        ("contract_no", "r.contract_no"),
        ("invoice_no", "r.invoice_no"),
    ):
        value = (params.get(field) or "").strip()
        if value:
            where.append("{} LIKE ?".format(column))
            values.append("%{}%".format(value))

    if (params.get("receive_method") or "").strip():
        where.append("r.receive_method = ?")
        values.append(params["receive_method"].strip())
    if (params.get("receive_date_from") or "").strip():
        where.append("r.receive_date >= ?")
        values.append(params["receive_date_from"].strip())
    if (params.get("receive_date_to") or "").strip():
        where.append("r.receive_date <= ?")
        values.append(params["receive_date_to"].strip())

    scope_sql, scope_values = scope_service.contract_scope_clause(ctx, "c")
    where.append(scope_sql)
    values.extend(scope_values)

    where_sql = " AND ".join(where)
    total = db.query_one(
        """
        SELECT COUNT(*) AS c FROM contract_receipt r
        LEFT JOIN contract c ON c.contract_no = r.contract_no
        WHERE {}
        """.format(where_sql),
        values,
    )["c"]
    rows = db.query(
        RECEIPT_SELECT
        + " WHERE {} ORDER BY r.receive_date DESC, r.id DESC LIMIT ? OFFSET ?".format(where_sql),
        values + [size, (page - 1) * size],
    )
    return {"list": [dict(r) for r in rows], "total": total, "page": page, "size": size}


def receipt_options(ctx):
    """收款登记可选合同与可收款开票（未收款 / 部分收款）。"""
    scope_sql, scope_values = scope_service.contract_scope_clause(ctx, "c")
    contracts = db.query(
        """
        SELECT c.contract_no, c.contract_name
        FROM contract c
        WHERE c.flag=1 AND c.status IN ('EFFECTIVE','CLOSED') AND {}
        ORDER BY c.sign_date DESC, c.id DESC
        """.format(scope_sql),
        scope_values,
    )
    result = []
    for contract in contracts:
        invoices = db.query(
            """
            SELECT invoice_no, invoice_amount, received_amount, unreceived_amount, receive_status, invoice_date
            FROM contract_invoice
            WHERE contract_no=? AND flag=1 AND receive_status IN ('UNRECEIVED','PARTIAL')
            ORDER BY invoice_date, id
            """,
            (contract["contract_no"],),
        )
        if not invoices:
            continue
        result.append({
            "contract_no": contract["contract_no"],
            "contract_name": contract["contract_name"],
            "invoices": [
                {
                    "invoice_no": i["invoice_no"],
                    "invoice_amount": i["invoice_amount"],
                    "received_amount": i["received_amount"],
                    "unreceived_amount": i["unreceived_amount"],
                    "receive_status": i["receive_status"],
                    "receive_status_label": invoice_service.RECEIVE_LABELS.get(i["receive_status"]),
                    "invoice_date": i["invoice_date"],
                }
                for i in invoices
            ],
        })
    return result


def create(ctx, payload):
    def _do(conn):
        contract_no = (payload.get("contract_no") or "").strip()
        invoice_no = (payload.get("invoice_no") or "").strip()
        if not contract_no:
            raise BusinessError("请选择对应合同")
        if not invoice_no:
            raise BusinessError("请选择对应开票")

        contract = db.query_one("SELECT * FROM contract WHERE contract_no=? AND flag=1", (contract_no,), conn)
        if not contract:
            raise BusinessError("合同不存在")
        if not scope_service.can_see_contract(ctx, contract):
            raise BusinessError("无权对该合同登记收款")
        if contract["status"] not in ("EFFECTIVE", "CLOSED"):
            raise BusinessError("只有已生效或已关闭的合同可以登记收款")

        invoice = db.query_one(
            "SELECT * FROM contract_invoice WHERE invoice_no=? AND contract_no=? AND flag=1",
            (invoice_no, contract_no),
            conn,
        )
        if not invoice:
            raise BusinessError("开票记录不存在或不属于该合同")
        if invoice["receive_status"] == "RECEIVED":
            raise BusinessError("该开票已收款完成，不允许继续登记收款")

        amount = money(payload.get("receive_amount"))
        unreceived = money(invoice["unreceived_amount"])
        if not amount > 0:
            raise BusinessError("收款金额必须大于 0")
        if amount > unreceived + 0.001:
            raise BusinessError("本次收款金额不得超过该开票未收款金额 {:.2f} 元".format(unreceived))

        receive_date = (payload.get("receive_date") or "").strip() or datetime.date.today().isoformat()
        try:
            day = datetime.date.fromisoformat(receive_date)
        except ValueError:
            raise BusinessError("收款时间格式不正确")
        if day > datetime.date.today():
            raise BusinessError("收款时间不得晚于当前日期")
        if receive_date < invoice["invoice_date"]:
            raise BusinessError("收款时间不得早于开票时间")

        method = (payload.get("receive_method") or "").strip()
        if method:
            enabled = db.query_one(
                "SELECT id FROM dict_item WHERE dict_type='RECEIVE_METHOD' AND dict_code=? AND flag=1 AND enabled='是'",
                (method,),
                conn,
            )
            if not enabled:
                raise BusinessError("收款方式不存在或已停用")

        remark = (payload.get("remark") or "").strip()
        if len(remark) > 200:
            raise BusinessError("备注不能超过 200 个字符")

        receive_no = codegen.next_receive_no(conn)
        db.execute(
            """
            INSERT INTO contract_receipt (receive_no, contract_no, invoice_no, receive_amount,
                receive_date, receive_method, receive_by, remark, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                receive_no, contract_no, invoice_no, amount, receive_date, method,
                ctx["name"], remark, ctx["id"], ctx["id"],
            ),
            conn,
        )

        # RULE-006 开票收款状态自动更新
        total_received = db.query_one(
            "SELECT COALESCE(SUM(receive_amount),0) AS s FROM contract_receipt WHERE invoice_no=? AND flag=1",
            (invoice_no,),
            conn,
        )["s"]
        last_date = db.query_one(
            "SELECT MAX(receive_date) AS d FROM contract_receipt WHERE invoice_no=? AND flag=1",
            (invoice_no,),
            conn,
        )["d"]
        total_received = money(total_received)
        invoice_amount = money(invoice["invoice_amount"])
        if total_received <= 0:
            status = "UNRECEIVED"
        elif total_received >= invoice_amount - 0.001:
            status = "RECEIVED"
            total_received = invoice_amount
        else:
            status = "PARTIAL"
        db.execute(
            """
            UPDATE contract_invoice
            SET received_amount=?, unreceived_amount=?, receive_status=?, last_receive_date=?,
                updated_at=CURRENT_TIMESTAMP
            WHERE id=?
            """,
            (
                total_received, max(0.0, money(invoice_amount - total_received)), status,
                last_date, invoice["id"],
            ),
            conn,
        )

        contract_service.recalc_contract_amounts(conn, contract_no)
        # RULE-007 合同自动关闭
        closed = contract_service.try_auto_close(conn, contract_no)
        return {
            "receive_no": receive_no,
            "contract_closed": closed,
            "invoice_status": status,
            "invoice_status_label": invoice_service.RECEIVE_LABELS.get(status),
        }

    return db.transaction(_do)
