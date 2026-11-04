from flask import Blueprint, request

from services import resource_service
from utils.response import fail, ok
from utils.security import login_required, require_permission

bp = Blueprint("resources", __name__, url_prefix="/api/resources")


@bp.get("/tree")
@login_required
def tree():
    return ok(resource_service.tree())


@bp.get("")
@login_required
def list_resources():
    return ok(resource_service.list_resources())


@bp.post("")
@login_required
@require_permission("system:resource:add")
def create_resource():
    data = request.get_json(silent=True) or {}
    try:
        return ok({"id": resource_service.create_resource(data)}, "创建成功")
    except ValueError as e:
        return fail(str(e))


@bp.put("/<int:resource_id>")
@login_required
@require_permission("system:resource:edit")
def update_resource(resource_id):
    data = request.get_json(silent=True) or {}
    try:
        return ok({"id": resource_service.update_resource(resource_id, data)}, "更新成功")
    except ValueError as e:
        return fail(str(e))


@bp.delete("/<int:resource_id>")
@login_required
@require_permission("system:resource:delete")
def delete_resource(resource_id):
    resource_service.delete_resource(resource_id)
    return ok(None, "删除成功")
