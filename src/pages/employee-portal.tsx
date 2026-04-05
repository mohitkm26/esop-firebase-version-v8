import { canEdit } from '@/lib/roles'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db, auth } from '@/lib/firebase'
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth'
import { collection, getDocs, query, where, orderBy, doc, getDoc } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { fmtN, fmtC, fmtDate, getLatestValuation, computeVesting, computeVestingStatus } from '@/lib/utils'
import Head from 'next/head'
import { findEmployeeByAuthEmail } from '@/lib/employee-lookup'
import GrantLetterView from '@/components/GrantLetterView'

const EMPLOYEE_LINK_ERROR = 'Your email is not linked to any employee record. Please contact HR to update your details.'

export default function EmployeePortal() {
  const { user, profile, loading, effectiveRole, employeeView } = useAuth()
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [signing, setSigning] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginMode, setLoginMode] = useState<'signin' | 'reset'>('signin')
  const [resetMsg, setResetMsg] = useState('')
  const [activeLetterGrantId, setActiveLetterGrantId] = useState('')

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setSigning(true); setErr('')
    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim().toLowerCase(), loginPass)
    } catch (err: any) {
      const codes: Record<string, string> = {
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password. Use "Forgot Password" if needed.',
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/too-many-requests': 'Too many attempts. Please wait before retrying.',
      }
      setErr(codes[err.code] || err.message || 'Sign-in failed.')
    }
    setSigning(false)
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setSigning(true); setErr('')
    try {
      await sendPasswordResetEmail(auth, loginEmail.trim().toLowerCase())
      setResetMsg('Password reset email sent. Check your inbox.')
      setLoginMode('signin')
    } catch (err: any) {
      setErr(err.message || 'Could not send reset email.')
    }
    setSigning(false)
  }

  useEffect(() => {
    if (loading || !user || !profile) return
    if (canEdit(effectiveRole)) { router.replace('/dashboard'); return }
    if (effectiveRole === 'employee' && profile.employeeId) { loadData(profile.employeeId); return }
    if (effectiveRole === 'employee') {
      findEmployeeByAuthEmail(db, profile.email)
        .then(linked => {
          if (linked && linked.companyId === profile.companyId) loadData(linked.employeeId)
          else setErr(EMPLOYEE_LINK_ERROR)
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
        getDoc(doc(db, 'companies', profile!.companyId, 'employees', empId)),
        getDocs(query(collection(db, 'companies', profile!.companyId, 'grants'), where('employeeId', '==', empId))),
        getDocs(query(collection(db, 'companies', profile!.companyId, 'vestingEvents'), where('employeeId', '==', empId))),
        getDocs(query(collection(db, 'companies', profile!.companyId, 'valuations'), orderBy('valuationDate', 'desc'))),
        getDoc(doc(db, 'companies', profile!.companyId)),
      ])
      const emp = empSnap.exists() ? { id: empSnap.id, ...empSnap.data() } as any : null
      const grants = grantSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]
      const allVest = vestSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]
      const vals = valSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]
      const settings = settSnap.exists() ? settSnap.data() : {} as any
      const vestByGrant = new Map<string, any[]>()
      allVest.forEach((ev: any) => {
        if (!vestByGrant.has(ev.grantId)) vestByGrant.set(ev.grantId, [])
        vestByGrant.get(ev.grantId)!.push(ev)
      })
      const fv = getLatestValuation(vals)
      setData({ emp, grants, vestByGrant, fv, vals, settings })
    } catch (e: any) { setErr(e.message) }
    setBusy(false)
  }

  // ── Login screen ────────────────────────────────────────────────────────────
  const S: React.CSSProperties = {}
  const loginScreen = (
    <>
      <Head>
        <title>Employee ESOP Portal</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>
      <div style={{ minHeight: '100vh', background: '#0c0c0c', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'DM Sans',system-ui", color: '#f5f0e8' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#d4a853,#a07830)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, color: '#0c0c0c' }}>E</div>
            <span style={{ fontWeight: 700, fontSize: 16 }}>ESOP Manager</span>
          </div>
          <div style={{ background: '#141414', border: '1px solid #1c1c1c', borderRadius: 20, padding: 28 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.025em', marginBottom: 6 }}>Employee Portal</h1>
            <p style={{ fontSize: 13, color: '#6b6b6b', marginBottom: 24, lineHeight: 1.6 }}>
              {loginMode === 'reset' ? 'Enter your email to receive a password reset link.' : 'Sign in with your registered email and password to view your ESOP grants.'}
            </p>

            {err && <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: '#f87171' }}>{err}</div>}
            {resetMsg && <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: '#4ade80' }}>{resetMsg}</div>}

            <form onSubmit={loginMode === 'reset' ? handleReset : handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#9b9b9b', marginBottom: 6, fontWeight: 600 }}>Email Address</label>
                <input
                  type="email" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '11px 14px', color: '#f5f0e8', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                  placeholder="you@company.com" autoComplete="email"
                />
              </div>
              {loginMode === 'signin' && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#9b9b9b', marginBottom: 6, fontWeight: 600 }}>Password</label>
                  <input
                    type="password" required value={loginPass} onChange={e => setLoginPass(e.target.value)}
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '11px 14px', color: '#f5f0e8', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    placeholder="••••••••" autoComplete="current-password"
                  />
                </div>
              )}
              <button
                type="submit" disabled={signing}
                style={{ width: '100%', padding: '13px 16px', background: 'linear-gradient(135deg,#d4a853,#a07830)', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700, color: '#0c0c0c', cursor: signing ? 'not-allowed' : 'pointer', opacity: signing ? 0.7 : 1, marginTop: 4 }}
              >
                {signing ? 'Please wait...' : loginMode === 'reset' ? 'Send Reset Email' : 'Sign In'}
              </button>
            </form>

            <div style={{ marginTop: 16, textAlign: 'center' }}>
              {loginMode === 'signin'
                ? <button onClick={() => { setLoginMode('reset'); setErr('') }} style={{ background: 'none', border: 'none', color: '#6b6b6b', fontSize: 12, cursor: 'pointer' }}>Forgot your password?</button>
                : <button onClick={() => { setLoginMode('signin'); setErr('') }} style={{ background: 'none', border: 'none', color: '#d4a853', fontSize: 12, cursor: 'pointer' }}>← Back to Sign In</button>
              }
            </div>

            <div style={{ marginTop: 16, padding: '10px 14px', background: '#0c0c0c', border: '1px solid #1c1c1c', borderRadius: 9, fontSize: 11, color: '#6b6b6b', lineHeight: 1.7 }}>
              🔒 Only employees whose email is registered by HR can sign in. Contact HR if you do not have access.
            </div>
          </div>
        </div>
      </div>
    </>
  )

  if (!loading && !user) return loginScreen
  if (loading || busy) return <div style={{ minHeight: '100vh', background: '#0c0c0c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (err && !data) return (
    <div style={{ minHeight: '100vh', background: '#0c0c0c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans',system-ui", color: '#f5f0e8' }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Access not found</div>
        <div style={{ fontSize: 13, color: '#6b6b6b', lineHeight: 1.6, marginBottom: 20 }}>{err}</div>
        <button onClick={() => signOut(auth)} style={{ fontSize: 13, color: '#d4a853', background: 'none', border: 'none', cursor: 'pointer' }}>Sign out →</button>
      </div>
    </div>
  )
  if (!data) return loginScreen

  const { emp, grants, vestByGrant, fv, vals } = data
  const companyName = data.settings?.companyName || data.settings?.name || 'Your Company'
  const orderedGrants = [...grants].sort((a: any, b: any) => (b.grantDate || '').localeCompare(a.grantDate || ''))
  const pendingAcceptance = orderedGrants.filter((g: any) => ['issued', 'pending_acceptance'].includes(g.status || ''))

  const formatAcceptedAt = (value: any) => {
    if (!value) return null
    const d = typeof value?.toDate === 'function' ? value.toDate() : new Date(value)
    return isNaN(d.getTime()) ? null : d
  }

  let totGranted = 0, totVested = 0, totLapsed = 0, totExercised = 0, totPending = 0
  grants.forEach((g: any) => {
    const evs = (vestByGrant.get(g.id) || []).map((ev: any) => ({ ...ev, status: computeVestingStatus(ev.vestDate, emp.exitDate, ev.status) }))
    const v = computeVesting(evs, g.totalOptions, fv, g.exercised || 0, emp.exitDate || null)
    totGranted += v.total; totVested += v.vested; totLapsed += v.lapsed
    totExercised += v.exercised; totPending += v.pending
  })
  const netVested = Math.max(0, totVested - totExercised)
  const currentValue = netVested * fv

  const Stat = ({ label, val, color, sub }: { label: string; val: string; color: string; sub?: string }) => (
    <div style={{ background: '#141414', border: '1px solid #1c1c1c', borderRadius: 14, padding: '18px 20px', flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: '-0.025em' }}>{val}</div>
      {sub && <div style={{ fontSize: 10, color: '#6b6b6b', marginTop: 3 }}>{sub}</div>}
    </div>
  )

  return (
    <>
      <Head>
        <title>My ESOPs — {companyName}</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>
      <div style={{ minHeight: '100vh', background: '#0c0c0c', fontFamily: "'DM Sans',system-ui", color: '#f5f0e8', WebkitFontSmoothing: 'antialiased' as any }}>
        {/* Top bar */}
        <div style={{ background: '#0f0f0f', borderBottom: '1px solid #1c1c1c', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#d4a853,#a07830)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: '#0c0c0c' }}>E</div>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{companyName} · Employee Portal</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 12, color: '#6b6b6b' }}>{profile?.email}</span>
            <button onClick={() => signOut(auth)} style={{ fontSize: 11, color: '#6b6b6b', background: 'rgba(255,255,255,0.04)', border: '1px solid #2a2a2a', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Sign out</button>
          </div>
        </div>

        <div style={{ padding: '32px 24px', maxWidth: 900, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 4 }}>Hello, {emp.name?.split(' ')[0]} 👋</h1>
            <div style={{ fontSize: 13, color: '#6b6b6b' }}>
              {emp.designation && <span>{emp.designation} · </span>}
              {emp.department && <span>{emp.department} · </span>}
              {emp.employeeCode && <span>{emp.employeeCode}</span>}
              {emp.exitDate && <span style={{ color: '#f87171', marginLeft: 8 }}>· Exited {fmtDate(emp.exitDate)}</span>}
            </div>
          </div>

          {/* Summary stats */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
            <Stat label="Total Granted" val={fmtN(totGranted)} color="#d4a853" />
            <Stat label="Vested" val={fmtN(totVested)} color="#4ade80" sub={totLapsed > 0 ? `${fmtN(totLapsed)} lapsed` : undefined} />
            <Stat label="Exercised" val={fmtN(totExercised)} color="#60a5fa" />
            <Stat label="Net Vested" val={fmtN(netVested)} color="#c084fc" sub="Available to exercise" />
            <Stat label="Future Vesting" val={fmtN(totPending)} color="#f5f0e8" sub="Pending" />
            {fv > 0 && <Stat label="Current Value" val={fmtC(currentValue)} color="#d4a853" sub={`@ ${fmtC(fv)}/option`} />}
          </div>

          {pendingAcceptance.length > 0 && (
            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 12, padding: '12px 14px', marginBottom: 18, fontSize: 12, color: '#fcd34d' }}>
              ⏳ You have {pendingAcceptance.length} grant letter{pendingAcceptance.length > 1 ? 's' : ''} pending your acceptance. Please review and accept them.
            </div>
          )}

          {/* Per-grant cards */}
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Your Grants ({orderedGrants.length})</div>
          {grants.length === 0 && <div style={{ color: '#6b6b6b', fontSize: 13 }}>No grants assigned yet. Contact HR.</div>}

          {orderedGrants.map((g: any) => {
            const evs = (vestByGrant.get(g.id) || [])
              .map((ev: any) => ({ ...ev, status: computeVestingStatus(ev.vestDate, emp.exitDate, ev.status) }))
              .sort((a: any, b: any) => a.vestDate.localeCompare(b.vestDate))
            const v = computeVesting(evs, g.totalOptions, fv, g.exercised || 0, emp.exitDate || null)
            const futureEvs = evs.filter((ev: any) => ev.status === 'pending')
            const nextVest = futureEvs[0]
            const isAccepted = g.status === 'accepted'
            const isPending = ['issued', 'pending_acceptance'].includes(g.status || '')
            const acceptedDate = formatAcceptedAt(g.acceptedAt)

            return (
              <div key={g.id} style={{ background: '#141414', border: `1px solid ${isPending ? 'rgba(245,158,11,0.3)' : '#1c1c1c'}`, borderRadius: 16, padding: 22, marginBottom: 14 }}>
                {/* Grant header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ background: 'rgba(212,168,83,0.12)', border: '1px solid rgba(212,168,83,0.2)', color: '#d4a853', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, fontFamily: 'monospace' }}>{g.grantNumber}</span>
                      <span style={{ fontSize: 12, color: '#6b6b6b' }}>{g.grantType} · Granted {fmtDate(g.grantDate)}</span>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, border: '1px solid #2a2a2a', color: isAccepted ? '#4ade80' : isPending ? '#fcd34d' : '#c9c9c9', textTransform: 'capitalize' }}>{(g.status || 'issued').replace(/_/g, ' ')}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#6b6b6b' }}>
                      Exercise Price: <strong style={{ color: '#f5f0e8' }}>{fmtC(g.exercisePrice || 0)}</strong>
                    </div>
                  </div>
                  <button onClick={() => setActiveLetterGrantId(g.id)} style={{ fontSize: 12, color: '#d4a853', background: 'rgba(212,168,83,0.08)', border: '1px solid rgba(212,168,83,0.2)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>
                    📄 {isPending ? 'Review & Accept Grant Letter' : 'View Grant Letter'}
                  </button>
                </div>

                {/* Acceptance status */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #2a2a2a', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 12 }}>
                  {isAccepted ? (
                    <div style={{ color: '#4ade80' }}>
                      ✅ Accepted{g.acceptanceMethod === 'otp_verified' ? ' (OTP verified)' : ''}
                      {acceptedDate && <span style={{ color: '#6b6b6b', marginLeft: 8 }}>on {acceptedDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                    </div>
                  ) : g.status === 'rejected' ? (
                    <div style={{ color: '#f87171' }}>❌ Rejected — Contact HR to discuss</div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ color: '#fcd34d' }}>⏳ Pending your acceptance — please review and sign the grant letter</span>
                      {g.expiresAt && <span style={{ fontSize: 11, color: '#6b6b6b' }}>Deadline: {fmtDate(g.expiresAt)}</span>}
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(90px,1fr))', gap: 10, marginBottom: 14 }}>
                  {[
                    { label: 'Granted', val: fmtN(v.total), color: '#d4a853' },
                    { label: 'Vested', val: fmtN(v.vested), color: '#4ade80' },
                    { label: 'Lapsed', val: fmtN(v.lapsed), color: '#f87171' },
                    { label: 'Exercised', val: fmtN(v.exercised), color: '#60a5fa' },
                    { label: 'Net Vested', val: fmtN(v.netVested), color: '#c084fc' },
                    { label: 'Pending', val: fmtN(v.pending), color: '#f5f0e8' },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#6b6b6b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.val}</div>
                    </div>
                  ))}
                </div>

                {fv > 0 && v.netVested > 0 && (
                  <div style={{ background: 'rgba(212,168,83,0.06)', border: '1px solid rgba(212,168,83,0.15)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
                    💰 Current value of net vested options: <strong style={{ color: '#d4a853' }}>{fmtC(v.netVested * fv)}</strong>
                    <span style={{ color: '#6b6b6b' }}> ({fmtN(v.netVested)} × {fmtC(fv)}/option)</span>
                  </div>
                )}

                {nextVest && (
                  <div style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
                    🗓 Next vesting: <strong style={{ color: '#60a5fa' }}>{fmtN(nextVest.optionsCount)} options on {fmtDate(nextVest.vestDate)}</strong>
                    {futureEvs.length > 1 && <span style={{ color: '#6b6b6b' }}> · {futureEvs.length} future events, {fmtN(v.pending)} total pending</span>}
                  </div>
                )}

                {/* Vesting schedule */}
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b6b6b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Vesting Schedule</div>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {evs.map((ev: any, i: number) => {
                    const sc = ev.status === 'lapsed' ? '#f87171' : ev.status === 'vested' ? '#4ade80' : '#f59e0b'
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #1a1a1a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: sc, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#a8a8a0' }}>{fmtDate(ev.vestDate)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontWeight: 600, fontSize: 12 }}>{fmtN(ev.optionsCount)}</span>
                          {fv > 0 && ev.status !== 'lapsed' && <span style={{ fontSize: 11, color: '#6b6b6b' }}>{fmtC(ev.optionsCount * fv)}</span>}
                          <span style={{ fontSize: 10, fontWeight: 700, color: sc, textTransform: 'capitalize', minWidth: 44, textAlign: 'right' }}>{ev.status}</span>
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

      {/* Grant letter modal */}
      {activeLetterGrantId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 980, maxHeight: '92vh', overflow: 'auto', background: '#141414', border: '1px solid #2a2a2a', borderRadius: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #2a2a2a' }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>Grant Letter</h3>
              <button onClick={() => setActiveLetterGrantId('')} className="btn btn-ghost btn-sm">✕ Close</button>
            </div>
            <div style={{ padding: 16 }}>
              <GrantLetterView
                grant={orderedGrants.find((gr: any) => gr.id === activeLetterGrantId)}
                employee={emp}
                company={data.settings}
                vestingEvents={vestByGrant.get(activeLetterGrantId) || []}
                companyId={profile?.companyId}
                onGrantUpdated={updates => {
                  setData((prev: any) => ({
                    ...prev,
                    grants: prev.grants.map((gr: any) => gr.id === activeLetterGrantId ? { ...gr, ...updates, acceptedAt: updates.acceptedAt ? new Date().toISOString() : gr.acceptedAt } : gr),
                  }))
                  if (updates.status === 'accepted') setActiveLetterGrantId('')
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
