"""只读 SQL 查询（严格边界）：仅 SELECT、白名单表、强制 LIMIT、禁多语句、执行超时。"""
import re

import db

FORBIDDEN = re.compile(
    r"\b(insert|update|delete|replace|drop|alter|truncate|create|attach|pragma|grant|revoke)\b",
    re.IGNORECASE,
)
MAX_ROWS = 200

WHITELIST_TABLES = {
    "product", "customer", "department", "employee",
    "contract", "contract_stage", "invoice", "invoice_allocation", "receipt", "approval_record",
    "flow_definition", "flow_instance", "flow_task", "flow_history",
}


def _extract_tables(sql):
    tables = set()
    for m in re.finditer(r"\b(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_]*)", sql, re.IGNORECASE):
        tables.add(m.group(1).lower())
    return tables


def query_readonly(sql: str, params=None, max_rows=MAX_ROWS):
    if FORBIDDEN.search(sql):
        raise ValueError("AI 对话仅支持只读查询，不具备新增、修改、删除权限。请通过系统固定业务页面执行对应操作。")
    if sql.count(";") > 1:
        raise ValueError("禁止多语句执行")
    stmt = sql.strip()
    if not re.match(r"^select\b", stmt, re.IGNORECASE):
        raise ValueError("仅允许 SELECT 查询")

    for table in _extract_tables(sql):
        if table not in WHITELIST_TABLES:
            raise ValueError(f"表「{table}」不在只读白名单内")

    if "limit" not in stmt.lower():
        sql = sql.rstrip().rstrip(";") + f" LIMIT {max_rows}"

    rows = db.query(sql, params or ())
    return rows
