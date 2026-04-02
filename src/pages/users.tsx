import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, deleteDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import { logAudit } from '@/lib/audit'
import { canAdmin, ASSIGNABLE_ROLES, ROLE_LABELS, ROLE_COLORS, type Role } from '@/lib/roles'
import { createInviteRecord, sendInviteEmail } from '@/lib/invites'

type UserRecord = {
  id: string
  email?: string
  name?: string
  role?: Role
  sourceCollection?: 'profiles' | 'users'
  status?: string
  isActive?: boolean
}

export default function UsersPage() {
  const { user, profile, loading } = useAuth()
  const { companyId } = usePlan()
  const router = useRouter()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [invites, setInvites] = useState<any[]>([])
  const [busy, setBusy] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('employee')
  const [inviting, setInviting] = useState(false)
  const [savingUserId, setSavingUserId] = useState<string>('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const isActiveUser = (u: UserRecord) => u?.status === 'active' || (u?.status == null && u?.isActive !== false)

  async function loadData() {
    if (!user || !companyId) return
    setBusy(true)
    const [profilesSnap, usersSnap, invitesSnap] = await Promise.all([
      getDocs(query(collection(db, 'profiles'), where('companyId', '==', companyId))),
      getDocs(query(collection(db, 'users'), where('companyId', '==', companyId))),
      getDocs(query(collection(db, 'invites'), where('companyId', '==', companyId), where('status', '==', 'pending'))),
    ])

    const fromProfiles = profilesSnap.docs.map(d => ({ id: d.id, sourceCollection: 'profiles' as const, ...d.data() }))
    const fromUsers = usersSnap.docs.map(d => ({ id: d.id, sourceCollection: 'users' as const, ...d.data() }))

    const mergedByEmail = new Map<string, any>()
    ;[...fromUsers, ...fromProfiles].forEach((u: any) => {
      const email = (u.email || '').toLowerCase()
      const key = email || `${u.sourceCollection}:${u.id}`
      const prev = mergedByEmail.get(key)
      mergedByEmail.set(key, prev ? { ...prev, ...u } : u)
    })

    setUsers(Array.from(mergedByEmail.values()))
    setInvites(invitesSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    setBusy(false)
  }

  useEffect(() => { if (!loading && !user) router.push('/login') }, [user, loading])
  useEffect(() => { loadData() }, [user, companyId])

  const activeUsers = users.filter(isActiveUser)

  async function updateEveryUserDoc(target: UserRecord, payload: Record<string, any>) {
    const refs = new Set<string>()

    refs.add(`${target.sourceCollection || 'profiles'}:${target.id}`)

    const email = (target.email || '').toLowerCase()
    if (email) {
      const [profilesByEmail, usersByEmail] = await Promise.all([
        getDocs(query(collection(db, 'profiles'), where('email', '==', email))),
        getDocs(query(collection(db, 'users'), where('email', '==', email))),
      ])
      profilesByEmail.docs.forEach(d => refs.add(`profiles:${d.id}`))
      usersByEmail.docs.forEach(d => refs.add(`users:${d.id}`))
    }

    await Promise.all(Array.from(refs).map(async ref => {
      const [collectionName, id] = ref.split(':')
      await updateDoc(doc(db, collectionName, id), payload)
    }))
  }

  async function deleteEveryUserDoc(target: UserRecord) {
    const refs = new Set<string>()

    refs.add(`${target.sourceCollection || 'profiles'}:${target.id}`)

    const email = (target.email || '').toLowerCase()
    if (email) {
      const [profilesByEmail, usersByEmail] = await Promise.all([
        getDocs(query(collection(db, 'profiles'), where('email', '==', email))),
        getDocs(query(collection(db, 'users'), where('email', '==', email))),
      ])
      profilesByEmail.docs.forEach(d => refs.add(`profiles:${d.id}`))
      usersByEmail.docs.forEach(d => refs.add(`users:${d.id}`))
    }

    await Promise.all(Array.from(refs).map(async ref => {
      const [collectionName, id] = ref.split(':')
      await deleteDoc(doc(db, collectionName, id))
    }))
  }

  async function invite() {
    if (!inviteEmail) { setErr('Email is required'); return }
    setInviting(true); setErr(''); setMsg('')
    const existing = users.find(u => u.email?.toLowerCase() === inviteEmail.toLowerCase())
    if (existing) { setErr('User already has access.'); setInviting(false); return }
    try {
      const invite = await createInviteRecord(db, {
        companyId,
        email: inviteEmail,
        role: inviteRole,
        invitedBy: user!.uid,
        inviteKind: 'user',
      })

      const emailResult = await sendInviteEmail({
        email: inviteEmail.toLowerCase(),
        role: inviteRole,
        inviteLink: invite.inviteLink,
        inviteKind: 'user',
        companyId,
        employeeName: inviteEmail.split('@')[0] || 'there',
      })

      await updateDoc(doc(db, 'invites', invite.id), {
        sentAt: new Date().toISOString(),
        lastSendAttemptAt: new Date().toISOString(),
        emailStatus: emailResult.sent ? 'sent' : emailResult.status,
      })

      await logAudit({
        companyId,
        userId: user!.uid,
        userEmail: profile?.email || '',
        entityType: 'user',
        entityId: invite.id,
        action: 'user_invited',
        after: { email: inviteEmail, role: inviteRole, inviteLink: invite.inviteLink },
      })

      setInvites(prev => [...prev, {
        id: invite.id,
        email: inviteEmail.toLowerCase(),
        role: inviteRole,
        used: false,
        status: 'pending',
        createdAt: invite.createdAt,
        inviteLink: invite.inviteLink,
      }])
      setMsg(`Invite generated for ${inviteEmail}. Link: ${invite.inviteLink}`)
      setInviteEmail('')
    } catch (e: any) {
      setErr(e.message || 'Failed to create invite')
    } finally {
      setInviting(false)
    }
  }

  async function changeRole(uid: string, newRole: Role) {
    const target = users.find(u => u.id === uid)
    if (!target || !companyId || !user) return
    setSavingUserId(uid); setErr(''); setMsg('')
    try {
      await updateEveryUserDoc(target, { role: newRole })
      await logAudit({ companyId, userId: user.uid, userEmail: profile?.email || '', entityType: 'user', entityId: uid, action: 'user_role_changed', after: { role: newRole } })
      setUsers(prev => prev.map(u => u.id === uid ? { ...u, role: newRole } : u))
      setMsg('User role updated successfully.')
    } catch (e: any) {
      setErr(e.message || 'Failed to update role')
    } finally {
      setSavingUserId('')
    }
  }

  async function updateUser(uid: string, updates: { name: string; email: string }) {
    const target = users.find(u => u.id === uid)
    if (!target || !companyId || !user) return
    setSavingUserId(uid); setErr(''); setMsg('')
    try {
      await updateEveryUserDoc(target, {
        name: updates.name.trim(),
        email: updates.email.trim().toLowerCase(),
      })
      await logAudit({ companyId, userId: user.uid, userEmail: profile?.email || '', entityType: 'user', entityId: uid, action: 'employee_updated', after: updates })
      await loadData()
      setMsg('User updated successfully.')
    } catch (e: any) {
      setErr(e.message || 'Failed to update user')
    } finally {
      setSavingUserId('')
    }
  }

  async function toggleActive(uid: string, isActive: boolean) {
    const target = users.find(u => u.id === uid)
    if (!target || !companyId || !user) return
    const nextActive = !isActive
    setSavingUserId(uid); setErr(''); setMsg('')
    try {
      await updateEveryUserDoc(target, {
        isActive: nextActive,
        status: nextActive ? 'active' : 'blocked',
      })
      setUsers(prev => prev.map(u => u.id === uid ? { ...u, isActive: nextActive, status: nextActive ? 'active' : 'blocked' } : u))
      setMsg(`User ${nextActive ? 'unblocked' : 'blocked'} successfully.`)
    } catch (e: any) {
      setErr(e.message || 'Failed to update user status')
    } finally {
      setSavingUserId('')
    }
  }

  async function removeUser(uid: string) {
    const target = users.find(u => u.id === uid)
    if (!target || !companyId || !user) return
    if (!confirm(`Delete ${target.email || 'this user'}? This cannot be undone.`)) return
    setSavingUserId(uid); setErr(''); setMsg('')
    try {
      await deleteEveryUserDoc(target)
      await logAudit({ companyId, userId: user.uid, userEmail: profile?.email || '', entityType: 'user', entityId: uid, action: 'user_removed', after: { email: target.email || '', name: target.name || '' } })
      setUsers(prev => prev.filter(u => u.id !== uid))
      setMsg('User deleted successfully.')
    } catch (e: any) {
      setErr(e.message || 'Failed to delete user')
    } finally {
      setSavingUserId('')
    }
  }

  if (loading || busy) return <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner-lg" /></div>
  if (!canAdmin(profile?.role)) return <Layout><div className="p-8 text-muted">Admin access required.</div></Layout>

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-start justify-between mb-7">
          <div>
            <h1 className="page-title">Users & Access</h1>
            <p className="text-muted text-sm mt-1">{activeUsers.length} active users · {invites.length} pending invites</p>
          </div>
        </div>

        <div className="card mb-6">
          <h2 className="section-title mb-4">Invite User</h2>
          {msg && <div className="alert-success mb-4">{msg}</div>}
          {err && <div className="alert-danger mb-4">{err}</div>}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label className="label">Email address</label>
              <input className="input" type="email" placeholder="colleague@company.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
            </div>
            <div style={{ width: 180 }}>
              <label className="label">Role</label>
              <select className="input" value={inviteRole} onChange={e => setInviteRole(e.target.value as Role)}>
                {ASSIGNABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            <button onClick={invite} disabled={inviting} className="btn btn-primary">
              {inviting ? '⏳ Inviting...' : '+ Send Invite'}
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
            User must sign in with the invited email to activate their account. The invite link is the same as your app URL.
          </p>
        </div>

        {invites.length > 0 && (
          <div className="card mb-6">
            <h2 className="section-title mb-4">Pending Invites</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {invites.map((inv: any) => (
                <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <span style={{ flex: 1, fontSize: 13 }}>{inv.email}</span>
                  <span className={`badge ${(ROLE_COLORS as any)[inv.role] || 'badge-muted'}`}>{(ROLE_LABELS as any)[inv.role] || inv.role}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Pending</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)' }}>
            <h2 className="section-title">Users</h2>
          </div>
          <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th className="th">User</th><th className="th">Role</th>
                <th className="th">Status</th><th className="th">Actions</th>
              </tr></thead>
              <tbody>
                {users.map((u: UserRecord) => {
                  const active = isActiveUser(u)
                  return (
                    <tr key={u.id}>
                      <td className="td">
                        <div style={{ fontWeight: 600 }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{u.email}</div>
                      </td>
                      <td className="td">
                        {u.id === profile?.uid ? (
                          <span className={`badge ${(ROLE_COLORS as any)[u.role || 'employee'] || 'badge-muted'}`}>{(ROLE_LABELS as any)[u.role || 'employee'] || u.role}</span>
                        ) : (
                          <select className="input" style={{ padding: '4px 8px', fontSize: 12, width: 150 }} value={u.role || 'employee'}
                            disabled={savingUserId === u.id}
                            onChange={e => changeRole(u.id, e.target.value as Role)}>
                            {ASSIGNABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="td">
                        <span className={`badge ${active ? 'badge-green' : 'badge-red'}`}>{active ? 'Active' : 'Blocked'}</span>
                      </td>
                      <td className="td">
                        {u.id !== profile?.uid && (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              disabled={savingUserId === u.id}
                              onClick={() => {
                                const nextName = prompt('Update name', u.name || '')
                                if (nextName == null) return
                                const nextEmail = prompt('Update email', u.email || '')
                                if (nextEmail == null) return
                                updateUser(u.id, { name: nextName, email: nextEmail })
                              }}
                              className="btn btn-sm btn-ghost"
                            >
                              Edit
                            </button>
                            <button disabled={savingUserId === u.id} onClick={() => toggleActive(u.id, active)} className="btn btn-sm btn-danger">
                              {active ? 'Block' : 'Unblock'}
                            </button>
                            <button disabled={savingUserId === u.id} onClick={() => removeUser(u.id)} className="btn btn-sm btn-danger">
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  )
}
