# ontology-driven-dev

> 一套「需求探索 → 本体建模 → 应用构建」三步法的**本体驱动业务系统开发技能**。
> 基于七模型本体 YAML（M1/M2/M3/M5/M6/M7/MU）与内置 `code-paas` 技术底座，强制每个需求探索阶段人工确认，最终产出**严格对齐需求文档、本体模型与代码**的可运行浏览器前后端（BS）系统。

[English version → README_EN.md](./README_EN.md)

---

## 一、这个技能能做什么

把一段业务需求（一句话或一段描述）变成一套**可运行的管理系统**，且保证：

- **需求可追溯**：每个功能都能回溯到需求文档的某个条目；
- **模型即语义来源**：数据库表、接口、菜单、权限、流程、规则全部由七模型 YAML 生成，杜绝"模型一套、代码一套"；
- **人工门禁不可跳过**：需求探索的 8 个阶段，每一阶段都必须**暂停等人确认**后才推进；
- **开箱即用的技术底座**：内置 `code-paas`（Flask + SQLite + React/TS 单体应用，含系统管理、流程引擎、工作台、本体注册表），复制即可扩展；
- **强制 AI 对话框**：生成的应用右侧自带 AI 对话（本体注册表注入 + 工具调用 + SSE 流式 + 只读 SQL 安全边界）。

---

## 二、包含内容

```
ontology-driven-dev/
├── SKILL.md                      # 技能核心指令（方法论 + 三阶段管线 + 纪律）
├── references/                   # 5 份方法论文档（强制规范）
│   ├── AI需求探索与确认提示词V9.0.md      # 含《软件需求编写规范 V9.0》全文
│   ├── ontology_modeling_framework_v9.md  # 七模型元规范 + YAML 模板
│   ├── 本体模型业务功能开发指导书.md        # 模型→实现映射、开发流水线 10 步
│   ├── AI原生应用技术架构设计文档.md        # 技术栈 / 语义注册表 / AI 编排 / SSE
│   └── UI-UE界面设计规范.md               # 配色 token / 布局 / 完整 CSS 库
├── reference-example/            # 黄金范例（销售合同执行管理跑通实物）
│   ├── 合同管理需求规格说明书-V9.md
│   ├── m1-object-model.yaml … m7-report-model.yaml + mu-ui-model.yaml
│   └── manifest.json
├── techbase/                     # code-paas 干净源码（复制到 code-app 后扩展）
    ├── backend/                  # Flask + SQLite 后端（流程引擎 / 本体注册表 / 服务层）
    ├── frontend/                 # React + TypeScript 前端（Vite）
    ├── models/                   # 示例七模型 YAML（正式使用时替换为你的模型）
    ├── requirements.txt
    └── README.md                 # 底座运行说明
└── code-app-example/             # 基于七模型生成的销售合同执行管理完整应用样例
    ├── models/                   # 合同领域七模型 YAML + manifest
    ├── backend/                  # 业务服务、流程、报表、AI 助手及测试数据库
    ├── frontend/                 # 合同、开票、收款、审批及报表页面
    └── README.md                 # 样例功能、账号、启动与自测说明
```

### 完整应用样例

`code-app-example/` 展示了从需求规格、七模型本体到可运行系统的完整落地结果。样例业务为销售合同执行管理，覆盖合同登记与分级审批、开票审批、收款及冲销、跨对象状态联动、固定报表、系统管理和右侧 AI 智能助理。

样例自带 SQLite 测试数据和默认测试账号，可按 [`code-app-example/README.md`](./code-app-example/README.md) 的说明直接启动和验证完整业务链路。仓库中的 AI API Key 已清空，使用智能助理前需在系统界面中自行配置 OpenAI 兼容的大模型服务。

---

## 三、安装（主流工具）

> 本技能**不依赖任何 WorkBuddy 专有机制**，可完整运行在 Claude Code、Codex、Cursor 等工具上。
> 唯一适配点：技能内相对路径以「本 SKILL.md 所在文件夹」为根，各工具会自动解析。

### 1. WorkBuddy

```bash
# 用户级（所有项目可用）
cp -r ontology-driven-dev ~/.workbuddy/skills/ontology-driven-dev

# 或项目级（仅当前项目）
cp -r ontology-driven-dev <你的项目>/.workbuddy/skills/ontology-driven-dev
```

在 WorkBuddy 对话中直接说触发语即可（见第五节）。

### 2. Claude Code

Claude Code 的 Skills 格式与本技能 frontmatter（`name` / `description`）完全一致，基本**直接复制**即可：

```bash
# 用户级
cp -r ontology-driven-dev ~/.claude/skills/ontology-driven-dev

# 或项目级
cp -r ontology-driven-dev .claude/skills/ontology-driven-dev
```

