"""合同（OBJ-001 + OBJ-002）行为与规则实现。

覆盖 M2：FUN-001 新增、FUN-002 修改、FUN-003 删除、FUN-004 提交审批、
FUN-005 撤回、FUN-006 审批处理、FUN-007 查询、FUN-008 详情。
覆盖 M3：RULE-001 比例合计、RULE-002 阶段金额、RULE-008 状态可用性、
RULE-009 数据权限、RULE-010 引用保护。
"""

import datetime
import json

import db
from engine.flow_engine import FlowEngine
from services import scope_service
from utils import codegen
from utils.rules import money

DRAFT = "DRAFT"
APPROVING = "APPROVING"
EFFECTIVE = "EFFECTIVE"
CLOSED = "CLOSED"

STATUS_LABELS = {
    DRAFT: "草稿",
    APPROVING: "审批中",
    EFFECTIVE: "已生效",
    CLOSED: "已关闭",
}

FLOW_CODE = "APR-001"
APPROVAL_THRESHOLD = 1000000.0

CONTRACT_SELECT = """
SELECT c.*,
       p.product_name,
       cu.customer_name,
       d.dept_name,
       pe.person_name AS owner_name
FROM contract c
LEFT JOIN mdm_product p ON p.product_no = c.product_no
LEFT JOIN mdm_customer cu ON cu.customer_no = c.customer_no
LEFT JOIN mdm_department d ON d.dept_no = c.dept_no
LEFT JOIN mdm_person pe ON pe.person_no = c.owner_no
"""


class BusinessError(ValueError):
    pass


def _today():
    return datetime.date.today().isoformat()


def _now():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _dict_label_map(dict_type):
    rows = db.query(
        "SELECT dict_code, dict_name FROM dict_item WHERE dict_type=? AND flag=1", (dict_type,)
    )
    return {r["dict_code"]: r["dict_name"] for r in rows}


def decorate(row, types=None):
    if not row:
        return None
    item = dict(row)
    item["status_label"] = STATUS_LABELS.get(item.get("status"), item.get("status"))
    type_map = (types or {}).get("CONTRACT_TYPE")
    if type_map is None:
        type_map = _dict_label_map("CONTRACT_TYPE")
    item["contract_type_label"] = type_map.get(item.get("contract_type"), item.get("contract_type"))
    return item


# ---------------------------------------------------------------- 编号

def prefill_no():
    return _peek_no("HT", "contract_no", "contract")


def _peek_no(prefix, column, table):
    import re
    month = datetime.date.today().strftime("%Y%m")
    row = db.query_one(
        "SELECT MAX({col}) AS mx FROM {tbl} WHERE {col} LIKE ?".format(col=column, tbl=table),
        ("{}{}%".format(prefix, month),),
    )
    current = 0
    if row and row["mx"]:
        match = re.match(r"^{0}{1}(\d+)$".format(prefix, month), row["mx"])
        if match:
            current = int(match.group(1))
    return "{}{}{:04d}".format(prefix, month, current + 1)


# ---------------------------------------------------------------- 校验

