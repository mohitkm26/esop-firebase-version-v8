import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import { fmtDate } from '@/lib/utils'

export default function AuditPage() {
  const { user, profile, loading } = useAuth()
  const { companyId, can } = usePlan()
  const router = useRouter()
  const [logs, setLogs] = useState<any[]>([])
  const [busy, setBusy] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => { if (!loading && !user) router.push('/login') }, [user, loading])
  useEffect(() => {
    if (!user || !companyId) return
    getDocs(query(collection(db,'companies',companyId,'auditLogs'), orderBy('timestamp','desc'), limit(500)))
      .then(snap => { setLogs(snap.docs.map(d=>({id:d.id,...d.data()}))); setBusy(false) })
  }, [user, companyId])

  if (loading || busy) return <div style={{minHeight:'100vh',background:'var(--bg)',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner-lg"/></div>
  if (!can('audit_logs')) return (
    <Layout>
      <div className="p-8 text-center">
        <div style={{fontSize:48,marginBottom:12}}>📋</div>
        <h2 className="page-title mb-2">Audit Logs</h2>
        <p className="text-muted">Available on Advanced plan.</p>
        <button onClick={()=>router.push('/pricing')} className="btn btn-primary" style={{marginTop:16}}>Upgrade</button>
      </div>
    </Layout>
  )

  const ACTION_COLORS: Record<string,string> = {
    create:'badge-green', update:'badge-blue', delete:'badge-red',
    grant_issued:'badge-amber', exercise_recorded:'badge-purple',
    document_uploaded:'badge-blue', user_added:'badge-green',
    grant_frozen:'badge-orange', grant_expired:'badge-red',
  }

  const filtered = logs.filter(l => !filter ||
    l.action?.includes(filter) || l.entityType?.includes(filter) ||
    l.userEmail?.includes(filter) || l.entityId?.includes(filter)
  )

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="page-title">Audit Log</h1>
            <p className="text-muted text-sm mt-1">{logs.length} events recorded</p>
          </div>
        </div>
        <div className="mb-5">
          <input className="input" style={{maxWidth:320}} placeholder="🔍 Filter by action, user, entity..." value={filter} onChange={e=>setFilter(e.target.value)}/>
        </div>
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div className="table-wrap" style={{border:'none',borderRadius:0}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>
                <th className="th">Timestamp</th><th className="th">User</th>
                <th className="th">Action</th><th className="th">Entity</th><th className="th">Note</th>
              </tr></thead>
              <tbody>
                {filtered.map((l:any)=>(
                  <tr key={l.id}>
                    <td className="td td-mono text-muted" style={{fontSize:11}}>{new Date(l.timestamp).toLocaleString('en-IN')}</td>
                    <td className="td" style={{fontSize:12}}>{l.userEmail}</td>
                    <td className="td"><span className={`badge ${ACTION_COLORS[l.action]||'badge-muted'}`}>{l.action}</span></td>
                    <td className="td td-mono" style={{fontSize:11}}>{l.entityType}:{l.entityId?.slice(0,8)}</td>
                    <td className="td text-muted" style={{fontSize:12}}>{l.note||'—'}</td>
                  </tr>
                ))}
                {filtered.length===0 && <tr><td className="td text-muted" colSpan={5} style={{textAlign:'center',padding:40}}>No audit events found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  )
}
