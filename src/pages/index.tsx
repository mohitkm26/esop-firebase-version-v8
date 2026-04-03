import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { db } from '@/lib/firebase'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import PublicLayout from '@/components/layout/PublicLayout'

const FEATURES = [
  { icon:'📊', title:'Grant Management', desc:'Issue, track, and manage ESOP grants with a complete lifecycle from draft to exercise.' },
  { icon:'📅', title:'Vesting Schedules', desc:'Flexible vesting with 4-year/1-cliff standard or fully custom schedules per grant.' },
  { icon:'👤', title:'Employee Portal', desc:'Employees log in to view their own grants, vesting progress, and exercise history.' },
  { icon:'💹', title:'Valuations (409A)', desc:'Maintain a full history of fair market valuations for accurate grant pricing.' },
  { icon:'🧮', title:'ESOP Cost (IndAS 102)', desc:'Auto-calculate P&L impact, intrinsic value, and FY-wise expense allocation.' },
  { icon:'📈', title:'Reports', desc:'Vesting forecasts, cap table, exercise ledger, and pool utilisation reports.' },
  { icon:'🔍', title:'Audit Logs', desc:'Complete compliance trail — every change logged with before/after snapshots.' },
  { icon:'🏢', title:'Multi-Tenant', desc:'Secure data isolation — your data is never accessible to other companies.' },
]

const STEPS = [
  { n:'01', title:'Create your company', desc:'Sign up and complete a 4-step onboarding wizard. Takes under 5 minutes.' },
  { n:'02', title:'Add employees & issue grants', desc:'Import via CSV or add manually. Issue grants with auto-generated grant numbers.' },
  { n:'03', title:'Track vesting automatically', desc:'The system computes vesting status daily. Get reminders before grants expire.' },
]

const BLOG_PREVIEW = [
  { title:'Indian Startups Unlock $1B via ESOPs in 2025', date:'Jan 2026', tag:'News', href:'/blogs' },
  { title:'ESOP Taxation in India 2025 — Complete Guide', date:'Dec 2025', tag:'Tax', href:'/blogs' },
  { title:'How to Design Your First ESOP Pool', date:'Nov 2025', tag:'Strategy', href:'/blogs' },
]

