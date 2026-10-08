// 视觉体系移植自 gopherforge (https://github.com/SuperiorChuo/gopherforge) MIT License,适配 OPIC 技术底座。
// 玻璃登录页(深空极光 + 920px 玻璃壳左右分栏)。
//
// 双入口 × 双认证方式(用户规则 2026-10):
//   入口:用户登录(→用户工作台,蓝) / 管理员登录(→管理控制台,琥珀)——左侧品牌区文案与配色随入口联动
//   认证方式:入口内可切换 SSO 账号(默认:用户=Casdoor,管理员=ZITADEL) / 本地账号(底座本地库,带图形验证码)
//   SSO 可用性由 /auth/mode 探测:admin.mode=zitadel / user.mode=casdoor;不可用时自动回退本地账号
// 登录方式矩阵(mode × allow_local_login):
//   SSO 可用 → 默认展示 SSO 按钮,可切本地(allow_local_login=true 时)
//   SSO 不可用 → 仅本地表单(zitadel 模式且 allow_local_login=false 时为空档,提示联系管理员)
//   /auth/mode 检测失败 → 兜底显示本地密码表单
// 另:#token= hash 恢复、登录成功后按入口跳转(管理员→/admin,用户→工作台首页)。
import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Input, message } from 'antd'
import {
  LockOutlined,
  UserOutlined,
  SafetyCertificateOutlined,
  SafetyOutlined,
  ThunderboltOutlined,
  ApartmentOutlined,
  CheckSquareOutlined,
  InfoCircleOutlined,
  TeamOutlined,
  CrownOutlined,
  SyncOutlined,
  GlobalOutlined,
  DesktopOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'
import { authApi } from '../../api/auth'
import { setToken, clearToken } from '../../api/request'
import { setAuth } from '../../store/slices/authSlice'
import type { AppDispatch } from '../../store'
import { resolveHomePath } from '../../router'

// ── 入口主题与品牌文案(左侧区随入口联动,用户规则 2026-10) ───────────────────
interface EntryConf {
  icon: ReactNode
  name: string
  desc: string
  color: string
  bg: string
  band: string
  tint: string
  idp: string // SSO 认证源
  headline: ReactNode
  subline: ReactNode
  features: { icon: ReactNode; text: string }[]
}

const ENTRY_CONF: Record<'user' | 'admin', EntryConf> = {
  user: {
    icon: <TeamOutlined />,
    name: '用户工作台入口',
    desc: '面向业务用户 · 办理申请与审批',
    color: '#2266e3',
    bg: '#e8f1ff',
    band: 'linear-gradient(135deg, #2266e3, #5a8df0)',
    tint: 'radial-gradient(600px 400px at 12% 88%, rgba(34,102,227,0.16), transparent 70%)',
    idp: 'Casdoor',
    headline: (
      <>
        算力服务,
        <br />
        一站式<em>高效办理</em>
      </>
    ),
    subline: (
      <>
        客户接入 · 在线审批 · 进度可查,
        <br />
        一体化算力服务门户。
      </>
    ),
    features: [
      { icon: <TeamOutlined />, text: '客户接入 · 申请在线提交' },
      { icon: <CheckSquareOutlined />, text: '待办审批 · 高效协同处理' },
      { icon: <ThunderboltOutlined />, text: '进度可查 · 全程留痕可追溯' },
    ],
  },
  admin: {
    icon: <CrownOutlined />,
    name: '管理控制台入口',
    desc: '面向平台管理员 · 系统配置与治理',
    color: '#c2620a',
    bg: '#fff7e8',
    band: 'linear-gradient(135deg, #b45309, #e8963e)',
    tint: 'radial-gradient(600px 400px at 12% 88%, rgba(180,83,9,0.14), transparent 70%)',
    idp: 'ZITADEL',
    headline: (
      <>
        以本体驱动,
        <br />
        筑<em>智能算力</em>底座
      </>
    ),
    subline: (
      <>
        本体建模 · 流程引擎 · 权限中台,
        <br />
        一体化支撑智能算力运营。
      </>
    ),
    features: [
      { icon: <ApartmentOutlined />, text: '本体驱动建模 · 数据与流程同源' },
      { icon: <SafetyCertificateOutlined />, text: '权限精密可控 · 身份统一守护' },
      { icon: <ThunderboltOutlined />, text: '流程引擎全速 · 每一步皆可追溯' },
    ],
  },
}

export default function Login() {
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  const [loading, setLoading] = useState(false)
  // SSO 可用性(来自 /auth/mode)
  const [adminSso, setAdminSso] = useState(false) // admin.mode=zitadel
  const [userSso, setUserSso] = useState(false) // user.mode=casdoor
  /** allow_local_login;null = /auth/mode 检测失败(兜底显示本地表单,维持旧行为) */
  const [localAllowed, setLocalAllowed] = useState<boolean | null>(null)
  const [userLocalAllowed, setUserLocalAllowed] = useState<boolean | null>(null)
  // 双入口(用户规则 2026-10):admin→管理控制台(/admin);user→用户工作台(/)
  const [entry, setEntry] = useState<'admin' | 'user'>('user')
  // 认证方式:入口内切换,sso 为默认(SSO 不可用时回退 local)
  const [method, setMethod] = useState<'sso' | 'local'>('sso')
  // 图形验证码(本地登录安控加强;一次性,失败自动换新)
  const [captcha, setCaptcha] = useState<{ id: string; image: string }>({ id: '', image: '' })
  const loadCaptcha = () => {
    authApi
      .captcha()
      .then((r) => setCaptcha({ id: r.captcha_id, image: r.image }))
      .catch(() => setCaptcha({ id: '', image: '' }))
  }

  const conf = ENTRY_CONF[entry]
  const ssoAvail = entry === 'admin' ? adminSso : userSso
  const localAvail = entry === 'admin' ? localAllowed !== false : userLocalAllowed !== false
  const effMethod: 'sso' | 'local' = method === 'sso' && ssoAvail ? 'sso' : 'local'

  useEffect(() => {
    loadCaptcha()
    // ZITADEL 回调:授权码流程完成后服务端重定向回 /login#token=<会话令牌>
    const hash = window.location.hash || ''
    const m = hash.match(/[#&]token=([^&]+)/)
    if (m) {
      history.replaceState(null, '', window.location.pathname)
      const token = decodeURIComponent(m[1])
      setToken(token)
      authApi
        .info()
        .then((info) => {
          dispatch(setAuth({ token, info }))
          message.success('登录成功')
          navigate(resolveHomePath(info.permissions), { replace: true })
        })
        .catch(() => {
          clearToken()
          message.error('ZITADEL 回调换取会话失败')
        })
      return
    }
    authApi
      .mode()
      .then((r: any) => {
        setAdminSso(r.mode === 'zitadel')
        setLocalAllowed(r.allow_local_login === undefined ? null : !!r.allow_local_login)
        // 工作台端(OPIC-SSO-01):user.mode=casdoor → Casdoor SSO
        if (r.user?.mode === 'casdoor') setUserSso(true)
        setUserLocalAllowed(r.user?.allow_local_login === undefined ? null : !!r.user.allow_local_login)
      })
      .catch(() => {
        // 检测失败:维持旧行为,显示本地密码表单
        setLocalAllowed(null)
        setUserLocalAllowed(null)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const switchEntry = (e: 'admin' | 'user') => {
    setEntry(e)
    setMethod('sso') // 每次切入口,认证方式回到默认 SSO
  }

  const handleSso = async () => {
    try {
      const { url } = await authApi.zitadelLoginUrl()
      window.location.href = url
    } catch (err: any) {
      message.error(err.message || '跳转 ZITADEL 失败')
    }
  }

  // 工作台 Casdoor SSO(OPIC-SSO-01)
  const [casdoorLoading, setCasdoorLoading] = useState(false)
  const handleCasdoorSso = async () => {
    setCasdoorLoading(true)
    try {
      const r = await authApi.casdoorLoginUrl()
      window.location.href = (r as { url: string }).url
    } catch (err: any) {
      setCasdoorLoading(false)
      message.error(err.message || '跳转 Casdoor 失败')
    }
  }

  const doSso = () => (entry === 'user' && userSso ? handleCasdoorSso() : handleSso())

  const onFinish = async (values: { username: string; password: string; captcha_code: string }) => {
    setLoading(true)
    try {
      const payload = await authApi.login(values.username, values.password, captcha.id, values.captcha_code)
      setToken(payload.token)
      dispatch(setAuth({ token: payload.token, info: payload }))
      message.success('登录成功')
      // 管理员入口 → 管理控制台;用户入口 → 用户工作台
      if (entry === 'admin') {
        navigate('/admin', { replace: true })
      } else {
        navigate(resolveHomePath(payload.permissions), { replace: true })
      }
    } catch {
      // 统一拦截器已提示;验证码一次性,失败后换新图
      loadCaptcha()
    } finally {
      setLoading(false)
    }
  }

  // ── 片段:认证方式切换器(SSO 可用且本地可用时展示;SSO 为默认) ──
  const methodSwitcher = ssoAvail && localAvail && (
    <div className="method-switch" style={{ marginBottom: 14 }}>
      <button type="button" className={effMethod === 'sso' ? 'on' : ''} onClick={() => setMethod('sso')}>
        <GlobalOutlined />
        <span>
          {conf.idp} 账号
          <i className="default-badge">默认</i>
        </span>
      </button>
      <button type="button" className={effMethod === 'local' ? 'on' : ''} onClick={() => setMethod('local')}>
        <DesktopOutlined />
        <span>本地账号</span>
      </button>
    </div>
  )

  // ── 片段:SSO 面板 ──
  const ssoPanel = (
    <>
      <h2 className="brand-form-title">{entry === 'admin' ? '管理员登录' : '欢迎回来'}</h2>
      <p className="brand-form-sub">
        {entry === 'admin' ? '登录管理控制台,进行平台治理' : '登录用户工作台,继续业务办理'}
      </p>
      <div className="brand-idp-tag" style={{ marginBottom: 14 }}>
        <SafetyCertificateOutlined />
        <span>
          认证源:<b>{conf.idp}(单点登录)</b>
          <span style={{ color: '#8aa0c0' }}>　在 {conf.idp} 页面输入账号密码完成认证</span>
        </span>
      </div>
      <div className="brand-form">
        <Button
          type="primary"
          block
          size="large"
          loading={entry === 'user' && userSso ? casdoorLoading : false}
          className={entry === 'admin' ? 'btn-entry-admin' : undefined}
          onClick={doSso}
        >
          使用 {conf.idp} 单点登录
        </Button>
      </div>
    </>
  )

  // ── 片段:本地账号面板(密码表单 + 图形验证码) ──
  const localPanel = (
    <>
      <h2 className="brand-form-title">{entry === 'admin' ? '管理员登录' : '欢迎回来'}</h2>
      <p className="brand-form-sub">
        {entry === 'admin' ? '登录管理控制台,进行平台治理' : '登录用户工作台,继续业务办理'}
      </p>
      <Form
        name="login"
        size="large"
        className="brand-form"
        requiredMark={false}
        initialValues={{ username: 'admin', password: 'admin123' }}
        onFinish={onFinish}
      >
        {/* 认证源明确提示(用户规则 2026-10):本地密码 = 底座本地账号;SSO = 对应 IdP */}
        <div className="brand-idp-tag" style={{ marginBottom: 14 }}>
          <SafetyCertificateOutlined />
          <span>
            认证源:<b>技术底座本地账号</b>
            {ssoAvail && `　|　单点登录走 ${conf.idp}`}
          </span>
        </div>
        <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
          <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
        </Form.Item>
        <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
          <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
        </Form.Item>
        <Form.Item style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Form.Item name="captcha_code" noStyle rules={[{ required: true, message: '请输入验证码' }]}>
              <Input
                prefix={<SafetyOutlined />}
                placeholder="验证码(不区分大小写)"
                maxLength={4}
                style={{ flex: 1 }}
              />
            </Form.Item>
            {captcha.image ? (
              <img
                src={captcha.image}
                alt="验证码"
                title="点击刷新验证码"
                onClick={loadCaptcha}
                style={{ height: 40, borderRadius: 6, cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff' }}
              />
            ) : (
              <span
                onClick={loadCaptcha}
                style={{
                  height: 40, minWidth: 96, borderRadius: 6, border: '1px dashed #d9d9d9',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: '#999', cursor: 'pointer', fontSize: 12,
                }}
              >
                <SyncOutlined /> 加载失败,点击重试
              </span>
            )}
          </div>
        </Form.Item>
        <Form.Item className="brand-submit-item">
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={loading}
            className={entry === 'admin' ? 'btn-entry-admin' : undefined}
          >
            {entry === 'admin' ? '登录管理控制台' : '登录工作台'}
          </Button>
        </Form.Item>
      </Form>
      <div className="brand-footer">
        {entry === 'admin' ? '默认管理员账号:admin / admin123' : '业务账号请联系管理员在管理控制台开通'}
      </div>
    </>
  )

  // 两者都不可用:提示联系管理员
  if (!ssoAvail && !localAvail) {
    return (
      <div className="brand-page" data-entry={entry}>
        <div className="brand-aurora brand-aurora-1" />
        <div className="brand-aurora brand-aurora-2" />
        <div className="brand-aurora brand-aurora-3" />
        <div className="brand-grid" />

        <div className="brand-shell brand-shell-single">
          <div className="brand-form-side">
            <div className="brand-form-inner">
              <h2 className="brand-form-title">欢迎回来</h2>
              <p className="brand-form-sub">当前未开放任何登录方式</p>
              <div className="brand-notice" role="alert">
                <InfoCircleOutlined />
                <span>
                  本地密码登录已关闭,且未启用单点登录。
                  <br />
                  请联系管理员调整认证配置后再登录。
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="brand-page" data-entry={entry}>
      <div className="brand-aurora brand-aurora-1" />
      <div className="brand-aurora brand-aurora-2" />
      <div className="brand-aurora brand-aurora-3" />
      <div className="brand-grid" />

      <div className="brand-shell">
        {/* 入口主题晕染层(随入口切换背景色调) */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: conf.tint }} />
        {/* 左品牌栏(文案+配色随入口联动) */}
        <div className="brand-side">
          <div className="brand-logo">
            <div className="brand-logo-mark">
              <ApartmentOutlined />
            </div>
            <span className="brand-logo-name">OPIC 技术底座</span>
          </div>

          <div className="brand-brand-copy">
            <h1 className="brand-headline">{conf.headline}</h1>
            <p className="brand-subline">{conf.subline}</p>
          </div>

          <ul className="brand-features">
            {conf.features.map((f) => (
              <li key={f.text}>
                <span className="brand-feature-icon">{f.icon}</span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        {/* 右表单栏 */}
        <div className="brand-form-side">
          <div className="brand-form-inner">
            {/* 双入口切换(视觉强区分:图标/配色/角标随入口切换) */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              {([
                { key: 'user', title: '用户登录', desc: '进入用户工作台', icon: <TeamOutlined /> },
                { key: 'admin', title: '管理员登录', desc: '进入管理控制台', icon: <CrownOutlined /> },
              ] as const).map((t) => {
                const th = ENTRY_CONF[t.key]
                const active = entry === t.key
                return (
                  <button
                    key={t.key}
                    onClick={() => switchEntry(t.key)}
                    style={{
                      flex: 1, cursor: 'pointer', textAlign: 'left', borderRadius: 10, padding: '10px 12px',
                      display: 'flex', alignItems: 'center', gap: 10,
                      border: active ? `2px solid ${th.color}` : '1px solid #d9d9d9',
                      background: active ? th.bg : '#fff',
                      boxShadow: active ? `0 2px 8px ${th.color}33` : 'none',
                    }}
                  >
                    <span
                      style={{
                        width: 34, height: 34, borderRadius: 8, flexShrink: 0, fontSize: 17,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: active ? th.band : '#f0f2f5', color: active ? '#fff' : '#999',
                      }}
                    >
                      {t.icon}
                    </span>
                    <span>
                      <span style={{ display: 'block', fontWeight: 700, color: active ? th.color : '#555' }}>
                        {t.title}
                        {active ? ' ✓' : ''}
                      </span>
                      <span style={{ display: 'block', fontSize: 12, color: '#888', marginTop: 2 }}>{t.desc}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            {/* 入口红头带(背景/图样随入口强区分) */}
            <div
              style={{
                borderRadius: 12, padding: '10px 14px', marginBottom: 16, color: '#fff',
                background: conf.band, display: 'flex', alignItems: 'center', gap: 12,
              }}
            >
              <span style={{ fontSize: 22 }}>{conf.icon}</span>
              <span>
                <span style={{ display: 'block', fontWeight: 800, fontSize: 15, letterSpacing: 1 }}>{conf.name}</span>
                <span style={{ display: 'block', fontSize: 12, opacity: 0.92 }}>{conf.desc}</span>
              </span>
            </div>
            {methodSwitcher}
            {effMethod === 'sso' ? ssoPanel : localPanel}
          </div>
        </div>
      </div>
    </div>
  )
}
