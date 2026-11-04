from flask import Blueprint

from ontology.registry import registry
from utils.response import ok
from utils.security import login_required

bp = Blueprint("meta", __name__, url_prefix="/api/meta")

@bp.get("/dictionaries")
@login_required
def dictionaries():
    result = {}
    for dictionary in registry["data_dictionaries"].values():
        for item_type in dictionary.get("types", []):
            type_code = item_type.get("typeCode")
            if type_code:
                result[type_code] = [
                    {"code": item["code"], "label": item["label"]}
                    for item in item_type.get("items", [])
                    if item.get("enabled", True)
                ]
    return ok(result)


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
