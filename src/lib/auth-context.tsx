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
  refreshProfile: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({ user:null, profile:null, loading:true, blocked:false, refreshProfile: async()=>{} })
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User|null>(null)
  const [profile, setProfile] = useState<Profile|null>(null)
  const [loading, setLoading] = useState(true)
  const [blocked, setBlocked] = useState(false)

  async function loadProfile(u: User) {
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
        uid: u.uid, email: u.email!, name: u.displayName||u.email!,
        photo: u.photoURL||'', role: 'superAdmin', isActive: true, companyId: 'PLATFORM',
      }
      await setDoc(profileRef, { ...p, createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() })
      setProfile(p); return
    }

    // C. Check invite
    const inviteSnap = await getDocs(
      query(collection(db,'invites'), where('email','==',u.email!.toLowerCase()), where('used','==',false))
    )
    if (!inviteSnap.empty) {
      const inviteDoc = inviteSnap.docs[0]
      const invite = inviteDoc.data()
      const p: Profile = {
        uid: u.uid, email: u.email!, name: u.displayName||u.email!,
        photo: u.photoURL||'', role: invite.role||'employee', isActive: true,
        companyId: invite.companyId,
        ...(invite.employeeId ? { employeeId: invite.employeeId } : {}),
      }
      await setDoc(profileRef, { ...p, createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() })
      await setDoc(inviteDoc.ref, { ...invite, used: true, usedAt: new Date().toISOString() })
      setProfile(p); return
    }

    // D. Check employees across companies (email match)
    const [r1, r2] = await Promise.all([
      getDocs(query(collection(db,'employees'), where('email','==',u.email!))),
      getDocs(query(collection(db,'employees'), where('officialEmail','==',u.email!))),
    ])
    const matchedEmp = [...r1.docs, ...r2.docs][0]
    if (matchedEmp) {
      const empData = matchedEmp.data()
      const p: Profile = {
        uid: u.uid, email: u.email!, name: u.displayName||u.email!,
        photo: u.photoURL||'', role: 'employee', isActive: true,
        employeeId: matchedEmp.id, companyId: empData.companyId,
      }
      await setDoc(profileRef, { ...p, createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() })
      setProfile(p); return
    }

    // E. No match → new company signup → redirect to onboarding
    // Create minimal profile, onboarding will complete it
    const p: Profile = {
      uid: u.uid, email: u.email!, name: u.displayName||u.email!,
      photo: u.photoURL||'', role: 'companyAdmin', isActive: true, companyId: u.uid,
    }
    await setDoc(profileRef, { ...p, createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString(), needsOnboarding: true })
    setProfile(p)
  }

  const refreshProfile = async () => {
    if (!user) return
    const snap = await getDoc(doc(db,'users',user.uid))
    if (snap.exists()) setProfile(snap.data() as Profile)
  }

  useEffect(() => {
    return onAuthStateChanged(auth, async u => {
      setUser(u); setBlocked(false)
      if (!u) { setProfile(null); setLoading(false); return }
      try { await loadProfile(u) } catch(e) { console.error('Auth error:', e) }
      setLoading(false)
    })
  }, [])

  return <Ctx.Provider value={{ user, profile, loading, blocked, refreshProfile }}>{children}</Ctx.Provider>
}
