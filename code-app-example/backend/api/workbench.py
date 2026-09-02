from flask import Blueprint, request

from services import auth_service, workbench_service
from utils.response import fail, ok
from utils.security import login_required

bp = Blueprint("workbench", __name__, url_prefix="/api/workbench")


@bp.get("/todo")
@login_required
def todo():
    page = int(request.args.get("page", 1))
    size = int(request.args.get("size", 10))
    return ok(workbench_service.todo(auth_service.current_user()["id"], page, size))


@bp.get("/done")
@login_required
def done():
    page = int(request.args.get("page", 1))
    size = int(request.args.get("size", 10))
    return ok(workbench_service.done(auth_service.current_user()["id"], page, size))


@bp.get("/requested")
@login_required
def requested():
    page = int(request.args.get("page", 1))
    size = int(request.args.get("size", 10))
    return ok(workbench_service.requested(auth_service.current_user()["id"], page, size))


@bp.post("/todo/<int:task_id>/approve")
@login_required
def approve(task_id):
    data = request.get_json(silent=True) or {}
    try:
        workbench_service.approve(task_id, data.get("comment"), auth_service.current_user())
        return ok(None, "审批通过")
    except ValueError as e:
        return fail(str(e))


@bp.post("/todo/<int:task_id>/reject")
@login_required
def reject(task_id):
    data = request.get_json(silent=True) or {}
    try:
        workbench_service.reject(task_id, data.get("comment"), auth_service.current_user())
        return ok(None, "已驳回")
    except ValueError as e:
        return fail(str(e))


@bp.post("/todo/<int:task_id>/return")
@login_required
def return_task(task_id):
    data = request.get_json(silent=True) or {}
    try:
        workbench_service.return_task(task_id, data.get("target_activity_id"), data.get("comment"), auth_service.current_user())
        return ok(None, "已退回")
    except ValueError as e:
        return fail(str(e))