def _normalize_stages(raw_stages, total_amount):
    if not raw_stages:
        raise BusinessError("付款条款至少需要 1 条")
    stages = []
    names = set()
    ratio_sum = 0.0
    amount_sum = 0.0
    for index, raw in enumerate(raw_stages, start=1):
        name = (raw.get("stage_name") or "").strip()
        if not name:
            raise BusinessError("第 {} 条付款条款的付款阶段名称不能为空".format(index))
        if len(name) > 50:
            raise BusinessError("第 {} 条付款阶段名称不能超过 50 个字符".format(index))
        if name in names:
            raise BusinessError("同一合同内付款阶段名称不可重复：{}".format(name))
        names.add(name)

        try:
            ratio = round(float(raw.get("ratio")), 2)
        except (TypeError, ValueError):
            raise BusinessError("第 {} 条付款比例必须为数字".format(index))
        if not (ratio > 0 and ratio <= 100):
            raise BusinessError("第 {} 条付款比例必须大于 0 且不大于 100".format(index))

        condition = (raw.get("pay_condition") or "").strip()
        if not condition:
            raise BusinessError("第 {} 条阶段付款条件不能为空".format(index))
        if len(condition) > 200:
            raise BusinessError("第 {} 条阶段付款条件不能超过 200 个字符".format(index))

        stage_amount = money(total_amount * ratio / 100)
        ratio_sum += ratio
        amount_sum += stage_amount
        stages.append({
            "stage_no": str(index),
            "stage_name": name,
            "ratio": ratio,
            "stage_amount": stage_amount,
            "pay_condition": condition,
            "remark": (raw.get("remark") or "").strip()[:200],
            "invoice_status": "未开票",
            "invoice_no": None,
            "locked": False,
        })

    # RULE-001 付款条款比例合计与完整性规则
    if abs(ratio_sum - 100.0) > 0.001:
        raise BusinessError("付款条款比例合计必须为 100%，当前为 {:.2f}%".format(ratio_sum))
    # RULE-002 阶段金额自动计算与尾差规则
    if abs(amount_sum - total_amount) > 0.01:
        raise BusinessError(
            "付款条款金额合计与合同总金额不一致：条款合计 {:.2f} 元，合同总金额 {:.2f} 元".format(
                amount_sum, total_amount
            )
        )
    return stages


def _validate_master(payload, conn=None):
    name = (payload.get("contract_name") or "").strip()
    if not name:
        raise BusinessError("合同名称不能为空")
    if len(name) > 100:
        raise BusinessError("合同名称不能超过 100 个字符")

    product_no = (payload.get("product_no") or "").strip()
    if not product_no:
        raise BusinessError("请选择所属产品")
    if not db.query_one("SELECT id FROM mdm_product WHERE product_no=? AND flag=1", (product_no,), conn):
        raise BusinessError("所属产品不存在")

    customer_no = (payload.get("customer_no") or "").strip()
    if not customer_no:
        raise BusinessError("请选择所属客户")
    if not db.query_one("SELECT id FROM mdm_customer WHERE customer_no=? AND flag=1", (customer_no,), conn):
        raise BusinessError("所属客户不存在")

    owner_no = (payload.get("owner_no") or "").strip()
    if not owner_no:
        raise BusinessError("请选择责任人")
    owner = db.query_one("SELECT * FROM mdm_person WHERE person_no=? AND flag=1", (owner_no,), conn)
    if not owner:
        raise BusinessError("责任人不存在")

    dept_no = (payload.get("dept_no") or "").strip() or owner["dept_no"]
    if not db.query_one("SELECT id FROM mdm_department WHERE dept_no=? AND flag=1", (dept_no,), conn):
        raise BusinessError("所属部门不存在")

    contract_type = (payload.get("contract_type") or "").strip()
    if not contract_type:
        raise BusinessError("请选择合同类型")
    enabled = db.query_one(
        "SELECT id FROM dict_item WHERE dict_type='CONTRACT_TYPE' AND dict_code=? AND flag=1 AND enabled='是'",
        (contract_type,),
        conn,
    )
    if not enabled:
        raise BusinessError("合同类型不存在或已停用")

    sign_date = (payload.get("sign_date") or "").strip()
    if not sign_date:
        raise BusinessError("请选择合同签订时间")
    try:
        sign_day = datetime.date.fromisoformat(sign_date)
    except ValueError:
        raise BusinessError("合同签订时间格式不正确")
    if sign_day > datetime.date.today():
        raise BusinessError("合同签订时间不得晚于当前日期")

    total_amount = money(payload.get("total_amount"))
    if not total_amount > 0:
        raise BusinessError("合同总金额必须大于 0")

    purchase_amount = money(payload.get("purchase_amount"))
    if purchase_amount < 0:
        raise BusinessError("合同对外采购金额不得小于 0")
    if purchase_amount > total_amount + 0.001:
        raise BusinessError("合同对外采购金额不得大于合同总金额")

    tax_rate = payload.get("tax_rate")
    try:
        tax_rate = round(float(tax_rate), 2)
    except (TypeError, ValueError):
        raise BusinessError("合同税率必须为数字")
    if tax_rate < 0 or tax_rate > 100:
        raise BusinessError("合同税率取值范围为 0~100")

    remark = (payload.get("remark") or "").strip()
    if len(remark) > 200:
        raise BusinessError("备注不能超过 200 个字符")

    return {
        "contract_name": name,
        "product_no": product_no,
        "customer_no": customer_no,
        "dept_no": dept_no,
        "contract_type": contract_type,
        "sign_date": sign_date,
        "owner_no": owner_no,
        "total_amount": total_amount,
        "purchase_amount": purchase_amount,
        "tax_rate": tax_rate,
        "remark": remark,
    }


