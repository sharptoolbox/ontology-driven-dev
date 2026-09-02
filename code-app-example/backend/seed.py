import json

import db
from utils.codegen import generate_code
from utils.security import hash_password


def ensure_seed(conn):
    if db.query_one("SELECT COUNT(*) AS c FROM sys_user", (), conn)["c"] > 0:
        _ensure_flow_definition(conn)
        return
    _seed_roles_permissions(conn)
    _seed_resources(conn)
    _seed_users(conn)
    _seed_master_data(conn)
    _ensure_flow_definition(conn)


def _seed_roles_permissions(conn):
    from ontology.registry import registry
    roles = registry.get("roles", {})
    perms = registry.get("permissions", {})
    role_id_map = {}
    for role_id, r in roles.items():
        rid = db.execute(
            "INSERT INTO sys_role (name, code, parent_id, description, status) VALUES (?, ?, 0, '', 1)",
            (r.get("name", role_id), role_id),
            conn,
        )[0]
        role_id_map[role_id] = rid

    perm_id_map = {}
    for pid, p in perms.items():
        target_type = p.get("targetType", "BEHAVIOR")
        name = pid
        if target_type == "BEHAVIOR":
            b = registry.get("behaviors", {}).get(p.get("targetRef"))
            if b:
                name = b.get("name", pid)
        prm_id = db.execute(
            "INSERT INTO sys_permission (code, name, target_type, target_ref, data_scope, status) VALUES (?, ?, ?, ?, ?, 1)",
            (pid, name, target_type, p.get("targetRef", ""), p.get("dataScope", "ALL")),
            conn,
        )[0]
        perm_id_map[pid] = prm_id

    for role_id, r in roles.items():
        for pid in r.get("permissions", []):
            if pid == "*" or pid not in perm_id_map:
                continue
            db.execute(
                "INSERT OR IGNORE INTO sys_role_permission (role_id, permission_id) VALUES (?, ?)",
                (role_id_map[role_id], perm_id_map[pid]),
                conn,
            )


def _seed_resources(conn):
    resources = [
        (None, "合同管理", "menu-contract", None, "DIRECTORY", None, "FileText", 10),
        ("menu-contract", "合同维护", "menu-contract-maintain", None, "MENU", "/contract/maintain", "FilePlus", 11),
        ("menu-contract", "合同查询", "menu-contract-query", None, "MENU", "/contract/query", "Search", 12),
        (None, "开票管理", "menu-invoice", None, "DIRECTORY", None, "FileSpreadsheet", 20),
        ("menu-invoice", "开票录入", "menu-invoice-maintain", None, "MENU", "/invoice/maintain", "FilePlus", 21),
        ("menu-invoice", "开票查询", "menu-invoice-query", None, "MENU", "/invoice/query", "Search", 22),
        (None, "收款管理", "menu-receipt", None, "DIRECTORY", None, "Banknote", 30),
        ("menu-receipt", "收款录入", "menu-receipt-maintain", None, "MENU", "/receipt/maintain", "FilePlus", 31),
        ("menu-receipt", "收款查询", "menu-receipt-query", None, "MENU", "/receipt/query", "Search", 32),
        (None, "审批中心", "menu-approval", None, "DIRECTORY", None, "ClipboardList", 40),
        ("menu-approval", "我的待办", "menu-approval-todo", None, "MENU", "/workbench/todo", "Inbox", 41),
        ("menu-approval", "我的已办", "menu-approval-done", None, "MENU", "/workbench/done", "CheckSquare", 42),
        ("menu-approval", "我的申请", "menu-approval-requested", None, "MENU", "/workbench/requested", "FileText", 43),
        (None, "报表中心", "menu-report", None, "DIRECTORY", None, "BarChart3", 50),
        ("menu-report", "合同执行情况分析", "menu-report-execution", None, "MENU", "/report/execution", "TrendingUp", 51),
        ("menu-report", "部门合同统计分析", "menu-report-dept", None, "MENU", "/report/dept", "PieChart", 52),
        ("menu-report", "已开票未收款分析", "menu-report-unreceived", None, "MENU", "/report/unreceived", "AlertTriangle", 53),
        (None, "基础数据", "menu-masterdata", None, "DIRECTORY", None, "Database", 60),
        ("menu-masterdata", "产品信息维护", "menu-masterdata-product", None, "MENU", "/masterdata/product", "Package", 61),
        ("menu-masterdata", "客户信息维护", "menu-masterdata-customer", None, "MENU", "/masterdata/customer", "Users", 62),
        ("menu-masterdata", "部门信息维护", "menu-masterdata-department", None, "MENU", "/masterdata/department", "Building2", 63),
        ("menu-masterdata", "人员信息维护", "menu-masterdata-employee", None, "MENU", "/masterdata/employee", "UserCog", 64),
        (None, "流程管理", "menu-flow", None, "DIRECTORY", None, "GitBranch", 70),
        ("menu-flow", "流程定义", "menu-flow-definition", "flow:manage", "MENU", "/flow/definitions", "Workflow", 71),
        ("menu-flow", "流程实例", "menu-flow-instance", "flow:manage", "MENU", "/flow/instances", "List", 72),
        ("menu-flow", "任务管理", "menu-flow-task", "flow:manage", "MENU", "/flow/tasks", "ListChecks", 73),
        (None, "系统管理", "menu-system", None, "DIRECTORY", None, "Settings", 80),
        ("menu-system", "用户管理", "menu-system-user", "system:manage", "MENU", "/system/users", "User", 81),
        ("menu-system", "角色管理", "menu-system-role", "system:manage", "MENU", "/system/roles", "Shield", 82),
        ("menu-system", "权限管理", "menu-system-permission", "system:manage", "MENU", "/system/permissions", "Key", 83),
        ("menu-system", "资源管理", "menu-system-resource", "system:manage", "MENU", "/system/resources", "Menu", 84),
    ]
    id_map = {}
    for parent_code, name, code, pc, rtype, path, icon, sort in resources:
        parent_id = id_map.get(parent_code, 0) if parent_code else 0
        rid = db.execute(
            "INSERT INTO sys_resource (parent_id, name, code, permission_code, type, path, component, icon, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
            (parent_id, name, code, pc, rtype, path, None, icon, sort),
            conn,
        )[0]
        id_map[code] = rid


