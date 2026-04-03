import { canEdit } from '@/lib/roles'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db, auth } from '@/lib/firebase'
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth'
import { collection, getDocs, query, where, orderBy, doc, getDoc } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { fmtN, fmtC, fmtDate, getLatestValuation, computeVesting, computeVestingStatus } from '@/lib/utils'
import Head from 'next/head'
import { findEmployeeByAuthEmail } from '@/lib/employee-lookup'
import GrantLetterView from '@/components/GrantLetterView'

const EMPLOYEE_LINK_ERROR = 'Your sign-in email is not linked to any employee record (work_email or personal_email). Please contact HR to update your details.'

export default function EmployeePortal() {
  const { user, profile, loading, effectiveRole, employeeView } = useAuth()
  const router = useRouter()
  const [data, setData]   = useState<any>(null)
  const [busy, setBusy]   = useState(false)
  const [err,  setErr]    = useState('')
  const [signing, setSigning] = useState(false)
  const [activeLetterGrantId, setActiveLetterGrantId] = useState('')

  async function handleSignIn() {
    setSigning(true); setErr('')
    try { await signInWithPopup(auth, new GoogleAuthProvider()) }
    catch (e: any) { if (e.code !== 'auth/popup-closed-by-user') setErr('Sign-in failed. Try again.') }
    setSigning(false)
  }

  useEffect(() => {
    if (loading || !user || !profile) return
    // HR/Admin/Editor users go to dashboard — this portal is for employees only
    if (canEdit(effectiveRole)) {
      router.replace('/dashboard'); return
    }
    if (effectiveRole === 'employee' && profile.employeeId) loadData(profile.employeeId)
    else setErr(EMPLOYEE_LINK_ERROR)
    if (effectiveRole === 'employee' && profile.employeeId) {
      loadData(profile.employeeId)
      return
    }

    if (effectiveRole === 'employee') {
      findEmployeeByAuthEmail(db, profile.email)
        .then(linkedEmployee => {
          if (linkedEmployee && linkedEmployee.companyId === profile.companyId) {
            loadData(linkedEmployee.employeeId)
          } else {
            setErr(EMPLOYEE_LINK_ERROR)
          }
        })
        .catch(() => setErr(EMPLOYEE_LINK_ERROR))
      return
    }

    setErr(EMPLOYEE_LINK_ERROR)
  }, [user, profile, loading, effectiveRole, employeeView])

  async function loadData(empId: string) {
    setBusy(true); setErr('')
    try {
      const [empSnap, grantSnap, vestSnap, valSnap, settSnap] = await Promise.all([
        getDoc(doc(db,'companies',profile!.companyId,'employees',empId)),
        getDocs(query(collection(db,'companies',profile!.companyId,'grants'),where('employeeId','==',empId))),
        getDocs(query(collection(db,'companies',profile!.companyId,'vestingEvents'),where('employeeId','==',empId))),
        getDocs(query(collection(db,'companies',profile!.companyId,'valuations'),orderBy('valuationDate','desc'))),
        getDoc(doc(db,'companies',profile!.companyId)),
      ])
      const emp      = empSnap.exists() ? {id:empSnap.id,...empSnap.data()} as any : null
      const grants   = grantSnap.docs.map(d=>({id:d.id,...d.data()})) as any[]
      const allVest  = vestSnap.docs.map(d=>({id:d.id,...d.data()})) as any[]
      const vals     = valSnap.docs.map(d=>({id:d.id,...d.data()})) as any[]
      const settings = settSnap.exists() ? settSnap.data() : {} as any
      const vestByGrant = new Map<string,any[]>()
      allVest.forEach((ev:any)=>{
        if(!vestByGrant.has(ev.grantId))vestByGrant.set(ev.grantId,[])
        vestByGrant.get(ev.grantId)!.push(ev)
      })
      const fv = getLatestValuation(vals)
      setData({emp, grants, vestByGrant, fv, vals, settings})
    } catch(e:any) { setErr(e.message) }
    setBusy(false)
  }





  // ── Login screen ───────────────────────────────────────────────────────────
  const loginScreen = (
    <>
      <Head>
        <title>Employee Portal</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      </Head>
      <div style={{minHeight:'100vh',background:'#0c0c0c',display:'flex',alignItems:'center',justifyContent:'center',padding:24,fontFamily:"'DM Sans',system-ui",color:'#f5f0e8'}}>
        <div style={{width:'100%',maxWidth:380}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:40}}>
            <div style={{width:32,height:32,borderRadius:9,background:'linear-gradient(135deg,#d4a853,#a07830)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:15,color:'#0c0c0c'}}>E</div>
            <span style={{fontWeight:700,fontSize:16}}>ESOP Manager</span>
          </div>
          <div style={{background:'#141414',border:'1px solid #1c1c1c',borderRadius:20,padding:28}}>
            <h1 style={{fontSize:22,fontWeight:800,letterSpacing:'-0.025em',marginBottom:6}}>Employee Portal</h1>
            <p style={{fontSize:13,color:'#6b6b6b',marginBottom:24,lineHeight:1.6}}>
              Sign in with the Google account linked to your company email to view your ESOP grants.
            </p>
            {err&&<div style={{background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.2)',borderRadius:10,padding:'12px 14px',marginBottom:16,fontSize:12,color:'#f87171'}}>{err}</div>}
            <button onClick={handleSignIn} disabled={signing}
              style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:10,padding:'13px 16px',background:'#fff',borderRadius:10,border:'none',fontSize:14,fontWeight:700,color:'#000',cursor:'pointer',opacity:signing?0.7:1}}>
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.84-1.57 2.4v2h2.54c1.5-1.38 2.36-3.4 2.36-5.76 0-.55-.05-1.09-.1-1.64z"/>
                <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.54-1.97c-.72.48-1.64.77-2.76.77-2.12 0-3.92-1.43-4.56-3.36H1.8v2.03C3.12 15.45 5.88 17 8.98 17z"/>
                <path fill="#FBBC04" d="M4.42 10.5c-.16-.48-.25-.99-.25-1.5s.09-1.02.25-1.5V5.47H1.8A8.01 8.01 0 0 0 1 9c0 1.29.31 2.51.8 3.53l2.62-2.03z"/>
                <path fill="#EA4335" d="M8.98 3.58c1.19 0 2.26.41 3.1 1.22l2.32-2.32C12.95 1.19 11.14.5 8.98.5 5.88.5 3.12 2.05 1.8 4.47L4.42 6.5C5.06 4.57 6.86 3.58 8.98 3.58z"/>
              </svg>
              {signing?'Signing in...':'Continue with Google'}
            </button>
            <div style={{marginTop:16,padding:'10px 14px',background:'#0c0c0c',border:'1px solid #1c1c1c',borderRadius:9,fontSize:11,color:'#6b6b6b',lineHeight:1.7}}>
              🔒 Only employees whose email is registered by HR can sign in. All others are blocked.
            </div>
          </div>
        </div>
      </div>
    </>
  )

  if (!loading && !user) return loginScreen
  if (loading || busy) return <div style={{minHeight:'100vh',background:'#0c0c0c',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner"/></div>
  if (err) return (
    <div style={{minHeight:'100vh',background:'#0c0c0c',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'DM Sans',system-ui",color:'#f5f0e8'}}>
      <div style={{textAlign:'center',maxWidth:360}}>
        <div style={{fontSize:32,marginBottom:12}}>🔒</div>
        <div style={{fontWeight:700,marginBottom:8}}>Not authorized</div>
        <div style={{fontSize:13,color:'#6b6b6b',lineHeight:1.6,marginBottom:20}}>{err}</div>
        <button onClick={()=>signOut(auth)} style={{fontSize:13,color:'#d4a853',background:'none',border:'none',cursor:'pointer'}}>Sign out →</button>
      </div>
    </div>
  )
  if (!data) return loginScreen

  const {emp, grants, vestByGrant, fv, vals} = data
  const companyName = data.settings?.companyName || 'Your Company'
  const orderedGrants = [...grants].sort((a: any, b: any) => (b.grantDate || '').localeCompare(a.grantDate || ''))
  const pendingAcceptance = orderedGrants.filter((g: any) => ['issued', 'pending_acceptance'].includes(g.status || ''))
  const formatAcceptedAt = (value: any) => {
    if (!value) return null
    if (typeof value === 'string') return new Date(value)
    if (typeof value?.toDate === 'function') return value.toDate()
    return null
  }

  // Aggregate totals
  let totGranted=0, totVested=0, totLapsed=0, totExercised=0, totPending=0
  grants.forEach((g:any)=>{
    const evs = (vestByGrant.get(g.id)||[]).map((ev:any)=>({
      ...ev, status: computeVestingStatus(ev.vestDate, emp.exitDate, ev.status)
    }))
    const v = computeVesting(evs,g.totalOptions,fv,g.exercised||0,emp.exitDate||null)
    totGranted+=v.total; totVested+=v.vested; totLapsed+=v.lapsed
    totExercised+=v.exercised; totPending+=v.pending
  })
  const netVested = Math.max(0, totVested - totExercised)
  const currentValue = netVested * fv

  const Stat = ({label,val,color,sub}:{label:string,val:string,color:string,sub?:string}) => (
    <div style={{background:'#141414',border:'1px solid #1c1c1c',borderRadius:14,padding:'18px 20px',flex:1,minWidth:140}}>
      <div style={{fontSize:10,fontWeight:700,color:'#6b6b6b',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>{label}</div>
      <div style={{fontSize:22,fontWeight:800,color,letterSpacing:'-0.025em'}}>{val}</div>
      {sub&&<div style={{fontSize:10,color:'#6b6b6b',marginTop:3}}>{sub}</div>}
    </div>
  )

  return (
    <>
      <Head>
        <title>My ESOPs — {companyName}</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      </Head>
      <div style={{minHeight:'100vh',background:'#0c0c0c',fontFamily:"'DM Sans',system-ui",color:'#f5f0e8',WebkitFontSmoothing:'antialiased' as any}}>
        {/* Top bar */}
        <div style={{background:'#0f0f0f',borderBottom:'1px solid #1c1c1c',padding:'14px 24px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:28,height:28,borderRadius:8,background:'linear-gradient(135deg,#d4a853,#a07830)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:13,color:'#0c0c0c'}}>E</div>
            <span style={{fontWeight:700,fontSize:14}}>{companyName} · Employee Portal</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <span style={{fontSize:12,color:'#6b6b6b'}}>{profile?.email}</span>
            <button onClick={()=>signOut(auth)} style={{fontSize:11,color:'#6b6b6b',background:'rgba(255,255,255,0.04)',border:'1px solid #2a2a2a',borderRadius:7,padding:'5px 10px',cursor:'pointer'}}>Sign out</button>
          </div>
        </div>

        <div style={{padding:'32px 24px',maxWidth:900,margin:'0 auto'}}>
          {/* Header */}
          <div style={{marginBottom:28}}>
            <h1 style={{fontSize:24,fontWeight:800,letterSpacing:'-0.03em',marginBottom:4}}>Hello, {emp.name?.split(' ')[0]} 👋</h1>
            <div style={{fontSize:13,color:'#6b6b6b'}}>
              {emp.designation&&<span>{emp.designation} · </span>}
              {emp.department&&<span>{emp.department} · </span>}
              <span>{emp.employeeCode}</span>
              {emp.exitDate&&<span style={{color:'#f87171',marginLeft:8}}>· Exited {fmtDate(emp.exitDate)}</span>}
            </div>
          </div>

          {/* Summary stats */}
          <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:24}}>
            <Stat label="Total Granted" val={fmtN(totGranted)} color="#d4a853"/>
            <Stat label="Vested" val={fmtN(totVested)} color="#4ade80" sub={totLapsed>0?`${fmtN(totLapsed)} lapsed`:undefined}/>
            <Stat label="Exercised" val={fmtN(totExercised)} color="#60a5fa"/>
            <Stat label="Net Vested" val={fmtN(netVested)} color="#c084fc" sub="Available to exercise"/>
            <Stat label="Future Vesting" val={fmtN(totPending)} color="#f5f0e8" sub="Pending"/>
            {fv>0&&<Stat label="Current Value" val={fmtC(currentValue)} color="#d4a853" sub={`@ ${fmtC(fv)}/option`}/>}
          </div>

          {pendingAcceptance.length > 0 && (
            <div style={{background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.25)',borderRadius:12,padding:'12px 14px',marginBottom:18,fontSize:12,color:'#fcd34d'}}>
              ⏳ You have {pendingAcceptance.length} grant letter{pendingAcceptance.length>1?'s':''} pending acceptance.
            </div>
          )}

          {/* Per-grant detail */}
          <div style={{fontWeight:700,fontSize:15,marginBottom:14}}>Your Grants ({orderedGrants.length})</div>
          {grants.length === 0 && <div style={{color:'#6b6b6b',fontSize:13}}>No grants assigned yet. Contact HR.</div>}
          {orderedGrants.map((g:any)=>{
            const evs = (vestByGrant.get(g.id)||[])
              .map((ev:any)=>({...ev, status:computeVestingStatus(ev.vestDate,emp.exitDate,ev.status)}))
              .sort((a:any,b:any)=>a.vestDate.localeCompare(b.vestDate))
            const v = computeVesting(evs,g.totalOptions,fv,g.exercised||0,emp.exitDate||null)
            const grantDateFV = getLatestValuation(vals, g.grantDate)

            const futureEvs = evs.filter((ev:any)=>ev.status==='pending')
            const nextVest  = futureEvs[0]

            return (
              <div key={g.id} style={{background:'#141414',border:'1px solid #1c1c1c',borderRadius:16,padding:22,marginBottom:14}}>
                {/* Grant header */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16,flexWrap:'wrap',gap:10}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                      <span style={{background:'rgba(212,168,83,0.12)',border:'1px solid rgba(212,168,83,0.2)',color:'#d4a853',fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:5}}>{g.grantNumber}</span>
                      <span style={{fontSize:12,color:'#6b6b6b'}}>Granted {fmtDate(g.grantDate)}</span>
                      <span style={{fontSize:11,padding:'2px 8px',borderRadius:99,border:'1px solid #2a2a2a',color:'#c9c9c9',textTransform:'capitalize'}}>{(g.status||'issued').replace(/_/g,' ')}</span>
                    </div>
                    <div style={{fontSize:11,color:'#6b6b6b'}}>
                      Exercise Price: <strong style={{color:'#f5f0e8'}}>{fmtC(g.exercisePrice||0)}</strong>
                      {grantDateFV>0&&<span> · FV at grant: <strong style={{color:'#f5f0e8'}}>{fmtC(grantDateFV)}</strong></span>}
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <button
                      onClick={() => setActiveLetterGrantId(g.id)}
                      style={{fontSize:12,color:'#d4a853',textDecoration:'none',display:'block',marginBottom:2,background:'none',border:'none',cursor:'pointer',padding:0}}
                    >
                      📄 View Grant Letter
                    </button>
                    {g.signedLetterUrl&&<a href={g.signedLetterUrl} target="_blank" style={{fontSize:12,color:'#4ade80',textDecoration:'none'}}>✅ Signed Letter</a>}
                  </div>
                </div>

                <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid #2a2a2a',borderRadius:10,padding:'10px 12px',marginBottom:14,fontSize:12}}>
                  <div style={{fontWeight:700,marginBottom:6,color:'#d4a853'}}>Employee Acceptance</div>
                  {g.acceptedAt || g.signedLetterUrl ? (
                    <div style={{color:'#4ade80'}}>
                      {(() => {
                        const acceptedDate = formatAcceptedAt(g.acceptedAt)
                        if (acceptedDate) {
                          return <>✅ Digitally accepted on {acceptedDate.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })} & {acceptedDate.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</>
                        }
                        return <>✅ Accepted (signed letter on record)</>
                      })()}
                      {g.signedLetterUrl && <span style={{color:'#86efac'}}> · Physical signed letter uploaded</span>}
                    </div>
                  ) : (
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
                      <div style={{color:'#f5f0e8'}}>
                        Pending acceptance. Open your grant letter, review till the end, then click <strong>I Accept</strong>.
                      </div>
                      {['issued','pending_acceptance'].includes(g.status||'') && (
                        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                          <button onClick={()=>setActiveLetterGrantId(g.id)} className="btn btn-ghost btn-sm">Open Grant Letter</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Stats row */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))',gap:10,marginBottom:16}}>
                  {[
                    {label:'Granted',val:fmtN(v.total),color:'#d4a853'},
                    {label:'Vested',val:fmtN(v.vested),color:'#4ade80'},
                    {label:'Lapsed',val:fmtN(v.lapsed),color:'#f87171'},
                    {label:'Exercised',val:fmtN(v.exercised),color:'#60a5fa'},
                    {label:'Net Vested',val:fmtN(v.netVested),color:'#c084fc'},
                    {label:'Pending',val:fmtN(v.pending),color:'#f5f0e8'},
                  ].map(s=>(
                    <div key={s.label} style={{background:'rgba(0,0,0,0.3)',borderRadius:10,padding:'10px 12px',textAlign:'center'}}>
                      <div style={{fontSize:10,color:'#6b6b6b',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.06em'}}>{s.label}</div>
                      <div style={{fontSize:16,fontWeight:700,color:s.color}}>{s.val}</div>
                    </div>
                  ))}
                </div>

                {fv>0&&v.netVested>0&&(
                  <div style={{background:'rgba(212,168,83,0.06)',border:'1px solid rgba(212,168,83,0.15)',borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:12}}>
                    💰 Current value of net vested options: <strong style={{color:'#d4a853'}}>{fmtC(v.netVested*fv)}</strong>
                    <span style={{color:'#6b6b6b'}}> ({fmtN(v.netVested)} × {fmtC(fv)}/option)</span>
                  </div>
                )}

                {nextVest&&(
                  <div style={{background:'rgba(96,165,250,0.06)',border:'1px solid rgba(96,165,250,0.15)',borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:12}}>
                    🗓 Next vesting: <strong style={{color:'#60a5fa'}}>{fmtN(nextVest.optionsCount)} options on {fmtDate(nextVest.vestDate)}</strong>
                    {futureEvs.length>1&&<span style={{color:'#6b6b6b'}}> · {futureEvs.length} future events, {fmtN(v.pending)} total pending</span>}
                  </div>
                )}

                {/* Vesting schedule */}
                <div style={{fontSize:12,fontWeight:700,color:'#6b6b6b',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.06em'}}>Vesting Schedule</div>
                <div style={{maxHeight:220,overflowY:'auto'}}>
                  {evs.map((ev:any,i:number)=>{
                    const statusColor = ev.status==='lapsed'?'#f87171':ev.status==='vested'?'#4ade80':'#f59e0b'
                    return (
                      <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #1a1a1a'}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{width:7,height:7,borderRadius:'50%',background:statusColor,flexShrink:0}}/>
                          <span style={{fontSize:12,fontFamily:'monospace',color:'#a8a8a0'}}>{fmtDate(ev.vestDate)}</span>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <span style={{fontWeight:600,fontSize:12}}>{fmtN(ev.optionsCount)}</span>
                          {fv>0&&ev.status!=='lapsed'&&<span style={{fontSize:11,color:'#6b6b6b'}}>{fmtC(ev.optionsCount*fv)}</span>}
                          <span style={{fontSize:10,fontWeight:700,color:statusColor,textTransform:'capitalize',minWidth:48,textAlign:'right'}}>{ev.status}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {activeLetterGrantId && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.68)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:20}}>
          <div style={{width:'100%',maxWidth:980,maxHeight:'92vh',overflow:'auto',background:'#141414',border:'1px solid #2a2a2a',borderRadius:14,padding:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <h3 style={{margin:0}}>Grant Letter</h3>
              <button onClick={()=>setActiveLetterGrantId('')} className="btn btn-ghost btn-sm">Close</button>
            </div>
            <GrantLetterView
              grant={orderedGrants.find((gr:any)=>gr.id===activeLetterGrantId)}
              employee={emp}
              company={data.settings}
              vestingEvents={vestByGrant.get(activeLetterGrantId) || []}
              companyId={profile?.companyId}
              onGrantUpdated={(updates)=>setData((prev:any)=>({
                ...prev,
                grants: prev.grants.map((gr:any)=>gr.id===activeLetterGrantId ? ({ ...gr, ...updates, acceptedAt: updates.acceptedAt ? new Date().toISOString() : gr.acceptedAt }) : gr)
              }))}
            />
          </div>
        </div>
      )}
    </>
  )
}
