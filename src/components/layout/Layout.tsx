import { ReactNode, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '@/lib/auth-context'
import { usePlan, PLAN_LABELS, PLAN_COLORS } from '@/lib/plan-context'
import { auth } from '@/lib/firebase'
import { signOut } from 'firebase/auth'
import { canAdmin, canFinance, canAudit, isSuperAdmin, isEmployeeOnly } from '@/lib/roles'
import NotificationBell from '@/components/ui/NotificationBell'

const MAIN_NAV = [
  { href:'/dashboard',      icon:'⊟', label:'Dashboard' },
  { href:'/employees',      icon:'⊡', label:'Employees' },
  { href:'/grants',         icon:'◈', label:'Grants' },
  { href:'/upload',         icon:'⊕', label:'Upload' },
  { href:'/valuation',      icon:'◆', label:'Valuations',  gate:'pro' as const },
  { href:'/esop-cost',      icon:'∑', label:'ESOP Cost',   gate:'advanced' as const },
  { href:'/reports',        icon:'≋', label:'Reports',     gate:'pro' as const },
  { href:'/audit',          icon:'☑', label:'Audit Log',   gate:'advanced' as const },
]

const ADMIN_NAV = [
  { href:'/users',    icon:'⊗', label:'Users' },
  { href:'/settings', icon:'⊙', label:'Settings' },
  { href:'/support',  icon:'⎈', label:'Support' },
]

const SUPER_NAV = [
  { href:'/admin',           icon:'◉', label:'Platform Admin' },
  { href:'/admin/companies', icon:'⊞', label:'All Companies' },
  { href:'/admin/users',     icon:'⊛', label:'All Users' },
  { href:'/admin/support',   icon:'⎈', label:'All Tickets' },
]

interface Props { children: ReactNode; title?: string }

export default function Layout({ children, title }: Props) {
  const { profile } = useAuth()
  const { plan, companyData } = usePlan()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [theme, setTheme] = useState<'light'|'dark'>('light')

  useEffect(() => {
    const saved = (typeof localStorage !== 'undefined' && localStorage.getItem('theme')) as 'light'|'dark'|null
    if (saved) { setTheme(saved); document.documentElement.setAttribute('data-theme', saved) }
  }, [])

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
  }

  const role = profile?.role || ''
  const planColor = PLAN_COLORS[plan]

  const isGated = (gate?: 'pro'|'advanced') => {
    if (!gate) return false
    if (gate === 'advanced') return plan !== 'advanced'
    if (gate === 'pro') return plan === 'basic'
    return false
  }

  const Sidebar = () => (
    <aside className="sidebar">
      {/* Brand */}
      <div style={{ padding:'16px 14px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {companyData?.logoUrl
            ? <img src={companyData.logoUrl} style={{ width:32, height:32, borderRadius:8, objectFit:'cover', flexShrink:0 }} alt="logo"/>
            : <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,var(--accent),var(--accent2))', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:'#fff', flexShrink:0 }}>E</div>
          }
          <div style={{ minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:13.5, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {companyData?.companyName || 'ESOP Manager'}
            </div>
            <div style={{ fontSize:9, marginTop:1, textTransform:'uppercase', letterSpacing:'0.07em', color:planColor }}>{PLAN_LABELS[plan]}</div>
          </div>
        </div>
      </div>

      <div className="sidebar-main">
        {/* Main nav — hide for employee-only users */}
        {!isEmployeeOnly(role) && !isSuperAdmin(role) && (
          <>
            <div className="sidebar-section">Navigation</div>
            {MAIN_NAV.map(n => {
              const locked = isGated(n.gate)
              const active = router.pathname === n.href || router.pathname.startsWith(n.href+'/')
              return (
                <Link key={n.href} href={locked ? '/pricing' : n.href}
                  className={`sidebar-link${active?' active':''}`} style={locked?{opacity:0.45}:{}}
                >
                  <span style={{ fontSize:13, width:18, textAlign:'center', flexShrink:0 }}>{n.icon}</span>
                  <span style={{ flex:1 }}>{n.label}</span>
                  {locked && <span style={{ fontSize:8, fontWeight:700, padding:'1px 5px', borderRadius:4, background:'rgba(200,146,42,0.1)', color:'var(--accent)', border:'1px solid rgba(200,146,42,0.2)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                    {n.gate==='advanced'?'ADV':'PRO'}
                  </span>}
                </Link>
              )
            })}
          </>
        )}

        {/* Employee portal link — shown if role includes employee */}
        {(isEmployeeOnly(role) || role === 'employee') && (
          <>
            <div className="sidebar-section">My ESOP</div>
            <Link href="/employee-portal" className={`sidebar-link${router.pathname==='/employee-portal'?' active':''}`}>
              <span style={{ fontSize:13, width:18, textAlign:'center' }}>🎯</span>
              <span>My Grants</span>
            </Link>
          </>
        )}

        {/* Admin section */}
        {canAdmin(role) && (
          <>
            <div className="sidebar-section" style={{ marginTop:8 }}>Admin</div>
            {ADMIN_NAV.map(n => (
              <Link key={n.href} href={n.href} className={`sidebar-link${router.pathname===n.href?' active':''}`}>
                <span style={{ fontSize:13, width:18, textAlign:'center' }}>{n.icon}</span>
                <span>{n.label}</span>
              </Link>
            ))}
          </>
        )}

        {/* Super admin section */}
        {isSuperAdmin(role) && (
          <>
            <div className="sidebar-section" style={{ marginTop:8 }}>Platform</div>
            {SUPER_NAV.map(n => (
              <Link key={n.href} href={n.href} className={`sidebar-link${router.pathname===n.href||router.pathname.startsWith(n.href+'/')?' active':''}`}>
                <span style={{ fontSize:13, width:18, textAlign:'center' }}>{n.icon}</span>
                <span>{n.label}</span>
              </Link>
            ))}
          </>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{ borderTop:'1px solid var(--border)', padding:'8px 6px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 8px', borderRadius:9 }}>
          {profile?.photo
            ? <img src={profile.photo} style={{ width:28, height:28, borderRadius:'50%', flexShrink:0 }} alt=""/>
            : <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--bg3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'var(--accent)', flexShrink:0 }}>
                {profile?.name?.[0]?.toUpperCase()||'?'}
              </div>
          }
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{profile?.name}</div>
            <div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{profile?.role}</div>
          </div>
          <div style={{ display:'flex', gap:4 }}>
            <button onClick={toggleTheme} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:14, padding:'2px 4px' }} title="Toggle theme">
              {theme==='light'?'🌙':'☀️'}
            </button>
            <button onClick={()=>signOut(auth)} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:14, padding:'2px 4px' }} title="Sign out">→</button>
          </div>
        </div>
        {plan === 'basic' && !isSuperAdmin(role) && (
          <Link href="/pricing" style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5, padding:'7px 12px', borderRadius:8, fontSize:11.5, fontWeight:700, background:'rgba(200,146,42,0.1)', border:'1px solid rgba(200,146,42,0.2)', color:'var(--accent)', textDecoration:'none', marginTop:6 }}>
            ◆ Upgrade Plan
          </Link>
        )}
      </div>
    </aside>
  )

  return (
    <div className="sidebar-layout">
      <div style={{ width:'var(--sidebar-w)', flexShrink:0, position:'fixed', top:0, left:0, bottom:0, zIndex:40 }}>
        <Sidebar/>
      </div>
      {/* Mobile hamburger */}
      <button
        onClick={()=>setMobileOpen(o=>!o)}
        style={{ position:'fixed', top:12, left:12, zIndex:50, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:'5px 9px', color:'var(--text)', fontSize:13, cursor:'pointer', display:'none' }}
        className="mobile-menu-btn"
      >
        {mobileOpen?'✕':'☰'}
      </button>
      {mobileOpen && (
        <>
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:30 }} onClick={()=>setMobileOpen(false)}/>
          <div style={{ position:'fixed', top:0, left:0, bottom:0, width:'var(--sidebar-w)', zIndex:40 }}><Sidebar/></div>
        </>
      )}
      <main style={{ flex:1, minHeight:'100vh', marginLeft:'var(--sidebar-w)', background:'var(--bg)' }}>
        {/* Top bar with notification bell */}
        <div style={{ position:'sticky', top:0, zIndex:20, background:'var(--bg)', borderBottom:'1px solid var(--border)', padding:'0 24px', height:52, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontWeight:600, fontSize:15, color:'var(--text)' }}>{title||''}</span>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <NotificationBell/>
          </div>
        </div>
        <div style={{ padding:'24px' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
