import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import Layout from '@/components/layout/Layout'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import { canAdmin } from '@/lib/roles'
import { db, storage } from '@/lib/firebase'

type BrandingForm = {
  logoUrl: string
  companyName: string
  address: string
  website: string
  email: string
  footerText: string
}

const defaultForm: BrandingForm = {
  logoUrl: '',
  companyName: '',
  address: '',
  website: '',
  email: '',
  footerText: '',
}

export default function CompanyBrandingSettingsPage() {
  const router = useRouter()
  const { user, profile, loading } = useAuth()
  const { companyId } = usePlan()
  const [form, setForm] = useState<BrandingForm>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [ok, setOk] = useState('')
  const [warn, setWarn] = useState('')

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [loading, user, router])

  useEffect(() => {
    if (!companyId) return

    const loadData = async () => {
      const [brandingSnap, companySnap] = await Promise.all([
        getDoc(doc(db, 'companies', companyId, 'settings', 'branding')),
        getDoc(doc(db, 'companies', companyId)),
      ])

      const branding = brandingSnap.exists() ? brandingSnap.data() : {}
      const company = companySnap.exists() ? companySnap.data() : {}

      setForm({
        logoUrl: branding.logoUrl || company.logoUrl || '',
        companyName: branding.companyName || company.companyName || company.name || '',
        address: branding.address || company.address || '',
        website: branding.website || company.website || '',
        email: branding.email || company.contactEmail || '',
        footerText: branding.footerText || '',
      })
    }

    loadData()
  }, [companyId])

  const set = (k: keyof BrandingForm, v: string) => setForm((prev) => ({ ...prev, [k]: v }))

  const uploadLogo = async (file: File) => {
    if (!companyId) return
    setWarn('')
    setUploading(true)
    try {
      const storageRef = ref(storage, `companies/${companyId}/branding/logo-${Date.now()}.${file.name.split('.').pop()}`)
      await uploadBytes(storageRef, file)
      const logoUrl = await getDownloadURL(storageRef)
      set('logoUrl', logoUrl)
    } catch (e: any) {
      setWarn(e?.message || 'Failed to upload logo.')
    }
    setUploading(false)
  }

  const save = async () => {
    if (!companyId) return
    setWarn('')
    setSaving(true)
    try {
      await setDoc(
        doc(db, 'companies', companyId, 'settings', 'branding'),
        {
          logoUrl: form.logoUrl,
          companyName: form.companyName,
          address: form.address,
          website: form.website,
          email: form.email,
          footerText: form.footerText,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      )
      setOk('Company branding saved.')
      setTimeout(() => setOk(''), 2500)
    } catch (e: any) {
      setWarn(e?.message || 'Could not save branding.')
    }
    setSaving(false)
  }

  if (loading || !profile || !companyId) {
    return <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner-lg" /></div>
  }

  if (!canAdmin(profile.role)) {
    return <Layout><div className="p-8 text-muted">Admin access required.</div></Layout>
  }

  return (
    <Layout>
      <div className="p-8" style={{ maxWidth: 700 }}>
        <h1 className="page-title mb-7">Company Letterhead Settings</h1>

        {ok && <div className="alert-success mb-5">{ok}</div>}
        {warn && <div className="alert alert-danger mb-5">{warn}</div>}

        <div className="card mb-5">
          <h2 className="section-title mb-4">Letterhead Branding</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="label">Logo</label>
              {form.logoUrl && (
                <img
                  src={form.logoUrl}
                  alt="Company logo"
                  style={{ height: 60, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 8, display: 'block' }}
                />
              )}
              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                {uploading ? '⏳ Uploading...' : '📷 Upload logo'}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files?.[0]) uploadLogo(e.target.files[0])
                  }}
                />
              </label>
            </div>

            <div>
              <label className="label">Company Name</label>
              <input className="input" value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />
            </div>

            <div>
              <label className="label">Address</label>
              <textarea className="input" rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Website</label>
                <input className="input" value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://example.com" />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="hello@example.com" />
              </div>
            </div>

            <div>
              <label className="label">Footer Text</label>
              <textarea className="input" rows={3} value={form.footerText} onChange={(e) => set('footerText', e.target.value)} />
            </div>
          </div>
        </div>

        <button onClick={save} disabled={saving} className="btn btn-primary">
          {saving ? '⏳ Saving...' : '💾 Save Branding'}
        </button>
      </div>
    </Layout>
  )
}
