// Package auth —— 认证基础设施:local HS256 会话签发 + ZITADEL OIDC(JWKS 验签)。
//
// 集成口径对齐 OPIC-零信任安全中心 design.md:
//   - ZITADEL 以未修改容器提供统一身份(注册/登录/MFA/会话),Login UI 由 ZITADEL 托管
//   - 服务端仅做「token 验签 + 角色检查」,不复制身份库
//   - 用户经 userinfo 声明自动 provisioning(映射本地角色)
package auth

import (
	"context"
	crand "crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/config"
)

// PKCEChallenge 生成 S256 code_challenge(verifier 为随机 state 串)。
func PKCEChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// Claims 会话声明(local 模式)。
type Claims struct {
	UserID   int64  `json:"uid"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// NewState 生成随机 state/占位串(crypto/rand)。
func NewState() string {
	b := make([]byte, 16)
	_, _ = crand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// IssueLocalToken 签发 HS256 会话令牌(local 模式)。
// jti(Redis 吊销黑名单用)恒定生成,令牌形状不随 Redis 开关变化。
func IssueLocalToken(userID int64, username string) (string, error) {
	cfg := config.Config.Auth
	claims := Claims{
		UserID:   userID,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        NewState(),
			Subject:   fmt.Sprintf("%d", userID),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(cfg.JWTExpiresHours) * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "go-techbase",
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(cfg.JWTSecret))
}

// ParseLocalToken 校验 HS256 会话令牌。
func ParseLocalToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("非法签名算法 %v", t.Header["alg"])
		}
		return []byte(config.Config.Auth.JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}
	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}
	return nil, fmt.Errorf("令牌无效")
}

// ---------- ZITADEL OIDC ----------

// OIDCDiscovery /.well-known/openid-configuration 关键字段。
type OIDCDiscovery struct {
	Issuer                string `json:"issuer"`
	AuthorizationEndpoint string `json:"authorization_endpoint"`
	TokenEndpoint         string `json:"token_endpoint"`
	UserinfoEndpoint      string `json:"userinfo_endpoint"`
	JWKSURI               string `json:"jwks_uri"`
}

// Discover 拉取 OIDC 发现文档(5 分钟缓存)。
// ScopeConf 单端 OIDC 配置（管理控制台=Auth/ZITADEL；用户工作台=UserAuth/Casdoor）。
type ScopeConf struct {
	Issuer      string
	ClientID    string
	ClientSecret string
	RedirectURL string
}

// AdminConf 管理控制台端配置（ZITADEL）。
func AdminConf() ScopeConf {
	c := config.Config.Auth
	return ScopeConf{Issuer: c.Issuer, ClientID: c.ClientID, ClientSecret: c.ClientSecret, RedirectURL: c.RedirectURL}
}

// Discover 按端配置做 OIDC 发现（5 分钟缓存，key=issuer）。
func Discover(ctx context.Context) (*OIDCDiscovery, error) {
	return DiscoverWith(ctx, AdminConf())
}

// DiscoverWith 泛化发现。
func DiscoverWith(ctx context.Context, sc ScopeConf) (*OIDCDiscovery, error) {
	issuer := strings.TrimRight(sc.Issuer, "/")
	cacheMu.Lock()
	if cached != nil && time.Since(cachedAt) < 5*time.Minute && cached.issuer == issuer {
		d := cached.discovery
		cacheMu.Unlock()
		return d, nil
	}
	cacheMu.Unlock()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, issuer+"/.well-known/openid-configuration", nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("OIDC 发现失败: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var d OIDCDiscovery
	if err := json.Unmarshal(raw, &d); err != nil {
		return nil, fmt.Errorf("OIDC 发现解析失败: %w", err)
	}
	cacheMu.Lock()
	cached = &discoveryCache{issuer: issuer, discovery: &d}
	cachedAt = time.Now()
	cacheMu.Unlock()
	return &d, nil
}

type discoveryCache struct {
	issuer    string
	discovery *OIDCDiscovery
}

var (
	cacheMu  sync.Mutex
	cached   *discoveryCache
	cachedAt time.Time
)

// AuthorizeURL 构造 ZITADEL 授权地址(Authorization Code + PKCE)。
func AuthorizeURL(state, codeChallenge string) (string, error) {
	return AuthorizeURLWith(context.Background(), AdminConf(), state, codeChallenge)
}

// AuthorizeURLWith 泛化授权端点。
func AuthorizeURLWith(_ context.Context, sc ScopeConf, state, codeChallenge string) (string, error) {
	d, err := DiscoverWith(context.Background(), sc)
	if err != nil {
		return "", err
	}
	cfg := sc
	q := url.Values{}
	q.Set("client_id", cfg.ClientID)
	q.Set("redirect_uri", cfg.RedirectURL)
	q.Set("response_type", "code")
	q.Set("scope", "openid profile email")
	q.Set("state", state)
	q.Set("code_challenge", codeChallenge)
	q.Set("code_challenge_method", "S256")
	return d.AuthorizationEndpoint + "?" + q.Encode(), nil
}

// TokenResult code 换 token 结果。
type TokenResult struct {
	AccessToken  string `json:"access_token"`
	IDToken      string `json:"id_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
}

