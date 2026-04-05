import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'

function fmtIST(value: any): string {
  if (!value) return '—'
  try {
    const date = typeof value?.toDate === 'function' ? value.toDate()
      : typeof value?.seconds === 'number' ? new Date(value.seconds * 1000)
      : new Date(value)
    if (isNaN(date.getTime())) return '—'
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    })
  } catch { return '—' }
}

const ACTION_COLORS: Record<string,string> = {
  grant_created:'badge-blue', grant_accepted:'badge-green', grant_rejected:'badge-red',
  grant_cancelled:'badge-red', grant_modified:'badge-amber', exercise_recorded:'badge-purple',
  employee_created:'badge-green', employee_updated:'badge-blue', employee_exited:'badge-amber',
  valuation_updated:'badge-blue', user_invited:'badge-blue', user_role_changed:'badge-amber',
  user_removed:'badge-red', settings_updated:'badge-muted', company_updated:'badge-muted', bulk_import:'badge-blue',
}

export default function AuditLog() {
  const { user, profile, loading } = useAuth()
  const { companyId, can } = usePlan()
  const router = useRouter()
  const [logs, setLogs] = useState<any[]>([])
  const [busy, setBusy] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])
  useEffect(() => {
    if (!companyId) return
    getDocs(query(collection(db,'companies',companyId,'auditLogs'), orderBy('timestamp','desc'), limit(500)))
      .then(snap => { setLogs(snap.docs.map(d=>({id:d.id,...d.data()}))); setBusy(false) })
      .catch(() => setBusy(false))
  }, [companyId])

  if (loading||busy) return <Layout title="Audit Log"><div style={{ display:'flex', justifyContent:'center', padding:64 }}><div className="spinner-lg"/></div></Layout>
  if (!can('audit_logs')) return <Layout title="Audit Log"><div className="alert alert-warning">Advanced plan required.</div></Layout>

  const filtered = search
    ? logs.filter(l => [l.action, l.userEmail, l.entityLabel, l.entityType].some(v => String(v||'').toLowerCase().includes(search.toLowerCase())))
    : logs

  return (
    <Layout title="Audit Log">
      <div style={{ maxWidth:1100 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
          <div><h1 className="page-title">Audit Log</h1><p className="page-subtitle">{logs.length} events · All times in IST</p></div>
        </div>
        <div className="card mb-4" style={{ padding:'12px 16px' }}>
          <input className="input" placeholder="Search by action, user, entity..." value={search} onChange={e=>setSearch(e.target.value)} style={{ maxWidth:400 }}/>
        </div>
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <table className="tbl">
            <thead><tr><th>Time (IST)</th><th>Action</th><th>Entity</th><th>Actor</th><th>Details</th></tr></thead>
            <tbody>
              {filtered.length===0
                ? <tr><td colSpan={5} style={{ textAlign:'center', padding:40, color:'var(--text3)' }}>No audit logs yet.</td></tr>
                : filtered.map(l=>(
                  <tr key={l.id}>
                    <td style={{ fontSize:11, fontFamily:'monospace', color:'var(--text3)', whiteSpace:'nowrap' }}>{fmtIST(l.timestamp)}</td>
                    <td><span className={`badge ${ACTION_COLORS[l.action]||'badge-muted'}`} style={{ fontSize:10 }}>{(l.action||'').replace(/_/g,' ')}</span></td>
                    <td><div style={{ fontSize:13, fontWeight:600 }}>{l.entityLabel||l.entityId}</div><div style={{ fontSize:11, color:'var(--text3)' }}>{l.entityType}</div></td>
                    <td style={{ fontSize:12, color:'var(--text2)' }}>{l.userEmail}</td>
                    <td style={{ fontSize:11, color:'var(--text3)', maxWidth:200 }}>
                      {l.note||''}
                      {l.after && <span style={{ fontFamily:'monospace' }}>{JSON.stringify(l.after).slice(0,80)}</span>}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  )
}