Claude Code 会自动发现 `.claude/skills/<name>/SKILL.md` 并按其流程执行。

### 3. Codex

Codex 没有原生 skill 注册表，但能加载仓库内的指令文件并在沙箱中执行 bash：

```bash
# 把技能放进仓库（目录名随意）
mkdir -p .codex/skills && cp -r ontology-driven-dev .codex/skills/
```

然后在仓库的 `codex.md`（或 `AGENTS.md`）中加入一句：

> 当用户要做「本体驱动开发 / 需求探索 / 本体建模 / 七模型 / code-paas / AI 原生应用」时，
> 加载 `.codex/skills/ontology-driven-dev/SKILL.md` 并严格按其「三阶段 + 人工确认门禁」流程执行。

Codex 会把每阶段的人工确认映射为交互式提问/审批。注意：沙箱需联网以完成 `npm install` / `pip install`。

### 4. Cursor / Aider / Cline / 其他通用 Agent

把 `SKILL.md` 当作「方法论指令文件」注入项目上下文即可：
- Cursor：放入 `.cursorrules` 或项目规则；
- Cline / Aider：在对话开头粘贴 `SKILL.md` 全文，或引用其路径；
- 任何支持「系统指令 / 项目记忆」的 agent：加载本 SKILL.md 即可。

---

## 四、使用流程（详细）

技能分**强顺序三阶段**，每阶段之间及阶段一内部都必须人工确认。

### 阶段一：需求探索 → 软件需求规格说明书
- **依据**：`references/AI需求探索与确认提示词V9.0.md`（含《软件需求编写规范 V9.0》全文）。
- **推进**：按「阶段零 ∼ 阶段七」八阶段——总体理解 → 业务对象 → 业务功能与规则 → 跨对象联动 → 端到端协同/审批流 → 查询统计与报表 → 角色权限 → UI 原型（可选）。
- **门禁**：每个阶段结束必须按「问题 + AI 建议 + 理由 + 其他选项 + 快捷回复」格式提问，并**硬暂停等人确认**；企业专属（B 类）内容必须带 AI 建议提问，未确认不得进入下一阶段。
- **产出**：`<业务域>-需求规格说明书-V9.md`（含附录 C 七模型建模输入基线）。

### 阶段二：本体建模 → 七模型 YAML
- **依据**：`references/ontology_modeling_framework_v9.md`。
- **输入**：阶段一需求文档的附录 C 基线（确定性输入，不再做大范围业务拆分）。
- **产物**：M1 对象 / M2 行为 / M3 规则 / M5 主体 / M6 流程 / M7 查询报表 / MU UI 共七个 YAML + `manifest.json`，输出到 `yaml/`。
- **一致性门禁**：可追溯性、M7↔M2 一对一、M6 引用无环等强制核对。

### 阶段三：应用构建 → 可运行 BS 系统
- **技术底座**：将 `techbase/` 整体复制到当前项目的 `code-app/`：
  ```bash
  cp -r <技能根目录>/techbase/. <当前项目>/code-app/
  cd <当前项目>/code-app/frontend && npm install
  cd <当前项目>/code-app/backend  && pip install -r requirements.txt
  ```
- **开发顺序**（指导书 10 步）：写七模型 YAML → 生成 DDL/表 → 注册数据字典 → 行为+规则服务 → 角色权限种子 → 流程引擎 → 菜单页面路由 → **强制实现右侧 AI 对话框** → 全链路联调 → 验收。
- **运行**：
  ```bash
  # 后端
  cd code-app/backend && pip install -r requirements.txt && python app.py   # http://localhost:5000
  # 前端开发
  cd code-app/frontend && npm install && npm run dev                       # http://localhost:5173
  ```
- **默认账号**：`admin / admin123`（详见 `techbase/README.md`）。

---

## 五、触发语（直接对 agent 说）

| 意图 | 示例 |
|---|---|
| 整体开发 | 「帮我开发一个 XX 管理系统」「把这段需求做成本体驱动开发」 |
| 仅建模 | 「基于这份需求规格说明书，做本体建模」 |
| 仅构建 | 「基于这几份七模型 YAML，生成系统」 |
| 关键字 | 本体驱动、需求探索、本体建模、七模型、code-paas、AI 原生应用、业务系统开发 |

---

## 六、运行环境要求

- Python 3.10+（后端 Flask + SQLite）
- Node.js 18+（前端 React + Vite）
- 首次运行需联网执行 `npm install` / `pip install`

---

## 七、许可

本项目以 **MIT License** 发布，可自由使用、修改与再分发，详见 [LICENSE](./LICENSE)。
（技术底座 `code-paas` 同样遵循 MIT。）
