"""AI 智能助理（只读）。

安全边界：
- 仅提供只读查询与业务说明，不执行任何写操作；
- 所有数据查询复用业务服务的权限过滤（RULE-009），不越过数据边界；
- 大模型连接信息持久化在 ai_config，接口返回时对 API Key 脱敏。
"""

import datetime
import json
import re
import urllib.error
import urllib.request

import db
from services import auth_service, contract_service, invoice_service, report_service, scope_service
from utils.rules import money


def _mask(key):
    if not key:
        return ""
    if len(key) <= 8:
        return "*" * len(key)
    return key[:4] + "*" * (len(key) - 8) + key[-4:]


def get_config():
    row = db.query_one("SELECT * FROM ai_config ORDER BY id LIMIT 1")
    if not row:
        return {"base_url": "", "api_key": "", "model_id": "", "max_tokens": 81920, "configured": False}
    return {
        "base_url": row["base_url"] or "",
        "api_key": _mask(row["api_key"]),
        "model_id": row["model_id"] or "",
        "max_tokens": row["max_tokens"] or 81920,
        "configured": bool(row["base_url"] and row["api_key"] and row["model_id"]),
    }


def _raw_config():
    return db.query_one("SELECT * FROM ai_config ORDER BY id LIMIT 1")


def save_config(user_id, payload):
    base_url = (payload.get("base_url") or "").strip().rstrip("/")
    model_id = (payload.get("model_id") or "").strip()
    api_key = (payload.get("api_key") or "").strip()
    try:
        max_tokens = int(payload.get("max_tokens") or 81920)
    except (TypeError, ValueError):
        max_tokens = 81920

    existing = _raw_config()
    if existing and (not api_key or set(api_key) <= {"*"}):
        api_key = existing["api_key"]

    if not base_url:
        raise ValueError("请填写 Base URL")
    if not model_id:
        raise ValueError("请填写模型 ID")
    if not api_key:
        raise ValueError("请填写 API Key")

    if existing:
        db.execute(
            "UPDATE ai_config SET base_url=?, api_key=?, model_id=?, max_tokens=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (base_url, api_key, model_id, max_tokens, user_id, existing["id"]),
        )
    else:
        db.execute(
            "INSERT INTO ai_config (base_url, api_key, model_id, max_tokens, updated_by) VALUES (?, ?, ?, ?, ?)",
            (base_url, api_key, model_id, max_tokens, user_id),
        )
    return get_config()


