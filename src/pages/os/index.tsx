import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import {
  collection, getDocs, query, orderBy, doc, updateDoc, setDoc,
  addDoc, getDoc, serverTimestamp, where
} from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import Layout from '@/components/layout/Layout'
import { fmtDate, fmtN, fmtC } from '@/lib/utils'
import { isSuperAdmin } from '@/lib/roles'
import Link from 'next/link'

type OSTab = 'dashboard' | 'companies' | 'plans' | 'cohorts' | 'tickets' | 'invoices' | 'team' | 'blogs' | 'cms'

export default function OSPanel() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<OSTab>('dashboard')
  const [companies, setCompanies] = useState<any[]>([])
  const [plans, setPlans] = useState<any[]>([])
  const [cohorts, setCohorts] = useState<any[]>([])
  const [tickets, setTickets] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [team, setTeam] = useState<any[]>([])
  const [blogs, setBlogs] = useState<any[]>([])
  const [busy, setBusy] = useState(true)
  const [stats, setStats] = useState({ companies: 0, mrr: 0, openTickets: 0, activeUsers: 0 })

  // Edit states
  const [editingCompany, setEditingCompany] = useState<any>(null)
  const [editingPlan, setEditingPlan] = useState<any>(null)
  const [newPlan, setNewPlan] = useState({ name: '', price: '', billingCycle: 'monthly', features: '', effectiveDate: '', endDate: '' })
  const [editingBlog, setEditingBlog] = useState<any>(null)
  const [newBlog, setNewBlog] = useState({ title: '', tag: '', body: '', published: false })
  const [ticketReply, setTicketReply] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [ok, setOk] = useState('')

  useEffect(() => {
    if (!loading && (!user || !isSuperAdmin(profile?.role))) router.push('/dashboard')
  }, [user, profile, loading])

  useEffect(() => {
    if (!user || !isSuperAdmin(profile?.role)) return
    async function loadAll() {
      const [compSnap, planSnap, cohortSnap, invoiceSnap, teamSnap, blogSnap] = await Promise.all([
        getDocs(query(collection(db, 'companies'), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'platform_plans')),
        getDocs(collection(db, 'platform_cohorts')),
        getDocs(query(collection(db, 'platform_invoices'), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'os_team')),
        getDocs(query(collection(db, 'blog_posts'), orderBy('createdAt', 'desc'))),
      ])
      const comps = compSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setCompanies(comps)
      setPlans(planSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setCohorts(cohortSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setInvoices(invoiceSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setTeam(teamSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setBlogs(blogSnap.docs.map(d => ({ id: d.id, ...d.data() })))

      // Load all tickets across companies
      const allTickets: any[] = []
      for (const c of compSnap.docs) {
        const tSnap = await getDocs(query(collection(db, 'companies', c.id, 'tickets'), orderBy('createdAt', 'desc')))
        tSnap.docs.forEach(t => allTickets.push({ id: t.id, companyId: c.id, companyName: c.data().name || c.data().companyName || c.id, ...t.data() }))
      }
      allTickets.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      setTickets(allTickets)

      const mrr = comps.filter(c => c.plan === 'advanced').length * 5000 + comps.filter(c => c.plan === 'pro').length * 2000
      setStats({ companies: comps.length, mrr, openTickets: allTickets.filter(t => t.status === 'open').length, activeUsers: 0 })
      setBusy(false)
    }
    loadAll()
  }, [user, profile])

  function done(msg = 'Saved.') { setOk(msg); setTimeout(() => setOk(''), 3000); setSaving(false) }

  async function saveCompany() {
    if (!editingCompany?.id) return
    setSaving(true)
    const { id, ...data } = editingCompany
    await updateDoc(doc(db, 'companies', id), { ...data, updatedAt: new Date().toISOString() })
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, ...data } : c))
    setEditingCompany(null); done()
  }

  async function savePlan() {
    setSaving(true)
    const planData = {
      name: newPlan.name, price: parseFloat(newPlan.price) || 0, billingCycle: newPlan.billingCycle,
      features: newPlan.features.split('\n').filter(Boolean),
      effectiveDate: newPlan.effectiveDate || null, endDate: newPlan.endDate || null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }
    if (editingPlan?.id) {
      await updateDoc(doc(db, 'platform_plans', editingPlan.id), planData)
      setPlans(prev => prev.map(p => p.id === editingPlan.id ? { id: editingPlan.id, ...planData } : p))
    } else {
      const ref = await addDoc(collection(db, 'platform_plans'), planData)
      setPlans(prev => [...prev, { id: ref.id, ...planData }])
    }
    setEditingPlan(null); setNewPlan({ name: '', price: '', billingCycle: 'monthly', features: '', effectiveDate: '', endDate: '' }); done()
  }

  async function replyTicket(ticket: any) {
    const reply = ticketReply[ticket.id]
    if (!reply?.trim()) return
    setSaving(true)
    const replies = ticket.replies || []
    replies.push({ from: 'support', message: reply, at: new Date().toISOString() })
    await updateDoc(doc(db, 'companies', ticket.companyId, 'tickets', ticket.id), { replies, status: 'in_progress', updatedAt: new Date().toISOString() })
    setTickets(prev => prev.map(t => t.id === ticket.id && t.companyId === ticket.companyId ? { ...t, replies, status: 'in_progress' } : t))
    setTicketReply(r => ({ ...r, [ticket.id]: '' })); done('Reply sent.')
  }

  async function saveBlog() {
    setSaving(true)
    const blogData = { ...newBlog, createdAt: editingBlog?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), authorId: user!.uid }
    if (editingBlog?.id) {
      await updateDoc(doc(db, 'blog_posts', editingBlog.id), blogData)
      setBlogs(prev => prev.map(b => b.id === editingBlog.id ? { id: editingBlog.id, ...blogData } : b))
    } else {
      const ref = await addDoc(collection(db, 'blog_posts'), blogData)
      setBlogs(prev => [{ id: ref.id, ...blogData }, ...prev])
    }
    setEditingBlog(null); setNewBlog({ title: '', tag: '', body: '', published: false }); done()
  }

  async function generateInvoice(companyId: string, companyName: string) {
    const num = `INV-${Date.now().toString().slice(-6)}`
    const comp = companies.find(c => c.id === companyId)
    await addDoc(collection(db, 'platform_invoices'), {
      companyId, companyName, invoiceNumber: num, amount: comp?.plan === 'advanced' ? 5000 : 2000,
      status: 'unpaid', period: new Date().toISOString().slice(0, 7),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })
    done(`Invoice ${num} generated.`)
  }

  if (loading || busy) return <Layout title="OS Panel"><div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><div className="spinner-lg" /></div></Layout>
  if (!isSuperAdmin(profile?.role)) return null

  const TABS: { id: OSTab; label: string; count?: number }[] = [
    { id: 'dashboard', label: '⊟ Dashboard' },
    { id: 'companies', label: '⊞ Companies', count: companies.length },
    { id: 'plans', label: '◆ Plans', count: plans.length },
    { id: 'cohorts', label: '⊡ Cohorts' },
    { id: 'tickets', label: '⎈ Tickets', count: tickets.filter(t => t.status === 'open').length },
    { id: 'invoices', label: '$ Invoices' },
    { id: 'team', label: '⊗ My Team' },
    { id: 'blogs', label: '✎ Blogs' },
    { id: 'cms', label: '🖥 CMS' },
  ]

  return (
    <Layout title="OS Panel">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 className="page-title">⬡ Operating System</h1>
            <p className="page-subtitle">Platform management — all tenants, plans, and operations</p>
          </div>
          {ok && <div className="alert alert-success">{ok}</div>}
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 24, overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '9px 16px', border: 'none', borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? 'var(--accent)' : 'var(--text2)', whiteSpace: 'nowrap', marginBottom: -1 }}>
              {t.label}{t.count !== undefined && t.count > 0 ? <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--accent)', color: '#fff', padding: '1px 5px', borderRadius: 9 }}>{t.count}</span> : null}
            </button>
          ))}
        </div>

        {/* ── Dashboard ── */}
        {tab === 'dashboard' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Total Companies', val: fmtN(stats.companies), color: 'var(--accent)' },
                { label: 'Est. MRR', val: fmtC(stats.mrr), color: '#2d7a4f' },
                { label: 'Open Tickets', val: String(stats.openTickets), color: stats.openTickets > 0 ? 'var(--danger)' : 'var(--text)' },
                { label: 'Plans Defined', val: String(plans.length), color: 'var(--text)' },
              ].map(s => (
                <div key={s.label} className="stat-card">
                  <div className="stat-val" style={{ color: s.color }}>{s.val}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="card">
                <h3 className="section-title mb-3">Companies by Plan</h3>
                {['advanced', 'pro', 'basic'].map(p => (
                  <div key={p} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ textTransform: 'capitalize' }}>{p}</span>
                    <strong>{companies.filter(c => (c.plan || 'basic') === p).length}</strong>
                  </div>
                ))}
              </div>
              <div className="card">
                <h3 className="section-title mb-3">Recent Tickets</h3>
                {tickets.slice(0, 5).map(t => (
                  <div key={t.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <div style={{ fontWeight: 600 }}>{t.subject}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{t.companyName} · {t.status}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Companies ── */}
        {tab === 'companies' && (
          <div>
            {editingCompany && (
              <div className="card mb-4" style={{ border: '1px solid var(--accent)', background: 'rgba(45,95,168,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3 className="section-title">Edit Company: {editingCompany.name || editingCompany.companyName}</h3>
                  <button onClick={() => setEditingCompany(null)} className="btn btn-ghost btn-sm">✕</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><label className="label">Company Name</label><input className="input" value={editingCompany.name || ''} onChange={e => setEditingCompany((c: any) => ({ ...c, name: e.target.value, companyName: e.target.value }))} /></div>
                  <div><label className="label">Plan</label>
                    <select className="input" value={editingCompany.plan || 'basic'} onChange={e => setEditingCompany((c: any) => ({ ...c, plan: e.target.value }))}>
                      {['basic', 'pro', 'advanced', ...plans.map(p => p.name)].filter((v, i, a) => a.indexOf(v) === i).map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div><label className="label">Contact Email</label><input className="input" value={editingCompany.contactEmail || ''} onChange={e => setEditingCompany((c: any) => ({ ...c, contactEmail: e.target.value }))} /></div>
                  <div><label className="label">Custom Domain</label><input className="input" value={editingCompany.customDomain || ''} onChange={e => setEditingCompany((c: any) => ({ ...c, customDomain: e.target.value }))} placeholder="esop.acmecorp.com" /></div>
                  <div><label className="label">Default From Email</label><input className="input" value={editingCompany.defaultFromEmail || ''} onChange={e => setEditingCompany((c: any) => ({ ...c, defaultFromEmail: e.target.value }))} placeholder="esop@acmecorp.com" /></div>
                  <div><label className="label">Cohort</label>
                    <select className="input" value={editingCompany.cohortId || ''} onChange={e => setEditingCompany((c: any) => ({ ...c, cohortId: e.target.value }))}>
                      <option value="">No cohort</option>
                      {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div><label className="label">Plan Effective Date</label><input type="date" className="input" value={editingCompany.planEffectiveDate || ''} onChange={e => setEditingCompany((c: any) => ({ ...c, planEffectiveDate: e.target.value }))} /></div>
                  <div><label className="label">Plan End Date</label><input type="date" className="input" value={editingCompany.planExpiry || ''} onChange={e => setEditingCompany((c: any) => ({ ...c, planExpiry: e.target.value }))} /></div>
                </div>
                <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                  <button onClick={saveCompany} disabled={saving} className="btn btn-primary btn-sm">{saving ? '⏳...' : '💾 Save Changes'}</button>
                  <button onClick={() => generateInvoice(editingCompany.id, editingCompany.name)} className="btn btn-ghost btn-sm">$ Generate Invoice</button>
                  <a href={`/admin/companies/${editingCompany.id}`} className="btn btn-ghost btn-sm" target="_blank">↗ View as Admin</a>
                </div>
              </div>
            )}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="tbl">
                <thead><tr><th>Company</th><th>Plan</th><th>Cohort</th><th>Domain</th><th>Created</th><th>Actions</th></tr></thead>
                <tbody>
                  {companies.map((c: any) => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.name || c.companyName || '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.contactEmail || c.id.slice(0, 12)}</div>
                      </td>
                      <td><span className={`badge ${c.plan === 'advanced' ? 'badge-amber' : c.plan === 'pro' ? 'badge-blue' : 'badge-muted'}`}>{c.plan || 'basic'}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text3)' }}>{cohorts.find(h => h.id === c.cohortId)?.name || '—'}</td>
                      <td style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text3)' }}>{c.customDomain || '—'}</td>
                      <td style={{ fontSize: 12 }}>{fmtDate(c.createdAt)}</td>
                      <td>
                        <button onClick={() => setEditingCompany({ ...c })} className="btn btn-ghost btn-xs">Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Plans ── */}
        {tab === 'plans' && (
          <div>
            <div className="card mb-4">
              <h3 className="section-title mb-4">{editingPlan ? 'Edit Plan' : 'Create New Plan'}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label className="label">Plan Name *</label><input className="input" value={newPlan.name} onChange={e => setNewPlan(p => ({ ...p, name: e.target.value }))} placeholder="Pro, Enterprise..." /></div>
                <div><label className="label">Price (₹/month)</label><input type="number" className="input" value={newPlan.price} onChange={e => setNewPlan(p => ({ ...p, price: e.target.value }))} /></div>
                <div><label className="label">Billing Cycle</label>
                  <select className="input" value={newPlan.billingCycle} onChange={e => setNewPlan(p => ({ ...p, billingCycle: e.target.value }))}>
                    <option value="monthly">Monthly</option><option value="annual">Annual</option>
                  </select>
                </div>
                <div><label className="label">Effective Date</label><input type="date" className="input" value={newPlan.effectiveDate} onChange={e => setNewPlan(p => ({ ...p, effectiveDate: e.target.value }))} /></div>
                <div><label className="label">End Date (blank = no expiry)</label><input type="date" className="input" value={newPlan.endDate} onChange={e => setNewPlan(p => ({ ...p, endDate: e.target.value }))} /></div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label className="label">Features (one per line)</label>
                <textarea className="input" rows={6} value={newPlan.features} onChange={e => setNewPlan(p => ({ ...p, features: e.target.value }))} placeholder="Unlimited grants&#10;Employee portal&#10;Reports&#10;Audit logs&#10;Custom email templates" />
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
                <button onClick={savePlan} disabled={saving || !newPlan.name} className="btn btn-primary btn-sm">{saving ? '⏳...' : editingPlan ? '💾 Update Plan' : '+ Create Plan'}</button>
                {editingPlan && <button onClick={() => { setEditingPlan(null); setNewPlan({ name: '', price: '', billingCycle: 'monthly', features: '', effectiveDate: '', endDate: '' }) }} className="btn btn-ghost btn-sm">Cancel</button>}
              </div>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="tbl">
                <thead><tr><th>Plan</th><th>Price</th><th>Cycle</th><th>Effective</th><th>Ends</th><th>Features</th><th>Actions</th></tr></thead>
                <tbody>
                  {plans.map((p: any) => (
                    <tr key={p.id}>
                      <td><strong>{p.name}</strong></td>
                      <td>{fmtC(p.price || 0)}</td>
                      <td><span className="badge badge-muted">{p.billingCycle}</span></td>
                      <td style={{ fontSize: 12 }}>{fmtDate(p.effectiveDate) || '—'}</td>
                      <td style={{ fontSize: 12 }}>{fmtDate(p.endDate) || 'No expiry'}</td>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{Array.isArray(p.features) ? `${p.features.length} features` : '—'}</td>
                      <td><button onClick={() => { setEditingPlan(p); setNewPlan({ name: p.name, price: String(p.price || ''), billingCycle: p.billingCycle || 'monthly', features: (p.features || []).join('\n'), effectiveDate: p.effectiveDate || '', endDate: p.endDate || '' }) }} className="btn btn-ghost btn-xs">Edit</button></td>
                    </tr>
                  ))}
                  {plans.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text3)' }}>No plans defined yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Tickets ── */}
        {tab === 'tickets' && (
          <div>
            {tickets.map((t: any) => (
              <div key={`${t.companyId}-${t.id}`} className="card mb-3">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{t.subject}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t.companyName} · {fmtDate(t.createdAt)} · <span className={`badge ${t.status === 'open' ? 'badge-blue' : t.status === 'resolved' ? 'badge-green' : 'badge-muted'}`}>{t.status}</span></div>
                  </div>
                  <select className="input" style={{ width: 140, fontSize: 12 }} value={t.status}
                    onChange={async e => {
                      await updateDoc(doc(db, 'companies', t.companyId, 'tickets', t.id), { status: e.target.value, updatedAt: new Date().toISOString() })
                      setTickets(prev => prev.map(x => x.id === t.id && x.companyId === t.companyId ? { ...x, status: e.target.value } : x))
                    }}>
                    {['open', 'in_progress', 'resolved', 'closed'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>{t.description}</p>
                {/* Replies thread */}
                {(t.replies || []).map((r: any, i: number) => (
                  <div key={i} style={{ background: r.from === 'support' ? 'rgba(45,95,168,0.06)' : 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', marginBottom: 8, fontSize: 13 }}>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{r.from === 'support' ? '🛠 Support' : '👤 Customer'} · {fmtDate(r.at)}</div>
                    {r.message}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input className="input" style={{ flex: 1 }} placeholder="Reply to this ticket..." value={ticketReply[t.id] || ''} onChange={e => setTicketReply(r => ({ ...r, [t.id]: e.target.value }))} />
                  <button onClick={() => replyTicket(t)} disabled={saving} className="btn btn-primary btn-sm">↗ Reply</button>
                </div>
              </div>
            ))}
            {tickets.length === 0 && <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)' }}>No tickets yet</div>}
          </div>
        )}

        {/* ── Invoices ── */}
        {tab === 'invoices' && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="tbl">
              <thead><tr><th>Invoice #</th><th>Company</th><th>Amount</th><th>Period</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>
                {invoices.map((inv: any) => (
                  <tr key={inv.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{inv.invoiceNumber}</td>
                    <td>{inv.companyName || inv.companyId?.slice(0, 10)}</td>
                    <td>{fmtC(inv.amount || 0)}</td>
                    <td style={{ fontSize: 12 }}>{inv.period || '—'}</td>
                    <td><span className={`badge ${inv.status === 'paid' ? 'badge-green' : inv.status === 'overdue' ? 'badge-red' : 'badge-amber'}`}>{inv.status}</span></td>
                    <td style={{ fontSize: 12 }}>{fmtDate(inv.createdAt)}</td>
                    <td>
                      <button onClick={async () => { await updateDoc(doc(db, 'platform_invoices', inv.id), { status: 'paid', paidAt: new Date().toISOString() }); setInvoices(p => p.map(i => i.id === inv.id ? { ...i, status: 'paid' } : i)) }} disabled={inv.status === 'paid'} className="btn btn-ghost btn-xs">Mark Paid</button>
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text3)' }}>No invoices yet</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Blogs ── */}
        {tab === 'blogs' && (
          <div>
            <div className="card mb-4">
              <h3 className="section-title mb-4">{editingBlog ? `Editing: ${editingBlog.title}` : 'Create New Blog Post'}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div><label className="label">Title</label><input className="input" value={newBlog.title} onChange={e => setNewBlog(b => ({ ...b, title: e.target.value }))} /></div>
                <div><label className="label">Tag / Category</label><input className="input" value={newBlog.tag} onChange={e => setNewBlog(b => ({ ...b, tag: e.target.value }))} placeholder="ESOP, Legal, Market..." /></div>
                <div><label className="label">Content (Markdown supported)</label><textarea className="input" rows={12} value={newBlog.body} onChange={e => setNewBlog(b => ({ ...b, body: e.target.value }))} style={{ fontFamily: 'monospace', fontSize: 13 }} /></div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={newBlog.published} onChange={e => setNewBlog(b => ({ ...b, published: e.target.checked }))} />
                  Published (visible on website)
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={saveBlog} disabled={saving || !newBlog.title} className="btn btn-primary btn-sm">{saving ? '⏳...' : editingBlog ? '💾 Update Post' : '+ Publish Post'}</button>
                  {editingBlog && <button onClick={() => { setEditingBlog(null); setNewBlog({ title: '', tag: '', body: '', published: false }) }} className="btn btn-ghost btn-sm">Cancel</button>}
                </div>
              </div>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="tbl">
                <thead><tr><th>Title</th><th>Tag</th><th>Published</th><th>Created</th><th>Actions</th></tr></thead>
                <tbody>
                  {blogs.map((b: any) => (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>{b.title}</td>
                      <td><span className="badge badge-muted">{b.tag}</span></td>
                      <td><span className={`badge ${b.published ? 'badge-green' : 'badge-muted'}`}>{b.published ? 'Live' : 'Draft'}</span></td>
                      <td style={{ fontSize: 12 }}>{fmtDate(b.createdAt)}</td>
                      <td><button onClick={() => { setEditingBlog(b); setNewBlog({ title: b.title, tag: b.tag || '', body: b.body || '', published: !!b.published }) }} className="btn btn-ghost btn-xs">Edit</button></td>
                    </tr>
                  ))}
                  {blogs.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--text3)' }}>No blog posts yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'cms' && (
          <div className="card">
            <h3 className="section-title mb-4">CMS / Website Content</h3>
            <p style={{ color: 'var(--text2)', fontSize: 13 }}>Manage website pages, pricing sections, and static content. Each key maps to a section of the marketing website.</p>
            <div style={{ marginTop: 16, color: 'var(--text3)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 8, padding: 24, textAlign: 'center' }}>
              CMS editor — connect to <code>cms_content</code> Firestore collection. Each document key is a page/section identifier (e.g. <code>home_hero</code>, <code>pricing_section</code>, <code>about_page</code>).
            </div>
          </div>
        )}

        {tab === 'cohorts' && (
          <div>
            <div className="card mb-4">
              <h3 className="section-title mb-4">Manage Cohorts</h3>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>Cohorts group companies for batch pricing and plan overrides.</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <input className="input" style={{ flex: 1, maxWidth: 280 }} placeholder="New cohort name..." id="cohort-name" />
                <button onClick={async () => {
                  const name = (document.getElementById('cohort-name') as HTMLInputElement)?.value
                  if (!name) return
                  const ref = await addDoc(collection(db, 'platform_cohorts'), { name, createdAt: new Date().toISOString() })
                  setCohorts(c => [...c, { id: ref.id, name }])
                }} className="btn btn-primary btn-sm">+ Add Cohort</button>
              </div>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="tbl">
                <thead><tr><th>Cohort Name</th><th>Companies</th></tr></thead>
                <tbody>
                  {cohorts.map((c: any) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td>{companies.filter(co => co.cohortId === c.id).length}</td>
                    </tr>
                  ))}
                  {cohorts.length === 0 && <tr><td colSpan={2} style={{ textAlign: 'center', padding: 32, color: 'var(--text3)' }}>No cohorts defined</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'team' && (
          <div className="card">
            <h3 className="section-title mb-4">OS Team Members</h3>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>All users with <code>superAdmin</code> role have access to the OS Panel. Manage additional team roles here.</p>
            {team.map((m: any) => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <div><div style={{ fontWeight: 600 }}>{m.name || m.email}</div><div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.role}</div></div>
              </div>
            ))}
            {team.length === 0 && <div style={{ color: 'var(--text3)', textAlign: 'center', padding: 24 }}>Invite team members via Users page with superAdmin role</div>}
          </div>
        )}
      </div>
    </Layout>
  )
}
