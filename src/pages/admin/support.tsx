import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, orderBy, doc, updateDoc } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import Layout from '@/components/layout/Layout'
import { fmtDate } from '@/lib/utils'
import { isSuperAdmin } from '@/lib/roles'

const STATUS_OPTIONS = ['open','in_progress','resolved','closed']
const STATUS_COLORS: Record<string,string> = {
  open:'badge-blue', in_progress:'badge-amber', resolved:'badge-green', closed:'badge-muted'
}

export default function AdminSupport() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [tickets, setTickets] = useState<any[]>([])
  const [companies, setCompanies] = useState<Record<string,string>>({})
  const [busy, setBusy] = useState(true)
  const [filter, setFilter] = useState('open')

  useEffect(() => { if (!loading && (!user || !isSuperAdmin(profile?.role))) router.push('/dashboard') }, [user, profile, loading])
  useEffect(() => {
    if (!user) return
    // Load all company names
    getDocs(collection(db,'companies')).then(snap => {
      const map: Record<string,string> = {}
      snap.docs.forEach(d => { map[d.id] = d.data().name || d.id })
      setCompanies(map)
    })
    // Load all tickets from all companies
    getDocs(collection(db,'companies')).then(async compSnap => {
      const all: any[] = []
      for (const compDoc of compSnap.docs) {
        const ticketSnap = await getDocs(query(collection(db,'companies',compDoc.id,'tickets'), orderBy('createdAt','desc')))
        ticketSnap.docs.forEach(t => all.push({ id:t.id, companyDocId:compDoc.id, ...t.data() }))
      }
      all.sort((a,b)=>b.createdAt?.localeCompare(a.createdAt||''))
      setTickets(all); setBusy(false)
    })
  }, [user])

  async function updateStatus(companyId: string, ticketId: string, status: string) {
    await updateDoc(doc(db,'companies',companyId,'tickets',ticketId), { status, updatedAt:new Date().toISOString() })
    setTickets(prev=>prev.map(t=>t.id===ticketId&&t.companyDocId===companyId ? {...t,status} : t))
  }

  if (loading || busy) return <div style={{minHeight:'100vh',background:'var(--bg)',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner-lg"/></div>

  const filtered = filter === 'all' ? tickets : tickets.filter(t=>t.status===filter)

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-7">
          <div>
            <h1 className="page-title">Support Queue</h1>
            <p className="text-muted text-sm mt-1">{tickets.length} total tickets</p>
          </div>
        </div>
        <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap'}}>
          {['all','open','in_progress','resolved','closed'].map(s=>(
            <button key={s} onClick={()=>setFilter(s)} className={`tab${filter===s?' active':''}`}>
              {s === 'all' ? 'All' : s.replace('_',' ')}
              {s !== 'all' && <span style={{marginLeft:6,fontSize:9,background:'rgba(255,255,255,0.1)',padding:'1px 5px',borderRadius:9}}>{tickets.filter(t=>t.status===s).length}</span>}
            </button>
          ))}
        </div>
        <div className="card" style={{padding:0}}>
          <div className="table-wrap" style={{border:'none',borderRadius:0}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>
                <th className="th">Subject</th><th className="th">Company</th>
                <th className="th">Type</th><th className="th">Status</th><th className="th">Date</th><th className="th">Action</th>
              </tr></thead>
              <tbody>
                {filtered.map((t:any)=>(
                  <tr key={`${t.companyDocId}-${t.id}`}>
                    <td className="td">
                      <div style={{fontWeight:600,fontSize:13}}>{t.subject}</div>
                      <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{t.description?.slice(0,60)}...</div>
                    </td>
                    <td className="td text-muted" style={{fontSize:12}}>{companies[t.companyDocId]||t.companyDocId?.slice(0,8)}</td>
                    <td className="td"><span className="badge badge-muted">{t.type}</span></td>
                    <td className="td"><span className={`badge ${STATUS_COLORS[t.status]||'badge-muted'}`}>{t.status?.replace('_',' ')}</span></td>
                    <td className="td td-mono text-muted" style={{fontSize:11}}>{fmtDate(t.createdAt)}</td>
                    <td className="td">
                      <select className="input" style={{padding:'4px 8px',fontSize:12,width:120}} value={t.status}
                        onChange={e=>updateStatus(t.companyDocId, t.id, e.target.value)}>
                        {STATUS_OPTIONS.map(s=><option key={s} value={s}>{s.replace('_',' ')}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
                {filtered.length===0 && <tr><td className="td text-muted" colSpan={6} style={{textAlign:'center',padding:40}}>No tickets found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  )
}
