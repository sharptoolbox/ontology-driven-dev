import json

from flask import Blueprint, Response, g, request

from ai import chat, config as ai_config
from services import auth_service
from utils.response import fail, ok
from utils.security import login_required

bp = Blueprint("ai", __name__, url_prefix="/api/ai")


def _is_admin():
    return "*" in auth_service.get_permission_codes(getattr(g, "user_id", None))


@bp.get("/config")
@login_required
def get_config():
    cfg = ai_config.get_config()
    if not _is_admin():
        return fail("无权限"), 403
    # 掩码 api_key，避免泄露
    api_key = cfg["api_key"]
    masked = ""
    if api_key:
        masked = api_key[:4] + "****" + api_key[-4:] if len(api_key) > 8 else "****"
    return ok({
        "base_url": cfg["base_url"],
        "api_key_masked": masked,
        "model_id": cfg["model_id"],
        "max_tokens": cfg["max_tokens"],
        "configured": cfg["configured"],
    })


@bp.post("/config")
@login_required
def save_config():
    if not _is_admin():
        return fail("无权限"), 403
    data = request.get_json(silent=True) or {}
    cfg = ai_config.save_config(data, auth_service.current_user())
    return ok({"configured": cfg["configured"]}, "保存成功")


@bp.post("/test")
@login_required
def test_connection():
    if not _is_admin():
        return fail("无权限"), 403
    data = request.get_json(silent=True) or {}
    result = ai_config.test_config(data)
    return ok(result)


@bp.post("/chat")
@login_required
def ai_chat():
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    history = data.get("history") or []
    if not message:
        return fail("请输入您的问题")
    user = auth_service.current_user()

    def generate():
        try:
            for event, payload in chat.run_chat(message, history, user):
                yield f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"event: delta\ndata: {json.dumps({'content': f'系统错误：{e}'}, ensure_ascii=False)}\n\n"
            yield "event: message_end\ndata: {}\n\n"
        finally:
            auth_service.write_audit(user["id"], user["username"], "AI_CHAT", message[:200])

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
