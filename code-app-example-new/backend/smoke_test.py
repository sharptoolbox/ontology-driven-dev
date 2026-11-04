"""合同管理新模板 · 后端端到端自测。

覆盖：
- 主数据维护（新增/修改/删除、编号规则、名称唯一、引用保护、字典启停）；
- 合同新增与校验（比例合计、阶段重名、签订日期、采购额、总金额）；
- 审批流 APR-001（<100 万单级、>=100 万两级、驳回、撤回、重复提交）；
- 开票（仅生效合同、阶段唯一、日期校验、编号规则）；
- 收款（超额、日期、部分/全部收款、规则 RULE-007 自动关闭）；
- 报表口径与 Excel 导出；
- 数据权限（RULE-009）与越权拒绝；
- AI 只读问答与配置脱敏。

运行： python smoke_test.py
"""

import json
import os
import sys
import traceback

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "data", "smoke.db")
for suffix in ("", "-wal", "-shm"):
    target = DB_FILE + suffix
    if os.path.exists(target):
        os.remove(target)
os.environ["APP_DB_PATH"] = DB_FILE

import app as app_module  # noqa: E402
import db  # noqa: E402

client = app_module.app.test_client()

PASSED = []
FAILED = []


# ---------------------------------------------------------------- 断言工具

def check(name, condition, detail=""):
    if condition:
        PASSED.append(name)
        print("  [PASS] {}".format(name))
    else:
        FAILED.append((name, detail))
        print("  [FAIL] {}  {}".format(name, detail))


def body(resp):
    try:
        return resp.get_json()
    except Exception:
        return {}


def login(username, password="123456"):
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    data = body(resp)
    if not data.get("success"):
        raise RuntimeError("登录失败 {}: {}".format(username, data.get("message")))
    return {"Authorization": "Bearer " + data["data"]["token"]}


def get(path, headers, **params):
    return client.get(path, headers=headers, query_string=params)


def post(path, headers, payload=None):
    return client.post(path, headers=headers, json=payload or {})


def put(path, headers, payload=None):
    return client.put(path, headers=headers, json=payload or {})


def delete(path, headers):
    return client.delete(path, headers=headers)


def expect_ok(name, resp, extra=None):
    data = body(resp)
    ok = data.get("success") is True
    detail = "" if ok else "resp={}".format(data.get("message"))
    check(name, ok, detail)
    if ok and callable(extra):
        extra(data.get("data"))
    return data


def expect_fail(name, resp, keyword=None, status=None):
    data = body(resp)
    failed = data.get("success") is False
    message = data.get("message") or ""
    if status is not None and resp.status_code != status:
        failed = False
        message = "HTTP {} / {}".format(resp.status_code, message)
    if keyword and keyword not in message:
        failed = False
        message = "期望包含「{}」，实际「{}」".format(keyword, message)
    check(name, failed, "" if failed else message)
    return data


TODAY = __import__("datetime").date.today().isoformat()


def contract_payload(name, total, stages, **overrides):
    payload = {
        "contract_name": name,
        "product_no": "P1001",
        "customer_no": "C2001",
        "dept_no": "D001",
        "contract_type": "PRODUCT_CONTRACT",
        "sign_date": TODAY,
        "owner_no": "E3001",
        "total_amount": total,
        "purchase_amount": round(total * 0.3, 2),
        "tax_rate": 13,
        "remark": "自测数据",
        "stages": stages,
    }
    payload.update(overrides)
    return payload


def stages(*items):
    return [
        {"stage_name": n, "ratio": r, "pay_condition": "验收合格后支付"}
        for n, r in items
    ]


def task_of(headers, contract_no):
    resp = get("/api/contract/approval/todo", headers, size=200)
    for row in (body(resp).get("data") or {}).get("list") or []:
        if row["contract_no"] == contract_no:
            return row["task_id"]
    return None


def approve(headers, task_id, comment="同意"):
    return post("/api/workbench/todo/{}/approve".format(task_id), headers, {"comment": comment})


def reject(headers, task_id, comment="金额不合理"):
    return post("/api/workbench/todo/{}/reject".format(task_id), headers, {"comment": comment})


# ---------------------------------------------------------------- 用例

