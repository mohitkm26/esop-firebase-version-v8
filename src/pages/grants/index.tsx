import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import Link from 'next/link'
import { fmtDate, fmtN, downloadBlob } from '@/lib/utils'

const STATUS_BADGE: Record<string,string> = {
  draft:'badge badge-muted', issued:'badge badge-blue', pending_acceptance:'badge badge-blue',
  pending_signatory_approval:'badge badge-blue',
  accepted:'badge badge-green', active:'badge badge-green', exercised:'badge badge-purple',
  expired:'badge badge-red', cancelled:'badge badge-red'
}

export default function Grants() {
  const { user, profile, loading } = useAuth()
  const { companyId } = usePlan()
  const router = useRouter()
  const [grants, setGrants]   = useState<any[]>([])
  const [search, setSearch]   = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [busy, setBusy]       = useState(true)

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])
  useEffect(() => {
    if (!companyId) return
    getDocs(query(collection(db,'companies',companyId,'grants'), orderBy('grantDate','desc')))
      .then(snap => { setGrants(snap.docs.map(d=>({id:d.id,...d.data()}))); setBusy(false) })
      .catch(() => setBusy(false))
  }, [companyId])

  const filtered = grants.filter(g => {
    const q = search.toLowerCase()
    const matchSearch = !search || g.grantNumber?.toLowerCase().includes(q) || g.employeeName?.toLowerCase().includes(q) || g.employeeEmail?.toLowerCase().includes(q)
    const matchStatus = filterStatus === 'all' || g.status === filterStatus
    return matchSearch && matchStatus
  })

  // Check and auto-expire grants
  useEffect(() => {
    const now = new Date()
    grants.forEach(g => {
      if (g.status === 'issued' && g.expiresAt?.toDate && g.expiresAt.toDate() < now) {
        // In real app: update Firestore. Here just flag visually.
      }
    })
  }, [grants])

  function exportCSV() {
    const rows = [['Grant #','Employee','Date','Type','Options','Exercise Price','Status']]
    filtered.forEach(g => rows.push([g.grantNumber||'',g.employeeName||'',g.grantDate||'',g.grantType||'',String(g.totalOptions||0),String(g.exercisePrice||0),g.status||'']))
    downloadBlob(rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n'), 'grants.csv')
  }

  if (loading || busy) return <Layout title="Grants"><div style={{ display:'flex', justifyContent:'center', padding:64 }}><div className="spinner-lg"/></div></Layout>

  return (
    <Layout title="Grants">
      <div style={{ maxWidth:1100 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 className="page-title">Grants</h1>
            <p className="page-subtitle">{grants.length} total · {grants.filter(g=>['active','accepted'].includes(g.status||'')).length} active</p>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={exportCSV} className="btn btn-secondary btn-sm">↓ Export</button>
            <Link href="/grants/new" className="btn btn-primary btn-sm">+ Issue Grant</Link>
          </div>
        </div>

        <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
          <input className="input" style={{ maxWidth:280 }} placeholder="Search grant # or employee..." value={search} onChange={e=>setSearch(e.target.value)}/>
          <select className="input" style={{ maxWidth:200 }} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
            <option value="all">All Status</option>
            {['draft','pending_signatory_approval','issued','pending_acceptance','accepted','active','exercised','expired','cancelled'].map(s=>(
              <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
            ))}
          </select>
        </div>

        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <table className="tbl">
            <thead>
              <tr><th>Grant #</th><th>Employee</th><th>Grant Date</th><th>Type</th><th>Options</th><th>Exercise Price</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign:'center', padding:32, color:'var(--text3)' }}>
                  {grants.length === 0 ? 'No grants yet. ' : 'No matching grants. '}
                  <Link href="/grants/new" style={{ color:'var(--accent)' }}>Issue first grant →</Link>
                </td></tr>
              ) : filtered.map(g => (
                <tr key={g.id} style={{ cursor:'pointer' }} onClick={()=>router.push(`/grants/${g.id}`)}>
                  <td><span style={{ fontFamily:'monospace', fontSize:12, fontWeight:600 }}>{g.grantNumber}</span>{g.locked&&<span style={{ marginLeft:6, fontSize:9, color:'var(--text3)' }}>🔒</span>}</td>
                  <td>{g.employeeName||'—'}</td>
                  <td>{fmtDate(g.grantDate)}</td>
                  <td>{g.grantType||'—'}</td>
                  <td>{fmtN(g.totalOptions||0)}</td>
                  <td>₹{fmtN(g.exercisePrice||0)}</td>
                  <td><span className={STATUS_BADGE[g.status]||'badge badge-muted'}>{(g.status||'draft').replace(/_/g,' ')}</span></td>
                  <td onClick={e=>e.stopPropagation()}><Link href={`/grants/${g.id}`} className="btn btn-ghost btn-xs">View →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  )
}
