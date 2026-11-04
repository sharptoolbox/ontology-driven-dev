from flask import Blueprint, request

from services import role_service
from utils.response import fail, ok
from utils.security import login_required, require_permission

bp = Blueprint("roles", __name__, url_prefix="/api/roles")


@bp.get("")
@login_required
def list_roles():
    page = int(request.args.get("page", 1))
    size = int(request.args.get("size", 10))
    keyword = request.args.get("keyword", "")
    return ok(role_service.list_roles(page, size, keyword))


@bp.post("")
@login_required
@require_permission("system:role:add")
def create_role():
    data = request.get_json(silent=True) or {}
    try:
        return ok({"id": role_service.create_role(data)}, "创建成功")
    except ValueError as e:
        return fail(str(e))


@bp.put("/<int:role_id>")
@login_required
@require_permission("system:role:edit")
def update_role(role_id):
    data = request.get_json(silent=True) or {}
    try:
        return ok({"id": role_service.update_role(role_id, data)}, "更新成功")
    except ValueError as e:
        return fail(str(e))


@bp.delete("/<int:role_id>")
@login_required
@require_permission("system:role:delete")
def delete_role(role_id):
    try:
        role_service.delete_role(role_id)
        return ok(None, "删除成功")
    except ValueError as e:
        return fail(str(e))


@bp.put("/<int:role_id>/permissions")
@login_required
@require_permission("system:role:assign")
def assign_permissions(role_id):
    data = request.get_json(silent=True) or {}
    role_service.assign_permissions(role_id, data.get("permission_ids") or [])
    return ok(None, "分配成功")


@bp.put("/<int:role_id>/resources")
@login_required
@require_permission("system:role:assign")
def assign_resources(role_id):
    data = request.get_json(silent=True) or {}
    role_service.assign_resources(role_id, data.get("resource_ids") or [])
    return ok(None, "分配成功")