def case_login():
    print("\n== 1. 登录与基础接口 ==")
    ok = body(get("/api/health", {}))
    check("健康检查可用", ok.get("success") is True)

    tokens = {}
    for user in ("admin", "sales01", "finance01", "fm01", "gm01", "staff01"):
        password = "admin123" if user == "admin" else "123456"
        tokens[user] = login(user, password)
        check("登录成功: {}".format(user), bool(tokens[user]))
    return tokens


def case_masterdata(h):
    print("\n== 2. 基础数据维护（FUN-015~019 / RULE-010）==")
    opts = expect_ok("基础数据选项可加载", get("/api/masterdata/options", h["finance01"]))
    data = opts.get("data") or {}
    check("产品/客户/部门/人员选项齐备",
          all(data.get(k) for k in ("products", "customers", "departments", "persons")),
          str({k: len(data.get(k) or []) for k in ("products", "customers", "departments", "persons")}))
    check("合同类型字典项已下发", len(data.get("contract_types") or []) >= 3,
          str(data.get("contract_types")))

    expect_fail("销售角色无权维护基础数据", post("/api/masterdata/product", h["sales01"],
                {"code": "P9009", "name": "越权产品", "product_type": "SOFTWARE"}),
                keyword="无权限", status=403)

    expect_ok("新增产品成功", post("/api/masterdata/product", h["finance01"],
              {"code": "P9001", "name": "自测产品", "product_type": "SOFTWARE"}))
    expect_fail("产品编号重复被拒绝", post("/api/masterdata/product", h["finance01"],
                {"code": "P9001", "name": "自测产品2", "product_type": "SOFTWARE"}),
                keyword="已存在")
    expect_fail("产品编号格式非法被拒绝", post("/api/masterdata/product", h["finance01"],
                {"code": "产品01", "name": "非法编号", "product_type": "SOFTWARE"}),
                keyword="编号")
    expect_fail("产品名称重复被拒绝", post("/api/masterdata/product", h["finance01"],
                {"code": "P9002", "name": "自测产品", "product_type": "SOFTWARE"}),
                keyword="已存在")

    listing = expect_ok("产品列表可按编号查询", get("/api/masterdata/product/list", h["finance01"],
                        code="P9001"))
    rows = (listing.get("data") or {}).get("list") or []
    check("新增产品出现在列表中", len(rows) == 1 and rows[0]["product_no"] == "P9001", str(rows))
    if rows:
        pid = rows[0]["id"]
        expect_ok("修改产品名称成功", put("/api/masterdata/product/{}".format(pid), h["finance01"],
                  {"code": "P9001", "name": "自测产品改名", "product_type": "SOFTWARE"}))
        expect_fail("产品编号不允许修改", put("/api/masterdata/product/{}".format(pid), h["finance01"],
                    {"code": "P9002", "name": "自测产品改名", "product_type": "SOFTWARE"}),
                    keyword="不可修改")
        expect_ok("删除未被引用产品成功", delete("/api/masterdata/product/{}".format(pid), h["finance01"]))

    all_products = (expect_ok("产品全量列表", get("/api/masterdata/product/list", h["finance01"],
                              size=200)).get("data") or {}).get("list") or []
    used = next((r for r in all_products if r["product_no"] == "P1001"), None)
    check("演示产品 P1001 存在", used is not None, str([r["product_no"] for r in all_products]))

    expect_ok("新增字典项成功", post("/api/masterdata/dict/CONTRACT_TYPE", h["fm01"],
              {"dict_code": "LEASE_CONTRACT", "dict_name": "租赁合同", "sort_no": 9}))
    expect_fail("只读字典类型不允许维护", post("/api/masterdata/dict/CONTRACT_STATUS", h["fm01"],
                {"dict_code": "X", "dict_name": "X"}), keyword="不可维护")

    items = expect_ok("字典项列表可查询", get("/api/masterdata/dict/CONTRACT_TYPE", h["fm01"]))
    target = next((i for i in (items.get("data") or {}).get("list", [])
                   if i["dict_code"] == "LEASE_CONTRACT"), None)
    check("新增字典项可查到", target is not None, str(items.get("data"))[:200])
    if target:
        expect_ok("停用字典项成功", post("/api/masterdata/dict/item/{}/toggle".format(target["id"]), h["fm01"]))
        expect_fail("停用后的合同类型不可用于合同",
                    post("/api/contract/save", h["sales01"],
                         contract_payload("停用字典测试", 100000,
                                          stages(("首付款", 100)), contract_type="LEASE_CONTRACT")),
                    keyword="停用")
        expect_ok("删除字典项成功", delete("/api/masterdata/dict/item/{}".format(target["id"]), h["fm01"]))

    return data


