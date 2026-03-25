import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import { logAudit } from '@/lib/audit'
import { today } from '@/lib/utils'

export default function NewEmployee() {
  const { user, profile, loading } = useAuth()
  const { companyId } = usePlan()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name:'', email:'', employeeId:'', department:'', designation:'',
    joiningDate: today(), esopEligible: true,
  })

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])
  const F = (k: string) => (v: any) => setForm(f=>({...f,[k]:v}))

  async function save() {
    if (!form.name || !form.email || !companyId) { alert('Name and email required'); return }
    setSaving(true)
    try {
      // Check for duplicate email
      const dup = await getDocs(query(collection(db,'companies',companyId,'employees'), where('email','==',form.email.toLowerCase())))
      if (!dup.empty) { alert('An employee with this email already exists.'); setSaving(false); return }

      const now = serverTimestamp()
      const docRef = await addDoc(collection(db,'companies',companyId,'employees'), {
        ...form, email: form.email.toLowerCase(), companyId,
        status:'active', createdAt: now, updatedAt: now, createdBy: user!.uid,
      })
      await logAudit({ companyId, userId:user!.uid, userEmail:profile?.email||'', action:'employee_created', entityType:'employee', entityId:docRef.id, entityLabel:form.name, after:form })
      router.push(`/employees/${docRef.id}`)
    } catch(e:any) { alert(e.message) }
    setSaving(false)
  }

  if (loading) return <Layout title="Add Employee"><div className="spinner-lg"/></Layout>

  return (
    <Layout title="Add Employee">
      <div style={{ maxWidth:600 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
          <div><h1 className="page-title">Add Employee</h1><p className="page-subtitle">Add a new employee to the ESOP roster</p></div>
          <button onClick={()=>router.back()} className="btn btn-ghost btn-sm">← Back</button>
        </div>
        <div className="card">
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div>
                <label className="label">Full Name *</label>
                <input className="input" value={form.name} onChange={e=>F('name')(e.target.value)} placeholder="Rahul Sharma"/>
              </div>
              <div>
                <label className="label">Email *</label>
                <input type="email" className="input" value={form.email} onChange={e=>F('email')(e.target.value)} placeholder="rahul@company.com"/>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div>
                <label className="label">Employee ID</label>
                <input className="input" value={form.employeeId} onChange={e=>F('employeeId')(e.target.value)} placeholder="EMP-001"/>
              </div>
              <div>
                <label className="label">Joining Date</label>
                <input type="date" className="input" value={form.joiningDate} onChange={e=>F('joiningDate')(e.target.value)}/>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div>
                <label className="label">Department</label>
                <input className="input" value={form.department} onChange={e=>F('department')(e.target.value)} placeholder="Engineering"/>
              </div>
              <div>
                <label className="label">Designation</label>
                <input className="input" value={form.designation} onChange={e=>F('designation')(e.target.value)} placeholder="SDE-II"/>
              </div>
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
              <input type="checkbox" checked={form.esopEligible} onChange={e=>F('esopEligible')(e.target.checked)}/>
              <span style={{ fontSize:13, color:'var(--text2)' }}>ESOP Eligible</span>
            </label>
          </div>
          <div style={{ display:'flex', gap:10, marginTop:20 }}>
            <button onClick={save} disabled={saving || !form.name || !form.email} className="btn btn-primary">
              {saving ? '⏳ Saving...' : '💾 Add Employee'}
            </button>
            <button onClick={()=>router.back()} className="btn btn-ghost">Cancel</button>
          </div>
        </div>
      </div>
    </Layout>
  )
}
