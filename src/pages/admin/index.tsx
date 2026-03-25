import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, doc, updateDoc, orderBy, query } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import Layout from '@/components/layout/Layout'
import { fmtDate } from '@/lib/utils'
import { isSuperAdmin } from '@/lib/roles'
import Link from 'next/link'

const PLAN_OPTIONS = ['basic','pro','advanced']

export default function AdminCompanies() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [companies, setCompanies] = useState<any[]>([])
  const [busy, setBusy] = useState(true)
  const [editing, setEditing] = useState<string|null>(null)
  const [editPlan, setEditPlan] = useState('')

  useEffect(() => { if (!loading && (!user || !isSuperAdmin(profile?.role))) router.push('/dashboard') }, [user, profile, loading])
  useEffect(() => {
    if (!user) return
    getDocs(query(collection(db,'companies'), orderBy('createdAt','desc')))
      .then(snap => { setCompanies(snap.docs.map(d=>({id:d.id,...d.data()}))); setBusy(false) })
  }, [user])

  async function savePlan(companyId: string) {
    await updateDoc(doc(db,'companies',companyId), { plan:editPlan, updatedAt:new Date().toISOString() })
    setCompanies(prev=>prev.map(c=>c.id===companyId?{...c,plan:editPlan}:c))
    setEditing(null)
  }

  if (loading || busy) return <div style={{minHeight:'100vh',background:'var(--bg)',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner-lg"/></div>
  if (!isSuperAdmin(profile?.role)) return null

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-7">
          <div>
            <h1 className="page-title">All Companies</h1>
            <p className="text-muted text-sm mt-1">{companies.length} companies on the platform</p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/users"   className="btn btn-ghost btn-sm">Users</Link>
            <Link href="/admin/support" className="btn btn-ghost btn-sm">Support</Link>
            <Link href="/admin/plans"   className="btn btn-ghost btn-sm">Plans</Link>
          </div>
        </div>

        <div className="card" style={{padding:0}}>
          <div className="table-wrap" style={{border:'none',borderRadius:0}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>
                <th className="th">Company</th><th className="th">Plan</th>
                <th className="th">Owner</th><th className="th">Created</th><th className="th">Actions</th>
              </tr></thead>
              <tbody>
                {companies.map((c:any)=>(
                  <tr key={c.id}>
                    <td className="td">
                      <div style={{fontWeight:600}}>{c.name || c.companyName || '—'}</div>
                      <div style={{fontSize:11,color:'var(--muted)'}}>{c.contactEmail||c.id}</div>
                    </td>
                    <td className="td">
                      {editing === c.id ? (
                        <div style={{display:'flex',gap:8,alignItems:'center'}}>
                          <select className="input" style={{width:120,padding:'4px 8px',fontSize:12}} value={editPlan} onChange={e=>setEditPlan(e.target.value)}>
                            {PLAN_OPTIONS.map(p=><option key={p}>{p}</option>)}
                          </select>
                          <button onClick={()=>savePlan(c.id)} className="btn btn-success btn-sm">Save</button>
                          <button onClick={()=>setEditing(null)} className="btn btn-ghost btn-sm">✕</button>
                        </div>
                      ) : (
                        <span className={`badge ${c.plan==='advanced'?'badge-amber':c.plan==='pro'?'badge-blue':'badge-muted'}`}>{c.plan||'basic'}</span>
                      )}
                    </td>
                    <td className="td td-mono text-muted" style={{fontSize:12}}>{c.ownerId?.slice(0,8)}...</td>
                    <td className="td td-mono text-muted">{fmtDate(c.createdAt)}</td>
                    <td className="td">
                      <button onClick={()=>{ setEditing(c.id); setEditPlan(c.plan||'basic') }} className="btn btn-ghost btn-sm">Edit Plan</button>
                    </td>
                  </tr>
                ))}
                {companies.length===0 && <tr><td className="td text-muted" colSpan={5} style={{textAlign:'center',padding:40}}>No companies found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  )
}
