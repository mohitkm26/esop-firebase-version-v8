import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import { fmtC, fmtDate, fmtN } from '@/lib/utils'
import CompanyLetterhead from '@/components/CompanyLetterhead'

type VestingRow = { id?: string; vestDate?: string; date?: string; optionsCount?: number; quantity?: number }
type BrandingConfig = { logoUrl?: string; companyName?: string; address?: string; website?: string; email?: string; footerText?: string; signatoryName?: string; signatoryTitle?: string; tandcTemplate?: string }
type Props = {
  grant: any; employee: any; company: any
  vestingEvents?: VestingRow[]; companyId?: string
  onGrantUpdated?: (updates: Record<string, any>) => void
  readOnly?: boolean
}

const fmtDT = (value: any) => {
  if (!value) return ''
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function GrantLetterView({ grant, employee, company, vestingEvents = [], companyId, onGrantUpdated, readOnly }: Props) {
  const { user, profile } = useAuth()
  const [actionBusy, setActionBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [branding, setBranding] = useState<BrandingConfig>({})
  const [showOTP, setShowOTP] = useState(false)
  const [otpStep, setOtpStep] = useState<'send' | 'enter'>('send')
  const [otpHash, setOtpHash] = useState('')
  const [otpValue, setOtpValue] = useState('')
  const [otpErr, setOtpErr] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const grantDocPathCompanyId = companyId || profile?.companyId || grant?.companyId || company?.id

  useEffect(() => {
    if (!grantDocPathCompanyId) return
    const loadBranding = async () => {
      const [brandingSnap, companySnap] = await Promise.all([
        getDoc(doc(db, 'companies', grantDocPathCompanyId, 'settings', 'branding')),
        getDoc(doc(db, 'companies', grantDocPathCompanyId)),
      ])
      const b = brandingSnap.exists() ? brandingSnap.data() : {}
      const c = companySnap.exists() ? companySnap.data() : {}
      setBranding({
        logoUrl: (b as any).logoUrl || (c as any).logoUrl || '',
        companyName: (b as any).companyName || (c as any).companyName || (c as any).name || 'Company',
        address: (b as any).address || (c as any).address || '',
        website: (b as any).website || (c as any).website || '',
        email: (b as any).email || (c as any).contactEmail || '',
        footerText: (b as any).footerText || '',
        signatoryName: (c as any).signatoryName || '',
        signatoryTitle: (c as any).signatoryTitle || '',
        tandcTemplate: (c as any).tandcTemplate || '',
      })
    }
    loadBranding()
  }, [grantDocPathCompanyId, company])

  const schedule = useMemo(() => {
    if (vestingEvents.length > 0) {
      return [...vestingEvents]
        .sort((a, b) => String(a.vestDate || a.date || '').localeCompare(String(b.vestDate || b.date || '')))
        .map(ev => ({ date: ev.vestDate || ev.date, options: ev.optionsCount || ev.quantity || 0 }))
    }
    if (Array.isArray(grant?.vestingSchedule)) {
      return grant.vestingSchedule.map((r: any) => ({ date: r.date, options: r.quantity || r.optionsCount || 0 }))
    }
    return []
  }, [vestingEvents, grant?.vestingSchedule])

  const status = grant?.status || 'issued'
  const isAccepted = status === 'accepted'
  const isRejected = status === 'rejected'
  const isFinal = isAccepted || isRejected

  // ── OTP-based acceptance ────────────────────────────────────────────────────
  async function sendOTP() {
    setActionBusy(true); setOtpErr('')
    try {
      const email = employee?.email || profile?.email
      const res = await fetch('/api/otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', email, purpose: 'grant_acceptance' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setOtpHash(data.hash)
      setOtpStep('enter')
    } catch (e: any) { setOtpErr(e.message || 'Failed to send OTP') }
    setActionBusy(false)
  }

  async function verifyAndAccept() {
    if (!otpValue || otpValue.length !== 6) { setOtpErr('Enter the 6-digit OTP'); return }
    setActionBusy(true); setOtpErr('')
    try {
      const email = employee?.email || profile?.email
      const res = await fetch('/api/otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', email, otp: otpValue, hash: otpHash }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // OTP valid — record acceptance
      const updates: Record<string, any> = {
        status: 'accepted', acceptedAt: serverTimestamp(),
        acceptedBy: email || '', locked: true, updatedAt: serverTimestamp(),
        acceptanceMethod: 'otp_verified',
      }
      await updateDoc(doc(db, 'companies', grantDocPathCompanyId, 'grants', grant.id), updates)
      onGrantUpdated?.(updates)
      setToast('✅ Grant accepted and locked. Your acceptance has been recorded.')
      setShowOTP(false)
    } catch (e: any) { setOtpErr(e.message || 'OTP verification failed') }
    setActionBusy(false)
  }

  async function rejectGrant() {
    setActionBusy(true)
    try {
      const updates: Record<string, any> = {
        status: 'rejected', rejectedAt: serverTimestamp(),
        rejectedBy: employee?.email || profile?.email || '',
        rejectionReason: rejectReason || null, updatedAt: serverTimestamp(),
      }
      await updateDoc(doc(db, 'companies', grantDocPathCompanyId, 'grants', grant.id), updates)
      onGrantUpdated?.(updates)
      setToast('Grant rejected. HR has been notified.')
      setShowReject(false)
    } catch (e: any) { setToast('Error: ' + e.message) }
    setActionBusy(false)
  }

  function printLetter() {
    const content = document.getElementById('grant-letter-container')
    if (!content) { alert('Grant content not found'); return }
    const w = window.open('', '_blank')
    if (!w) { alert('Popup blocked. Please allow popups.'); return }
    w.document.write(`<html><head><title>Grant Letter — ${grant?.grantNumber}</title><style>
      body{font-family:Arial,sans-serif;padding:32px;color:#000;max-width:800px;margin:0 auto}
      h2,h3{margin-top:20px}table{width:100%;border-collapse:collapse}
      th,td{padding:8px 12px;border:1px solid #ddd;text-align:left}th{background:#f3f4f6}
      .letterhead{border-bottom:2px solid #c9a14a;margin-bottom:24px;padding-bottom:12px}
      .accepted-stamp{padding:8px 14px;background:#e6f4ea;color:#1e7e34;display:inline-block;border-radius:6px;margin:8px 0}
      .no-print{display:none}@media print{body{margin:0}}
    </style></head><body>${content.innerHTML}</body></html>`)
    w.document.close()
    setTimeout(() => { w.print(); w.close() }, 500)
  }

  const isEmployee = profile?.role === 'employee'
  const canAct = isEmployee && !isFinal && !readOnly

  return (
    <>
      <Head><title>Grant Letter — {grant?.grantNumber}</title></Head>
      <div style={{ maxWidth: 900, margin: '0 auto', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg)', overflow: 'hidden' }}>

        {/* Letter content */}
        <div id="grant-letter-container" style={{ padding: 32, lineHeight: 1.7 }}>
          <CompanyLetterhead branding={branding} />

          <div style={{ marginBottom: 20 }}>
            <p style={{ marginBottom: 8 }}>Date: {fmtDate(grant?.grantDate)}</p>
            <p style={{ marginBottom: 0 }}>To,</p>
            <p style={{ marginBottom: 0 }}><strong>{employee?.name || grant?.employeeName || '—'}</strong></p>
            {employee?.designation && <p style={{ marginBottom: 0, color: 'var(--text2)' }}>{employee.designation}{employee.department ? ` — ${employee.department}` : ''}</p>}
          </div>

          <p><strong>Subject: Grant of Employee Stock Options / {grant?.grantType || 'ESOP'} under the Company ESOS</strong></p>
          <p>Dear {(employee?.name || grant?.employeeName || 'Employee')?.split(' ')[0]},</p>
          <p>We are pleased to inform you that the Board of Directors of <strong>{branding.companyName}</strong>, at its meeting held on {fmtDate(grant?.grantDate)}, has approved the grant of stock options to you under the Company's Employee Stock Option Scheme (ESOS) on the following terms and conditions:</p>

          <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8, marginTop: 24 }}>Grant Details</h3>
          <table className="tbl" style={{ marginBottom: 24 }}>
            <tbody>
              <tr><td><strong>Grant Reference Number</strong></td><td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{grant?.grantNumber}</td></tr>
              <tr><td><strong>Grant Date</strong></td><td>{fmtDate(grant?.grantDate)}</td></tr>
              <tr><td><strong>Grant Type</strong></td><td>{grant?.grantType}</td></tr>
              <tr><td><strong>Number of Options Granted</strong></td><td style={{ fontWeight: 700 }}>{fmtN(grant?.totalOptions || 0)}</td></tr>
              <tr><td><strong>Exercise Price per Option</strong></td><td>{fmtC(grant?.exercisePrice || 0)}</td></tr>
              <tr><td><strong>Vesting Start Date</strong></td><td>{fmtDate(grant?.vestingStartDate)}</td></tr>
              <tr><td><strong>Vesting Period</strong></td><td>{grant?.vestingPeriod || 48} months</td></tr>
              <tr><td><strong>Cliff Period</strong></td><td>{grant?.vestingCliff || 12} months</td></tr>
              {employee?.employeeCode && <tr><td><strong>Employee Code</strong></td><td>{employee.employeeCode}</td></tr>}
            </tbody>
          </table>

          <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>Vesting Schedule</h3>
          <table className="tbl" style={{ marginBottom: 24, pageBreakInside: 'avoid' }}>
            <thead><tr><th>#</th><th>Vesting Date</th><th>Options Vesting</th><th>Cumulative</th></tr></thead>
            <tbody>
              {schedule.length === 0
                ? <tr><td colSpan={4} style={{ color: 'var(--text3)', textAlign: 'center' }}>No vesting schedule available.</td></tr>
                : (() => { let cum = 0; return schedule.map((r, i) => { cum += r.options || 0; return (<tr key={i}><td>{i + 1}</td><td>{fmtDate(r.date)}</td><td>{fmtN(r.options || 0)}</td><td>{fmtN(cum)}</td></tr>) }) })()
              }
            </tbody>
          </table>

          <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>Authorised Signatory</h3>
          <div style={{ marginBottom: 24 }}>
            <p>For and on behalf of {branding.companyName}</p>
            <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 8, display: 'inline-block', minWidth: 200 }}>
              <div style={{ fontWeight: 600 }}>{branding.signatoryName || '________________'}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>{branding.signatoryTitle || '________________'}</div>
            </div>
          </div>

          {/* Acceptance Section */}
          <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>Employee Acceptance</h3>
          {isAccepted ? (
            <div style={{ marginBottom: 24 }}>
              <div style={{ background: '#e6f4ea', border: '1px solid #a7d7b0', borderRadius: 8, padding: '12px 16px', color: '#1a6b3c', marginBottom: 12 }}>
                <strong>✅ Digitally accepted</strong> by {grant.acceptedBy || employee?.name || 'Employee'}<br />
                <span style={{ fontSize: 12 }}>Accepted on: {fmtDT(grant.acceptedAt)}</span>
                {grant.acceptanceMethod === 'otp_verified' && <span style={{ fontSize: 11, marginLeft: 8, background: 'rgba(0,0,0,0.08)', padding: '2px 6px', borderRadius: 4 }}>OTP Verified</span>}
              </div>
              <p>I, {employee?.name || grant?.employeeName}, hereby confirm that I have read and understood the terms of this grant and accept the same unconditionally.</p>
            </div>
          ) : isRejected ? (
            <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '12px 16px', marginBottom: 24 }}>
              <strong>❌ Rejected</strong> by {grant.rejectedBy || 'Employee'} on {fmtDT(grant.rejectedAt)}
              {grant.rejectionReason && <p style={{ margin: '8px 0 0', fontSize: 13 }}>Reason: {grant.rejectionReason}</p>}
            </div>
          ) : (
            <div style={{ marginBottom: 24 }}>
              <p>I, ______________________, hereby confirm that I have read and understood the terms of this grant and accept the same unconditionally.</p>
              <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div><div>Employee Signature: ____________________</div><div style={{ marginTop: 8 }}>Date: ____________________</div></div>
                <div><div>Name: ____________________</div><div style={{ marginTop: 8 }}>Employee Code: ____________________</div></div>
              </div>
            </div>
          )}

          {/* T&C Annexure */}
          {branding.tandcTemplate && (
            <>
              <h3 style={{ borderTop: '2px solid var(--border)', paddingTop: 24, marginTop: 24 }}>Annexure — Terms and Conditions</h3>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--text2)', lineHeight: 1.75 }}>{branding.tandcTemplate}</div>
            </>
          )}

          {branding.footerText && (
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 32, paddingTop: 12, fontSize: 11, color: 'var(--text3)' }}>{branding.footerText}</div>
          )}
        </div>

        {/* OTP Accept Modal */}
        {showOTP && (
          <div style={{ padding: '16px 24px', background: 'rgba(45,95,168,0.05)', borderTop: '1px solid rgba(45,95,168,0.2)' }}>
            {otpStep === 'send' ? (
              <div>
                <p style={{ marginBottom: 12 }}><strong>Accept via OTP Verification</strong></p>
                <p style={{ fontSize: 13, marginBottom: 16 }}>An OTP will be sent to <strong>{employee?.email || profile?.email}</strong>. Enter it to confirm your acceptance.</p>
                {otpErr && <div className="alert alert-danger mb-3">{otpErr}</div>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={sendOTP} disabled={actionBusy} className="btn btn-primary btn-sm">{actionBusy ? 'Sending...' : 'Send OTP'}</button>
                  <button onClick={() => { setShowOTP(false); setOtpErr('') }} className="btn btn-ghost btn-sm">Cancel</button>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ marginBottom: 12 }}><strong>Enter the 6-digit OTP</strong> sent to {employee?.email || profile?.email}</p>
                {otpErr && <div className="alert alert-danger mb-3">{otpErr}</div>}
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div>
                    <label className="label">OTP Code</label>
                    <input
                      className="input" style={{ width: 140, fontFamily: 'monospace', fontSize: 20, letterSpacing: 4, textAlign: 'center' }}
                      maxLength={6} value={otpValue} onChange={e => setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000" autoFocus
                    />
                  </div>
                  <button onClick={verifyAndAccept} disabled={actionBusy || otpValue.length !== 6} className="btn btn-success btn-sm">
                    {actionBusy ? 'Verifying...' : '✓ Verify & Accept'}
                  </button>
                  <button onClick={() => setOtpStep('send')} className="btn btn-ghost btn-sm">Resend OTP</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Reject Modal */}
        {showReject && (
          <div style={{ padding: '16px 24px', background: 'rgba(239,68,68,0.04)', borderTop: '1px solid rgba(239,68,68,0.2)' }}>
            <p style={{ marginBottom: 12 }}><strong>Reject Grant</strong></p>
            <p style={{ fontSize: 13, marginBottom: 12 }}>Please provide a reason for rejection (optional). This cannot be undone.</p>
            <textarea className="input mb-3" rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection (optional)..." />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={rejectGrant} disabled={actionBusy} className="btn btn-danger btn-sm">{actionBusy ? 'Rejecting...' : '✕ Confirm Rejection'}</button>
              <button onClick={() => setShowReject(false)} className="btn btn-ghost btn-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div style={{ position: 'sticky', bottom: 0, borderTop: '1px solid var(--border)', background: 'var(--bg2)', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 12, color: isAccepted ? '#2d7a4f' : isRejected ? 'var(--danger)' : 'var(--text2)' }}>
            {isAccepted ? '🔒 Accepted & frozen — no further changes possible' : isRejected ? '❌ Grant rejected' : 'Review the full letter including annexure before taking action'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={printLetter}>🖨 Print / Save PDF</button>
            {canAct && !showOTP && !showReject && (
              <>
                <button className="btn btn-danger btn-sm" onClick={() => setShowReject(true)}>✕ Reject Grant</button>
                <button className="btn btn-success btn-sm" onClick={() => { setShowOTP(true); setOtpStep('send') }}>✓ Accept Grant</button>
              </>
            )}
          </div>
        </div>
      </div>

      {toast && <div className="alert alert-success" style={{ marginTop: 12, maxWidth: 900, margin: '12px auto 0' }}>{toast}</div>}
    </>
  )
}
