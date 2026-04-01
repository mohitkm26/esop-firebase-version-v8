import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { db, storage } from '@/lib/firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import { logAudit } from '@/lib/audit'
import { canAdmin } from '@/lib/roles'
import { uploadGrantTemplate } from '@/lib/grant-template'

const DEFAULT_TERMS_TEMPLATE = `Terms and Conditions
1. The offer is made to you personally and may be accepted only by you within 7 days of this offer.
2. If the offer is accepted as above, options will be granted on 1st April, 2024 and vesting would occur as per the Vesting Schedule mentioned above.
3. The offer may be accepted by you by completing this form and delivery of the same to the Company on or before 7 days from this letter (“Closing Date”).
4. Any failure to return the acceptance form duly completed on or before the Closing Date shall, unless determined by the Board or the Management Committee of the Company, be deemed to be a rejection of the offer and any acceptance received after the Closing Date shall not be valid.
5. On delivery of the acceptance form duly completed, you shall be deemed to have irrevocably waived any entitlement, by way of compensation for loss of office or otherwise howsoever, to any sum or other benefit to compensate you for loss of any rights under this ESOS.
6. The exercise period for the Options granted (“Exercise Period”) shall be as defined in the ESOS.
7. The acceptance of the Grant is entirely voluntary and the Company or the Board, does not guarantee any return on Shares.
8. By accepting a Grant of Option, you shall be deemed to have expressly acknowledged that the Grant of Option does not constitute guarantee or continuity of employment and the Company shall reserve the right to terminate your employment in accordance with the terms of employment.
9. You shall, before accepting a Grant of Option, obtain all necessary consents, if any, that may be required to enable you to accept the Grant of Option and the Company to allot and issue to you in accordance with the provisions of this ESOS, the Shares due to be allotted and issued upon the Exercise of your vested Options. By accepting a Grant of Option and/or submitting the Exercise form, are therefore deemed to have represented to the Company, that you have obtained all such consents.
10. You shall not divulge the details of the ESOS and/or your holdings to any person except with the prior written permission of the Board, unless so required to do under any statutes or regulations applicable to you.
Congratulations on receiving this offer, which comes to you in recognition of your continuous endeavour towards improving the business results of the Company. We are confident that you will continue to contribute to the activities of the Company with a sense of ownership and commitment. Your enthusiasm and the spirit to excel will have a positive impact on the performance and image of our Company.
A copy of the ESOS specifying the terms and conditions applicable to the Options being granted are attached herewith.`

