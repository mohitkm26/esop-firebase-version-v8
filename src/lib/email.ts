export interface InviteEmailRequest {
  type: 'invite'
  to: string
  employeeName: string
  loginLink: string
  tempPassword: string
  role: string
  inviteKind: 'user' | 'employee'
  companyId: string
}

export interface GrantEmailRequest {
  type: 'grant-letter'
  to: string
  employeeName: string
  grant: {
    grantNumber: string
    grantDate: string
    grantType: string
    totalOptions: number
    exercisePrice: number
  }
  companyId: string
}

type SendEmailRequest = InviteEmailRequest | GrantEmailRequest

export interface SendEmailResponse {
  ok: boolean
  provider: 'resend'
  id?: string
  status: 'sent' | 'failed'
  error?: string
}

export async function sendEmail(request: SendEmailRequest): Promise<SendEmailResponse> {
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    const data = await response.json()
    if (!response.ok) {
      return {
        ok: false,
        provider: 'resend',
        status: 'failed',
        error: data?.error || 'Email delivery failed',
      }
    }

    return {
      ok: true,
      provider: 'resend',
      id: data.id,
      status: 'sent',
    }
  } catch (error: any) {
    return {
      ok: false,
      provider: 'resend',
      status: 'failed',
      error: error?.message || 'Unexpected email error',
    }
  }
}

export function sendGrantLetterEmail(input: Omit<GrantEmailRequest, 'type'>) {
  return sendEmail({ ...input, type: 'grant-letter' })
}
