import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import Link from 'next/link'
import { fmtDate, downloadBlob } from '@/lib/utils'

export default function Employees() {
  const { user, profile, loading } = useAuth()
  const { companyId } = usePlan()
  const router = useRouter()
  const [employees, setEmployees] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [busy, setBusy] = useState(true)

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])
  useEffect(() => {
    if (!companyId) return
    getDocs(query(collection(db,'companies',companyId,'employees'), orderBy('name')))
      .then(snap => { setEmployees(snap.docs.map(d=>({id:d.id,...d.data()}))); setBusy(false) })
      .catch(() => setBusy(false))
  }, [companyId])

  const filtered = employees.filter(e => {
    const matchSearch = !search || e.name?.toLowerCase().includes(search.toLowerCase()) || e.email?.toLowerCase().includes(search.toLowerCase()) || e.employeeId?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || e.status === filterStatus || (!e.status && filterStatus === 'active')
    return matchSearch && matchStatus
  })

  function exportCSV() {
    const rows = [['ID','Name','Email','Department','Designation','Joining Date','Status']]
    filtered.forEach(e => rows.push([e.employeeId||'',e.name||'',e.email||'',e.department||'',e.designation||'',e.joiningDate||'',(e.status||'active')]))
    downloadBlob(rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n'), 'employees.csv')
  }

  if (loading || busy) return <Layout title="Employees"><div style={{ display:'flex', justifyContent:'center', padding:64 }}><div className="spinner-lg"/></div></Layout>

  return (
    <Layout title="Employees">
      <div style={{ maxWidth:1100 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 className="page-title">Employees</h1>
            <p className="page-subtitle">{employees.length} total · {employees.filter(e=>e.status!=='exited'&&e.status!=='terminated').length} active</p>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={exportCSV} className="btn btn-secondary btn-sm">↓ Export CSV</button>
            <Link href="/employees/new" className="btn btn-primary btn-sm">+ Add Employee</Link>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
          <input className="input" style={{ maxWidth:280 }} placeholder="Search name, email, ID..." value={search} onChange={e=>setSearch(e.target.value)}/>
          <select className="input" style={{ maxWidth:160 }} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="exited">Exited</option>
            <option value="terminated">Terminated</option>
          </select>
        </div>

        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>ID</th><th>Name</th><th>Email</th><th>Department</th>
                <th>Designation</th><th>Joining Date</th><th>Status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign:'center', padding:32, color:'var(--text3)' }}>
                  {employees.length === 0 ? 'No employees yet. ' : 'No matching employees. '}
                  <Link href="/employees/new" style={{ color:'var(--accent)' }}>Add one →</Link>
                </td></tr>
              ) : filtered.map(e => (
                <tr key={e.id} style={{ cursor:'pointer' }} onClick={()=>router.push(`/employees/${e.id}`)}>
                  <td style={{ fontFamily:'monospace', fontSize:12 }}>{e.employeeId||'—'}</td>
                  <td style={{ fontWeight:600 }}>{e.name}</td>
                  <td style={{ fontSize:12, color:'var(--text2)' }}>{e.email}</td>
                  <td>{e.department||'—'}</td>
                  <td>{e.designation||'—'}</td>
                  <td>{fmtDate(e.joiningDate)}</td>
                  <td>
                    <span className={`badge ${e.status==='exited'||e.status==='terminated'?'badge-red':'badge-green'}`}>
                      {e.status||'active'}
                    </span>
                  </td>
                  <td onClick={ev=>ev.stopPropagation()}>
                    <Link href={`/employees/${e.id}`} className="btn btn-ghost btn-xs">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  )
}
