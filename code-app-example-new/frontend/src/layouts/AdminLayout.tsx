import { useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bot, Building2, CalendarDays, ChevronDown, ChevronRight, Database, LogOut, Menu, MessageSquareText,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Send, Settings2, Sparkles, User, X,
} from 'lucide-react'
import { useAuth } from '../stores/userStore'
import { MenuIcon } from '../utils/icons'
import type { MenuItem } from '../api/auth'
import { APPLICATION_NAME } from '../application-config'
import { aiApi, type AiAnswer } from '../api/ai'

function ResizeHandle({ side, onResize }: { side: 'left' | 'right'; onResize: (delta: number) => void }) {
  const start = useRef(0)
  return <div className="resize-handle" role="separator" aria-orientation="vertical" title="拖动调整宽度" onPointerDown={(event) => {
    start.current = event.clientX
    const move = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - start.current
      start.current = moveEvent.clientX
      onResize(side === 'left' ? delta : -delta)
    }
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop)
  }}/>
}

interface ChatMessage {
  role: 'assistant' | 'user'
  text: string
  kpis?: { label: string; value: string }[]
  table?: AiAnswer['table']
  source?: string
}

const QUICK_PROMPTS = ['我有哪些待审批合同', '本月合同签订额和开票额', '未收款的开票有哪些', '各部门合同统计']

