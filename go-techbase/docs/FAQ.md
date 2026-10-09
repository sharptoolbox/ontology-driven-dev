# OPIC 技术底座 · FAQ（实战踩坑速查）

> 事实源：[go-techbase](https://github.com/opic-ai/ontology-driven-dev/go-techbase) 仓库 `docs/FAQ.md`。全部条目来自真实排障记录（2026-10 生产/开发环境）。

## 登录与 SSO

**Q1：管理员 SSO 登录报"系统中未找到用户"？**
登录名写错。ZITADEL 实例域名是 `zitadel.auth.opic-ai.ccoe.tech`，不是文档示例的 `zitadel.localhost`。且管理控制台 SSO 应使用底座管理员账号：登录名 `admin`（口令见 `/opt/opic-prod/.env` 的 `ZITADEL_TECHBASE_ADMIN_PASSWORD`），它会映射本地 admin 并保留管理权限。`zitadel-admin@...` 是 ZITADEL 平台自身的实例管理员，登录成功也只会开通普通业务账号。

**Q2：ZITADEL 登录报"无法为用户创建会话"？**
登录 UI 对密码校验失败的通用提示——**口令不对**。API 侧可用 `POST /v2/sessions` 验证口令（注意该接口必须带任意 Bearer 头，否则报 "auth header missing"）。

**Q3：Casdoor 登录页只有"Sign in with Face ID"，无法输密码？**
应用配置被初始化成了仅 FaceID。修 casdoor 库 `application` 表：`enable_password=t`、`signin_methods=[{"name":"Password",...}]`，改后 `docker restart opic-casdoor`。

**Q4：SSO 回调 401 "access token invalid"？**
三层都可能，按序排查：① casdoor 应用 `expire_in_hours=0`（token 签发即过期）→ 设 168；② 应用 `cert` 字段必须为**裸名**（如 `cert-built-in`，带 owner 前缀会拼成三段报错）；③ 客户端代码 userinfo discovery 误用了另一个 IdP 的配置（多 IdP 共用 pkg 时高发）。

**Q5：ZITADEL 授权后 404（`http://域名:443/ui/v2/login/...`）？**
https 端口收到明文 http。修两处：compose 的 LoginV2 URL 改 `https://域名`（无端口）；**存量实例**还须 `PUT /v2/features/instance` 更新 `loginV2.baseUri`（带 `required:true`，否则 v2 特性被关掉落到 v1 路径）。

## 接口与数据库

**Q6：接口报 SQLSTATE 42601 "syntax error at or near \")\""？**
空集合拼了 `IN ()`。动态 IN 列表前必须判空（无角色用户查待办即此坑），空时改按其他条件过滤。

**Q7：保存/更新接口 404，但 GET 正常？**
后端漏注册对应 method 的路由（如只注册了 POST 而前端用 PUT）。gin 缺路由返回 404 而非 405；补路由时注意**更新语义要从路径参数或 body 取 id**，否则更新会落进 INSERT 分支报"编码已存在"。

**Q8：接口返回 200 但前端拿到空数据？**
响应没包 OPIC 信封。axios 拦截器只认 `returnInfo.returnCode='SUC0000'` 并取 `data` 字段——裸 JSON/错误响应会被静默吞掉。统一用 `common.OKJSON/FailJSON`。

**Q9：gorm Raw 查询数字字段类型断言失败？**
PG smallint→int16、int→int64、numeric→float64。取值助手 `service.Int()` 已兼容，勿直接 `.(int)`。

## 部署与基础设施

**Q10：本地构建的镜像服务器跑不起来？**
Apple Silicon 产出 arm64 镜像。生产一律服务器侧构建（`make deploy-prod` 已内置 `--network host`，同时解决构建期 DNS 脏条目）。

**Q11：容器内解析公司域名到 127.0.0.1？**
宿主 `/etc/hosts` 把 `*.opic-ai.ccoe.tech` 指向 127.0.0.1，Docker DNS 转发会继承。compose 给相关服务加 `extra_hosts: 域名=host-gateway`；https 自签证书再加 CA 挂载 + `SSL_CERT_FILE`。

**Q12：docker compose 改了镜像/配置不生效？**
`docker compose up -d` 只重建配置变化的容器；**改镜像必须确认镜像 ID 变了**（构建缓存可能命中旧层）。restart 不会换镜像。

**Q13：Pigsty 监控（VictoriaMetrics）加了抓取目标不生效？**
Pigsty 的 prometheus.yml 以 YAML 文档结束符 `...` 结尾——追加内容必须在 `...` **之前**，否则解析失败、热加载被拒（旧配置保留）。YAML 合法性先本地校验。

**Q14：vmetrics/grafana 等是 docker 还是系统服务？**
Pigsty 全部为 **systemd 服务**（vmetrics:8428 / vmalert:8880 / grafana:3000 / alertmanager / node_exporter / pg_exporter），非容器。Grafana 面板放 `/etc/dashboards/`（Pigsty provider 扫描路径）自动加载。

## 前端

**Q15：接口 200 但页面拿到的对象字段是 null 导致白屏？**
Go 空 slice 序列化为 `null` 而非 `[]`。返回给前端的列表字段必须 `make([]T, 0)` 初始化。

**Q16：按钮样式被全局主题覆盖（内联样式无效）？**
品牌 CSS 用了 `!important`。覆盖它需要同优先级写法（相同属性选择器 + 置于文件末尾），或新增专用类。

## AI 助理

**Q17：助理回复固定话术（不走大模型）？**
LLM 调用失败自动降级规则引擎。`docker logs | grep assistant` 看降级原因；管理台「AI 模型配置」对账号点「测试」。kimi-for-coding 仅允许默认温度（账号温度须为 0 即不发送）。

**Q18：新增模型账号后 AI 助理选择器不显示？**
账号需「启用」；前端模型选择持久化在 localStorage，切换账号后刷新页面即可见。
