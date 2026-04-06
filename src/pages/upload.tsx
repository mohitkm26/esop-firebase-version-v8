import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, addDoc, updateDoc, doc, query, where, serverTimestamp, writeBatch } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import { smartSplit, parseFlexDate, computeVestingStatus, generateGrantNumber, downloadBlob, today } from '@/lib/utils'
import { logAudit } from '@/lib/audit'
import { sendGrantLetterEmail } from '@/lib/email'
import { generateScheduleFromPlan } from '@/pages/grants/new'
import type { ESOPPlan } from '@/pages/settings/esop-plans'

type Mode = 'employees' | 'grants'

type ParsedVestingEntry = { vestDate: string; optionsCount: number }

function parseVestingSchedule(raw: string, totalOptions: number): { entries: ParsedVestingEntry[]; error?: string } {
  if (!raw?.trim()) return { entries: [], error: 'vesting_schedule required' }
  const entries: ParsedVestingEntry[] = []
  let sum = 0
  for (const chunk of raw.split(',')) {
    const part = chunk.trim()
    if (!part) continue
    const [datePart, qtyPart] = part.split(':').map(v => v.trim())
    if (!datePart || !qtyPart) return { entries: [], error: `Invalid format near "${part}". Expected YYYY-MM-DD:quantity` }
    const parsedDate = parseFlexDate(datePart)
    if (!parsedDate) return { entries: [], error: `Invalid date "${datePart}"` }
    const qty = Number(String(qtyPart).replace(/,/g, ''))
    if (!Number.isFinite(qty) || qty <= 0) return { entries: [], error: `Invalid quantity "${qtyPart}"` }
    entries.push({ vestDate: parsedDate, optionsCount: qty })
    sum += qty
  }
  if (!entries.length) return { entries: [], error: 'No valid entries in vesting_schedule' }
  if (sum !== totalOptions) return { entries: [], error: `Vesting total (${sum}) ≠ total_options (${totalOptions})` }
  return { entries }
}

