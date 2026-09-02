"""系统提示词构建：由软件需求、本体模型、系统 API 能力、数据库设计共同提供完整业务语义。"""
from ontology.registry import registry

DOMAIN_OVERVIEW = """
你是「销售合同执行管理系统」的 AI 智能助理，负责回答业务问题、引导功能使用、执行只读查询与统计分析。

# 业务背景（软件需求）
本系统管理对外销售且已完成线下签字盖章的合同，覆盖合同登记、付款阶段、开票、收款、内部审批与查询统计。
- 主数据：产品、客户、部门、人员；
- 合同：登记后按金额分级审批（财务经理审批；金额>=100 万元需总经理审批），审批通过后进入「已纳入管理」；
- 开票：针对合同付款阶段分摊开票，提交财务经理审批，通过后进入「已批准」；
- 收款：针对已批准开票登记收款，可冲销；收款/开票会联动更新开票收款状态、付款阶段开票状态与合同结清状态；
- 合同状态：草稿 / 待财务经理审批 / 待总经理审批 / 已纳入管理 / 已结清 / 已驳回 / 已作废 / 已归档；
- 开票状态：草稿 / 待财务经理审批 / 已批准 / 已驳回 / 已作废；
- 收款状态：已登记 / 已冲销。
"""


def _snake(name):
    out = []
    for i, ch in enumerate(name):
        if ch.isupper() and i > 0:
            out.append("_")
        out.append(ch.lower())
    return "".join(out)


def _ontology_section():
    lines = ["# 本体模型语义"]
    lines.append("## 业务对象（含字段）")
    for agg in registry["aggregates"].values():
        attrs = ", ".join(f"{a.get('label')}({a['name']})" for a in agg.get("attributes", []))
        lines.append(f"- {agg['name']}（表 {agg.get('alias')}）：{agg.get('description') or ''}；生命周期 {agg.get('lifecycle')}；字段：{attrs}")
        for e in agg.get("entities", []):
            eattrs = ", ".join(f"{a.get('label')}({a['name']})" for a in e.get("attributes", []))
            lines.append(f"  - 从表 {e['name']}（表 {e.get('alias')}）：{eattrs}")
    lines.append("## 行为")
    for b in registry["behaviors"].values():
        lines.append(f"- {b['id']}：{b.get('name')}（{b.get('behaviorType')}）")
    lines.append("## 业务规则")
    for r in registry["rules"].values():
        lines.append(f"- {r['id']}：{r.get('name')}；表达式 {r.get('expression', '').strip()}")
    lines.append("## 流程")
    for f in registry["flows"].values():
        lines.append(f"- {f['id']}：{f.get('name')}（{f.get('flowType')}）")
    return "\n".join(lines)


def _schema_section():
    import db as _db
    lines = ["# 数据库表结构（用于生成 SQL，表名与字段名均为下划线命名）"]
    label_map = {}
    for agg in registry["aggregates"].values():
        table = _snake(agg.get("alias", ""))
        for a in agg.get("attributes", []):
            label_map[f"{table}.{_snake(a['name'])}"] = a.get("label", a["name"])
        for e in agg.get("entities", []):
            etable = _snake(e.get("alias", ""))
            for a in e.get("attributes", []):
                label_map[f"{etable}.{_snake(a['name'])}"] = a.get("label", a["name"])

    tables = ["product", "customer", "department", "employee", "contract", "contract_stage",
              "invoice", "invoice_allocation", "receipt", "approval_record"]
    for t in tables:
        try:
            cols = _db.query(f"PRAGMA table_info({t})")
        except Exception:
            continue
        colstrs = []
        for c in cols:
            name = c["name"]
            if name in ("created_by", "created_at", "updated_by", "updated_at", "flag", "instance_id"):
                continue
            label = label_map.get(f"{t}.{name}", name)
            colstrs.append(f"{name}({label})")
        lines.append(f"- 表 {t}：{', '.join(colstrs)}")
    lines.append(
        "# 关联说明：contract.product_id→product.id；contract.customer_id→customer.id；"
        "contract.department_id→department.id；contract.owner_id→employee.id；"
        "contract_stage.contract_id→contract.id；invoice.contract_id→contract.id；"
        "invoice_allocation.invoice_id→invoice.id；invoice_allocation.stage_id→contract_stage.stage_id；"
        "receipt.contract_id→contract.id；receipt.invoice_id→invoice.id。"
        "部门名称在 department.department_name，客户名称在 customer.customer_name，产品名称在 product.product_name，"
        "人员名称在 employee.employee_name。")
    return "\n".join(lines)


def _api_section():
    return """# 系统只读 API 能力
- readonly_sql_query：按自然语言生成只读 SQL 动态查询（支持统计、聚合、自定义列），可指定图表类型渲染柱状图/折线图/饼图。
- 固定查询工具：合同列表/详情、开票列表、收款列表、客户/产品/部门/人员列表。
"""


def _behavior_rules():
    return """
# 行为准则
1. 只能执行只读操作；新增/修改/删除/提交/审批等写操作必须引导用户到固定业务页面完成（给出页面路径）。
2. 回答使用中文，简洁、专业；不得编造数据。
3. 统计、聚合、按条件汇总、自定义列查询（如"按部门统计合同总金额"、"按合同类型统计"）：必须调用 readonly_sql_query 工具生成 SQL 动态查询，不要使用固定列表工具。
4. 生成 SQL 时使用下划线命名的表名/字段名（参考上面数据库表结构），涉及名称时正确 JOIN 关联表取名称字段；列别名使用中文（如 AS 合同总金额）。
5. 当用户要求图表（柱状图/折线图/饼图）时，调用 readonly_sql_query 并设置 chart_type 为 bar/line/pie，查询结果会以图表形式渲染。
6. 用户要求"只需要某几列"时，SQL 只 SELECT 那些列，不要多查。
7. 简单列表/详情（如"查询合同列表""某个合同详情"）可用固定查询工具；其余一律优先 readonly_sql_query。
"""


def build_system_prompt():
    return "\n\n".join([
        DOMAIN_OVERVIEW,
        _ontology_section(),
        _api_section(),
        _schema_section(),
        _behavior_rules(),
    ])
