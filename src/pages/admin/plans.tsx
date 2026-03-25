import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/lib/auth-context'
import Layout from '@/components/layout/Layout'
import { isSuperAdmin } from '@/lib/roles'

export default function AdminPlans() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => { if (!loading && (!user || !isSuperAdmin(profile?.role))) router.push('/dashboard') }, [user, profile, loading])

  if (loading) return null

  return (
    <Layout>
      <div className="p-8">
        <h1 className="page-title mb-7">Plan Management</h1>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:24}}>
          {[
            { name:'Basic', price:'Free', color:'#64748b', features:['50 employees','Unlimited grants','CSV upload','Grant letters'] },
            { name:'Pro', price:'₹999/yr', color:'#2563eb', features:['Unlimited employees','Valuations','ESOP Cost','Reports','Employee portal','Support tickets'] },
            { name:'Advanced', price:'₹4,999/yr', color:'#d4a853', features:['All Pro features','Audit logs','eSignature','API access','Priority support'] },
          ].map(p=>(
            <div key={p.name} className="card">
              <h2 style={{fontWeight:800,fontSize:18,marginBottom:4}}>{p.name}</h2>
              <div style={{fontSize:24,fontWeight:900,color:p.color,marginBottom:16}}>{p.price}</div>
              <ul style={{listStyle:'none',padding:0,margin:0,display:'flex',flexDirection:'column',gap:8}}>
                {p.features.map(f=>(
                  <li key={f} style={{display:'flex',alignItems:'center',gap:8,fontSize:13}}>
                    <span style={{color:'var(--success)'}}>✓</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="card mt-6">
          <p className="text-muted" style={{fontSize:13}}>Plan pricing and features are configured in <code>src/lib/plan-context.tsx</code>. Payment gateway integration is required for production plan upgrades.</p>
        </div>
      </div>
    </Layout>
  )
}
