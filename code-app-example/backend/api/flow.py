from flask import Blueprint, request

from services import auth_service, flow_service
from utils.response import fail, ok
from utils.security import login_required, require_permission

bp = Blueprint("flow", __name__, url_prefix="/api/flow")


@bp.get("/definitions")
@login_required
def list_definitions():
    page = int(request.args.get("page", 1))
    size = int(request.args.get("size", 10))
    keyword = request.args.get("keyword", "")
    return ok(flow_service.list_definitions(page, size, keyword))


@bp.get("/definitions/<int:def_id>")
@login_required
def get_definition(def_id):
    return ok(flow_service.get_definition(def_id))


@bp.get("/definitions/<int:def_id>/graph")
@login_required
def get_graph(def_id):
    definition = flow_service.get_definition(def_id)
    if not definition:
        return fail("流程定义不存在")
    return ok(definition.get("node_graph"))


@bp.post("/definitions")
@login_required
@require_permission("flow:definition:add")
def create_definition():
    data = request.get_json(silent=True) or {}
    try:
        return ok({"id": flow_service.create_definition(data, auth_service.current_user()["id"])}, "创建成功")
    except ValueError as e:
        return fail(str(e))


@bp.put("/definitions/<int:def_id>")
@login_required
@require_permission("flow:definition:edit")
def update_definition(def_id):
    data = request.get_json(silent=True) or {}
    try:
        return ok({"id": flow_service.update_definition(def_id, data)}, "更新成功")
    except ValueError as e:
        return fail(str(e))


@bp.post("/definitions/<int:def_id>/publish")
@login_required
@require_permission("flow:definition:publish")
def publish_definition(def_id):
    try:
        flow_service.publish_definition(def_id)
        return ok(None, "发布成功")
    except ValueError as e:
        return fail(str(e))


@bp.get("/instances")
@login_required
def list_instances():
    page = int(request.args.get("page", 1))
    size = int(request.args.get("size", 10))
    filters = {
        "status": request.args.get("status"),
        "keyword": request.args.get("keyword"),
    }
    return ok(flow_service.list_instances(page, size, filters))


@bp.get("/instances/<int:instance_id>")
@login_required
def get_instance(instance_id):
    return ok(flow_service.get_instance(instance_id))


@bp.put("/instances/<int:instance_id>/terminate")
@login_required
@require_permission("flow:instance:terminate")
def terminate_instance(instance_id):
    try:
        flow_service.terminate_instance(instance_id, auth_service.current_user())
        return ok(None, "已终止")
    except ValueError as e:
        return fail(str(e))


@bp.get("/tasks")
@login_required
def list_tasks():
    page = int(request.args.get("page", 1))
    size = int(request.args.get("size", 10))
    filters = {"status": request.args.get("status")}
    return ok(flow_service.list_tasks(page, size, filters))


@bp.put("/tasks/<int:task_id>/transfer")
@login_required
@require_permission("flow:task:transfer")
def transfer_task(task_id):
    data = request.get_json(silent=True) or {}
    try:
        flow_service.transfer_task(task_id, data.get("assignee_id"))
        return ok(None, "转办成功")
    except ValueError as e:
        return fail(str(e))


@bp.put("/tasks/<int:task_id>/urge")
@login_required
@require_permission("flow:task:urge")
def urge_task(task_id):
    try:
        flow_service.urge_task(task_id, auth_service.current_user())
        return ok(None, "催办成功")
    except ValueError as e:
        return fail(str(e))
