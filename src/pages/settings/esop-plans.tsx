import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import { canAdmin } from '@/lib/roles'
import { logAudit } from '@/lib/audit'

export interface ESOPPlan {
  id: string
  planName: string
  description?: string
  cliffMonths: number
  vestingPeriodMonths: number
  cliffVestingPct: number      // % that vests at cliff (e.g. 25 means 25% vests at cliff)
  postCliffFrequency: 'monthly' | 'quarterly' | 'half-yearly' | 'yearly'
  isDefault?: boolean
  createdAt?: string
}

const BLANK: Omit<ESOPPlan, 'id'> = {
  planName: '', description: '', cliffMonths: 12, vestingPeriodMonths: 48,
  cliffVestingPct: 25, postCliffFrequency: 'monthly', isDefault: false,
}

export default function ESOPPlansPage() {
  const { user, profile, loading } = useAuth()
  const { companyId } = usePlan()
  const router = useRouter()
  const [plans, setPlans] = useState<ESOPPlan[]>([])
  const [busy, setBusy] = useState(true)
  const [editing, setEditing] = useState<ESOPPlan | null>(null)
  const [form, setForm] = useState<Omit<ESOPPlan, 'id'>>(BLANK)
  const [saving, setSaving] = useState(false)
  const [ok, setOk] = useState('')

  useEffect(() => { if (!loading && !user) router.push('/login') }, [user, loading])
  useEffect(() => {
    if (!companyId) return
    getDocs(collection(db, 'companies', companyId, 'esopPlans'))
      .then(snap => { setPlans(snap.docs.map(d => ({ id: d.id, ...d.data() } as ESOPPlan))); setBusy(false) })
  }, [companyId])

  function startNew() { setEditing(null); setForm(BLANK) }

  function startEdit(p: ESOPPlan) {
    setEditing(p)
    setForm({ planName: p.planName, description: p.description || '', cliffMonths: p.cliffMonths, vestingPeriodMonths: p.vestingPeriodMonths, cliffVestingPct: p.cliffVestingPct, postCliffFrequency: p.postCliffFrequency, isDefault: !!p.isDefault })
  }

  async function save() {
    if (!form.planName) { alert('Plan name is required'); return }
    if (form.cliffMonths >= form.vestingPeriodMonths) { alert('Cliff must be less than total vesting period'); return }
    if (form.cliffVestingPct < 0 || form.cliffVestingPct > 100) { alert('Cliff vesting % must be 0–100'); return }
    setSaving(true)
    const data = { ...form, updatedAt: new Date().toISOString() }
    if (editing) {
      await updateDoc(doc(db, 'companies', companyId, 'esopPlans', editing.id), data)
      setPlans(prev => prev.map(p => p.id === editing.id ? { ...p, ...data } : p))
    } else {
      const ref = await addDoc(collection(db, 'companies', companyId, 'esopPlans'), { ...data, createdAt: new Date().toISOString() })
      setPlans(prev => [...prev, { id: ref.id, ...data } as ESOPPlan])
    }
    if (form.isDefault) {
      // Remove default from others
      for (const p of plans) {
        if (p.id !== editing?.id && p.isDefault) {
          await updateDoc(doc(db, 'companies', companyId, 'esopPlans', p.id), { isDefault: false })
        }
      }
      setPlans(prev => prev.map(p => ({ ...p, isDefault: p.id === (editing?.id || '') ? true : false })))
    }
    await logAudit({ companyId, userId: user!.uid, userEmail: profile?.email || '', action: 'settings_updated', entityType: 'esopPlan', entityId: editing?.id || 'new', entityLabel: form.planName, after: data })
    setOk('Plan saved.'); setTimeout(() => setOk(''), 3000)
    setEditing(null); setForm(BLANK); setSaving(false)
  }

  async function deletePlan(p: ESOPPlan) {
    if (!confirm(`Delete plan "${p.planName}"? This cannot be undone.`)) return
    await deleteDoc(doc(db, 'companies', companyId, 'esopPlans', p.id))
    setPlans(prev => prev.filter(x => x.id !== p.id))
  }

  const postCliffMonths = form.vestingPeriodMonths - form.cliffMonths
  const cliffOptions = Math.round(form.cliffVestingPct)
  const postCliffOptions = 100 - cliffOptions

  if (!canAdmin(profile?.role)) return <Layout><div className="alert alert-danger">Admin access required.</div></Layout>

  return (
    <Layout title="ESOP Plans">
      <div style={{ maxWidth: 900 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 className="page-title">ESOP Plans</h1>
            <p className="page-subtitle">Define vesting plans. Choose a plan when issuing a grant.</p>
          </div>
          <button onClick={startNew} className="btn btn-primary btn-sm">+ New Plan</button>
        </div>

        {ok && <div className="alert alert-success mb-4">{ok}</div>}

        {/* Plan form */}
        {(editing !== undefined || form.planName !== '') && (editing !== null || form.planName !== '' || plans.length === 0) && (
          <div className="card mb-4" style={{ border: '1px solid rgba(45,95,168,0.2)', background: 'rgba(45,95,168,0.03)' }}>
            <h3 className="section-title mb-4">{editing ? `Edit Plan: ${editing.planName}` : 'New Plan'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="label">Plan Name *</label>
                  <input className="input" value={form.planName} onChange={e => setForm(f => ({ ...f, planName: e.target.value }))} placeholder="e.g. Standard 4-Year Plan, Accelerated 2-Year Plan" />
                </div>
                <div>
                  <label className="label">Description</label>
                  <input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label className="label">Cliff Period (months)</label>
                  <input type="number" className="input" min={0} max={60} value={form.cliffMonths} onChange={e => setForm(f => ({ ...f, cliffMonths: parseInt(e.target.value) || 0 }))} />
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>No vesting before cliff</div>
                </div>
                <div>
                  <label className="label">Total Vesting Period (months)</label>
                  <input type="number" className="input" min={1} max={120} value={form.vestingPeriodMonths} onChange={e => setForm(f => ({ ...f, vestingPeriodMonths: parseInt(e.target.value) || 1 }))} />
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Including cliff period</div>
                </div>
                <div>
                  <label className="label">Cliff Vesting % </label>
                  <input type="number" className="input" min={0} max={100} value={form.cliffVestingPct} onChange={e => setForm(f => ({ ...f, cliffVestingPct: parseFloat(e.target.value) || 0 }))} />
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>% of total that vests at cliff</div>
                </div>
                <div>
                  <label className="label">Post-Cliff Frequency</label>
                  <select className="input" value={form.postCliffFrequency} onChange={e => setForm(f => ({ ...f, postCliffFrequency: e.target.value as any }))}>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="half-yearly">Half-Yearly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              {/* Preview */}
              <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                <strong>Preview:</strong> After {form.cliffMonths} months cliff, <strong>{cliffOptions}%</strong> vests. Remaining <strong>{postCliffOptions}%</strong> vests {form.postCliffFrequency} over {postCliffMonths} months.
                {form.cliffMonths === 0 && <span style={{ color: 'var(--text3)' }}> (No cliff — all vesting starts from day 1)</span>}
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} />
                Set as default plan (pre-selected when creating new grants)
              </label>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={save} disabled={saving} className="btn btn-primary btn-sm">{saving ? '⏳...' : editing ? '💾 Update Plan' : '+ Create Plan'}</button>
                <button onClick={() => { setEditing(null); setForm(BLANK) }} className="btn btn-ghost btn-sm">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Plans list */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr><th>Plan Name</th><th>Cliff</th><th>Total Period</th><th>Cliff Vest %</th><th>Post-Cliff</th><th>Default</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {plans.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text3)' }}>
                  No plans yet. Create your first ESOP plan above.
                </td></tr>
              ) : plans.map(p => (
                <tr key={p.id}>
                  <td><div style={{ fontWeight: 600 }}>{p.planName}</div>{p.description && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{p.description}</div>}</td>
                  <td>{p.cliffMonths} months</td>
                  <td>{p.vestingPeriodMonths} months</td>
                  <td>{p.cliffVestingPct}%</td>
                  <td style={{ textTransform: 'capitalize' }}>{p.postCliffFrequency}</td>
                  <td>{p.isDefault ? <span className="badge badge-green">Default</span> : <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => startEdit(p)} className="btn btn-ghost btn-xs">Edit</button>
                      <button onClick={() => deletePlan(p)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  )
}
