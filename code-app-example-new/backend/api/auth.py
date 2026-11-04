from flask import Blueprint, g, request

from services import auth_service
from utils.response import fail, ok
from utils.security import generate_token, login_required

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return fail("请输入用户名和密码", "AUTH_INVALID")
    user, err = auth_service.login(username, password)
    if err:
        return fail(err, "AUTH_FAILED")
    token = generate_token(user["id"], user["username"])
    payload = auth_service.build_login_payload(user)
    payload["token"] = token
    auth_service.write_audit(user["id"], user["username"], "LOGIN")
    return ok(payload, "登录成功")


@bp.post("/logout")
@login_required
def logout():
    auth_service.write_audit(g.user_id, g.username, "LOGOUT")
    return ok(None, "已退出登录")


@bp.get("/info")
@login_required
def info():
    user = auth_service.get_user(g.user_id)
    if not user or user["status"] != 1:
        return fail("账号不存在或已禁用", "AUTH_FAILED")
    return ok(auth_service.build_login_payload(user))
