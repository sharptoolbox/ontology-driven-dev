from flask import Blueprint, request

from services import auth_service, invoice_service
from utils.response import fail, ok
from utils.security import has_current_permission, login_required

bp = Blueprint("invoice", __name__, url_prefix="/api/invoice")


@bp.get("/options")
@login_required
def options():
    rows = invoice_service.list_invoices(1, 200, {"approval_status": "已批准"})
    return ok([{"id": r["id"], "no": r["invoice_no"], "contract_id": r["contract_id"],
                "contract_no": r["contract_no"], "contract_name": r.get("contract_name"),
                "amount": r["invoice_amount"], "received": r["received_amount"]}
               for r in rows["list"]])


@bp.get("")
@login_required
def list_invoices():
    page = int(request.args.get("page", 1))
    size = int(request.args.get("size", 10))
    filters = {k: request.args.get(k) for k in ("invoice_no", "contract_id", "approval_status")}
    return ok(invoice_service.list_invoices(page, size, filters))


@bp.get("/<int:invoice_id>")
@login_required
def get_invoice(invoice_id):
    return ok(invoice_service.get_invoice(invoice_id))


@bp.post("/draft")
@login_required
def create_draft():
    data = request.get_json(silent=True) or {}
    try:
        return ok(invoice_service.create_draft(data, auth_service.current_user()), "暂存成功")
    except ValueError as e:
        return fail(str(e))


@bp.put("/<int:invoice_id>/draft")
@login_required
def update_draft(invoice_id):
    data = request.get_json(silent=True) or {}
    try:
        return ok(invoice_service.update_draft(invoice_id, data, auth_service.current_user()), "暂存成功")
    except ValueError as e:
        return fail(str(e))


@bp.post("/<int:invoice_id>/submit")
@login_required
def submit(invoice_id):
    if not has_current_permission("PERM-INVOICE-SUBMIT"):
        return fail("无权限执行该操作"), 403
    try:
        return ok(invoice_service.submit(invoice_id, auth_service.current_user()), "提交成功，已启动开票审批")
    except ValueError as e:
        return fail(str(e))


@bp.post("/<int:invoice_id>/withdraw")
@login_required
def withdraw(invoice_id):
    try:
        return ok(invoice_service.withdraw(invoice_id, auth_service.current_user()), "已撤回")
    except ValueError as e:
        return fail(str(e))


@bp.post("/<int:invoice_id>/void")
@login_required
def void(invoice_id):
    if not has_current_permission("PERM-INVOICE-VOID"):
        return fail("无权限执行该操作"), 403
    try:
        return ok(invoice_service.void(invoice_id, auth_service.current_user()), "已作废")
    except ValueError as e:
        return fail(str(e))
