# 合同管理新模板

基于 `技术底座/code-paas` 落地的完整业务应用：合同台账、合同审批、开票收款、部门合同统计、基础数据维护与 AI 只读问答，全部由本体模型（M1~M6）驱动，保留并复用底座的系统管理、流程管理、审批中心。

## 1. 交付依据与范围

| 项 | 说明 |
|---|---|
| 唯一依据 | `本体模型业务功能开发指导书.md`（权威顺序：开发指导书 > 技术架构 > 界面原型 > 需求说明书 > 本体模型） |
| 只读区 | `技术底座/code-paas`、`参考资料`（未改动） |
| 可写区 | `应用源码/code-app`（本次交付内容） |
| 本体模型 | `models/m1-object-model.yaml` ~ `m6-flow-model.yaml` + `manifest.json` |

保留的底座能力：审批中心（`/workbench/todo`、`/workbench/done`）、流程管理、系统管理三个一级菜单及资源种子；首页保持空白，未注入任何经营工作台。

## 2. 技术栈

| 层 | 选型 |
|---|---|
| 数据库 | SQLite 3（WAL 模式，首次启动自动建库 + 种子） |
| 后端 | Python 3.10+ / Flask 3（单体分层，`sqlite3` 直连，不使用 ORM） |
| 认证 | PyJWT + `login_required` 装饰器 |
| 前端 | React 18 + TypeScript + Vite 5 |
| 样式 | Vanilla CSS（主色 `#111827`、页面底 `#f3f5f8`、控件高 36px、行高 46px） |
| 图标 | lucide-react |

## 3. 目录结构

```
code-app/
├── models/                     # M1~M6 本体模型 + manifest.json
├── backend/
│   ├── app.py                  # Flask 入口（含前端静态托管与 API 兜底 404）
│   ├── schema.sql              # 系统表 + 流程表 + 业务表
│   ├── seed.py                 # 种子：角色/权限/资源/菜单/用户/字典/主数据/流程定义
│   ├── demo_data.py            # 可选：生成演示合同（走真实接口，幂等）
│   ├── smoke_test.py           # 端到端自测（160 项）
│   ├── ontology/registry.py    # 运行时本体注册表（按 model_type 分派）
│   ├── engine/flow_engine.py   # 流程引擎 start/approve/reject/return_to/terminate
│   ├── services/               # contract / invoice / receipt / report / masterdata / scope / ai / workbench
│   └── api/                    # REST 接口层
├── frontend/src/
│   ├── pages/contract/         # Ledger / ContractForm / ContractDetail / Approval / Invoice / Receipt
│   ├── pages/report/           # DepartmentReport
│   ├── pages/masterdata/       # MasterData（列表 + 同一 Modal 表单）
│   ├── pages/system/           # AiConfig
│   └── layouts/AdminLayout.tsx # 壳层 + 多标签 + AI 助手
└── logs/conflict-resolution.log  # 冲突裁决记录（CR-001 ~ CR-009）
```

## 4. 启动

```bash
# 1) 后端依赖
cd backend
pip install -r requirements.txt

# 2) 前端构建（产物由 Flask 统一托管）
cd ../frontend
npm install
npm run build            # 输出 frontend/dist

# 3) 启动（首次运行自动建库并写入种子）
cd ../backend
python app.py            # http://localhost:5000
```

开发模式（前端热更新，`/api` 代理到后端）：

```bash
cd frontend && npm run dev      # http://localhost:5173
```

可选：生成演示数据（5 份合同覆盖已生效/审批中/已驳回/草稿，含开票与收款）

```bash
cd backend
python demo_data.py             # 幂等，已存在则跳过
python demo_data.py --reset     # 先清理演示合同再重建
```

## 5. 默认账号

| 账号 | 密码 | 姓名 | 角色 | 部门 | 数据范围 |
|---|---|---|---|---|---|
| `admin` | `admin123` | 管理员 | 系统管理员（`*`） | — | 全部 |
| `sales01` | `123456` | 张伟 | ROLE-01 销售人员 | D001 销售一部 | 本部门 |
| `finance01` | `123456` | 王芳 | ROLE-02 财务人员 | D005 财务部 | 全部 |
| `fm01` | `123456` | 李强 | ROLE-03 财务经理 | D005 财务部 | 全部 |
| `gm01` | `123456` | 陈总 | ROLE-04 总经理 | D006 总经办 | 全部 |
| `staff01` | `123456` | 赵敏 | ROLE-05 普通员工 | D001 销售一部 | 本部门 |

