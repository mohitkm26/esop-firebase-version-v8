import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, orderBy, getDoc, doc, where, serverTimestamp, writeBatch } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import { generateGrantNumber, parseFlexDate, computeVestingStatus, today, fmtN } from '@/lib/utils'
import { logAudit } from '@/lib/audit'
import { createNotification } from '@/lib/utils'
import { canEdit } from '@/lib/roles'
import { routeGrantForApproval } from '@/lib/grant-workflow'
import type { ESOPPlan } from '@/pages/settings/esop-plans'

type VestRow = { date: string; qty: string }

export function generateScheduleFromPlan(
  startDate: string, totalOptions: number, plan: ESOPPlan
): VestRow[] {
  if (!startDate || !totalOptions) return [{ date: '', qty: '' }]
  const { cliffMonths, vestingPeriodMonths, cliffVestingPct, postCliffFrequency } = plan
  const freqMap: Record<string, number> = { monthly: 1, quarterly: 3, 'half-yearly': 6, yearly: 12 }
  const freqMonths = freqMap[postCliffFrequency] || 1
  const cliffDate = new Date(startDate)
  cliffDate.setMonth(cliffDate.getMonth() + cliffMonths)
  const rows: VestRow[] = []
  let allocated = 0

  // Cliff tranche
  if (cliffMonths > 0 && cliffVestingPct > 0) {
    const cliffQty = Math.round(totalOptions * cliffVestingPct / 100)
    rows.push({ date: cliffDate.toISOString().split('T')[0], qty: String(cliffQty) })
    allocated += cliffQty
  }

  // Post-cliff tranches
  const postCliffMonths = vestingPeriodMonths - cliffMonths
  const totalTranches = Math.floor(postCliffMonths / freqMonths)
  const remainingOptions = totalOptions - allocated
  const perTranche = totalTranches > 0 ? Math.floor(remainingOptions / totalTranches) : 0

  for (let i = 1; i <= totalTranches; i++) {
    const d = new Date(cliffDate)
    d.setMonth(d.getMonth() + i * freqMonths)
    const isLast = i === totalTranches
    const qty = isLast ? totalOptions - allocated : perTranche
    if (qty > 0) rows.push({ date: d.toISOString().split('T')[0], qty: String(qty) })
    allocated += isLast ? qty : perTranche
  }

  return rows.length > 0 ? rows : [{ date: '', qty: '' }]
}

