import { useEffect, useState } from 'react'
import Modal from './Modal'
import { aiApi } from '../api/ai'
import { toast } from './toast'

export default function LlmConfigModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ base_url: '', api_key: '', model_id: '', max_tokens: 81920 })
  const [configured, setConfigured] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      aiApi.getConfig()
        .then((c) => {
          setForm({ base_url: c.base_url, api_key: '', model_id: c.model_id, max_tokens: c.max_tokens })
          setConfigured(c.configured)
        })
        .catch(() => {})
    }
  }, [open])

  const handleTest = async () => {
    if (!form.api_key && !configured) {
      toast('请先填写 API Key', 'error')
      return
    }
    setTesting(true)
    try {
      const r = await aiApi.testConnection(form)
      if (r.success) toast(`连接成功（${r.latency_ms}ms）：${r.reply}`)
      else toast('连接失败：' + r.message, 'error')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!form.base_url || !form.model_id) {
      toast('请填写 Base URL 和模型 ID', 'error')
      return
    }
    setSaving(true)
    try {
      await aiApi.saveConfig(form)
      toast('配置已保存')
      onClose()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="配置大模型（OpenAI 兼容）" open={open} onClose={onClose} width={520}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-secondary" onClick={handleTest} disabled={testing}>{testing ? '测试中…' : '测试连接'}</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>保存</button>
        </>
      }>
      <div className="form-grid-2">
        <div className="form-item span-2">
          <label className="field-label required">Base URL</label>
          <div className="field-control"><input placeholder="如 https://api.deepseek.com" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} /></div>
        </div>
        <div className="form-item span-2">
          <label className="field-label required">API Key</label>
          <div className="field-control">
            <input type="password" placeholder={configured ? '已配置，留空则不修改' : 'sk-...'} value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
          </div>
        </div>
        <div className="form-item span-2">
          <label className="field-label required">模型 ID</label>
          <div className="field-control"><input placeholder="如 deepseek-chat" value={form.model_id} onChange={(e) => setForm({ ...form, model_id: e.target.value })} /></div>
        </div>
        <div className="form-item span-2">
          <label className="field-label">max_tokens</label>
          <div className="field-control"><input type="number" value={form.max_tokens} onChange={(e) => setForm({ ...form, max_tokens: Number(e.target.value) })} /></div>
        </div>
      </div>
      <p className="text-secondary" style={{ fontSize: '9pt' }}>
        仅配置 URL、API Key、模型 ID，其余参数采用默认值（max_tokens 默认 81920）。
      </p>
    </Modal>
  )
}
