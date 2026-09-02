"""AI 编排器：函数调用（只读工具）+ 最终答案流式输出。"""
import json

from ai import config as ai_config
from ai import llm, prompt, tools

MAX_TOOL_ROUNDS = 5


def run_chat(user_message, history, user):
    """生成器，依次产出 (event, payload) 元组。"""
    cfg = ai_config.get_config()
    if not cfg.get("configured"):
        yield ("message_start", {})
        yield ("delta", {"content": "尚未配置大模型。请点击右上角用户菜单 → 配置大模型，填写 OpenAI 兼容的 URL、API Key、模型 ID 后即可使用。"})
        yield ("message_end", {})
        return

    messages = [{"role": "system", "content": prompt.build_system_prompt()}]
    for m in (history or [])[-10:]:
        if m.get("role") in ("user", "assistant") and m.get("content"):
            messages.append({"role": m["role"], "content": m["content"]})
    messages.append({"role": "user", "content": user_message})

    yield ("message_start", {})

    # 函数调用循环（非流式）
    try:
        for _ in range(MAX_TOOL_ROUNDS):
            resp = llm.chat_completion(cfg["base_url"], cfg["api_key"], cfg["model_id"], messages,
                                       tools=tools.TOOLS, max_tokens=cfg["max_tokens"])
            msg = resp["choices"][0]["message"]
            tcs = msg.get("tool_calls") or []
            if not tcs:
                break
            messages.append({"role": "assistant", "content": msg.get("content"), "tool_calls": tcs})
            for tc in tcs:
                name = tc["function"]["name"]
                try:
                    args = json.loads(tc["function"].get("arguments") or "{}")
                except Exception:
                    args = {}
                yield ("tool_call", {"name": name})
                result = tools.execute_tool(name, args)
                if result.get("render"):
                    yield ("render_payload", result["render"])
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.get("id", ""),
                    "content": json.dumps({"text": result.get("text"), "data": result.get("data")}, ensure_ascii=False),
                })
    except llm.LLMError as e:
        yield ("delta", {"content": f"大模型调用失败：{e}"})
        yield ("message_end", {})
        return

    # 最终答案（流式）
    try:
        for delta in llm.stream_chat_completion(cfg["base_url"], cfg["api_key"], cfg["model_id"], messages,
                                                max_tokens=cfg["max_tokens"]):
            yield ("delta", {"content": delta})
    except llm.LLMError as e:
        yield ("delta", {"content": f"大模型调用失败：{e}"})

    yield ("message_end", {})
