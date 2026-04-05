import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import { canAdmin } from '@/lib/roles'
import { DEFAULT_TEMPLATES, type TemplateKey } from '@/lib/email-renderer'

const TEMPLATE_META: Record<TemplateKey, { label: string; description: string; variables: string[] }> = {
  user_invite:               { label: 'User Invite',          description: 'Sent when a new admin/HR user is invited',              variables: ['employeeName','companyName','role','tempPassword','loginLink'] },
  employee_invite:           { label: 'Employee Invite',      description: 'Sent when an employee portal account is created',       variables: ['employeeName','companyName','tempPassword','loginLink'] },
  grant_issued:              { label: 'Grant Issued',         description: 'Sent when a new grant is issued to an employee',        variables: ['employeeName','companyName','grantNumber','grantDate','grantType','totalOptions','exercisePrice','acceptDeadline','portalLink'] },
  grant_acceptance_reminder: { label: 'Acceptance Reminder',  description: 'Sent periodically until grant is accepted',            variables: ['employeeName','companyName','grantNumber','acceptDeadline','portalLink'] },
  grant_accepted:            { label: 'Grant Accepted',       description: 'Confirmation to employee after accepting a grant',      variables: ['employeeName','companyName','grantNumber'] },
  grant_rejected:            { label: 'Grant Rejected',       description: 'Notification after an employee rejects a grant',       variables: ['employeeName','companyName','grantNumber'] },
  vesting_milestone:         { label: 'Vesting Milestone',    description: 'Sent when options vest successfully',                  variables: ['employeeName','companyName','grantNumber','vestDate','vestOptions','portalLink'] },
  exit_portal_access:        { label: 'Exit Portal Access',   description: 'Sent to exited employee with personal email access',   variables: ['employeeName','companyName','tempPassword','loginLink'] },
  plan_upgraded:             { label: 'Plan Updated',         description: 'Sent when company plan changes',                       variables: ['companyName','planName'] },
  invoice_generated:         { label: 'Invoice Generated',    description: 'Sent when an invoice is created',                     variables: ['companyName','invoiceNumber','amount'] },
  password_reset:            { label: 'Password Reset',       description: 'Sent when user requests password reset',               variables: ['employeeName','loginLink'] },
}

const KEYS = Object.keys(TEMPLATE_META) as TemplateKey[]

