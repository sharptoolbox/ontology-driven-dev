from flask import Blueprint, request, send_file

from services import auth_service, report_service, scope_service
from utils.response import fail, ok
from utils.security import login_required

bp = Blueprint("report", __name__, url_prefix="/api/report")


def _ctx():
    return scope_service.user_context(auth_service.current_user())


@bp.get("/department")
@login_required
def department():
    ctx = _ctx()
    scope_service.require_permission(ctx["id"], "PERM-013")
    try:
        return ok(report_service.query(ctx, request.args.to_dict()))
    except ValueError as e:
        return fail(str(e))


@bp.get("/department/export")
@login_required
def export():
    ctx = _ctx()
    scope_service.require_permission(ctx["id"], "PERM-014")
    try:
        buffer, filename = report_service.export(ctx, request.args.to_dict())
    except ValueError as e:
        return fail(str(e))
    return send_file(
        buffer,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=filename,
    )
