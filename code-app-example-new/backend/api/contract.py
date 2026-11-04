from flask import Blueprint, request

from services import auth_service, contract_service, masterdata_service, scope_service
from utils.response import fail, ok
from utils.security import login_required

bp = Blueprint("contract", __name__, url_prefix="/api/contract")


def _ctx():
    return scope_service.user_context(auth_service.current_user())


def _guard(permission_code):
    ctx = _ctx()
    scope_service.require_permission(ctx["id"], permission_code)
    return ctx


@bp.get("/prefill")
@login_required
def prefill():
    _guard("PERM-001")
    return ok({"contract_no": contract_service.prefill_no()})


@bp.get("/options")
@login_required
def options():
    ctx = _ctx()
    return ok(masterdata_service.option_payload(ctx))


@bp.get("/list")
@login_required
def list_contracts():
    ctx = _guard("PERM-007")
    return ok(contract_service.list_contracts(ctx, request.args.to_dict()))


@bp.get("/detail/<contract_no>")
@login_required
def detail(contract_no):
    ctx = _guard("PERM-008")
    try:
        return ok(contract_service.get_contract(ctx, contract_no))
    except ValueError as e:
        return fail(str(e))


@bp.post("/save")
@login_required
def save():
    data = request.get_json(silent=True) or {}
    submit = bool(data.get("submit"))
    is_update = bool((data.get("contract_no") or "").strip())
    ctx = _guard("PERM-002" if is_update else "PERM-001")
    try:
        contract_no = contract_service.save(ctx, data, submit=submit)
        return ok({"contract_no": contract_no}, "保存成功" if not submit else "已保存并提交审批")
    except ValueError as e:
        return fail(str(e))


@bp.post("/<contract_no>/submit")
@login_required
def submit(contract_no):
    ctx = _guard("PERM-004")
    try:
        result = contract_service.submit(ctx, contract_no)
        return ok(result, "已提交审批")
    except ValueError as e:
        return fail(str(e))


@bp.post("/<contract_no>/withdraw")
@login_required
def withdraw(contract_no):
    ctx = _guard("PERM-005")
    try:
        contract_service.withdraw(ctx, contract_no)
        return ok({"contract_no": contract_no}, "已撤回，合同退回草稿")
    except ValueError as e:
        return fail(str(e))


@bp.delete("/<contract_no>")
@login_required
def delete(contract_no):
    ctx = _guard("PERM-003")
    try:
        contract_service.delete(ctx, contract_no)
        return ok(None, "删除成功")
    except ValueError as e:
        return fail(str(e))


@bp.get("/approval/todo")
@login_required
def approval_todo():
    ctx = _guard("PERM-006")
    return ok(contract_service.approval_tasks(ctx, "todo", request.args.to_dict()))


@bp.get("/approval/done")
@login_required
def approval_done():
    ctx = _guard("PERM-006")
    return ok(contract_service.approval_tasks(ctx, "done", request.args.to_dict()))