## 6. 功能与模型映射

| 菜单 | 页面 | 模型/接口 |
|---|---|---|
| 合同管理 / 合同台账 | `/contract/ledger` | OBJ-001 列表查询（FUN-004）、新增（FUN-001）、编辑（FUN-002）、提交（FUN-006）、撤回、删除（FUN-003） |
| 合同管理 / 合同审批 | `/contract/approval` | APR-001 待我审批 / 我已审批（复用审批中心能力） |
| 开票与收款 / 合同开票 | `/contract/invoice` | OBJ-003 开票登记（FUN-011）、按阶段唯一开票（RULE-003） |
| 开票与收款 / 合同收款 | `/contract/receipt` | OBJ-004 收款登记（FUN-013）、收款上限（RULE-005）、状态回写（RULE-006/007） |
| 报表中心 / 部门合同统计 | `/report/department` | 时间段 + 部门维度统计，支持 Excel 导出 |
| 基础数据 / 基础数据维护 | `/masterdata` | MDM-001~004 主数据 + DIC 字典；列表页 + 新增/修改复用同一 Modal |
| 系统管理 / 配置大模型 | `/system/ai-config` | `ai_config` 单行配置，API Key 脱敏 |

AI 助手：右侧常驻面板，只读、不越权，按当前用户数据范围回答合同数量、待办、本月签订/开票、未收款明细等问题；未配置大模型时回落为规则问答（返回 `source=RULE/MODEL/FALLBACK`）。

## 7. 规则落地

| 编号 | 规则 | 落地位置 |
|---|---|---|
| RULE-001 | 付款条款比例合计 = 100%、至少 1 条、阶段名称唯一 | `contract_service._normalize_stages` |
| RULE-002 | 阶段金额自动计算，尾差计入最后阶段 | 同上 |
| RULE-003 | 同一付款阶段只允许开票一次 | `invoice_service.create` |
| RULE-004 | 开票金额与税率取值（默认取合同税率） | `invoice_service.create` |
| RULE-005 | 收款金额不得超过开票未收金额 | `receipt_service.create` |
| RULE-006 | 开票收款状态自动更新（未收款/部分收款/已收款） | `receipt_service.create` |
| RULE-007 | 全部收讫后合同自动关闭 | `receipt_service.create` |
| RULE-008 | 合同状态与操作可用性（仅草稿可编辑、仅生效可开票） | `contract_service` / `invoice_service` |
| RULE-009 | 查询数据权限（ROLE-01/05 仅本部门） | `scope_service.contract_scope_clause` |
| RULE-010 | 主数据引用保护（被引用不可删除） | `masterdata_service.remove` |

审批分级（M6 / APR-001）：财务经理必审；合同总金额 ≥ 1,000,000 追加总经理审批。审批流由 `flow_definition.node_graph` 驱动，由现有流程引擎执行，未自建审批状态。

## 8. 自测

```bash
cd backend
python smoke_test.py
```

覆盖登录鉴权、主数据 CRUD 与引用保护、合同 9 类校验、审批流（单级/两级/驳回/撤回/重复提交）、开票 5 类校验与编号生成、收款 5 类校验（部分/全额/自动关闭）、报表口径与导出、数据权限、AI 只读与脱敏、菜单下发。

当前结果：**通过 160 项，失败 0 项**。

## 9. 冲突裁决

开发过程中对文档间不一致处逐条裁决并记录在 `logs/conflict-resolution.log`（CR-001 ~ CR-009），主要包括：编号规则采用 HT/FP/SK + YYYYMM + 4 位流水；M6 缺 `nodeGraph` 时补语义等价图并保留 activities；合同增加 `created_by_name` 冗余；统计口径草稿不计签订额；菜单归属与首页空白；越权返回 403 `FORBIDDEN`。

## 10. 交付说明

- 不含 `node_modules`、`frontend/dist`、`__pycache__`、运行数据库（`backend/data/*.db`）；首次启动自动重建。
- `logs/conflict-resolution.log` 随交付保留。
- AI 大模型的 Base URL / API Key / 模型 ID 不写入任何配置文件或源码，只能通过「系统管理 → 配置大模型」写入 `ai_config`。
