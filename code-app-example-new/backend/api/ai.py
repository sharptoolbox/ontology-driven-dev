from flask import Blueprint, g, request

from services import ai_service, auth_service, scope_service
from utils.response import fail, ok
from utils.security import login_required

bp = Blueprint("ai", __name__, url_prefix="/api/ai")


@bp.get("/config")
@login_required
def get_config():
    if not scope_service.is_admin(g.user_id):
        return fail("仅系统管理员可配置大模型", "FORBIDDEN")
    return ok(ai_service.get_config())


@bp.put("/config")
@login_required
def save_config():
    if not scope_service.is_admin(g.user_id):
        return fail("仅系统管理员可配置大模型", "FORBIDDEN")
    try:
        return ok(ai_service.save_config(g.user_id, request.get_json(silent=True) or {}), "保存成功")
    except ValueError as e:
        return fail(str(e))


@bp.post("/config/test")
@login_required
def test_config():
    if not scope_service.is_admin(g.user_id):
        return fail("仅系统管理员可配置大模型", "FORBIDDEN")
    try:
        return ok(ai_service.test_connection(), "连接成功")
    except ValueError as e:
        return fail(str(e))
    except Exception as e:
        return fail("连接失败：{}".format(e))


@bp.post("/chat")
@login_required
def chat():
    data = request.get_json(silent=True) or {}
    ctx = scope_service.user_context(auth_service.current_user())
    try:
        result = ai_service.answer(ctx, data.get("question"))
        auth_service.write_audit(ctx["id"], ctx["name"], "AI_QUERY", (data.get("question") or "")[:200])
        return ok(result)
    except ValueError as e:
        return fail(str(e))
