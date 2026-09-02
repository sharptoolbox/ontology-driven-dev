import re

import db


def prefix_of(alias: str) -> str:
    """对象英文别名大写取前 3 位作为编号前缀。"""
    return re.sub(r"[^A-Za-z]", "", alias).upper()[:3]


def generate_code(alias: str, table: str, column: str, conn=None) -> str:
    """生成业务编号：三位英文前缀 + 四位流水号，如 Contract -> CON0001。

    在同一事务连接 conn 上执行，避免并发重号。
    """
    prefix = prefix_of(alias)
    row = db.query_one(
        f"SELECT MAX({column}) AS mx FROM {table} WHERE {column} LIKE ?",
        (f"{prefix}%",),
        conn,
    )
    cur = 0
    if row and row["mx"]:
        m = re.match(rf"^{prefix}(\d+)$", row["mx"])
        if m:
            cur = int(m.group(1))
    return f"{prefix}{cur + 1:04d}"
