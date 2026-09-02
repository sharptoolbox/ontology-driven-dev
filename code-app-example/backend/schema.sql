-- 技术底座数据库结构（SQLite）
-- 对齐《系统管理+流程引擎需求规格说明书》第 3 章 + 合同管理业务表

-- ============ 系统管理（RBAC + ABAC，对应 M5） ============

CREATE TABLE IF NOT EXISTS sys_user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    real_name VARCHAR(50),
    email VARCHAR(100),
    phone VARCHAR(20),
    actor_type VARCHAR(20) DEFAULT 'HUMAN',
    department_id INTEGER,
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_role (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(50) UNIQUE NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    parent_id INTEGER DEFAULT 0,
    description VARCHAR(255),
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_permission (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    target_type VARCHAR(20) NOT NULL,
    target_ref VARCHAR(100) NOT NULL,
    data_scope VARCHAR(20) DEFAULT 'ALL',
    abac_condition VARCHAR(255),
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_resource (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER DEFAULT 0,
    name VARCHAR(50) NOT NULL,
    code VARCHAR(100) UNIQUE NOT NULL,
    permission_code VARCHAR(100),
    type VARCHAR(20) NOT NULL,
    path VARCHAR(200),
    component VARCHAR(200),
    icon VARCHAR(50),
    http_method VARCHAR(10),
    sort_order INTEGER DEFAULT 0,
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_user_role (
    user_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS sys_role_permission (
    role_id INTEGER NOT NULL,
    permission_id INTEGER NOT NULL,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS sys_role_resource (
    role_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,
    PRIMARY KEY (role_id, resource_id)
);

-- ============ 流程引擎（对应 M6） ============

CREATE TABLE IF NOT EXISTS flow_definition (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    flow_type VARCHAR(20) NOT NULL,
    trigger_type VARCHAR(20) DEFAULT 'MANUAL',
    trigger_behavior VARCHAR(100),
    description VARCHAR(255),
    node_graph TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    status TINYINT DEFAULT 0,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS flow_instance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    def_id INTEGER NOT NULL,
    business_key VARCHAR(50) NOT NULL,
    business_object_refs TEXT,
    current_activity_ids TEXT,
    variables TEXT,
    creator_id INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'RUNNING',
    priority INTEGER DEFAULT 0,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS flow_task (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER NOT NULL,
    activity_id VARCHAR(50) NOT NULL,
    activity_type VARCHAR(20) NOT NULL,
    activity_name VARCHAR(100),
    role_ref VARCHAR(50),
    behavior_ref VARCHAR(100),
    sub_flow_ref VARCHAR(100),
    assignee_id INTEGER,
    assignee_name VARCHAR(50),
    status VARCHAR(20) DEFAULT 'TODO',
    action VARCHAR(20),
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    claimed_at DATETIME,
    done_at DATETIME,
    deadline DATETIME
);

CREATE TABLE IF NOT EXISTS flow_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER NOT NULL,
    activity_id VARCHAR(50),
    activity_name VARCHAR(100),
    operator_id INTEGER,
    operator_name VARCHAR(50),
    action VARCHAR(20),
    comment TEXT,
    from_activity VARCHAR(50),
    to_activity VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============ 审计日志 ============

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username VARCHAR(50),
    action VARCHAR(100),
    detail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============ AI 大模型配置（OpenAI 兼容，单行） ============

CREATE TABLE IF NOT EXISTS ai_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    base_url VARCHAR(255) DEFAULT 'https://api.deepseek.com',
    api_key VARCHAR(255) DEFAULT '',
    model_id VARCHAR(100) DEFAULT 'deepseek-chat',
    max_tokens INTEGER DEFAULT 81920,
    updated_by INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============ 业务表（合同管理域，均含 5 个默认字段） ============

CREATE TABLE IF NOT EXISTS product (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_no VARCHAR(50) UNIQUE NOT NULL,
    product_type VARCHAR(20),
    product_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT '在用',
    created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    flag TINYINT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS customer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_no VARCHAR(50) UNIQUE NOT NULL,
    customer_type VARCHAR(20),
    customer_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT '在用',
    created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    flag TINYINT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS department (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_no VARCHAR(50) UNIQUE NOT NULL,
    department_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT '在用',
    created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    flag TINYINT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS employee (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_no VARCHAR(50) UNIQUE NOT NULL,
    employee_name VARCHAR(50) NOT NULL,
    department_id INTEGER,
    status VARCHAR(20) DEFAULT '在用',
    created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    flag TINYINT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS contract (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_no VARCHAR(50) UNIQUE NOT NULL,
    contract_name VARCHAR(100) NOT NULL,
    product_id INTEGER,
    customer_id INTEGER,
    department_id INTEGER,
    contract_type VARCHAR(20),
    sign_date VARCHAR(20),
    owner_id INTEGER,
    total_amount REAL NOT NULL,
    purchase_amount REAL DEFAULT 0,
    tax_rate REAL DEFAULT 0,
    status VARCHAR(30) DEFAULT '草稿',
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    registrant_id INTEGER,
    instance_id INTEGER,
    created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    flag TINYINT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS contract_stage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL,
    stage_id VARCHAR(20) NOT NULL,
    stage_name VARCHAR(100) NOT NULL,
    pay_ratio REAL NOT NULL,
    stage_amount REAL DEFAULT 0,
    invoice_status VARCHAR(20) DEFAULT '未开票',
    created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    flag TINYINT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS invoice (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_no VARCHAR(50) UNIQUE NOT NULL,
    contract_id INTEGER,
    invoice_amount REAL NOT NULL,
    invoice_tax_rate REAL DEFAULT 0,
    invoice_date VARCHAR(20),
    received_flag INTEGER DEFAULT 0,
    received_amount REAL DEFAULT 0,
    received_date VARCHAR(30),
    approval_status VARCHAR(30) DEFAULT '草稿',
    instance_id INTEGER,
    created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    flag TINYINT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS invoice_allocation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    contract_id INTEGER,
    stage_id VARCHAR(20),
    allocated_amount REAL NOT NULL,
    created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    flag TINYINT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS receipt (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_no VARCHAR(50) UNIQUE NOT NULL,
    contract_id INTEGER,
    invoice_id INTEGER,
    receipt_amount REAL NOT NULL,
    receipt_time VARCHAR(30),
    receipt_method VARCHAR(20),
    status VARCHAR(20) DEFAULT '已登记',
    remark VARCHAR(500),
    created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    flag TINYINT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS approval_record (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    approval_no VARCHAR(50) UNIQUE NOT NULL,
    biz_type VARCHAR(20),
    biz_no VARCHAR(50),
    approval_node VARCHAR(50),
    approval_role_id VARCHAR(50),
    approver_id INTEGER,
    approval_result VARCHAR(20),
    approval_comment VARCHAR(500),
    approval_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    flag TINYINT DEFAULT 1
);
