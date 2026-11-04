import json

import db
from utils.security import hash_password


# These are protected platform resources. Business extensions may add resources,
# but must never replace or remove the approval, workflow, and system baseline.
BASE_FOUNDATION_RESOURCES = [
    # (parent_code, name, code, permission_code, type, path, icon, sort)
    (None, "审批中心", "menu-workbench", None, "DIRECTORY", None, "ClipboardList", 20),
    ("menu-workbench", "待我审批", "menu-workbench-todo", None, "MENU", "/workbench/todo", "Inbox", 21),
    ("menu-workbench", "我已审批", "menu-workbench-done", None, "MENU", "/workbench/done", "CheckSquare", 22),
    (None, "流程管理", "menu-flow", None, "DIRECTORY", None, "GitBranch", 30),
    ("menu-flow", "流程定义", "menu-flow-definition", "flow:manage", "MENU", "/flow/definitions", "Workflow", 31),
    ("menu-flow", "流程实例", "menu-flow-instance", "flow:manage", "MENU", "/flow/instances", "List", 32),
    ("menu-flow", "任务管理", "menu-flow-task", "flow:manage", "MENU", "/flow/tasks", "ListChecks", 33),
    (None, "系统管理", "menu-system", None, "DIRECTORY", None, "Settings", 40),
    ("menu-system", "用户管理", "menu-system-user", "system:manage", "MENU", "/system/users", "User", 41),
    ("menu-system", "角色管理", "menu-system-role", "system:manage", "MENU", "/system/roles", "Shield", 42),
    ("menu-system", "权限管理", "menu-system-permission", "system:manage", "MENU", "/system/permissions", "Key", 43),
    ("menu-system", "资源管理", "menu-system-resource", "system:manage", "MENU", "/system/resources", "Menu", 44),
]


def ensure_seed(conn):
    if db.query_one("SELECT COUNT(*) AS c FROM sys_user", (), conn)["c"] > 0:
        _ensure_base_resources(conn)
        _sync_ontology_system_management(conn)
        # A malformed MU must not be able to overwrite a reserved foundation code.
        _ensure_base_resources(conn)
        _ensure_flow_definition(conn)
        _ensure_business_seed(conn)
        return
    _seed_roles(conn)
    _seed_permissions(conn)
    _seed_resources(conn)
    _seed_users(conn)
    _seed_role_permissions(conn)
    _sync_ontology_system_management(conn)
    _ensure_base_resources(conn)
    _ensure_flow_definition(conn)
    _ensure_business_seed(conn)


def _seed_roles(conn):
    roles = [
        ("admin", "系统管理员", "系统内置超级管理员"),
    ]
    for code, name, desc in roles:
        db.execute(
            "INSERT INTO sys_role (name, code, parent_id, description, status) VALUES (?, ?, 0, ?, 1)",
            (name, code, desc),
            conn,
        )


def _seed_permissions(conn):
    perms = [
        ("system:user:add", "用户新增", "BEHAVIOR", "User_Add"),
        ("system:user:edit", "用户编辑", "BEHAVIOR", "User_Edit"),
        ("system:user:delete", "用户删除", "BEHAVIOR", "User_Delete"),
        ("system:user:assign-role", "分配角色", "BEHAVIOR", "User_AssignRole"),
        ("system:user:reset-pwd", "重置密码", "BEHAVIOR", "User_ResetPassword"),
        ("system:role:add", "角色新增", "BEHAVIOR", "Role_Add"),
        ("system:role:edit", "角色编辑", "BEHAVIOR", "Role_Edit"),
        ("system:role:delete", "角色删除", "BEHAVIOR", "Role_Delete"),
        ("system:role:assign", "分配权限资源", "BEHAVIOR", "Role_Assign"),
        ("system:permission:add", "权限新增", "BEHAVIOR", "Permission_Add"),
        ("system:permission:edit", "权限编辑", "BEHAVIOR", "Permission_Edit"),
        ("system:permission:delete", "权限删除", "BEHAVIOR", "Permission_Delete"),
        ("system:resource:add", "资源新增", "BEHAVIOR", "Resource_Add"),
        ("system:resource:edit", "资源编辑", "BEHAVIOR", "Resource_Edit"),
        ("system:resource:delete", "资源删除", "BEHAVIOR", "Resource_Delete"),
        ("flow:definition:add", "流程新增", "BEHAVIOR", "Flow_Add"),
        ("flow:definition:edit", "流程编辑", "BEHAVIOR", "Flow_Edit"),
        ("flow:definition:publish", "流程发布", "BEHAVIOR", "Flow_Publish"),
        ("flow:instance:terminate", "强制终止", "BEHAVIOR", "Flow_Terminate"),
        ("flow:task:transfer", "任务转办", "BEHAVIOR", "Flow_Transfer"),
        ("flow:task:urge", "任务催办", "BEHAVIOR", "Flow_Urge"),
    ]
    for code, name, tt, ref in perms:
        db.execute(
            "INSERT INTO sys_permission (code, name, target_type, target_ref, data_scope, status) VALUES (?, ?, ?, ?, 'ALL', 1)",
            (code, name, tt, ref),
            conn,
        )