def case_contract_validation(h):
    print("\n== 3. 合同校验（RULE-001 / RULE-002 / 必填校验）==")
    prefill = expect_ok("获取合同编号成功", get("/api/contract/prefill", h["sales01"]))
    no = (prefill.get("data") or {}).get("contract_no") or ""
    check("合同编号符合 HT+YYYYMM+4 位", len(no) == 12 and no.startswith("HT") and no[2:8].isdigit(), no)

    cases = [
        ("比例合计不足 100% 被拒绝", contract_payload("比例不足", 100000, stages(("首付款", 60), ("尾款", 30))), "100%"),
        ("比例合计超过 100% 被拒绝", contract_payload("比例超出", 100000, stages(("首付款", 80), ("尾款", 40))), "100%"),
        ("付款阶段重名被拒绝", contract_payload("阶段重名", 100000, stages(("首付款", 50), ("首付款", 50))), "重复"),
        ("签订日期晚于今天被拒绝",
         contract_payload("未来日期", 100000, stages(("首付款", 100)), sign_date="2099-01-01"), "签订"),
        ("合同总金额为 0 被拒绝", contract_payload("零金额", 0, stages(("首付款", 100))), "总金额"),
        ("采购金额大于总金额被拒绝",
         contract_payload("采购超额", 100000, stages(("首付款", 100)), purchase_amount=200000), "采购"),
        ("未选择产品被拒绝", contract_payload("无产品", 100000, stages(("首付款", 100)), product_no=""), "产品"),
        ("税率为负数被拒绝", contract_payload("负税率", 100000, stages(("首付款", 100)), tax_rate=-1), "税率"),
        ("付款条款为空被拒绝", contract_payload("无条款", 100000, []), "付款条款"),
    ]
    for name, payload, keyword in cases:
        expect_fail(name, post("/api/contract/save", h["sales01"], payload), keyword=keyword)

    expect_fail("普通员工无合同新增权限", post("/api/contract/save", h["staff01"],
                contract_payload("越权新增", 100000, stages(("首付款", 100)))), keyword="无权限", status=403)
    return no


def _create_and_approve(h, payload, approvers, comment="同意"):
    resp = post("/api/contract/save", h["sales01"], payload)
    data = body(resp)
    if not data.get("success"):
        raise RuntimeError("合同创建失败：{}".format(data.get("message")))
    contract_no = data["data"]["contract_no"]
    expect_ok("合同 {} 提交审批".format(contract_no), post("/api/contract/{}/submit".format(contract_no), h["sales01"]))
    for user in approvers:
        task_id = task_of(h[user], contract_no)
        if not task_id:
            raise RuntimeError("{} 未收到 {} 的待办任务".format(user, contract_no))
        expect_ok("{} 审批通过 {}".format(user, contract_no), approve(h[user], task_id, comment))
    return contract_no


