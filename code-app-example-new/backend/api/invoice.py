from flask import Blueprint, request

from services import auth_service, invoice_service, scope_service
from utils.response import fail, ok
from utils.security import login_required

bp = Blueprint("invoice", __name__, url_prefix="/api/invoice")


def _ctx():
    return scope_service.user_context(auth_service.current_user())


@bp.get("/list")
@login_required
def list_invoices():
    ctx = _ctx()
    scope_service.require_permission(ctx["id"], "PERM-010")
    return ok(invoice_service.list_invoices(ctx, request.args.to_dict()))


@bp.get("/options")
@login_required
def options():
    ctx = _ctx()
    scope_service.require_permission(ctx["id"], "PERM-009")
    return ok(invoice_service.invoice_options(ctx))


@bp.post("/create")
@login_required
def create():
    ctx = _ctx()
    scope_service.require_permission(ctx["id"], "PERM-009")
    try:
        result = invoice_service.create(ctx, request.get_json(silent=True) or {})
        return ok(result, "开票登记成功，开票编号 {}".format(result["invoice_no"]))
    except ValueError as e:
        return fail(str(e))
