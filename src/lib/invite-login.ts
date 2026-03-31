import { Auth, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth'
import { Firestore, collection, getDocs, limit, query, where } from 'firebase/firestore'

const EMAIL_FOR_SIGN_IN_KEY = 'emailForSignIn'

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

export function clearEmailForInviteSignIn() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY)
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

interface CompleteInviteSignInInput {
  auth: Auth
  email?: string | null
  href: string
}

export async function completeInviteEmailLinkSignIn(input: CompleteInviteSignInInput) {
  const normalizedEmail = normalizeEmail(input.email)
  if (!normalizedEmail) {
    throw new Error('Could not determine your invite email. Please use manual sign in.')
  }

  if (!isSignInWithEmailLink(input.auth, input.href)) {
    throw new Error('This invite link is invalid or expired. Please request a new invite link.')
  }

  await signInWithEmailLink(input.auth, normalizedEmail, input.href)
  clearEmailForInviteSignIn()
}
