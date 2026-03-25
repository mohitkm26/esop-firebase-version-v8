import Link from 'next/link'
import Head from 'next/head'

export default function NotFound() {
  return (
    <>
      <Head><title>404 — Page Not Found</title></Head>
      <div style={{
        minHeight:'100vh', background:'var(--bg)', display:'flex',
        alignItems:'center', justifyContent:'center',
        fontFamily:"'DM Sans',system-ui", color:'var(--text)'
      }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:72, fontWeight:900, color:'var(--primary)', lineHeight:1, marginBottom:16 }}>404</div>
          <h1 style={{ fontSize:24, fontWeight:700, marginBottom:8 }}>Page not found</h1>
          <p style={{ color:'var(--muted)', marginBottom:32 }}>The page you're looking for doesn't exist or has been moved.</p>
          <Link href="/" style={{
            display:'inline-flex', alignItems:'center', gap:8,
            background:'var(--primary)', color:'#fff',
            padding:'10px 24px', borderRadius:10, fontWeight:600,
            textDecoration:'none', fontSize:14,
          }}>
            ← Back to Home
          </Link>
        </div>
      </div>
    </>
  )
}