export default function EmailTemplatesPage() {
  const { user, profile, loading } = useAuth()
  const { companyId } = usePlan()
  const router = useRouter()
  const [selected, setSelected] = useState<TemplateKey>('grant_issued')
  const [templates, setTemplates] = useState<Record<string, any>>({})
  const [form, setForm] = useState({ subject: '', bodyHtml: '', enabled: true, reminderFrequencyDays: '7' })
  const [saving, setSaving] = useState(false)
  const [ok, setOk] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [testing, setTesting] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)

  useEffect(() => { if (!loading && !user) router.push('/login') }, [user, loading])

  useEffect(() => {
    if (!companyId) return
    getDocs(collection(db, 'companies', companyId, 'emailTemplates')).then(snap => {
      const t: Record<string, any> = {}
      snap.docs.forEach(d => { t[d.id] = d.data() })
      setTemplates(t)
    })
  }, [companyId])

  useEffect(() => {
    const existing = templates[selected]
    const def = DEFAULT_TEMPLATES[selected]
    setForm({
      subject: existing?.subject ?? def?.subject ?? '',
      bodyHtml: existing?.bodyHtml ?? def?.bodyHtml ?? '',
      enabled: existing?.enabled !== false,
      reminderFrequencyDays: String(existing?.reminderFrequencyDays ?? 7),
    })
    setPreviewMode(false)
  }, [selected, templates])

  async function save() {
    if (!companyId) return
    setSaving(true)
    await setDoc(doc(db, 'companies', companyId, 'emailTemplates', selected), {
      subject: form.subject, bodyHtml: form.bodyHtml,
      enabled: form.enabled, reminderFrequencyDays: parseInt(form.reminderFrequencyDays) || 7,
      updatedAt: new Date().toISOString(), updatedBy: user?.uid,
    }, { merge: true })
    setTemplates(prev => ({ ...prev, [selected]: { ...form } }))
    setOk('Template saved.'); setTimeout(() => setOk(''), 3000)
    setSaving(false)
  }

  async function resetToDefault() {
    const def = DEFAULT_TEMPLATES[selected]
    setForm(f => ({ ...f, subject: def?.subject || '', bodyHtml: def?.bodyHtml || '' }))
  }

  async function sendTest() {
    if (!testEmail) { alert('Enter a test email address'); return }
    setTesting(true)
    try {
      await fetch('/api/send-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'rendered', to: testEmail,
          subject: `[TEST] ${form.subject.replace(/\{\{[^}]+\}\}/g, 'Sample')}`,
          html: form.bodyHtml.replace(/\{\{[^}]+\}\}/g, '<em style="background:#fff3cd;padding:1px 3px">sample</em>'),
          text: 'Test email from ESOP Manager',
        }),
      })
      setOk(`Test email sent to ${testEmail}`)
    } catch (e: any) { setOk('Failed to send test: ' + e.message) }
    setTimeout(() => setOk(''), 4000)
    setTesting(false)
  }

  if (!canAdmin(profile?.role)) return <Layout><div className="alert alert-danger">Admin access required.</div></Layout>

  const meta = TEMPLATE_META[selected]
  const def = DEFAULT_TEMPLATES[selected]
  const isModified = templates[selected]?.subject !== undefined

  return (
    <Layout title="Email Templates">
      <div style={{ maxWidth: 1100, display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
        {/* Left: Template list */}
        <div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>Email Templates</div>
            {KEYS.map(k => {
              const m = TEMPLATE_META[k]
              const customised = !!templates[k]
              const enabled = templates[k]?.enabled !== false
              return (
                <button
                  key={k}
                  onClick={() => setSelected(k)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px',
                    background: selected === k ? 'rgba(45,95,168,0.08)' : 'transparent',
                    border: 'none', borderLeft: selected === k ? '3px solid var(--accent)' : '3px solid transparent',
                    borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, display: 'flex', gap: 6 }}>
                    {customised ? <span style={{ color: 'var(--accent)' }}>✎ Custom</span> : <span>Default</span>}
                    {!enabled && <span style={{ color: 'var(--danger)' }}>Disabled</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: Editor */}
        <div>
          {ok && <div className="alert alert-success mb-4">{ok}</div>}
          <div className="card mb-4">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h2 className="section-title">{meta.label}</h2>
                <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>{meta.description}</p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
                  Enabled
                </label>
                <button onClick={() => setPreviewMode(!previewMode)} className="btn btn-ghost btn-sm">
                  {previewMode ? '✎ Edit' : '👁 Preview'}
                </button>
              </div>
            </div>

            {/* Variables reference */}
            <div style={{ background: 'rgba(45,95,168,0.05)', border: '1px solid rgba(45,95,168,0.15)', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>Available variables (use as {'{{variable}}'})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {meta.variables.map(v => (
                  <code key={v} style={{ fontSize: 11, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', color: 'var(--accent)' }}
                    onClick={() => { const el = document.getElementById('bodyHtml-ta') as HTMLTextAreaElement; if (el) { const pos = el.selectionStart; const val = el.value; el.value = val.slice(0, pos) + `{{${v}}}` + val.slice(pos); setForm(f => ({ ...f, bodyHtml: el.value })) } }}>
                    {`{{${v}}}`}
                  </code>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label">Subject Line</label>
                <input className="input" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
              </div>

              {selected === 'grant_acceptance_reminder' && (
                <div>
                  <label className="label">Reminder Frequency (days)</label>
                  <input type="number" className="input" style={{ width: 120 }} value={form.reminderFrequencyDays} onChange={e => setForm(f => ({ ...f, reminderFrequencyDays: e.target.value }))} min="1" max="30" />
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>How often to repeat this reminder until grant is accepted</div>
                </div>
              )}

              <div>
                <label className="label">Email Body (HTML)</label>
                {previewMode ? (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 20, minHeight: 240, background: '#fff', color: '#111' }}
                    dangerouslySetInnerHTML={{ __html: form.bodyHtml.replace(/\{\{[^}]+\}\}/g, m => `<span style="background:#fff3cd;padding:0 3px;border-radius:3px">${m}</span>`) }} />
                ) : (
                  <textarea
                    id="bodyHtml-ta" className="input" rows={14} value={form.bodyHtml}
                    onChange={e => setForm(f => ({ ...f, bodyHtml: e.target.value }))}
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Test send */}
          <div className="card mb-4">
            <h3 className="section-title mb-3">Send Test Email</h3>
            <div style={{ display: 'flex', gap: 10 }}>
              <input className="input" style={{ flex: 1, maxWidth: 320 }} type="email" placeholder="test@example.com" value={testEmail} onChange={e => setTestEmail(e.target.value)} />
              <button onClick={sendTest} disabled={testing} className="btn btn-secondary btn-sm">{testing ? 'Sending...' : '↗ Send Test'}</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? '⏳ Saving...' : '💾 Save Template'}</button>
            <button onClick={resetToDefault} className="btn btn-ghost btn-sm" style={{ color: 'var(--text3)' }}>Reset to Default</button>
          </div>
        </div>
      </div>
    </Layout>
  )
}