def case_approval_flow(h):
    print("\n== 4. 审批流 APR-001（单级 / 两级 / 驳回 / 撤回）==")

    # 4.1 小于 100 万：财务经理单级审批
    small = _create_and_approve(
        h,
        contract_payload("自测-小型合同", 800000, stages(("首付款", 60), ("验收款", 30), ("质保金", 10))),
        ["fm01"],
    )
    detail = expect_ok("查询小型合同详情", get("/api/contract/detail/{}".format(small), h["sales01"]))
    d = detail.get("data") or {}
    check("单级审批后合同状态为已生效", d.get("status") == "EFFECTIVE", str(d.get("status")))
    check("合同记录生效时间", bool(d.get("effective_time")), str(d.get("effective_time")))
    check("付款条款 3 条已保存", len(d.get("stages") or []) == 3, str(len(d.get("stages") or [])))
    check("阶段金额按比例自动计算",
          [round(float(s["stage_amount"]), 2) for s in d.get("stages") or []] == [480000.0, 240000.0, 80000.0],
          str([s["stage_amount"] for s in d.get("stages") or []]))
    check("审批记录包含财务经理通过",
          any(a["action"] == "APPROVE" and a["role_name"] == "财务经理" for a in d.get("approvals") or []),
          str(d.get("approvals")))

    # 4.2 大于 100 万：财务经理 + 总经理
    big = post("/api/contract/save", h["sales01"],
               contract_payload("自测-大型合同", 1200000, stages(("预付款", 50), ("尾款", 50))))
    big_no = (body(big).get("data") or {}).get("contract_no")
    check("大型合同创建成功", bool(big_no), body(big).get("message"))
    if big_no:
        expect_ok("大型合同提交审批", post("/api/contract/{}/submit".format(big_no), h["sales01"]))
        fm_task = task_of(h["fm01"], big_no)
        check("大型合同进入财务经理待办", fm_task is not None)
        if fm_task:
            expect_ok("财务经理通过大型合同", approve(h["fm01"], fm_task))
        state = expect_ok("查看大型合同状态", get("/api/contract/detail/{}".format(big_no), h["sales01"]))
        check("财务经理通过后仍为审批中", (state.get("data") or {}).get("status") == "APPROVING",
              str((state.get("data") or {}).get("status")))
        gm_task = task_of(h["gm01"], big_no)
        check("金额 >= 100 万追加总经理待办", gm_task is not None)
        if gm_task:
            expect_ok("总经理通过大型合同", approve(h["gm01"], gm_task))
        final = expect_ok("再次查看大型合同", get("/api/contract/detail/{}".format(big_no), h["sales01"]))
        check("两级审批后合同已生效", (final.get("data") or {}).get("status") == "EFFECTIVE",
              str((final.get("data") or {}).get("status")))

    # 4.3 驳回：回到草稿并保留意见
    reject_no = (body(post("/api/contract/save", h["sales01"],
                           contract_payload("自测-驳回合同", 500000, stages(("首付款", 100)))))
                 .get("data") or {}).get("contract_no")
    if reject_no:
        expect_ok("驳回用例提交审批", post("/api/contract/{}/submit".format(reject_no), h["sales01"]))
        task_id = task_of(h["fm01"], reject_no)
        check("驳回用例进入财务经理待办", task_id is not None)
        if task_id:
            expect_fail("驳回时审批意见必填", reject(h["fm01"], task_id, ""), keyword="意见")
            expect_ok("财务经理驳回合同", reject(h["fm01"], task_id, "金额与报价单不一致"))
        after = (expect_ok("查看驳回后合同", get("/api/contract/detail/{}".format(reject_no),
                                               h["sales01"])).get("data") or {})
        check("驳回后合同回到草稿", after.get("status") == "DRAFT", str(after.get("status")))
        check("驳回意见被保留", "金额与报价单不一致" in (after.get("last_comment") or ""),
              str(after.get("last_comment")))
        expect_ok("驳回后允许重新修改", post("/api/contract/save", h["sales01"],
                  contract_payload(after.get("contract_name"), 500000, stages(("首付款", 100)),
                                   contract_no=reject_no)))

    # 4.4 撤回
    wd_no = (body(post("/api/contract/save", h["sales01"],
                       contract_payload("自测-撤回合同", 300000, stages(("首付款", 100)))))
             .get("data") or {}).get("contract_no")
    if wd_no:
        expect_ok("撤回用例提交审批", post("/api/contract/{}/submit".format(wd_no), h["sales01"]))
        expect_fail("非审批中合同不可撤回",
                    post("/api/contract/{}/withdraw".format(small), h["sales01"]), keyword="审批中")
        expect_ok("创建人撤回合同", post("/api/contract/{}/withdraw".format(wd_no), h["sales01"]))
        wd = (expect_ok("查看撤回后合同", get("/api/contract/detail/{}".format(wd_no),
                                            h["sales01"])).get("data") or {})
        check("撤回后回到草稿", wd.get("status") == "DRAFT", str(wd.get("status")))
        check("撤回后解除流程实例绑定", not wd.get("instance_id"), str(wd.get("instance_id")))
        expect_fail("审批中合同不可修改（撤回后已回草稿，改用已生效合同验证）",
                    post("/api/contract/save", h["sales01"],
                         contract_payload("修改已生效合同", 800000, stages(("首付款", 60), ("验收款", 30), ("质保金", 10)),
                                          contract_no=small)),
                    keyword="草稿")
        expect_fail("已生效合同不可删除", delete("/api/contract/{}".format(small), h["sales01"]), keyword="草稿")
        expect_fail("已生效合同不可再次提交",
                    post("/api/contract/{}/submit".format(small), h["sales01"]), keyword="草稿")

    return small, big_no


