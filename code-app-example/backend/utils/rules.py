from simpleeval import simple_eval

from ontology.registry import registry


def evaluate(expression: str, params: dict):
    """执行规则表达式（受限），返回结果值。"""
    return simple_eval(expression, names=params)


def check_rule(rule_id: str, params: dict, violation_message: str = None):
    """按 M3 规则 ID 校验，不满足则抛业务异常。"""
    rule = registry["rules"].get(rule_id)
    if not rule:
        return
    result = evaluate(rule["expression"], params)
    if not result:
        raise ValueError(violation_message or f"规则「{rule['name']}」校验不通过")


def check_ref_rule(ref_rule: dict, value):
    """校验 M1 属性 refRules，表达式用 value 表示当前属性值。"""
    ok = evaluate(ref_rule["expression"], {"value": value})
    if not ok:
        raise ValueError(ref_rule.get("violationMessage") or "属性值校验不通过")