export default function Upload() {
  const { user, profile, loading } = useAuth()
  const { companyId } = usePlan()
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('employees')
  const [preview, setPreview] = useState<any[]>([])
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [esopPlans, setEsopPlans] = useState<ESOPPlan[]>([])

  // Draft grants management
  const [draftGrants, setDraftGrants] = useState<any[]>([])
  const [selectedDrafts, setSelectedDrafts] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<'send_email' | 'mark_sent' | 'mark_accepted'>('send_email')
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [bulkDone, setBulkDone] = useState(0)
  const [activeSection, setActiveSection] = useState<'upload' | 'drafts'>('upload')

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])

  useEffect(() => {
    if (!companyId) return
    // Load ESOP plans for CSV parsing
    getDocs(collection(db, 'companies', companyId, 'esopPlans'))
      .then(snap => setEsopPlans(snap.docs.map(d => ({ id: d.id, ...d.data() } as ESOPPlan))))
    // Load draft grants
    loadDraftGrants()
  }, [companyId])

  async function loadDraftGrants() {
    if (!companyId) return
    const snap = await getDocs(query(collection(db, 'companies', companyId, 'grants'), where('status', '==', 'draft')))
    setDraftGrants(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  function downloadTemplate() {
    if (mode === 'employees') {
      downloadBlob(
        'employee_id,name,email,department,designation,joining_date,esop_eligible\nEMP-001,Rahul Sharma,rahul@company.com,Engineering,SDE-II,2024-01-15,true',
        'employees_template.csv'
      )
    } else {
      // Grants template — vesting_schedule OR plan_name
      downloadBlob(
        [
          'name,work_email,personal_email,grant_date,grant_type,total_options,exercise_price,vesting_start_date,plan_name,vesting_schedule',
          'Rahul Sharma,rahul@company.com,,2026-04-01,ISO,1000,10,2026-04-01,Standard 4-Year Plan,',
          '# OR use manual vesting_schedule instead of plan_name:',
          'Priya Singh,priya@company.com,,2026-04-01,ISO,500,10,2026-04-01,,2027-04-01:125|2027-07-01:125|2027-10-01:125|2028-01-01:125',
        ].join('\n'),
        'grants_template.csv'
      )
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f); setPreview([]); setErrors({}); setDone(0)
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
      if (lines.length < 2) { alert('Empty file'); return }
      const headers = smartSplit(lines[0]).map(h => h.toLowerCase().trim())
      const rows = lines.slice(1).map((line, i) => {
        const vals = smartSplit(line)
        const row: any = { _row: i + 2 }
        headers.forEach((h, j) => { row[h] = vals[j]?.trim() || '' })
        return row
      })
      setPreview(rows)
    }
    reader.readAsText(f)
  }

  async function doImport() {
    if (!companyId || !preview.length) return
    setImporting(true); setDone(0); setErrors({})
    const errs: Record<number, string> = {}

    if (mode === 'employees') {
      const existing = await getDocs(query(collection(db, 'companies', companyId, 'employees')))
      const existingEmails = new Set(existing.docs.map(d => (d.data().email || '').toLowerCase()))
      for (let i = 0; i < preview.length; i++) {
        const r = preview[i]
        try {
          if (!r.name || !r.email) { errs[i] = 'Name and email required'; continue }
          if (existingEmails.has(r.email.toLowerCase())) { errs[i] = 'Email already exists'; continue }
          await addDoc(collection(db, 'companies', companyId, 'employees'), {
            name: r.name, email: r.email.toLowerCase(), employeeId: r.employee_id || '',
            department: r.department || '', designation: r.designation || '',
            joiningDate: parseFlexDate(r.joining_date) || today(),
            exitDate: parseFlexDate(r.exit_date) || null,
            esopEligible: r.esop_eligible !== 'false', status: 'active', companyId,
            createdAt: serverTimestamp(), createdBy: user!.uid
          })
          existingEmails.add(r.email.toLowerCase())
          setDone(d => d + 1)
        } catch (e: any) { errs[i] = e.message }
      }
    } else {
      // Grants — creates as DRAFT for review
      const [empSnap, grantSnap] = await Promise.all([
        getDocs(collection(db, 'companies', companyId, 'employees')),
        getDocs(collection(db, 'companies', companyId, 'grants')),
      ])
      const empByEmail: Record<string, any> = {}
      empSnap.docs.forEach(d => {
        const data = d.data()
        if (data.email) empByEmail[data.email.toLowerCase()] = { id: d.id, ...data }
        if (data.workEmail) empByEmail[data.workEmail.toLowerCase()] = { id: d.id, ...data }
      })
      const existingNums = grantSnap.docs.map(d => (d.data() as any).grantNumber || '')
      const newNums: string[] = []

      for (let i = 0; i < preview.length; i++) {
        const r = preview[i]
        try {
          const emp = empByEmail[r.work_email?.toLowerCase()] || empByEmail[r.personal_email?.toLowerCase()]
          if (!emp) { errs[i] = `Employee not found for email "${r.work_email || r.personal_email}"`; continue }
          if (emp.status === 'exited') { errs[i] = 'Employee has exited'; continue }
          if (!r.total_options) { errs[i] = 'total_options required'; continue }
          if (!r.exercise_price && r.exercise_price !== '0') { errs[i] = 'exercise_price required'; continue }

          const totalOptions = parseInt(String(r.total_options).replace(/,/g, ''))
          if (!Number.isFinite(totalOptions) || totalOptions <= 0) { errs[i] = 'total_options must be a positive number'; continue }

          const allNums = [...existingNums, ...newNums]
          const grantYear = new Date(r.grant_date || today()).getFullYear()
          const grantNumber = generateGrantNumber(allNums, grantYear)
          newNums.push(grantNumber)

          const vestingStartDate = parseFlexDate(r.vesting_start_date) || parseFlexDate(r.grant_date) || today()
          let vestingEntries: ParsedVestingEntry[] = []

          // Resolve vesting from plan_name OR vesting_schedule column
          if (r.plan_name) {
            const plan = esopPlans.find(p => p.planName.toLowerCase() === r.plan_name.toLowerCase())
            if (!plan) { errs[i] = `Plan "${r.plan_name}" not found. Check Settings → ESOP Plans.`; continue }
            const rows = generateScheduleFromPlan(vestingStartDate, totalOptions, plan)
            vestingEntries = rows.filter(row => row.date && row.qty).map(row => ({
              vestDate: row.date, optionsCount: parseInt(row.qty) || 0
            }))
          } else if (r.vesting_schedule) {
            // Support both ":" and "|" as separators within entries, "," between entries
            const normalized = r.vesting_schedule.replace(/\|/g, ',')
            const result = parseVestingSchedule(normalized, totalOptions)
            if (result.error) { errs[i] = result.error; continue }
            vestingEntries = result.entries
          } else {
            errs[i] = 'Either plan_name or vesting_schedule is required'; continue
          }

          const batch = writeBatch(db)
          const grantRef = doc(collection(db, 'companies', companyId, 'grants'))
          batch.set(grantRef, {
            grantNumber, employeeId: emp.id, employeeName: emp.name, employeeEmail: emp.email,
            grantDate: parseFlexDate(r.grant_date) || today(),
            grantType: r.grant_type || 'ISO', totalOptions,
            exercisePrice: parseFloat(r.exercise_price) || 0,
            vestingStartDate, esopPlanName: r.plan_name || null,
            status: 'draft', locked: false, companyId,
            createdAt: serverTimestamp(), createdBy: user!.uid, updatedAt: serverTimestamp()
          })
          for (const ev of vestingEntries) {
            const vestRef = doc(collection(db, 'companies', companyId, 'vestingEvents'))
            batch.set(vestRef, {
              grantId: grantRef.id, employeeId: emp.id, companyId,
              vestDate: ev.vestDate, optionsCount: ev.optionsCount,
              status: computeVestingStatus(ev.vestDate, emp.exitDate || null),
              createdAt: serverTimestamp()
            })
          }
          await batch.commit()
          setDone(d => d + 1)
        } catch (e: any) { errs[i] = e.message }
      }
      // Reload drafts after import
      await loadDraftGrants()
      if (Object.keys(errs).length === 0) setActiveSection('drafts')
    }
    setErrors(errs)
    const imported = preview.length - Object.keys(errs).length
    await logAudit({ companyId, userId: user!.uid, userEmail: profile?.email || '', action: mode === 'employees' ? 'employee_created' : 'grant_created', entityType: mode, entityId: 'bulk', entityLabel: `Bulk import: ${imported} ${mode}`, after: { imported, errors: Object.keys(errs).length } })
    setImporting(false)
  }

  async function executeBulkAction() {
    if (!selectedDrafts.size) { alert('Select at least one grant'); return }
    setBulkProcessing(true); setBulkDone(0)
    const grantsToProcess = draftGrants.filter(g => selectedDrafts.has(g.id))

    for (const g of grantsToProcess) {
      try {
        if (bulkAction === 'send_email') {
          await sendGrantLetterEmail({ to: g.employeeEmail, employeeName: g.employeeName, companyId, grant: { grantNumber: g.grantNumber, grantDate: g.grantDate, grantType: g.grantType, totalOptions: g.totalOptions, exercisePrice: g.exercisePrice } })
          await updateDoc(doc(db, 'companies', companyId, 'grants', g.id), { status: 'issued', issuedAt: serverTimestamp(), updatedAt: serverTimestamp() })
        } else if (bulkAction === 'mark_sent') {
          await updateDoc(doc(db, 'companies', companyId, 'grants', g.id), { status: 'issued', issuedAt: serverTimestamp(), updatedAt: serverTimestamp() })
        } else if (bulkAction === 'mark_accepted') {
          await updateDoc(doc(db, 'companies', companyId, 'grants', g.id), { status: 'accepted', locked: true, acceptedAt: serverTimestamp(), acceptedBy: 'admin-bulk', acceptanceMethod: 'bulk_admin', updatedAt: serverTimestamp() })
        }
        setBulkDone(d => d + 1)
      } catch (e: any) { console.error('Bulk action failed for', g.grantNumber, e.message) }
    }

    await logAudit({ companyId, userId: user!.uid, userEmail: profile?.email || '', action: 'grant_issued', entityType: 'grant', entityId: 'bulk', entityLabel: `Bulk ${bulkAction}: ${grantsToProcess.length} grants` })
    await loadDraftGrants()
    setSelectedDrafts(new Set())
    setBulkProcessing(false)
  }

  function toggleDraft(id: string) {
    setSelectedDrafts(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAllDrafts() {
    if (selectedDrafts.size === draftGrants.length) setSelectedDrafts(new Set())
    else setSelectedDrafts(new Set(draftGrants.map(g => g.id)))
  }

  if (loading) return <Layout title="Upload"><div className="spinner-lg" /></Layout>

  return (
    <Layout title="Bulk Upload">
      <div style={{ maxWidth: 1000 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Bulk Upload</h1>
          <p className="page-subtitle">Import employees or grants via CSV</p>
        </div>

        {/* Section tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
          {[{ id: 'upload', label: '↑ Upload CSV' }, { id: 'drafts', label: `📋 Draft Grants (${draftGrants.length})` }].map((s: any) => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} style={{ padding: '9px 18px', border: 'none', borderBottom: activeSection === s.id ? '2px solid var(--accent)' : '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: activeSection === s.id ? 700 : 400, color: activeSection === s.id ? 'var(--accent)' : 'var(--text2)', marginBottom: -1 }}>
              {s.label}
            </button>
          ))}
        </div>

        {activeSection === 'upload' && (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              {(['employees', 'grants'] as Mode[]).map(m => (
                <button key={m} onClick={() => { setMode(m); setPreview([]); setErrors({}); setDone(0) }} className={`btn ${mode === m ? 'btn-primary' : 'btn-secondary'}`}>
                  {m === 'employees' ? '👥 Employees' : '📜 Grants'}
                </button>
              ))}
            </div>

            <div className="card mb-4">
              <h3 className="section-title mb-3">Upload {mode} CSV</h3>
              {mode === 'grants' && (
                <div className="alert alert-info mb-4" style={{ fontSize: 12 }}>
                  <strong>Grants CSV columns:</strong> <code>name, work_email, personal_email, grant_date, grant_type, total_options, exercise_price, vesting_start_date, plan_name, vesting_schedule</code>
                  <br />Use <strong>plan_name</strong> (must match a plan in Settings → ESOP Plans) <em>OR</em> <strong>vesting_schedule</strong> in format <code>YYYY-MM-DD:qty,YYYY-MM-DD:qty</code>
                  <br />Grants are imported as <strong>Draft</strong> — review in the Drafts tab before sending.
                  {esopPlans.length > 0 && <><br />Available plans: {esopPlans.map(p => <code key={p.id} style={{ marginRight: 6 }}>{p.planName}</code>)}</>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={downloadTemplate} className="btn btn-secondary btn-sm">↓ Download Template</button>
                <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
                  📁 Choose CSV File
                  <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFile} />
                </label>
                {file && <span style={{ fontSize: 12, color: 'var(--text3)' }}>{file.name} · {preview.length} rows</span>}
              </div>
            </div>

            {preview.length > 0 && (
              <div className="card mb-4" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>Preview — {preview.length} rows</span>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {done > 0 && <span className="badge badge-green">{done} imported</span>}
                    {Object.keys(errors).length > 0 && <span className="badge badge-red">{Object.keys(errors).length} errors</span>}
                    <button onClick={doImport} disabled={importing} className="btn btn-primary btn-sm">
                      {importing ? '⏳ Importing...' : mode === 'grants' ? '↑ Import as Drafts' : '↑ Import All'}
                    </button>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="tbl">
                    <thead><tr><th>#</th>{Object.keys(preview[0]).filter(k => k !== '_row').map(k => <th key={k}>{k}</th>)}<th>Status</th></tr></thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} style={{ background: errors[i] ? 'rgba(181,63,63,0.05)' : done > i ? 'rgba(45,122,79,0.04)' : '' }}>
                          <td style={{ color: 'var(--text3)', fontSize: 11 }}>{r._row}</td>
                          {Object.entries(r).filter(([k]) => k !== '_row').map(([k, v]) => <td key={k} style={{ fontSize: 12 }}>{String(v)}</td>)}
                          <td>{errors[i] ? <span className="badge badge-red" title={errors[i]}>Error: {errors[i]}</span> : done > i ? <span className="badge badge-green">✓</span> : <span className="badge badge-muted">Pending</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {activeSection === 'drafts' && (
          <>
            {draftGrants.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text3)' }}>
                No draft grants. Upload a grants CSV to create drafts for review.
              </div>
            ) : (
              <>
                {/* Bulk action bar */}
                <div className="card mb-4" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, color: 'var(--text2)' }}>{selectedDrafts.size} of {draftGrants.length} selected</div>
                  <div style={{ display: 'flex', gap: 8, flex: 1, flexWrap: 'wrap' }}>
                    <select className="input" style={{ width: 220 }} value={bulkAction} onChange={e => setBulkAction(e.target.value as any)}>
                      <option value="send_email">Send Grant Email + Mark Issued</option>
                      <option value="mark_sent">Mark as Issued (no email)</option>
                      <option value="mark_accepted">Mark as Accepted (offline)</option>
                    </select>
                    <button onClick={executeBulkAction} disabled={bulkProcessing || selectedDrafts.size === 0} className="btn btn-primary btn-sm">
                      {bulkProcessing ? `⏳ Processing (${bulkDone}/${selectedDrafts.size})...` : '▶ Execute on Selected'}
                    </button>
                  </div>
                  {bulkDone > 0 && !bulkProcessing && <span className="badge badge-green">✓ {bulkDone} processed</span>}
                </div>

                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>
                          <input type="checkbox" checked={selectedDrafts.size === draftGrants.length && draftGrants.length > 0} onChange={toggleAllDrafts} />
                        </th>
                        <th>Grant #</th><th>Employee</th><th>Grant Date</th><th>Type</th><th>Options</th><th>Exercise Price</th><th>Plan</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draftGrants.map(g => (
                        <tr key={g.id} style={{ background: selectedDrafts.has(g.id) ? 'rgba(45,95,168,0.05)' : '' }}>
                          <td><input type="checkbox" checked={selectedDrafts.has(g.id)} onChange={() => toggleDraft(g.id)} /></td>
                          <td><span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{g.grantNumber}</span></td>
                          <td>{g.employeeName}</td>
                          <td style={{ fontSize: 12 }}>{g.grantDate}</td>
                          <td>{g.grantType}</td>
                          <td style={{ fontFamily: 'monospace' }}>{g.totalOptions?.toLocaleString()}</td>
                          <td>₹{g.exercisePrice}</td>
                          <td style={{ fontSize: 12, color: 'var(--text3)' }}>{g.esopPlanName || '—'}</td>
                          <td>
                            <a href={`/grants/${g.id}`} className="btn btn-ghost btn-xs">View →</a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
