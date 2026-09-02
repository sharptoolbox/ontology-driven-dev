import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronDown, ChevronRight, Cpu, KeyRound, LogOut, PanelLeftClose, PanelRightClose, User,
} from 'lucide-react'
import { useAuth } from '../stores/userStore'
import { MenuIcon } from '../utils/icons'
import AIChat from '../components/AIChat'
import ChangePasswordModal from '../components/ChangePasswordModal'
import LlmConfigModal from '../components/LlmConfigModal'
import type { MenuItem } from '../api/auth'

export default function AdminLayout() {
  const { user, menus, logout, permissions } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set())
  const [menuOpen, setMenuOpen] = useState(false)
  const [showChangePwd, setShowChangePwd] = useState(false)
  const [showLlmConfig, setShowLlmConfig] = useState(false)
  const [chatWidth, setChatWidth] = useState(400)
  const menuRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null)
  const [tabs, setTabs] = useState<{ path: string; title: string }[]>(() => {
    const t = findTabByPath(menus, location.pathname)
    return t ? [t] : []
  })

  const isAdmin = permissions.includes('*')
  const activePath = location.pathname

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const toggleGroup = (id: number) => {
    const next = new Set(collapsedGroups)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setCollapsedGroups(next)
  }

  const openTab = (path: string, title: string) => {
    navigate(path)
    setTabs((prev) => (prev.some((t) => t.path === path) ? prev : [...prev, { path, title }]))
  }

  const closeTab = (path: string) => {
    const idx = tabs.findIndex((t) => t.path === path)
    const next = tabs.filter((t) => t.path !== path)
    setTabs(next)
    if (activePath === path) {
      const target = next[idx] || next[idx - 1]
      navigate(target ? target.path : '/')
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    dragState.current = { startX: e.clientX, startWidth: chatWidth }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return
      const dx = dragState.current.startX - ev.clientX
      setChatWidth(Math.min(700, Math.max(280, dragState.current.startWidth + dx)))
    }
    const onUp = () => {
      dragState.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const menuItem: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', cursor: 'pointer',
    fontSize: 'var(--font-size-base)', color: 'var(--text-primary)',
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 顶栏 */}
      <div className="app-header">
        <div className="header-left">
          <button className="header-icon" onClick={() => setSidebarCollapsed((v) => !v)}>
            <PanelLeftClose size={18} />
          </button>
          <span className="header-title">销售合同执行管理系统</span>
        </div>
        <div className="header-right">
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button className="header-icon" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setMenuOpen((v) => !v)}>
              <User size={16} />
              {user?.real_name || user?.username}
              <ChevronDown size={14} />
            </button>
            {menuOpen && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, background: '#fff', border: '1px solid var(--divider-color)', borderRadius: 8, boxShadow: 'var(--shadow-md)', zIndex: 200, minWidth: 170, overflow: 'hidden' }}>
                <div style={menuItem} onClick={() => { setMenuOpen(false); setShowChangePwd(true) }}>
                  <KeyRound size={14} /> 修改密码
                </div>
                {isAdmin && (
                  <div style={menuItem} onClick={() => { setMenuOpen(false); setShowLlmConfig(true) }}>
                    <Cpu size={14} /> 配置大模型
                  </div>
                )}
                <div style={{ height: 1, background: 'var(--divider-color)' }} />
                <div style={menuItem} onClick={handleLogout}>
                  <LogOut size={14} /> 退出登录
                </div>
              </div>
            )}
          </div>
          <span className="divider" />
          <button className="header-icon" onClick={() => setChatCollapsed((v) => !v)}>
            <PanelRightClose size={18} />
          </button>
        </div>
      </div>

      <div className="app-body">
        {/* 左侧菜单 */}
        <aside className={`app-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          {menus.map((group) => (
            <div className="menu-group" key={group.id}>
              <div className="menu-group-title" onClick={() => toggleGroup(group.id)}>
                <MenuIcon name={group.icon} size={18} />
                <span>{group.name}</span>
                <span className="chevron">
                  {collapsedGroups.has(group.id) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                </span>
              </div>
              {!collapsedGroups.has(group.id) &&
                (group.children || []).map((child) => (
                  <div
                    key={child.id}
                    className={`menu-item ${activePath === child.path ? 'active' : ''}`}
                    onClick={() => child.path && openTab(child.path, child.name)}
                  >
                    <MenuIcon name={child.icon} size={16} />
                    <span>{child.name}</span>
                  </div>
                ))}
            </div>
          ))}
        </aside>

        {/* 中间工作区 */}
        <main className="app-main">
          <div className="tabs-bar">
            {tabs.map((tab) => (
              <div key={tab.path} className={`tab ${activePath === tab.path ? 'active' : ''}`}>
                <span onClick={() => navigate(tab.path)}>{tab.title}</span>
                <span className="tab-close" onClick={() => closeTab(tab.path)}>
                  ×
                </span>
              </div>
            ))}
          </div>
          <div className="app-content">
            <Outlet />
          </div>
        </main>

        {/* 右侧 AI 对话 */}
        {!chatCollapsed && <div className="chat-resizer" onMouseDown={onResizeStart} />}
        <aside className={`app-chat ${chatCollapsed ? 'collapsed' : ''}`} style={{ width: chatCollapsed ? 0 : chatWidth }}>
          <AIChat />
        </aside>
      </div>

      <ChangePasswordModal open={showChangePwd} onClose={() => setShowChangePwd(false)} />
      <LlmConfigModal open={showLlmConfig} onClose={() => setShowLlmConfig(false)} />
    </div>
  )
}

function findTabByPath(menus: MenuItem[], path: string): { path: string; title: string } | null {
  for (const g of menus) {
    for (const c of g.children || []) {
      if (c.path === path) return { path: c.path!, title: c.name }
    }
  }
  return null
}
