import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import Layout from '@/components/layout/Layout'
import { fmtDate } from '@/lib/utils'
import { isSuperAdmin, ROLE_COLORS, ROLE_LABELS } from '@/lib/roles'

export default function AdminUsers() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [users, setUsers] = useState<any[]>([])
  const [busy, setBusy] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => { if (!loading && (!user || !isSuperAdmin(profile?.role))) router.push('/dashboard') }, [user, profile, loading])
  useEffect(() => {
    if (!user) return
    getDocs(query(collection(db,'profiles'), orderBy('email')))
      .then(snap => { setUsers(snap.docs.map(d=>({id:d.id,...d.data()}))); setBusy(false) })
  }, [user])

  if (loading || busy) return <div style={{minHeight:'100vh',background:'var(--bg)',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner-lg"/></div>

  const filtered = users.filter(u => !filter || u.email?.includes(filter) || u.name?.includes(filter) || u.companyId?.includes(filter))

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-7">
          <div>
            <h1 className="page-title">All Users</h1>
            <p className="text-muted text-sm mt-1">{users.length} users across all companies</p>
          </div>
        </div>
        <div className="mb-4">
          <input className="input" style={{maxWidth:320}} placeholder="🔍 Filter by email, name, or company..." value={filter} onChange={e=>setFilter(e.target.value)}/>
        </div>
        <div className="card" style={{padding:0}}>
          <div className="table-wrap" style={{border:'none',borderRadius:0}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>
                <th className="th">User</th><th className="th">Role</th>
                <th className="th">Company ID</th><th className="th">Status</th>
              </tr></thead>
              <tbody>
                {filtered.map((u:any)=>(
                  <tr key={u.id}>
                    <td className="td">
                      <div style={{fontWeight:600}}>{u.name}</div>
                      <div style={{fontSize:11,color:'var(--muted)'}}>{u.email}</div>
                    </td>
                    <td className="td">
                      <span className={`badge ${(ROLE_COLORS as any)[u.role]||'badge-muted'}`}>
                        {(ROLE_LABELS as any)[u.role]||u.role}
                      </span>
                    </td>
                    <td className="td td-mono text-muted" style={{fontSize:11}}>{u.companyId?.slice(0,16)}...</td>
                    <td className="td">
                      <span className={`badge ${u.isActive?'badge-green':'badge-red'}`}>{u.isActive?'Active':'Blocked'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  )
}
