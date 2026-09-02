# 销售合同执行管理系统（code-app）

基于 `code-paas` 技术底座（系统管理 + 流程引擎 + 工作台 + 本体注册表）扩展实现的完整合同管理业务，严格遵循《本体模型业务功能开发指导书》《AI 原生应用技术架构设计文档》与《UI-UE 界面设计规范》。

## 1. 功能范围

- **基础数据**：产品 / 客户 / 部门 / 人员 维护（单表，编号自动生成）
- **合同管理**：合同维护（主从表：合同 + 付款阶段）、合同查询；暂存/提交后进入**合同登记审批**（财务经理 → 金额≥100 万 → 总经理）
- **开票管理**：开票录入（主从表：开票 + 付款阶段分摊）、开票查询；暂存/提交后进入**开票审批**（财务经理）
- **收款管理**：收款录入、收款查询、冲销
- **审批中心**：我的待办（通过/驳回/退回）、我的已办、我的申请（撤回）
- **报表中心**：合同执行情况分析、部门合同统计分析、已开票未收款分析
- **流程管理**：流程定义（react-flow 设计器）、流程实例、任务管理
- **系统管理**：用户 / 角色 / 权限 / 资源
- **AI 智能助理**：右侧自然语言对话（业务问答、功能导航、只读查询）

## 2. 技术栈

| 层 | 选型 |
|---|---|
| 数据库 | SQLite 3（WAL） |
| 后端 | Python 3.10+ + Flask（单体分层，`sqlite3` 直连，无 ORM） |
| 认证 | PyJWT + werkzeug |
| 规则 | simpleeval（M3 规则 + M1 refRules） |
| 前端 | React 18 + TypeScript + Vite + Vanilla CSS |
| 图标/图表 | Lucide React / ECharts |
| 流程设计器 | react-flow |

## 3. 快速启动

### 3.1 后端

```bash
cd backend
pip install -r requirements.txt
python app.py            # http://localhost:5000
```

首次启动自动建库并写入种子（角色/权限/资源/用户/流程定义/基础数据）。

### 3.2 前端

```bash
cd frontend
npm install
npm run dev              # 开发模式 http://localhost:5173（代理 /api）
# 或
npm run build            # 构建后由 Flask 托管，访问 http://localhost:5000
```

## 4. 默认账号

| 账号 | 密码 | 角色 | 说明 |
|---|---|---|---|
| `admin` | `admin123` | 系统管理员 | 全部功能 |
| `sales` | `123456` | 销售人员 | 合同维护/查询、申请 |
| `finance` | `123456` | 财务人员 | 开票/收款/查询 |
| `finmgr` | `123456` | 财务经理 | 合同/开票审批、基础数据维护 |
| `gm` | `123456` | 总经理 | 大额合同审批 |
| `emp` | `123456` | 普通员工 | 查询 |

## 5. 典型业务流程

1. `sales` 登录 → 合同维护 → 填写合同 + 付款阶段 → 暂存 → 提交；
2. `finmgr` 登录 → 审批中心 → 我的待办 → 处理（通过/驳回）；
   - 金额 ≥ 100 万：通过后转 `gm` 总经理审批；
3. `finance` 登录 → 开票录入 → 选择合同、分摊付款阶段 → 提交 → `finmgr` 审批；
   - 开票通过后自动联动付款阶段开票状态（B-01）；
4. `finance` → 收款录入 → 登记收款，自动联动开票收款状态（B-02）、合同结清（B-03/R-10）；
5. 报表中心查看合同执行 / 部门统计 / 已开票未收款。

## 6. 本体模型映射

- 对象模型 M1 → `schema.sql` 业务表（含 5 默认字段 created_by/created_at/updated_by/updated_at/flag）
- 行为模型 M2 → `services/*_service.py` 方法 + `api/*.py`
- 规则模型 M3 → `services/domain_rules.py` + `utils/rules.py` + 流程网关规则求值
- 主体模型 M5 → 种子角色/权限（`seed.py`）
- 流程模型 M6 → `models/m6-flow-model.yaml` nodeGraph → `flow_definition`
- 查询报表 M7 → `services/report_service.py`
- UI 模型 MU → 菜单（`sys_resource`）+ 前端页面

## 7. 编号与默认字段约定

- 业务编号：对象别名前 3 位大写 + 4 位流水号（合同 `CON0001`、开票 `INV0001`、收款 `REC0001`、产品 `PRO0001` 等），由 `utils/codegen.py` 事务内自动生成；
- 所有业务表含 `created_by/created_at/updated_by/updated_at/flag` 五个默认字段，界面不显示、写入时自动赋值。

## 8. 自测

```bash
cd backend
python smoke_test.py      # 覆盖主数据、合同提交/两级审批/驳回、开票审批联动、收款/冲销、报表、AI 对话
```

## 9. 目录结构

```
code-app/
├── models/                  # 合同领域本体模型（M1/M2/M3/M5/M6/M7/MU + manifest）
├── backend/
│   ├── app.py  schema.sql  seed.py  db.py  config.yaml
│   ├── ontology/registry.py # 运行时语义注册表（含 RULE/REPORT/M6 nodeGraph）
│   ├── engine/flow_engine.py # 工作流引擎（网关规则求值/审批结果路由）
│   ├── services/            # 合同/开票/收款/主数据/报表/同步联动/工作台/领域规则
│   ├── api/                 # REST 接口 + AI 对话
│   ├── ai/  sql_readonly/   # AI 编排层 + 只读 SQL 白名单
│   └── utils/               # 编号生成、规则求值、JWT
└── frontend/src/            # React 页面 + AI 对话组件
```
