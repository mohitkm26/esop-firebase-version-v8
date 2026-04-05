import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import {
  collection, getDocs, query, orderBy, getDoc, doc, where,
  serverTimestamp, writeBatch
} from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import { generateGrantNumber, parseFlexDate, computeVestingStatus, today, fmtN } from '@/lib/utils'
import { logAudit } from '@/lib/audit'
import { createNotification } from '@/lib/utils'
import { canEdit } from '@/lib/roles'
import { sendGrantLetterEmail } from '@/lib/email'

type VestRow = { date: string; qty: string }

function generateVestingRows(
  startDate: string, totalOptions: number,
  vestingPeriodMonths: number, cliffMonths: number
): VestRow[] {
  if (!startDate || !totalOptions || !vestingPeriodMonths) return [{ date: '', qty: '' }]
  const rows: VestRow[] = []
  const start = new Date(startDate)
  const cliffDate = new Date(start)
  cliffDate.setMonth(cliffDate.getMonth() + cliffMonths)

  const postCliffMonths = vestingPeriodMonths - cliffMonths
  const monthlyQty = Math.floor(totalOptions / vestingPeriodMonths)
  let allocated = 0

  // Cliff tranche
  if (cliffMonths > 0) {
    const cliffQty = monthlyQty * cliffMonths
    rows.push({ date: cliffDate.toISOString().split('T')[0], qty: String(cliffQty) })
    allocated += cliffQty
  }

  // Monthly tranches post-cliff
  for (let m = 1; m <= postCliffMonths; m++) {
    const d = new Date(cliffDate)
    d.setMonth(d.getMonth() + m)
    const isLast = m === postCliffMonths
    const qty = isLast ? totalOptions - allocated : monthlyQty
    rows.push({ date: d.toISOString().split('T')[0], qty: String(qty) })
    allocated += qty
  }
  return rows
}