def _assert_editable(contract, ctx, conn=None):
    if contract["status"] != DRAFT:
        raise BusinessError("只有草稿状态的合同允许修改，当前状态：{}".format(STATUS_LABELS.get(contract["status"])))
    if not ctx["is_admin"] and contract["created_by"] != ctx["id"]:
        raise BusinessError("只能修改本人创建的合同")


# ---------------------------------------------------------------- 保存

def save(ctx, payload, submit=False):
    contract_no = (payload.get("contract_no") or "").strip()
    is_update = bool(contract_no) and bool(db.query_one("SELECT id FROM contract WHERE contract_no=? AND flag=1", (contract_no,)))

    def _do(conn):
        nonlocal contract_no
        master = _validate_master(payload, conn)
        stages = _normalize_stages(payload.get("stages") or [], master["total_amount"])
        if is_update:
            contract = db.query_one(
                "SELECT * FROM contract WHERE contract_no=? AND flag=1", (contract_no,), conn
            )
            if not contract:
                raise BusinessError("合同不存在")
            _assert_editable(contract, ctx, conn)
            locked = {
                r["stage_no"]: r
                for r in db.query(
                    "SELECT * FROM contract_stage WHERE contract_id=? AND flag=1 AND invoice_no IS NOT NULL",
                    (contract["id"],),
                    conn,
                )
            }
            for stage in stages:
                if stage["stage_no"] in locked:
                    raise BusinessError("已开票的付款阶段不允许修改或删除")
            db.execute(
                """
                UPDATE contract SET contract_name=?, product_no=?, customer_no=?, dept_no=?,
                    contract_type=?, sign_date=?, owner_no=?, total_amount=?, purchase_amount=?,
                    tax_rate=?, remark=?, updated_by=?, updated_at=CURRENT_TIMESTAMP
                WHERE id=?
                """,
                (
                    master["contract_name"], master["product_no"], master["customer_no"], master["dept_no"],
                    master["contract_type"], master["sign_date"], master["owner_no"], master["total_amount"],
                    master["purchase_amount"], master["tax_rate"], master["remark"], ctx["id"], contract["id"],
                ),
                conn,
            )
            db.execute(
                "UPDATE contract_stage SET flag=0, updated_at=CURRENT_TIMESTAMP WHERE contract_id=?",
                (contract["id"],),
                conn,
            )
            contract_id = contract["id"]
        else:
            new_no = codegen.next_contract_no(conn)
            contract_id = db.execute(
                """
                INSERT INTO contract (contract_no, contract_name, product_no, customer_no, dept_no,
                    contract_type, sign_date, owner_no, total_amount, purchase_amount, tax_rate,
                    status, invoiced_amount, received_amount, remark,
                    created_by, created_by_name, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 0, 0, ?, ?, ?, ?)
                """,
                (
                    new_no, master["contract_name"], master["product_no"], master["customer_no"],
                    master["dept_no"], master["contract_type"], master["sign_date"], master["owner_no"],
                    master["total_amount"], master["purchase_amount"], master["tax_rate"], master["remark"],
                    ctx["id"], ctx["name"], ctx["id"],
                ),
                conn,
            )[0]
            contract_no = new_no

        for stage in stages:
            db.execute(
                """
                INSERT INTO contract_stage (contract_id, stage_no, stage_name, ratio, stage_amount,
                    pay_condition, invoice_status, invoice_no, remark, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, '未开票', NULL, ?, ?, ?)
                """,
                (
                    contract_id, stage["stage_no"], stage["stage_name"], stage["ratio"], stage["stage_amount"],
                    stage["pay_condition"], stage["remark"], ctx["id"], ctx["id"],
                ),
                conn,
            )

        if submit:
            _submit_in_transaction(conn, contract_no, ctx)
        return contract_no

    return db.transaction(_do)


