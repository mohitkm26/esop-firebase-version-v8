import { addDoc, collection } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { sendEmail } from '@/lib/email'
import { storeEmailForInviteSignIn } from '@/lib/invite-login'

export type InviteKind = 'user' | 'employee'

export interface CreateInviteInput {
  companyId: string
  email: string
  role: string
  invitedBy: string
  inviteKind: InviteKind
  employeeId?: string
}

export interface InviteEmailPayload {
  email: string
  role: string
  inviteLink: string
  inviteKind: InviteKind
  companyId: string
  employeeName: string
}

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes)
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(arr)
  } else {
    for (let i = 0; i < bytes; i += 1) arr[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(arr).map(v => v.toString(16).padStart(2, '0')).join('')
}

export function generateInviteToken() {
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.randomUUID) return `${cryptoApi.randomUUID()}-${randomHex(8)}`
  return `${Date.now().toString(36)}-${randomHex(20)}`
}

export function buildInviteLink(token: string, email: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')
  const params = new URLSearchParams({ invite: token, email: email.toLowerCase() })
  return `${appUrl}/login?${params.toString()}`
}

export async function createInviteRecord(db: Firestore, input: CreateInviteInput) {
  const createdAt = new Date().toISOString()
  const token = generateInviteToken()
  const inviteLink = buildInviteLink(token, input.email)

  const inviteData: Record<string, unknown> = {
    companyId: input.companyId,
    email: input.email.toLowerCase(),
    role: input.role,
    inviteKind: input.inviteKind,
    invitedBy: input.invitedBy,
    token,
    inviteLink,
    status: 'pending',
    used: false,
    createdAt,
    updatedAt: createdAt,
    sentAt: null,
    lastSendAttemptAt: null,
    emailProvider: 'mock',
    emailStatus: 'pending',
  }

  if (input.employeeId) inviteData.employeeId = input.employeeId

  const inviteRef = await addDoc(collection(db, 'invites'), inviteData)
  return { id: inviteRef.id, token, inviteLink, createdAt }
}

export async function sendInviteEmail(payload: InviteEmailPayload) {
  storeEmailForInviteSignIn(payload.email)

  const result = await sendEmail({
    type: 'invite',
    to: payload.email,
    role: payload.role,
    inviteKind: payload.inviteKind,
    employeeName: payload.employeeName,
    loginLink: payload.inviteLink,
    companyId: payload.companyId,
  })

  return {
    provider: result.provider,
    sent: result.ok,
    status: result.status,
    error: result.error,
  }
}
