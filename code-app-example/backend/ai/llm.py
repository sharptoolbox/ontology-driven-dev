"""OpenAI 兼容大模型客户端（DeepSeek / 通义 / 智谱 / OpenAI 等统一通过 OpenAI 协议接入）。"""
import json

import requests


class LLMError(Exception):
    pass


def _url(base_url):
    return base_url.rstrip("/") + "/chat/completions"


def _headers(api_key):
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


def chat_completion(base_url, api_key, model_id, messages, tools=None, max_tokens=81920, temperature=0.2):
    """非流式对话，支持函数调用。返回完整响应对象（含 choices[0].message）。"""
    payload = {
        "model": model_id,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
    try:
        resp = requests.post(_url(base_url), json=payload, headers=_headers(api_key), timeout=120)
    except requests.RequestException as e:
        raise LLMError(f"请求大模型失败：{e}")
    if resp.status_code != 200:
        detail = ""
        try:
            detail = resp.json().get("error", {}).get("message", resp.text[:200])
        except Exception:
            detail = resp.text[:200]
        raise LLMError(f"大模型返回错误（HTTP {resp.status_code}）：{detail}")
    return resp.json()


def stream_chat_completion(base_url, api_key, model_id, messages, max_tokens=81920, temperature=0.2):
    """流式对话，逐段产出文本增量。"""
    payload = {
        "model": model_id,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": True,
    }
    try:
        resp = requests.post(_url(base_url), json=payload, headers=_headers(api_key), timeout=120, stream=True)
    except requests.RequestException as e:
        raise LLMError(f"请求大模型失败：{e}")
    if resp.status_code != 200:
        detail = resp.text[:200]
        try:
            detail = resp.json().get("error", {}).get("message", detail)
        except Exception:
            pass
        raise LLMError(f"大模型返回错误（HTTP {resp.status_code}）：{detail}")

    for line in resp.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if data == "[DONE]":
            break
        try:
            obj = json.loads(data)
        except json.JSONDecodeError:
            continue
        choices = obj.get("choices") or []
        if not choices:
            continue
        delta = choices[0].get("delta") or {}
        content = delta.get("content")
        if content:
            yield content


def test_connection(base_url, api_key, model_id, max_tokens=81920):
    """连通性测试：发一个最小对话，返回 (ok, 耗时毫秒, 回复片段/错误)。"""
    import time
    messages = [{"role": "user", "content": "请只回复两个字：正常"}]
    start = time.time()
    try:
        data = chat_completion(base_url, api_key, model_id, messages, max_tokens=max_tokens, temperature=0)
    except LLMError as e:
        return False, int((time.time() - start) * 1000), str(e)
    elapsed = int((time.time() - start) * 1000)
    try:
        reply = data["choices"][0]["message"]["content"].strip()
    except Exception:
        reply = ""
    return True, elapsed, reply
