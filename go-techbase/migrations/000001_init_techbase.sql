-- go-techbase 数据库结构(PostgreSQL 16)—— goose 迁移 000001(初始 schema)
-- 由 OPIC-数据服务域(Pigsty v4.5)部署的 PostgreSQL 16 承载;连接串经数据服务域自助申请获取。
-- 对齐《系统管理+流程引擎需求规格说明书》第 3 章;与 Python techbase schema.sql 同构。
-- 时间列统一 TEXT,默认 to_char(now(),'YYYY-MM-DD HH24:MI:SS'),与 Python 版输出格式一致。
-- 全部 CREATE 带 IF NOT EXISTS,兼容旧库存量数据(goose 仅记账不重复执行)。

-- +goose Up

-- ============ 系统管理(RBAC + ABAC,对应 M5) ============

CREATE TABLE IF NOT EXISTS sys_user (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    real_name VARCHAR(50),
    email VARCHAR(100),
    phone VARCHAR(20),
    actor_type VARCHAR(20) DEFAULT 'HUMAN',
    department_id BIGINT,
    status SMALLINT DEFAULT 1,
    created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    updated_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS sys_role (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    parent_id BIGINT DEFAULT 0,
    description VARCHAR(255),
    status SMALLINT DEFAULT 1,
    created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    updated_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS sys_permission (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    target_type VARCHAR(20) NOT NULL,
    target_ref VARCHAR(100) NOT NULL,
    data_scope VARCHAR(20) DEFAULT 'ALL',
    abac_condition VARCHAR(255),
    status SMALLINT DEFAULT 1,
    created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS sys_resource (
    id BIGSERIAL PRIMARY KEY,
    parent_id BIGINT DEFAULT 0,
    name VARCHAR(50) NOT NULL,
    code VARCHAR(100) UNIQUE NOT NULL,
    permission_code VARCHAR(100),
    type VARCHAR(20) NOT NULL,
    path VARCHAR(200),
    component VARCHAR(200),
    icon VARCHAR(50),
    http_method VARCHAR(10),
    sort_order INTEGER DEFAULT 0,
    status SMALLINT DEFAULT 1,
    created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    updated_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS sys_user_role (
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS sys_role_permission (
    role_id BIGINT NOT NULL,
    permission_id BIGINT NOT NULL,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS sys_role_resource (
    role_id BIGINT NOT NULL,
    resource_id BIGINT NOT NULL,
    PRIMARY KEY (role_id, resource_id)
);

-- ============ 流程引擎(对应 M6) ============

CREATE TABLE IF NOT EXISTS flow_definition (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    flow_type VARCHAR(20) NOT NULL,
    trigger_type VARCHAR(20) DEFAULT 'MANUAL',
    trigger_behavior VARCHAR(100),
    description VARCHAR(255),
    node_graph TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    status SMALLINT DEFAULT 0,
    created_by BIGINT,
    created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    updated_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS flow_instance (
    id BIGSERIAL PRIMARY KEY,
    def_id BIGINT NOT NULL,
    business_key VARCHAR(50) NOT NULL,
    business_object_refs TEXT,
    current_activity_ids TEXT,
    variables TEXT,
    creator_id BIGINT NOT NULL,
    status VARCHAR(20) DEFAULT 'RUNNING',
    priority INTEGER DEFAULT 0,
    started_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    ended_at TEXT,
    updated_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS flow_task (
    id BIGSERIAL PRIMARY KEY,
    instance_id BIGINT NOT NULL,
    activity_id VARCHAR(50) NOT NULL,
    activity_type VARCHAR(20) NOT NULL,
    activity_name VARCHAR(100),
    role_ref VARCHAR(50),
    behavior_ref VARCHAR(100),
    sub_flow_ref VARCHAR(100),
    assignee_id BIGINT,
    assignee_name VARCHAR(50),
    status VARCHAR(20) DEFAULT 'TODO',
    action VARCHAR(20),
    comment TEXT,
    created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    claimed_at TEXT,
    done_at TEXT,
    deadline TEXT
);

CREATE TABLE IF NOT EXISTS flow_history (
    id BIGSERIAL PRIMARY KEY,
    instance_id BIGINT NOT NULL,
    activity_id VARCHAR(50),
    activity_name VARCHAR(100),
    operator_id BIGINT,
    operator_name VARCHAR(50),
    action VARCHAR(20),
    comment TEXT,
    from_activity VARCHAR(50),
    to_activity VARCHAR(50),
    created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ============ 审计日志 ============

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT,
    username VARCHAR(50),
    action VARCHAR(100),
    detail TEXT,
    created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ============ 示例业务表:客户申请 ============

CREATE TABLE IF NOT EXISTS customer_application (
    id BIGSERIAL PRIMARY KEY,
    customer_no VARCHAR(50) UNIQUE,
    customer_name VARCHAR(100) NOT NULL,
    customer_type VARCHAR(20),
    industry VARCHAR(50),
    contact_person VARCHAR(50),
    contact_phone VARCHAR(20),
    customer_level VARCHAR(20),
    address VARCHAR(200),
    remark VARCHAR(500),
    status VARCHAR(30) DEFAULT '草稿',
    applicant_id BIGINT,
    applicant_name VARCHAR(50),
    instance_id BIGINT,
    created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    updated_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- +goose Down

DROP TABLE IF EXISTS customer_application;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS flow_history;
DROP TABLE IF EXISTS flow_task;
DROP TABLE IF EXISTS flow_instance;
DROP TABLE IF EXISTS flow_definition;
DROP TABLE IF EXISTS sys_role_resource;
DROP TABLE IF EXISTS sys_role_permission;
DROP TABLE IF EXISTS sys_user_role;
DROP TABLE IF EXISTS sys_resource;
DROP TABLE IF EXISTS sys_permission;
DROP TABLE IF EXISTS sys_role;
DROP TABLE IF EXISTS sys_user;
