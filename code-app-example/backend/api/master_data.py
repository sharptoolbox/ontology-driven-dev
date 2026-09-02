from flask import Blueprint, request

from services import auth_service, master_data_service
from utils.response import fail, ok
from utils.security import login_required, require_permission

bp = Blueprint("master_data", __name__, url_prefix="/api/masterdata")

KINDS = {"product", "customer", "department", "employee"}
_PERM = {
    "product": "PERM-PRODUCT-MAINTAIN",
    "customer": "PERM-CUSTOMER-MAINTAIN",
    "department": "PERM-DEPARTMENT-MAINTAIN",
    "employee": "PERM-EMPLOYEE-MAINTAIN",
}


@bp.get("/<kind>/options")
@login_required
def options(kind):
    if kind not in KINDS:
        return fail("无效类型")
    return ok(master_data_service.options(kind))


@bp.get("/<kind>")
@login_required
def list_items(kind):
    if kind not in KINDS:
        return fail("无效类型")
    page = int(request.args.get("page", 1))
    size = int(request.args.get("size", 10))
    keyword = request.args.get("keyword", "")
    return ok(master_data_service.list_items(kind, page, size, keyword))


@bp.post("/<kind>")
@login_required
def create_item(kind):
    if kind not in KINDS:
        return fail("无效类型")
    perm = _PERM[kind]
    from utils.security import has_current_permission
    if not has_current_permission(perm):
        return fail("无权限执行该操作"), 403
    data = request.get_json(silent=True) or {}
    try:
        return ok({"id": master_data_service.create(kind, data, auth_service.current_user())}, "创建成功")
    except ValueError as e:
        return fail(str(e))


@bp.put("/<kind>/<int:item_id>")
@login_required
def update_item(kind, item_id):
    if kind not in KINDS:
        return fail("无效类型")
    from utils.security import has_current_permission
    if not has_current_permission(_PERM[kind]):
        return fail("无权限执行该操作"), 403
    data = request.get_json(silent=True) or {}
    try:
        return ok({"id": master_data_service.update(kind, item_id, data, auth_service.current_user())}, "更新成功")
    except ValueError as e:
        return fail(str(e))


@bp.delete("/<kind>/<int:item_id>")
@login_required
def remove_item(kind, item_id):
    if kind not in KINDS:
        return fail("无效类型")
    from utils.security import has_current_permission
    if not has_current_permission(_PERM[kind]):
        return fail("无权限执行该操作"), 403
    master_data_service.remove(kind, item_id)
    return ok(None, "删除成功")
