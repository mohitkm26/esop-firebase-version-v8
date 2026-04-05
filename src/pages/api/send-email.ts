import type { NextApiRequest, NextApiResponse } from 'next'

const RESEND_API_URL = 'https://api.resend.com/emails'

function getBaseUrl(req: NextApiRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) return appUrl
  const protocol = (req.headers['x-forwarded-proto'] as string) || 'http'
  const host = req.headers.host || 'localhost:3000'
  return `${protocol}://${host}`
}

// Generic template-rendered email (called after server-side rendering)
async function sendViaResend(to: string, subject: string, html: string, text: string, fromName?: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[send-email] RESEND_API_KEY not set — mail not sent')
    return { ok: false, id: null, error: 'Email service not configured' }
  }
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@esopmanager.in'
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html, text }),
  })
  const data = await res.json()
  if (!res.ok) return { ok: false, id: null, error: data?.message || 'Resend error' }
  return { ok: true, id: data.id, error: null }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = req.body
  const { type } = body

  try {
    const baseUrl = getBaseUrl(req)

    if (type === 'rendered') {
      // Pre-rendered email — subject/html/text already substituted on client
      const { to, subject, html, text, fromName } = body
      if (!to || !subject) return res.status(400).json({ error: 'Missing required fields' })
      const result = await sendViaResend(to, subject, html || text || '', text || '', fromName)
      return res.status(result.ok ? 200 : 500).json({ id: result.id, error: result.error, provider: 'resend', status: result.ok ? 'sent' : 'failed' })
    }

    if (type === 'invite') {
      const { to, employeeName, loginLink, tempPassword, role, inviteKind, companyId } = body
      if (!to) return res.status(400).json({ error: 'Missing email' })
      const subject = inviteKind === 'employee'
        ? `Welcome to your Employee ESOP Portal`
        : `You are invited to ESOP Manager as ${role}`
      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px;margin:0 auto">
          <p>Hi <strong>${employeeName || 'there'}</strong>,</p>
          <p>${inviteKind === 'employee'
            ? 'Your employee account has been created on the ESOP portal.'
            : `You have been invited to join ESOP Manager as <strong>${role}</strong>.`}</p>
          <table style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;width:100%">
            <tr><td style="padding:6px 0"><strong>Email:</strong> ${to}</td></tr>
            <tr><td style="padding:6px 0"><strong>Temporary Password:</strong> <code style="background:#e5e7eb;padding:2px 6px;border-radius:4px">${tempPassword || '(see invite)'}</code></td></tr>
          </table>
          <p><a href="${loginLink || baseUrl + '/login'}" style="background:#111827;color:#fff;padding:12px 20px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600">Login to ESOP Manager →</a></p>
          <p style="color:#6b7280;font-size:12px">Please change your password after first login. If you were not expecting this, you can ignore this email.</p>
        </div>`
      const text = `Hi ${employeeName || 'there'},\n\nYou've been invited. Email: ${to}, Temp password: ${tempPassword}\nLogin: ${loginLink || baseUrl + '/login'}`
      const result = await sendViaResend(to, subject, html, text)
      return res.status(result.ok ? 200 : 500).json({ id: result.id, error: result.error, provider: 'resend', status: result.ok ? 'sent' : 'failed' })
    }

    if (type === 'grant-letter') {
      const { to, employeeName, grant, companyId } = body
      if (!to || !grant) return res.status(400).json({ error: 'Missing required fields' })
      const portalLink = `${baseUrl}/employee-portal`
      const subject = `Your ESOP Grant Letter — ${grant.grantNumber}`
      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px;margin:0 auto">
          <p>Hi <strong>${employeeName}</strong>,</p>
          <p>Congratulations! A new ESOP grant has been issued to you.</p>
          <table style="border-collapse:collapse;width:100%;margin:16px 0">
            <tr style="background:#f9fafb"><td style="padding:8px 12px;border:1px solid #e5e7eb"><strong>Grant Number</strong></td><td style="padding:8px 12px;border:1px solid #e5e7eb">${grant.grantNumber}</td></tr>
            <tr><td style="padding:8px 12px;border:1px solid #e5e7eb"><strong>Grant Date</strong></td><td style="padding:8px 12px;border:1px solid #e5e7eb">${grant.grantDate}</td></tr>
            <tr style="background:#f9fafb"><td style="padding:8px 12px;border:1px solid #e5e7eb"><strong>Grant Type</strong></td><td style="padding:8px 12px;border:1px solid #e5e7eb">${grant.grantType}</td></tr>
            <tr><td style="padding:8px 12px;border:1px solid #e5e7eb"><strong>Total Options</strong></td><td style="padding:8px 12px;border:1px solid #e5e7eb">${Number(grant.totalOptions).toLocaleString('en-IN')}</td></tr>
            <tr style="background:#f9fafb"><td style="padding:8px 12px;border:1px solid #e5e7eb"><strong>Exercise Price</strong></td><td style="padding:8px 12px;border:1px solid #e5e7eb">₹${grant.exercisePrice}</td></tr>
          </table>
          <p>Please log in to review your full grant letter and accept before the deadline.</p>
          <p><a href="${portalLink}" style="background:#2d5fa8;color:#fff;padding:12px 20px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600">View &amp; Accept Grant Letter →</a></p>
          <p style="color:#6b7280;font-size:12px">Once accepted, your grant is legally binding. Please read all terms carefully before accepting.</p>
        </div>`
      const text = `Hi ${employeeName},\n\nA new ESOP grant has been issued:\nGrant: ${grant.grantNumber}\nOptions: ${grant.totalOptions}\nExercise Price: ₹${grant.exercisePrice}\n\nReview at: ${portalLink}`
      const result = await sendViaResend(to, subject, html, text)
      return res.status(result.ok ? 200 : 500).json({ id: result.id, error: result.error, provider: 'resend', status: result.ok ? 'sent' : 'failed' })
    }

    if (type === 'otp') {
      const { to, otp, purpose } = body
      if (!to || !otp) return res.status(400).json({ error: 'Missing required fields' })
      const subject = `Your ESOP Manager verification code: ${otp}`
      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px;margin:0 auto">
          <p>Your one-time verification code for <strong>${purpose || 'grant acceptance'}</strong> is:</p>
          <div style="background:#f3f4f6;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
            <span style="font-size:36px;font-weight:900;letter-spacing:8px;font-family:monospace;color:#111827">${otp}</span>
          </div>
          <p style="color:#6b7280;font-size:13px">This code expires in 10 minutes. Do not share it with anyone.</p>
        </div>`
      const text = `Your ESOP Manager OTP: ${otp}\nExpires in 10 minutes.`
      const result = await sendViaResend(to, subject, html, text)
      return res.status(result.ok ? 200 : 500).json({ id: result.id, error: result.error, provider: 'resend', status: result.ok ? 'sent' : 'failed' })
    }

    return res.status(400).json({ error: `Unknown email type: ${type}` })
  } catch (err: any) {
    console.error('[send-email] Error:', err)
    return res.status(500).json({ error: err.message || 'Internal error', provider: 'resend', status: 'failed' })
  }
}
