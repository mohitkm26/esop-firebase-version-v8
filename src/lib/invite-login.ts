import { Auth, createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth'
import { Firestore, collection, getDocs, limit, query, where } from 'firebase/firestore'

const EMAIL_FOR_SIGN_IN_KEY = 'emailForSignIn'
const INVITE_TOKEN_KEY = 'pendingInviteToken'

function normalizeEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase()
}

export function storeEmailForInviteSignIn(email?: string | null) {
  if (typeof window === 'undefined') return
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return
  window.localStorage.setItem(EMAIL_FOR_SIGN_IN_KEY, normalizedEmail)
}

export function getEmailForInviteSignIn(fallbackEmail?: string | null): string {
  const fallback = normalizeEmail(fallbackEmail)
  if (typeof window === 'undefined') return fallback

  const storedEmail = normalizeEmail(window.localStorage.getItem(EMAIL_FOR_SIGN_IN_KEY))
  return storedEmail || fallback
}

export function storeInviteToken(token?: string | null) {
  if (typeof window === 'undefined') return
  const normalizedToken = (token || '').trim()
  if (!normalizedToken) return
  window.localStorage.setItem(INVITE_TOKEN_KEY, normalizedToken)
}

export function clearInviteLoginStorage() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY)
  window.localStorage.removeItem(INVITE_TOKEN_KEY)
}

export async function validateInviteToken(db: Firestore, token?: string | null, email?: string | null) {
  const normalizedToken = (token || '').trim()
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedToken || !normalizedEmail) return false

  const inviteQuery = query(
    collection(db, 'invites'),
    where('token', '==', normalizedToken),
    where('email', '==', normalizedEmail),
    where('status', 'in', ['pending', 'accepted']),
    limit(1),
  )

  const inviteSnap = await getDocs(inviteQuery)
  return !inviteSnap.empty
}

async function getInviteTempPassword(db: Firestore, token: string, email: string) {
  const inviteQuery = query(
    collection(db, 'invites'),
    where('token', '==', token),
    where('email', '==', email),
    where('status', 'in', ['pending', 'accepted']),
    limit(1),
  )
  const inviteSnap = await getDocs(inviteQuery)
  if (inviteSnap.empty) return null
  const inviteData = inviteSnap.docs[0].data() as { tempPassword?: string }
  return inviteData.tempPassword || null
}

interface HandleInviteLoginInput {
  auth: Auth
  db: Firestore
  email?: string | null
  inviteToken?: string | null
  tempPassword?: string
}

export async function handleInviteLogin(input: HandleInviteLoginInput) {
  const inviteEmail = getEmailForInviteSignIn(input.email)
  const inviteToken = (input.inviteToken || '').trim()
  let tempPassword = input.tempPassword || ''

  if (!inviteEmail) {
    throw new Error('Invite email is missing. Please use manual sign in.')
  }

  if (inviteToken) {
    const validInvite = await validateInviteToken(input.db, inviteToken, inviteEmail)
    if (!validInvite) {
      throw new Error('Invite token is invalid or expired. Please request a new invite.')
    }
    if (!tempPassword) {
      tempPassword = (await getInviteTempPassword(input.db, inviteToken, inviteEmail)) || ''
    }
  }

  if (!tempPassword) {
    throw new Error('Invite credentials are missing. Please request a fresh invite from your admin.')
  }

  try {
    await signInWithEmailAndPassword(input.auth, inviteEmail, tempPassword)
    console.info('[invite-login] Existing user auto-login succeeded', { inviteEmail })
  } catch (signInError: any) {
    console.info('[invite-login] Sign-in failed, attempting invite account bootstrap', {
      inviteEmail,
      code: signInError?.code || 'unknown',
    })

    try {
      await createUserWithEmailAndPassword(input.auth, inviteEmail, tempPassword)
      console.info('[invite-login] Invite user created', { inviteEmail })
    } catch (createError: any) {
      if (createError?.code === 'auth/email-already-in-use') {
        try {
          await sendPasswordResetEmail(input.auth, inviteEmail)
          throw new Error('Account already exists with a different password. We sent a password reset email. Please reset password and sign in.')
        } catch (resetError: any) {
          console.error('[invite-login] Could not send password reset email', {
            inviteEmail,
            code: resetError?.code || 'unknown',
          })
          throw new Error('Account already exists with a different password. Please use "Forgot password" to reset and sign in.')
        }
      }
      throw createError
    }

    await signInWithEmailAndPassword(input.auth, inviteEmail, tempPassword)
    console.info('[invite-login] Invite user signed in after creation', { inviteEmail })
  }

  clearInviteLoginStorage()
}
