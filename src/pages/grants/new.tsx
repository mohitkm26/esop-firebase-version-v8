import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, addDoc, query, orderBy, getDoc, doc, where, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import { generateGrantNumber, parseFlexDate, computeVestingStatus, today } from '@/lib/utils'
import { logAudit } from '@/lib/audit'
import { createNotification } from '@/lib/utils'
import { canEdit } from '@/lib/roles'
import { fmtN } from '@/lib/utils'
import { sendGrantLetterEmail } from '@/lib/email'

export default function NewGrant() {
  const { user, profile, loading } = useAuth()
  const { companyId, companyData } = usePlan()
  const router = useRouter()
  const [employees, setEmployees] = useState<any[]>([])
  const [existing, setExisting]   = useState<string[]>([])
  const [busy, setBusy]   = useState(true)
  const [saving, setSaving] = useState(false)
  const [vestRows, setVestRows] = useState([{ date:'', qty:'' }])
  const [selEmp, setSelEmp] = useState<any>(null)
  const [form, setForm] = useState({
    employeeId:'', grantDate: today(), grantType:'ISO', totalOptions:'',
    exercisePrice:'', vestingStartDate: today(), notes:'',
  })

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])
  useEffect(() => {
    if (!companyId) return
    Promise.all([
      getDocs(query(collection(db,'companies',companyId,'employees'), where('status','!=','exited'), orderBy('name'))),
      getDocs(query(collection(db,'companies',companyId,'grants'))),
    ]).then(([e,g]) => {
      setEmployees(e.docs.map(d=>({id:d.id,...d.data()})))
      setExisting(g.docs.map(d=>(d.data() as any).grantNumber||'').filter(Boolean))
      setBusy(false)
    })
    if (router.query.employeeId) {
      const eid = router.query.employeeId as string
      setForm(f=>({...f, employeeId:eid}))
      getDoc(doc(db,'companies',companyId,'employees',eid)).then(s => { if(s.exists()) setSelEmp({id:s.id,...s.data()}) })
    }
  }, [companyId, router.query.employeeId])

  function onEmpChange(eid: string) {
    setForm(f=>({...f,employeeId:eid}))
    const e = employees.find(emp=>emp.id===eid)
    setSelEmp(e||null)
  }

  async function save() {
    if (!form.employeeId || !form.grantDate || !form.totalOptions) { alert('Employee, grant date, and total options are required'); return }
    if (!selEmp) { alert('Please select an employee'); return }
    if (selEmp.status === 'exited') { alert('Cannot issue grants to exited employees.'); return }

    setSaving(true)
    try {
      const grantNumber = generateGrantNumber(existing, 'G', new Date(form.grantDate).getFullYear())
      const totalOptions = parseInt(form.totalOptions)
      const exercisePrice = parseFloat(form.exercisePrice)||0
      const exitDate = selEmp?.exitDate || null

      // Calculate expiry date
      const expiryDays = companyData?.grantExpiryDays || 30
      const expiresAt = new Date(form.grantDate)
      expiresAt.setDate(expiresAt.getDate() + expiryDays)

      const grantRef = await addDoc(collection(db,'companies',companyId,'grants'), {
        grantNumber, employeeId:form.employeeId, employeeName:selEmp.name,
        employeeEmail:selEmp.email, grantDate:form.grantDate,
        grantType:form.grantType, totalOptions, exercisePrice,
        vestingStartDate: form.vestingStartDate, status:'issued',
        locked:false, notes:form.notes||null, companyId,
        expiresAt: expiresAt.toISOString(), exercised:0,
        createdBy:user!.uid, createdAt:serverTimestamp(), updatedAt:serverTimestamp()
      })

      for (const row of vestRows.filter(r=>r.date&&r.qty)) {
        const d = parseFlexDate(row.date)||row.date
        await addDoc(collection(db,'companies',companyId,'vestingEvents'), {
          grantId:grantRef.id, employeeId:form.employeeId, companyId,
          vestDate:d, optionsCount:parseInt(row.qty)||0,
          status: computeVestingStatus(d, exitDate), createdAt:serverTimestamp()
        })
      }


      const grantEmailResult = await sendGrantLetterEmail({
        to: selEmp.email,
        employeeName: selEmp.name,
        companyId,
        grant: {
          grantNumber,
          grantDate: form.grantDate,
          grantType: form.grantType,
          totalOptions,
          exercisePrice,
        },
      })

      await addDoc(collection(db,'companies',companyId,'auditLogs'), {
        action: 'grant_letter_email_attempted',
        companyId,
        actorUserId: user!.uid,
        actorEmail: profile?.email || '',
        entityType: 'grant',
        entityId: grantRef.id,
        createdAt: serverTimestamp(),
        metadata: {
          employeeId: form.employeeId,
          employeeEmail: selEmp.email,
          emailProvider: grantEmailResult.provider,
          emailStatus: grantEmailResult.status,
          emailError: grantEmailResult.error || null,
        },
      })

      // Find employee's user account to send notification
      const usersSnap = await getDocs(query(collection(db,'users'), where('companyId','==',companyId), where('role','==','employee')))
      const empUser = usersSnap.docs.find(d=>d.data().email===selEmp.email)
      if (empUser) {
        await createNotification(companyId, empUser.id, 'grant_issued',
          `A new ESOP grant (${grantNumber}) of ${totalOptions.toLocaleString()} options has been issued to you.`,
          `/grants/${grantRef.id}`)
      }

      await logAudit({ companyId, userId:user!.uid, userEmail:profile?.email||'', action:'grant_created', entityType:'grant', entityId:grantRef.id, entityLabel:grantNumber, after:{ grantNumber, totalOptions, employeeId:form.employeeId, status:'issued' } })
      router.push(`/grants/${grantRef.id}`)
    } catch(e:any) { alert('Error: '+e.message) }
    setSaving(false)
  }

  const totalVesting = vestRows.reduce((s,r)=>(s+parseInt(r.qty||'0')),0)
  const totalOptions = parseInt(form.totalOptions)||0
  const diff = totalOptions - totalVesting

  if (loading||busy) return <Layout title="New Grant"><div style={{ display:'flex', justifyContent:'center', padding:64 }}><div className="spinner-lg"/></div></Layout>
  if (!canEdit(profile?.role)) return <Layout title="New Grant"><div className="alert alert-danger">Editor access required.</div></Layout>

  return (
    <Layout title="New Grant">
      <div style={{ maxWidth:680 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
          <div><h1 className="page-title">Issue Grant</h1><p className="page-subtitle">Create a new ESOP grant with vesting schedule</p></div>
          <button onClick={()=>router.back()} className="btn btn-ghost btn-sm">← Back</button>
        </div>

        {selEmp?.status === 'exited' && (
          <div className="alert alert-danger mb-4">⛔ {selEmp.name} has exited. Cannot issue new grants.</div>
        )}

        <div className="card mb-4">
          <h2 className="section-title mb-4">Grant Details</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label className="label">Employee *</label>
              <select className="input" value={form.employeeId} onChange={e=>onEmpChange(e.target.value)}>
                <option value="">Select employee...</option>
                {employees.map(e=><option key={e.id} value={e.id}>{e.name} {e.employeeId?`(${e.employeeId})`:''}</option>)}
              </select>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label className="label">Grant Date *</label>
                <input type="date" className="input" value={form.grantDate} onChange={e=>setForm(f=>({...f,grantDate:e.target.value}))}/>
              </div>
              <div>
                <label className="label">Grant Type</label>
                <select className="input" value={form.grantType} onChange={e=>setForm(f=>({...f,grantType:e.target.value}))}>
                  <option value="ISO">ISO</option><option value="NSO">NSO</option>
                  <option value="RSU">RSU</option><option value="SAR">SAR</option>
                </select>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label className="label">Total Options *</label>
                <input type="number" className="input" value={form.totalOptions} onChange={e=>setForm(f=>({...f,totalOptions:e.target.value}))} placeholder="10000"/>
              </div>
              <div>
                <label className="label">Exercise Price (₹) *</label>
                <input type="number" step="0.01" className="input" value={form.exercisePrice} onChange={e=>setForm(f=>({...f,exercisePrice:e.target.value}))} placeholder="10.00"/>
              </div>
            </div>
            <div>
              <label className="label">Vesting Start Date</label>
              <input type="date" className="input" value={form.vestingStartDate} onChange={e=>setForm(f=>({...f,vestingStartDate:e.target.value}))}/>
            </div>
            <div>
              <label className="label">Notes / Conditions</label>
              <textarea className="input" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Any special conditions..."/>
            </div>
          </div>
        </div>

        <div className="card mb-4">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <h2 className="section-title">Vesting Schedule</h2>
            <div style={{ fontSize:11, fontFamily:'monospace', color:diff!==0?'var(--warning)':'var(--success)' }}>
              {totalVesting}/{totalOptions} {diff!==0&&`(${diff>0?'+':''}${-diff})`}
            </div>
          </div>
          {vestRows.map((row,i) => {
            const isLapsed = selEmp?.exitDate && row.date && row.date > selEmp.exitDate
            return (
              <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-end', marginBottom:10 }}>
                <div style={{ flex:1 }}>
                  <label className="label">Vesting Date {isLapsed&&<span style={{ fontSize:9, color:'var(--danger)', marginLeft:4 }}>WILL LAPSE</span>}</label>
                  <input type="date" className="input" value={row.date} style={isLapsed?{borderColor:'rgba(181,63,63,0.4)'}:{}} onChange={e=>setVestRows(r=>r.map((x,j)=>j===i?{...x,date:e.target.value}:x))}/>
                </div>
                <div style={{ width:120 }}>
                  <label className="label">Options</label>
                  <input type="number" className="input" value={row.qty} onChange={e=>setVestRows(r=>r.map((x,j)=>j===i?{...x,qty:e.target.value}:x))}/>
                </div>
                {vestRows.length > 1 && <button onClick={()=>setVestRows(r=>r.filter((_,j)=>j!==i))} className="btn btn-ghost btn-xs" style={{ color:'var(--danger)', marginBottom:2 }}>✕</button>}
              </div>
            )
          })}
          <button onClick={()=>setVestRows(r=>[...r,{date:'',qty:''}])} className="btn btn-ghost btn-sm">+ Add Vesting Row</button>
          {totalOptions>0&&diff===0&&<div style={{ fontSize:12, color:'var(--success)', marginTop:8 }}>✅ All {fmtN(totalOptions)} options allocated</div>}
        </div>

        <div style={{ display:'flex', gap:12 }}>
          <button onClick={save} disabled={saving||!form.employeeId||!form.totalOptions||(selEmp?.status==='exited')} className="btn btn-primary">
            {saving?'⏳ Saving...':'📜 Issue Grant'}
          </button>
          <button onClick={()=>router.back()} className="btn btn-ghost">Cancel</button>
        </div>
      </div>
    </Layout>
  )
}
