import { ReactNode, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '@/lib/auth-context'
import { usePlan, PLAN_LABELS, PLAN_COLORS } from '@/lib/plan-context'
import { auth } from '@/lib/firebase'
import { signOut } from 'firebase/auth'
import { canAdmin, canFinance, canAudit, isSuperAdmin, isEmployeeOnly } from '@/lib/roles'
import NotificationBell from '@/components/ui/NotificationBell'
import UpgradeModal from '@/components/UpgradeModal'
import { isPlanGated } from '@/lib/feature-gate'

const MAIN_NAV = [
  { href: '/dashboard',      icon: '⊟', label: 'Dashboard' },
  { href: '/employees',      icon: '⊡', label: 'Employees' },
  { href: '/grants',         icon: '◈', label: 'Grants' },
  { href: '/upload',         icon: '⊕', label: 'Bulk Upload' },
  { href: '/valuation',      icon: '◆', label: 'Valuations',   gate: 'pro' as const },
  { href: '/esop-cost',      icon: '∑', label: 'ESOP Cost',    gate: 'advanced' as const },
  { href: '/reports',        icon: '≋', label: 'Reports',      gate: 'pro' as const },
  { href: '/audit',          icon: '☑', label: 'Audit Log',    gate: 'advanced' as const },
]

const ADMIN_NAV = [
  { href: '/users',                          icon: '⊗', label: 'Users' },
  { href: '/settings',                       icon: '⊙', label: 'Settings' },
  { href: '/settings/email-templates',       icon: '✉', label: 'Email Templates' },
  { href: '/support',                        icon: '⎈', label: 'Support' },
]

interface Props { children: ReactNode; title?: string }

export default function Layout({ children, title }: Props) {
  const { profile, effectiveRole, canSwitchProfiles, employeeView, switchProfileView } = useAuth()
  const { plan, companyData } = usePlan()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [upgradeRequiredPlan, setUpgradeRequiredPlan] = useState<'pro' | 'advanced' | null>(null)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)

  useEffect(() => {
    const saved = typeof localStorage !== 'undefined' && localStorage.getItem('theme') as 'light' | 'dark' | null
    if (saved) { setTheme(saved); document.documentElement.setAttribute('data-theme', saved) }
  }, [])

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
  }

  const role = effectiveRole || profile?.role || ''
  const planColor = PLAN_COLORS[plan]
  const isGated = (gate?: 'pro' | 'advanced') => gate ? isPlanGated(plan, gate) : false

  const Sidebar = () => (
    <aside className="sidebar">
      {/* Brand */}
      <div style={{ padding: '16px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {companyData?.logoUrl
            ? <img src={companyData.logoUrl} style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} alt="logo" />
            : <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,var(--accent),var(--accent2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#fff', flexShrink: 0 }}>E</div>
          }
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {companyData?.companyName || 'ESOP Manager'}
            </div>
            <div style={{ fontSize: 9, marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.07em', color: planColor }}>{PLAN_LABELS[plan]}</div>
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
              const active = router.pathname === n.href || router.pathname.startsWith(n.href + '/')
              return (
                <Link key={n.href} href={n.href} className={`sidebar-link${active ? ' active' : ''}`}
                  style={locked ? { opacity: 0.45 } : {}}
                  onClick={e => { if (!locked || !n.gate) return; e.preventDefault(); setUpgradeRequiredPlan(n.gate) }}>
                  <span style={{ fontSize: 13, width: 18, textAlign: 'center', flexShrink: 0 }}>{n.icon}</span>
                  <span style={{ flex: 1 }}>{n.label}</span>
                  {locked && <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(200,146,42,0.1)', color: 'var(--accent)', border: '1px solid rgba(200,146,42,0.2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{n.gate === 'advanced' ? 'ADV' : 'PRO'}</span>}
                </Link>
              )
            })}
          </>
        )}

        {/* Employee portal link */}
        {(isEmployeeOnly(role) || role === 'employee') && (
          <>
            <div className="sidebar-section">My ESOP</div>
            <Link href="/employee-portal" className={`sidebar-link${router.pathname === '/employee-portal' ? ' active' : ''}`}>
              <span style={{ fontSize: 13, width: 18, textAlign: 'center' }}>🎯</span>
              <span>My Grants</span>
            </Link>
          </>
        )}

        {/* Admin section */}
        {canAdmin(role) && (
          <>
            <div className="sidebar-section">Administration</div>
            {ADMIN_NAV.map(n => {
              const active = router.pathname === n.href || router.pathname.startsWith(n.href + '/')
              return (
                <Link key={n.href} href={n.href} className={`sidebar-link${active ? ' active' : ''}`}>
                  <span style={{ fontSize: 13, width: 18, textAlign: 'center', flexShrink: 0 }}>{n.icon}</span>
                  <span style={{ flex: 1 }}>{n.label}</span>
                </Link>
              )
            })}
          </>
        )}

        {/* OS Panel — superAdmin only */}
        {isSuperAdmin(role) && (
          <>
            <div className="sidebar-section">Platform OS</div>
            <Link href="/os" className={`sidebar-link${router.pathname.startsWith('/os') ? ' active' : ''}`}
              style={{ background: router.pathname.startsWith('/os') ? 'rgba(200,146,42,0.12)' : undefined }}>
              <span style={{ fontSize: 13, width: 18, textAlign: 'center' }}>⬡</span>
              <span>Operating System</span>
            </Link>
            <Link href="/admin/companies" className={`sidebar-link${router.pathname.startsWith('/admin') ? ' active' : ''}`}>
              <span style={{ fontSize: 13, width: 18, textAlign: 'center' }}>⊞</span>
              <span>All Companies</span>
            </Link>
          </>
        )}
      </div>

      {/* Bottom user row */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
        {/* Profile switcher */}
        {canSwitchProfiles && (
          <button
            onClick={() => switchProfileView(employeeView ? 'admin' : 'employee')}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', marginBottom: 8, background: employeeView ? 'rgba(212,168,83,0.1)' : 'transparent', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: employeeView ? 'var(--accent)' : 'var(--text2)' }}
          >
            <span>{employeeView ? '← Back to Admin View' : '👤 Switch to My Employee View'}</span>
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,var(--accent),var(--accent2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
            {(profile?.name || profile?.email || '?')[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.name || profile?.email?.split('@')[0]}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'capitalize' }}>{role.replace(/([A-Z])/g, ' $1')}</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={toggleTheme} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text3)' }} title="Toggle theme">{theme === 'light' ? '🌙' : '☀'}</button>
            <button onClick={() => signOut(auth)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text3)', padding: '2px 4px' }} title="Sign out">⎋</button>
          </div>
        </div>
      </div>
    </aside>
  )

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="mobile-menu-btn" onClick={() => setMobileOpen(!mobileOpen)}>☰</button>
            {title && <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {employeeView && (
              <div style={{ fontSize: 11, background: 'rgba(212,168,83,0.15)', color: 'var(--accent)', border: '1px solid rgba(212,168,83,0.3)', padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>
                👤 Employee View
              </div>
            )}
            <NotificationBell />
          </div>
        </header>
        <main className="page-content">
          {children}
        </main>
      </div>
      {upgradeRequiredPlan && <UpgradeModal requiredPlan={upgradeRequiredPlan} onClose={() => setUpgradeRequiredPlan(null)} />}
    </div>
  )
}
