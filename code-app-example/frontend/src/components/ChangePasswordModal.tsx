import { useState } from 'react'
import Modal from './Modal'
import { authApi } from '../api/auth'
import { toast } from './toast'

export default function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    if (!oldPwd || !newPwd || !confirm) {
      toast('请填写完整', 'error')
      return
    }
    if (newPwd !== confirm) {
      toast('两次输入的新密码不一致', 'error')
      return
    }
    setLoading(true)
    try {
      await authApi.changePassword(oldPwd, newPwd)
      toast('密码修改成功')
      onClose()
      setOldPwd(''); setNewPwd(''); setConfirm('')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="修改密码" open={open} onClose={onClose} width={440}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading}>确认修改</button>
        </>
      }>
      <div className="form-grid-2">
        <div className="form-item span-2">
          <label className="field-label required">原密码</label>
          <div className="field-control"><input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} /></div>
        </div>
        <div className="form-item span-2">
          <label className="field-label required">新密码</label>
          <div className="field-control"><input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} /></div>
        </div>
        <div className="form-item span-2">
          <label className="field-label required">确认新密码</label>
          <div className="field-control"><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
        </div>
      </div>
    </Modal>
  )
}
