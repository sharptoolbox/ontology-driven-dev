from flask import Blueprint, request

from services import auth_service, receipt_service, scope_service
from utils.response import fail, ok
from utils.security import login_required

bp = Blueprint("receipt", __name__, url_prefix="/api/receipt")


def _ctx():
    return scope_service.user_context(auth_service.current_user())


@bp.get("/list")
@login_required
def list_receipts():
    ctx = _ctx()
    scope_service.require_permission(ctx["id"], "PERM-012")
    return ok(receipt_service.list_receipts(ctx, request.args.to_dict()))


@bp.get("/options")
@login_required
def options():
    ctx = _ctx()
    scope_service.require_permission(ctx["id"], "PERM-011")
    return ok(receipt_service.receipt_options(ctx))


@bp.post("/create")
@login_required
def create():
    ctx = _ctx()
    scope_service.require_permission(ctx["id"], "PERM-011")
    try:
        result = receipt_service.create(ctx, request.get_json(silent=True) or {})
        message = "收款登记成功"
        if result.get("contract_closed"):
            message = "收款登记成功，该合同全部款项已收齐，合同已自动关闭"
        return ok(result, message)
    except ValueError as e:
        return fail(str(e))
