import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, LogIn, User } from 'lucide-react'
import { authApi } from '../api/auth'
import { useAuth } from '../stores/userStore'
import { toast } from '../components/toast'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin123')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      toast('请输入用户名和密码', 'error')
      return
    }
    setLoading(true)
    try {
      const payload = await authApi.login(username, password)
      login(payload)
      toast('登录成功')
      navigate('/')
    } catch (err: any) {
      toast(err.message || '登录失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <div style={{ textAlign: 'center' }}>
          <div className="login-logo">
            <Lock size={32} />
          </div>
          <h1 className="login-title">销售合同执行管理系统</h1>
          <p className="login-subtitle">请登录您的账号以继续</p>
        </div>
        <div className="input-with-icon">
          <User size={16} />
          <input
            type="text"
            placeholder="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div className="input-with-icon">
          <Lock size={16} />
          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '44px' }} disabled={loading}>
          <LogIn size={16} /> {loading ? '登录中…' : '立即登录'}
        </button>
        <div className="login-hint">默认管理员账号：admin / admin123</div>
      </form>
    </div>
  )
}