def _load_for_write(conn, contract_no):
    contract = db.query_one("SELECT * FROM contract WHERE contract_no=? AND flag=1", (contract_no,), conn)
    if not contract:
        raise BusinessError("合同不存在")
    return contract


def _validate_stages_for_submit(conn, contract_id):
    stages = db.query(
        "SELECT * FROM contract_stage WHERE contract_id=? AND flag=1 ORDER BY id", (contract_id,), conn
    )
    if not stages:
        raise BusinessError("付款条款至少需要 1 条")
    ratio_sum = round(sum(float(s["ratio"]) for s in stages), 2)
    if abs(ratio_sum - 100.0) > 0.001:
        raise BusinessError("付款条款比例合计必须为 100%，当前为 {:.2f}%".format(ratio_sum))
    return stages


def _submit_in_transaction(conn, contract_no, ctx):
    contract = _load_for_write(conn, contract_no)
    if contract["status"] != DRAFT:
        raise BusinessError("只有草稿状态的合同可以提交审批")
    if not ctx["is_admin"] and contract["created_by"] != ctx["id"]:
        raise BusinessError("只能提交本人创建的合同")

    stages = _validate_stages_for_submit(conn, contract["id"])
    amount_sum = round(sum(float(s["stage_amount"]) for s in stages), 2)
    if abs(amount_sum - float(contract["total_amount"])) > 0.01:
        raise BusinessError("付款条款金额合计与合同总金额不一致")

    definition = db.query_one(
        "SELECT * FROM flow_definition WHERE code=? AND status=1", (FLOW_CODE,), conn
    )
    if not definition:
        raise BusinessError("审批流 {} 未配置，无法提交审批".format(FLOW_CODE))

    engine = FlowEngine(conn)
    instance_id = engine.start(
        definition["id"],
        contract_no,
        ["OBJ-001"],
        {
            "biz_id": contract["id"],
            "contract_no": contract_no,
            "total_amount": float(contract["total_amount"]),
        },
        ctx["id"],
    )
    db.execute(
        """
        UPDATE contract SET status='APPROVING', instance_id=?, submit_by=?, submit_by_name=?,
            submit_at=?, last_comment=NULL, updated_by=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
        """,
        (instance_id, ctx["id"], ctx["name"], _now(), ctx["id"], contract["id"]),
        conn,
    )
    return instance_id


def submit(ctx, contract_no):
    def _do(conn):
        _submit_in_transaction(conn, contract_no, ctx)
        contract = db.query_one(
            "SELECT total_amount FROM contract WHERE contract_no=?", (contract_no,), conn
        )
        return {
            "contract_no": contract_no,
            "level": 2 if float(contract["total_amount"]) >= APPROVAL_THRESHOLD else 1,
        }

    return db.transaction(_do)


def withdraw(ctx, contract_no):
    def _do(conn):
        contract = _load_for_write(conn, contract_no)
        if contract["status"] != APPROVING:
            raise BusinessError("只有审批中的合同可以撤回")
        if not ctx["is_admin"] and contract["created_by"] != ctx["id"]:
            raise BusinessError("只能撤回本人创建的合同")

        engine = FlowEngine(conn)
        if contract["instance_id"]:
            engine.terminate(contract["instance_id"], ctx, "创建人撤回")
        db.execute(
            """
            UPDATE contract SET status='DRAFT', instance_id=NULL, updated_by=?,
                updated_at=CURRENT_TIMESTAMP
            WHERE id=?
            """,
            (ctx["id"], contract["id"]),
            conn,
        )
        return contract_no

    return db.transaction(_do)