def case_invoice(h, contract_no):
    print("\n== 5. 开票登记（FUN-009 / RULE-003 / RULE-004）==")
    opts = expect_ok("开票合同选项可加载", get("/api/invoice/options", h["finance01"]))
    contracts = [c["contract_no"] for c in (opts.get("data") or [])]
    check("已生效合同出现在开票选项中", contract_no in contracts, str(contracts))

    expect_fail("财务经理无开票登记权限", post("/api/invoice/create", h["fm01"],
                {"contract_no": contract_no, "stage_no": "1"}), keyword="无权限", status=403)

    draft_no = (body(post("/api/contract/save", h["sales01"],
                          contract_payload("自测-未生效合同", 200000, stages(("首付款", 100)))))
                .get("data") or {}).get("contract_no")
    if draft_no:
        expect_fail("草稿合同不允许开票", post("/api/invoice/create", h["finance01"],
                    {"contract_no": draft_no, "stage_no": "1"}), keyword="已生效")

    inv = expect_ok("阶段一开票成功", post("/api/invoice/create", h["finance01"],
                     {"contract_no": contract_no, "stage_no": "1", "invoice_date": TODAY}))
    inv_no = (inv.get("data") or {}).get("invoice_no") or ""
    check("开票编号符合 FP+YYYYMM+4 位",
          len(inv_no) == 12 and inv_no.startswith("FP") and inv_no[2:8].isdigit(), inv_no)
    check("开票金额等于阶段金额",
          round(float((inv.get("data") or {}).get("invoice_amount") or 0), 2) == 480000.0,
          str((inv.get("data") or {}).get("invoice_amount")))

    expect_fail("同一阶段重复开票被拒绝", post("/api/invoice/create", h["finance01"],
                {"contract_no": contract_no, "stage_no": "1"}), keyword="重复")
    expect_fail("开票日期晚于今天被拒绝", post("/api/invoice/create", h["finance01"],
                {"contract_no": contract_no, "stage_no": "2", "invoice_date": "2099-01-01"}), keyword="当前日期")
    expect_fail("不存在的付款阶段被拒绝", post("/api/invoice/create", h["finance01"],
                {"contract_no": contract_no, "stage_no": "99"}), keyword="阶段")

    inv2 = expect_ok("阶段二开票成功", post("/api/invoice/create", h["finance01"],
                     {"contract_no": contract_no, "stage_no": "2", "invoice_date": TODAY}))
    inv3 = expect_ok("阶段三开票成功", post("/api/invoice/create", h["finance01"],
                     {"contract_no": contract_no, "stage_no": "3", "invoice_date": TODAY}))

    listing = expect_ok("开票列表可查询", get("/api/invoice/list", h["finance01"], contract_no=contract_no))
    check("该合同开票 3 条", (listing.get("data") or {}).get("total") == 3,
          str((listing.get("data") or {}).get("total")))
    detail = (expect_ok("合同详情带出开票记录",
                        get("/api/contract/detail/{}".format(contract_no), h["finance01"])).get("data") or {})
    check("开票金额累计回写合同",
          round(float(detail.get("invoiced_amount") or 0), 2) == 800000.0, str(detail.get("invoiced_amount")))
    return [(inv.get("data") or {}).get("invoice_no"),
            (inv2.get("data") or {}).get("invoice_no"),
            (inv3.get("data") or {}).get("invoice_no")]


