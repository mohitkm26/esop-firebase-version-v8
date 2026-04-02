import type { NextApiRequest, NextApiResponse } from 'next'

const RESEND_API_URL = 'https://api.resend.com/emails'

function getBaseUrl(req: NextApiRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) return appUrl

  const protocol = (req.headers['x-forwarded-proto'] as string) || 'http'
  const host = req.headers.host || 'localhost:3000'
  return `${protocol}://${host}`
}

function inviteTemplate({
  employeeName,
  loginLink,
  role,
  loginEmail,
  tempPassword,
}: {
  employeeName: string
  loginLink: string
  role: string
  loginEmail: string
  tempPassword: string
}) {
  const text = [
    `Hi ${employeeName},`,
    '',
    `You've been invited to join ESOP Manager as ${role}.`,
    `Login ID: ${loginEmail}`,
    `Temporary password: ${tempPassword}`,
    `Login link: ${loginLink}`,
    '',
    'Please change your password after your first login.',
    '',
    'If you were not expecting this invite, you can ignore this email.',
  ].join('\n')

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <p>Hi <strong>${employeeName}</strong>,</p>
      <p>You've been invited to join ESOP Manager as <strong>${role}</strong>.</p>
      <p>
        <strong>Login ID:</strong> ${loginEmail}<br/>
        <strong>Temporary password:</strong> ${tempPassword}
      </p>
      <p>
        <a href="${loginLink}" style="display:inline-block;padding:10px 14px;background:#111827;color:white;text-decoration:none;border-radius:6px;">
          Login to ESOP Manager
        </a>
      </p>
      <p>If the button does not work, use this link: <a href="${loginLink}">${loginLink}</a></p>
      <p>Please change your password after your first login.</p>
      <p style="color:#6b7280;font-size:12px;">If you were not expecting this invite, you can ignore this email.</p>
    </div>
  `

  return { text, html, subject: 'You are invited to ESOP Manager' }
}

function grantTemplate({
  employeeName,
  grant,
}: {
  employeeName: string
  grant: { grantNumber: string; grantDate: string; grantType: string; totalOptions: number; exercisePrice: number }
}) {
  const text = [
    `Hi ${employeeName},`,
    '',
    'Your ESOP grant letter is now available.',
    '',
    `Grant Number: ${grant.grantNumber}`,
    `Grant Date: ${grant.grantDate}`,
    `Grant Type: ${grant.grantType}`,
    `Total Options: ${grant.totalOptions}`,
    `Exercise Price: ${grant.exercisePrice}`,
  ].join('\n')

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <p>Hi <strong>${employeeName}</strong>,</p>
      <p>Your ESOP grant letter is now available.</p>
      <table style="border-collapse:collapse;width:100%;max-width:460px">
        <tr><td style="padding:6px;border:1px solid #e5e7eb">Grant Number</td><td style="padding:6px;border:1px solid #e5e7eb"><strong>${grant.grantNumber}</strong></td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb">Grant Date</td><td style="padding:6px;border:1px solid #e5e7eb">${grant.grantDate}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb">Grant Type</td><td style="padding:6px;border:1px solid #e5e7eb">${grant.grantType}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb">Total Options</td><td style="padding:6px;border:1px solid #e5e7eb">${grant.totalOptions}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb">Exercise Price</td><td style="padding:6px;border:1px solid #e5e7eb">${grant.exercisePrice}</td></tr>
      </table>
      <p style="color:#6b7280;font-size:12px;">Please log in to your ESOP dashboard for full details.</p>
    </div>
  `

  return { text, html, subject: `Grant Letter: ${grant.grantNumber}` }
}

async function sendWithResend(input: {
  to: string
  subject: string
  text: string
  html: string
  from: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'Missing RESEND_API_KEY environment variable' }
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  const data = await response.json()
  if (!response.ok) {
    return {
      ok: false,
      error: data?.message || data?.error || 'Resend email send failed',
    }
  }

  return { ok: true, id: data?.id }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = req.body || {}
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'ESOP Manager <no-reply@example.com>'

    if (!body.to || !body.type || !body.employeeName) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    let payload: { subject: string; text: string; html: string }

    if (body.type === 'invite') {
      if (!body.loginLink || !body.tempPassword || !body.to) {
        return res.status(400).json({ error: 'Missing login credentials for invite email' })
      }
      payload = inviteTemplate({
        employeeName: body.employeeName,
        loginLink: body.loginLink,
        role: body.role || 'employee',
        loginEmail: body.to,
        tempPassword: body.tempPassword,
      })
    } else if (body.type === 'grant-letter') {
      if (!body.grant) {
        return res.status(400).json({ error: 'Missing grant details for grant-letter email' })
      }
      payload = grantTemplate({ employeeName: body.employeeName, grant: body.grant })
    } else {
      return res.status(400).json({ error: 'Unsupported email type' })
    }

    const result = await sendWithResend({
      from: fromEmail,
      to: body.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    })

    if (!result.ok) {
      console.error('[email:resend:error]', {
        error: result.error,
        type: body.type,
        to: body.to,
        companyId: body.companyId || null,
        baseUrl: getBaseUrl(req),
      })
      return res.status(502).json({ error: result.error })
    }

    return res.status(200).json({ ok: true, id: result.id, provider: 'resend' })
  } catch (error: any) {
    console.error('[email:api:error]', error)
    return res.status(500).json({ error: error?.message || 'Unexpected server error' })
  }
}
