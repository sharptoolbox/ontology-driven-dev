import sqlite3

_db_path = None


def init_db_path(path):
    global _db_path
    _db_path = path


def connect():
    conn = sqlite3.connect(_db_path or ":memory:", timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def query(sql, params=(), conn=None):
    own = conn is None
    if own:
        conn = connect()
    try:
        cur = conn.execute(sql, params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        if own:
            conn.close()


def query_one(sql, params=(), conn=None):
    rows = query(sql, params, conn)
    return rows[0] if rows else None


def execute(sql, params=(), conn=None):
    own = conn is None
    if own:
        conn = connect()
    try:
        cur = conn.execute(sql, params)
        if own:
            conn.commit()
        return cur.lastrowid, cur.rowcount
    finally:
        if own:
            conn.close()


def transaction(fn):
    conn = connect()
    try:
        result = fn(conn)
        conn.commit()
        return result
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
