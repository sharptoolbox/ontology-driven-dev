from flask import Blueprint, request

from services import auth_service, contract_service
from utils.response import fail, ok
from utils.security import has_current_permission, login_required

bp = Blueprint("contract", __name__, url_prefix="/api/contract")


@bp.get("/options")
@login_required
def options():
    rows = contract_service.list_contracts(1, 100, {"status": "已纳入管理"})
    return ok([{"id": r["id"], "no": r["contract_no"], "name": r["contract_name"], "total_amount": r["total_amount"]}
               for r in rows["list"]])


@bp.get("")
@login_required
def list_contracts():
    page = int(request.args.get("page", 1))
    size = int(request.args.get("size", 10))
    filters = {k: request.args.get(k) for k in
               ("contract_no", "contract_name", "product_id", "customer_id", "department_id", "contract_type", "status", "sign_date_from", "sign_date_to")}
    return ok(contract_service.list_contracts(page, size, filters))


@bp.get("/<int:contract_id>")
@login_required
def get_contract(contract_id):
    return ok(contract_service.get_contract(contract_id))


@bp.post("/draft")
@login_required
def create_draft():
    data = request.get_json(silent=True) or {}
    try:
        return ok(contract_service.create_draft(data, auth_service.current_user()), "暂存成功")
    except ValueError as e:
        return fail(str(e))


@bp.put("/<int:contract_id>/draft")
@login_required
def update_draft(contract_id):
    data = request.get_json(silent=True) or {}
    try:
        return ok(contract_service.update_draft(contract_id, data, auth_service.current_user()), "暂存成功")
    except ValueError as e:
        return fail(str(e))


@bp.post("/<int:contract_id>/submit")
@login_required
def submit(contract_id):
    if not has_current_permission("PERM-CONTRACT-SUBMIT"):
        return fail("无权限执行该操作"), 403
    try:
        return ok(contract_service.submit(contract_id, auth_service.current_user()), "提交成功，已启动合同登记审批")
    except ValueError as e:
        return fail(str(e))


@bp.post("/<int:contract_id>/withdraw")
@login_required
def withdraw(contract_id):
    try:
        return ok(contract_service.withdraw(contract_id, auth_service.current_user()), "已撤回")
    except ValueError as e:
        return fail(str(e))


@bp.post("/<int:contract_id>/void")
@login_required
def void(contract_id):
    if not has_current_permission("PERM-CONTRACT-VOID"):
        return fail("无权限执行该操作"), 403
    try:
        return ok(contract_service.void_or_archive(contract_id, "void", auth_service.current_user()), "已作废")
    except ValueError as e:
        return fail(str(e))


@bp.post("/<int:contract_id>/archive")
@login_required
def archive(contract_id):
    if not has_current_permission("PERM-CONTRACT-VOID"):
        return fail("无权限执行该操作"), 403
    try:
        return ok(contract_service.void_or_archive(contract_id, "archive", auth_service.current_user()), "已归档")
    except ValueError as e:
        return fail(str(e))