def delete(ctx, contract_no):
    def _do(conn):
        contract = _load_for_write(conn, contract_no)
        if contract["status"] != DRAFT:
            raise BusinessError("只有草稿状态的合同允许删除")
        if not ctx["is_admin"] and contract["created_by"] != ctx["id"]:
            raise BusinessError("只能删除本人创建的合同")
        invoices = db.query_one(
            "SELECT COUNT(*) AS c FROM contract_invoice WHERE contract_no=? AND flag=1", (contract_no,), conn
        )["c"]
        receipts = db.query_one(
            "SELECT COUNT(*) AS c FROM contract_receipt WHERE contract_no=? AND flag=1", (contract_no,), conn
        )["c"]
        if invoices or receipts:
            raise BusinessError("该合同已产生开票或收款记录，不允许删除")
        db.execute(
            "UPDATE contract SET flag=0, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (ctx["id"], contract["id"]),
            conn,
        )
        db.execute("UPDATE contract_stage SET flag=0 WHERE contract_id=?", (contract["id"],), conn)
        return contract_no

    return db.transaction(_do)


# ---------------------------------------------------------------- 流程回写

def sync_from_instance(conn, instance_id, action=None):
    """审批引擎执行后，把流程结果回写到合同状态（M6 stateWriteBacks）。"""
    if not instance_id:
        return None
    instance = db.query_one("SELECT * FROM flow_instance WHERE id=?", (instance_id,), conn)
    if not instance:
        return None
    contract = db.query_one("SELECT * FROM contract WHERE instance_id=?", (instance_id,), conn)
    if not contract:
        return None

    if action == "RETURN":
        new_status = DRAFT
    elif instance["status"] == "APPROVED":
        new_status = EFFECTIVE
    elif instance["status"] in ("REJECTED", "RETURNED", "CANCELED"):
        new_status = DRAFT
    else:
        new_status = APPROVING

    if new_status == EFFECTIVE and contract["status"] != EFFECTIVE:
        db.execute(
            """
            UPDATE contract SET status='EFFECTIVE', effective_time=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
            """,
            (_now(), contract["id"]),
            conn,
        )
    elif new_status == DRAFT and contract["status"] != DRAFT:
        comment = db.query_one(
            """
            SELECT comment FROM flow_history
            WHERE instance_id=? AND action IN ('REJECT','RETURN') AND comment IS NOT NULL AND comment <> ''
            ORDER BY id DESC LIMIT 1
            """,
            (instance_id,),
            conn,
        )
        db.execute(
            """
            UPDATE contract SET status='DRAFT', instance_id=NULL, last_comment=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
            """,
            ((comment or {}).get("comment") if comment else None, contract["id"]),
            conn,
        )
    return new_status


# ---------------------------------------------------------------- 金额汇总

def recalc_contract_amounts(conn, contract_no):
    """合同累计开票 / 累计收款由系统汇总维护（M1 invariants）。"""
    contract = db.query_one("SELECT id FROM contract WHERE contract_no=?", (contract_no,), conn)
    if not contract:
        return
    invoiced = db.query_one(
        "SELECT COALESCE(SUM(invoice_amount), 0) AS s FROM contract_invoice WHERE contract_no=? AND flag=1",
        (contract_no,),
        conn,
    )["s"]
    received = db.query_one(
        "SELECT COALESCE(SUM(receive_amount), 0) AS s FROM contract_receipt WHERE contract_no=? AND flag=1",
        (contract_no,),
        conn,
    )["s"]
    db.execute(
        "UPDATE contract SET invoiced_amount=?, received_amount=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (money(invoiced), money(received), contract["id"]),
        conn,
    )


def try_auto_close(conn, contract_no):
    """RULE-007 合同自动关闭规则：全部阶段已开票且全部开票已收款。"""
    contract = db.query_one("SELECT * FROM contract WHERE contract_no=? AND flag=1", (contract_no,), conn)
    if not contract or contract["status"] != EFFECTIVE:
        return False
    stages = db.query(
        "SELECT invoice_status FROM contract_stage WHERE contract_id=? AND flag=1", (contract["id"],), conn
    )
    if not stages or any(s["invoice_status"] != "已开票" for s in stages):
        return False
    invoices = db.query(
        "SELECT receive_status FROM contract_invoice WHERE contract_no=? AND flag=1", (contract_no,), conn
    )
    if not invoices or any(i["receive_status"] != "RECEIVED" for i in invoices):
        return False
    db.execute(
        """
        UPDATE contract SET status='CLOSED', close_time=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND status='EFFECTIVE'
        """,
        (_now(), contract["id"]),
        conn,
    )
    return True


