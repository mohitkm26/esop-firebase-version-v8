import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, doc, updateDoc, orderBy, query } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import Layout from '@/components/layout/Layout'
import { fmtDate, fmtN } from '@/lib/utils'
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
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!loading && (!user || !isSuperAdmin(profile?.role))) router.push('/dashboard')
  }, [user, profile, loading])

  useEffect(() => {
    if (!user || !isSuperAdmin(profile?.role)) return
    getDocs(query(collection(db,'companies'), orderBy('createdAt','desc')))
      .then(snap => { setCompanies(snap.docs.map(d=>({id:d.id,...d.data()}))); setBusy(false) })
      .catch(() => setBusy(false))
  }, [user, profile])

  async function savePlan(companyId: string) {
    await updateDoc(doc(db,'companies',companyId), { plan: editPlan, updatedAt: new Date().toISOString() })
    setCompanies(prev => prev.map(c => c.id === companyId ? {...c, plan: editPlan} : c))
    setEditing(null)
  }

  const filtered = companies.filter(c => {
    const name = (c.companyName || c.name || '').toLowerCase()
    const email = (c.contactEmail || '').toLowerCase()
    return !search || name.includes(search.toLowerCase()) || email.includes(search.toLowerCase())
  })

  if (loading || busy) return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div className="spinner-lg"/>
    </div>
  )
  if (!isSuperAdmin(profile?.role)) return null

  return (
    <Layout title="All Companies">
      <div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
          <div>
            <h1 className="page-title">All Companies</h1>
            <p className="page-subtitle">{companies.length} companies registered on the platform</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <Link href="/admin" className="btn btn-ghost btn-sm">← Dashboard</Link>
            <Link href="/admin/users" className="btn btn-ghost btn-sm">Users</Link>
            <Link href="/admin/support" className="btn btn-ghost btn-sm">Support</Link>
          </div>
        </div>

        {/* Stats row */}
        <div className="stats-grid mb-4">
          <div className="stat-card">
            <div className="stat-val">{companies.length}</div>
            <div className="stat-label">Total Companies</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{companies.filter(c=>c.plan==='advanced').length}</div>
            <div className="stat-label">Advanced Plan</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{companies.filter(c=>c.plan==='pro').length}</div>
            <div className="stat-label">Pro Plan</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{companies.filter(c=>c.plan==='basic'||!c.plan).length}</div>
            <div className="stat-label">Basic (Free)</div>
          </div>
        </div>

        {/* Search */}
        <div className="card mb-4" style={{ padding:'12px 16px' }}>
          <input
            className="input"
            placeholder="Search by company name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 400 }}
          />
        </div>

        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Company</th>
                <th>Plan</th>
                <th>Contact</th>
                <th>Created</th>
                <th>Onboarded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: any) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      {c.logoUrl
                        ? <img src={c.logoUrl} style={{ width:28, height:28, borderRadius:6, objectFit:'cover', border:'1px solid var(--border)' }} alt=""/>
                        : <div style={{ width:28, height:28, borderRadius:6, background:'linear-gradient(135deg,var(--accent),var(--accent2))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#fff' }}>
                            {(c.companyName||c.name||'?')[0].toUpperCase()}
                          </div>
                      }
                      <div>
                        <div style={{ fontWeight:600, fontSize:13 }}>{c.companyName || c.name || '—'}</div>
                        <div style={{ fontSize:11, color:'var(--text3)', fontFamily:'monospace' }}>{c.id.slice(0,12)}...</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {editing === c.id ? (
                      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                        <select
                          className="input"
                          style={{ width:110, padding:'4px 8px', fontSize:12 }}
                          value={editPlan}
                          onChange={e => setEditPlan(e.target.value)}
                        >
                          {PLAN_OPTIONS.map(p => <option key={p}>{p}</option>)}
                        </select>
                        <button onClick={() => savePlan(c.id)} className="btn btn-success btn-xs">✓</button>
                        <button onClick={() => setEditing(null)} className="btn btn-ghost btn-xs">✕</button>
                      </div>
                    ) : (
                      <span className={`badge ${c.plan==='advanced'?'badge-amber':c.plan==='pro'?'badge-blue':'badge-muted'}`}>
                        {c.plan || 'basic'}
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ fontSize:12 }}>{c.contactEmail || '—'}</div>
                    {c.contactPhone && <div style={{ fontSize:11, color:'var(--text3)' }}>{c.contactPhone}</div>}
                  </td>
                  <td style={{ fontSize:12, color:'var(--text3)' }}>{fmtDate(c.createdAt)}</td>
                  <td>
                    <span className={`badge ${c.onboarded ? 'badge-green' : 'badge-muted'}`}>
                      {c.onboarded ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => { setEditing(c.id); setEditPlan(c.plan || 'basic') }}
                      className="btn btn-ghost btn-xs"
                    >
                      Edit Plan
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign:'center', padding:40, color:'var(--text3)' }}>
                    {search ? 'No companies match your search.' : 'No companies found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  )
}
