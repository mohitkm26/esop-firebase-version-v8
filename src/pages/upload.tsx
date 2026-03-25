import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, addDoc, query, where, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import { smartSplit, parseFlexDate, computeVestingStatus, generateGrantNumber, downloadBlob, today } from '@/lib/utils'
import { logAudit } from '@/lib/audit'

type Mode = 'employees' | 'grants'

export default function Upload() {
  const { user, profile, loading } = useAuth()
  const { companyId } = usePlan()
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('employees')
  const [preview, setPreview] = useState<any[]>([])
  const [errors, setErrors] = useState<Record<number,string>>({})
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(0)
  const [file, setFile] = useState<File|null>(null)

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])

  function downloadTemplate() {
    if (mode === 'employees') {
      downloadBlob('employee_id,name,email,department,designation,joining_date,esop_eligible\nEMP-001,Rahul Sharma,rahul@company.com,Engineering,SDE-II,2024-01-15,true', 'employees_template.csv')
    } else {
      // V8 FIX: exercise_price column included
 
     downloadBlob(
'name,employee_id,personal_email,work_email,grant_number,department,joining_date,exercise_price,total_options,exit_date,vesting_type,vesting_schedule',
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
      const lines = text.split('\n').map(l=>l.trim()).filter(Boolean)
      if (lines.length < 2) { alert('Empty file'); return }
      const headers = smartSplit(lines[0]).map(h=>h.toLowerCase().trim())
      const rows = lines.slice(1).map((line,i) => {
        const vals = smartSplit(line)
        const row: any = { _row: i+2 }
        headers.forEach((h,j) => { row[h] = vals[j]?.trim()||'' })
        return row
      })
      setPreview(rows)
    }
    reader.readAsText(f)
  }

  async function doImport() {
    if (!companyId || !preview.length) return
    setImporting(true); setDone(0); setErrors({})
    const errs: Record<number,string> = {}

    if (mode === 'employees') {
      const existing = await getDocs(query(collection(db,'companies',companyId,'employees')))
      const existingEmails = new Set(existing.docs.map(d=>(d.data().email||'').toLowerCase()))
      for (let i=0; i<preview.length; i++) {
        const r = preview[i]
        try {
          if (!r.name||!r.email) { errs[i]='Name and email required'; continue }
          if (existingEmails.has(r.email.toLowerCase())) { errs[i]='Email already exists'; continue }
         await addDoc(collection(db,'companies',companyId,'employees'), {
  name:r.name,
  email:r.email.toLowerCase(),
  employeeId:r.employee_id||'',
  department:r.department||'',
  designation:r.designation||'',
  joiningDate: parseFlexDate(r.joining_date) || today(),
  exitDate: parseFlexDate(r.exit_date) || null,
  esopEligible:r.esop_eligible!=='false',
  status:'active',
  companyId,
  createdAt:serverTimestamp(),
  createdBy:user!.uid
})
          existingEmails.add(r.email.toLowerCase())
          setDone(d=>d+1)
        } catch(e:any) { errs[i]=e.message }
      }
    } else {
      const [empSnap, grantSnap] = await Promise.all([
        getDocs(collection(db,'companies',companyId,'employees')),
        getDocs(collection(db,'companies',companyId,'grants')),
      ])
      const empByEmail = Object.fromEntries(empSnap.docs.map(d=>[d.data().email,{id:d.id,...d.data()}]))
      const existingNums = grantSnap.docs.map(d=>(d.data() as any).grantNumber||'')
      const newNums: string[] = []

      for (let i=0; i<preview.length; i++) {
        const r = preview[i]
        try {
          const emp =
  empByEmail[r.work_email?.toLowerCase()] ||
  empByEmail[r.personal_email?.toLowerCase()]
          if (!emp) { errs[i]=`Employee ${r.employee_email} not found`; continue }
          if ((emp as any).status==='exited') { errs[i]='Employee has exited'; continue }
if (!r.name) { errs[i]='name required'; continue }
if (!r.employee_id) { errs[i]='employee_id required'; continue }
if (!r.total_options) { errs[i]='total_options required'; continue }
if (!r.vesting_schedule) { errs[i]='vesting_schedule required'; continue }
          if (!r.total_options) { errs[i]='total_options required'; continue }
          if (!r.exercise_price && r.exercise_price !== '0') { errs[i]='exercise_price required'; continue }

          const allNums = [...existingNums, ...newNums]
          const year = new Date(r.grant_date||today()).getFullYear()
          const grantNumber = generateGrantNumber(allNums, 'G', year)
          newNums.push(grantNumber)

          const cliff = parseInt(r.cliff_months||'12')
          const period = parseInt(r.vesting_period_months||'48')
          const vestStart = parseFlexDate(r.vesting_start_date)||r.vesting_start_date||r.grant_date||today()
          const exitDate = (emp as any).exitDate || null

          const grantRef = await addDoc(collection(db,'companies',companyId,'grants'), {
            grantNumber, employeeId:emp.id, employeeName:(emp as any).name,
            employeeEmail:(emp as any).email, grantDate:parseFlexDate(r.grant_date)||today(),
            grantType:r.grant_type||'ISO', totalOptions:parseInt(String(r.total_options).replace(/,/g,'')),
            exercisePrice:parseFloat(r.exercise_price)||0,  // V8 FIX: included
            vestingStartDate:vestStart, status:'issued', locked:false, companyId,
            createdAt:serverTimestamp(), createdBy:user!.uid, updatedAt:serverTimestamp()
          })

          // Generate monthly vesting events
           const vestStart_ = new Date(vestStart)
          const schedule = r.vesting_schedule.split(',')

for (const s of schedule) {
  const [date, qty] = s.trim().split(':')
  if (!date || !qty) continue

  await addDoc(collection(db,'companies',companyId,'vestingEvents'),{
    grantId:grantRef.id,
    employeeId:emp.id,
    companyId,
    vestDate:parseFlexDate(date) || date,
    optionsCount:parseFloat(qty),
    status:computeVestingStatus(date,exitDate),
    createdAt:serverTimestamp()
  })
} 
          setDone(d=>d+1)
        } catch(e:any) { errs[i]=e.message }
      }
    }
    setErrors(errs)
    const imported = preview.length - Object.keys(errs).length
    await logAudit({ companyId, userId:user!.uid, userEmail:profile?.email||'', action:mode==='employees'?'employee_created':'grant_created', entityType:mode, entityId:'bulk', entityLabel:`Bulk import: ${imported} ${mode}`, after:{imported,errors:Object.keys(errs).length} })
    setImporting(false)
  }

  if (loading) return <Layout title="Upload"><div className="spinner-lg"/></Layout>

  return (
    <Layout title="Upload">
      <div style={{ maxWidth:900 }}>
        <div style={{ marginBottom:24 }}><h1 className="page-title">Bulk Upload</h1><p className="page-subtitle">Import employees or grants via CSV</p></div>

        <div style={{ display:'flex', gap:10, marginBottom:20 }}>
          {(['employees','grants'] as Mode[]).map(m=>(
            <button key={m} onClick={()=>{ setMode(m); setPreview([]); setErrors({}); setDone(0) }} className={`btn ${mode===m?'btn-primary':'btn-secondary'}`}>
              {m==='employees'?'👥 Employees':'📜 Grants'}
            </button>
          ))}
        </div>

        <div className="card mb-4">
          <h3 className="section-title mb-3">Upload {mode} CSV</h3>
          <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', marginBottom:12 }}>
            <button onClick={downloadTemplate} className="btn btn-secondary btn-sm">↓ Download Template</button>
            <label className="btn btn-primary btn-sm" style={{ cursor:'pointer' }}>
              📁 Choose CSV File
              <input type="file" accept=".csv" style={{ display:'none' }} onChange={handleFile}/>
            </label>
            {file && <span style={{ fontSize:12, color:'var(--text3)' }}>{file.name} · {preview.length} rows</span>}
          </div>
          {mode === 'grants' && (
            <div className="alert alert-info" style={{ fontSize:12 }}>
              ℹ️ ℹ️ Required columns:
name, employee_id, personal_email, work_email,
grant_number, department, joining_date,
exercise_price, total_options, exit_date,
vesting_type, vesting_schedule>
            </div>
          )}
        </div>

        {preview.length > 0 && (
          <div className="card mb-4" style={{ padding:0, overflow:'hidden' }}>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontWeight:600, fontSize:13 }}>Preview — {preview.length} rows</span>
              <div style={{ display:'flex', gap:10 }}>
                {done > 0 && <span className="badge badge-green">{done} imported</span>}
                {Object.keys(errors).length > 0 && <span className="badge badge-red">{Object.keys(errors).length} errors</span>}
                <button onClick={doImport} disabled={importing} className="btn btn-primary btn-sm">
                  {importing?'⏳ Importing...':'↑ Import All'}
                </button>
              </div>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table className="tbl">
                <thead><tr><th>#</th>{Object.keys(preview[0]).filter(k=>k!=='_row').map(k=><th key={k}>{k}</th>)}<th>Status</th></tr></thead>
                <tbody>
                  {preview.map((r,i)=>(
                    <tr key={i} style={{ background:errors[i]?'rgba(181,63,63,0.05)':done>i?'rgba(45,122,79,0.04)':'' }}>
                      <td style={{ color:'var(--text3)', fontSize:11 }}>{r._row}</td>
                      {Object.entries(r).filter(([k])=>k!=='_row').map(([k,v])=><td key={k} style={{ fontSize:12 }}>{String(v)}</td>)}
                      <td>{errors[i]?<span className="badge badge-red" title={errors[i]}>Error</span>:done>i?<span className="badge badge-green">✓</span>:<span className="badge badge-muted">Pending</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
