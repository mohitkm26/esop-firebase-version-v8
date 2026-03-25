import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, addDoc, query, orderBy, doc, updateDoc } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import { fmtDate } from '@/lib/utils'

const TICKET_TYPES = ['Billing','Technical','Grant Letter','Data Issue','Feature Request','Other']
const STATUS_COLORS: Record<string,string> = {
  open:'badge-blue', in_progress:'badge-amber', resolved:'badge-green', closed:'badge-muted'
}

export default function SupportPage() {
  const { user, profile, loading } = useAuth()
  const { companyId } = usePlan()
  const router = useRouter()
  const [tickets, setTickets] = useState<any[]>([])
  const [busy,    setBusy]    = useState(true)
  const [show,    setShow]    = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [form, setForm] = useState({ type:'Technical', subject:'', description:'' })

  useEffect(() => { if (!loading && !user) router.push('/login') }, [user, loading])
  useEffect(() => {
    if (!companyId) return
    getDocs(query(collection(db,'companies',companyId,'tickets'), orderBy('createdAt','desc')))
      .then(snap => { setTickets(snap.docs.map(d=>({id:d.id,...d.data()}))); setBusy(false) })
  }, [companyId])

  async function submit() {
    if (!form.subject || !form.description) { alert('Subject and description are required'); return }
    setSaving(true)
    const now = new Date().toISOString()
    const ticketRef = await addDoc(collection(db,'companies',companyId,'tickets'), {
      ...form, status:'open', companyId, createdBy: user!.uid,
      createdByEmail: profile?.email, createdAt: now, updatedAt: now,
    })
    setTickets(t=>[{ id:ticketRef.id, ...form, status:'open', createdAt:now },...t])
    setForm({ type:'Technical', subject:'', description:'' })
    setShow(false); setSaving(false)
  }

  if (loading || busy) return <div style={{minHeight:'100vh',background:'var(--bg)',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner-lg"/></div>

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-start justify-between mb-7">
          <div>
            <h1 className="page-title">Support</h1>
            <p className="text-muted text-sm mt-1">Create and track support tickets</p>
          </div>
          <button onClick={()=>setShow(true)} className="btn btn-primary">+ New Ticket</button>
        </div>

        {show && (
          <div className="card mb-6">
            <h2 className="section-title mb-4">New Support Ticket</h2>
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <div>
                <label className="label">Type</label>
                <select className="input" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                  {TICKET_TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="label">Subject *</label><input className="input" value={form.subject} onChange={e=>setForm(f=>({...f,subject:e.target.value}))}/></div>
              <div><label className="label">Description *</label><textarea className="input" rows={4} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></div>
              <div style={{display:'flex',gap:10}}>
                <button onClick={submit} disabled={saving} className="btn btn-primary">{saving?'⏳ Submitting...':'Submit Ticket'}</button>
                <button onClick={()=>setShow(false)} className="btn btn-ghost">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {tickets.length === 0 && !show && (
          <div className="card text-center" style={{padding:'64px 24px'}}>
            <div style={{fontSize:48,marginBottom:12}}>🎫</div>
            <h2 style={{fontWeight:700,marginBottom:8}}>No support tickets</h2>
            <p className="text-muted" style={{fontSize:13,marginBottom:20}}>Create a ticket if you need help with anything.</p>
            <button onClick={()=>setShow(true)} className="btn btn-primary">Create your first ticket</button>
          </div>
        )}

        {tickets.length > 0 && (
          <div className="card" style={{padding:0}}>
            <div className="table-wrap" style={{border:'none',borderRadius:0}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr>
                  <th className="th">Subject</th><th className="th">Type</th>
                  <th className="th">Status</th><th className="th">Created</th>
                </tr></thead>
                <tbody>
                  {tickets.map((t:any)=>(
                    <tr key={t.id}>
                      <td className="td" style={{fontWeight:600}}>{t.subject}</td>
                      <td className="td"><span className="badge badge-muted">{t.type}</span></td>
                      <td className="td"><span className={`badge ${STATUS_COLORS[t.status]||'badge-muted'}`}>{t.status?.replace('_',' ')}</span></td>
                      <td className="td td-mono text-muted">{fmtDate(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