function AiChat({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', text: '你好，我可以基于当前权限内的合同数据回答审批待办、签订与开票金额、未收款明细和部门统计等问题。' },
  ])
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const send = async (preset?: string) => {
    const question = (preset ?? input).trim()
    if (!question || busy) return
    setInput('')
    setMessages((current) => [...current, { role: 'user', text: question }])
    setBusy(true)
    try {
      const data = await aiApi.chat(question)
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: data.answer, kpis: data.kpis, table: data.table, source: data.source },
      ])
    } catch (err: any) {
      setMessages((current) => [...current, { role: 'assistant', text: err.message || '回答失败，请稍后重试。' }])
    } finally {
      setBusy(false)
    }
  }

  return <aside className="app-chat ai-chat">
    <header className="chat-header"><div className="ai-title"><span className="chat-logo"><Sparkles size={15}/></span><div><strong>AI 智能助理</strong><small>合同业务语义已连接</small></div></div><button className="header-tool light" title="收起 AI 对话" onClick={onClose}><PanelRightClose size={17}/></button></header>
    <div className="ai-context"><Database size={13}/><span>本体、权限与流程上下文</span><b>只读</b></div>
    <div className="message-list" ref={listRef}>
      {messages.map((message, index) => (
        <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
          <span className="message-avatar">{message.role === 'assistant' ? <Bot size={14}/> : <User size={14}/>}</span>
          <div className="message-bubble">
            <p>{message.text}</p>
            {!!message.kpis?.length && (
              <div className="ai-kpis">
                {message.kpis.map((kpi) => (
                  <div className="ai-kpi" key={kpi.label}>
                    <span>{kpi.label}</span>
                    <strong>{kpi.value}</strong>
                  </div>
                ))}
              </div>
            )}
            {message.table && (
              <div className="ai-table">
                <table>
                  <thead>
                    <tr>{message.table.columns.map((column) => <th key={column}>{column}</th>)}</tr>
                  </thead>
                  <tbody>
                    {message.table.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{String(cell)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {message.role === 'assistant' && message.source && (
              <span className="ai-source">
                {message.source === 'RULE' ? '业务规则回答' : message.source === 'MODEL' ? '大模型回答' : '能力提示'}
              </span>
            )}
          </div>
        </div>
      ))}
      {busy && <div className="message assistant"><span className="message-avatar"><Bot size={14}/></span><div className="message-bubble"><p>正在查询业务数据…</p></div></div>}
    </div>
    <div className="quick-prompts">{QUICK_PROMPTS.map((prompt) => <button key={prompt} onClick={() => send(prompt)}>{prompt}</button>)}</div>
    <footer className="chat-composer"><div><textarea rows={3} value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入业务问题，Enter 发送..." onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }}/><button title="发送消息" disabled={busy} onClick={() => send()}><Send size={15}/></button></div><small>AI 内容仅供业务分析参考，请核验关键数据。</small></footer>
  </aside>
}

function UserMenu({ onLogout }: { onLogout: () => void }) {
  const { user, permissions } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const isAdmin = permissions.includes('*')

  return (
    <div className="user-menu">
      <button className="user-trigger" onClick={() => setOpen(!open)}>
        <User size={15}/>{user?.real_name || user?.username}<ChevronDown size={13}/>
      </button>
      {open && (
        <>
          <div className="user-menu-mask" onClick={() => setOpen(false)} />
          <div className="user-menu-panel">
            <div className="user-menu-head">
              <strong>{user?.real_name || user?.username}</strong>
              <small>{(user?.roles || []).join(' / ') || '-'}</small>
            </div>
            {isAdmin && (
              <button onClick={() => { setOpen(false); navigate('/system/ai-config') }}>
                <Settings2 size={14}/>配置大模型
              </button>
            )}
            <button onClick={() => { setOpen(false); onLogout() }}><LogOut size={14}/>退出登录</button>
          </div>
        </>
      )}
    </div>
  )
}

export default function AdminLayout() {
  const { menus, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [chatVisible, setChatVisible] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(250)
  const [chatWidth, setChatWidth] = useState(390)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set())
  // All menus, including protected foundation menus, come from sys_resource.
  // This preserves the administrator's full view without leaking menus to others.
  const displayMenus = useMemo<MenuItem[]>(() => menus, [menus])
  const [tabs, setTabs] = useState<{ path: string; title: string; icon?: string }[]>(() => {
    const tab = findTabByPath(displayMenus, location.pathname)
    return tab ? [tab] : []
  })
  const activePath = location.pathname
  const activeTab = findTabByPath(displayMenus, activePath)
  const today = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())

  useEffect(() => {
    const tab = findTabByPath(displayMenus, location.pathname)
    if (tab) setTabs((current) => current.some((item) => item.path === tab.path) ? current : [...current, tab])
  }, [location.pathname, displayMenus])

  const toggleGroup = (id: number) => setCollapsedGroups((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const openTab = (path: string, title: string, icon?: string) => {
    navigate(path)
    setTabs((current) => current.some((tab) => tab.path === path) ? current : [...current, { path, title, icon }])
  }
  const closeTab = (path: string) => {
    const index = tabs.findIndex((tab) => tab.path === path)
    const next = tabs.filter((tab) => tab.path !== path)
    setTabs(next)
    if (activePath === path) navigate(next[index]?.path || next[index - 1]?.path || '/')
  }
  const handleLogout = () => { logout(); navigate('/login') }

  return <div className="foundation-shell">
    <header className="app-header"><div className="header-left"><button className="header-icon" title={sidebarVisible ? '收起菜单' : '展开菜单'} onClick={() => setSidebarVisible(!sidebarVisible)}>{sidebarVisible ? <PanelLeftClose size={18}/> : <PanelLeftOpen size={18}/>}</button><div className="brand-copy"><strong>{APPLICATION_NAME}</strong><small>Enterprise Application Foundation</small></div></div><div className="header-right"><span className="environment"><i/>生产环境</span><span className="divider"/><button className="header-icon" title={chatVisible ? '收起 AI 对话' : '展开 AI 对话'} onClick={() => setChatVisible(!chatVisible)}>{chatVisible ? <PanelRightClose size={18}/> : <PanelRightOpen size={18}/>}</button><UserMenu onLogout={handleLogout}/></div></header>
    <div className="app-body">
      {sidebarVisible && <><aside className="app-sidebar" style={{ width: sidebarWidth }}><div className="sidebar-caption">业务功能</div><nav>{displayMenus.map((group) => <div className="menu-group" key={group.id}><button className="menu-group-title" onClick={() => toggleGroup(group.id)}><MenuIcon name={group.icon} size={17}/><span>{group.name}</span>{collapsedGroups.has(group.id) ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}</button>{!collapsedGroups.has(group.id) && <div className="menu-children">{(group.children || []).map((child) => <button key={child.id} className={`menu-item ${activePath === child.path ? 'active' : ''}`} onClick={() => child.path && openTab(child.path, child.name, child.icon)}><MenuIcon name={child.icon} size={15}/><span>{child.name}</span></button>)}</div>}</div>)}</nav><div className="sidebar-footer"><span><Building2 size={16}/></span><div><strong>远行科技</strong><small>{APPLICATION_NAME}</small></div></div></aside><ResizeHandle side="left" onResize={(delta) => setSidebarWidth(Math.min(330, Math.max(200, sidebarWidth + delta)))}/></>}
      <main className="app-main"><div className="tabs-bar"><div className="tabs">{tabs.map((tab) => <button key={tab.path} className={`tab ${activePath === tab.path ? 'active' : ''}`} onClick={() => navigate(tab.path)}>{tab.icon && <MenuIcon name={tab.icon} size={14}/>}<span>{tab.title}</span>{tab.path !== '/dashboard' && <X size={13} onClick={(event) => { event.stopPropagation(); closeTab(tab.path) }}/>}</button>)}</div><button className="tab-menu" title="标签页菜单"><Menu size={15}/></button></div><div className="breadcrumb"><span>应用中心</span><ChevronRight size={12}/><strong>{activeTab?.title || '首页'}</strong><span className="page-date"><CalendarDays size={13}/>{today}</span></div><div className="app-content"><Outlet/></div></main>
      {chatVisible && <><ResizeHandle side="right" onResize={(delta) => setChatWidth(Math.min(520, Math.max(320, chatWidth + delta)))}/><div className="chat-column" style={{ width: chatWidth }}><AiChat onClose={() => setChatVisible(false)}/></div></>}
    </div>
    {!chatVisible && <button className="floating-ai" title="打开 AI 智能助理" onClick={() => setChatVisible(true)}><MessageSquareText size={18}/><span>AI</span></button>}
  </div>
}

const EXTRA_TABS: { test: RegExp; title: string }[] = [
  { test: /^\/contract\/form\/[^/]+$/, title: '修改合同' },
  { test: /^\/contract\/form$/, title: '新增合同' },
  { test: /^\/contract\/detail\/[^/]+$/, title: '合同详情' },
  { test: /^\/system\/ai-config$/, title: '大模型配置' },
]

function findTabByPath(menus: MenuItem[], path: string): { path: string; title: string; icon?: string } | null {
  for (const group of menus) for (const child of group.children || []) if (child.path === path) return { path: child.path, title: child.name, icon: child.icon }
  const extra = EXTRA_TABS.find((item) => item.test.test(path))
  return extra ? { path, title: extra.title } : null
}
