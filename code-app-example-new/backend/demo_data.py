"""可选演示数据脚本。

用途：在已完成初始化的数据库上生成一批演示用的合同 / 开票 / 收款记录，
      让「合同台账 / 合同审批 / 开票收款 / 部门合同统计」首次打开即有内容可看。

特点：
- 全部通过真实 HTTP 接口（Flask test_client）走一遍业务规则，不直接写库、不绕过任何校验；
- 用不同账号创建不同部门的合同，可顺带验证数据权限（sales01 只看到本部门）；
- 幂等：按合同名称判断，已存在则跳过，可重复执行。

执行：
    cd backend
    python demo_data.py            # 生成演示数据
    python demo_data.py --reset    # 先清理演示合同再重建
"""

import sys

from app import app
import db

DEMO_TAG = "【演示数据】"

# actor 决定用哪个账号创建（进而决定 created_by 与可见范围）：
#   sales01 = 张伟（D001 销售一部）
#   admin   = 管理员（可见全部，用于造其它部门的合同）
DEMO_CONTRACTS = [
    {
        "actor": "sales01",
        "contract_name": "华东区域智能终端采购合同",
        "product_no": "P1002",
        "customer_no": "C2002",
        "owner_no": "E3001",
        "dept_no": "D001",
        "contract_type": "PRODUCT_CONTRACT",
        "sign_date": "2026-11-02",
        "total_amount": 1200000,
        "purchase_amount": 820000,
        "tax_rate": 13,
        "stages": [
            {"stage_name": "预付款", "ratio": 30, "pay_condition": "合同生效后 10 个工作日内支付"},
            {"stage_name": "到货款", "ratio": 50, "pay_condition": "设备到货验收合格后支付"},
            {"stage_name": "质保金", "ratio": 20, "pay_condition": "质保期满 12 个月无质量问题支付"},
        ],
        "flow": "effective",
        "invoices": [0, 1],
        "receipts": [(0, 200000, "2026-11-02", "BANK_TRANSFER")],
    },
    {
        "actor": "sales01",
        "contract_name": "华南区域运维服务合同",
        "product_no": "P1003",
        "customer_no": "C2003",
        "owner_no": "E3001",
        "dept_no": "D001",
        "contract_type": "SERVICE_CONTRACT",
        "sign_date": "2026-11-02",
        "total_amount": 800000,
        "purchase_amount": 300000,
        "tax_rate": 6,
        "stages": [
            {"stage_name": "首期服务费", "ratio": 50, "pay_condition": "服务启动后 15 日内支付"},
            {"stage_name": "尾款", "ratio": 50, "pay_condition": "服务期满验收合格后支付"},
        ],
        "flow": "effective",
        "invoices": [0],
        "receipts": [(0, 400000, "2026-11-02", "BANK_TRANSFER")],
    },
    {
        "actor": "sales01",
        "contract_name": "集团总部设备更新合同",
        "product_no": "P1002",
        "customer_no": "C2001",
        "owner_no": "E3001",
        "dept_no": "D001",
        "contract_type": "PRODUCT_CONTRACT",
        "sign_date": "2026-11-02",
        "total_amount": 450000,
        "purchase_amount": 260000,
        "tax_rate": 13,
        "stages": [
            {"stage_name": "预付款", "ratio": 30, "pay_condition": "合同生效后 10 个工作日内支付"},
            {"stage_name": "尾款", "ratio": 70, "pay_condition": "验收合格后支付"},
        ],
        "flow": "draft",
        "invoices": [],
        "receipts": [],
    },
    {
        "actor": "admin",
        "contract_name": "北方区域备件供应框架合同",
        "product_no": "P1001",
        "customer_no": "C2001",
        "owner_no": "E3002",
        "dept_no": "D002",
        "contract_type": "PRODUCT_CONTRACT",
        "sign_date": "2026-11-02",
        "total_amount": 1500000,
        "purchase_amount": 980000,
        "tax_rate": 13,
        "stages": [
            {"stage_name": "预付款", "ratio": 40, "pay_condition": "合同生效后 10 个工作日内支付"},
            {"stage_name": "验收款", "ratio": 60, "pay_condition": "全部备件验收合格后支付"},
        ],
        "flow": "approving",
        "invoices": [],
        "receipts": [],
    },
    {
        "actor": "admin",
        "contract_name": "西南区域渠道合作协议",
        "product_no": "P1004",
        "customer_no": "C2004",
        "owner_no": "E3003",
        "dept_no": "D003",
        "contract_type": "PRODUCT_CONTRACT",
        "sign_date": "2026-11-02",
        "total_amount": 600000,
        "purchase_amount": 380000,
        "tax_rate": 6,
        "stages": [
            {"stage_name": "签约款", "ratio": 100, "pay_condition": "合同签订后 30 日内一次性支付"},
        ],
        "flow": "rejected",
        "invoices": [],
        "receipts": [],
    },
]

