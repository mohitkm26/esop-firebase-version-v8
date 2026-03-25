import { ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

export default function PublicLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)' }}>
      <nav className="pub-nav">
        <Link href="/" style={{ display:'flex', alignItems:'center', gap:8, textDecoration:'none' }}>
          <div style={{ width:30, height:30, borderRadius:8, background:'linear-gradient(135deg,var(--accent),var(--accent2))', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:14, color:'#fff' }}>E</div>
          <span style={{ fontWeight:700, fontSize:15, color:'var(--text)' }}>ESOP Manager</span>
        </Link>
        <div style={{ display:'flex', alignItems:'center', gap:20 }}>
          <Link href="/#features" style={{ fontSize:13, color:'var(--text2)', textDecoration:'none', fontWeight:500 }}>Features</Link>
          <Link href="/pricing"   style={{ fontSize:13, color:'var(--text2)', textDecoration:'none', fontWeight:500 }}>Pricing</Link>
          <Link href="/blogs"     style={{ fontSize:13, color:'var(--text2)', textDecoration:'none', fontWeight:500 }}>Blog</Link>
          <Link href="/#contact"  style={{ fontSize:13, color:'var(--text2)', textDecoration:'none', fontWeight:500 }}>Contact</Link>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <Link href="/login" className="btn btn-ghost btn-sm">Sign In</Link>
          <Link href="/login" className="btn btn-primary btn-sm">Start Free</Link>
        </div>
      </nav>
      {children}
      <footer style={{ borderTop:'1px solid var(--border)', padding:'32px 24px', textAlign:'center', color:'var(--text3)', fontSize:12 }}>
        <div className="pub-container" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:16 }}>
          <div>© {new Date().getFullYear()} ESOP Manager. Built for Indian startups.</div>
          <div style={{ display:'flex', gap:20 }}>
            <Link href="/pricing" style={{ color:'var(--text3)', textDecoration:'none' }}>Pricing</Link>
            <Link href="/blogs"   style={{ color:'var(--text3)', textDecoration:'none' }}>Blog</Link>
            <Link href="/#contact" style={{ color:'var(--text3)', textDecoration:'none' }}>Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