export default function NewGrant() {
  const { user, profile, loading } = useAuth()
  const { companyId, companyData } = usePlan()
  const router = useRouter()
  const [employees, setEmployees] = useState<any[]>([])
  const [existing, setExisting] = useState<string[]>([])
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)
  const [vestRows, setVestRows] = useState<VestRow[]>([{ date: '', qty: '' }])
  const [vestMode, setVestMode] = useState<'auto' | 'manual'>('auto')
  const [selEmp, setSelEmp] = useState<any>(null)
  const [poolInfo, setPoolInfo] = useState<{ boardApproved: number; totalGranted: number } | null>(null)
  const [form, setForm] = useState({
    employeeId: '', grantDate: today(), grantType: 'ISO', totalOptions: '',
    exercisePrice: '', vestingStartDate: today(), notes: '',
  })

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])

  useEffect(() => {
    if (!companyId) return
    Promise.all([
      getDocs(query(collection(db, 'companies', companyId, 'employees'), where('status', '!=', 'exited'), orderBy('name'))),
      getDocs(query(collection(db, 'companies', companyId, 'grants'))),
      getDoc(doc(db, 'companies', companyId, 'esopPool', 'config')),
    ]).then(([e, g, poolSnap]) => {
      setEmployees(e.docs.map(d => ({ id: d.id, ...d.data() })))
      setExisting(g.docs.map(d => (d.data() as any).grantNumber || '').filter(Boolean))
      if (poolSnap.exists()) {
        const pd = poolSnap.data()
        setPoolInfo({ boardApproved: pd.boardApprovedShares || 0, totalGranted: pd.totalGranted || 0 })
      }
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

  // Auto-generate vesting rows when key params change
  useEffect(() => {
    if (vestMode !== 'auto') return
    const total = parseInt(form.totalOptions) || 0
    const period = (companyData as any)?.vestingPeriod || 48
    const cliff = (companyData as any)?.vestingCliff || 12
    if (total > 0 && form.vestingStartDate) {
      const rows = generateVestingRows(form.vestingStartDate, total, period, cliff)
      setVestRows(rows)
    }
  }, [form.vestingStartDate, form.totalOptions, vestMode, companyData])

  function onEmpChange(eid: string) {
    setForm(f => ({ ...f, employeeId: eid }))
    setSelEmp(employees.find(e => e.id === eid) || null)
  }

  async function save() {
    if (!form.employeeId || !form.grantDate || !form.totalOptions) {
      alert('Employee, grant date, and total options are required'); return
    }
    if (!selEmp) { alert('Please select an employee'); return }
    if (selEmp.status === 'exited') { alert('Cannot issue grants to exited employees'); return }

    const totalOptions = parseInt(form.totalOptions)
    const validRows = vestRows.filter(r => r.date && r.qty)
    const totalVesting = validRows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0)
    if (totalVesting !== totalOptions) {
      alert(`Vesting schedule total (${totalVesting}) must equal total options (${totalOptions})`); return
    }

    // Pool cap check
    if (poolInfo && poolInfo.boardApproved > 0) {
      const available = poolInfo.boardApproved - poolInfo.totalGranted
      if (totalOptions > available) {
        alert(`This grant would exceed the ESOP pool. Available: ${fmtN(available)}, Requested: ${fmtN(totalOptions)}`); return
      }
    }

    setSaving(true)
    try {
      const grantNumber = generateGrantNumber(existing, new Date(form.grantDate).getFullYear())
      const exercisePrice = parseFloat(form.exercisePrice) || 0
      const exitDate = selEmp?.exitDate || null
      const companySnap = await getDoc(doc(db, 'companies', companyId))
      const company = companySnap.exists() ? companySnap.data() as any : null
      const expiryDays = company?.grantExpiryDays || 30
      const autoAcceptDays = company?.autoAcceptDays || 0
      const expiresAt = new Date(form.grantDate)
      expiresAt.setDate(expiresAt.getDate() + expiryDays)
      const autoAcceptAt = autoAcceptDays > 0 ? (() => {
        const d = new Date(form.grantDate); d.setDate(d.getDate() + autoAcceptDays); return d.toISOString()
      })() : null

      const batch = writeBatch(db)

      // Grant document
      const grantRef = doc(collection(db, 'companies', companyId, 'grants'))
      batch.set(grantRef, {
        grantNumber, employeeId: form.employeeId, employeeName: selEmp.name,
        employeeEmail: selEmp.email, grantDate: form.grantDate, grantType: form.grantType,
        totalOptions, exercisePrice, vestingStartDate: form.vestingStartDate,
        vestingPeriod: company?.vestingPeriod || 48, vestingCliff: company?.vestingCliff || 12,
        status: 'issued', locked: false, notes: form.notes || null, companyId,
        expiresAt: expiresAt.toISOString(), autoAcceptAt, exercised: 0,
        grant_template_url: company?.grant_template_url || null,
        grant_template_name: company?.grant_template_name || null,
        createdBy: user!.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })

      // Vesting events
      for (const row of validRows) {
        const d = parseFlexDate(row.date) || row.date
        const vestRef = doc(collection(db, 'companies', companyId, 'vestingEvents'))
        batch.set(vestRef, {
          grantId: grantRef.id, employeeId: form.employeeId, companyId,
          vestDate: d, optionsCount: parseInt(row.qty) || 0,
          status: computeVestingStatus(d, exitDate),
          createdAt: serverTimestamp(),
        })
      }

      // Update pool if configured
      if (poolInfo && poolInfo.boardApproved > 0) {
        const poolRef = doc(db, 'companies', companyId, 'esopPool', 'config')
        batch.update(poolRef, { totalGranted: poolInfo.totalGranted + totalOptions, updatedAt: serverTimestamp() })
      }

      await batch.commit()

      // Send grant letter email (non-blocking)
      sendGrantLetterEmail({
        to: selEmp.email, employeeName: selEmp.name, companyId,
        grant: { grantNumber, grantDate: form.grantDate, grantType: form.grantType, totalOptions, exercisePrice },
      }).catch(console.error)

      // Notification (non-blocking)
      getDocs(query(collection(db, 'users'), where('companyId', '==', companyId), where('role', '==', 'employee')))
        .then(snap => {
          const empUser = snap.docs.find(d => d.data().email === selEmp.email)
          if (empUser) createNotification(companyId, empUser.id, 'grant_issued',
            `A new grant (${grantNumber}) of ${totalOptions.toLocaleString()} options has been issued.`,
            `/grants/${grantRef.id}`)
        }).catch(console.error)

      await logAudit({ companyId, userId: user!.uid, userEmail: profile?.email || '', action: 'grant_created', entityType: 'grant', entityId: grantRef.id, entityLabel: grantNumber, after: { grantNumber, totalOptions, employeeId: form.employeeId, status: 'issued' } })
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
          <div>
            <h1 className="page-title">Issue Grant</h1>
            <p className="page-subtitle">Create a new ESOP / RSU / SAR grant with vesting schedule</p>
          </div>
          <button onClick={() => router.back()} className="btn btn-ghost btn-sm">← Back</button>
        </div>

        {poolInfo && poolInfo.boardApproved > 0 && (
          <div className="card mb-4" style={{ background: 'rgba(45,95,168,0.05)', border: '1px solid rgba(45,95,168,0.2)' }}>
            <div style={{ display: 'flex', gap: 24 }}>
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
            {selEmp?.status === 'exited' && <div className="alert alert-danger">⛔ {selEmp.name} has exited. Cannot issue new grants.</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Grant Date *</label>
                <input type="date" className="input" value={form.grantDate} onChange={e => setForm(f => ({ ...f, grantDate: e.target.value }))} />
              </div>
              <div>
                <label className="label">Grant Type</label>
                <select className="input" value={form.grantType} onChange={e => setForm(f => ({ ...f, grantType: e.target.value }))}>
                  <option>ISO</option><option>NSO</option><option>RSU</option><option>SAR</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Total Options *</label>
                <input type="number" className="input" value={form.totalOptions} onChange={e => setForm(f => ({ ...f, totalOptions: e.target.value }))} placeholder="10000" />
              </div>
              <div>
                <label className="label">Exercise Price (₹) *</label>
                <input type="number" step="0.01" className="input" value={form.exercisePrice} onChange={e => setForm(f => ({ ...f, exercisePrice: e.target.value }))} placeholder="10.00" />
              </div>
            </div>
            <div>
              <label className="label">Vesting Start Date</label>
              <input type="date" className="input" value={form.vestingStartDate} onChange={e => setForm(f => ({ ...f, vestingStartDate: e.target.value }))} />
            </div>
            <div>
              <label className="label">Notes / Conditions</label>
              <textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any special conditions or remarks..." />
            </div>
          </div>
        </div>

        <div className="card mb-4">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 className="section-title">Vesting Schedule</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Mode:</span>
              <button onClick={() => setVestMode('auto')} className={`btn btn-xs ${vestMode === 'auto' ? 'btn-primary' : 'btn-ghost'}`}>Auto (from Settings)</button>
              <button onClick={() => setVestMode('manual')} className={`btn btn-xs ${vestMode === 'manual' ? 'btn-primary' : 'btn-ghost'}`}>Manual</button>
            </div>
          </div>

          {vestMode === 'auto' && (
            <div className="alert alert-info mb-4" style={{ fontSize: 12 }}>
              Auto-generated using settings: {(companyData as any)?.vestingCliff || 12}-month cliff, {(companyData as any)?.vestingPeriod || 48}-month total vesting.
              Switch to Manual to customise individual rows.
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: diff !== 0 ? 'var(--warning)' : 'var(--success)' }}>
              {totalVesting}/{totalOptions} options allocated {diff !== 0 && `(${diff > 0 ? '+' : ''}${-diff} unallocated)`}
            </div>
          </div>

          {vestRows.map((row, i) => {
            const isLapsed = selEmp?.exitDate && row.date && row.date > selEmp.exitDate
            return (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  {i === 0 && <label className="label">Vesting Date {isLapsed && <span style={{ fontSize: 9, color: 'var(--danger)', marginLeft: 4 }}>WILL LAPSE</span>}</label>}
                  <input
                    type="date" className="input" value={row.date}
                    style={isLapsed ? { borderColor: 'rgba(181,63,63,0.4)' } : {}}
                    onChange={e => setVestRows(r => r.map((x, j) => j === i ? { ...x, date: e.target.value } : x))}
                    readOnly={vestMode === 'auto'}
                  />
                </div>
                <div style={{ width: 120 }}>
                  {i === 0 && <label className="label">Options</label>}
                  <input
                    type="number" className="input" value={row.qty}
                    onChange={e => setVestRows(r => r.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))}
                    readOnly={vestMode === 'auto'}
                  />
                </div>
                {vestMode === 'manual' && vestRows.length > 1 && (
                  <button onClick={() => setVestRows(r => r.filter((_, j) => j !== i))} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)', marginBottom: 2 }}>✕</button>
                )}
              </div>
            )
          })}
          {vestMode === 'manual' && (
            <button onClick={() => setVestRows(r => [...r, { date: '', qty: '' }])} className="btn btn-ghost btn-sm">+ Add Row</button>
          )}
          {totalOptions > 0 && diff === 0 && <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 8 }}>✅ All {fmtN(totalOptions)} options allocated across {vestRows.length} vesting event{vestRows.length > 1 ? 's' : ''}</div>}
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={save}
            disabled={saving || !form.employeeId || !form.totalOptions || diff !== 0 || selEmp?.status === 'exited'}
            className="btn btn-primary"
          >
            {saving ? '⏳ Saving...' : '📜 Issue Grant'}
          </button>
          <button onClick={() => router.back()} className="btn btn-ghost">Cancel</button>
        </div>
      </div>
    </Layout>
  )
}
