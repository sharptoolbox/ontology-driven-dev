"""AI 大模型配置存取与连通性测试。"""
import db
from ai import llm

DEFAULTS = {
    "base_url": "https://api.deepseek.com",
    "api_key": "",
    "model_id": "deepseek-chat",
    "max_tokens": 81920,
}


def _ensure_row(conn=None):
    if not db.query_one("SELECT id FROM ai_config WHERE id=1", (), conn):
        db.execute(
            "INSERT INTO ai_config (id, base_url, api_key, model_id, max_tokens) VALUES (1, ?, ?, ?, ?)",
            (DEFAULTS["base_url"], DEFAULTS["api_key"], DEFAULTS["model_id"], DEFAULTS["max_tokens"]),
            conn,
        )


def get_config():
    _ensure_row()
    row = db.query_one("SELECT * FROM ai_config WHERE id=1")
    cfg = {
        "base_url": row["base_url"] or DEFAULTS["base_url"],
        "api_key": row["api_key"] or "",
        "model_id": row["model_id"] or DEFAULTS["model_id"],
        "max_tokens": row["max_tokens"] or DEFAULTS["max_tokens"],
    }
    cfg["configured"] = bool(cfg["api_key"])
    return cfg


def save_config(data, user):
    base_url = (data.get("base_url") or "").strip() or DEFAULTS["base_url"]
    api_key = (data.get("api_key") or "").strip()
    model_id = (data.get("model_id") or "").strip() or DEFAULTS["model_id"]
    max_tokens = int(data.get("max_tokens") or DEFAULTS["max_tokens"])
    _ensure_row()
    if not api_key:
        existing = db.query_one("SELECT api_key FROM ai_config WHERE id=1")
        api_key = existing["api_key"] if existing else ""
    db.execute(
        "UPDATE ai_config SET base_url=?, api_key=?, model_id=?, max_tokens=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=1",
        (base_url, api_key, model_id, max_tokens, user["id"]),
    )
    return get_config()


def test_config(data):
    base_url = (data.get("base_url") or "").strip() or DEFAULTS["base_url"]
    api_key = (data.get("api_key") or "").strip()
    model_id = (data.get("model_id") or "").strip() or DEFAULTS["model_id"]
    max_tokens = int(data.get("max_tokens") or DEFAULTS["max_tokens"])
    if not api_key:
        return {"success": False, "latency_ms": 0, "reply": "", "message": "请先填写 API Key"}
    ok, latency, reply = llm.test_connection(base_url, api_key, model_id, max_tokens)
    return {
        "success": ok,
        "latency_ms": latency,
        "reply": reply if ok else "",
        "message": "连接成功" if ok else reply,
    }