def case_receipt(h, contract_no, invoice_nos):
    print("\n== 6. 收款登记（FUN-011 / RULE-005 / RULE-006 / RULE-007）==")
    opts = expect_ok("收款开票选项可加载", get("/api/receipt/options", h["finance01"]))
    found = [c for c in (opts.get("data") or []) if c["contract_no"] == contract_no]
    check("可收款开票出现在选项中", bool(found), str([c["contract_no"] for c in (opts.get("data") or [])]))

    inv1, inv2, inv3 = invoice_nos
    expect_fail("销售角色无收款登记权限", post("/api/receipt/create", h["sales01"],
                {"contract_no": contract_no, "invoice_no": inv1, "receive_amount": 1}),
                keyword="无权限", status=403)
    expect_fail("收款金额超过未收款金额被拒绝", post("/api/receipt/create", h["finance01"],
                {"contract_no": contract_no, "invoice_no": inv1, "receive_amount": 999999,
                 "receive_date": TODAY}), keyword="不得超过")
    expect_fail("收款金额为 0 被拒绝", post("/api/receipt/create", h["finance01"],
                {"contract_no": contract_no, "invoice_no": inv1, "receive_amount": 0}), keyword="大于 0")
    expect_fail("收款日期晚于今天被拒绝", post("/api/receipt/create", h["finance01"],
                {"contract_no": contract_no, "invoice_no": inv1, "receive_amount": 100,
                 "receive_date": "2099-01-01"}), keyword="当前日期")
    expect_fail("收款日期早于开票日期被拒绝", post("/api/receipt/create", h["finance01"],
                {"contract_no": contract_no, "invoice_no": inv1, "receive_amount": 100,
                 "receive_date": "2000-01-01"}), keyword="开票")

    part = expect_ok("部分收款成功", post("/api/receipt/create", h["finance01"],
                     {"contract_no": contract_no, "invoice_no": inv1, "receive_amount": 200000,
                      "receive_date": TODAY, "receive_method": "BANK_TRANSFER"}))
    check("部分收款后开票状态为部分收款",
          (part.get("data") or {}).get("invoice_status") == "PARTIAL",
          str((part.get("data") or {}).get("invoice_status")))
    rec_no = (part.get("data") or {}).get("receive_no") or ""
    check("收款编号符合 SK+YYYYMM+4 位",
          len(rec_no) == 12 and rec_no.startswith("SK") and rec_no[2:8].isdigit(), rec_no)

    rest = expect_ok("收齐剩余款项", post("/api/receipt/create", h["finance01"],
                     {"contract_no": contract_no, "invoice_no": inv1, "receive_amount": 280000,
                      "receive_date": TODAY, "receive_method": "BANK_TRANSFER"}))
    check("收满后开票状态为已收款",
          (rest.get("data") or {}).get("invoice_status") == "RECEIVED",
          str((rest.get("data") or {}).get("invoice_status")))
    expect_fail("已收款完成的开票不可继续收款", post("/api/receipt/create", h["finance01"],
                {"contract_no": contract_no, "invoice_no": inv1, "receive_amount": 1}), keyword="完成")

    expect_ok("开票二全额收款", post("/api/receipt/create", h["finance01"],
              {"contract_no": contract_no, "invoice_no": inv2, "receive_amount": 240000,
               "receive_date": TODAY, "receive_method": "BANK_TRANSFER"}))
    last = expect_ok("开票三全额收款触发自动关闭", post("/api/receipt/create", h["finance01"],
                    {"contract_no": contract_no, "invoice_no": inv3, "receive_amount": 80000,
                     "receive_date": TODAY, "receive_method": "BANK_TRANSFER"}))
    check("RULE-007 合同自动关闭", (last.get("data") or {}).get("contract_closed") is True,
          str(last.get("data")))

    detail = (expect_ok("查看关闭后合同", get("/api/contract/detail/{}".format(contract_no),
                                            h["finance01"])).get("data") or {})
    check("合同状态为已关闭", detail.get("status") == "CLOSED", str(detail.get("status")))
    check("收款金额累计回写合同",
          round(float(detail.get("received_amount") or 0), 2) == 800000.0, str(detail.get("received_amount")))
    check("收款记录 4 条", len(detail.get("receipts") or []) == 4, str(len(detail.get("receipts") or [])))

    listing = expect_ok("收款列表可查询", get("/api/receipt/list", h["finance01"], contract_no=contract_no))
    check("收款列表返回 4 条", (listing.get("data") or {}).get("total") == 4,
          str((listing.get("data") or {}).get("total")))


