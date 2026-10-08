// 视觉体系移植自 gopherforge (https://github.com/SuperiorChuo/gopherforge) MIT License,适配 OPIC 技术底座。
// 用户工作台布局:与管理控制台同一套玻璃外壳(.app-sider 渐变玻璃 + .app-header 60px 玻璃条
// + 环境光 + 路由 fade-in),并保留多页签栏(重刷为玻璃胶囊风,当前页渐变底)。
// 右侧为可折叠 AI 工作区占位(.app-chat,折叠态持久化到 localStorage,折叠后内容区自动加宽)。
// 主题作用域:[data-glass][data-theme] 统一挂在 App 根节点;antd 双主题经 GlassConfigProvider 注入。
import { useEffect, useMemo, useState } from 'react'
import { Layout, Menu, Avatar, Dropdown, Tabs, Space, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  TeamOutlined,
  UserAddOutlined,
  SearchOutlined,
  SnippetsOutlined,
  InboxOutlined,
  CheckSquareOutlined,
  FileTextOutlined,
  BranchesOutlined,
  DeploymentUnitOutlined,
  UnorderedListOutlined,
  OrderedListOutlined,
  SettingOutlined,
  UserOutlined,
  SafetyOutlined,
  KeyOutlined,
  MenuOutlined,
  FolderOutlined,
  LogoutOutlined,
  DownOutlined,
  ControlOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SunOutlined,
  MoonOutlined,
  ApartmentOutlined,
  RobotOutlined,
  CommentOutlined,
  DoubleRightOutlined,
} from '@ant-design/icons'
import { useSelector } from 'react-redux'
import { authApi, type MenuItem } from '../api/auth'
import { assistantApi } from '../api/assistant'
import AIChatWorkspace from '../components/AIChatWorkspace'
import { clearToken } from '../api/request'
import { clearAuth } from '../store/slices/authSlice'
import { store } from '../store'
import type { RootState } from '../store'
import { isAdminPermissions } from '../admin/access'
import { useThemeMode } from '../theme/ThemeContext'
import GlassConfigProvider from '../theme/GlassConfigProvider'

/** AI 工作区折叠态持久化键('1' = 折叠) */
const CHAT_COLLAPSED_KEY = 'opic_workbench_chat_collapsed'

/** 后端图标英文名 → antd 图标映射,缺省目录 FolderOutlined / 叶子 UnorderedListOutlined */
const ICON_MAP: Record<string, React.ComponentType<{ style?: React.CSSProperties }>> = {
  Users: TeamOutlined,
  UserPlus: UserAddOutlined,
  Search: SearchOutlined,
  ClipboardList: SnippetsOutlined,
  Inbox: InboxOutlined,
  CheckSquare: CheckSquareOutlined,
  FileText: FileTextOutlined,
  GitBranch: BranchesOutlined,
  Workflow: DeploymentUnitOutlined,
  List: UnorderedListOutlined,
  ListChecks: OrderedListOutlined,
  Settings: SettingOutlined,
  User: UserOutlined,
  Shield: SafetyOutlined,
  Key: KeyOutlined,
  Menu: MenuOutlined,
}

function renderIcon(name: string | null | undefined, isDir: boolean) {
  const Comp = ICON_MAP[name || ''] || (isDir ? FolderOutlined : UnorderedListOutlined)
  return <Comp />
}

type AntdMenuItem = Required<MenuProps>['items'][number]

/** 工作台菜单过滤:移除 path 以 /flow /system /admin 开头的分组与叶子(这些已移入管理控制台) */
function filterWorkbenchMenus(menus: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = []
  for (const m of menus) {
    if (m.path && (m.path.startsWith('/flow') || m.path.startsWith('/system') || m.path.startsWith('/admin'))) continue
    if (m.children?.length) {
      const kids = filterWorkbenchMenus(m.children)
      // 原是分组且过滤后无子项 → 整组移除
      if ((m.type === 'DIRECTORY' || (!m.type && m.children?.length)) && kids.length === 0) continue
      out.push({ ...m, children: kids })
    } else {
      out.push(m)
    }
  }
  return out
}

