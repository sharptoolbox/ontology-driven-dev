"""AI 工具（Function Calling）注册与执行：只读查询 + 页面导航。"""
import json

from services import contract_service, invoice_service, master_data_service, receipt_service

PAGE_MAP = {
    "合同维护": "/contract/maintain", "合同查询": "/contract/query",
    "开票录入": "/invoice/maintain", "开票查询": "/invoice/query",
    "收款录入": "/receipt/maintain", "收款查询": "/receipt/query",
    "我的待办": "/workbench/todo", "我的已办": "/workbench/done", "我的申请": "/workbench/requested",
    "合同执行情况分析": "/report/execution", "部门合同统计分析": "/report/dept", "已开票未收款分析": "/report/unreceived",
    "产品维护": "/masterdata/product", "客户维护": "/masterdata/customer",
    "部门维护": "/masterdata/department", "人员维护": "/masterdata/employee",
    "流程定义": "/flow/definitions", "流程实例": "/flow/instances", "任务管理": "/flow/tasks",
}


def _table(columns, rows):
    return {"type": "table", "columns": columns, "rows": rows}


def _truncate(rows, n=20):
    return rows[:n]


def _contracts(args):
    res = contract_service.list_contracts(1, 20, {
        "contract_no": args.get("contract_no"),
        "contract_name": args.get("contract_name"),
        "status": args.get("status"),
    })
    rows = [{"合同编号": r["contract_no"], "合同名称": r["contract_name"], "客户": r.get("customer_name") or "-",
             "总金额": r["total_amount"], "状态": r["status"]} for r in res["list"]]
    return {"text": f"共 {res['total']} 条合同，返回前 {len(rows)} 条", "data": rows,
            "render": _table(["合同编号", "合同名称", "客户", "总金额", "状态"], rows)}


def _contract_detail(args):
    c = contract_service.get_contract(args.get("contract_id"))
    if not c:
        return {"text": "未找到该合同", "data": []}
    info = {"合同编号": c["contract_no"], "合同名称": c["contract_name"], "客户": c.get("customer_name"),
            "部门": c.get("department_name"), "责任人": c.get("owner_name"), "合同总金额": c["total_amount"],
            "状态": c["status"]}
    stages = [{"阶段": s["stage_id"], "阶段名称": s["stage_name"], "比例": s["pay_ratio"],
               "应付金额": s["stage_amount"], "开票状态": s["invoice_status"]} for s in c.get("stages", [])]
    return {"text": json.dumps(info, ensure_ascii=False), "data": info,
            "render": _table(["阶段", "阶段名称", "比例", "应付金额", "开票状态"], stages)}


def _invoices(args):
    res = invoice_service.list_invoices(1, 20, {"invoice_no": args.get("invoice_no"), "approval_status": args.get("approval_status")})
    rows = [{"开票编号": r["invoice_no"], "合同": r.get("contract_no") or "-", "开票金额": r["invoice_amount"],
             "已收款": r["received_amount"], "状态": r["approval_status"]} for r in res["list"]]
    return {"text": f"共 {res['total']} 张开票，返回前 {len(rows)} 条", "data": rows,
            "render": _table(["开票编号", "合同", "开票金额", "已收款", "状态"], rows)}


def _receipts(args):
    res = receipt_service.list_receipts(1, 20, {"receipt_no": args.get("receipt_no")})
    rows = [{"收款编号": r["receipt_no"], "合同": r.get("contract_no") or "-", "开票": r.get("invoice_no") or "-",
             "金额": r["receipt_amount"], "状态": r["status"]} for r in res["list"]]
    return {"text": f"共 {res['total']} 笔收款", "data": rows,
            "render": _table(["收款编号", "合同", "开票", "金额", "状态"], rows)}


def _customers(args):
    res = master_data_service.list_items("customer", 1, 20, args.get("keyword") or "")
    rows = [{"客户编号": r["customer_no"], "客户名称": r["customer_name"], "客户类型": r["customer_type"]} for r in res["list"]]
    return {"text": f"共 {res['total']} 个客户", "data": rows,
            "render": _table(["客户编号", "客户名称", "客户类型"], rows)}


def _products(args):
    res = master_data_service.list_items("product", 1, 20, args.get("keyword") or "")
    rows = [{"产品编号": r["product_no"], "产品名称": r["product_name"], "产品类型": r["product_type"]} for r in res["list"]]
    return {"text": f"共 {res['total']} 个产品", "data": rows,
            "render": _table(["产品编号", "产品名称", "产品类型"], rows)}


def _departments(args):
    res = master_data_service.list_items("department", 1, 50)
    rows = [{"部门编号": r["department_no"], "部门名称": r["department_name"]} for r in res["list"]]
    return {"text": f"共 {res['total']} 个部门", "data": rows,
            "render": _table(["部门编号", "部门名称"], rows)}


