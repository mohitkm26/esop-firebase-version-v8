import { useState, useEffect, useRef } from 'react'
import { db } from '@/lib/firebase'
import { collection, query, where, orderBy, limit, getDocs, updateDoc, doc, writeBatch } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Link from 'next/link'

interface Notif {
  id: string; type: string; message: string; link?: string; read: boolean; createdAt: any
}

export default function NotificationBell() {
  const { user } = useAuth()
  const { companyId } = usePlan()
  const [open, setOpen]     = useState(false)
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  async function load() {
    if (!user || !companyId || companyId === 'PLATFORM') return
    try {
      const q = query(
        collection(db,'companies',companyId,'notifications'),
        where('userId','==',user.uid),
        orderBy('createdAt','desc'),
        limit(20)
      )
      const snap = await getDocs(q)
      const items = snap.docs.map(d => ({ id:d.id, ...d.data() } as Notif))
      setNotifs(items)
      setUnread(items.filter(n => !n.read).length)
    } catch(e) {}
  }

  async function markRead(id: string) {
    if (!companyId) return
    try {
      await updateDoc(doc(db,'companies',companyId,'notifications',id), { read: true })
      setNotifs(n => n.map(x => x.id===id ? {...x,read:true} : x))
      setUnread(u => Math.max(0,u-1))
    } catch(e) {}
  }

  async function markAllRead() {
    if (!companyId) return
    try {
      const batch = writeBatch(db)
      notifs.filter(n=>!n.read).forEach(n => batch.update(doc(db,'companies',companyId,'notifications',n.id),{read:true}))
      await batch.commit()
      setNotifs(n => n.map(x => ({...x,read:true})))
      setUnread(0)
    } catch(e) {}
  }

  useEffect(() => { load() }, [user, companyId])
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const ICONS: Record<string,string> = {
    grant_issued:'📜', grant_accepted:'✅', exercise_recorded:'💰',
    vesting_milestone:'🎯', grant_expiry_reminder:'⏰', ticket_update:'🎫', system:'📢'
  }

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button
        onClick={() => { setOpen(o=>!o); if(!open) load() }}
        style={{
          background:'none', border:'1px solid var(--border)', borderRadius:8,
          padding:'6px 10px', cursor:'pointer', color:'var(--text2)',
          position:'relative', display:'flex', alignItems:'center', gap:4, fontSize:15
        }}
      >
        🔔
        {unread > 0 && (
          <span style={{
            position:'absolute', top:-4, right:-4, background:'var(--danger)',
            color:'#fff', borderRadius:10, fontSize:9, fontWeight:700,
            padding:'1px 4px', minWidth:14, textAlign:'center'
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position:'absolute', right:0, top:'calc(100% + 8px)', width:340, zIndex:100,
          background:'var(--bg)', border:'1px solid var(--border)', borderRadius:12,
          boxShadow:'0 8px 32px rgba(0,0,0,0.12)', overflow:'hidden'
        }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontWeight:700, fontSize:14 }}>Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ background:'none', border:'none', color:'var(--accent)', fontSize:12, cursor:'pointer', fontWeight:600 }}>
                Mark all read
              </button>
            )}
          </div>
          <div style={{ maxHeight:360, overflowY:'auto' }}>
            {notifs.length === 0 ? (
              <div style={{ padding:'24px', textAlign:'center', color:'var(--text3)', fontSize:13 }}>No notifications</div>
            ) : notifs.map(n => (
              <div
                key={n.id}
                onClick={() => markRead(n.id)}
                style={{
                  padding:'12px 16px', borderBottom:'1px solid var(--border)',
                  background: n.read ? 'transparent' : 'rgba(200,146,42,0.05)',
                  cursor: n.link ? 'pointer' : 'default',
                  display:'flex', gap:10, alignItems:'flex-start'
                }}
              >
                <span style={{ fontSize:16, flexShrink:0 }}>{ICONS[n.type]||'📢'}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12.5, color:'var(--text)', lineHeight:1.5 }}>{n.message}</div>
                  {n.link && (
                    <Link href={n.link} style={{ fontSize:11, color:'var(--accent)', textDecoration:'none' }}>
                      View →
                    </Link>
                  )}
                </div>
                {!n.read && <div style={{ width:7, height:7, borderRadius:'50%', background:'var(--accent)', flexShrink:0, marginTop:4 }}/>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