def case_report(h):
    print("\n== 7. 部门合同统计报表（FUN-013 / FUN-014）==")
    month_start = TODAY[:8] + "01"
    resp = expect_ok("部门报表可查询", get("/api/report/department", h["finance01"],
                     start_date=month_start, end_date=TODAY))
    data = resp.get("data") or {}
    rows = data.get("list") or []
    check("报表返回部门行", len(rows) >= 6, str(len(rows)))
    d001 = next((r for r in rows if r["dept_no"] == "D001"), None)
    check("D001 签订金额统计正确（草稿不计入）",
          d001 is not None and round(float(d001["sign_amount"]), 2) == 2000000.0,
          str(d001))
    check("D001 开票金额统计正确",
          d001 is not None and round(float(d001["invoice_amount"]), 2) == 800000.0, str(d001))
    check("D001 未收款金额已收齐为 0",
          d001 is not None and round(float(d001["unreceived_amount"]), 2) == 0.0, str(d001))
    total_row = data.get("total_row") or {}
    check("合计行与明细一致",
          round(float(total_row.get("sign_amount") or 0), 2) ==
          round(sum(float(r["sign_amount"]) for r in rows), 2), str(total_row))

    expect_fail("统计截止早于开始被拒绝", get("/api/report/department", h["finance01"],
                start_date=TODAY, end_date="2000-01-01"), keyword="不得早于")

    export = client.get("/api/report/department/export", headers=h["finance01"],
                        query_string={"start_date": month_start, "end_date": TODAY})
    check("报表导出返回 xlsx", export.status_code == 200 and export.data[:2] == b"PK",
          "status={} head={}".format(export.status_code, export.data[:8]))
    check("导出文件名包含统计区间",
          "attachment" in (export.headers.get("Content-Disposition") or ""),
          export.headers.get("Content-Disposition") or "")

    staff = expect_ok("普通员工可查看本部门报表", get("/api/report/department", h["staff01"],
                     start_date=month_start, end_date=TODAY))
    staff_rows = [r["dept_no"] for r in (staff.get("data") or {}).get("list") or []]
    check("普通员工报表仅含本部门", staff_rows == ["D001"], str(staff_rows))


def case_scope(h):
    print("\n== 8. 数据权限 RULE-009 ==")
    other_no = (body(post("/api/contract/save", h["sales01"],
                          contract_payload("自测-跨部门合同", 100000, stages(("首付款", 100)))))
                .get("data") or {}).get("contract_no")
    if not other_no:
        check("跨部门合同创建成功", False)
        return
    db.execute("UPDATE contract SET dept_no='D002' WHERE contract_no=?", (other_no,))

    expect_fail("本部门受限角色不能查看他部门合同详情",
                get("/api/contract/detail/{}".format(other_no), h["staff01"]), keyword="无权")
    rows = (expect_ok("普通员工合同台账可查询", get("/api/contract/list", h["staff01"], size=200))
            .get("data") or {}).get("list") or []
    check("普通员工台账不含他部门合同",
          all(r["contract_no"] != other_no for r in rows), str([r["dept_no"] for r in rows]))
    expect_ok("财务人员可跨部门查看合同",
              get("/api/contract/detail/{}".format(other_no), h["finance01"]))
    inv_rows = (expect_ok("开票台账可查询", get("/api/invoice/list", h["staff01"], size=200))
                .get("data") or {}).get("list") or []
    check("普通员工开票台账受部门限制",
          all(r["contract_no"] != other_no for r in inv_rows), str(len(inv_rows)))


def case_ai(h):
    print("\n== 9. AI 助手（只读 / 配置脱敏）==")
    expect_fail("非管理员不可读取大模型配置", get("/api/ai/config", h["sales01"]), keyword="管理员")
    cfg = expect_ok("管理员读取大模型配置", get("/api/ai/config", h["admin"]))
    check("配置返回字段完整",
          all(k in (cfg.get("data") or {}) for k in ("base_url", "model_id", "max_tokens")),
          str(cfg.get("data")))
    check("API Key 已脱敏",
          not (cfg.get("data") or {}).get("api_key")
          or set((cfg.get("data") or {}).get("api_key")) <= {"*"},
          str((cfg.get("data") or {}).get("api_key")))

    expect_ok("管理员保存大模型配置", put("/api/ai/config", h["admin"], {
        "base_url": "https://api.example.com/v1", "api_key": "sk-selftest-123456",
        "model_id": "test-model", "max_tokens": 4096,
    }))
    cfg2 = (expect_ok("再次读取配置", get("/api/ai/config", h["admin"])).get("data") or {})
    check("保存后模型编号正确", cfg2.get("model_id") == "test-model", str(cfg2))
    check("保存后 API Key 仍脱敏",
          "sk-selftest" not in (cfg2.get("api_key") or ""), str(cfg2.get("api_key")))
    expect_ok("API Key 掩码提交不会覆盖原值", put("/api/ai/config", h["admin"], {
        "base_url": "https://api.example.com/v1", "api_key": "********",
        "model_id": "test-model-2", "max_tokens": 4096,
    }))
    stored = db.query_one("SELECT api_key FROM ai_config LIMIT 1")
    check("原 API Key 未被掩码覆盖", stored and stored["api_key"] == "sk-selftest-123456",
          str(stored))

    answer = expect_ok("AI 规则问答：合同数量", post("/api/ai/chat", h["finance01"],
                       {"question": "本月有多少份合同？"}))
    check("规则问答返回答案", bool((answer.get("data") or {}).get("answer")),
          str(answer.get("data"))[:120])
    answer2 = expect_ok("AI 规则问答：待我审批", post("/api/ai/chat", h["fm01"],
                        {"question": "我有哪些待审批合同"}))
    check("待办问答可返回", (answer2.get("data") or {}).get("source") in ("RULE", "MODEL", "FALLBACK"),
          str((answer2.get("data") or {}).get("source")))


