import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db, storage } from '@/lib/firebase'
import { doc, getDoc, updateDoc, deleteDoc, collection, getDocs, addDoc, query, where, serverTimestamp, writeBatch } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import { fmtDate, fmtN, fmtC, today, computeVesting, computeVestingStatus, validateExercise, parseFlexDate } from '@/lib/utils'
import { logAudit } from '@/lib/audit'
import { canEdit } from '@/lib/roles'
import GrantLetterView from '@/components/GrantLetterView'

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge badge-muted', issued: 'badge badge-blue', pending_acceptance: 'badge badge-blue',
  pending_signatory_approval: 'badge badge-blue',
  accepted: 'badge badge-green', active: 'badge badge-green', exercised: 'badge badge-purple',
  expired: 'badge badge-red', cancelled: 'badge badge-red', rejected: 'badge badge-red'
}

function fmtIST(value: any): string {
  if (!value) return '—'
  try {
    const date = typeof value?.toDate === 'function' ? value.toDate()
      : typeof value?.seconds === 'number' ? new Date(value.seconds * 1000)
      : new Date(value)
    if (isNaN(date.getTime())) return '—'
    return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
  } catch { return '—' }
}

type VestRow = { id?: string; date: string; qty: string; isNew?: boolean }

export default function GrantDetail() {
  const router = useRouter()
  const { id } = router.query as { id: string }
  const { user, profile } = useAuth()
  const { companyId, companyData } = usePlan()

  const [grant, setGrant] = useState<any>(null)
  const [employee, setEmployee] = useState<any>(null)
  const [vestEvents, setVestEvents] = useState<any[]>([])
  const [exercises, setExercises] = useState<any[]>([])
  const [busy, setBusy] = useState(true)
  const [tab, setTab] = useState<'vesting' | 'exercises' | 'letter' | 'edit'>('vesting')
  const [showExForm, setShowExForm] = useState(false)
  const [exForm, setExForm] = useState({ exerciseDate: today(), sharesExercised: '', fairMarketValue: '', notes: '' })
  const [exError, setExError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showAcceptModal, setShowAcceptModal] = useState(false)
  const [offlineDate, setOfflineDate] = useState(today())
  const [offlineFile, setOfflineFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  // Edit form
  const [editForm, setEditForm] = useState<any>({})
  const [editVestRows, setEditVestRows] = useState<VestRow[]>([])
  const [editSaving, setEditSaving] = useState(false)
  const [editMsg, setEditMsg] = useState('')

  useEffect(() => {
    if (!id || !companyId) return
    async function load() {
      const [gSnap, vSnap, exSnap] = await Promise.all([
        getDoc(doc(db, 'companies', companyId, 'grants', id)),
        getDocs(query(collection(db, 'companies', companyId, 'vestingEvents'), where('grantId', '==', id), where('optionsCount', '>', 0))),
        getDocs(query(collection(db, 'companies', companyId, 'exercises'), where('grantId', '==', id))),
      ])
      if (gSnap.exists()) {
        const g = { id: gSnap.id, ...gSnap.data() }
        setGrant(g)
        setEditForm({
          grantDate: (g as any).grantDate || '',
          grantType: (g as any).grantType || 'ISO',
          totalOptions: String((g as any).totalOptions || ''),
          exercisePrice: String((g as any).exercisePrice || ''),
          vestingStartDate: (g as any).vestingStartDate || '',
          notes: (g as any).notes || '',
        })
        const empSnap = await getDoc(doc(db, 'companies', companyId, 'employees', (g as any).employeeId))
        if (empSnap.exists()) setEmployee({ id: empSnap.id, ...empSnap.data() })
      }
      const vEvents = vSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => a.vestDate.localeCompare(b.vestDate))
      setVestEvents(vEvents)
      setEditVestRows(vEvents.map((ev: any) => ({ id: ev.id, date: ev.vestDate, qty: String(ev.optionsCount) })))
      setExercises(exSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setBusy(false)
    }
    load()
  }, [id, companyId])

  async function updateStatus(newStatus: string) {
    if (!id || !grant || !companyId) return
    setSaving(true)
    const updates: any = { status: newStatus, updatedAt: serverTimestamp() }
    if (newStatus === 'accepted') { updates.locked = true; updates.acceptedAt = serverTimestamp() }
    if (newStatus === 'issued') updates.issuedAt = serverTimestamp()
    await updateDoc(doc(db, 'companies', companyId, 'grants', id), updates)
    await logAudit({ companyId, userId: user!.uid, userEmail: profile?.email || '', action: ('grant_' + newStatus) as any, entityType: 'grant', entityId: id, entityLabel: grant.grantNumber, before: { status: grant.status }, after: { status: newStatus } })
    setGrant((g: any) => ({ ...g, ...updates }))
    setSaving(false)
  }

  async function adminAcceptWithUpload() {
    if (!id || !grant || !companyId) return
    setUploading(true)
    try {
      let signedLetterUrl = ''
      if (offlineFile) {
        const storageRef = ref(storage, `companies/${companyId}/grants/${id}/signed-letter-${Date.now()}.${offlineFile.name.split('.').pop()}`)
        await uploadBytes(storageRef, offlineFile)
        signedLetterUrl = await getDownloadURL(storageRef)
      }
      const updates: any = {
        status: 'accepted', locked: true,
        acceptedAt: new Date(offlineDate + 'T00:00:00').toISOString(),
        acceptedBy: 'admin-offline', acceptanceMethod: 'offline_signed',
        offlineSignedDate: offlineDate, updatedAt: serverTimestamp(),
        ...(signedLetterUrl ? { signedLetterUrl } : {}),
      }
      await updateDoc(doc(db, 'companies', companyId, 'grants', id), updates)
      await logAudit({ companyId, userId: user!.uid, userEmail: profile?.email || '', action: 'grant_accepted', entityType: 'grant', entityId: id, entityLabel: grant.grantNumber, after: { method: 'offline', offlineSignedDate: offlineDate } })
      setGrant((g: any) => ({ ...g, ...updates }))
      setShowAcceptModal(false)
    } catch (e: any) { alert('Error: ' + e.message) }
    setUploading(false)
  }

  async function saveEdit() {
    if (!id || !grant || !companyId) return
    setEditSaving(true)
    try {
      const updates = {
        grantDate: editForm.grantDate,
        grantType: editForm.grantType,
        totalOptions: parseInt(editForm.totalOptions) || grant.totalOptions,
        exercisePrice: parseFloat(editForm.exercisePrice) || grant.exercisePrice,
        vestingStartDate: editForm.vestingStartDate,
        notes: editForm.notes || null,
        updatedAt: serverTimestamp(),
      }
      await updateDoc(doc(db, 'companies', companyId, 'grants', id), updates)

      // Update vesting schedule — delete old, add new
      const validRows = editVestRows.filter(r => r.date && r.qty)
      const totalVesting = validRows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0)
      if (totalVesting !== (parseInt(editForm.totalOptions) || grant.totalOptions)) {
        setEditMsg('⚠️ Vesting total does not match total options. Fix before saving.')
        setEditSaving(false)
        return
      }

      const batch = writeBatch(db)
      // Delete existing vesting events
      vestEvents.forEach(ev => batch.delete(doc(db, 'companies', companyId, 'vestingEvents', ev.id)))
      // Add new vesting events
      validRows.forEach(row => {
        const vestRef = doc(collection(db, 'companies', companyId, 'vestingEvents'))
        batch.set(vestRef, {
          grantId: id, employeeId: grant.employeeId, companyId,
          vestDate: row.date, optionsCount: parseInt(row.qty) || 0,
          status: computeVestingStatus(row.date, employee?.exitDate || null),
          createdAt: serverTimestamp(),
        })
      })
      await batch.commit()

      await logAudit({ companyId, userId: user!.uid, userEmail: profile?.email || '', action: 'grant_modified', entityType: 'grant', entityId: id, entityLabel: grant.grantNumber, before: { totalOptions: grant.totalOptions }, after: updates })
      setGrant((g: any) => ({ ...g, ...updates }))
      // Reload vest events
      const vSnap = await getDocs(query(collection(db, 'companies', companyId, 'vestingEvents'), where('grantId', '==', id)))
      const vEvents = vSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => a.vestDate.localeCompare(b.vestDate))
      setVestEvents(vEvents)
      setEditVestRows(vEvents.map((ev: any) => ({ id: ev.id, date: ev.vestDate, qty: String(ev.optionsCount) })))
      setEditMsg('✅ Grant and vesting schedule updated.')
      setTimeout(() => setEditMsg(''), 4000)
    } catch (e: any) { setEditMsg('Error: ' + e.message) }
    setEditSaving(false)
  }

  async function recordExercise() {
    if (!grant || !companyId) return
    const shares = parseInt(exForm.sharesExercised)
    const fmv = parseFloat(exForm.fairMarketValue)
    if (!shares || !fmv) { setExError('Shares and FMV are required.'); return }
    const alreadyExercised = exercises.reduce((s: number, x: any) => s + x.sharesExercised, 0)
    const validation = validateExercise(vestEvents as any, grant.totalOptions, alreadyExercised, shares, exForm.exerciseDate, employee?.exitDate)
    if (!validation.valid) { setExError(validation.error || 'Invalid'); return }
    setSaving(true); setExError('')
    try {
      const perquisite = Math.max(0, fmv - grant.exercisePrice) * shares
      const exRef = await addDoc(collection(db, 'companies', companyId, 'exercises'), {
        grantId: id, employeeId: grant.employeeId, employeeName: grant.employeeName,
        grantNumber: grant.grantNumber, companyId, exerciseDate: exForm.exerciseDate,
        sharesExercised: shares, exercisePrice: grant.exercisePrice, fairMarketValue: fmv,
        perquisiteValue: perquisite, totalAmount: grant.exercisePrice * shares,
        notes: exForm.notes || null, createdAt: serverTimestamp(), createdBy: user!.uid
      })
      await logAudit({ companyId, userId: user!.uid, userEmail: profile?.email || '', action: 'exercise_recorded', entityType: 'exercise', entityId: exRef.id, entityLabel: grant.grantNumber, after: { shares, fmv, perquisite } })
      setExercises(ex => [...ex, { id: exRef.id, grantId: id, employeeId: grant.employeeId, exerciseDate: exForm.exerciseDate, sharesExercised: shares, exercisePrice: grant.exercisePrice, fairMarketValue: fmv, perquisiteValue: perquisite }])
      setShowExForm(false)
      setExForm({ exerciseDate: today(), sharesExercised: '', fairMarketValue: '', notes: '' })
    } catch (e: any) { setExError(e.message) }
    setSaving(false)
  }

  if (busy) return <Layout title="Grant"><div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><div className="spinner-lg" /></div></Layout>
  if (!grant) return <Layout title="Grant"><div className="alert alert-danger">Grant not found.</div></Layout>

  const isLocked = grant.locked === true
  const editable = !isLocked && canEdit(profile?.role)
  const vestResult = computeVesting(vestEvents as any, grant.totalOptions, 0, exercises.reduce((s: number, x: any) => s + x.sharesExercised, 0), employee?.exitDate)
  const totalExercised = exercises.reduce((s: number, x: any) => s + x.sharesExercised, 0)
  const editVestTotal = editVestRows.reduce((s, r) => s + (parseInt(r.qty || '0') || 0), 0)
  const editTotalOptions = parseInt(editForm.totalOptions) || grant.totalOptions

  return (
    <Layout title={grant.grantNumber}>
      <div style={{ maxWidth: 900 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.back()} className="btn btn-ghost btn-sm">← Back</button>
            <div>
              <h1 className="page-title" style={{ fontFamily: 'monospace' }}>{grant.grantNumber}</h1>
              <p className="page-subtitle">{grant.employeeName} · {grant.grantType} · Issued {fmtDate(grant.grantDate)}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isLocked && <span style={{ fontSize: 12, color: 'var(--text3)' }}>🔒 Locked</span>}
            <span className={STATUS_BADGE[grant.status] || 'badge badge-muted'}>{(grant.status || 'draft').replace(/_/g, ' ')}</span>
            {/* Edit button at top */}
            {editable && (
              <button onClick={() => setTab('edit')} className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }}>✎ Edit Grant</button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total Options', val: fmtN(grant.totalOptions) },
            { label: 'Vested', val: fmtN(vestResult.vested), sub: `${vestResult.pct}%` },
            { label: 'Exercised', val: fmtN(totalExercised) },
            { label: 'Available', val: fmtN(vestResult.netVested) },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-val">{s.val}</div>
              <div className="stat-label">{s.label}</div>
              {s.sub && <div className="stat-sub">{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* Details */}
        <div className="card mb-4">
          <h3 className="section-title mb-4">Grant Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            {[
              ['Employee', grant.employeeName], ['Email', grant.employeeEmail || '—'],
              ['Grant Type', grant.grantType], ['Exercise Price', fmtC(grant.exercisePrice)],
              ['Grant Date', fmtDate(grant.grantDate)], ['Vesting Start', fmtDate(grant.vestingStartDate)],
              ['ESOP Plan', grant.esopPlanName || '—'],
              ['Accepted At (IST)', grant.acceptedAt ? fmtIST(grant.acceptedAt) : '—'],
              ['Acceptance Method', grant.acceptanceMethod?.replace(/_/g, ' ') || '—'],
              ['Notes', grant.notes || '—'],
            ].map(([k, v]) => (
              <div key={k}><div className="text-xs text-muted" style={{ marginBottom: 2 }}>{k}</div><div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div></div>
            ))}
          </div>
          {grant.signedLetterUrl && (
            <div style={{ marginTop: 12 }}>
              <a href={grant.signedLetterUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">📎 View Signed Letter</a>
            </div>
          )}
        </div>

        {/* Actions */}
        {canEdit(profile?.role) && (
          <div className="card mb-4">
            <h3 className="section-title mb-3">Actions</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {grant.status === 'draft' && <button onClick={() => updateStatus('issued')} disabled={saving} className="btn btn-primary btn-sm">→ Issue Grant</button>}
              {['draft', 'issued', 'pending_acceptance', 'pending_signatory_approval'].includes(grant.status) && (
                <button onClick={() => setShowAcceptModal(true)} className="btn btn-success btn-sm">✓ Mark Accepted (offline signed)</button>
              )}
              {['accepted', 'active'].includes(grant.status) && <button onClick={() => setShowExForm(true)} className="btn btn-primary btn-sm">💰 Record Exercise</button>}
              {!['cancelled', 'expired', 'exercised', 'accepted'].includes(grant.status) && (
                <button onClick={() => { if (confirm('Cancel this grant?')) updateStatus('cancelled') }} disabled={saving} className="btn btn-danger btn-sm">✕ Cancel Grant</button>
              )}
            </div>
          </div>
        )}

        {/* Admin accept modal */}
        {showAcceptModal && (
          <div className="card mb-4" style={{ border: '1px solid rgba(45,122,79,0.3)', background: 'rgba(45,122,79,0.04)' }}>
            <h3 className="section-title mb-3">Mark as Accepted — Offline / Admin</h3>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>Upload the physically signed grant letter and enter the date the employee signed.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label className="label">Date Employee Signed *</label>
                <input type="date" className="input" value={offlineDate} onChange={e => setOfflineDate(e.target.value)} max={today()} />
              </div>
              <div>
                <label className="label">Upload Signed Letter (optional)</label>
                <input type="file" className="input" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setOfflineFile(e.target.files?.[0] || null)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={adminAcceptWithUpload} disabled={uploading || !offlineDate} className="btn btn-success btn-sm">
                {uploading ? 'Uploading...' : '✓ Confirm & Lock Grant'}
              </button>
              <button onClick={() => setShowAcceptModal(false)} className="btn btn-ghost btn-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Exercise form */}
        {showExForm && (
          <div className="card mb-4" style={{ border: '1px solid rgba(45,95,168,0.3)' }}>
            <h3 className="section-title mb-4">Record Exercise</h3>
            {exError && <div className="alert alert-danger mb-4">{exError}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div><label className="label">Exercise Date</label><input type="date" className="input" value={exForm.exerciseDate} onChange={e => setExForm(f => ({ ...f, exerciseDate: e.target.value }))} max={today()} /></div>
              <div><label className="label">Shares to Exercise</label><input type="number" className="input" value={exForm.sharesExercised} onChange={e => setExForm(f => ({ ...f, sharesExercised: e.target.value }))} placeholder={`Max: ${fmtN(vestResult.netVested)}`} /></div>
              <div><label className="label">FMV per Share (₹)</label><input type="number" step="0.01" className="input" value={exForm.fairMarketValue} onChange={e => setExForm(f => ({ ...f, fairMarketValue: e.target.value }))} placeholder="Current fair value" /></div>
              <div><label className="label">Notes</label><input className="input" value={exForm.notes} onChange={e => setExForm(f => ({ ...f, notes: e.target.value }))} /></div>
            </div>
            {exForm.fairMarketValue && exForm.sharesExercised && (
              <div className="alert alert-info mb-4">
                Estimated perquisite: ₹{fmtN(Math.max(0, (parseFloat(exForm.fairMarketValue) - grant.exercisePrice) * parseInt(exForm.sharesExercised)))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={recordExercise} disabled={saving} className="btn btn-primary">{saving ? 'Recording...' : '💰 Record Exercise'}</button>
              <button onClick={() => { setShowExForm(false); setExError('') }} className="btn btn-ghost">Cancel</button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
          {(['vesting', 'exercises', 'letter', ...(editable ? ['edit'] : [])]).map((t: any) => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 16px', border: 'none', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 700 : 400, color: tab === t ? 'var(--accent)' : 'var(--text2)', marginBottom: -1, textTransform: 'capitalize' }}>
              {t === 'vesting' ? `Vesting (${vestEvents.length})` : t === 'exercises' ? `Exercises (${exercises.length})` : t === 'letter' ? 'Grant Letter' : 'Edit Grant'}
            </button>
          ))}
        </div>

        {tab === 'vesting' && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="tbl">
              <thead><tr><th>Vesting Date</th><th>Options</th><th>Status</th><th>Cumulative</th></tr></thead>
              <tbody>
                {vestEvents.length === 0
                  ? <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--text3)' }}>No vesting events</td></tr>
                  : (() => { let cum = 0; return vestEvents.map((ev: any) => { cum += ev.optionsCount; const st = ev.vestDate <= today() ? (employee?.exitDate && ev.vestDate > employee.exitDate ? 'lapsed' : 'vested') : 'pending'; return (<tr key={ev.id}><td>{fmtDate(ev.vestDate)}</td><td>{fmtN(ev.optionsCount)}</td><td><span className={`badge ${st === 'vested' ? 'badge-green' : st === 'lapsed' ? 'badge-red' : 'badge-muted'}`}>{st}</span></td><td>{fmtN(cum)}</td></tr>) }) })()
                }
              </tbody>
            </table>
          </div>
        )}

        {tab === 'exercises' && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="tbl">
              <thead><tr><th>Date</th><th>Shares</th><th>Exercise Price</th><th>FMV</th><th>Perquisite</th></tr></thead>
              <tbody>
                {exercises.length === 0
                  ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text3)' }}>No exercises recorded</td></tr>
                  : exercises.map((x: any) => (
                    <tr key={x.id}><td>{fmtDate(x.exerciseDate)}</td><td>{fmtN(x.sharesExercised)}</td><td>₹{fmtN(x.exercisePrice)}</td><td>₹{fmtN(x.fairMarketValue)}</td><td>₹{fmtN(x.perquisiteValue || 0)}</td></tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        )}

        {tab === 'letter' && (
          <div className="card" style={{ padding: 0, background: 'transparent', border: 'none' }}>
            <GrantLetterView
              grant={grant} employee={employee} company={companyData}
              vestingEvents={vestEvents} companyId={companyId}
              onGrantUpdated={(updates) => setGrant((g: any) => ({ ...g, ...updates, acceptedAt: updates.acceptedAt ? new Date().toISOString() : g.acceptedAt }))}
            />
          </div>
        )}

        {tab === 'edit' && editable && (
          <div className="card">
            <h3 className="section-title mb-4">Edit Grant</h3>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>All fields are editable until the grant is accepted and locked. Employee name cannot be changed here — update from the Employees section.</p>
            {editMsg && <div className={`alert ${editMsg.startsWith('✅') ? 'alert-success' : 'alert-warning'} mb-4`}>{editMsg}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label className="label">Grant Date</label><input type="date" className="input" value={editForm.grantDate} onChange={e => setEditForm((f: any) => ({ ...f, grantDate: e.target.value }))} /></div>
                <div>
                  <label className="label">Grant Type</label>
                  <select className="input" value={editForm.grantType} onChange={e => setEditForm((f: any) => ({ ...f, grantType: e.target.value }))}>
                    <option>ISO</option><option>NSO</option><option>RSU</option><option>SAR</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label className="label">Total Options</label><input type="number" className="input" value={editForm.totalOptions} onChange={e => setEditForm((f: any) => ({ ...f, totalOptions: e.target.value }))} /></div>
                <div><label className="label">Exercise Price (₹)</label><input type="number" step="0.01" className="input" value={editForm.exercisePrice} onChange={e => setEditForm((f: any) => ({ ...f, exercisePrice: e.target.value }))} /></div>
              </div>
              <div><label className="label">Vesting Start Date</label><input type="date" className="input" value={editForm.vestingStartDate} onChange={e => setEditForm((f: any) => ({ ...f, vestingStartDate: e.target.value }))} /></div>
              <div><label className="label">Notes</label><textarea className="input" rows={2} value={editForm.notes} onChange={e => setEditForm((f: any) => ({ ...f, notes: e.target.value }))} /></div>

              {/* Vesting schedule editor */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <label className="label" style={{ marginBottom: 0 }}>Vesting Schedule</label>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: editVestTotal !== editTotalOptions ? 'var(--warning)' : 'var(--success)' }}>
                    {editVestTotal}/{editTotalOptions} {editVestTotal !== editTotalOptions ? '— totals must match' : '✅'}
                  </div>
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {editVestRows.map((row, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        {i === 0 && <label className="label">Vesting Date</label>}
                        <input type="date" className="input" value={row.date} onChange={e => setEditVestRows(r => r.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} />
                      </div>
                      <div style={{ width: 110 }}>
                        {i === 0 && <label className="label">Options</label>}
                        <input type="number" className="input" value={row.qty} onChange={e => setEditVestRows(r => r.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
                      </div>
                      {editVestRows.length > 1 && (
                        <button onClick={() => setEditVestRows(r => r.filter((_, j) => j !== i))} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)', marginBottom: 2 }}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => setEditVestRows(r => [...r, { date: '', qty: '' }])} className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>+ Add Row</button>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={saveEdit} disabled={editSaving} className="btn btn-primary">
                  {editSaving ? '⏳ Saving...' : '💾 Save All Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
