"""M3 规则模型求值入口。

规则表达式统一用 simpleeval 求值，异常统一转换为中文业务提示，
保证规则失败时前端能拿到明确原因（RULE-001 ~ RULE-010）。
"""

from simpleeval import simple_eval


def evaluate(expression, params):
    return simple_eval(expression, names=dict(params or {}))


def check(expression, params, message):
    """求值不通过时抛出业务异常。"""
    try:
        passed = bool(evaluate(expression, params))
    except Exception:
        passed = False
    if not passed:
        raise ValueError(message)
    return True


def require(condition, message):
    if not condition:
        raise ValueError(message)
    return True


def money(value):
    """金额统一四舍五入到 2 位，避免浮点尾差。"""
    try:
        return round(float(value or 0) + 1e-9, 2)
    except (TypeError, ValueError):
        return 0.0
