-- go-techbase 管理控制台补齐(gopherforge 基准):公告表 + 管理菜单资源(幂等)
-- +goose Up
CREATE TABLE IF NOT EXISTS sys_notice (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    content TEXT,
    status INT DEFAULT 1,
    created_by BIGINT,
    created_by_name VARCHAR(50),
    created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    updated_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- 管理菜单资源(幂等;code 为业务键)
INSERT INTO sys_resource (parent_id, name, code, permission_code, type, path, component, icon, sort_order, status)
SELECT 0, '日志审计', 'menu-logs', 'system:manage', 'DIRECTORY', '', NULL, 'FileText', 45, 1
WHERE NOT EXISTS (SELECT 1 FROM sys_resource WHERE code = 'menu-logs');
INSERT INTO sys_resource (parent_id, name, code, permission_code, type, path, component, icon, sort_order, status)
SELECT r.id, x.name, x.code, 'system:manage', 'MENU', x.path, NULL, x.icon, x.sort, 1
FROM sys_resource r
CROSS JOIN (VALUES
  ('操作日志', 'menu-logs-operation', '/admin/logs/operation', 'FileText', 1),
  ('登录日志', 'menu-logs-login', '/admin/logs/login', 'LoginOutlined', 2),
  ('审计日志', 'menu-logs-audit', '/admin/logs/audit', 'SafetyOutlined', 3),
  ('在线用户', 'menu-logs-online', '/admin/online-users', 'MonitorOutlined', 4)
) AS x(name, code, path, icon, sort)
WHERE r.code = 'menu-logs' AND NOT EXISTS (SELECT 1 FROM sys_resource WHERE code = x.code);
INSERT INTO sys_resource (parent_id, name, code, permission_code, type, path, component, icon, sort_order, status)
SELECT 0, '消息中心', 'menu-msg', 'system:manage', 'DIRECTORY', '', NULL, 'Notification', 46, 1
WHERE NOT EXISTS (SELECT 1 FROM sys_resource WHERE code = 'menu-msg');
INSERT INTO sys_resource (parent_id, name, code, permission_code, type, path, component, icon, sort_order, status)
SELECT r.id, x.name, x.code, 'system:manage', 'MENU', x.path, NULL, x.icon, x.sort, 1
FROM sys_resource r
CROSS JOIN (VALUES ('公告管理', 'menu-msg-notice', '/admin/notice', 'Notification', 1)) AS x(name, code, path, icon, sort)
WHERE r.code = 'menu-msg' AND NOT EXISTS (SELECT 1 FROM sys_resource WHERE code = x.code);
INSERT INTO sys_resource (parent_id, name, code, permission_code, type, path, component, icon, sort_order, status)
SELECT 0, '系统工具', 'menu-tools', 'system:manage', 'DIRECTORY', '', NULL, 'Tool', 47, 1
WHERE NOT EXISTS (SELECT 1 FROM sys_resource WHERE code = 'menu-tools');
INSERT INTO sys_resource (parent_id, name, code, permission_code, type, path, component, icon, sort_order, status)
SELECT r.id, x.name, x.code, 'system:manage', 'MENU', x.path, NULL, x.icon, x.sort, 1
FROM sys_resource r
CROSS JOIN (VALUES
  ('错误码管理', 'menu-tools-errcode', '/admin/errcodes', 'WarningOutlined', 1),
  ('系统监控', 'menu-tools-monitor', '/admin/monitor', 'CloudServerOutlined', 2)
) AS x(name, code, path, icon, sort)
WHERE r.code = 'menu-tools' AND NOT EXISTS (SELECT 1 FROM sys_resource WHERE code = x.code);

-- +goose Down
DELETE FROM sys_resource WHERE code IN ('menu-logs','menu-logs-operation','menu-logs-login','menu-logs-audit','menu-logs-online','menu-msg','menu-msg-notice','menu-tools','menu-tools-errcode','menu-tools-monitor');
DROP TABLE IF EXISTS sys_notice;