// ExchangeCode 用授权码换 token(verifier 为 PKCE 码验证器,与 authorize 的 code_challenge 配对)。
func ExchangeCode(ctx context.Context, code, verifier string) (*TokenResult, error) {
	return ExchangeCodeWith(ctx, AdminConf(), code, verifier)
}

// ExchangeCodeWith 泛化换码。
func ExchangeCodeWith(ctx context.Context, sc ScopeConf, code, verifier string) (*TokenResult, error) {
	d, err := DiscoverWith(ctx, sc)
	if err != nil {
		return nil, err
	}
	cfg := sc
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", cfg.RedirectURL)
	form.Set("client_id", cfg.ClientID)
	form.Set("client_secret", cfg.ClientSecret)
	if verifier != "" {
		form.Set("code_verifier", verifier)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.TokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var tr TokenResult
	if err := json.Unmarshal(raw, &tr); err != nil || tr.AccessToken == "" {
		return nil, fmt.Errorf("code 换 token 失败: %s", string(raw))
	}
	return &tr, nil
}

// UserInfo ZITADEL userinfo(仅取集成所需字段)。
type UserInfo struct {
	Sub               string   `json:"sub"`
	PreferredUsername string   `json:"preferred_username"`
	Name              string   `json:"name"`
	Email             string   `json:"email"`
	Everything        map[string]any `json:"-"`
}

// FetchUserinfo 调用 userinfo 端点。
func FetchUserinfo(ctx context.Context, accessToken string) (*UserInfo, error) {
	return FetchUserinfoWith(ctx, AdminConf(), accessToken)
}

// FetchUserinfoWith 泛化 userinfo。
func FetchUserinfoWith(ctx context.Context, sc ScopeConf, accessToken string) (*UserInfo, error) {
	// 必须用 sc 对应的 discovery(修复:原先误用默认 AdminConf 的 discovery,
	// 导致 Casdoor token 被打到 ZITADEL 的 userinfo 端点而 401)
	d, err := DiscoverWith(ctx, sc)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, d.UserinfoEndpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	// IdP 的 userinfo 失败时也会返回 200+{"error":...}(或 401),必须显式透出,
	// 否则会被静默解析成"空用户"难排查(2026-10-03 Casdoor 实测坑)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("userinfo 请求失败(%d): %s", resp.StatusCode, string(raw))
	}
	var probe map[string]any
	_ = json.Unmarshal(raw, &probe)
	if e, _ := probe["error"].(string); e != "" {
		desc, _ := probe["error_description"].(string)
		return nil, fmt.Errorf("userinfo 返回错误: %s: %s", e, desc)
	}
	var ui UserInfo
	if err := json.Unmarshal(raw, &ui); err != nil {
		return nil, fmt.Errorf("userinfo 解析失败: %w", err)
	}
	ui.Everything = probe
	return &ui, nil
}

