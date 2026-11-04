import { useEffect, useState } from 'react'
import { Save, Sparkles, Wifi } from 'lucide-react'
import { aiApi, type AiConfig } from '../../api/ai'
import { toast } from '../../components/toast'

export default function AiConfigPage() {
  const [form, setForm] = useState<AiConfig>({
    base_url: '',
    api_key: '',
    model_id: '',
    max_tokens: 81920,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    aiApi
      .getConfig()
      .then((data) => setForm({ ...data, api_key: '' }))
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    if (!form.base_url.trim()) return toast('请输入接口地址', 'error')
    if (!form.model_id.trim()) return toast('请输入模型编号', 'error')
    if (!form.api_key.trim()) return toast('请输入 API Key（留空则保留原值）', 'error')
    setSaving(true)
    try {
      await aiApi.saveConfig({
        base_url: form.base_url.trim(),
        api_key: form.api_key.trim(),
        model_id: form.model_id.trim(),
        max_tokens: Number(form.max_tokens) || 81920,
      })
      toast('保存成功')
      setForm({ ...form, api_key: '' })
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    try {
      await aiApi.test()
      toast('连接成功')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setTesting(false)
    }
  }

  if (loading) return <div className="card">加载中…</div>

  return (
    <div className="screen-stack">
      <section className="card">
        <div className="section-header">
          <div>
            <h2>大模型配置</h2>
            <p>配置 OpenAI 兼容接口，供右侧 AI 智能助理回答业务问题；助手仅执行只读查询，不修改业务数据</p>
          </div>
          <span className="badge badge-info"><Sparkles size={12} />只读助理</span>
        </div>
        <div className="form-grid-2" style={{ maxWidth: 760 }}>
          <div className="form-item span-2">
            <label className="field-label required">接口地址</label>
            <div className="field-control">
              <input
                value={form.base_url}
                placeholder="如 https://api.openai.com/v1"
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
              />
            </div>
          </div>
          <div className="form-item span-2">
            <label className="field-label required">API Key</label>
            <div className="field-control">
              <input
                type="password"
                value={form.api_key}
                placeholder="保存后仅显示掩码；留空提交表示保留原值"
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label required">模型编号</label>
            <div className="field-control">
              <input
                value={form.model_id}
                placeholder="如 gpt-4o-mini"
                onChange={(e) => setForm({ ...form, model_id: e.target.value })}
              />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">最大输出 Token</label>
            <div className="field-control">
              <input
                type="number"
                min={256}
                max={81920}
                value={form.max_tokens}
                onChange={(e) => setForm({ ...form, max_tokens: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
        <div className="form-footer inline">
          <span className="text-secondary" style={{ fontSize: 12 }}>
            未配置时，AI 助理仅返回基于业务数据的规则化统计结果。
          </span>
          <div className="action-row">
            <button className="btn btn-secondary" disabled={testing} onClick={test}>
              <Wifi size={15} />测试连接
            </button>
            <button className="btn btn-primary" disabled={saving} onClick={save}>
              <Save size={15} />保存配置
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