export default function Landing() {
  const { user, profile, loading, effectiveRole } = useAuth()
  const router = useRouter()
  const [contact, setContact] = useState({ name:'', email:'', company:'', message:'' })
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (loading) return
    if (user && profile) {
      if (effectiveRole === 'superAdmin') router.replace('/admin')
      else if (effectiveRole === 'employee') router.replace('/employee-portal')
      else router.replace('/dashboard')
    }
  }, [loading, user, profile, effectiveRole])

  async function submitContact(e: React.FormEvent) {
    e.preventDefault()
    if (!contact.name || !contact.email) return
    setSubmitting(true)
    try {
      await addDoc(collection(db,'contact_requests'), { ...contact, createdAt: serverTimestamp() })
      setSubmitted(true)
    } catch(e) { alert('Failed to submit. Please email us directly.') }
    setSubmitting(false)
  }

  if (loading) return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}><div className="spinner-lg"/></div>
  if (user) return null

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="pub-hero" style={{ background:'linear-gradient(160deg, var(--bg) 0%, var(--bg2) 100%)' }}>
        <div className="pub-container" style={{ maxWidth:800 }}>
          <div style={{ display:'inline-block', background:'rgba(200,146,42,0.1)', border:'1px solid rgba(200,146,42,0.2)', borderRadius:20, padding:'4px 14px', fontSize:12, fontWeight:600, color:'var(--accent)', marginBottom:20 }}>
            🇮🇳 Built for Indian startups
          </div>
          <h1 style={{ fontSize:48, fontWeight:900, lineHeight:1.15, color:'var(--text)', margin:'0 0 20px' }}>
            Manage ESOPs like<br/>
            <span style={{ color:'var(--accent)' }}>enterprise</span>, without the<br/>
            enterprise cost
          </h1>
          <p style={{ fontSize:18, color:'var(--text2)', maxWidth:600, margin:'0 auto 36px', lineHeight:1.7 }}>
            Complete ESOP lifecycle management — grants, vesting, exercises, IndAS 102 compliance, and employee self-service. Free forever for growing startups.
          </p>
          <div style={{ display:'flex', gap:14, justifyContent:'center', flexWrap:'wrap' }}>
            <Link href="/login" className="btn btn-primary" style={{ fontSize:15, padding:'12px 28px' }}>→ Start for Free</Link>
            <Link href="#features" className="btn btn-secondary" style={{ fontSize:15, padding:'12px 28px' }}>See Features</Link>
          </div>
          <div style={{ marginTop:32, fontSize:12, color:'var(--text3)', display:'flex', gap:24, justifyContent:'center', flexWrap:'wrap' }}>
            <span>✓ No credit card required</span>
            <span>✓ Free Basic plan forever</span>
            <span>✓ Data stored in India (Firebase)</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="pub-section" style={{ background:'var(--bg)' }}>
        <div className="pub-container">
          <div style={{ textAlign:'center', marginBottom:48 }}>
            <h2 style={{ fontSize:32, fontWeight:800, color:'var(--text)', margin:'0 0 12px' }}>Everything you need for ESOP management</h2>
            <p style={{ fontSize:16, color:'var(--text2)' }}>One platform for the entire ESOP lifecycle</p>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:20 }}>
            {FEATURES.map(f => (
              <div key={f.title} className="card" style={{ borderRadius:14 }}>
                <div style={{ fontSize:28, marginBottom:12 }}>{f.icon}</div>
                <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', margin:'0 0 8px' }}>{f.title}</h3>
                <p style={{ fontSize:13, color:'var(--text2)', margin:0, lineHeight:1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="pub-section" style={{ background:'var(--bg2)' }}>
        <div className="pub-container">
          <div style={{ textAlign:'center', marginBottom:48 }}>
            <h2 style={{ fontSize:32, fontWeight:800, color:'var(--text)', margin:'0 0 12px' }}>Up and running in minutes</h2>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:28 }}>
            {STEPS.map(s => (
              <div key={s.n} style={{ display:'flex', gap:16 }}>
                <div style={{ width:44, height:44, borderRadius:12, background:'var(--accent)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:14, flexShrink:0 }}>{s.n}</div>
                <div>
                  <h3 style={{ fontSize:15, fontWeight:700, margin:'0 0 6px', color:'var(--text)' }}>{s.title}</h3>
                  <p style={{ fontSize:13, color:'var(--text2)', margin:0, lineHeight:1.6 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="pub-section" style={{ background:'var(--bg)' }}>
        <div className="pub-container">
          <div style={{ textAlign:'center', marginBottom:48 }}>
            <h2 style={{ fontSize:32, fontWeight:800, color:'var(--text)', margin:'0 0 12px' }}>Simple, honest pricing</h2>
            <p style={{ fontSize:16, color:'var(--text2)' }}>Start free. Upgrade when you need more.</p>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:20, maxWidth:900, margin:'0 auto' }}>
            {[
              { name:'Basic', price:'Free', desc:'For early-stage startups', color:'#6b6b6b', features:['Up to 50 employees','Unlimited grants','Vesting schedules','CSV upload','Employee portal'] },
              { name:'Pro', price:'₹2,999/mo', desc:'For growing companies', color:'#2d5fa8', features:['Everything in Basic','Valuations (409A)','ESOP cost reports','Advanced analytics','Email grant letters'], popular:true },
              { name:'Advanced', price:'₹7,999/mo', desc:'For enterprise-ready teams', color:'#c8922a', features:['Everything in Pro','Full audit logs','eSignature support','API access','Priority support'] },
            ].map(p => (
              <div key={p.name} className="card" style={{ borderRadius:16, border: p.popular ? '2px solid var(--info)' : '1px solid var(--border)', position:'relative' }}>
                {p.popular && <div style={{ position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)', background:'var(--info)', color:'#fff', fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:10, whiteSpace:'nowrap' }}>MOST POPULAR</div>}
                <div style={{ fontWeight:800, fontSize:18, color:p.color }}>{p.name}</div>
                <div style={{ fontSize:26, fontWeight:900, color:'var(--text)', margin:'8px 0 4px' }}>{p.price}</div>
                <div style={{ fontSize:13, color:'var(--text3)', marginBottom:20 }}>{p.desc}</div>
                <ul style={{ listStyle:'none', padding:0, margin:'0 0 24px', display:'flex', flexDirection:'column', gap:8 }}>
                  {p.features.map(f => <li key={f} style={{ fontSize:13, color:'var(--text2)', display:'flex', gap:8 }}><span style={{ color:'var(--success)' }}>✓</span>{f}</li>)}
                </ul>
                <Link href="/login" className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }}>Get Started</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Blog Preview */}
      <section className="pub-section" style={{ background:'var(--bg2)' }}>
        <div className="pub-container">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:32, flexWrap:'wrap', gap:12 }}>
            <h2 style={{ fontSize:28, fontWeight:800, color:'var(--text)', margin:0 }}>ESOP Insights</h2>
            <Link href="/blogs" className="btn btn-secondary btn-sm">View All Articles →</Link>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:20 }}>
            {BLOG_PREVIEW.map(b => (
              <Link key={b.title} href={b.href} style={{ textDecoration:'none' }}>
                <div className="card" style={{ borderRadius:14, cursor:'pointer', transition:'transform 0.15s, box-shadow 0.15s' }}
                  onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.transform='translateY(-2px)';(e.currentTarget as HTMLDivElement).style.boxShadow='0 8px 24px rgba(0,0,0,0.1)'}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.transform='';(e.currentTarget as HTMLDivElement).style.boxShadow=''}}
                >
                  <span className="badge badge-amber" style={{ marginBottom:12 }}>{b.tag}</span>
                  <h3 style={{ fontSize:14.5, fontWeight:700, color:'var(--text)', margin:'0 0 12px', lineHeight:1.5 }}>{b.title}</h3>
                  <div style={{ fontSize:12, color:'var(--text3)' }}>{b.date} · Read more →</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="pub-section" style={{ background:'var(--bg)' }}>
        <div className="pub-container" style={{ maxWidth:700 }}>
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <h2 style={{ fontSize:32, fontWeight:800, color:'var(--text)', margin:'0 0 12px' }}>Reach out to us</h2>
            <p style={{ fontSize:16, color:'var(--text2)' }}>Questions about ESOP setup, compliance, or the platform? We're here to help.</p>
          </div>
          {submitted ? (
            <div className="alert alert-success" style={{ textAlign:'center', padding:32, borderRadius:14 }}>
              <div style={{ fontSize:32, marginBottom:12 }}>✅</div>
              <h3 style={{ margin:'0 0 8px' }}>Message received!</h3>
              <p style={{ margin:0, color:'var(--text2)' }}>We'll get back to you within 1 business day.</p>
            </div>
          ) : (
            <form onSubmit={submitContact} className="card" style={{ borderRadius:16 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                <div><label className="label">Your Name *</label><input className="input" value={contact.name} onChange={e=>setContact(c=>({...c,name:e.target.value}))} placeholder="Rahul Sharma" required/></div>
                <div><label className="label">Email *</label><input type="email" className="input" value={contact.email} onChange={e=>setContact(c=>({...c,email:e.target.value}))} placeholder="rahul@company.com" required/></div>
              </div>
              <div style={{ marginBottom:16 }}>
                <label className="label">Company</label>
                <input className="input" value={contact.company} onChange={e=>setContact(c=>({...c,company:e.target.value}))} placeholder="Acme Inc."/>
              </div>
              <div style={{ marginBottom:20 }}>
                <label className="label">Message *</label>
                <textarea className="input" rows={5} value={contact.message} onChange={e=>setContact(c=>({...c,message:e.target.value}))} placeholder="Tell us about your ESOP needs or questions..." required/>
              </div>
              <button type="submit" disabled={submitting} className="btn btn-primary" style={{ width:'100%', justifyContent:'center', padding:'12px', fontSize:14 }}>
                {submitting ? 'Sending...' : '→ Send Message'}
              </button>
            </form>
          )}
        </div>
      </section>
    </PublicLayout>
  )
}
