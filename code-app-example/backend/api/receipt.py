from flask import Blueprint, request

from services import auth_service, receipt_service
from utils.response import fail, ok
from utils.security import has_current_permission, login_required

bp = Blueprint("receipt", __name__, url_prefix="/api/receipt")


@bp.get("")
@login_required
def list_receipts():
    page = int(request.args.get("page", 1))
    size = int(request.args.get("size", 10))
    filters = {k: request.args.get(k) for k in ("receipt_no", "contract_id", "invoice_id")}
    return ok(receipt_service.list_receipts(page, size, filters))


@bp.get("/<int:receipt_id>")
@login_required
def get_receipt(receipt_id):
    return ok(receipt_service.get_receipt(receipt_id))


@bp.post("")
@login_required
def record():
    if not has_current_permission("PERM-RECEIPT-RECORD"):
        return fail("无权限执行该操作"), 403
    data = request.get_json(silent=True) or {}
    try:
        return ok(receipt_service.record(data, auth_service.current_user()), "收款登记成功")
    except ValueError as e:
        return fail(str(e))


@bp.post("/<int:receipt_id>/reverse")
@login_required
def reverse(receipt_id):
    if not has_current_permission("PERM-RECEIPT-REVERSE"):
        return fail("无权限执行该操作"), 403
    try:
        return ok(receipt_service.reverse(receipt_id, auth_service.current_user()), "冲销成功")
    except ValueError as e:
        return fail(str(e))
