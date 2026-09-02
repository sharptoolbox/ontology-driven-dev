from flask import Blueprint

from ontology.registry import get_dictionary_items
from utils.response import ok
from utils.security import login_required

bp = Blueprint("meta", __name__, url_prefix="/api/meta")

CONTRACT_STATUS = ["草稿", "待财务经理审批", "待总经理审批", "已纳入管理", "已结清", "已驳回", "已作废", "已归档"]
INVOICE_STATUS = ["草稿", "待财务经理审批", "已批准", "已驳回", "已作废"]
RECEIPT_STATUS = ["已登记", "已冲销"]
LIFECYCLE_STATUS = ["在用", "停用"]


@bp.get("/dictionaries")
@login_required
def dictionaries():
    return ok({
        "CONTRACT_TYPE": get_dictionary_items("DICT-CONTRACT-TYPE", "CONTRACT_TYPE"),
        "PRODUCT_TYPE": get_dictionary_items("DICT-PRODUCT-TYPE", "PRODUCT_TYPE"),
        "CUSTOMER_TYPE": get_dictionary_items("DICT-CUSTOMER-TYPE", "CUSTOMER_TYPE"),
        "RECEIPT_METHOD": get_dictionary_items("DICT-RECEIPT-METHOD", "RECEIPT_METHOD"),
        "APPROVAL_NODE": get_dictionary_items("DICT-APPROVAL-NODE", "APPROVAL_NODE"),
        "APPROVAL_RESULT": get_dictionary_items("DICT-APPROVAL-RESULT", "APPROVAL_RESULT"),
        "BIZ_TYPE": get_dictionary_items("DICT-BIZ-TYPE", "BIZ_TYPE"),
    })


@bp.get("/contract-status")
@login_required
def contract_status():
    return ok(CONTRACT_STATUS)


@bp.get("/invoice-status")
@login_required
def invoice_status():
    return ok(INVOICE_STATUS)


@bp.get("/receipt-status")
@login_required
def receipt_status():
    return ok(RECEIPT_STATUS)


@bp.get("/rules")
@login_required
def rules():
    from ontology.registry import registry
    return ok([
        {
            "id": r["id"],
            "name": r.get("name", r["id"]),
            "description": r.get("description"),
            "expression": (r.get("expression") or "").strip(),
            "rule_type": r.get("ruleType"),
            "input_params": r.get("inputParams", []),
        }
        for r in registry["rules"].values()
    ])
