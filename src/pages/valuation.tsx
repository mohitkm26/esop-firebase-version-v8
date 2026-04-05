import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db, storage } from '@/lib/firebase'
import { collection, getDocs, addDoc, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import { fmtDate, fmtC, today } from '@/lib/utils'
import { logAudit } from '@/lib/audit'

export default function Valuation() {
  const { user, profile, loading } = useAuth()
  const { companyId, can } = usePlan()
  const router = useRouter()
  const [valuations, setValuations] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(true)
  const [reportFile, setReportFile] = useState<File|null>(null)
  const [form, setForm] = useState({
    valuationDate: today(), fairMarketValue: '', method: '409A', valuationBy: '', notes: '', reportUrl: ''
  })

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])
  useEffect(() => {
    if (!companyId) return
    getDocs(query(collection(db,'companies',companyId,'valuations'), orderBy('valuationDate','desc')))
      .then(s => { setValuations(s.docs.map(d=>({id:d.id,...d.data()}))); setBusy(false) })
  }, [companyId])

  async function save() {
    if (!form.valuationDate || !form.fairMarketValue) { alert('Date and FMV required'); return }
    setSaving(true)
    let reportUrl = form.reportUrl
    if (reportFile) {
      setUploading(true)
      const storageRef = ref(storage, `companies/${companyId}/valuations/${Date.now()}-${reportFile.name}`)
      await uploadBytes(storageRef, reportFile)
      reportUrl = await getDownloadURL(storageRef)
      setUploading(false)
    }
    const docRef = await addDoc(collection(db,'companies',companyId,'valuations'), {
      ...form, fairMarketValue: parseFloat(form.fairMarketValue),
      reportUrl: reportUrl || null,
      companyId, createdAt: serverTimestamp(), createdBy: user!.uid
    })
    await logAudit({ companyId, userId:user!.uid, userEmail:profile?.email||'', action:'valuation_updated', entityType:'valuation', entityId:docRef.id, entityLabel:`FMV ${form.fairMarketValue} on ${form.valuationDate}`, after:form })
    setValuations(v => [{ id:docRef.id, ...form, fairMarketValue:parseFloat(form.fairMarketValue), reportUrl }, ...v])
    setShowForm(false)
    setForm({ valuationDate:today(), fairMarketValue:'', method:'409A', valuationBy:'', notes:'', reportUrl:'' })
    setReportFile(null)
    setSaving(false)
  }

  if (loading||busy) return <Layout title="Valuations"><div style={{ display:'flex', justifyContent:'center', padding:64 }}><div className="spinner-lg"/></div></Layout>
  if (!can('valuation')) return <Layout title="Valuations"><div className="alert alert-warning">Pro plan required.</div></Layout>

  return (
    <Layout title="Valuations">
      <div style={{ maxWidth:800 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
          <div><h1 className="page-title">Valuations</h1><p className="page-subtitle">Fair market value history for your company shares</p></div>
          <button onClick={()=>setShowForm(v=>!v)} className="btn btn-primary btn-sm">+ Add Valuation</button>
        </div>

        {showForm && (
          <div className="card mb-4">
            <h3 className="section-title mb-4">New Valuation</h3>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
              <div><label className="label">Valuation Date</label><input type="date" className="input" value={form.valuationDate} onChange={e=>setForm(f=>({...f,valuationDate:e.target.value}))}/></div>
              <div><label className="label">Fair Market Value (₹/share)</label><input type="number" step="0.01" className="input" value={form.fairMarketValue} onChange={e=>setForm(f=>({...f,fairMarketValue:e.target.value}))} placeholder="100.00"/></div>
              <div>
                <label className="label">Method</label>
                <select className="input" value={form.method} onChange={e=>setForm(f=>({...f,method:e.target.value}))}>
                  <option value="409A">409A</option><option value="DCF">DCF</option>
                  <option value="CCA">CCA (Comparable)</option><option value="NAV">NAV</option><option value="other">Other</option>
                </select>
              </div>
              <div><label className="label">Valuated By</label><input className="input" value={form.valuationBy} onChange={e=>setForm(f=>({...f,valuationBy:e.target.value}))} placeholder="KPMG / Internal"/></div>
            </div>
            <div style={{ marginBottom:14 }}><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
            <div style={{ marginBottom:14 }}>
              <label className="label">Upload Valuation Report (PDF / image)</label>
              <input type="file" className="input" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e=>setReportFile(e.target.files?.[0]||null)}/>
              {reportFile && <div style={{ fontSize:12, color:'var(--text3)', marginTop:4 }}>Selected: {reportFile.name}</div>}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={save} disabled={saving||uploading} className="btn btn-primary">
                {uploading?'Uploading...':saving?'Saving...':'Save Valuation'}
              </button>
              <button onClick={()=>setShowForm(false)} className="btn btn-ghost">Cancel</button>
            </div>
          </div>
        )}

        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <table className="tbl">
            <thead><tr><th>Date</th><th>FMV / Share</th><th>Method</th><th>Valuated By</th><th>Report</th><th>Notes</th></tr></thead>
            <tbody>
              {valuations.length===0
                ? <tr><td colSpan={6} style={{ textAlign:'center', padding:32, color:'var(--text3)' }}>No valuations yet. Add your first 409A.</td></tr>
                : valuations.map(v=>(
                  <tr key={v.id}>
                    <td>{fmtDate(v.valuationDate)}</td>
                    <td style={{ fontWeight:700, fontSize:15 }}>{fmtC(v.fairMarketValue)}</td>
                    <td><span className="badge badge-blue">{v.method}</span></td>
                    <td>{v.valuationBy||'—'}</td>
                    <td>{v.reportUrl ? <a href={v.reportUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-xs">📎 View</a> : <span style={{ color:'var(--text3)', fontSize:12 }}>—</span>}</td>
                    <td style={{ color:'var(--text3)', fontSize:12 }}>{v.notes||'—'}</td>
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