// RoleClaims 从 userinfo 按配置声明取角色(ZITADEL 项目角色)。
//
// ZITADEL 断言的 roles 声明是嵌套 map:{"<roleKey>@<projectId>": {"<orgId>": "<orgDomain>"}},
// 这里取 map 键并剥离 @projectId 后缀;同时兼容数组/逗号串等扁平形态。
func RoleClaims(ui *UserInfo) []string {
	claim := config.Config.Auth.RoleClaim
	v, ok := ui.Everything[claim]
	if !ok {
		return nil
	}
	switch roles := v.(type) {
	case []any:
		out := make([]string, 0, len(roles))
		for _, r := range roles {
			if s, ok := r.(string); ok {
				out = append(out, s)
			}
		}
		return NormalizeRoleKeys(out)
	case []string:
		return NormalizeRoleKeys(roles)
	case string:
		return NormalizeRoleKeys(strings.Split(roles, ","))
	case map[string]any:
		out := make([]string, 0, len(roles))
		for k := range roles {
			out = append(out, k)
		}
		return NormalizeRoleKeys(out)
	}
	return nil
}

// NormalizeRoleKeys 剥离 "roleKey@projectId" 形态的项目后缀并去重保序。
func NormalizeRoleKeys(keys []string) []string {
	out := make([]string, 0, len(keys))
	seen := map[string]bool{}
	for _, k := range keys {
		if i := strings.Index(k, "@"); i > 0 {
			k = k[:i]
		}
		k = strings.TrimSpace(k)
		if k == "" || seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, k)
	}
	return out
}

// ---------- JWKS(RS256 验签) ----------

type jwk struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	Alg string `json:"alg"`
	Use string `json:"use"`
	N   string `json:"n"`
	E   string `json:"e"`
}

type jwks struct {
	Keys []jwk `json:"keys"`
}

var (
	jwksMu   sync.Mutex
	jwksKeys map[string]*rsa.PublicKey
	jwksAt   time.Time
)

// FetchJWKS 拉取并解析 JWKS(5 分钟缓存)。
func FetchJWKS(ctx context.Context) (map[string]*rsa.PublicKey, error) {
	jwksMu.Lock()
	defer jwksMu.Unlock()
	if jwksKeys != nil && time.Since(jwksAt) < 5*time.Minute {
		return jwksKeys, nil
	}
	d, err := Discover(ctx)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, d.JWKSURI, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var set jwks
	if err := json.Unmarshal(raw, &set); err != nil {
		return nil, err
	}
	keys := map[string]*rsa.PublicKey{}
	for _, k := range set.Keys {
		if k.Kty != "RSA" {
			continue
		}
		nb, err := base64.RawURLEncoding.DecodeString(k.N)
		if err != nil {
			continue
		}
		eb, err := base64.RawURLEncoding.DecodeString(k.E)
		if err != nil {
			continue
		}
		pub := &rsa.PublicKey{N: new(big.Int).SetBytes(nb), E: int(new(big.Int).SetBytes(eb).Int64())}
		keys[k.Kid] = pub
	}
	jwksKeys = keys
	jwksAt = time.Now()
	return keys, nil
}

// InvalidateJWKS kid 未命中时强制刷新。
func InvalidateJWKS() {
	jwksMu.Lock()
	jwksKeys = nil
	jwksMu.Unlock()
}

// ValidateZitadelToken 验签 RS256 access/id token。
func ValidateZitadelToken(ctx context.Context, tokenStr string) (jwt.MapClaims, error) {
	keys, err := FetchJWKS(ctx)
	if err != nil {
		return nil, err
	}
	claims := jwt.MapClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("非法签名算法 %v", t.Header["alg"])
		}
		kid, _ := t.Header["kid"].(string)
		if key, ok := keys[kid]; ok {
			return key, nil
		}
		// kid 未命中:刷新 JWKS 再试一次
		InvalidateJWKS()
		keys2, err2 := FetchJWKS(ctx)
		if err2 != nil {
			return nil, err2
		}
		if key, ok := keys2[kid]; ok {
			return key, nil
		}
		return nil, fmt.Errorf("未找到 kid=%s 的公钥", kid)
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, fmt.Errorf("令牌无效")
	}
	return claims, nil
}
