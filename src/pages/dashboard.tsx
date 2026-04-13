import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import Link from 'next/link'
import { fmtN, fmtDate, computeVesting } from '@/lib/utils'
import { canAdmin } from '@/lib/roles'

export default function Dashboard() {
  const { user, profile, loading, effectiveRole } = useAuth()
  const { companyId, companyData } = usePlan()
  const router = useRouter()
  const [stats, setStats] = useState({ employees:0, grants:0, totalOptions:0, vestedPct:0, exercised:0 })
  const [recentGrants, setRecentGrants] = useState<any[]>([])
  const [recentAudit, setRecentAudit] = useState<any[]>([])
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
    if (!loading && profile && effectiveRole === 'employee') router.replace('/employee-portal')
  }, [user, loading, profile, effectiveRole])

  useEffect(() => {
    if (!user || !companyId) return
    async function load() {
      try {
        const [empSnap, grantSnap] = await Promise.all([
          getDocs(collection(db,'companies',companyId,'employees')),
          getDocs(query(collection(db,'companies',companyId,'grants'), orderBy('createdAt','desc'))),
        ])
        const employees = empSnap.docs.map(d=>({id:d.id,...d.data()}))
        const grants = grantSnap.docs.map(d=>({id:d.id,...d.data()})) as any[]

        const totalOptions = grants.reduce((s:number,g:any)=>s+(g.totalOptions||0),0)
        const activeGrants = grants.filter((g:any)=>!['cancelled','expired'].includes(g.status||'')).length

        setStats({ employees:employees.length, grants:activeGrants, totalOptions, vestedPct:0, exercised:0 })
        setRecentGrants(grants.slice(0,5))

        const auditSnap = await getDocs(query(collection(db,'companies',companyId,'auditLogs'), orderBy('timestamp','desc'), limit(5)))
        setRecentAudit(auditSnap.docs.map(d=>({id:d.id,...d.data()})))
      } catch(e) { console.error(e) }
      setBusy(false)
    }
    load()
  }, [user, companyId])

  const STATUS_BADGE: Record<string,string> = {
    draft:'badge badge-muted', issued:'badge badge-blue', pending_acceptance:'badge badge-blue',
    pending_signatory_approval:'badge badge-blue',
    accepted:'badge badge-green', active:'badge badge-green', exercised:'badge badge-purple',
    expired:'badge badge-red', cancelled:'badge badge-red'
  }

  if (loading || busy) return <Layout title="Dashboard"><div style={{ display:'flex', justifyContent:'center', padding:64 }}><div className="spinner-lg"/></div></Layout>

  return (
    <Layout title="Dashboard">
      <div style={{ maxWidth:1100 }}>
        {/* Welcome */}
        {companyData && !companyData.onboarded && (
          <div className="alert alert-warning mb-4">
            ⚠️ Complete your <Link href="/onboarding" style={{ color:'var(--warning)', fontWeight:700 }}>company setup</Link> to unlock all features.
          </div>
        )}

        <div style={{ marginBottom:24 }}>
          <h1 className="page-title">Welcome, {profile?.name?.split(' ')[0] || 'there'} 👋</h1>
          <p className="page-subtitle">{companyData?.companyName} · ESOP Dashboard</p>
        </div>

        {/* Stats */}
        <div className="stats-grid mb-6">
          {[
            { val: fmtN(stats.employees), label:'Total Employees', sub:'Active', icon:'👥' },
            { val: fmtN(stats.grants),    label:'Active Grants',   sub:'Not cancelled/expired', icon:'📜' },
            { val: fmtN(stats.totalOptions), label:'Total Options', sub:'All grants', icon:'📊' },
            { val: '—',                   label:'Vested Today',    sub:'Run report for details', icon:'🎯', link:'/reports' },
            { val: '—',                   label:'Exercised',       sub:'All time', icon:'💰', link:'/reports' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div style={{ fontSize:22, marginBottom:6 }}>{s.icon}</div>
              <div className="stat-val">{s.val}</div>
              <div className="stat-label">{s.label}</div>
              <div className="stat-sub">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Two col */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          {/* Recent grants */}
          <div className="card">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <h3 className="section-title">Recent Grants</h3>
              <Link href="/grants" className="btn btn-ghost btn-xs">View all</Link>
            </div>
            {recentGrants.length === 0 ? (
              <div style={{ textAlign:'center', padding:'24px 0', color:'var(--text3)', fontSize:13 }}>
                No grants yet. <Link href="/grants/new" style={{ color:'var(--accent)' }}>Issue your first grant →</Link>
              </div>
            ) : (
              <table className="tbl">
                <thead><tr><th>Grant #</th><th>Employee</th><th>Options</th><th>Status</th></tr></thead>
                <tbody>
                  {recentGrants.map(g => (
                    <tr key={g.id} style={{ cursor:'pointer' }} onClick={()=>router.push(`/grants/${g.id}`)}>
                      <td style={{ fontFamily:'monospace', fontSize:12 }}>{g.grantNumber}</td>
                      <td style={{ maxWidth:100, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g.employeeName||'—'}</td>
                      <td>{fmtN(g.totalOptions||0)}</td>
                      <td><span className={STATUS_BADGE[g.status]||'badge badge-muted'}>{g.status||'—'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Recent audit */}
          <div className="card">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <h3 className="section-title">Recent Activity</h3>
              <Link href="/audit" className="btn btn-ghost btn-xs">View log</Link>
            </div>
            {recentAudit.length === 0 ? (
              <div style={{ textAlign:'center', padding:'24px 0', color:'var(--text3)', fontSize:13 }}>No activity yet</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {recentAudit.map(a => (
                  <div key={a.id} style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ width:7, height:7, borderRadius:'50%', background:'var(--accent)', marginTop:6, flexShrink:0 }}/>
                    <div>
                      <div style={{ fontSize:12.5, fontWeight:600, color:'var(--text)' }}>{a.action?.replace(/_/g,' ')}</div>
                      <div style={{ fontSize:11, color:'var(--text3)' }}>{a.entityLabel} · {a.userEmail}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick actions */}
        {canAdmin(effectiveRole) && (
          <div className="card mt-4">
            <h3 className="section-title mb-4">Quick Actions</h3>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <Link href="/employees/new" className="btn btn-secondary btn-sm">+ Add Employee</Link>
              <Link href="/grants/new"    className="btn btn-secondary btn-sm">+ Issue Grant</Link>
              <Link href="/upload"        className="btn btn-secondary btn-sm">↑ Bulk Upload</Link>
              <Link href="/reports"       className="btn btn-secondary btn-sm">≋ Run Report</Link>
              <Link href="/valuation"     className="btn btn-secondary btn-sm">◆ Add Valuation</Link>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
