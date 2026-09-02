from flask import Blueprint, request

from services import permission_service
from utils.response import fail, ok
from utils.security import login_required, require_permission

bp = Blueprint("permissions", __name__, url_prefix="/api/permissions")


@bp.get("")
@login_required
def list_permissions():
    page = int(request.args.get("page", 1))
    size = int(request.args.get("size", 10))
    keyword = request.args.get("keyword", "")
    return ok(permission_service.list_permissions(page, size, keyword))


@bp.get("/all")
@login_required
def all_permissions():
    return ok(permission_service.list_all())


@bp.post("")
@login_required
@require_permission("system:permission:add")
def create_permission():
    data = request.get_json(silent=True) or {}
    try:
        return ok({"id": permission_service.create_permission(data)}, "创建成功")
    except ValueError as e:
        return fail(str(e))


@bp.put("/<int:permission_id>")
@login_required
@require_permission("system:permission:edit")
def update_permission(permission_id):
    data = request.get_json(silent=True) or {}
    try:
        return ok({"id": permission_service.update_permission(permission_id, data)}, "更新成功")
    except ValueError as e:
        return fail(str(e))


@bp.delete("/<int:permission_id>")
@login_required
@require_permission("system:permission:delete")
def delete_permission(permission_id):
    permission_service.delete_permission(permission_id)
    return ok(None, "删除成功")
