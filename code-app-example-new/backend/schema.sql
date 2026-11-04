-- 技术底座数据库结构（SQLite）
-- 对齐《系统管理+流程引擎需求规格说明书》第 3 章

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

-- ============ 业务：合同管理（M1 OBJ-001 / OBJ-002 / OBJ-003 / OBJ-004） ============

-- MDM-003 部门
CREATE TABLE IF NOT EXISTS mdm_department (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dept_no VARCHAR(20) UNIQUE NOT NULL,
    dept_name VARCHAR(50) UNIQUE NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    flag TINYINT DEFAULT 1
);

-- MDM-001 产品
CREATE TABLE IF NOT EXISTS mdm_product (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_no VARCHAR(20) UNIQUE NOT NULL,
    product_type VARCHAR(20) NOT NULL,
    product_name VARCHAR(100) UNIQUE NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    flag TINYINT DEFAULT 1
);

-- MDM-002 客户
CREATE TABLE IF NOT EXISTS mdm_customer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_no VARCHAR(20) UNIQUE NOT NULL,
    customer_type VARCHAR(20) NOT NULL,
    customer_name VARCHAR(100) UNIQUE NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    flag TINYINT DEFAULT 1
);

-- MDM-004 人员
CREATE TABLE IF NOT EXISTS mdm_person (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_no VARCHAR(20) UNIQUE NOT NULL,
    person_name VARCHAR(50) NOT NULL,
    dept_no VARCHAR(20) NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    flag TINYINT DEFAULT 1
);

-- DIC-001 / DIC-004 / DIC-005 / DIC-006 可维护字典项（DIC-002 / DIC-003 只读，不落此表）
CREATE TABLE IF NOT EXISTS dict_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dict_type VARCHAR(30) NOT NULL,
    dict_code VARCHAR(20) NOT NULL,
    dict_name VARCHAR(50) NOT NULL,
    sort_no INTEGER DEFAULT 0,
    enabled VARCHAR(2) DEFAULT '是',
    system_flag TINYINT DEFAULT 0,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    flag TINYINT DEFAULT 1,
    UNIQUE (dict_type, dict_code)
);

-- OBJ-001 合同
CREATE TABLE IF NOT EXISTS contract (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_no VARCHAR(20) UNIQUE NOT NULL,
    contract_name VARCHAR(100) NOT NULL,
    product_no VARCHAR(20) NOT NULL,
    customer_no VARCHAR(20) NOT NULL,
    dept_no VARCHAR(20) NOT NULL,
    contract_type VARCHAR(20) NOT NULL,
    sign_date DATE NOT NULL,
    owner_no VARCHAR(20) NOT NULL,
    total_amount DECIMAL(18,2) NOT NULL,
    purchase_amount DECIMAL(18,2) DEFAULT 0,
    tax_rate DECIMAL(5,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    effective_time DATETIME,
    close_time DATETIME,
    invoiced_amount DECIMAL(18,2) DEFAULT 0,
    received_amount DECIMAL(18,2) DEFAULT 0,
    instance_id INTEGER,
    submit_by INTEGER,
    submit_by_name VARCHAR(50),
    submit_at DATETIME,
    last_comment VARCHAR(200),
    remark VARCHAR(200),
    created_by INTEGER,
    created_by_name VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    flag TINYINT DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_contract_dept ON contract (dept_no);
CREATE INDEX IF NOT EXISTS idx_contract_status ON contract (status);
CREATE INDEX IF NOT EXISTS idx_contract_sign ON contract (sign_date);

-- OBJ-002 合同付款条款（从表）
CREATE TABLE IF NOT EXISTS contract_stage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL,
    stage_no VARCHAR(10) NOT NULL,
    stage_name VARCHAR(50) NOT NULL,
    ratio DECIMAL(5,2) NOT NULL,
    stage_amount DECIMAL(18,2) NOT NULL,
    pay_condition VARCHAR(200) NOT NULL,
    invoice_status VARCHAR(10) NOT NULL DEFAULT '未开票',
    invoice_no VARCHAR(20),
    remark VARCHAR(200),
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    flag TINYINT DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_stage_contract ON contract_stage (contract_id);

-- OBJ-003 合同开票
CREATE TABLE IF NOT EXISTS contract_invoice (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_no VARCHAR(20) UNIQUE NOT NULL,
    contract_no VARCHAR(20) NOT NULL,
    stage_no VARCHAR(10) NOT NULL,
    invoice_amount DECIMAL(18,2) NOT NULL,
    tax_rate DECIMAL(5,2) NOT NULL,
    invoice_date DATE NOT NULL,
    receive_status VARCHAR(20) NOT NULL DEFAULT 'UNRECEIVED',
    received_amount DECIMAL(18,2) DEFAULT 0,
    unreceived_amount DECIMAL(18,2) DEFAULT 0,
    last_receive_date DATE,
    invoice_by VARCHAR(50),
    remark VARCHAR(200),
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    flag TINYINT DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_invoice_contract ON contract_invoice (contract_no);

-- OBJ-004 合同收款
CREATE TABLE IF NOT EXISTS contract_receipt (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receive_no VARCHAR(20) UNIQUE NOT NULL,
    contract_no VARCHAR(20) NOT NULL,
    invoice_no VARCHAR(20) NOT NULL,
    receive_amount DECIMAL(18,2) NOT NULL,
    receive_date DATE NOT NULL,
    receive_method VARCHAR(20),
    receive_by VARCHAR(50),
    remark VARCHAR(200),
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    flag TINYINT DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_receipt_contract ON contract_receipt (contract_no);
CREATE INDEX IF NOT EXISTS idx_receipt_invoice ON contract_receipt (invoice_no);

-- ============ AI 大模型配置（单行，配置项仅 base_url / api_key / model_id / max_tokens） ============

CREATE TABLE IF NOT EXISTS ai_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    base_url VARCHAR(200),
    api_key VARCHAR(400),
    model_id VARCHAR(100),
    max_tokens INTEGER DEFAULT 81920,
    updated_by INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
