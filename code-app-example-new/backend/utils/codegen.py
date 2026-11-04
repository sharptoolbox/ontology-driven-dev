"""业务编号生成。

M1 refRules 对三类单据分别规定了编号格式：
- 合同 HT + YYYYMM + 4 位流水
- 开票 FP + YYYYMM + 4 位流水
- 收款 SK + YYYYMM + 4 位流水

流水按“前缀 + 年月”分段，当月顺序号用尽后不复用已使用的编号。
生成过程在调用方事务内执行，避免并发重号。
"""

import datetime
import re

import db


def _next_serial(prefix, column, table, conn):
    today = datetime.date.today()
    month = today.strftime("%Y%m")
    like = "{}{}%".format(prefix, month)
    row = db.query_one(
        "SELECT MAX({col}) AS mx FROM {tbl} WHERE {col} LIKE ?".format(col=column, tbl=table),
        (like,),
        conn,
    )
    current = 0
    if row and row["mx"]:
        match = re.match(r"^{0}{1}(\d+)$".format(prefix, month), row["mx"])
        if match:
            current = int(match.group(1))
    return "{}{}{:04d}".format(prefix, month, current + 1)


def next_contract_no(conn=None):
    return _next_serial("HT", "contract_no", "contract", conn)


def next_invoice_no(conn=None):
    return _next_serial("FP", "invoice_no", "contract_invoice", conn)


def next_receive_no(conn=None):
    return _next_serial("SK", "receive_no", "contract_receipt", conn)


def month_suffix(day=None):
    return (day or datetime.date.today()).strftime("%Y%m")