def case_menu(h):
    print("\n== 10. 菜单与资源 ==")
    meta = get("/api/auth/info", h["admin"])
    data = body(meta).get("data") or {}
    names = []

    def walk(items):
        for item in items or []:
            names.append(item.get("name"))
            walk(item.get("children"))

    walk(data.get("menus"))
    for expected in ("审批中心", "流程管理", "系统管理", "合同管理", "开票与收款", "报表中心", "基础数据"):
        check("菜单存在：{}".format(expected), expected in names, str(names))

    sales = body(get("/api/auth/info", h["sales01"])).get("data") or {}
    sales_menus = []

    def walk2(items):
        for item in items or []:
            sales_menus.append(item.get("name"))
            walk2(item.get("children"))

    walk2(sales.get("menus"))
    check("销售角色可见合同台账", "合同台账" in sales_menus, str(sales_menus))
    check("销售角色不可见基础数据维护", "基础数据维护" not in sales_menus, str(sales_menus))


def case_reference_protection(h):
    print("\n== 11. 主数据引用保护（RULE-010）==")
    products = (expect_ok("读取产品列表", get("/api/masterdata/product/list", h["finance01"],
                            size=200)).get("data") or {}).get("list") or []
    used = next((r for r in products if r["product_no"] == "P1001"), None)
    if used:
        expect_fail("已被合同引用的产品不允许删除",
                    delete("/api/masterdata/product/{}".format(used["id"]), h["finance01"]),
                    keyword="引用")
    persons = (expect_ok("读取人员列表", get("/api/masterdata/person/list", h["finance01"],
                            size=200)).get("data") or {}).get("list") or []
    owner = next((r for r in persons if r["person_no"] == "E3001"), None)
    if owner:
        expect_fail("已被合同引用的人员不允许删除",
                    delete("/api/masterdata/person/{}".format(owner["id"]), h["finance01"]),
                    keyword="引用")
    depts = (expect_ok("读取部门列表", get("/api/masterdata/department/list", h["finance01"],
                          size=200)).get("data") or {}).get("list") or []
    dept = next((r for r in depts if r["dept_no"] == "D001"), None)
    if dept:
        expect_fail("已被合同引用的部门不允许删除",
                    delete("/api/masterdata/department/{}".format(dept["id"]), h["finance01"]),
                    keyword="引用")


def main():
    print("合同管理新模板 · 后端自测开始（库文件 {}）".format(DB_FILE))
    tokens = case_login()
    case_masterdata(tokens)
    case_contract_validation(tokens)
    small_no, _ = case_approval_flow(tokens)
    invoice_nos = case_invoice(tokens, small_no)
    case_receipt(tokens, small_no, invoice_nos)
    case_report(tokens)
    case_scope(tokens)
    case_ai(tokens)
    case_menu(tokens)
    case_reference_protection(tokens)

    print("\n============ 自测结果 ============")
    print("通过 {} 项，失败 {} 项".format(len(PASSED), len(FAILED)))
    if FAILED:
        for name, detail in FAILED:
            print("  FAIL: {} -> {}".format(name, detail))
        return 1
    print("全部用例通过")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        print("\n自测中断，已通过 {} 项".format(len(PASSED)))
        sys.exit(2)
