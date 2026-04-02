import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { auth, db } from './firebase'
import { onAuthStateChanged, User, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, getDocs, collection, query, where } from 'firebase/firestore'

export interface Profile {
  uid: string; email: string; name: string; photo: string
  role: string; isActive: boolean; companyId: string; employeeId?: string
}

interface AuthCtx {
  user: User|null; profile: Profile|null; loading: boolean; blocked: boolean
  effectiveRole: string
  employeeView: boolean
  canSwitchProfiles: boolean
  switchProfileView: (view: 'admin'|'employee') => void
  refreshProfile: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({
  user:null, profile:null, loading:true, blocked:false,
  effectiveRole:'', employeeView:false, canSwitchProfiles:false,
  switchProfileView: ()=>{}, refreshProfile: async()=>{}
})
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User|null>(null)
  const [profile, setProfile] = useState<Profile|null>(null)
  const [loading, setLoading] = useState(true)
  const [blocked, setBlocked] = useState(false)
  const [employeeView, setEmployeeView] = useState(false)

  async function loadProfile(u: User) {
    const normalizedEmail = (u.email || '').trim().toLowerCase()
    console.debug('[auth] normalized login email:', normalizedEmail)
    const pendingInviteToken = typeof window !== 'undefined' ? sessionStorage.getItem('pendingInviteToken') : null
    const profileRef  = doc(db, 'users', u.uid)
    const profileSnap = await getDoc(profileRef)

    // A. Returning user
    if (profileSnap.exists()) {
      const existing = profileSnap.data() as Profile
      if (existing.isActive === false) {
        await signOut(auth); setUser(null); setProfile(null); setBlocked(true); return
      }
      setProfile(existing); return
    }

    // B. Check if first ever user → superAdmin
    const allUsers = await getDocs(collection(db, 'users'))
    if (allUsers.empty) {
      const p: Profile = {
        uid: u.uid, email: normalizedEmail, name: u.displayName||normalizedEmail,
        photo: u.photoURL||'', role: 'superAdmin', isActive: true, companyId: 'PLATFORM',
      }
      await setDoc(profileRef, { ...p, createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() })
      setProfile(p); return
    }

    // C. Check invite
    const inviteQuery = pendingInviteToken
      ? query(
        collection(db,'invites'),
        where('email','==',normalizedEmail),
        where('token','==',pendingInviteToken),
        where('status','==','pending')
      )
      : query(collection(db,'invites'), where('email','==',normalizedEmail), where('status','==','pending'))

    const inviteSnap = await getDocs(inviteQuery)
    if (!inviteSnap.empty) {
      const inviteDoc = inviteSnap.docs[0]
      const invite = inviteDoc.data()
      const p: Profile = {
        uid: u.uid, email: normalizedEmail, name: u.displayName||normalizedEmail,
        photo: u.photoURL||'', role: invite.role||'employee', isActive: true,
        companyId: invite.companyId,
        ...(invite.employeeId ? { employeeId: invite.employeeId } : {}),
      }
      await setDoc(profileRef, { ...p, createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() })
      await setDoc(inviteDoc.ref, {
        ...invite,
        used: true,
        status: 'accepted',
        usedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      if (typeof window !== 'undefined') sessionStorage.removeItem('pendingInviteToken')
      setProfile(p); return
    }

    // D. Authorization by users collection email lookup (legacy profile records by non-UID doc ids).
    const userByEmailSnap = await getDocs(query(collection(db, 'users'), where('email', '==', normalizedEmail)))
    console.debug('[auth] users query result:', { email: normalizedEmail, count: userByEmailSnap.size })
    if (!userByEmailSnap.empty) {
      const matchedUserData = userByEmailSnap.docs[0].data() as Partial<Profile>
      const p: Profile = {
        uid: u.uid,
        email: normalizedEmail,
        name: matchedUserData.name || u.displayName || normalizedEmail,
        photo: matchedUserData.photo || u.photoURL || '',
        role: matchedUserData.role || 'employee',
        isActive: matchedUserData.isActive !== false,
        companyId: matchedUserData.companyId || '',
        ...(matchedUserData.employeeId ? { employeeId: matchedUserData.employeeId } : {}),
      }
      if (!p.companyId) {
        setProfile(null)
        setBlocked(true)
        await signOut(auth)
        return
      }
      await setDoc(profileRef, { ...matchedUserData, ...p, lastLoginAt: new Date().toISOString() }, { merge: true })
      setProfile(p)
      return
    }

    // E. Not authorized (no users record for this email).
    setProfile(null)
    setBlocked(true)
    await signOut(auth)
  }

  const refreshProfile = async () => {
    if (!user) return
    const snap = await getDoc(doc(db,'users',user.uid))
    if (snap.exists()) setProfile(snap.data() as Profile)
  }

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('profile_view_mode') : null
    setEmployeeView(stored === 'employee')
  }, [])

  useEffect(() => {
    if (!profile?.employeeId && employeeView) {
      setEmployeeView(false)
      if (typeof window !== 'undefined') localStorage.setItem('profile_view_mode', 'admin')
    }
  }, [profile?.employeeId, employeeView])

  const canSwitchProfiles = Boolean(profile?.employeeId && profile?.role && profile.role !== 'employee')
  const effectiveRole = employeeView && profile?.employeeId ? 'employee' : (profile?.role || '')

  function switchProfileView(view: 'admin'|'employee') {
    const nextEmployeeView = view === 'employee'
    if (nextEmployeeView && !profile?.employeeId) return
    setEmployeeView(nextEmployeeView)
    if (typeof window !== 'undefined') localStorage.setItem('profile_view_mode', nextEmployeeView ? 'employee' : 'admin')
  }

  useEffect(() => {
    return onAuthStateChanged(auth, async u => {
      setUser(u); setBlocked(false)
      if (!u) { setProfile(null); setLoading(false); return }
      try { await loadProfile(u) } catch(e) { console.error('Auth error:', e) }
      setLoading(false)
    })
  }, [])

  return (
    <Ctx.Provider value={{
      user, profile, loading, blocked, refreshProfile,
      effectiveRole, employeeView, canSwitchProfiles, switchProfileView,
    }}>
      {children}
    </Ctx.Provider>
  )
}
