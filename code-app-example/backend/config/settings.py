import os

import yaml
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

_config = None


def load_config():
    global _config
    if _config is not None:
        return _config
    path = os.path.join(BASE_DIR, "config.yaml")
    with open(path, "r", encoding="utf-8") as f:
        _config = yaml.safe_load(f)
    return _config


def get(key, default=None):
    cfg = load_config()
    cur = cfg
    for k in key.split("."):
        if isinstance(cur, dict) and k in cur:
            cur = cur[k]
        else:
            return default
    return cur


def resolve_db_path():
    # 支持环境变量覆盖数据库路径（自测用临时库，避免污染真实 data/app.db）
    env_path = os.environ.get("APP_DB_PATH")
    if env_path:
        if not os.path.isabs(env_path):
            env_path = os.path.join(BASE_DIR, env_path)
        os.makedirs(os.path.dirname(env_path), exist_ok=True)
        return env_path
    db_rel = get("app.database", "data/app.db")
    if not os.path.isabs(db_rel):
        db_rel = os.path.join(BASE_DIR, db_rel)
    os.makedirs(os.path.dirname(db_rel), exist_ok=True)
    return db_rel


def resolve_models_dir():
    return os.path.join(os.path.dirname(BASE_DIR), "models")
