"""主体（M5）与数据权限（RULE-009）解析。

- 角色/权限读取技术底座 sys_role / sys_permission / sys_role_permission；
- 数据范围：销售人员（ROLE-01）与普通员工（ROLE-05）仅本部门，
  财务人员（ROLE-02）、财务经理（ROLE-03）、总经理（ROLE-04）可查看全部部门；
- 系统管理员（通配权限 *）不受数据范围限制。
"""

import db
from services import auth_service

FULL_SCOPE_ROLES = {"ROLE-02", "ROLE-03", "ROLE-04"}
DEPT_SCOPE_ROLES = {"ROLE-01", "ROLE-05"}


class PermissionDenied(ValueError):
    """越权访问：由全局异常处理器映射为 HTTP 403。"""


def role_codes(user_id):
    return [r["code"] for r in auth_service.get_user_roles(user_id)]


def permission_codes(user_id):
    return auth_service.get_permission_codes(user_id)


def is_admin(user_id):
    return "*" in permission_codes(user_id)


def has_permission(user_id, code):
    if not code:
        return True
    codes = permission_codes(user_id)
    return "*" in codes or code in codes


def require_permission(user_id, code, message="无权限执行该操作"):
    if not has_permission(user_id, code):
        raise PermissionDenied(message)


def user_dept_no(user_id):
    row = db.query_one(
        """
        SELECT d.dept_no
        FROM sys_user u
        JOIN mdm_department d ON d.id = u.department_id AND d.flag = 1
        WHERE u.id = ?
        """,
        (user_id,),
    )
    return row["dept_no"] if row else None


def user_context(user):
    """把登录用户解析为数据权限上下文。"""
    user_id = user["id"]
    roles = role_codes(user_id)
    admin = is_admin(user_id)
    role_set = set(roles)

    if admin or role_set.intersection(FULL_SCOPE_ROLES):
        scope_all = True
    else:
        scope_all = False

    return {
        "id": user_id,
        "name": user.get("real_name") or user.get("username"),
        "roles": roles,
        "is_admin": admin,
        "scope_all": scope_all,
        "dept_no": user_dept_no(user_id),
        "permissions": permission_codes(user_id),
    }


def contract_scope_clause(ctx, alias="c"):
    """返回 (sql_snippet, params)，用于按数据权限过滤合同。"""
    if ctx["scope_all"]:
        return "1=1", []
    if not ctx["dept_no"]:
        # 未配置所属部门的本部门受限角色看不到任何数据
        return "1=0", []
    return "{}.dept_no = ?".format(alias), [ctx["dept_no"]]


def can_see_contract(ctx, contract):
    if ctx["scope_all"]:
        return True
    return bool(ctx["dept_no"]) and contract["dept_no"] == ctx["dept_no"]