export default function Settings() {
  const { user, profile, loading } = useAuth()
  const { companyId, companyData, refreshCompany } = usePlan()
  const router = useRouter()
  const [form, setForm] = useState({
    name:'', address:'', cin:'', pan:'',
    contactEmail:'', contactPhone:'',
    signatoryName:'', signatoryTitle:'',
    grantExpiryDays:'30',
    tandcTemplate: DEFAULT_TERMS_TEMPLATE,
  })
  const [saving, setSaving] = useState(false)
  const [ok, setOk] = useState('')
  const [warn, setWarn] = useState('')
  const [logoUploading,      setLogoUploading]      = useState(false)
  const [letterheadUploading,setLetterheadUploading]= useState(false)
  const [templateUploading, setTemplateUploading] = useState(false)

  useEffect(() => { if (!loading && !user) router.push('/login') }, [user, loading])
  useEffect(() => {
    if (!companyId) return
    getDoc(doc(db,'companies',companyId)).then(snap => {
      if (snap.exists()) {
        const d = snap.data() as any
        setForm({
          name:             d.name || d.companyName || '',
          address:          d.address || '',
          cin:              d.cin || '',
          pan:              d.pan || '',
          contactEmail:     d.contactEmail || '',
          contactPhone:     d.contactPhone || '',
          signatoryName:    d.signatoryName || '',
          signatoryTitle:   d.signatoryTitle || '',
          grantExpiryDays:  String(d.grantExpiryDays || 30),
          tandcTemplate:    d.tandcTemplate || DEFAULT_TERMS_TEMPLATE,
        })
      }
    })
  }, [companyId])

  async function save() {
    if (!companyId) return
    setSaving(true)
    await setDoc(doc(db,'companies',companyId), {
      name:            form.name,
      companyName:     form.name,
      address:         form.address,
      cin:             form.cin,
      pan:             form.pan,
      contactEmail:    form.contactEmail,
      contactPhone:    form.contactPhone,
      signatoryName:   form.signatoryName,
      signatoryTitle:  form.signatoryTitle,
      grantExpiryDays: parseInt(form.grantExpiryDays)||30,
      tandcTemplate:   form.tandcTemplate || DEFAULT_TERMS_TEMPLATE,
      updatedAt:       new Date().toISOString(),
    }, { merge: true })
    await logAudit({ companyId, userId:user!.uid, userEmail:profile?.email||'', entityType:'company', entityId:companyId, entityLabel:'Company settings', action:'company_updated' })
    await refreshCompany()
    setOk('Settings saved successfully.')
    setSaving(false)
    setTimeout(()=>setOk(''), 3000)
  }

  async function uploadFile(file: File, type: 'logo'|'letterhead') {
    if (type === 'logo') setLogoUploading(true)
    else setLetterheadUploading(true)
    const storageRef = ref(storage, `companies/${companyId}/${type}-${Date.now()}.${file.name.split('.').pop()}`)
    await uploadBytes(storageRef, file)
    const url = await getDownloadURL(storageRef)
    const field = type === 'logo' ? 'logoUrl' : 'letterheadUrl'
    await setDoc(doc(db,'companies',companyId), { [field]: url }, { merge: true })
    await refreshCompany()
    if (type === 'logo') setLogoUploading(false)
    else setLetterheadUploading(false)
  }

  async function uploadGrantTermsTemplate(file: File) {
    if (!companyId) return
    setWarn('')
    setTemplateUploading(true)
    try {
      const url = await uploadGrantTemplate(file, companyId)
      await setDoc(doc(db,'companies',companyId), {
        grant_template_url: url,
        grant_template_name: file.name,
        grantTemplateUrl: url,
        grantTemplateName: file.name,
      }, { merge: true })
      await refreshCompany()
      setOk('Grant template uploaded successfully')
    } catch (e:any) {
      setWarn(e?.message || 'Failed to upload grant template.')
    }
    setTemplateUploading(false)
  }

  const set = (k: string, v: string) => setForm(f=>({...f,[k]:v}))

  if (loading || !profile || !companyId) return <div style={{minHeight:'100vh',background:'var(--bg)',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner-lg"/></div>
  if (!canAdmin(profile?.role)) return <Layout><div className="p-8 text-muted">Admin access required.</div></Layout>

  return (
    <Layout>
      <div className="p-8" style={{maxWidth:640}}>
        <h1 className="page-title mb-7">Company Settings</h1>
        {ok && <div className="alert-success mb-5">{ok}</div>}
        {warn && <div className="alert alert-danger mb-5">{warn}</div>}

        <div className="card mb-5">
          <h2 className="section-title mb-4">Branding</h2>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
            <div>
              <label className="label">Company Logo</label>
              {companyData?.logoUrl && <img src={companyData.logoUrl} alt="logo" style={{height:48,objectFit:'contain',borderRadius:8,border:'1px solid var(--border)',marginBottom:8,display:'block'}}/>}
              <label className="btn btn-ghost btn-sm" style={{cursor:'pointer'}}>
                {logoUploading ? '⏳ Uploading...' : '📷 Upload logo'}
                <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{ if(e.target.files?.[0]) uploadFile(e.target.files[0],'logo') }}/>
              </label>
            </div>
            <div>
              <label className="label">Letterhead (for grant letters)</label>
              {(companyData as any)?.letterheadUrl && <img src={(companyData as any).letterheadUrl} alt="letterhead" style={{height:48,objectFit:'contain',borderRadius:8,border:'1px solid var(--border)',marginBottom:8,display:'block'}}/>}
              <label className="btn btn-ghost btn-sm" style={{cursor:'pointer'}}>
                {letterheadUploading ? '⏳ Uploading...' : '📄 Upload letterhead'}
                <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{ if(e.target.files?.[0]) uploadFile(e.target.files[0],'letterhead') }}/>
              </label>
            </div>
          </div>
        </div>

        <div className="card mb-5">
          <h2 className="section-title mb-4">Grant Letter Template</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ fontSize:13 }}>
              Current template:{' '}
              <strong>{(companyData as any)?.grant_template_name || (companyData as any)?.grantTemplateName || 'None uploaded'}</strong>
            </div>
            {((companyData as any)?.grant_template_url || (companyData as any)?.grantTemplateUrl) && (
              <a
                className="btn btn-ghost btn-sm"
                href={(companyData as any)?.grant_template_url || (companyData as any)?.grantTemplateUrl}
                target="_blank"
                rel="noreferrer"
                style={{ width:'fit-content' }}
              >
                ⬇️ Download template
              </a>
            )}
            <label className="btn btn-secondary btn-sm" style={{ cursor:'pointer', width:'fit-content' }}>
              {templateUploading ? '⏳ Uploading...' : 'Replace template (.docx)'}
              <input
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                style={{ display:'none' }}
                onChange={e=>{ if (e.target.files?.[0]) uploadGrantTermsTemplate(e.target.files[0]) }}
              />
            </label>
            <div style={{ fontSize:11, color:'var(--warning)' }}>⚠️ This will apply to all future grants only</div>
          </div>
        </div>

        <div className="card mb-5">
          <h2 className="section-title mb-4">Company Information</h2>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div><label className="label">Company Name *</label><input className="input" value={form.name} onChange={e=>set('name',e.target.value)}/></div>
            <div><label className="label">Registered Address</label><textarea className="input" rows={2} value={form.address} onChange={e=>set('address',e.target.value)}/></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div><label className="label">CIN</label><input className="input" value={form.cin} onChange={e=>set('cin',e.target.value)}/></div>
              <div><label className="label">PAN</label><input className="input" value={form.pan} onChange={e=>set('pan',e.target.value)}/></div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div><label className="label">Contact Email</label><input className="input" type="email" value={form.contactEmail} onChange={e=>set('contactEmail',e.target.value)}/></div>
              <div><label className="label">Contact Phone</label><input className="input" type="tel" value={form.contactPhone} onChange={e=>set('contactPhone',e.target.value)}/></div>
            </div>
          </div>
        </div>

        <div className="card mb-5">
          <h2 className="section-title mb-4">Authorised Signatory</h2>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div><label className="label">Name</label><input className="input" value={form.signatoryName} onChange={e=>set('signatoryName',e.target.value)}/></div>
            <div><label className="label">Title / Designation</label><input className="input" value={form.signatoryTitle} onChange={e=>set('signatoryTitle',e.target.value)}/></div>
          </div>
        </div>

        <div className="card mb-5">
          <h2 className="section-title mb-4">ESOP Settings</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <label className="label">Grant acceptance window (days)</label>
            <input className="input" type="number" min="7" max="90" style={{maxWidth:140}} value={form.grantExpiryDays} onChange={e=>set('grantExpiryDays',e.target.value)}/>
            <p style={{fontSize:11,color:'var(--muted)',marginTop:6}}>Grants not accepted within this period will automatically expire.</p>

            <div>
              <label className="label">Terms of Grant (printed as Annexure A in Grant Letter)</label>
              <textarea className="input" rows={14} value={form.tandcTemplate} onChange={e=>set('tandcTemplate',e.target.value)} />
              <p style={{fontSize:11,color:'var(--muted)',marginTop:6}}>Admins can edit this standard template. It will be appended at the end of every generated grant letter as Annexure A.</p>
            </div>
          </div>
        </div>

        <button onClick={save} disabled={saving} className="btn btn-primary">
          {saving ? '⏳ Saving...' : '💾 Save Settings'}
        </button>
      </div>
    </Layout>
  )
}