def _chat_completion(messages, timeout=30):
    config = _raw_config()
    if not config:
        raise ValueError("尚未配置大模型")
    url = "{}/chat/completions".format((config["base_url"] or "").rstrip("/"))
    body = json.dumps({
        "model": config["model_id"],
        "messages": messages,
        "max_tokens": min(int(config["max_tokens"] or 81920), 2048),
        "stream": False,
    }).encode("utf-8")
    request_ = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer {}".format(config["api_key"]),
        },
        method="POST",
    )
    with urllib.request.urlopen(request_, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return payload["choices"][0]["message"]["content"]


def test_connection():
    started = datetime.datetime.now()
    try:
        reply = _chat_completion([{"role": "user", "content": "你好，请回复：连接成功"}], timeout=20)
    except urllib.error.HTTPError as e:
        raise ValueError("连接失败：HTTP {} {}".format(e.code, e.reason))
    except urllib.error.URLError as e:
        raise ValueError("连接失败：{}".format(e.reason))
    except KeyError:
        raise ValueError("连接失败：返回格式不符合 OpenAI 兼容协议")
    elapsed = int((datetime.datetime.now() - started).total_seconds() * 1000)
    return {"elapsed_ms": elapsed, "reply": (reply or "").strip()[:200]}


# ---------------------------------------------------------------- 只读问答

def _kpis(ctx):
    scope_sql, scope_values = scope_service.contract_scope_clause(ctx, "c")
    today = datetime.date.today()
    month_start = today.replace(day=1).isoformat()
    month_end = today.isoformat()
    signed = db.query_one(
        """
        SELECT COALESCE(SUM(c.total_amount),0) AS s FROM contract c
        WHERE c.flag=1 AND c.sign_date BETWEEN ? AND ?
          AND c.status IN ('APPROVING','EFFECTIVE','CLOSED') AND {}
        """.format(scope_sql),
        [month_start, month_end] + scope_values,
    )["s"]
    invoiced = db.query_one(
        """
        SELECT COALESCE(SUM(i.invoice_amount),0) AS s
        FROM contract_invoice i JOIN contract c ON c.contract_no=i.contract_no AND c.flag=1
        WHERE i.flag=1 AND i.invoice_date BETWEEN ? AND ? AND {}
        """.format(scope_sql),
        [month_start, month_end] + scope_values,
    )["s"]
    return [
        {"label": "本月合同签订额", "value": "¥{:,.2f}".format(money(signed))},
        {"label": "本月开票额", "value": "¥{:,.2f}".format(money(invoiced))},
    ]


def _table(columns, rows):
    return {"columns": columns, "rows": rows}


def _find_contract_no(text):
    match = re.search(r"HT\d{6,}", text.upper())
    return match.group(0) if match else None


def answer(ctx, question):
    question = (question or "").strip()
    if not question:
        raise ValueError("请输入问题")

    reply = rule_answer(ctx, question)
    if reply:
        reply.setdefault("source", "RULE")
        return reply

    config = _raw_config()
    if config and config["base_url"] and config["api_key"]:
        try:
            text = _chat_completion([
                {"role": "system", "content": _system_prompt()},
                {"role": "user", "content": question},
            ])
            return {"answer": text.strip(), "kpis": [], "table": None, "source": "MODEL"}
        except Exception:
            pass

    return {
        "answer": "我目前可以回答：待我审批的合同、未收款开票明细、本月合同签订额与开票额、"
                  "部门合同统计、合同状态分布、指定合同编号的收款情况。请在右侧对话框输入其中一类问题，"
                  "或前往对应业务页面查看完整数据。",
        "kpis": _kpis(ctx),
        "table": None,
        "source": "FALLBACK",
    }


def rule_answer(ctx, question):
    text = question.replace(" ", "")

    contract_no = _find_contract_no(text)
    if contract_no:
        try:
            contract = contract_service.get_contract(ctx, contract_no)
        except ValueError as e:
            return {"answer": str(e), "kpis": [], "table": None}
        return {
            "answer": "合同 **{}** {}，状态「{}」，合同总金额 ¥{:,.2f}，累计开票 ¥{:,.2f}，累计收款 ¥{:,.2f}，"
                      "未收款 ¥{:,.2f}。".format(
                          contract["contract_no"], contract["contract_name"], contract["status_label"],
                          money(contract["total_amount"]), money(contract["invoiced_amount"]),
                          money(contract["received_amount"]),
                          max(0.0, money(contract["invoiced_amount"] - contract["received_amount"])),
                      ),
            "kpis": [],
            "table": None,
        }

    if "待我审批" in text or "待审批" in text or "待办" in text:
        data = contract_service.approval_tasks(ctx, "todo", {"page": 1, "size": 10})
        rows = [
            [r["contract_no"], r["contract_name"], r["activity_name"], "¥{:,.2f}".format(money(r["total_amount"]))]
            for r in data["list"]
        ]
        return {
            "answer": "当前有 {} 条待您审批的合同。".format(data["total"]) if data["total"]
                      else "当前没有待您审批的合同。",
            "kpis": [],
            "table": _table(["合同编号", "合同名称", "当前环节", "合同总金额"], rows) if rows else None,
        }

    if "未收款" in text or "未收齐" in text or "回款" in text:
        scope_sql, scope_values = scope_service.contract_scope_clause(ctx, "c")
        rows = db.query(
            """
            SELECT i.invoice_no, i.contract_no, c.contract_name, i.invoice_amount,
                   i.received_amount, i.unreceived_amount
            FROM contract_invoice i
            JOIN contract c ON c.contract_no = i.contract_no AND c.flag=1
            WHERE i.flag=1 AND i.receive_status IN ('UNRECEIVED','PARTIAL') AND {}
            ORDER BY i.unreceived_amount DESC LIMIT 20
            """.format(scope_sql),
            scope_values,
        )
        total = money(sum(float(r["unreceived_amount"]) for r in rows))
        return {
            "answer": "当前有 {} 张开票未收齐，未收款合计 ¥{:,.2f}，可前往「合同收款」登记收款。".format(
                len(rows), total
            ) if rows else "当前没有未收款的开票。",
            "kpis": [],
            "table": _table(
                ["开票编号", "合同编号", "合同名称", "开票金额", "已收款", "未收款"],
                [
                    [r["invoice_no"], r["contract_no"], r["contract_name"],
                     "¥{:,.2f}".format(money(r["invoice_amount"])),
                     "¥{:,.2f}".format(money(r["received_amount"])),
                     "¥{:,.2f}".format(money(r["unreceived_amount"]))]
                    for r in rows
                ],
            ) if rows else None,
        }

    if "部门" in text or "统计" in text:
        today = datetime.date.today()
        data = report_service.query(ctx, {
            "start_date": today.replace(day=1).isoformat(),
            "end_date": today.isoformat(),
        })
        return {
            "answer": "本月（{} ~ {}）部门合同统计如下，合同签订总金额 ¥{:,.2f}，开票总金额 ¥{:,.2f}，"
                      "已开票未收款 ¥{:,.2f}。".format(
                          data["criteria"]["start_date"], data["criteria"]["end_date"],
                          data["total_row"]["sign_amount"], data["total_row"]["invoice_amount"],
                          data["total_row"]["unreceived_amount"],
                      ),
            "kpis": [],
            "table": _table(
                ["部门编号", "部门名称", "合同签订总金额", "开票总金额", "已开票未收款"],
                [
                    [r["dept_no"], r["dept_name"], "¥{:,.2f}".format(r["sign_amount"]),
                     "¥{:,.2f}".format(r["invoice_amount"]), "¥{:,.2f}".format(r["unreceived_amount"])]
                    for r in data["list"]
                ],
            ),
        }

    if "状态" in text or "分布" in text:
        scope_sql, scope_values = scope_service.contract_scope_clause(ctx, "c")
        rows = db.query(
            "SELECT c.status, COUNT(*) AS c, COALESCE(SUM(c.total_amount),0) AS s FROM contract c "
            "WHERE c.flag=1 AND {} GROUP BY c.status".format(scope_sql),
            scope_values,
        )
        return {
            "answer": "合同状态分布如下。",
            "kpis": [],
            "table": _table(
                ["合同状态", "合同数量", "合同总金额"],
                [[contract_service.STATUS_LABELS.get(r["status"], r["status"]), r["c"],
                  "¥{:,.2f}".format(money(r["s"]))] for r in rows],
            ),
        }

    if "签订" in text or "签约" in text or "开票额" in text or "本月" in text:
        kpis = _kpis(ctx)
        return {
            "answer": "{}：{}；{}：{}。".format(
                kpis[0]["label"], kpis[0]["value"], kpis[1]["label"], kpis[1]["value"]
            ),
            "kpis": kpis,
            "table": None,
        }

    return None


def _system_prompt():
    return (
        "你是合同全生命周期管理系统的只读业务助理。你可以解释合同签订、审批、开票、收款、"
        "自动关闭的业务规则，并基于以下事实回答：合同状态为草稿/审批中/已生效/已关闭；"
        "付款条款比例合计必须为 100%；开票按付款阶段全额开具且一个阶段仅一张；"
        "收款不超过开票未收款金额；全部开票收齐后合同自动关闭。"
        "你只能提供只读分析与说明，不得执行新增、修改、删除、提交或审批操作；"
        "涉及写操作时请引导用户到固定业务页面完成。回答使用简体中文，金额保留两位小数。"
    )