export default function NewGrant() {
  const { user, profile, loading } = useAuth()
  const { companyId, companyData } = usePlan()
  const router = useRouter()
  const [employees, setEmployees] = useState<any[]>([])
  const [existing, setExisting] = useState<string[]>([])
  const [esopPlans, setEsopPlans] = useState<ESOPPlan[]>([])
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)
  const [vestRows, setVestRows] = useState<VestRow[]>([{ date: '', qty: '' }])
  const [vestMode, setVestMode] = useState<'auto' | 'manual'>('auto')
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [selEmp, setSelEmp] = useState<any>(null)
  const [latestFMV, setLatestFMV] = useState(0)
  const [poolInfo, setPoolInfo] = useState<{ boardApproved: number; totalGranted: number } | null>(null)
  const [form, setForm] = useState({
    employeeId: '', grantDate: today(), grantType: 'ISO',
    totalOptions: '', exercisePrice: '', vestingStartDate: today(), notes: '',
  })

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])

  useEffect(() => {
    if (!companyId) return
    Promise.all([
      getDocs(query(collection(db, 'companies', companyId, 'employees'), where('status', '!=', 'exited'), orderBy('name'))),
      getDocs(query(collection(db, 'companies', companyId, 'grants'))),
      getDoc(doc(db, 'companies', companyId, 'esopPool', 'config')),
      getDocs(query(collection(db, 'companies', companyId, 'valuations'), orderBy('valuationDate', 'desc'))),
      getDocs(collection(db, 'companies', companyId, 'esopPlans')),
    ]).then(([e, g, poolSnap, valSnap, planSnap]) => {
      setEmployees(e.docs.map(d => ({ id: d.id, ...d.data() })))
      setExisting(g.docs.map(d => (d.data() as any).grantNumber || '').filter(Boolean))
      if (poolSnap.exists()) {
        const pd = poolSnap.data()
        setPoolInfo({ boardApproved: pd.boardApprovedShares || 0, totalGranted: pd.totalGranted || 0 })
      }
      const vals = valSnap.docs.map(d => d.data() as any)
      if (vals.length > 0) setLatestFMV(vals[0].fairMarketValue || 0)
      const ps = planSnap.docs.map(d => ({ id: d.id, ...d.data() } as ESOPPlan))
      setEsopPlans(ps)
      const defaultPlan = ps.find(p => p.isDefault) || ps[0]
      if (defaultPlan) setSelectedPlanId(defaultPlan.id)
      setBusy(false)
    })
    if (router.query.employeeId) {
      const eid = router.query.employeeId as string
      setForm(f => ({ ...f, employeeId: eid }))
      getDoc(doc(db, 'companies', companyId, 'employees', eid)).then(s => {
        if (s.exists()) setSelEmp({ id: s.id, ...s.data() })
      })
    }
  }, [companyId, router.query.employeeId])

  const selectedPlan = esopPlans.find(p => p.id === selectedPlanId)

  // Auto-generate schedule from plan
  useEffect(() => {
    if (vestMode !== 'auto' || !selectedPlan) return
    const total = parseInt(form.totalOptions) || 0
    if (total > 0 && form.vestingStartDate) {
      setVestRows(generateScheduleFromPlan(form.vestingStartDate, total, selectedPlan))
    }
  }, [form.vestingStartDate, form.totalOptions, vestMode, selectedPlan])

  function onEmpChange(eid: string) {
    setForm(f => ({ ...f, employeeId: eid }))
    setSelEmp(employees.find(e => e.id === eid) || null)
  }

  async function save() {
    if (!form.employeeId || !form.grantDate || !form.totalOptions) { alert('Employee, grant date, and total options are required'); return }
    if (!selEmp) { alert('Please select an employee'); return }
    if (selEmp.status === 'exited') { alert('Cannot issue grants to exited employees'); return }
    const totalOptions = parseInt(form.totalOptions)
    const validRows = vestRows.filter(r => r.date && r.qty)
    const totalVesting = validRows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0)
    if (totalVesting !== totalOptions) { alert(`Vesting total (${fmtN(totalVesting)}) must equal total options (${fmtN(totalOptions)})`); return }
    if (poolInfo && poolInfo.boardApproved > 0) {
      const available = poolInfo.boardApproved - poolInfo.totalGranted
      if (totalOptions > available) { alert(`Exceeds ESOP pool. Available: ${fmtN(available)}`); return }
    }
    setSaving(true)
    try {
      const grantNumber = generateGrantNumber(existing, new Date(form.grantDate).getFullYear())
      const exercisePrice = parseFloat(form.exercisePrice) || 0
      const companySnap = await getDoc(doc(db, 'companies', companyId))
      const company = companySnap.exists() ? companySnap.data() as any : {}
      const autoAcceptDays = company?.autoAcceptDays || 0
      const expiresAt = new Date(form.grantDate)
      expiresAt.setDate(expiresAt.getDate() + (autoAcceptDays || 30))

      const batch = writeBatch(db)
      const grantRef = doc(collection(db, 'companies', companyId, 'grants'))
      batch.set(grantRef, {
        grantNumber, employeeId: form.employeeId, employeeName: selEmp.name,
        employeeEmail: selEmp.email, grantDate: form.grantDate, grantType: form.grantType,
        totalOptions, exercisePrice, vestingStartDate: form.vestingStartDate,
        esopPlanId: selectedPlanId || null,
        esopPlanName: selectedPlan?.planName || null,
        vestingPeriod: selectedPlan?.vestingPeriodMonths || (companyData as any)?.vestingPeriod || 48,
        vestingCliff: selectedPlan?.cliffMonths || (companyData as any)?.vestingCliff || 12,
        vestingFrequency: selectedPlan?.postCliffFrequency || 'monthly',
        cliffVestingPct: selectedPlan?.cliffVestingPct || 25,
        fmvAtGrant: latestFMV,
        totalGrantValue: latestFMV * totalOptions,
        status: 'draft', locked: false, notes: form.notes || null, companyId,
        expiresAt: expiresAt.toISOString(), exercised: 0,
        createdBy: user!.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
      for (const row of validRows) {
        const d = parseFlexDate(row.date) || row.date
        const vestRef = doc(collection(db, 'companies', companyId, 'vestingEvents'))
        batch.set(vestRef, {
          grantId: grantRef.id, employeeId: form.employeeId, companyId,
          vestDate: d, optionsCount: parseInt(row.qty) || 0,
          status: computeVestingStatus(d, selEmp?.exitDate || null),
          createdAt: serverTimestamp(),
        })
      }
      if (poolInfo && poolInfo.boardApproved > 0) {
        batch.update(doc(db, 'companies', companyId, 'esopPool', 'config'), {
          totalGranted: poolInfo.totalGranted + totalOptions, updatedAt: serverTimestamp()
        })
      }
      await batch.commit()
      await routeGrantForApproval({
        companyId,
        grantId: grantRef.id,
        employeeEmail: selEmp.email,
        employeeName: selEmp.name,
        grant: { grantNumber, grantDate: form.grantDate, grantType: form.grantType, totalOptions, exercisePrice }
      }, company)
      await logAudit({ companyId, userId: user!.uid, userEmail: profile?.email || '', action: 'grant_created', entityType: 'grant', entityId: grantRef.id, entityLabel: grantNumber, after: { grantNumber, totalOptions, status: 'issued' } })
      router.push(`/grants/${grantRef.id}`)
    } catch (e: any) { alert('Error: ' + e.message); setSaving(false) }
  }

  const totalVesting = vestRows.reduce((s, r) => s + (parseInt(r.qty || '0') || 0), 0)
  const totalOptions = parseInt(form.totalOptions) || 0
  const diff = totalOptions - totalVesting
  const poolAvailable = poolInfo ? poolInfo.boardApproved - poolInfo.totalGranted : null

  if (loading || busy) return <Layout title="New Grant"><div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><div className="spinner-lg" /></div></Layout>
  if (!canEdit(profile?.role)) return <Layout title="New Grant"><div className="alert alert-danger">Editor access required.</div></Layout>

  return (
    <Layout title="Issue Grant">
      <div style={{ maxWidth: 700 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div><h1 className="page-title">Issue Grant</h1><p className="page-subtitle">Create a new ESOP / RSU / SAR grant</p></div>
          <button onClick={() => router.back()} className="btn btn-ghost btn-sm">← Back</button>
        </div>

        {poolInfo && poolInfo.boardApproved > 0 && (
          <div className="card mb-4" style={{ background: 'rgba(45,95,168,0.04)', border: '1px solid rgba(45,95,168,0.15)' }}>
            <div style={{ display: 'flex', gap: 32 }}>
              <div><div className="text-xs text-muted">Board Approved Pool</div><div style={{ fontWeight: 700, fontSize: 18 }}>{fmtN(poolInfo.boardApproved)}</div></div>
              <div><div className="text-xs text-muted">Already Granted</div><div style={{ fontWeight: 700, fontSize: 18 }}>{fmtN(poolInfo.totalGranted)}</div></div>
              <div><div className="text-xs text-muted">Available</div><div style={{ fontWeight: 700, fontSize: 18, color: poolAvailable! < 5000 ? 'var(--danger)' : 'var(--success)' }}>{fmtN(poolAvailable!)}</div></div>
            </div>
          </div>
        )}

        <div className="card mb-4">
          <h2 className="section-title mb-4">Grant Details</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="label">Employee *</label>
              <select className="input" value={form.employeeId} onChange={e => onEmpChange(e.target.value)}>
                <option value="">Select employee...</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.employeeCode ? ` (${e.employeeCode})` : ''}</option>)}
              </select>
            </div>
            {selEmp?.status === 'exited' && <div className="alert alert-danger">⛔ {selEmp.name} has exited.</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label className="label">Grant Date *</label><input type="date" className="input" value={form.grantDate} onChange={e => setForm(f => ({ ...f, grantDate: e.target.value }))} /></div>
              <div>
                <label className="label">Grant Type</label>
                <select className="input" value={form.grantType} onChange={e => setForm(f => ({ ...f, grantType: e.target.value }))}>
                  <option>ISO</option><option>NSO</option><option>RSU</option><option>SAR</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label className="label">Total Options *</label><input type="number" className="input" value={form.totalOptions} onChange={e => setForm(f => ({ ...f, totalOptions: e.target.value }))} placeholder="10000" /></div>
              <div><label className="label">Exercise Price (₹) *</label><input type="number" step="0.01" className="input" value={form.exercisePrice} onChange={e => setForm(f => ({ ...f, exercisePrice: e.target.value }))} placeholder="10.00" /></div>
            </div>
            {latestFMV > 0 && form.totalOptions && (
              <div className="alert alert-info" style={{ fontSize: 12 }}>
                Current FMV: ₹{latestFMV}/option · Total grant value: <strong>₹{fmtN(latestFMV * (parseInt(form.totalOptions) || 0))}</strong>
              </div>
            )}
            <div><label className="label">Vesting Start Date</label><input type="date" className="input" value={form.vestingStartDate} onChange={e => setForm(f => ({ ...f, vestingStartDate: e.target.value }))} /></div>
            <div><label className="label">Notes / Conditions</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any special conditions..." /></div>
          </div>
        </div>

        <div className="card mb-4">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 className="section-title">Vesting Schedule</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setVestMode('auto')} className={`btn btn-xs ${vestMode === 'auto' ? 'btn-primary' : 'btn-ghost'}`}>Auto (from Plan)</button>
              <button onClick={() => setVestMode('manual')} className={`btn btn-xs ${vestMode === 'manual' ? 'btn-primary' : 'btn-ghost'}`}>Manual</button>
            </div>
          </div>

          {vestMode === 'auto' && (
            <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label className="label" style={{ marginBottom: 4 }}>ESOP Plan</label>
                  {esopPlans.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--danger)' }}>
                      No ESOP plans configured.{' '}
                      <a href="/settings/esop-plans" style={{ color: 'var(--accent)' }}>Create a plan →</a>
                    </div>
                  ) : (
                    <select className="input" value={selectedPlanId} onChange={e => setSelectedPlanId(e.target.value)}>
                      <option value="">Select plan...</option>
                      {esopPlans.map(p => <option key={p.id} value={p.id}>{p.planName}{p.isDefault ? ' (Default)' : ''}</option>)}
                    </select>
                  )}
                </div>
                {selectedPlan && (
                  <div style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span>Cliff: <strong>{selectedPlan.cliffMonths}m</strong></span>
                    <span>Total: <strong>{selectedPlan.vestingPeriodMonths}m</strong></span>
                    <span>Cliff vest: <strong>{selectedPlan.cliffVestingPct}%</strong></span>
                    <span>Frequency: <strong style={{ textTransform: 'capitalize' }}>{selectedPlan.postCliffFrequency}</strong></span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ fontSize: 11, fontFamily: 'monospace', color: diff !== 0 ? 'var(--warning)' : 'var(--success)', marginBottom: 10 }}>
            {totalVesting}/{totalOptions} options {diff !== 0 ? `(${diff > 0 ? '+' : ''}${-diff} remaining)` : '✅ fully allocated'}
          </div>

          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {vestRows.map((row, i) => {
              const isLapsed = selEmp?.exitDate && row.date && row.date > selEmp.exitDate
              return (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    {i === 0 && <label className="label">Vesting Date {isLapsed && <span style={{ fontSize: 9, color: 'var(--danger)', marginLeft: 4 }}>WILL LAPSE</span>}</label>}
                    <input type="date" className="input" value={row.date} style={isLapsed ? { borderColor: 'rgba(181,63,63,0.4)' } : {}}
                      readOnly={vestMode === 'auto'}
                      onChange={e => setVestRows(r => r.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} />
                  </div>
                  <div style={{ width: 110 }}>
                    {i === 0 && <label className="label">Options</label>}
                    <input type="number" className="input" value={row.qty}
                      readOnly={vestMode === 'auto'}
                      onChange={e => setVestRows(r => r.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
                  </div>
                  {vestMode === 'manual' && vestRows.length > 1 && (
                    <button onClick={() => setVestRows(r => r.filter((_, j) => j !== i))} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)', marginBottom: 2 }}>✕</button>
                  )}
                </div>
              )
            })}
          </div>
          {vestMode === 'manual' && <button onClick={() => setVestRows(r => [...r, { date: '', qty: '' }])} className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>+ Add Row</button>}
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={save} disabled={saving || !form.employeeId || !form.totalOptions || diff !== 0 || selEmp?.status === 'exited'} className="btn btn-primary">
            {saving ? '⏳ Saving...' : '📜 Issue Grant'}
          </button>
          <button onClick={() => router.back()} className="btn btn-ghost">Cancel</button>
        </div>
      </div>
    </Layout>
  )
}
