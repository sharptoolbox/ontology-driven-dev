from flask import Blueprint, request

from services import auth_service, masterdata_service, scope_service
from utils.response import fail, ok
from utils.security import login_required

bp = Blueprint("masterdata", __name__, url_prefix="/api/masterdata")

ENTITY_PERMISSIONS = {
    "product": "PERM-015",
    "customer": "PERM-016",
    "department": "PERM-017",
    "person": "PERM-018",
}


def _ctx():
    return scope_service.user_context(auth_service.current_user())


@bp.get("/options")
@login_required
def options():
    return ok(masterdata_service.option_payload(_ctx()))


@bp.get("/dict-types")
@login_required
def dict_types():
    return ok(masterdata_service.dict_types())


@bp.get("/dict/<dict_type>")
@login_required
def dict_items(dict_type):
    ctx = _ctx()
    scope_service.require_permission(ctx["id"], "PERM-019")
    try:
        return ok(masterdata_service.list_dict_items(dict_type, request.args.to_dict()))
    except ValueError as e:
        return fail(str(e))


@bp.post("/dict/<dict_type>")
@login_required
def dict_create(dict_type):
    ctx = _ctx()
    scope_service.require_permission(ctx["id"], "PERM-019")
    try:
        code = masterdata_service.create_dict_item(ctx, dict_type, request.get_json(silent=True) or {})
        return ok({"dict_code": code}, "新增成功")
    except ValueError as e:
        return fail(str(e))


@bp.put("/dict/item/<int:item_id>")
@login_required
def dict_update(item_id):
    ctx = _ctx()
    scope_service.require_permission(ctx["id"], "PERM-019")
    try:
        masterdata_service.update_dict_item(ctx, item_id, request.get_json(silent=True) or {})
        return ok(None, "修改成功")
    except ValueError as e:
        return fail(str(e))


@bp.post("/dict/item/<int:item_id>/toggle")
@login_required
def dict_toggle(item_id):
    ctx = _ctx()
    scope_service.require_permission(ctx["id"], "PERM-019")
    try:
        enabled = masterdata_service.toggle_dict_item(ctx, item_id)
        return ok({"enabled": enabled}, "已{}".format("启用" if enabled == "是" else "停用"))
    except ValueError as e:
        return fail(str(e))


@bp.delete("/dict/item/<int:item_id>")
@login_required
def dict_delete(item_id):
    ctx = _ctx()
    scope_service.require_permission(ctx["id"], "PERM-019")
    try:
        masterdata_service.delete_dict_item(ctx, item_id)
        return ok(None, "删除成功")
    except ValueError as e:
        return fail(str(e))


@bp.get("/<entity>/list")
@login_required
def list_entity(entity):
    ctx = _ctx()
    scope_service.require_permission(ctx["id"], ENTITY_PERMISSIONS.get(entity))
    try:
        return ok(masterdata_service.list_entity(ctx, entity, request.args.to_dict()))
    except ValueError as e:
        return fail(str(e))


@bp.post("/<entity>")
@login_required
def create_entity(entity):
    ctx = _ctx()
    scope_service.require_permission(ctx["id"], ENTITY_PERMISSIONS.get(entity))
    try:
        masterdata_service.create_entity(ctx, entity, request.get_json(silent=True) or {})
        return ok(None, "新增成功")
    except ValueError as e:
        return fail(str(e))


@bp.put("/<entity>/<int:record_id>")
@login_required
def update_entity(entity, record_id):
    ctx = _ctx()
    scope_service.require_permission(ctx["id"], ENTITY_PERMISSIONS.get(entity))
    try:
        masterdata_service.update_entity(ctx, entity, record_id, request.get_json(silent=True) or {})
        return ok(None, "修改成功")
    except ValueError as e:
        return fail(str(e))


@bp.delete("/<entity>/<int:record_id>")
@login_required
def delete_entity(entity, record_id):
    ctx = _ctx()
    scope_service.require_permission(ctx["id"], ENTITY_PERMISSIONS.get(entity))
    try:
        masterdata_service.delete_entity(ctx, entity, record_id)
        return ok(None, "删除成功")
    except ValueError as e:
        return fail(str(e))