def _employees(args):
    res = master_data_service.list_items("employee", 1, 50, args.get("keyword") or "")
    rows = [{"人员编号": r["employee_no"], "人员名称": r["employee_name"], "部门": r.get("department_name") or "-"} for r in res["list"]]
    return {"text": f"共 {res['total']} 名人员", "data": rows,
            "render": _table(["人员编号", "人员名称", "部门"], rows)}


def _readonly_sql(args):
    from sql_readonly.query import query_readonly
    sql = (args.get("sql") or "").strip()
    chart_type = (args.get("chart_type") or "none").lower()
    if not sql:
        return {"text": "SQL 为空", "data": []}
    try:
        rows = query_readonly(sql)
    except ValueError as e:
        return {"text": str(e), "data": []}
    columns = list(rows[0].keys()) if rows else []
    text = f"查询返回 {len(rows)} 行"
    if chart_type in ("bar", "line", "pie") and rows and len(columns) >= 2:
        if chart_type == "pie":
            data = [{"name": str(r[columns[0]]), "value": r[columns[1]]} for r in rows]
        else:
            num_cols = [c for c in columns[1:] if isinstance(rows[0].get(c), (int, float))]
            data = [{"name": str(r[columns[0]]), **{c: r[c] for c in num_cols}} for r in rows]
        render = {"type": "chart", "chart_type": chart_type, "data": data}
    else:
        render = {"type": "table", "columns": columns, "rows": rows}
    return {"text": text, "data": rows, "render": render}


def _navigate(args):
    page = args.get("page_name", "")
    path = None
    for k, v in PAGE_MAP.items():
        if page in k or k in page:
            path = v
            break
    if not path:
        return {"text": "未找到对应页面，请说明需要的功能", "data": []}
    return {"text": f"已定位到「{page}」功能", "data": [], "render": {"type": "action", "label": f"打开 {page}", "path": path}}


TOOLS = [
    {"type": "function", "function": {"name": "query_contracts", "description": "查询合同列表",
        "parameters": {"type": "object", "properties": {
            "contract_name": {"type": "string", "description": "合同名称关键词"},
            "contract_no": {"type": "string", "description": "合同编号关键词"},
            "status": {"type": "string", "description": "合同状态"},
        }}}},
    {"type": "function", "function": {"name": "get_contract_detail", "description": "查询单个合同详情（含付款阶段）",
        "parameters": {"type": "object", "properties": {
            "contract_id": {"type": "integer", "description": "合同ID"},
        }, "required": ["contract_id"]}}},
    {"type": "function", "function": {"name": "query_invoices", "description": "查询开票列表",
        "parameters": {"type": "object", "properties": {
            "invoice_no": {"type": "string", "description": "开票编号关键词"},
            "approval_status": {"type": "string", "description": "开票状态"},
        }}}},
    {"type": "function", "function": {"name": "query_receipts", "description": "查询收款列表",
        "parameters": {"type": "object", "properties": {
            "receipt_no": {"type": "string", "description": "收款编号关键词"},
        }}}},
    {"type": "function", "function": {"name": "query_customers", "description": "查询客户列表",
        "parameters": {"type": "object", "properties": {"keyword": {"type": "string", "description": "关键词"}}}}},
    {"type": "function", "function": {"name": "query_products", "description": "查询产品列表",
        "parameters": {"type": "object", "properties": {"keyword": {"type": "string", "description": "关键词"}}}}},
    {"type": "function", "function": {"name": "query_departments", "description": "查询部门列表",
        "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "query_employees", "description": "查询人员列表",
        "parameters": {"type": "object", "properties": {"keyword": {"type": "string", "description": "关键词"}}}}},
    {"type": "function", "function": {"name": "readonly_sql_query",
        "description": "按自然语言生成只读 SQL 动态查询（统计/聚合/自定义列）。SQL 使用下划线表名字段名，列别名用中文。用户要求图表时设置 chart_type 为 bar/line/pie。",
        "parameters": {"type": "object", "properties": {
            "sql": {"type": "string", "description": "只读 SELECT SQL 语句"},
            "chart_type": {"type": "string", "enum": ["none", "bar", "line", "pie"], "description": "渲染类型，用户要求图表时设置，否则 none"},
        }, "required": ["sql"]}}},
    {"type": "function", "function": {"name": "navigate_to_page", "description": "导航到某个功能页面",
        "parameters": {"type": "object", "properties": {
            "page_name": {"type": "string", "description": "页面名称，如 合同维护、合同查询、我的待办"},
        }, "required": ["page_name"]}}},
]

_EXECUTORS = {
    "query_contracts": _contracts,
    "get_contract_detail": _contract_detail,
    "query_invoices": _invoices,
    "query_receipts": _receipts,
    "query_customers": _customers,
    "query_products": _products,
    "query_departments": _departments,
    "query_employees": _employees,
    "readonly_sql_query": _readonly_sql,
    "navigate_to_page": _navigate,
}


def execute_tool(name, args):
    fn = _EXECUTORS.get(name)
    if not fn:
        return {"text": f"未知工具 {name}", "data": []}
    try:
        return fn(args or {})
    except Exception as e:
        return {"text": f"工具执行出错：{e}", "data": []}
