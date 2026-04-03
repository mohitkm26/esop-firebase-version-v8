import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { doc, getDoc, updateDoc, collection, getDocs, addDoc, query, where, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import Link from 'next/link'
import { fmtDate, fmtN, fmtC, today, computeVesting, validateExercise, buildGrantLetterHTML } from '@/lib/utils'
import { logAudit } from '@/lib/audit'
import { canEdit } from '@/lib/roles'

const STATUS_BADGE: Record<string,string> = {
  draft:'badge badge-muted', issued:'badge badge-blue', pending_acceptance:'badge badge-blue',
  accepted:'badge badge-green', active:'badge badge-green', exercised:'badge badge-purple',
  expired:'badge badge-red', cancelled:'badge badge-red'
}

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
  const [tab, setTab] = useState<'vesting'|'exercises'|'letter'>('vesting')
  const [showExForm, setShowExForm] = useState(false)
  const [exForm, setExForm] = useState({ exerciseDate:today(), sharesExercised:'', fairMarketValue:'', notes:'' })
  const [exError, setExError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id || !companyId) return
    async function load() {
      const [gSnap, vSnap, exSnap] = await Promise.all([
        getDoc(doc(db,'companies',companyId,'grants',id)),
        getDocs(query(collection(db,'companies',companyId,'vestingEvents'), where('grantId','==',id), where('optionsCount','>',0))),
        getDocs(query(collection(db,'companies',companyId,'exercises'), where('grantId','==',id))),
      ])
      if (gSnap.exists()) {
        const g = {id:gSnap.id,...gSnap.data()}
        setGrant(g)
        const empSnap = await getDoc(doc(db,'companies',companyId,'employees',(g as any).employeeId))
        if (empSnap.exists()) setEmployee({id:empSnap.id,...empSnap.data()})
      }
      setVestEvents(vSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a:any,b:any)=>a.vestDate.localeCompare(b.vestDate)))
      setExercises(exSnap.docs.map(d=>({id:d.id,...d.data()})))
      setBusy(false)
    }
    load()
  }, [id, companyId])

  async function updateStatus(newStatus: string) {
    if (!id || !grant || !companyId) return
    setSaving(true)
    const updates: any = { status:newStatus, updatedAt:serverTimestamp() }
    if (newStatus === 'accepted') { updates.locked = true; updates.acceptedAt = serverTimestamp() }
    if (newStatus === 'issued')   { updates.issuedAt = serverTimestamp() }
    await updateDoc(doc(db,'companies',companyId,'grants',id), updates)
    await logAudit({ companyId, userId:user!.uid, userEmail:profile?.email||'', action:('grant_'+newStatus) as any, entityType:'grant', entityId:id, entityLabel:grant.grantNumber, before:{status:grant.status}, after:{status:newStatus} })
    setGrant((g:any) => ({...g, ...updates}))
    setSaving(false)
  }

  async function recordExercise() {
    if (!grant || !companyId) return
    const shares = parseInt(exForm.sharesExercised)
    const fmv = parseFloat(exForm.fairMarketValue)
    if (!shares || !fmv) { setExError('Shares and FMV are required.'); return }

    const alreadyExercised = exercises.reduce((s:number,x:any)=>s+x.sharesExercised,0)
    const validation = validateExercise(vestEvents as any, grant.totalOptions, alreadyExercised, shares, exForm.exerciseDate, employee?.exitDate)
    if (!validation.valid) { setExError(validation.error||'Invalid'); return }

    setSaving(true); setExError('')
    try {
      const perquisite = Math.max(0, fmv - grant.exercisePrice) * shares
      const exRef = await addDoc(collection(db,'companies',companyId,'exercises'), {
        grantId:id, employeeId:grant.employeeId, employeeName:grant.employeeName,
        grantNumber:grant.grantNumber, companyId,
        exerciseDate:exForm.exerciseDate, sharesExercised:shares,
        exercisePrice:grant.exercisePrice, fairMarketValue:fmv,
        perquisiteValue:perquisite, totalAmount:grant.exercisePrice*shares,
        notes:exForm.notes||null, createdAt:serverTimestamp(), createdBy:user!.uid
      })
      await logAudit({ companyId, userId:user!.uid, userEmail:profile?.email||'', action:'exercise_recorded', entityType:'exercise', entityId:exRef.id, entityLabel:grant.grantNumber, after:{ shares, fmv, perquisite } })
      setExercises(ex => [...ex, {id:exRef.id, grantId:id, employeeId:grant.employeeId, exerciseDate:exForm.exerciseDate, sharesExercised:shares, exercisePrice:grant.exercisePrice, fairMarketValue:fmv, perquisiteValue:perquisite}])
      setShowExForm(false)
      setExForm({ exerciseDate:today(), sharesExercised:'', fairMarketValue:'', notes:'' })
    } catch(e:any) { setExError(e.message) }
    setSaving(false)
  }

  function viewLetter() {
    if (!grant || !employee || !companyData) return
    const vestSched = vestEvents.map((e:any) => ({ date:e.vestDate, quantity:e.optionsCount }))
    const html = buildGrantLetterHTML({
      grantNumber:grant.grantNumber, employeeName:employee.name, employeeCode:employee.employeeId||employee.id,
      grantDate:grant.grantDate, totalOptions:grant.totalOptions, exercisePrice:grant.exercisePrice,
      vestingSchedule:vestSched, companyName:companyData.companyName||'Company',
      notes:grant.notes, signatoryName:companyData.signatoryName, signatoryTitle:companyData.signatoryTitle,
      logoUrl:companyData.logoUrl, letterheadUrl:companyData.letterheadUrl,
      address:companyData.address, tandc:companyData.tandcTemplate,
      acceptedAt: grant.acceptedAt || null,
    })
    const w = window.open('','_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  if (busy) return <Layout title="Grant"><div style={{ display:'flex', justifyContent:'center', padding:64 }}><div className="spinner-lg"/></div></Layout>
  if (!grant) return <Layout title="Grant"><div className="alert alert-danger">Grant not found.</div></Layout>

  const isLocked = grant.locked === true
  const editable = !isLocked && canEdit(profile?.role)
  const grantTemplateUrl =
    grant.grant_template_url ||
    grant.grantTemplateUrl ||
    (companyData as any)?.grant_template_url ||
    (companyData as any)?.grantTemplateUrl
  const grantTemplateName =
    grant.grant_template_name ||
    grant.grantTemplateName ||
    (companyData as any)?.grant_template_name ||
    (companyData as any)?.grantTemplateName ||
    'Grant Terms.docx'
  const vestResult = computeVesting(vestEvents as any, grant.totalOptions, 0, exercises.reduce((s:number,x:any)=>s+x.sharesExercised,0), employee?.exitDate)
  const totalExercised = exercises.reduce((s:number,x:any)=>s+x.sharesExercised,0)
  const STATUSES = ['draft','issued','pending_acceptance','accepted','active','exercised','expired','cancelled']

  return (
    <Layout title={grant.grantNumber}>
      <div style={{ maxWidth:900 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <button onClick={()=>router.back()} className="btn btn-ghost btn-sm">← Back</button>
            <div>
              <h1 className="page-title" style={{ fontFamily:'monospace' }}>{grant.grantNumber}</h1>
              <p className="page-subtitle">{grant.employeeName} · {grant.grantType} · Issued {fmtDate(grant.grantDate)}</p>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {isLocked && <span style={{ fontSize:12, color:'var(--text3)' }}>🔒 Locked</span>}
            <span className={STATUS_BADGE[grant.status]||'badge badge-muted'}>{(grant.status||'draft').replace(/_/g,' ')}</span>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
          {[
            { label:'Total Options', val:fmtN(grant.totalOptions) },
            { label:'Vested', val:fmtN(vestResult.vested), sub:`${vestResult.pct}%` },
            { label:'Exercised', val:fmtN(totalExercised) },
            { label:'Available', val:fmtN(vestResult.netVested) },
          ].map(s=>(
            <div key={s.label} className="stat-card">
              <div className="stat-val">{s.val}</div>
              <div className="stat-label">{s.label}</div>
              {s.sub && <div className="stat-sub">{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* Details card */}
        <div className="card mb-4">
          <h3 className="section-title mb-4">Grant Details {isLocked&&<span style={{ fontSize:11, fontWeight:400, color:'var(--text3)', marginLeft:8 }}>Read-only after acceptance</span>}</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
            {[
              ['Employee', grant.employeeName], ['Email', grant.employeeEmail||'—'],
              ['Grant Type', grant.grantType], ['Exercise Price', fmtC(grant.exercisePrice)],
              ['Grant Date', fmtDate(grant.grantDate)], ['Vesting Start', fmtDate(grant.vestingStartDate)],
              ['Expires At', fmtDate(grant.expiresAt)], ['Locked', isLocked?'Yes':'No'],
              ['Grant Terms Template', grantTemplateUrl ? grantTemplateName : 'Not attached'],
              ['Notes', grant.notes||'—'],
            ].map(([k,v])=>(
              <div key={k}><div className="text-xs text-muted" style={{ marginBottom:2 }}>{k}</div><div style={{ fontWeight:600, fontSize:13 }}>{v}</div></div>
            ))}
          </div>
          {grantTemplateUrl && (
            <div style={{ marginTop:14 }}>
              <a href={grantTemplateUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                ⬇️ Download Grant Terms
              </a>
            </div>
          )}
        </div>

        {/* Actions */}
        {canEdit(profile?.role) && (
          <div className="card mb-4">
            <h3 className="section-title mb-3">Actions</h3>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              {grant.status === 'draft' && <button onClick={()=>updateStatus('issued')} disabled={saving} className="btn btn-primary btn-sm">→ Issue Grant</button>}
              {grant.status === 'issued' && <button onClick={()=>updateStatus('accepted')} disabled={saving} className="btn btn-success btn-sm">✓ Mark Accepted (Locks Grant)</button>}
              {['accepted','active'].includes(grant.status) && <button onClick={()=>setShowExForm(true)} className="btn btn-primary btn-sm">💰 Record Exercise</button>}
              {!['cancelled','expired','exercised'].includes(grant.status) && <button onClick={()=>{ if(confirm('Cancel this grant?')) updateStatus('cancelled') }} disabled={saving} className="btn btn-danger btn-sm">✕ Cancel Grant</button>}
              <button onClick={viewLetter} className="btn btn-secondary btn-sm">📄 View Grant Letter</button>
            </div>
          </div>
        )}

        {/* Exercise form */}
        {showExForm && (
          <div className="card mb-4" style={{ border:'1px solid rgba(45,95,168,0.3)' }}>
            <h3 className="section-title mb-4">Record Exercise</h3>
            {exError && <div className="alert alert-danger mb-4">{exError}</div>}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
              <div>
                <label className="label">Exercise Date</label>
                <input type="date" className="input" value={exForm.exerciseDate} onChange={e=>setExForm(f=>({...f,exerciseDate:e.target.value}))} max={today()}/>
              </div>
              <div>
                <label className="label">Shares to Exercise</label>
                <input type="number" className="input" value={exForm.sharesExercised} onChange={e=>setExForm(f=>({...f,sharesExercised:e.target.value}))} placeholder={`Max: ${fmtN(vestResult.netVested)}`}/>
              </div>
              <div>
                <label className="label">FMV per Share (₹)</label>
                <input type="number" step="0.01" className="input" value={exForm.fairMarketValue} onChange={e=>setExForm(f=>({...f,fairMarketValue:e.target.value}))} placeholder="Current fair value"/>
              </div>
              <div>
                <label className="label">Notes</label>
                <input className="input" value={exForm.notes} onChange={e=>setExForm(f=>({...f,notes:e.target.value}))}/>
              </div>
            </div>
            {exForm.fairMarketValue && exForm.sharesExercised && (
              <div className="alert alert-info mb-4">
                Estimated perquisite: ₹{fmtN(Math.max(0,(parseFloat(exForm.fairMarketValue)-grant.exercisePrice)*parseInt(exForm.sharesExercised)))}
              </div>
            )}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={recordExercise} disabled={saving} className="btn btn-primary">
                {saving?'Recording...':'💰 Record Exercise'}
              </button>
              <button onClick={()=>{ setShowExForm(false); setExError('') }} className="btn btn-ghost">Cancel</button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display:'flex', gap:4, borderBottom:'1px solid var(--border)', marginBottom:16, paddingBottom:0 }}>
          {(['vesting','exercises','letter'] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{ padding:'8px 16px', border:'none', borderBottom:tab===t?'2px solid var(--accent)':'2px solid transparent', background:'none', cursor:'pointer', fontSize:13, fontWeight:tab===t?700:400, color:tab===t?'var(--accent)':'var(--text2)', marginBottom:-1, textTransform:'capitalize' }}>
              {t==='vesting'?`Vesting Schedule (${vestEvents.length})`:t==='exercises'?`Exercises (${exercises.length})`:'Grant Letter'}
            </button>
          ))}
        </div>

        {tab === 'vesting' && (
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <table className="tbl">
              <thead><tr><th>Vesting Date</th><th>Options</th><th>Status</th><th>Cumulative</th></tr></thead>
              <tbody>
                {vestEvents.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign:'center', padding:24, color:'var(--text3)' }}>No vesting events</td></tr>
                ) : (() => {
                  let cum = 0
                  return vestEvents.map((ev:any) => {
                    cum += ev.optionsCount
                    const st = ev.vestDate <= today() ? (employee?.exitDate && ev.vestDate > employee.exitDate ? 'lapsed' : 'vested') : 'pending'
                    return (
                      <tr key={ev.id}>
                        <td>{fmtDate(ev.vestDate)}</td>
                        <td>{fmtN(ev.optionsCount)}</td>
                        <td><span className={`badge ${st==='vested'?'badge-green':st==='lapsed'?'badge-red':'badge-muted'}`}>{st}</span></td>
                        <td>{fmtN(cum)}</td>
                      </tr>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'exercises' && (
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <table className="tbl">
              <thead><tr><th>Date</th><th>Shares</th><th>Exercise Price</th><th>FMV</th><th>Perquisite</th></tr></thead>
              <tbody>
                {exercises.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign:'center', padding:24, color:'var(--text3)' }}>No exercises recorded</td></tr>
                ) : exercises.map((x:any)=>(
                  <tr key={x.id}>
                    <td>{fmtDate(x.exerciseDate)}</td>
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

        {tab === 'letter' && (
          <div className="card">
            <p style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>The grant letter will open in a new window for printing or PDF export.</p>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <button onClick={viewLetter} className="btn btn-primary">📄 Open Grant Letter</button>
              {grantTemplateUrl && (
                <a href={grantTemplateUrl} target="_blank" rel="noreferrer" className="btn btn-secondary">
                  ⬇️ Download Grant Terms
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
