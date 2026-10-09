package llmcfg

// LLM Chat Completions 调用（OpenAI 兼容 /chat/completions；deepseek/qwen/vllm 皆此协议）。
// 无外部 SDK 依赖：直接 HTTP。失败返回 error，调用方降级回规则匹配引擎。

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// Message 对话消息。
type Message struct {
	Role    string `json:"role"` // system|user|assistant
	Content string `json:"content"`
}

// Chat 调用 LLM；30s 超时。llm 配置未启用时返回 ( "", llmDisabledErr )。
func Chat(ctx context.Context, cfg *Config, messages []Message) (string, error) {
	if cfg == nil || !cfg.Enabled || cfg.APIKey == "" || cfg.BaseURL == "" || cfg.Model == "" {
		return "", ErrDisabled
	}
	body := map[string]any{
		"model":    cfg.Model,
		"messages": messages,
	}
	// temperature 仅在 >0 时发送（部分模型如 kimi-for-coding 只允许默认温度，0.3 会被拒）
	if cfg.Temperature > 0 {
		body["temperature"] = cfg.Temperature
	}
	b, _ := json.Marshal(body)
	cctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(cctx, http.MethodPost,
		strings.TrimRight(cfg.BaseURL, "/")+"/chat/completions", bytes.NewReader(b))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if out.Error != nil {
		return "", fmt.Errorf("LLM API 错误: %s", out.Error.Message)
	}
	if len(out.Choices) == 0 {
		return "", fmt.Errorf("LLM API 返回空 choices")
	}
	return out.Choices[0].Message.Content, nil
}

// ErrDisabled llm 未启用（调用方应降级回规则匹配引擎）。
var ErrDisabled = fmt.Errorf("LLM 未启用")

// ChatAccount 按供应商账号对话（多账号模型设置;temperature<=0 表示使用模型默认）。
func ChatAccount(ctx context.Context, a *Account, model string, temperature float64, messages []Message) (string, error) {
	if a == nil {
		return "", ErrDisabled
	}
	base := a.ResolveBaseURL()
	key := a.APIKey
	if key == "" {
		key = envKey() // 环境认证兜底(LLM_API_KEY)
	}
	if model == "" {
		model = a.DefaultModelResolve()
	}
	if model == "" {
		return "", fmt.Errorf("账号 %s 未配置模型", a.Name)
	}
	if temperature <= 0 {
		temperature = a.Temperature
	}
	body := map[string]any{
		"model":    model,
		"messages": messages,
	}
	if temperature > 0 {
		body["temperature"] = temperature
	}
	return postChat(ctx, base, key, body)
}

// ListUpstreamModels 拉取上游可用模型目录（GET /models,OpenAI 兼容）。
func ListUpstreamModels(ctx context.Context, baseURL, apiKey string) ([]string, error) {
	if baseURL == "" {
		return nil, fmt.Errorf("API 地址未配置")
	}
	cctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(cctx, http.MethodGet,
		strings.TrimRight(baseURL, "/")+"/models", nil)
	if err != nil {
		return nil, err
	}
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if out.Error != nil && out.Error.Message != "" {
		return nil, fmt.Errorf("上游错误: %s", out.Error.Message)
	}
	ids := make([]string, 0, len(out.Data))
	for _, m := range out.Data {
		if m.ID != "" {
			ids = append(ids, m.ID)
		}
	}
	if len(ids) == 0 {
		return nil, fmt.Errorf("上游未返回模型目录")
	}
	return ids, nil
}

// TestAccount 账号连通性测试（models 端点失败时降级 chat ping）。
func TestAccount(ctx context.Context, a *Account) error {
	base := a.ResolveBaseURL()
	if base == "" {
		return fmt.Errorf("API 地址未配置(账号与提供商目录均未提供)")
	}
	key := a.APIKey
	if key == "" {
		key = envKey()
	}
	if ids, err := ListUpstreamModels(ctx, base, key); err == nil && len(ids) > 0 {
		return nil
	}
	_, err := ChatAccount(ctx, a, a.DefaultModelResolve(), 0, []Message{
		{Role: "system", Content: "你是连通性测试端点,只回复 pong"},
		{Role: "user", Content: "ping"},
	})
	return err
}

// postChat 发送 /chat/completions 并解析。
func postChat(ctx context.Context, baseURL, apiKey string, body map[string]any) (string, error) {
	if baseURL == "" {
		return "", fmt.Errorf("模型端点未配置")
	}
	b, _ := json.Marshal(body)
	cctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(cctx, http.MethodPost,
		strings.TrimRight(baseURL, "/")+"/chat/completions", bytes.NewReader(b))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("模型端点返回 %d: %s", resp.StatusCode, truncateStr(string(raw), 300))
	}
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", fmt.Errorf("模型响应解析失败: %w", err)
	}
	if out.Error != nil && out.Error.Message != "" {
		return "", fmt.Errorf("模型返回错误: %s", out.Error.Message)
	}
	if len(out.Choices) == 0 || strings.TrimSpace(out.Choices[0].Message.Content) == "" {
		return "", fmt.Errorf("模型未返回内容")
	}
	return strings.TrimSpace(out.Choices[0].Message.Content), nil
}

func truncateStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// envKey 环境认证兜底（账号未填密钥时,如网关已注入 LLM_API_KEY）。
func envKey() string {
	return os.Getenv("LLM_API_KEY")
}