function buildMenuItems(menus: MenuItem[]): AntdMenuItem[] {
  return menus.map((m) => {
    const isDir = m.type === 'DIRECTORY' || (!m.type && !!m.children?.length)
    if (isDir && m.children?.length) {
      return {
        key: `dir-${m.id}`,
        icon: renderIcon(m.icon, true),
        label: m.name,
        children: m.children.map((c) => ({
          key: c.path || `menu-${c.id}`,
          icon: renderIcon(c.icon, false),
          label: c.name,
        })),
      }
    }
    return {
      key: m.path || `menu-${m.id}`,
      icon: renderIcon(m.icon, isDir),
      label: m.name,
    }
  })
}

function collectLabels(menus: MenuItem[], map: Map<string, string>) {
  for (const m of menus) {
    if (m.path) map.set(m.path, m.name)
    if (m.children) collectLabels(m.children, map)
  }
}

const { Sider, Header, Content } = Layout

function WorkbenchShell() {
  const user = useSelector((s: RootState) => s.auth.user)
  const menus = useSelector((s: RootState) => s.auth.menus)
  const permissions = useSelector((s: RootState) => s.auth.permissions)
  const navigate = useNavigate()
  const location = useLocation()
  const { mode, toggle: toggleTheme } = useThemeMode()
  const [collapsed, setCollapsed] = useState(false)
  const [tabs, setTabs] = useState<{ key: string; label: string }[]>([])
  const [chatCollapsed, setChatCollapsed] = useState(() => {
    try {
      return localStorage.getItem(CHAT_COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })

  // AI 工作区折叠态持久化
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_COLLAPSED_KEY, chatCollapsed ? '1' : '0')
    } catch {
      /* 存储不可用时忽略,仅本次会话生效 */
    }
  }, [chatCollapsed])

  const labelMap = useMemo(() => {
    const map = new Map<string, string>()
    collectLabels(menus, map)
    return map
  }, [menus])

  const pathLabel = (path: string): string => {
    if (labelMap.has(path)) return labelMap.get(path)!
    if (path.startsWith('/flow/designer/')) return '流程设计'
    return path
  }

  // 多页签:记录访问过的路由
  useEffect(() => {
    const label = pathLabel(location.pathname)
    setTabs((prev) => (prev.some((t) => t.key === location.pathname) ? prev : [...prev, { key: location.pathname, label }]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, labelMap])

  const closeTab = (key: string) => {
    const idx = tabs.findIndex((t) => t.key === key)
    const next = tabs.filter((t) => t.key !== key)
    setTabs(next)
    if (location.pathname === key) {
      const target = next[idx] || next[idx - 1]
      navigate(target ? target.key : '/customer/apply')
    }
  }

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch {
      // 忽略登出接口错误,本地清理后跳转
    }
    clearToken()
    store.dispatch(clearAuth())
    navigate('/login')
  }

  const canManage = isAdminPermissions(permissions)

  const userMenu: MenuProps['items'] = [
    {
      key: 'name',
      disabled: true,
      label: (
        <div style={{ cursor: 'default' }}>
          <div style={{ fontWeight: 600 }}>{user?.real_name || user?.username || '-'}</div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>{user?.username || ''}</div>
        </div>
      ),
    },
    { type: 'divider' },
    ...(canManage
      ? [
          {
            key: 'admin',
            icon: <ControlOutlined />,
            label: '管理控制台',
            onClick: () => navigate('/admin/dashboard'),
          },
          { type: 'divider' as const },
        ]
      : []),
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
      danger: true,
    },
  ]

  const menuItems = useMemo(() => buildMenuItems(filterWorkbenchMenus(menus)), [menus])

  // 当前选中菜单(设计器页面高亮流程定义)
  const selectedKey = location.pathname.startsWith('/flow/designer/')
    ? '/flow/definitions'
    : location.pathname

  const toggleChat = () => setChatCollapsed((v) => !v)

  return (
    <Layout className="app-shell app-shell-user" hasSider>
      <Sider
        className="app-sider"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={224}
        collapsedWidth={80}
      >
        <div className="app-logo">
          <div className="app-logo-mark">
            <ApartmentOutlined />
          </div>
          {!collapsed && <span className="app-logo-text">OPIC 工作台</span>}
        </div>
        <div className="app-menu-scroll">
          <Menu
            theme={mode === 'dark' ? 'dark' : 'light'}
            mode="inline"
            items={menuItems}
            selectedKeys={[selectedKey]}
            onClick={({ key }) => {
              if (key.startsWith('/')) navigate(key)
            }}
          />
        </div>
      </Sider>

      <Layout className="app-main">
        <Header className="app-header">
          <Space size={16} className="app-header-leading">
            <span
              className="app-trigger"
              onClick={() => setCollapsed(!collapsed)}
              role="button"
              tabIndex={0}
              aria-label={collapsed ? '展开导航菜单' : '收起导航菜单'}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                setCollapsed(!collapsed)
              }}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </span>
            <span className="app-header-title">用户工作台</span>
            {canManage && (
              <Tooltip title="进入管理控制台">
                <button
                  type="button"
                  className="app-header-link"
                  onClick={() => navigate('/admin/dashboard')}
                >
                  <ControlOutlined />
                  <span>管理控制台</span>
                </button>
              </Tooltip>
            )}
          </Space>

          <Space size={8} className="app-header-actions">
            <Tooltip title={chatCollapsed ? '展开 AI 助理' : '收起 AI 助理'}>
              <span
                className={`app-trigger${chatCollapsed ? '' : ' is-active'}`}
                onClick={toggleChat}
                role="button"
                tabIndex={0}
                aria-label={chatCollapsed ? '展开 AI 助理' : '收起 AI 助理'}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  e.preventDefault()
                  toggleChat()
                }}
              >
                <CommentOutlined />
              </span>
            </Tooltip>
            <span
              className="app-trigger"
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                toggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
              }}
              title={mode === 'dark' ? '切换为白蓝亮色' : '切换为深空暗色'}
            >
              {mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
            </span>
            <Dropdown placement="bottomRight" trigger={['click']} menu={{ items: userMenu }}>
              <div className="app-user">
                <Avatar
                  size={34}
                  icon={<UserOutlined />}
                  style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}
                />
                <span className="app-user-name">{user?.real_name || user?.username || '-'}</span>
                <DownOutlined style={{ fontSize: 10, opacity: 0.55 }} />
              </div>
            </Dropdown>
          </Space>
        </Header>

        {/* 多页签栏:玻璃胶囊风(样式见 user-workbench.css) */}
        <div className="user-tabs">
          <Tabs
            type="editable-card"
            size="small"
            hideAdd
            activeKey={location.pathname}
            items={tabs.map((t) => ({ key: t.key, label: t.label, closable: tabs.length > 0 }))}
            onChange={(k) => navigate(k)}
            onEdit={(targetKey, action) => {
              if (action === 'remove') closeTab(String(targetKey))
            }}
          />
        </div>

        <div className="app-content-glow" />
        <Content className="app-content user-content" style={{ position: 'relative', zIndex: 1 }}>
          <div className="page-fade-in" key={location.pathname}>
            <Outlet />
          </div>
        </Content>
      </Layout>

      {/* AI 工作区(共享组件;控制台同款):折叠后内容区经 flex 自动加宽 */}
      <AIChatWorkspace collapsed={chatCollapsed} onToggle={toggleChat} />
    </Layout>
  )
}

/** 用户工作台布局根节点:玻璃双主题 antd 配置子树注入(mode 来自 App 级 ThemeProvider) */
export default function UserLayout() {
  return (
    <GlassConfigProvider>
      <WorkbenchShell />
    </GlassConfigProvider>
  )
}