def _seed_resources(conn):
    id_map = {}
    for parent_code, name, code, pc, rtype, path, icon, sort in BASE_FOUNDATION_RESOURCES:
        parent_id = id_map.get(parent_code, 0) if parent_code else 0
        rid = db.execute(
            """
            INSERT INTO sys_resource (parent_id, name, code, permission_code, type, path, component, icon, sort_order, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (parent_id, name, code, pc, rtype, path, None, icon, sort),
            conn,
        )[0]
        id_map[code] = rid


def _ensure_base_resources(conn):
    """Restore protected resources without disturbing business-added menus."""
    for parent_code, name, code, pc, rtype, path, icon, sort in BASE_FOUNDATION_RESOURCES:
        existing = db.query_one("SELECT id FROM sys_resource WHERE code = ?", (code,), conn)
        parent = db.query_one("SELECT id FROM sys_resource WHERE code = ?", (parent_code,), conn) if parent_code else None
        parent_id = parent["id"] if parent else 0
        if existing:
            # Protected resources cannot be disabled or repurposed by a business extension.
            db.execute(
                """
                UPDATE sys_resource
                SET parent_id=?, name=?, permission_code=?, type=?, path=?, component=NULL,
                    icon=?, sort_order=?, status=1, updated_at=CURRENT_TIMESTAMP
                WHERE id=?
                """,
                (parent_id, name, pc, rtype, path, icon, sort, existing["id"]), conn,
            )
            continue
        db.execute(
            """
            INSERT INTO sys_resource (parent_id, name, code, permission_code, type, path, component, icon, sort_order, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (parent_id, name, code, pc, rtype, path, None, icon, sort),
            conn,
        )


def _seed_users(conn):
    users = [
        ("admin", "admin123", "管理员", "admin"),
    ]
    for username, pwd, real_name, role_code in users:
        uid = db.execute(
            "INSERT INTO sys_user (username, password, real_name, actor_type, status) VALUES (?, ?, ?, 'HUMAN', 1)",
            (username, hash_password(pwd), real_name),
            conn,
        )[0]
        role = db.query_one("SELECT id FROM sys_role WHERE code = ?", (role_code,), conn)
        db.execute("INSERT INTO sys_user_role (user_id, role_id) VALUES (?, ?)", (uid, role["id"]), conn)


def _seed_role_permissions(conn):
    mapping = {}
    for role_code, perm_codes in mapping.items():
        role = db.query_one("SELECT id FROM sys_role WHERE code = ?", (role_code,), conn)
        for pc in perm_codes:
            perm = db.query_one("SELECT id FROM sys_permission WHERE code = ?", (pc,), conn)
            db.execute(
                "INSERT INTO sys_role_permission (role_id, permission_id) VALUES (?, ?)",
                (role["id"], perm["id"]),
                conn,
            )


def _ensure_flow_definition(conn):
    from ontology.registry import registry
    flows = registry.get("flows", {})
    for code, flow in flows.items():
        trigger = flow.get("trigger", {})
        values = (
            flow.get("name", code), flow.get("flowType", "APPROVAL"),
            trigger.get("triggerType", "MANUAL"), trigger.get("behaviorRef"),
            flow.get("description"), json.dumps(_flow_node_graph(flow), ensure_ascii=False),
        )
        existing = db.query_one("SELECT id FROM flow_definition WHERE code = ?", (code,), conn)
        if existing:
            # Model-derived definitions are refreshed on every start so a regenerated
            # ontology is actually applied instead of leaving an obsolete flow active.
            db.execute(
                """
                UPDATE flow_definition
                SET name=?, flow_type=?, trigger_type=?, trigger_behavior=?, description=?, node_graph=?, status=1
                WHERE id=?
                """,
                (*values, existing["id"]), conn,
            )
            continue
        db.execute(
            """
            INSERT INTO flow_definition (code, name, flow_type, trigger_type, trigger_behavior, description, node_graph, version, status, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 1)
            """,
            (code, *values),
            conn,
        )


def _sync_ontology_system_management(conn):
    """Idempotently project M5 and MU into the foundation's RBAC metadata tables."""
    from ontology.registry import registry

    roles = registry.get("roles", {})
    permissions = registry.get("permissions", {})

    # Roles are first created without parents, then linked. This supports arbitrary
    # declaration order in M5 and keeps parent references in the platform table.
    for code, role in roles.items():
        _upsert_role(conn, code, role)
    for code, role in roles.items():
        parent_codes = role.get("inheritsFrom") or []
        parent = _find_role(conn, parent_codes[0]) if parent_codes else None
        db.execute(
            "UPDATE sys_role SET parent_id=?, status=1, updated_at=CURRENT_TIMESTAMP WHERE code=?",
            (parent["id"] if parent else 0, code), conn,
        )

    for code, permission in permissions.items():
        _upsert_permission(conn, code, permission)
    model_role_rows = [_find_role(conn, code) for code in roles]
    model_role_ids = [row["id"] for row in model_role_rows if row]
    if model_role_ids:
        placeholders = ",".join("?" for _ in model_role_ids)
        db.execute(
            f"DELETE FROM sys_role_permission WHERE role_id IN ({placeholders})",
            tuple(model_role_ids), conn,
        )
    for code, role in roles.items():
        role_row = _find_role(conn, code)
        for permission_code in role.get("permissions") or []:
            permission = db.query_one("SELECT id FROM sys_permission WHERE code=?", (permission_code,), conn)
            if role_row and permission:
                db.execute(
                    "INSERT OR IGNORE INTO sys_role_permission (role_id, permission_id) VALUES (?, ?)",
                    (role_row["id"], permission["id"]), conn,
                )

    menu_permissions = _sync_ontology_menus(conn, registry.get("menus", []), registry.get("screens", {}))
    _sync_role_resources(conn, roles, menu_permissions)


def _flow_node_graph(flow):
    """Use supplied nodeGraph, or deterministically translate V9 M6 activities."""
    if flow.get("nodeGraph"):
        return flow["nodeGraph"]
    nodes = []
    edges = []
    type_map = {
        "START": "start", "END": "end", "USER_TASK": "user_task",
        "APPROVAL_TASK": "approval_task", "SYSTEM_TASK": "system_task",
        "BEHAVIOR_CALL": "behavior_call", "SUB_FLOW_CALL": "sub_flow_call", "GATEWAY": "gateway",
    }
    end_ids = set(flow.get("endActivities") or [])
    for activity in flow.get("activities") or []:
        activity_id = activity.get("activityId")
        if not activity_id:
            continue
        node = {
            "id": activity_id,
            "type": type_map.get(activity.get("activityType"), "system_task"),
            "name": activity.get("name", activity_id),
        }
        for source, target in (("roleRef", "role_ref"), ("behaviorRef", "behavior_ref"), ("approvalOutcomes", "outcomes")):
            if activity.get(source) is not None:
                node[target] = activity[source]
        if node["type"] == "gateway":
            node["branches"] = [
                {
                    "name": branch.get("branchName", "分支"),
                    "target": branch.get("targetActivity"),
                    "rule_ref": branch.get("ruleRef"),
                    "condition": branch.get("condition"),
                    "approval_outcome": branch.get("approvalOutcome"),
                    "is_default": bool(branch.get("isDefault")),
                }
                for branch in activity.get("branches") or []
                if branch.get("targetActivity")
            ]
        if node["type"] == "end":
            node["result"] = _end_result(flow, activity_id, activity)
        nodes.append(node)
        for target in activity.get("nextActivities") or []:
            edges.append({"source": activity_id, "target": target})
        for branch in activity.get("branches") or []:
            target = branch.get("targetActivity")
            if target:
                edge = {"source": activity_id, "target": target}
                if branch.get("approvalOutcome"):
                    edge["approval_outcome"] = branch["approvalOutcome"]
                edges.append(edge)
    return {"nodes": nodes, "edges": edges}


def _end_result(flow, activity_id, activity):
    """Keep the M6 terminal outcome when a generated graph reaches an END node."""
    explicit = activity.get("result")
    if explicit in ("APPROVED", "REJECTED", "RETURNED"):
        return explicit
    incoming_outcomes = [
        branch.get("approvalOutcome")
        for source in flow.get("activities") or []
        for branch in source.get("branches") or []
        if branch.get("targetActivity") == activity_id
    ]
    if "RETURN" in incoming_outcomes:
        return "RETURNED"
    if "REJECT" in incoming_outcomes:
        return "REJECTED"
    return "APPROVED"


def _upsert_role(conn, code, role):
    existing = _find_role(conn, code)
    name = _role_name_for_storage(conn, code, role.get("name", code))
    values = (name, role.get("description"), code)
    if existing:
        db.execute(
            "UPDATE sys_role SET name=?, description=?, status=1, updated_at=CURRENT_TIMESTAMP WHERE code=?",
            values, conn,
        )
    else:
        db.execute(
            "INSERT INTO sys_role (name, code, parent_id, description, status) VALUES (?, ?, 0, ?, 1)",
            (name, code, role.get("description")), conn,
        )


def _role_name_for_storage(conn, code, requested_name):
    """sys_role.name is unique while M5 roleId is the semantic identity."""
    conflict = db.query_one("SELECT code FROM sys_role WHERE name=?", (requested_name,), conn)
    if not conflict or conflict["code"] == code:
        return requested_name
    suffix = " ({})".format(code)
    return "{}{}".format(requested_name[:50 - len(suffix)], suffix)


def _find_role(conn, code):
    return db.query_one("SELECT id FROM sys_role WHERE code=?", (code,), conn)


def _upsert_permission(conn, code, permission):
    from ontology.registry import registry
    behavior = registry.get("behaviors", {}).get(permission.get("targetRef"), {})
    values = (
        permission.get("name") or behavior.get("name") or code,
        permission.get("targetType", "BEHAVIOR"),
        permission.get("targetRef", code),
        permission.get("dataScope", "ALL"),
        permission.get("abacCondition"),
    )
    existing = db.query_one("SELECT id FROM sys_permission WHERE code=?", (code,), conn)
    if existing:
        db.execute(
            """
            UPDATE sys_permission
            SET name=?, target_type=?, target_ref=?, data_scope=?, abac_condition=?, status=1
            WHERE code=?
            """,
            (*values, code), conn,
        )
    else:
        db.execute(
            """
            INSERT INTO sys_permission (code, name, target_type, target_ref, data_scope, abac_condition, status)
            VALUES (?, ?, ?, ?, ?, ?, 1)
            """,
            (code, *values), conn,
        )


def _sync_ontology_menus(conn, menus, screens):
    """Persist MU menus; paths are deterministic routes that code-app must register."""
    menu_permissions = {}
    for group_index, menu in enumerate(menus or []):
        parent_code = menu.get("menuId")
        if not parent_code:
            continue
        parent_id = _upsert_resource(conn, 0, menu, "DIRECTORY", None, None, group_index * 100 + 50)
        for child_index, child in enumerate(menu.get("children") or []):
            code = child.get("menuId")
            if not code:
                continue
            screen = screens.get(child.get("screenRef"), {})
            permission_codes = _screen_permission_codes(screen)
            permission_code = permission_codes[0] if permission_codes else None
            path = child.get("path") or "/app/{}".format(child.get("screenRef", code))
            child_id = _upsert_resource(
                conn, parent_id, child, "MENU", path, permission_code, group_index * 100 + child_index + 51,
            )
            menu_permissions[child_id] = permission_codes
    return menu_permissions


def _upsert_resource(conn, parent_id, menu, resource_type, path, permission_code, sort_order):
    code = menu["menuId"]
    existing = db.query_one("SELECT id FROM sys_resource WHERE code=?", (code,), conn)
    values = (parent_id, menu.get("name", code), permission_code, resource_type, path, menu.get("icon"), sort_order)
    if existing:
        db.execute(
            """
            UPDATE sys_resource
            SET parent_id=?, name=?, permission_code=?, type=?, path=?, icon=?, sort_order=?, status=1,
                updated_at=CURRENT_TIMESTAMP
            WHERE id=?
            """,
            (*values, existing["id"]), conn,
        )
        return existing["id"]
    return db.execute(
        """
        INSERT INTO sys_resource (parent_id, name, code, permission_code, type, path, component, icon, sort_order, status)
        VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 1)
        """,
        (parent_id, menu.get("name", code), code, permission_code, resource_type, path, menu.get("icon"), sort_order), conn,
    )[0]


def _screen_permission_codes(screen):
    """Choose the screen-entry permissions, preserving V9 PermissionRef[] alternatives."""
    from ontology.registry import registry
    actions = screen.get("actions") or []
    query_actions = [
        action for action in actions
        if registry.get("behaviors", {}).get(action.get("behaviorRef"), {}).get("behaviorType") == "QUERY"
    ]
    for action in query_actions + actions:
        codes = _permission_codes(action.get("permissionRef"))
        if codes:
            return codes
    return []


def _permission_codes(value):
    if isinstance(value, str):
        return [value] if value else []
    if isinstance(value, dict):
        for key in ("permissionId", "permissionRef", "id"):
            if value.get(key):
                return _permission_codes(value[key])
        return []
    if isinstance(value, list):
        return list(dict.fromkeys(code for item in value for code in _permission_codes(item)))
    return []


def _sync_role_resources(conn, roles, menu_permissions):
    # These resources are owned by the current MU projection. Rebuild only their
    # mappings so a regenerated M5 cannot retain permissions from an older model.
    resource_ids = list(menu_permissions)
    if resource_ids:
        placeholders = ",".join("?" for _ in resource_ids)
        db.execute(
            f"DELETE FROM sys_role_resource WHERE resource_id IN ({placeholders})",
            tuple(resource_ids), conn,
        )
    for role_code, role in roles.items():
        role_row = _find_role(conn, role_code)
        if not role_row:
            continue
        granted = set(role.get("permissions") or [])
        for resource_id, permission_codes in menu_permissions.items():
            if not permission_codes or granted.intersection(permission_codes):
                db.execute(
                    "INSERT OR IGNORE INTO sys_role_resource (role_id, resource_id) VALUES (?, ?)",
                    (role_row["id"], resource_id), conn,
                )


# ============ 业务种子（合同管理新模板） ============
#
# 菜单来自《软件需求说明书》§7.1 菜单映射表，并按界面原型的导航分组呈现；
# 菜单可见性统一由 M5 权限码派生（sys_role_resource），不写死角色，
# 也不替换、不删除审批中心 / 流程管理 / 系统管理三个底座一级菜单。

BUSINESS_RESOURCES = [
    # (parent_code, name, code, permission_code, type, path, icon, sort)
    (None, "合同管理", "menu-contract", None, "DIRECTORY", None, "FileText", 1),
    ("menu-contract", "合同台账", "menu-contract-ledger", "PERM-007", "MENU", "/contract/ledger", "FileText", 2),
    ("menu-contract", "合同审批", "menu-contract-approval", "PERM-006", "MENU", "/contract/approval", "ClipboardCheck", 3),
    (None, "开票与收款", "menu-billing", None, "DIRECTORY", None, "Receipt", 4),
    ("menu-billing", "合同开票", "menu-contract-invoice", "PERM-010", "MENU", "/contract/invoice", "FileSpreadsheet", 5),
    ("menu-billing", "合同收款", "menu-contract-receipt", "PERM-012", "MENU", "/contract/receipt", "Wallet", 6),
    (None, "报表中心", "menu-report", None, "DIRECTORY", None, "BarChart3", 7),
    ("menu-report", "部门合同统计", "menu-report-dept", "PERM-013", "MENU", "/report/department", "BarChart3", 8),
    (None, "基础数据", "menu-masterdata", None, "DIRECTORY", None, "Database", 9),
    ("menu-masterdata", "基础数据维护", "menu-masterdata-maintain", "PERM-015", "MENU", "/masterdata", "Database", 10),
]

DEMO_DEPARTMENTS = [
    ("D001", "销售一部"),
    ("D002", "销售二部"),
    ("D003", "解决方案部"),
    ("D004", "交付服务部"),
    ("D005", "财务部"),
    ("D006", "总经办"),
]

DEMO_PRODUCTS = [
    ("P1001", "SOFTWARE", "智慧园区平台 V3.0"),
    ("P1002", "HARDWARE", "智能安防一体机 X8"),
    ("P1003", "SERVICE", "运维托管服务包"),
    ("P1004", "SOFTWARE", "企业数据中台 V2.1"),
]

DEMO_CUSTOMERS = [
    ("C2001", "ENTERPRISE", "上海城建集团"),
    ("C2002", "GOVERNMENT", "杭州市政务服务中心"),
    ("C2003", "ENTERPRISE", "南方能源股份"),
    ("C2004", "CHANNEL", "恒信科技分销"),
]

DEMO_PERSONS = [
    ("E3001", "张伟", "D001"),
    ("E3002", "李娜", "D002"),
    ("E3003", "王强", "D003"),
    ("E3004", "赵敏", "D004"),
    ("E3005", "王芳", "D005"),
    ("E3006", "李强", "D005"),
]

DEMO_DICTS = {
    "CONTRACT_TYPE": [
        ("PRODUCT_CONTRACT", "产品合同", 1),
        ("SERVICE_CONTRACT", "服务合同", 2),
        ("INTEGRATION_CONTRACT", "集成合同", 3),
    ],
    "PRODUCT_TYPE": [
        ("HARDWARE", "硬件", 1),
        ("SOFTWARE", "软件", 2),
        ("SERVICE", "服务", 3),
        ("OTHER", "其他", 4),
    ],
    "CUSTOMER_TYPE": [
        ("ENTERPRISE", "企业客户", 1),
        ("GOVERNMENT", "政府客户", 2),
        ("CHANNEL", "渠道客户", 3),
        ("OTHER", "其他", 4),
    ],
    "RECEIVE_METHOD": [
        ("BANK_TRANSFER", "银行转账", 1),
        ("BANK_ACCEPTANCE", "银行承兑", 2),
        ("CASH", "现金", 3),
        ("OTHER", "其他", 4),
    ],
}

DEMO_USERS = [
    # username, password, real_name, role_code, dept_no
    ("sales01", "123456", "张伟", "ROLE-01", "D001"),
    ("finance01", "123456", "王芳", "ROLE-02", "D005"),
    ("fm01", "123456", "李强", "ROLE-03", "D005"),
    ("gm01", "123456", "陈总", "ROLE-04", "D006"),
    ("staff01", "123456", "赵敏", "ROLE-05", "D001"),
]


def _ensure_business_seed(conn):
    _ensure_departments(conn)
    _ensure_products(conn)
    _ensure_customers(conn)
    _ensure_persons(conn)
    _ensure_dicts(conn)
    menu_permissions = _ensure_business_resources(conn)
    _ensure_business_users(conn)
    _grant_business_resources(conn, menu_permissions)


def _ensure_departments(conn):
    for dept_no, dept_name in DEMO_DEPARTMENTS:
        if db.query_one("SELECT id FROM mdm_department WHERE dept_no=?", (dept_no,), conn):
            continue
        db.execute(
            "INSERT INTO mdm_department (dept_no, dept_name, created_by, updated_by) VALUES (?, ?, 1, 1)",
            (dept_no, dept_name), conn,
        )


def _ensure_products(conn):
    for product_no, product_type, product_name in DEMO_PRODUCTS:
        if db.query_one("SELECT id FROM mdm_product WHERE product_no=?", (product_no,), conn):
            continue
        db.execute(
            "INSERT INTO mdm_product (product_no, product_type, product_name, created_by, updated_by) "
            "VALUES (?, ?, ?, 1, 1)",
            (product_no, product_type, product_name), conn,
        )


def _ensure_customers(conn):
    for customer_no, customer_type, customer_name in DEMO_CUSTOMERS:
        if db.query_one("SELECT id FROM mdm_customer WHERE customer_no=?", (customer_no,), conn):
            continue
        db.execute(
            "INSERT INTO mdm_customer (customer_no, customer_type, customer_name, created_by, updated_by) "
            "VALUES (?, ?, ?, 1, 1)",
            (customer_no, customer_type, customer_name), conn,
        )


def _ensure_persons(conn):
    for person_no, person_name, dept_no in DEMO_PERSONS:
        if db.query_one("SELECT id FROM mdm_person WHERE person_no=?", (person_no,), conn):
            continue
        db.execute(
            "INSERT INTO mdm_person (person_no, person_name, dept_no, created_by, updated_by) "
            "VALUES (?, ?, ?, 1, 1)",
            (person_no, person_name, dept_no), conn,
        )


def _ensure_dicts(conn):
    for dict_type, items in DEMO_DICTS.items():
        for dict_code, dict_name, sort_no in items:
            existing = db.query_one(
                "SELECT id FROM dict_item WHERE dict_type=? AND dict_code=?", (dict_type, dict_code), conn
            )
            if existing:
                continue
            db.execute(
                "INSERT INTO dict_item (dict_type, dict_code, dict_name, sort_no, enabled, created_by, updated_by) "
                "VALUES (?, ?, ?, ?, '是', 1, 1)",
                (dict_type, dict_code, dict_name, sort_no), conn,
            )


def _ensure_business_resources(conn):
    """幂等写入业务菜单，返回 {resource_id: permission_code}。"""
    menu_permissions = {}
    for parent_code, name, code, permission_code, rtype, path, icon, sort in BUSINESS_RESOURCES:
        parent = db.query_one("SELECT id FROM sys_resource WHERE code=?", (parent_code,), conn) if parent_code else None
        parent_id = parent["id"] if parent else 0
        existing = db.query_one("SELECT id FROM sys_resource WHERE code=?", (code,), conn)
        if existing:
            db.execute(
                """
                UPDATE sys_resource
                SET parent_id=?, name=?, permission_code=?, type=?, path=?, icon=?, sort_order=?, status=1,
                    updated_at=CURRENT_TIMESTAMP
                WHERE id=?
                """,
                (parent_id, name, permission_code, rtype, path, icon, sort, existing["id"]), conn,
            )
            resource_id = existing["id"]
        else:
            resource_id = db.execute(
                """
                INSERT INTO sys_resource (parent_id, name, code, permission_code, type, path, component, icon, sort_order, status)
                VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 1)
                """,
                (parent_id, name, code, permission_code, rtype, path, icon, sort), conn,
            )[0]
        if rtype == "MENU" and permission_code:
            menu_permissions[resource_id] = permission_code
    return menu_permissions


def _ensure_business_users(conn):
    for username, password, real_name, role_code, dept_no in DEMO_USERS:
        role = db.query_one("SELECT id FROM sys_role WHERE code=?", (role_code,), conn)
        if not role:
            continue
        dept = db.query_one("SELECT id FROM mdm_department WHERE dept_no=?", (dept_no,), conn)
        user = db.query_one("SELECT id FROM sys_user WHERE username=?", (username,), conn)
        if user:
            db.execute(
                "UPDATE sys_user SET real_name=?, department_id=?, status=1 WHERE id=?",
                (real_name, dept["id"] if dept else None, user["id"]), conn,
            )
            user_id = user["id"]
        else:
            user_id = db.execute(
                "INSERT INTO sys_user (username, password, real_name, actor_type, department_id, status) "
                "VALUES (?, ?, ?, 'HUMAN', ?, 1)",
                (username, hash_password(password), real_name, dept["id"] if dept else None), conn,
            )[0]
        db.execute(
            "INSERT OR IGNORE INTO sys_user_role (user_id, role_id) VALUES (?, ?)",
            (user_id, role["id"]), conn,
        )


def _grant_business_resources(conn, menu_permissions):
    """按 M5 权限码把业务菜单授权给角色，每次启动重建这些菜单的授权关系。"""
    if not menu_permissions:
        return
    placeholders = ",".join("?" for _ in menu_permissions)
    db.execute(
        "DELETE FROM sys_role_resource WHERE resource_id IN ({})".format(placeholders),
        tuple(menu_permissions.keys()), conn,
    )
    for role in db.query("SELECT id, code FROM sys_role WHERE status=1", (), conn):
        granted = {
            row["code"] for row in db.query(
                """
                SELECT p.code FROM sys_permission p
                JOIN sys_role_permission rp ON rp.permission_id = p.id
                WHERE rp.role_id=? AND p.status=1
                """,
                (role["id"],), conn,
            )
        }
        if role["code"] in ("admin", "ROLE-ADMIN"):
            for resource_id in menu_permissions:
                db.execute(
                    "INSERT OR IGNORE INTO sys_role_resource (role_id, resource_id) VALUES (?, ?)",
                    (role["id"], resource_id), conn,
                )
            continue
        for resource_id, permission_code in menu_permissions.items():
            if permission_code in granted:
                db.execute(
                    "INSERT OR IGNORE INTO sys_role_resource (role_id, resource_id) VALUES (?, ?)",
                    (role["id"], resource_id), conn,
                )