DEMO_NAMES = {item["contract_name"] for item in DEMO_CONTRACTS}
ACCOUNTS = {
    "admin": "admin123",
    "sales01": "123456",
    "finance01": "123456",
    "fm01": "123456",
    "gm01": "123456",
}
TOKENS = {}


def login(username):
    if username in TOKENS:
        return TOKENS[username]
    res = app.test_client().post(
        "/api/auth/login", json={"username": username, "password": ACCOUNTS[username]}
    )
    body = res.get_json() or {}
    if not body.get("success"):
        raise SystemExit("登录失败[{}]：{}".format(username, body.get("message")))
    TOKENS[username] = body["data"]["token"]
    return TOKENS[username]


def call(method, path, username, payload=None):
    client = app.test_client()
    res = getattr(client, method)(path, json=payload, headers={"Authorization": "Bearer " + login(username)})
    body = res.get_json()
    if body is None:
        raise SystemExit("{} {} 返回非 JSON，HTTP {}".format(method.upper(), path, res.status_code))
    if not body.get("success"):
        raise SystemExit(
            "{} {} 失败：{}（{}）".format(method.upper(), path, body.get("message"), body.get("errorCode"))
        )
    return body["data"], body.get("message")


def find_task(username, contract_no):
    data, _ = call("get", "/api/workbench/todo?page=1&size=100", username)
    for row in data["list"]:
        if row.get("business_key") == contract_no:
            return row
    return None


def advance_approval(contract_no, actor, stop_before_gm):
    call("post", "/api/contract/{}/submit".format(contract_no), actor)

    task = find_task("fm01", contract_no)
    if not task:
        raise SystemExit("财务经理待办中未找到 {}".format(contract_no))
    call(
        "post",
        "/api/workbench/todo/{}/approve".format(task["id"]),
        "fm01",
        {"comment": "金额与付款条款复核无误，同意。"},
    )

    if stop_before_gm:
        return

    task = find_task("gm01", contract_no)
    if task:
        call("post", "/api/workbench/todo/{}/approve".format(task["id"]), "gm01", {"comment": "同意，按合同执行。"})


def reject_once(contract_no, actor):
    call("post", "/api/contract/{}/submit".format(contract_no), actor)
    task = find_task("fm01", contract_no)
    if not task:
        raise SystemExit("财务经理待办中未找到 {}".format(contract_no))
    call(
        "post",
        "/api/workbench/todo/{}/reject".format(task["id"]),
        "fm01",
        {"comment": "付款比例与主合同约定不一致，请修改后重新提交。"},
    )


