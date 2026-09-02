import json

import db


def _json_loads(raw, default):
    if not raw:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


def _camel_to_snake(name):
    out = []
    for i, ch in enumerate(name):
        if ch.isupper() and i > 0:
            out.append("_")
        out.append(ch.lower())
    return "".join(out)


class FlowEngine:
    """轻量工作流引擎：start / approve / reject / return 四个核心方法。

    全部操作在调用方提供的事务连接 conn 上执行，保证业务与流程状态一致。
    """

    def __init__(self, conn):
        self.conn = conn

    # ---------- 工具 ----------

    def get_definition(self, def_id):
        return db.query_one(
            "SELECT * FROM flow_definition WHERE id = ?", (def_id,), self.conn
        )

    def get_definition_by_code(self, code):
        return db.query_one(
            "SELECT * FROM flow_definition WHERE code = ?", (code,), self.conn
        )

    def parse_graph(self, definition):
        return _json_loads(definition["node_graph"], {"nodes": [], "edges": []})

    def get_instance(self, instance_id):
        return db.query_one(
            "SELECT * FROM flow_instance WHERE id = ?", (instance_id,), self.conn
        )

    def get_task(self, task_id):
        return db.query_one(
            "SELECT * FROM flow_task WHERE id = ?", (task_id,), self.conn
        )

    def _node(self, graph, node_id):
        for n in graph.get("nodes", []):
            if n["id"] == node_id:
                return n
        return None

    def _outgoing(self, graph, node_id):
        return [e for e in graph.get("edges", []) if e.get("source") == node_id]

    def _resolve_assignee(self, role_ref):
        if not role_ref:
            return None, None
        row = db.query_one(
            """
            SELECT u.id, u.real_name
            FROM sys_user u
            JOIN sys_user_role ur ON ur.user_id = u.id
            JOIN sys_role r ON r.id = ur.role_id
            WHERE r.code = ? AND u.status = 1
            ORDER BY u.id
            LIMIT 1
            """,
            (role_ref,),
            self.conn,
        )
        if row:
            return row["id"], row["real_name"] or row["username"]
        return None, None

    # ---------- 实例与任务 ----------

    def start(self, def_id, business_key, business_object_refs, variables, creator_id):
        definition = self.get_definition(def_id)
        if not definition:
            raise ValueError("流程定义不存在")
        graph = self.parse_graph(definition)

        inst_id = db.execute(
            """
            INSERT INTO flow_instance
                (def_id, business_key, business_object_refs, current_activity_ids, variables, creator_id, status)
            VALUES (?, ?, ?, ?, ?, ?, 'RUNNING')
            """,
            (
                def_id,
                business_key,
                json.dumps(business_object_refs or [], ensure_ascii=False),
                json.dumps([], ensure_ascii=False),
                json.dumps(variables or {}, ensure_ascii=False),
                creator_id,
            ),
            self.conn,
        )[0]

        self._write_history(inst_id, None, "开始", creator_id, None, "START", None, None, None)

        start_node = None
        for n in graph.get("nodes", []):
            if n["type"] == "start":
                start_node = n
                break
        if start_node is None:
            raise ValueError("流程缺少开始节点")

        current = self._activate(inst_id, start_node, graph, creator_id)
        db.execute(
            "UPDATE flow_instance SET current_activity_ids = ? WHERE id = ?",
            (json.dumps(current, ensure_ascii=False), inst_id),
            self.conn,
        )
        return inst_id

    def approve(self, task_id, comment, operator_id, operator_name):
        return self._complete(task_id, "APPROVE", comment, operator_id, operator_name)

    def reject(self, task_id, comment, operator_id, operator_name):
        return self._complete(task_id, "REJECT", comment, operator_id, operator_name)

    def return_to(self, task_id, target_activity_id, comment, operator_id, operator_name):
        task = self.get_task(task_id)
        if not task or task["status"] != "TODO":
            raise ValueError("任务不存在或已处理")
        inst = self.get_instance(task["instance_id"])
        definition = self.get_definition(inst["def_id"])
        graph = self.parse_graph(definition)

        # 当前任务置为 CANCEL（退回），其余 TODO 一并取消
        db.execute(
            "UPDATE flow_task SET status='CANCEL', action='RETURN', comment=?, done_at=CURRENT_TIMESTAMP WHERE id=?",
            (comment, task_id),
            self.conn,
        )
        db.execute(
            "UPDATE flow_task SET status='CANCEL' WHERE instance_id=? AND status='TODO'",
            (task["instance_id"],),
            self.conn,
        )
        self._write_history(
            inst["id"], task["activity_id"], task["activity_name"],
            operator_id, operator_name, "RETURN", comment, task["activity_id"], target_activity_id,
        )

        target = self._node(graph, target_activity_id)
        current = self._activate(inst["id"], target, graph, operator_id)
        db.execute(
            "UPDATE flow_instance SET current_activity_ids=?, status='RUNNING' WHERE id=?",
            (json.dumps(current, ensure_ascii=False), inst["id"]),
            self.conn,
        )
        return self._result(inst["id"])

    def _complete(self, task_id, action, comment, operator_id, operator_name):
        task = self.get_task(task_id)
        if not task:
            raise ValueError("任务不存在")
        if task["status"] != "TODO":
            raise ValueError("任务已处理，不能重复操作")
        inst = self.get_instance(task["instance_id"])
        if not inst or inst["status"] != "RUNNING":
            raise ValueError("流程实例已结束")

        db.execute(
            "UPDATE flow_task SET status='DONE', action=?, comment=?, done_at=CURRENT_TIMESTAMP WHERE id=?",
            (action, comment, task_id),
            self.conn,
        )
        self._write_history(
            inst["id"], task["activity_id"], task["activity_name"],
            operator_id, operator_name, action, comment, None, None,
        )

        definition = self.get_definition(inst["def_id"])
        graph = self.parse_graph(definition)
        current = self._advance(inst, graph, task["activity_id"], action, operator_id)

        return self._result(inst["id"])

    def _result(self, instance_id):
        inst = self.get_instance(instance_id)
        todos = db.query(
            "SELECT activity_id FROM flow_task WHERE instance_id=? AND status='TODO'",
            (instance_id,),
            self.conn,
        )
        return {
            "instance_id": instance_id,
            "status": inst["status"],
            "current_activity_ids": [t["activity_id"] for t in todos],
        }

    # ---------- 核心推进 ----------

    def _advance(self, inst, graph, from_activity_id, outcome, operator_id):
        node = self._node(graph, from_activity_id)
        outgoing = self._outgoing(graph, from_activity_id)

        if node is None or node["type"] == "end":
            return self._current_ids(inst["id"])

        if node["type"] == "gateway":
            selected = self._select_gateway_targets(node, outgoing, inst)
        else:
            selected = []
            for e in outgoing:
                e_outcome = e.get("approval_outcome")
                if e_outcome and e_outcome != outcome:
                    continue
                selected.append(e["target"])

        new_ids = set()
        for target in selected:
            tgt_node = self._node(graph, target)
            new_ids |= set(self._activate(inst["id"], tgt_node, graph, operator_id))

        remaining = self._current_ids(inst["id"])
        return remaining

    def _activate(self, instance_id, node, graph, operator_id):
        if node is None:
            return []
        if node["type"] == "end":
            self._reach_end(instance_id, node)
            return []
        if node["type"] in ("user_task", "approval_task"):
            assignee_id, assignee_name = self._resolve_assignee(node.get("role_ref"))
            db.execute(
                """
                INSERT INTO flow_task
                    (instance_id, activity_id, activity_type, activity_name, role_ref, behavior_ref, assignee_id, assignee_name, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'TODO')
                """,
                (
                    instance_id, node["id"], node["type"], node.get("name"),
                    node.get("role_ref"), node.get("behavior_ref"), assignee_id, assignee_name,
                ),
                self.conn,
            )
            return [node["id"]]
        if node["type"] == "start":
            next_targets = [e["target"] for e in self._outgoing(graph, node["id"])]
            ids = set()
            for t in next_targets:
                ids |= set(self._activate(instance_id, self._node(graph, t), graph, operator_id))
            return list(ids)
        if node["type"] in ("system_task", "behavior_call"):
            self._write_history(
                instance_id, node["id"], node.get("name"), operator_id, None,
                "EXECUTE", "自动执行", None, None,
            )
            next_targets = [e["target"] for e in self._outgoing(graph, node["id"])]
            ids = set()
            for t in next_targets:
                ids |= set(self._activate(instance_id, self._node(graph, t), graph, operator_id))
            return list(ids)
        if node["type"] == "gateway":
            targets = self._select_gateway_targets(node, self._outgoing(graph, node["id"]), self.get_instance(instance_id))
            ids = set()
            for t in targets:
                ids |= set(self._activate(instance_id, self._node(graph, t), graph, operator_id))
            return list(ids)
        if node["type"] == "sub_flow_call":
            # 子流程本期不实现：直接流转到后继
            next_targets = [e["target"] for e in self._outgoing(graph, node["id"])]
            ids = set()
            for t in next_targets:
                ids |= set(self._activate(instance_id, self._node(graph, t), graph, operator_id))
            return list(ids)
        return []

    def _reach_end(self, instance_id, node):
        result = node.get("result", "APPROVED")
        if result == "REJECTED":
            db.execute(
                "UPDATE flow_instance SET status='REJECTED', ended_at=CURRENT_TIMESTAMP WHERE id=?",
                (instance_id,),
                self.conn,
            )
            db.execute(
                "UPDATE flow_task SET status='CANCEL' WHERE instance_id=? AND status='TODO'",
                (instance_id,),
                self.conn,
            )
        else:
            db.execute(
                "UPDATE flow_instance SET status='APPROVED', ended_at=CURRENT_TIMESTAMP WHERE id=?",
                (instance_id,),
                self.conn,
            )
            db.execute(
                "UPDATE flow_task SET status='CANCEL' WHERE instance_id=? AND status='TODO'",
                (instance_id,),
                self.conn,
            )

    def _select_gateway_targets(self, node, outgoing, inst):
        variables = _json_loads(inst["variables"], {}) if inst else {}
        branches = node.get("branches") or []
        targets = []
        default_target = None
        for b in branches:
            target = b.get("target")
            if b.get("is_default"):
                default_target = target
                continue
            if b.get("rule_ref") and self._eval_rule(b["rule_ref"], variables):
                targets.append(target)
                break
            if b.get("approval_outcome") and variables.get("outcome") == b["approval_outcome"]:
                targets.append(target)
                break
            cond = b.get("condition")
            if cond and self._eval_condition(cond, variables):
                targets.append(target)
                break
        if not targets and default_target:
            targets.append(default_target)
        if not targets:
            targets = [e["target"] for e in outgoing[:1]]
        return list(dict.fromkeys(targets))

    def _eval_condition(self, expr, variables):
        try:
            from simpleeval import simple_eval
            return bool(simple_eval(expr, names=variables))
        except Exception:
            return False

    def _eval_rule(self, rule_ref, variables):
        try:
            from ontology.registry import registry
            from simpleeval import simple_eval
            rule = registry["rules"].get(rule_ref)
            if not rule:
                return False
            params = dict(variables)
            for p in rule.get("inputParams", []):
                name = p.get("name")
                if name and name not in params:
                    snake = _camel_to_snake(name)
                    if snake in variables:
                        params[name] = variables[snake]
            return bool(simple_eval(rule["expression"], names=params))
        except Exception:
            return False

    def _current_ids(self, instance_id):
        rows = db.query(
            "SELECT activity_id FROM flow_task WHERE instance_id=? AND status='TODO'",
            (instance_id,),
            self.conn,
        )
        return [r["activity_id"] for r in rows]

    def _write_history(self, instance_id, activity_id, activity_name, operator_id,
                       operator_name, action, comment, from_activity, to_activity):
        db.execute(
            """
            INSERT INTO flow_history
                (instance_id, activity_id, activity_name, operator_id, operator_name, action, comment, from_activity, to_activity)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                instance_id, activity_id, activity_name, operator_id, operator_name,
                action, comment, from_activity, to_activity,
            ),
            self.conn,
        )
