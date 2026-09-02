from flask import Blueprint, request

from services import user_service
from utils.response import fail, ok
from utils.security import login_required, require_permission

bp = Blueprint("users", __name__, url_prefix="/api/users")


@bp.get("")
@login_required
def list_users():
    page = int(request.args.get("page", 1))
    size = int(request.args.get("size", 10))
    keyword = request.args.get("keyword", "")
    return ok(user_service.list_users(page, size, keyword))


@bp.get("/options")
@login_required
def role_options():
    return ok(user_service.list_role_options())


@bp.post("")
@login_required
@require_permission("system:user:add")
def create_user():
    data = request.get_json(silent=True) or {}
    try:
        return ok({"id": user_service.create_user(data)}, "创建成功")
    except ValueError as e:
        return fail(str(e))


@bp.put("/<int:user_id>")
@login_required
@require_permission("system:user:edit")
def update_user(user_id):
    data = request.get_json(silent=True) or {}
    try:
        return ok({"id": user_service.update_user(user_id, data)}, "更新成功")
    except ValueError as e:
        return fail(str(e))


@bp.delete("/<int:user_id>")
@login_required
@require_permission("system:user:delete")
def delete_user(user_id):
    try:
        user_service.delete_user(user_id)
        return ok(None, "删除成功")
    except ValueError as e:
        return fail(str(e))


@bp.put("/<int:user_id>/roles")
@login_required
@require_permission("system:user:assign-role")
def assign_roles(user_id):
    data = request.get_json(silent=True) or {}
    user_service.assign_roles(user_id, data.get("role_ids") or [])
    return ok(None, "分配成功")


@bp.put("/<int:user_id>/reset-pwd")
@login_required
@require_permission("system:user:reset-pwd")
def reset_password(user_id):
    data = request.get_json(silent=True) or {}
    try:
        user_service.reset_password(user_id, data.get("password"))
        return ok(None, "重置成功")
    except ValueError as e:
        return fail(str(e))