def reset_demo():
    """仅清理本脚本生成的演示合同及其关联数据。

    已生效合同按业务规则不允许删除，因此 --reset 走脚本自身的清理通道，
    直接按外键顺序移除演示数据；只处理名称命中 DEMO_NAMES 的记录。
    """
    data, _ = call("get", "/api/contract/list?page=1&size=200", "admin")
    targets = [row["contract_no"] for row in data["list"] if row["contract_name"] in DEMO_NAMES]
    if not targets:
        return 0

    def _do(conn):
        for contract_no in targets:
            contract = db.query_one(
                "SELECT id FROM contract WHERE contract_no=? AND flag=1", (contract_no,), conn
            )
            if not contract:
                continue
            contract_id = contract["id"]
            db.execute("DELETE FROM contract_receipt WHERE contract_no=?", (contract_no,), conn)
            db.execute("DELETE FROM contract_invoice WHERE contract_no=?", (contract_no,), conn)
            db.execute("DELETE FROM contract_stage WHERE contract_id=?", (contract_id,), conn)
            db.execute("DELETE FROM contract WHERE id=?", (contract_id,), conn)
            instances = db.query(
                "SELECT id FROM flow_instance WHERE business_key=?", (contract_no,), conn
            )
            for instance in instances:
                db.execute("DELETE FROM flow_task WHERE instance_id=?", (instance["id"],), conn)
                db.execute("DELETE FROM flow_history WHERE instance_id=?", (instance["id"],), conn)
                db.execute("DELETE FROM flow_instance WHERE id=?", (instance["id"],), conn)

    db.transaction(_do)
    return len(targets)


def main():
    if "--reset" in sys.argv:
        print("清理旧演示合同：{} 条".format(reset_demo()))

    existing, _ = call("get", "/api/contract/list?page=1&size=200", "admin")
    already = {row["contract_name"] for row in existing["list"]}
    created = 0

    for spec in DEMO_CONTRACTS:
        if spec["contract_name"] in already:
            print("跳过（已存在）：{}".format(spec["contract_name"]))
            continue

        actor = spec["actor"]
        payload = {
            "contract_name": spec["contract_name"],
            "product_no": spec["product_no"],
            "customer_no": spec["customer_no"],
            "owner_no": spec["owner_no"],
            "dept_no": spec["dept_no"],
            "contract_type": spec["contract_type"],
            "sign_date": spec["sign_date"],
            "total_amount": spec["total_amount"],
            "purchase_amount": spec["purchase_amount"],
            "tax_rate": spec["tax_rate"],
            "remark": DEMO_TAG + "用于演示台账、审批、开票收款与部门统计。",
            "stages": spec["stages"],
        }
        saved, _ = call("post", "/api/contract/save", actor, payload)
        contract_no = saved["contract_no"]
        created += 1

        if spec["flow"] == "effective":
            advance_approval(contract_no, actor, stop_before_gm=False)
            detail, _ = call("get", "/api/contract/detail/{}".format(contract_no), actor)
            stages = detail["stages"]
            invoice_nos = []
            for index in spec["invoices"]:
                stage = stages[index]
                inv, _ = call(
                    "post",
                    "/api/invoice/create",
                    "finance01",
                    {
                        "contract_no": contract_no,
                        "stage_no": stage["stage_no"],
                        "tax_rate": spec["tax_rate"],
                        "invoice_date": "2026-11-02",
                        "remark": DEMO_TAG + "按付款阶段开票。",
                    },
                )
                invoice_nos.append(inv["invoice_no"])
            for idx, amount, receive_date, method in spec["receipts"]:
                call(
                    "post",
                    "/api/receipt/create",
                    "finance01",
                    {
                        "contract_no": contract_no,
                        "invoice_no": invoice_nos[idx],
                        "receive_amount": amount,
                        "receive_date": receive_date,
                        "receive_method": method,
                        "remark": DEMO_TAG + "首笔到账。",
                    },
                )
        elif spec["flow"] == "approving":
            advance_approval(contract_no, actor, stop_before_gm=True)
        elif spec["flow"] == "rejected":
            reject_once(contract_no, actor)

        print("已生成：{} {}（{}，{}）".format(contract_no, spec["contract_name"], spec["dept_no"], spec["flow"]))

    print("\n演示数据完成：新增 {} 份合同。".format(created))
    print("提示：sales01 密码 123456，登录后只能看到销售一部（D001）的合同；admin / admin123 可看全部。")


if __name__ == "__main__":
    main()