def _seed_users(conn):
    users = [
        ("admin", "admin123", "系统管理员", "ROLE-ADMIN"),
        ("sales", "123456", "销售员", "ROLE-SALES"),
        ("finance", "123456", "财务员", "ROLE-FINANCE"),
        ("finmgr", "123456", "财务经理", "ROLE-FINANCE-MANAGER"),
        ("gm", "123456", "总经理", "ROLE-GENERAL-MANAGER"),
        ("emp", "123456", "普通员工", "ROLE-EMPLOYEE"),
    ]
    for username, pwd, real_name, role_code in users:
        uid = db.execute(
            "INSERT INTO sys_user (username, password, real_name, actor_type, status) VALUES (?, ?, ?, 'HUMAN', 1)",
            (username, hash_password(pwd), real_name),
            conn,
        )[0]
        role = db.query_one("SELECT id FROM sys_role WHERE code = ?", (role_code,), conn)
        if role:
            db.execute("INSERT INTO sys_user_role (user_id, role_id) VALUES (?, ?)", (uid, role["id"]), conn)


def _seed_master_data(conn):
    depts = ["销售部", "财务部", "管理部"]
    dept_ids = []
    for name in depts:
        did = db.execute(
            "INSERT INTO department (department_no, department_name, status, created_by, updated_by) VALUES (?, ?, '在用', 1, 1)",
            (generate_code("Department", "department", "department_no", conn), name),
            conn,
        )[0]
        dept_ids.append(did)

    employees = [("张三", 0), ("李四", 1), ("王五", 2)]
    emp_ids = []
    for name, di in employees:
        eid = db.execute(
            "INSERT INTO employee (employee_no, employee_name, department_id, status, created_by, updated_by) VALUES (?, ?, ?, '在用', 1, 1)",
            (generate_code("Employee", "employee", "employee_no", conn), name, dept_ids[di]),
            conn,
        )[0]
        emp_ids.append(eid)

    products = [("软件产品A", "SOFTWARE"), ("硬件产品B", "HARDWARE"), ("服务产品C", "SERVICE")]
    prod_ids = []
    for name, ptype in products:
        pid = db.execute(
            "INSERT INTO product (product_no, product_type, product_name, status, created_by, updated_by) VALUES (?, ?, ?, '在用', 1, 1)",
            (generate_code("Product", "product", "product_no", conn), ptype, name),
            conn,
        )[0]
        prod_ids.append(pid)

    customers = [("甲公司", "ENTERPRISE"), ("乙公司", "GOVERNMENT")]
    cust_ids = []
    for name, ctype in customers:
        cid = db.execute(
            "INSERT INTO customer (customer_no, customer_type, customer_name, status, created_by, updated_by) VALUES (?, ?, ?, '在用', 1, 1)",
            (generate_code("Customer", "customer", "customer_no", conn), ctype, name),
            conn,
        )[0]
        cust_ids.append(cid)


def _ensure_flow_definition(conn):
    from ontology.registry import registry
    flows = registry.get("flows", {})
    for code, flow in flows.items():
        if db.query_one("SELECT id FROM flow_definition WHERE code = ?", (code,), conn):
            continue
        trigger = flow.get("trigger", {})
        db.execute(
            """
            INSERT INTO flow_definition (code, name, flow_type, trigger_type, trigger_behavior, description, node_graph, version, status, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 1)
            """,
            (
                code, flow.get("name", code), flow.get("flowType", "APPROVAL"),
                trigger.get("triggerType", "MANUAL"), trigger.get("behaviorRef"),
                flow.get("description"), json.dumps(flow.get("nodeGraph", {}), ensure_ascii=False),
            ),
            conn,
        )
