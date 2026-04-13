import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { sendGrantLetterEmail } from '@/lib/email'

export default function SignatoryApprovalPage() {
  const router = useRouter()
  const { companyId, grantId } = router.query as { companyId: string; grantId: string }
  const [grant, setGrant] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [otpStep, setOtpStep] = useState<'send' | 'verify'>('send')
  const [otpHash, setOtpHash] = useState('')
  const [otpValue, setOtpValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!companyId || !grantId) return
    Promise.all([
      getDoc(doc(db, 'companies', companyId, 'grants', grantId)),
      getDoc(doc(db, 'companies', companyId)),
    ]).then(([g, c]) => {
      if (g.exists()) setGrant({ id: g.id, ...g.data() })
      if (c.exists()) setCompany(c.data())
    })
  }, [companyId, grantId])

  async function sendOTP() {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', email: company?.signatoryEmail, purpose: 'grant_signatory_approval' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setOtpHash(data.hash)
      setOtpStep('verify')
    } catch (e: any) { setErr(e.message || 'Failed to send OTP') }
    setBusy(false)
  }

  async function verifyOTPAndApprove() {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', email: company?.signatoryEmail, otp: otpValue, hash: otpHash }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      await updateDoc(doc(db, 'companies', companyId, 'grants', grantId), {
        status: 'issued',
        issuedAt: serverTimestamp(),
        signatoryApprovalStatus: 'approved',
        signatoryApprovedAt: serverTimestamp(),
        signatoryApprovedBy: company?.signatoryEmail || '',
        signatoryApprovalMethod: 'otp_verified',
        updatedAt: serverTimestamp(),
      })
      await sendGrantLetterEmail({
        to: grant.employeeEmail,
        employeeName: grant.employeeName,
        companyId,
        grant: {
          grantNumber: grant.grantNumber,
          grantDate: grant.grantDate,
          grantType: grant.grantType,
          totalOptions: grant.totalOptions,
          exercisePrice: grant.exercisePrice,
        }
      })
      setMsg('✅ Approved successfully. Grant letter is now sent to employee.')
    } catch (e: any) { setErr(e.message || 'OTP verification failed') }
    setBusy(false)
  }

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', padding: 20, border: '1px solid #e5e7eb', borderRadius: 12, fontFamily: 'Inter, Arial, sans-serif' }}>
      <h1 style={{ marginBottom: 10 }}>Signatory Approval</h1>
      {!grant || !company ? <p>Loading grant details…</p> : (
        <>
          <p>Please approve grant <strong>{grant.grantNumber}</strong> for <strong>{grant.employeeName}</strong>.</p>
          <p style={{ fontSize: 13, color: '#4b5563' }}>OTP will be sent to: <strong>{company.signatoryEmail || 'Not configured'}</strong></p>
          {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 8, padding: 10, marginBottom: 10 }}>{err}</div>}
          {msg && <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', borderRadius: 8, padding: 10, marginBottom: 10 }}>{msg}</div>}
          {otpStep === 'send' ? (
            <button disabled={busy || !company.signatoryEmail} onClick={sendOTP} style={{ padding: '10px 16px', borderRadius: 8, background: '#1d4ed8', color: '#fff', border: 0 }}>
              {busy ? 'Sending OTP...' : 'Send OTP to Signatory'}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Enter OTP</label>
                <input value={otpValue} onChange={e => setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} style={{ padding: 10, borderRadius: 8, border: '1px solid #d1d5db', width: 140, fontFamily: 'monospace', letterSpacing: 4 }} />
              </div>
              <button disabled={busy || otpValue.length !== 6} onClick={verifyOTPAndApprove} style={{ padding: '10px 16px', borderRadius: 8, background: '#166534', color: '#fff', border: 0 }}>
                {busy ? 'Verifying...' : 'Verify & Approve'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
