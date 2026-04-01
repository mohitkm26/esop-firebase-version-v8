import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { db, storage } from '@/lib/firebase'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import { uploadGrantTemplate } from '@/lib/grant-template'

export default function Onboarding() {
  const { user, profile, loading } = useAuth()
  const { refreshCompany } = usePlan()
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [logoFile, setLogoFile] = useState<File|null>(null)
  const [grantTemplateFile, setGrantTemplateFile] = useState<File|null>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [templateMsg, setTemplateMsg] = useState('')
  const [form, setForm] = useState({
    companyName:'', contactEmail:'', address:'',
    plan:'basic', currency:'INR',
    vestingCliff:'12', vestingPeriod:'48', grantExpiryDays:'30', exerciseWindowDays:'90',
    signatoryName:'', signatoryTitle:'',
  })

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)) }
  }

  function handleGrantTemplateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setTemplateMsg('')
    setGrantTemplateFile(f)
  }

  async function finish() {
    if (!form.companyName || !user || !profile) return
    setSaving(true)
    try {
      const companyId = profile.companyId || user.uid
      let logoUrl = ''
      let grantTemplateUrl = ''
      let grantTemplateName = ''
      if (logoFile) {
        const logoRef = ref(storage, `companies/${companyId}/logo`)
        await uploadBytes(logoRef, logoFile)
        logoUrl = await getDownloadURL(logoRef)
      }
      if (grantTemplateFile) {
        grantTemplateUrl = await uploadGrantTemplate(grantTemplateFile, companyId)
        grantTemplateName = grantTemplateFile.name
        setTemplateMsg('Grant template uploaded successfully')
      }
      await setDoc(doc(db,'companies',companyId), {
        id: companyId,
        name: form.companyName,
        companyId, companyName: form.companyName, contactEmail: form.contactEmail||user.email,
        address: form.address, plan: form.plan, logoUrl, currency: form.currency,
        vestingCliff: parseInt(form.vestingCliff)||12,
        vestingPeriod: parseInt(form.vestingPeriod)||48,
        grantExpiryDays: parseInt(form.grantExpiryDays)||30,
        exerciseWindowDays: parseInt(form.exerciseWindowDays)||90,
        grant_template_url: grantTemplateUrl || null,
        grant_template_name: grantTemplateName || null,
        grantTemplateUrl: grantTemplateUrl || null,
        grantTemplateName: grantTemplateName || null,
        signatoryName: form.signatoryName, signatoryTitle: form.signatoryTitle,
        onboarded: true, createdAt: serverTimestamp(), created_at: serverTimestamp(),
      }, { merge: true })
      await refreshCompany()
      router.replace('/dashboard')
    } catch(e:any) { alert('Error: ' + e.message) }
    setSaving(false)
  }

  if (loading) return <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center' }}><div className="spinner-lg"/></div>

  const STEPS = ['Company Info', 'Plan', 'ESOP Defaults', 'Done']

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ width:'100%', maxWidth:560 }}>
        {/* Progress */}
        <div style={{ display:'flex', gap:0, marginBottom:36 }}>
          {STEPS.map((s,i) => (
            <div key={s} style={{ flex:1, display:'flex', alignItems:'center', flexDirection:'column', gap:4 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background: i+1<=step ? 'var(--accent)' : 'var(--bg3)', color: i+1<=step ? '#fff':'var(--text3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700 }}>{i+1}</div>
              <span style={{ fontSize:10, color: i+1===step?'var(--accent)':'var(--text3)', fontWeight: i+1===step?700:400, textAlign:'center' }}>{s}</span>
            </div>
          ))}
        </div>

        <div className="card" style={{ borderRadius:16 }}>
          {step === 1 && (
            <>
              <h2 style={{ fontSize:20, fontWeight:800, margin:'0 0 20px', color:'var(--text)' }}>🏢 Set up your company</h2>
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div>
                  <label className="label">Company Name *</label>
                  <input className="input" value={form.companyName} onChange={e=>setForm(f=>({...f,companyName:e.target.value}))} placeholder="Acme Technologies Pvt Ltd"/>
                </div>
                <div>
                  <label className="label">Contact Email</label>
                  <input type="email" className="input" value={form.contactEmail} onChange={e=>setForm(f=>({...f,contactEmail:e.target.value}))} placeholder={user?.email||''}/>
                </div>
                <div>
                  <label className="label">Company Address</label>
                  <textarea className="input" rows={2} value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} placeholder="123 MG Road, Bangalore, Karnataka 560001"/>
                </div>
                <div>
                  <label className="label">Company Logo</label>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    {logoPreview && <img src={logoPreview} style={{ width:52, height:52, borderRadius:10, objectFit:'cover', border:'1px solid var(--border)' }} alt="logo"/>}
                    <label className="btn btn-secondary btn-sm" style={{ cursor:'pointer' }}>
                      Upload Logo
                      <input type="file" accept="image/*" style={{ display:'none' }} onChange={handleLogoChange}/>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="label">Upload Standard Grant Terms (DOCX)</label>
                  <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                    <label className="btn btn-secondary btn-sm" style={{ cursor:'pointer' }}>
                      {grantTemplateFile ? 'Replace file' : 'Upload DOCX'}
                      <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style={{ display:'none' }} onChange={handleGrantTemplateChange}/>
                    </label>
                    <span style={{ fontSize:12, color:'var(--text2)' }}>{grantTemplateFile?.name || 'No file selected (optional)'}</span>
                  </div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>Max size: 5MB</div>
                  {templateMsg && <div style={{ fontSize:12, color:'var(--success)', marginTop:6 }}>✅ {templateMsg}</div>}
                </div>
              </div>
              <button disabled={!form.companyName} onClick={()=>setStep(2)} className="btn btn-primary" style={{ marginTop:24, width:'100%', justifyContent:'center' }}>Next →</button>
            </>
          )}

          {step === 2 && (
            <>
              <h2 style={{ fontSize:20, fontWeight:800, margin:'0 0 20px', color:'var(--text)' }}>📦 Choose your plan</h2>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {[
                  { val:'basic',    label:'Basic — Free',    desc:'Up to 50 employees, unlimited grants', color:'#6b6b6b' },
                  { val:'pro',      label:'Pro — ₹2,999/mo', desc:'Valuations, reports, email letters', color:'#2d5fa8' },
                  { val:'advanced', label:'Advanced — ₹7,999/mo', desc:'ESOP cost, audit logs, eSignature', color:'#c8922a' },
                ].map(p => (
                  <label key={p.val} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:14, borderRadius:10, border: form.plan===p.val ? '2px solid var(--accent)' : '1px solid var(--border)', cursor:'pointer', background: form.plan===p.val ? 'rgba(200,146,42,0.05)' : 'transparent' }}>
                    <input type="radio" name="plan" value={p.val} checked={form.plan===p.val} onChange={e=>setForm(f=>({...f,plan:e.target.value}))} style={{ marginTop:2 }}/>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14, color:p.color }}>{p.label}</div>
                      <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>{p.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
              <div style={{ display:'flex', gap:10, marginTop:24 }}>
                <button onClick={()=>setStep(1)} className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }}>← Back</button>
                <button onClick={()=>setStep(3)} className="btn btn-primary" style={{ flex:2, justifyContent:'center' }}>Next →</button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 style={{ fontSize:20, fontWeight:800, margin:'0 0 20px', color:'var(--text)' }}>⚙️ ESOP Defaults</h2>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div>
                  <label className="label">Vesting Cliff (months)</label>
                  <input type="number" className="input" value={form.vestingCliff} onChange={e=>setForm(f=>({...f,vestingCliff:e.target.value}))} min="0" max="24"/>
                </div>
                <div>
                  <label className="label">Vesting Period (months)</label>
                  <input type="number" className="input" value={form.vestingPeriod} onChange={e=>setForm(f=>({...f,vestingPeriod:e.target.value}))} min="12" max="120"/>
                </div>
                <div>
                  <label className="label">Grant Expiry (days)</label>
                  <input type="number" className="input" value={form.grantExpiryDays} onChange={e=>setForm(f=>({...f,grantExpiryDays:e.target.value}))} min="7" max="365"/>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>Days before unaccepted grant expires</div>
                </div>
                <div>
                  <label className="label">Exercise Window (days)</label>
                  <input type="number" className="input" value={form.exerciseWindowDays} onChange={e=>setForm(f=>({...f,exerciseWindowDays:e.target.value}))} min="30" max="365"/>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>Days post-exit to exercise</div>
                </div>
                <div>
                  <label className="label">Signatory Name</label>
                  <input className="input" value={form.signatoryName} onChange={e=>setForm(f=>({...f,signatoryName:e.target.value}))} placeholder="Founder / CEO"/>
                </div>
                <div>
                  <label className="label">Signatory Title</label>
                  <input className="input" value={form.signatoryTitle} onChange={e=>setForm(f=>({...f,signatoryTitle:e.target.value}))} placeholder="Chief Executive Officer"/>
                </div>
              </div>
              <div style={{ display:'flex', gap:10, marginTop:24 }}>
                <button onClick={()=>setStep(2)} className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }}>← Back</button>
                <button onClick={()=>setStep(4)} className="btn btn-primary" style={{ flex:2, justifyContent:'center' }}>Next →</button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div style={{ textAlign:'center', padding:'16px 0' }}>
                <div style={{ fontSize:52, marginBottom:16 }}>🎉</div>
                <h2 style={{ fontSize:22, fontWeight:800, margin:'0 0 12px', color:'var(--text)' }}>You're all set!</h2>
                <p style={{ fontSize:14, color:'var(--text2)', marginBottom:28, lineHeight:1.7 }}>
                  <strong>{form.companyName}</strong> is ready. Start by adding employees and issuing your first ESOP grants.
                </p>
                <div style={{ background:'var(--bg2)', borderRadius:12, padding:16, marginBottom:24, textAlign:'left' }}>
                  <div style={{ fontWeight:700, fontSize:13, marginBottom:8, color:'var(--text)' }}>Summary</div>
                  {[
                    ['Company', form.companyName],
                    ['Plan', form.plan],
                    ['Vesting', `${form.vestingCliff}m cliff / ${form.vestingPeriod}m total`],
                    ['Grant expiry', `${form.grantExpiryDays} days`],
                  ].map(([k,v]) => (
                    <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'4px 0', borderBottom:'1px solid var(--border)' }}>
                      <span style={{ color:'var(--text3)' }}>{k}</span>
                      <span style={{ fontWeight:600 }}>{v}</span>
                    </div>
                  ))}
                </div>
                <button onClick={finish} disabled={saving} className="btn btn-primary" style={{ width:'100%', justifyContent:'center', padding:'13px', fontSize:15 }}>
                  {saving ? '⏳ Setting up...' : '🚀 Go to Dashboard'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
