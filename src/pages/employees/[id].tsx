import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { doc, getDoc, updateDoc, collection, getDocs, query, where, orderBy, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import Link from 'next/link'
import { fmtDate, fmtN, today, computeVesting } from '@/lib/utils'
import { logAudit } from '@/lib/audit'

export default function EmployeeDetail() {
  const router = useRouter()
  const { id } = router.query as { id: string }
  const { user, profile } = useAuth()
  const { companyId } = usePlan()
  const [emp, setEmp]         = useState<any>(null)
  const [grants, setGrants]   = useState<any[]>([])
  const [exercises, setExercises] = useState<any[]>([])
  const [tab, setTab]         = useState<'grants'|'exercises'>('grants')
  const [editing, setEditing] = useState(false)
  const [form, setForm]       = useState<any>({})
  const [saving, setSaving]   = useState(false)
  const [busy, setBusy]       = useState(true)
  const [exitDate, setExitDate] = useState('')

  useEffect(() => {
    if (!id || !companyId) return
    Promise.all([
      getDoc(doc(db,'companies',companyId,'employees',id)),
      getDocs(query(collection(db,'companies',companyId,'grants'), where('employeeId','==',id), orderBy('grantDate','desc'))),
      getDocs(query(collection(db,'companies',companyId,'exercises'), where('employeeId','==',id), orderBy('exerciseDate','desc'))),
    ]).then(([eSnap, gSnap, exSnap]) => {
      if (eSnap.exists()) { const d = {id:eSnap.id,...eSnap.data()}; setEmp(d); setForm(d) }
      setGrants(gSnap.docs.map(d=>({id:d.id,...d.data()})))
      setExercises(exSnap.docs.map(d=>({id:d.id,...d.data()})))
      setBusy(false)
    })
  }, [id, companyId])

  async function saveEdit() {
    if (!id || !companyId) return
    setSaving(true)
    const before = { ...emp }
    await updateDoc(doc(db,'companies',companyId,'employees',id), { ...form, updatedAt: serverTimestamp() })
    await logAudit({ companyId, userId:user!.uid, userEmail:profile?.email||'', action:'employee_updated', entityType:'employee', entityId:id, entityLabel:form.name, before, after:form })
    setEmp({ ...form }); setEditing(false); setSaving(false)
  }

  async function markExit() {
    if (!exitDate || !id || !companyId) return
    setSaving(true)
    const before = { ...emp }
    await updateDoc(doc(db,'companies',companyId,'employees',id), { status:'exited', exitDate, updatedAt: serverTimestamp() })
    await logAudit({ companyId, userId:user!.uid, userEmail:profile?.email||'', action:'employee_exited', entityType:'employee', entityId:id, entityLabel:emp.name, before, after:{status:'exited',exitDate} })
    setEmp((e:any) => ({...e, status:'exited', exitDate})); setSaving(false)
  }

  const STATUS_BADGE: Record<string,string> = {
    draft:'badge badge-muted', issued:'badge badge-blue', pending_acceptance:'badge badge-blue',
    accepted:'badge badge-green', active:'badge badge-green', exercised:'badge badge-purple',
    expired:'badge badge-red', cancelled:'badge badge-red'
  }

  if (busy) return <Layout title="Employee"><div style={{ display:'flex', justifyContent:'center', padding:64 }}><div className="spinner-lg"/></div></Layout>
  if (!emp) return <Layout title="Employee"><div className="alert alert-danger">Employee not found.</div></Layout>

  return (
    <Layout title={emp.name}>
      <div style={{ maxWidth:900 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <button onClick={()=>router.back()} className="btn btn-ghost btn-sm">← Back</button>
            <div>
              <h1 className="page-title">{emp.name}</h1>
              <p className="page-subtitle">{emp.employeeId} · {emp.department} · {emp.designation}</p>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <span className={`badge ${emp.status==='exited'?'badge-red':'badge-green'}`}>{emp.status||'active'}</span>
            {emp.status !== 'exited' && !editing && (
              <button onClick={()=>setEditing(true)} className="btn btn-secondary btn-sm">Edit</button>
            )}
          </div>
        </div>

        {/* Info card */}
        <div className="card mb-4">
          {editing ? (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              {[['name','Name'],['email','Email'],['employeeId','Employee ID'],['department','Department'],['designation','Designation'],['joiningDate','Joining Date']].map(([k,label]) => (
                <div key={k}>
                  <label className="label">{label}</label>
                  <input type={k==='joiningDate'?'date':'text'} className="input" value={form[k]||''} onChange={e=>setForm((f:any)=>({...f,[k]:e.target.value}))}/>
                </div>
              ))}
              <div style={{ gridColumn:'1/-1', display:'flex', gap:10 }}>
                <button onClick={saveEdit} disabled={saving} className="btn btn-primary">{saving?'Saving...':'Save Changes'}</button>
                <button onClick={()=>setEditing(false)} className="btn btn-ghost">Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
              {[['Email',emp.email],['Department',emp.department||'—'],['Designation',emp.designation||'—'],['Joining Date',fmtDate(emp.joiningDate)],['Employee ID',emp.employeeId||'—'],['Exit Date',emp.exitDate?fmtDate(emp.exitDate):'—']].map(([k,v]) => (
                <div key={k}><div className="text-xs text-muted" style={{ marginBottom:2 }}>{k}</div><div style={{ fontWeight:600, fontSize:13 }}>{v}</div></div>
              ))}
            </div>
          )}
        </div>

        {/* Exit section */}
        {emp.status !== 'exited' && (
          <div className="card mb-4" style={{ borderColor:'rgba(181,63,63,0.2)' }}>
            <h3 className="section-title mb-4" style={{ color:'var(--danger)' }}>Mark as Exited</h3>
            <div style={{ display:'flex', gap:12, alignItems:'flex-end' }}>
              <div style={{ flex:1 }}>
                <label className="label">Exit Date</label>
                <input type="date" className="input" value={exitDate} onChange={e=>setExitDate(e.target.value)} max={today()}/>
              </div>
              <button onClick={markExit} disabled={!exitDate || saving} className="btn btn-danger">Mark Exited</button>
            </div>
            <p style={{ fontSize:12, color:'var(--text3)', marginTop:8, margin:0 }}>⚠️ Vesting events after the exit date will be marked as lapsed. New grants cannot be issued after exit.</p>
          </div>
        )}

        {/* Issue grant */}
        {emp.status !== 'exited' && (
          <div style={{ marginBottom:16, textAlign:'right' }}>
            <Link href={`/grants/new?employeeId=${id}`} className="btn btn-primary btn-sm">+ Issue Grant to {emp.name}</Link>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display:'flex', gap:4, marginBottom:16, borderBottom:'1px solid var(--border)', paddingBottom:0 }}>
          {(['grants','exercises'] as const).map(t => (
            <button key={t} onClick={()=>setTab(t)} style={{ padding:'8px 16px', border:'none', borderBottom: tab===t?'2px solid var(--accent)':'2px solid transparent', background:'none', cursor:'pointer', fontSize:13, fontWeight: tab===t?700:400, color: tab===t?'var(--accent)':'var(--text2)', marginBottom:-1 }}>
              {t==='grants'?`Grants (${grants.length})`:`Exercises (${exercises.length})`}
            </button>
          ))}
        </div>

        {tab === 'grants' && (
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <table className="tbl">
              <thead><tr><th>Grant #</th><th>Date</th><th>Type</th><th>Options</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {grants.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign:'center', padding:24, color:'var(--text3)' }}>No grants issued yet</td></tr>
                ) : grants.map(g => (
                  <tr key={g.id}>
                    <td style={{ fontFamily:'monospace', fontSize:12 }}>{g.grantNumber}</td>
                    <td>{fmtDate(g.grantDate)}</td>
                    <td>{g.grantType||'—'}</td>
                    <td>{fmtN(g.totalOptions||0)}</td>
                    <td><span className={STATUS_BADGE[g.status]||'badge badge-muted'}>{g.status||'—'}</span></td>
                    <td><Link href={`/grants/${g.id}`} className="btn btn-ghost btn-xs">View →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'exercises' && (
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <table className="tbl">
              <thead><tr><th>Date</th><th>Grant #</th><th>Shares</th><th>Exercise Price</th><th>FMV</th><th>Perquisite</th></tr></thead>
              <tbody>
                {exercises.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign:'center', padding:24, color:'var(--text3)' }}>No exercises recorded</td></tr>
                ) : exercises.map(x => (
                  <tr key={x.id}>
                    <td>{fmtDate(x.exerciseDate)}</td>
                    <td style={{ fontFamily:'monospace', fontSize:12 }}>{x.grantNumber||'—'}</td>
                    <td>{fmtN(x.sharesExercised)}</td>
                    <td>₹{fmtN(x.exercisePrice)}</td>
                    <td>₹{fmtN(x.fairMarketValue)}</td>
                    <td>₹{fmtN(x.perquisiteValue||0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  )
}
