// 视觉体系移植自 gopherforge (https://github.com/SuperiorChuo/gopherforge) MIT License,适配 OPIC 技术底座。
// 管理控制台 403 页:深空品牌页风格(与登录页同一套 brand-* 样式),非 data-glass 作用域。
import { Button, Space } from 'antd'
import { Link } from 'react-router-dom'
import { ApartmentOutlined, SwapOutlined, LoginOutlined } from '@ant-design/icons'
import { clearToken } from '../../api/request'
import { clearAuth } from '../../store/slices/authSlice'
import { store } from '../../store'

export default function GlassForbidden() {
  const handleRelogin = () => {
    clearToken()
    store.dispatch(clearAuth())
    window.location.href = '/login'
  }

  return (
    <div className="brand-page">
      <div className="brand-aurora brand-aurora-1" />
      <div className="brand-aurora brand-aurora-2" />
      <div className="brand-aurora brand-aurora-3" />
      <div className="brand-grid" />

      <div className="brand-result">
        <div className="brand-result-code">403</div>
        <div className="brand-result-title">无管理控制台访问权限</div>
        <div className="brand-result-desc">
          当前账号未被授予系统管理或流程管理权限,
          <br />
          请联系管理员开通,或前往用户工作台继续业务操作。
        </div>
        <div className="brand-result-actions">
          <Space size={12} wrap>
            <Link to="/customer/apply">
              <Button type="primary" icon={<SwapOutlined />}>
                进入用户工作台
              </Button>
            </Link>
            <Link to="/">
              <Button icon={<ApartmentOutlined />}>回首页</Button>
            </Link>
            <Button type="text" icon={<LoginOutlined />} onClick={handleRelogin}>
              退出重登
            </Button>
          </Space>
        </div>
      </div>
    </div>
  )
}
