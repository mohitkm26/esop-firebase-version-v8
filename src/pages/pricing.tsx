import Link from 'next/link'
import Head from 'next/head'
import PublicLayout from '@/components/layout/PublicLayout'

export default function Pricing() {
  return (
    <PublicLayout>
      <Head><title>Pricing — ESOP Manager</title></Head>
      <div style={{padding:'64px 24px',maxWidth:900,margin:'0 auto'}}>
        <div style={{textAlign:'center',marginBottom:48}}>
          <h1 style={{fontSize:28,fontWeight:800,letterSpacing:'-0.03em',marginBottom:12}}>Simple Pricing</h1>
          <p style={{color:'var(--muted)',fontSize:15}}>Start free. Upgrade when you grow.</p>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:24}}>
          {[
            {name:'Basic',price:'Free',color:'#64748b',featured:false,features:['Up to 50 employees','Unlimited grants','CSV upload','Grant letters','Vesting schedules','Employee portal (view-only)'],cta:'Start free'},
            {name:'Pro',price:'₹999/yr',color:'#2563eb',featured:true,features:['Unlimited employees','Valuations tracking','ESOP cost (IndAS 102)','Reports & analytics','Secure employee portal','Support ticket system','Email grant letters'],cta:'Start Pro'},
            {name:'Advanced',price:'₹4,999/yr',color:'#d4a853',featured:false,features:['All Pro features','Full audit trail','eSignature integration','Advanced cap table reports','Priority support (24h)','API access'],cta:'Contact us'},
          ].map(p=>(
            <div key={p.name} style={{background:'var(--surface)',border:p.featured?'2px solid var(--accent)':'1px solid var(--border)',borderRadius:20,padding:28,display:'flex',flexDirection:'column',gap:16}}>
              {p.featured&&<div style={{background:'var(--accent)',color:'#fff',fontSize:10,fontWeight:700,borderRadius:999,padding:'3px 10px',alignSelf:'flex-start',textTransform:'uppercase',letterSpacing:'0.06em'}}>Most popular</div>}
              <div>
                <h2 style={{fontWeight:800,fontSize:18}}>{p.name}</h2>
                <div style={{fontSize:28,fontWeight:900,color:p.color,marginTop:4}}>{p.price}</div>
                {p.price!=='Free'&&<div style={{fontSize:11,color:'var(--muted)'}}>per company / year</div>}
              </div>
              <ul style={{listStyle:'none',padding:0,margin:0,display:'flex',flexDirection:'column',gap:10,flex:1}}>
                {p.features.map(f=><li key={f} style={{display:'flex',alignItems:'center',gap:8,fontSize:13}}><span style={{color:'var(--success)'}}>✓</span>{f}</li>)}
              </ul>
              <Link href="/login" className={`btn ${p.featured?'btn-primary':'btn-ghost'}`} style={{width:'100%',justifyContent:'center',padding:'10px'}}>{p.cta} →</Link>
            </div>
          ))}
        </div>
        <div style={{textAlign:'center',marginTop:48,color:'var(--muted)',fontSize:13}}>
          All plans include free data migration support. <Link href="/#contact" style={{color:'var(--accent)'}}>Contact us</Link> for custom enterprise pricing.
        </div>
      </div>
    </PublicLayout>
  )
}