# ---------------------------------------------------------------- 查询

def list_contracts(ctx, params):
    page = max(1, int(params.get("page") or 1))
    size = min(200, max(1, int(params.get("size") or 10)))
    where = ["c.flag=1"]
    values = []

    for field, column in (("contract_no", "c.contract_no"), ("contract_name", "c.contract_name")):
        value = (params.get(field) or "").strip()
        if value:
            where.append("{} LIKE ?".format(column))
            values.append("%{}%".format(value))

    customer_name = (params.get("customer_name") or "").strip()
    if customer_name:
        where.append("cu.customer_name LIKE ?")
        values.append("%{}%".format(customer_name))

    product_name = (params.get("product_name") or "").strip()
    if product_name:
        where.append("p.product_name LIKE ?")
        values.append("%{}%".format(product_name))

    for field, column in (
        ("dept_no", "c.dept_no"),
        ("status", "c.status"),
        ("contract_type", "c.contract_type"),
        ("product_no", "c.product_no"),
        ("product_type", "p.product_type"),
    ):
        value = (params.get(field) or "").strip()
        if value:
            where.append("{} = ?".format(column))
            values.append(value)

    sign_from = (params.get("sign_date_from") or "").strip()
    if sign_from:
        where.append("c.sign_date >= ?")
        values.append(sign_from)
    sign_to = (params.get("sign_date_to") or "").strip()
    if sign_to:
        where.append("c.sign_date <= ?")
        values.append(sign_to)

    scope_sql, scope_values = scope_service.contract_scope_clause(ctx, "c")
    where.append(scope_sql)
    values.extend(scope_values)

    where_sql = " AND ".join(where)
    total = db.query_one(
        """
        SELECT COUNT(*) AS c FROM contract c
        LEFT JOIN mdm_product p ON p.product_no = c.product_no
        LEFT JOIN mdm_customer cu ON cu.customer_no = c.customer_no
        WHERE {}
        """.format(where_sql),
        values,
    )["c"]

    rows = db.query(
        CONTRACT_SELECT
        + " WHERE {} ORDER BY c.sign_date DESC, c.contract_no DESC LIMIT ? OFFSET ?".format(where_sql),
        values + [size, (page - 1) * size],
    )
    types = {"CONTRACT_TYPE": _dict_label_map("CONTRACT_TYPE")}
    return {
        "list": [decorate(r, types) for r in rows],
        "total": total,
        "page": page,
        "size": size,
    }


def get_contract(ctx, contract_no, require_scope=True):
    row = db.query_one(CONTRACT_SELECT + " WHERE c.contract_no=? AND c.flag=1", (contract_no,))
    if not row:
        raise BusinessError("合同不存在")
    if require_scope and not scope_service.can_see_contract(ctx, row):
        raise BusinessError("无权查看该合同")
    contract = decorate(row)

    stages = db.query(
        "SELECT * FROM contract_stage WHERE contract_id=? AND flag=1 ORDER BY CAST(stage_no AS INTEGER), id",
        (row["id"],),
    )
    contract["stages"] = [dict(s) for s in stages]

    invoices = db.query(
        """
        SELECT i.*, COALESCE(st.stage_name, i.stage_no) AS stage_name
        FROM contract_invoice i
        LEFT JOIN contract_stage st ON st.contract_id = ? AND st.stage_no = i.stage_no AND st.flag = 1
        WHERE i.contract_no = ? AND i.flag = 1
        ORDER BY i.invoice_date DESC, i.id DESC
        """,
        (row["id"], contract_no),
    )
    contract["invoices"] = [dict(i) for i in invoices]

    receipts = db.query(
        "SELECT * FROM contract_receipt WHERE contract_no=? AND flag=1 ORDER BY receive_date DESC, id DESC",
        (contract_no,),
    )
    contract["receipts"] = [dict(r) for r in receipts]
    contract["approvals"] = approval_history(contract_no)
    return contract


