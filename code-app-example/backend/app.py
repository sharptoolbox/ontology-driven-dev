import os

from flask import Flask, jsonify, send_from_directory

import db
from config import settings
from utils.response import fail

FRONTEND_DIST = os.path.join(os.path.dirname(settings.BASE_DIR), "frontend", "dist")


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = settings.get("app.secret_key", "secret")
    app.config["JSON_AS_ASCII"] = False

    db.init_db_path(settings.resolve_db_path())

    from ontology import registry
    registry.load_ontology()

    _init_db()

    _register_blueprints(app)
    _register_error_handlers(app)
    _register_cors(app)
    return app


def _init_db():
    conn = db.connect()
    try:
        schema_path = os.path.join(settings.BASE_DIR, "schema.sql")
        with open(schema_path, "r", encoding="utf-8") as f:
            conn.executescript(f.read())
        conn.commit()
        from seed import ensure_seed
        ensure_seed(conn)
        conn.commit()
    finally:
        conn.close()


def _register_blueprints(app):
    from api import (ai, auth, contract, flow, invoice, master_data, meta, permissions, receipt,
                     report, resources, roles, users, workbench)
    app.register_blueprint(auth.bp)
    app.register_blueprint(meta.bp)
    app.register_blueprint(users.bp)
    app.register_blueprint(roles.bp)
    app.register_blueprint(permissions.bp)
    app.register_blueprint(resources.bp)
    app.register_blueprint(flow.bp)
    app.register_blueprint(workbench.bp)
    app.register_blueprint(master_data.bp)
    app.register_blueprint(contract.bp)
    app.register_blueprint(invoice.bp)
    app.register_blueprint(receipt.bp)
    app.register_blueprint(report.bp)
    app.register_blueprint(ai.bp)


def _register_error_handlers(app):
    @app.errorhandler(ValueError)
    def handle_value_error(e):
        return fail(str(e), "BUSINESS_ERROR")

    @app.errorhandler(404)
    def handle_404(e):
        return fail("接口不存在", "NOT_FOUND", 404)

    @app.errorhandler(Exception)
    def handle_exception(e):
        app.logger.exception("unhandled error")
        return fail("服务器内部错误", "INTERNAL_ERROR", 500)


def _register_cors(app):
    @app.after_request
    def cors(resp):
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        return resp


app = create_app()


@app.route("/api/health")
def health():
    return jsonify({"success": True, "message": "ok", "data": {"name": settings.get("app.name")}})


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if not os.path.exists(FRONTEND_DIST):
        return jsonify({"success": False, "message": "前端未构建，请先执行 npm run build"}), 404
    target = os.path.join(FRONTEND_DIST, path) if path else None
    if path and os.path.isfile(target):
        return send_from_directory(FRONTEND_DIST, path)
    return send_from_directory(FRONTEND_DIST, "index.html")


if __name__ == "__main__":
    app.run(
        host=settings.get("app.host", "0.0.0.0"),
        port=int(settings.get("app.port", 5000)),
        debug=True,
    )
