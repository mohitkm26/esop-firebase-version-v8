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

const DEFAULT_TERMS = `Terms and Conditions
1. The offer is made to you personally and may be accepted only by you within the acceptance period specified in the grant letter.
2. If the offer is accepted, options will be granted on the grant date and vesting will occur as per the Vesting Schedule mentioned above.
3. Any failure to accept within the deadline shall be deemed a rejection of the offer.
4. On delivery of the acceptance, you shall be deemed to have irrevocably waived any entitlement to compensation for loss of rights under this ESOS.
5. The exercise period shall be as defined in the ESOS.
6. The acceptance of the Grant is entirely voluntary and the Company does not guarantee any return on Shares.
7. By accepting a Grant, you acknowledge that it does not constitute a guarantee of continuity of employment.
8. You shall obtain all necessary consents before accepting a Grant.
9. You shall not divulge the details of the ESOS to any person except as required by applicable law.
Congratulations on receiving this offer, which comes in recognition of your contribution to the Company.`

type Tab = 'general' | 'vesting' | 'letterhead' | 'pool' | 'email'

export default function Settings() {
  const { user, profile, loading } = useAuth()
  const { companyId, companyData, refreshCompany } = usePlan()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('general')
  const [saving, setSaving] = useState(false)
  const [ok, setOk] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const [templateUploading, setTemplateUploading] = useState(false)

  const [gen, setGen] = useState({ name: '', address: '', cin: '', pan: '', contactEmail: '', contactPhone: '', signatoryName: '', signatoryTitle: '' })
  const [vest, setVest] = useState({ vestingCliff: '12', vestingPeriod: '48', exerciseWindowDays: '90', grantExpiryDays: '30', autoAcceptDays: '0', tandcTemplate: DEFAULT_TERMS })
  const [pool, setPool] = useState({ boardApprovedShares: '', boardResolutionRef: '', effectiveDate: '' })
  const [emailCfg, setEmailCfg] = useState({ smtpHost: '', smtpPort: '587', smtpUser: '', smtpPassword: '', fromName: '', fromEmail: '' })
  const [branding, setBranding] = useState({ logoUrl: '', companyName: '', website: '', footerText: '' })

  useEffect(() => { if (!loading && !user) router.push('/login') }, [user, loading])
  useEffect(() => {
    if (!companyId) return
    Promise.all([
      getDoc(doc(db, 'companies', companyId)),
      getDoc(doc(db, 'companies', companyId, 'settings', 'branding')),
      getDoc(doc(db, 'companies', companyId, 'settings', 'emailConfig')),
      getDoc(doc(db, 'companies', companyId, 'esopPool', 'config')),
    ]).then(([cSnap, bSnap, eSnap, poolSnap]) => {
      const c = cSnap.exists() ? cSnap.data() as any : {}
      const b = bSnap.exists() ? bSnap.data() as any : {}
      const e = eSnap.exists() ? eSnap.data() as any : {}
      const p = poolSnap.exists() ? poolSnap.data() as any : {}
      setGen({ name: c.name || c.companyName || '', address: c.address || '', cin: c.cin || '', pan: c.pan || '', contactEmail: c.contactEmail || '', contactPhone: c.contactPhone || '', signatoryName: c.signatoryName || '', signatoryTitle: c.signatoryTitle || '' })
      setVest({ vestingCliff: String(c.vestingCliff || 12), vestingPeriod: String(c.vestingPeriod || 48), exerciseWindowDays: String(c.exerciseWindowDays || 90), grantExpiryDays: String(c.grantExpiryDays || 30), autoAcceptDays: String(c.autoAcceptDays || 0), tandcTemplate: c.tandcTemplate || DEFAULT_TERMS })
      setBranding({ logoUrl: b.logoUrl || c.logoUrl || '', companyName: b.companyName || c.companyName || '', website: b.website || c.website || '', footerText: b.footerText || '' })
      setEmailCfg({ smtpHost: e.smtpHost || '', smtpPort: String(e.smtpPort || 587), smtpUser: e.smtpUser || '', smtpPassword: '', fromName: e.fromName || '', fromEmail: e.fromEmail || '' })
      setPool({ boardApprovedShares: String(p.boardApprovedShares || ''), boardResolutionRef: p.boardResolutionRef || '', effectiveDate: p.effectiveDate || '' })
    })
  }, [companyId])

  async function saveGeneral() {
    setSaving(true)
    await setDoc(doc(db, 'companies', companyId), { name: gen.name, companyName: gen.name, address: gen.address, cin: gen.cin, pan: gen.pan, contactEmail: gen.contactEmail, contactPhone: gen.contactPhone, signatoryName: gen.signatoryName, signatoryTitle: gen.signatoryTitle, updatedAt: new Date().toISOString() }, { merge: true })
    await logAudit({ companyId, userId: user!.uid, userEmail: profile?.email || '', entityType: 'company', entityId: companyId, entityLabel: 'Settings', action: 'company_updated' })
    await refreshCompany(); done()
  }

  async function saveVesting() {
    setSaving(true)
    await setDoc(doc(db, 'companies', companyId), { vestingCliff: parseInt(vest.vestingCliff) || 12, vestingPeriod: parseInt(vest.vestingPeriod) || 48, exerciseWindowDays: parseInt(vest.exerciseWindowDays) || 90, grantExpiryDays: parseInt(vest.grantExpiryDays) || 30, autoAcceptDays: parseInt(vest.autoAcceptDays) || 0, tandcTemplate: vest.tandcTemplate, updatedAt: new Date().toISOString() }, { merge: true })
    await refreshCompany(); done()
  }

  async function saveBranding() {
    setSaving(true)
    await setDoc(doc(db, 'companies', companyId, 'settings', 'branding'), { logoUrl: branding.logoUrl, companyName: branding.companyName, website: branding.website, footerText: branding.footerText, updatedAt: new Date().toISOString() }, { merge: true })
    await refreshCompany(); done()
  }

  async function savePool() {
    setSaving(true)
    await setDoc(doc(db, 'companies', companyId, 'esopPool', 'config'), { boardApprovedShares: parseInt(pool.boardApprovedShares) || 0, boardResolutionRef: pool.boardResolutionRef, effectiveDate: pool.effectiveDate, updatedAt: new Date().toISOString() }, { merge: true })
    done()
  }

  async function saveEmail() {
    setSaving(true)
    const payload: any = { smtpHost: emailCfg.smtpHost, smtpPort: parseInt(emailCfg.smtpPort) || 587, smtpUser: emailCfg.smtpUser, fromName: emailCfg.fromName, fromEmail: emailCfg.fromEmail, updatedAt: new Date().toISOString() }
    if (emailCfg.smtpPassword) payload.smtpPassword = emailCfg.smtpPassword // only update if changed
    await setDoc(doc(db, 'companies', companyId, 'settings', 'emailConfig'), payload, { merge: true })
    done()
  }

  function done() { setOk('Saved successfully.'); setSaving(false); setTimeout(() => setOk(''), 3000) }

  async function uploadLogo(file: File) {
    setLogoUploading(true)
    const r = ref(storage, `companies/${companyId}/logo-${Date.now()}.${file.name.split('.').pop()}`)
    await uploadBytes(r, file)
    const url = await getDownloadURL(r)
    setBranding(b => ({ ...b, logoUrl: url }))
    setLogoUploading(false)
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'general', label: '🏢 General' }, { id: 'vesting', label: '📅 Vesting & Grants' },
    { id: 'letterhead', label: '🖼 Letterhead' }, { id: 'pool', label: '🏦 ESOP Pool' },
    { id: 'email', label: '📧 Email Config' },
  ]

  if (!canAdmin(profile?.role)) return <Layout><div className="alert alert-danger">Admin access required.</div></Layout>

  return (
    <Layout title="Settings">
      <div style={{ maxWidth: 800 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Company Settings</h1>
          <p className="page-subtitle">Configure your ESOP program, letterhead, and integrations</p>
        </div>
        {ok && <div className="alert alert-success mb-4">{ok}</div>}

        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '10px 16px', border: 'none', borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? 'var(--accent)' : 'var(--text2)', marginBottom: -1 }}>{t.label}</button>
          ))}
        </div>

        {tab === 'general' && (
          <div className="card">
            <h2 className="section-title mb-4">Company Information</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label className="label">Company Name *</label><input className="input" value={gen.name} onChange={e => setGen(g => ({ ...g, name: e.target.value }))} /></div>
              <div><label className="label">Registered Address</label><textarea className="input" rows={2} value={gen.address} onChange={e => setGen(g => ({ ...g, address: e.target.value }))} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label className="label">CIN</label><input className="input" value={gen.cin} onChange={e => setGen(g => ({ ...g, cin: e.target.value }))} /></div>
                <div><label className="label">PAN</label><input className="input" value={gen.pan} onChange={e => setGen(g => ({ ...g, pan: e.target.value }))} /></div>
                <div><label className="label">Contact Email</label><input className="input" type="email" value={gen.contactEmail} onChange={e => setGen(g => ({ ...g, contactEmail: e.target.value }))} /></div>
                <div><label className="label">Contact Phone</label><input className="input" value={gen.contactPhone} onChange={e => setGen(g => ({ ...g, contactPhone: e.target.value }))} /></div>
                <div><label className="label">Signatory Name</label><input className="input" value={gen.signatoryName} onChange={e => setGen(g => ({ ...g, signatoryName: e.target.value }))} placeholder="e.g. Rajesh Kumar" /></div>
                <div><label className="label">Signatory Title</label><input className="input" value={gen.signatoryTitle} onChange={e => setGen(g => ({ ...g, signatoryTitle: e.target.value }))} placeholder="e.g. Chief Executive Officer" /></div>
              </div>
              <button onClick={saveGeneral} disabled={saving} className="btn btn-primary">{saving ? '⏳...' : '💾 Save'}</button>
            </div>
          </div>
        )}

        {tab === 'vesting' && (
          <div className="card">
            <h2 className="section-title mb-4">Vesting & Grant Configuration</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="label">Cliff Period (months)</label>
                  <input type="number" className="input" value={vest.vestingCliff} onChange={e => setVest(v => ({ ...v, vestingCliff: e.target.value }))} />
                  <div className="text-xs text-muted mt-1">Options are not available before the cliff</div>
                </div>
                <div>
                  <label className="label">Total Vesting Period (months)</label>
                  <input type="number" className="input" value={vest.vestingPeriod} onChange={e => setVest(v => ({ ...v, vestingPeriod: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Exercise Window (days after exit)</label>
                  <input type="number" className="input" value={vest.exerciseWindowDays} onChange={e => setVest(v => ({ ...v, exerciseWindowDays: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Grant Acceptance Deadline (days)</label>
                  <input type="number" className="input" value={vest.grantExpiryDays} onChange={e => setVest(v => ({ ...v, grantExpiryDays: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Auto-Accept After (days) — 0 to disable</label>
                <input type="number" className="input" style={{ width: 150 }} value={vest.autoAcceptDays} onChange={e => setVest(v => ({ ...v, autoAcceptDays: e.target.value }))} min="0" />
                <div className="text-xs text-muted mt-1">Grant is automatically accepted if employee does not act within this period</div>
              </div>
              <div>
                <label className="label">Terms & Conditions Template (Annexure)</label>
                <textarea className="input" rows={14} value={vest.tandcTemplate} onChange={e => setVest(v => ({ ...v, tandcTemplate: e.target.value }))} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                <div className="text-xs text-muted mt-1">This text is printed as Annexure in every grant letter</div>
              </div>
              <button onClick={saveVesting} disabled={saving} className="btn btn-primary">{saving ? '⏳...' : '💾 Save Vesting Config'}</button>
            </div>
          </div>
        )}

        {tab === 'letterhead' && (
          <div className="card">
            <h2 className="section-title mb-4">Company Letterhead</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label">Company Logo</label>
                {branding.logoUrl && <img src={branding.logoUrl} alt="logo" style={{ height: 64, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 8, display: 'block' }} />}
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                  {logoUploading ? '⏳ Uploading...' : '📷 Upload Logo'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                </label>
              </div>
              <div><label className="label">Company Name (on letterhead)</label><input className="input" value={branding.companyName} onChange={e => setBranding(b => ({ ...b, companyName: e.target.value }))} /></div>
              <div><label className="label">Website</label><input className="input" value={branding.website} onChange={e => setBranding(b => ({ ...b, website: e.target.value }))} placeholder="https://example.com" /></div>
              <div><label className="label">Footer Text</label><textarea className="input" rows={3} value={branding.footerText} onChange={e => setBranding(b => ({ ...b, footerText: e.target.value }))} placeholder="CIN: XXXXXXXX | Registered Office: ..." /></div>
              <button onClick={saveBranding} disabled={saving} className="btn btn-primary">{saving ? '⏳...' : '💾 Save Letterhead'}</button>
            </div>
          </div>
        )}

        {tab === 'pool' && (
          <div className="card">
            <h2 className="section-title mb-4">ESOP Pool Configuration</h2>
            <div className="alert alert-info mb-4">Configure the board-approved ESOP pool. New grants will be blocked if they exceed the available pool.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label className="label">Board Approved Shares / Options (Pool Size)</label><input type="number" className="input" value={pool.boardApprovedShares} onChange={e => setPool(p => ({ ...p, boardApprovedShares: e.target.value }))} placeholder="500000" /></div>
              <div><label className="label">Board Resolution Reference</label><input className="input" value={pool.boardResolutionRef} onChange={e => setPool(p => ({ ...p, boardResolutionRef: e.target.value }))} placeholder="BR-2024-01" /></div>
              <div><label className="label">Effective Date</label><input type="date" className="input" value={pool.effectiveDate} onChange={e => setPool(p => ({ ...p, effectiveDate: e.target.value }))} /></div>
              <button onClick={savePool} disabled={saving} className="btn btn-primary">{saving ? '⏳...' : '💾 Save Pool Config'}</button>
            </div>
          </div>
        )}

        {tab === 'email' && (
          <div className="card">
            <h2 className="section-title mb-4">Custom Email Configuration</h2>
            <div className="alert alert-info mb-4">Configure custom SMTP to send emails from your company domain. Leave blank to use the platform default email.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12 }}>
                <div><label className="label">SMTP Host</label><input className="input" value={emailCfg.smtpHost} onChange={e => setEmailCfg(c => ({ ...c, smtpHost: e.target.value }))} placeholder="smtp.gmail.com" /></div>
                <div><label className="label">Port</label><input type="number" className="input" value={emailCfg.smtpPort} onChange={e => setEmailCfg(c => ({ ...c, smtpPort: e.target.value }))} /></div>
              </div>
              <div><label className="label">SMTP Username</label><input className="input" value={emailCfg.smtpUser} onChange={e => setEmailCfg(c => ({ ...c, smtpUser: e.target.value }))} placeholder="noreply@yourcompany.com" /></div>
              <div><label className="label">SMTP Password</label><input type="password" className="input" value={emailCfg.smtpPassword} onChange={e => setEmailCfg(c => ({ ...c, smtpPassword: e.target.value }))} placeholder="Leave blank to keep existing" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label className="label">From Name</label><input className="input" value={emailCfg.fromName} onChange={e => setEmailCfg(c => ({ ...c, fromName: e.target.value }))} placeholder="Acme Corp ESOP Team" /></div>
                <div><label className="label">From Email</label><input className="input" type="email" value={emailCfg.fromEmail} onChange={e => setEmailCfg(c => ({ ...c, fromEmail: e.target.value }))} placeholder="esop@yourcompany.com" /></div>
              </div>
              <button onClick={saveEmail} disabled={saving} className="btn btn-primary">{saving ? '⏳...' : '💾 Save Email Config'}</button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