def approval_history(contract_no):
    contract = db.query_one("SELECT instance_id FROM contract WHERE contract_no=?", (contract_no,))
    if not contract or not contract["instance_id"]:
        return []
    rows = db.query(
        """
        SELECT h.*, t.role_ref
        FROM flow_history h
        LEFT JOIN flow_task t ON t.instance_id = h.instance_id AND t.activity_id = h.activity_id
        WHERE h.instance_id=? AND h.action IN ('APPROVE','REJECT','RETURN','CANCELED')
        ORDER BY h.id
        """,
        (contract["instance_id"],),
    )
    role_names = {"ROLE-03": "财务经理", "ROLE-04": "总经理"}
    return [
        {
            "activity_name": r["activity_name"],
            "role_name": role_names.get(r["role_ref"], "-"),
            "operator_name": r["operator_name"],
            "action": r["action"],
            "action_label": {"APPROVE": "已通过", "REJECT": "已驳回", "RETURN": "已退回", "CANCELED": "已撤回"}.get(r["action"], r["action"]),
            "comment": r["comment"] or "",
            "created_at": r["created_at"],
        }
        for r in rows
    ]


# ---------------------------------------------------------------- 审批列表
def _task_where(ctx, status_clause):
    if ctx["is_admin"]:
        return status_clause, []
    if ctx["roles"]:
        placeholders = ",".join("?" for _ in ctx["roles"])
        return "{} AND (t.assignee_id=? OR t.role_ref IN ({}))".format(status_clause, placeholders), [ctx["id"]] + ctx["roles"]
    return "{} AND t.assignee_id=?".format(status_clause), [ctx["id"]]


def approval_tasks(ctx, mode, params):
    page = max(1, int(params.get("page") or 1))
    size = min(200, max(1, int(params.get("size") or 10)))

    base = "t.status='TODO'" if mode == "todo" else "t.status IN ('DONE','CANCEL')"
    task_sql, task_values = _task_where(ctx, base)

    where = [task_sql, "c.flag=1", "fd.code=?"]
    values = task_values + [FLOW_CODE]

    for field, column in (("contract_no", "c.contract_no"), ("contract_name", "c.contract_name")):
        value = (params.get(field) or "").strip()
        if value:
            where.append("{} LIKE ?".format(column))
            values.append("%{}%".format(value))
    submit_by = (params.get("submit_by") or "").strip()
    if submit_by:
        where.append("c.submit_by_name LIKE ?")
        values.append("%{}%".format(submit_by))
    if (params.get("submit_from") or "").strip():
        where.append("date(c.submit_at) >= ?")
        values.append(params["submit_from"].strip())
    if (params.get("submit_to") or "").strip():
        where.append("date(c.submit_at) <= ?")
        values.append(params["submit_to"].strip())

    where_sql = " AND ".join(where)
    total = db.query_one(
        """
        SELECT COUNT(*) AS c
        FROM flow_task t
        JOIN flow_instance i ON i.id = t.instance_id
        JOIN flow_definition fd ON fd.id = i.def_id
        JOIN contract c ON c.contract_no = i.business_key
        WHERE {}
        """.format(where_sql),
        values,
    )["c"]

    rows = db.query(
        """
        SELECT t.id AS task_id, t.activity_name, t.status AS task_status, t.action, t.comment,
               t.done_at, t.created_at AS task_created_at,
               c.id AS contract_id, c.contract_no, c.contract_name, c.total_amount,
               c.submit_by_name, c.submit_at, c.status AS contract_status,
               dept.dept_name
        FROM flow_task t
        JOIN flow_instance i ON i.id = t.instance_id
        JOIN flow_definition fd ON fd.id = i.def_id
        JOIN contract c ON c.contract_no = i.business_key
        LEFT JOIN mdm_department dept ON dept.dept_no = c.dept_no
        WHERE {}
        ORDER BY {}
        LIMIT ? OFFSET ?
        """.format(where_sql, "t.created_at DESC" if mode == "todo" else "t.done_at DESC"),
        values + [size, (page - 1) * size],
    )
    for row in rows:
        row["contract_status_label"] = STATUS_LABELS.get(row["contract_status"], row["contract_status"])
        row["action_label"] = {"APPROVE": "已通过", "REJECT": "已驳回", "RETURN": "已退回"}.get(row["action"], "待审批")
    return {"list": rows, "total": total, "page": page, "size": size}
