from flask import Blueprint, request

from services import report_service
from utils.response import ok
from utils.security import login_required

bp = Blueprint("report", __name__, url_prefix="/api/report")


@bp.get("/execution")
@login_required
def execution():
    page = int(request.args.get("page", 1))
    size = int(request.args.get("size", 10))
    filters = {k: request.args.get(k) for k in ("department_id", "owner_id")}
    return ok(report_service.execution_analysis(page, size, filters))


@bp.get("/dept")
@login_required
def dept():
    filters = {k: request.args.get(k) for k in ("department_id",)}
    return ok(report_service.dept_summary(filters))


@bp.get("/unreceived")
@login_required
def unreceived():
    page = int(request.args.get("page", 1))
    size = int(request.args.get("size", 10))
    filters = {k: request.args.get(k) for k in ("department_id",)}
    return ok(report_service.unreceived(page, size, filters))
