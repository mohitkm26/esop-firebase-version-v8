import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'

// Simple HMAC-based OTP. No DB needed — encode expiry in the token.
// Format: TOTP = HMAC(secret, floor(timestamp/600) + purpose + email)

const SECRET = process.env.OTP_SECRET || 'esop-otp-secret-change-in-production'

function generateOTP(email: string, purpose: string): { otp: string; hash: string } {
  const window = Math.floor(Date.now() / 600000) // 10-minute window
  const otp = String(parseInt(
    crypto.createHmac('sha256', SECRET).update(`${window}:${purpose}:${email}`).digest('hex').slice(0, 6),
    16
  ) % 1000000).padStart(6, '0')
  const hash = crypto.createHmac('sha256', SECRET).update(`${window}:${otp}:${email}`).digest('hex')
  return { otp, hash }
}

export function verifyOTPHash(email: string, otp: string, hash: string): boolean {
  // Check current and previous window (20 min total grace)
  const now = Math.floor(Date.now() / 600000)
  for (const w of [now, now - 1]) {
    const expected = crypto.createHmac('sha256', SECRET).update(`${w}:${otp}:${email}`).digest('hex')
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) return true
  }
  return false
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, email, otp, hash, purpose = 'grant_acceptance' } = req.body

  if (action === 'generate') {
    if (!email) return res.status(400).json({ error: 'Email required' })
    const { otp, hash } = generateOTP(email.toLowerCase(), purpose)
    // Send OTP via email
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://${req.headers.host}`
      await fetch(`${baseUrl}/api/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'otp', to: email, otp, purpose }),
      })
    } catch (_) { /* non-fatal */ }
    return res.status(200).json({ hash, message: 'OTP sent' })
  }

  if (action === 'verify') {
    if (!email || !otp || !hash) return res.status(400).json({ error: 'email, otp, hash required' })
    const valid = verifyOTPHash(email.toLowerCase(), otp, hash)
    if (!valid) return res.status(400).json({ error: 'Invalid or expired OTP' })
    // Generate a signed acceptance token valid for 5 minutes
    const acceptToken = crypto.createHmac('sha256', SECRET)
      .update(`accept:${email}:${Math.floor(Date.now() / 300000)}`)
      .digest('hex')
    return res.status(200).json({ valid: true, acceptToken })
  }

  return res.status(400).json({ error: 'Unknown action' })
}
