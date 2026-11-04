from flask import jsonify


def ok(data=None, message="ok"):
    return jsonify({
        "success": True,
        "message": message,
        "data": data,
        "errorCode": None,
        "traceId": None,
    })


def fail(message="error", error_code=None, status=200):
    return jsonify({
        "success": False,
        "message": message,
        "data": None,
        "errorCode": error_code,
        "traceId": None,
    }), status
