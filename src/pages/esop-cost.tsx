import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import { fmtN, fmtC, getLatestValuation, calcESOPCost } from '@/lib/utils'
import Link from 'next/link'

export default function ESOPCost() {
  const { user, loading } = useAuth()
  const { companyId, can } = usePlan()
  const router = useRouter()
  const [results, setResults] = useState<any[]>([])
  const [totalCost, setTotalCost] = useState(0)
  const [fyTotals, setFyTotals] = useState<Record<string,number>>({})
  const [busy, setBusy] = useState(true)

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])
  useEffect(() => {
    if (!companyId) return
    async function load() {
      const [gSnap, eSnap, vSnap, evSnap] = await Promise.all([
        getDocs(query(collection(db,'companies',companyId,'grants'), where('status','!=','cancelled'))),
        getDocs(collection(db,'companies',companyId,'employees')),
        getDocs(query(collection(db,'companies',companyId,'valuations'), orderBy('valuationDate','asc'))),
        getDocs(collection(db,'companies',companyId,'vestingEvents')),
      ])
      const grants = gSnap.docs.map(d=>({id:d.id,...d.data()}))
      const empMap = Object.fromEntries(eSnap.docs.map(d=>[d.id,d.data()]))
      const valuations = vSnap.docs.map(d=>d.data()) as any[]
      const evByGrant: Record<string,any[]> = {}
      evSnap.docs.forEach(d=>{ const g=d.data().grantId; if(!evByGrant[g]) evByGrant[g]=[]; evByGrant[g].push(d.data()) })

      let allCost=0; const allFy: Record<string,number>={}
      const res = grants.map((g:any)=>{
        const fmv = getLatestValuation(valuations, g.grantDate)
        const emp = (empMap[g.employeeId] as any)||{ name:g.employeeName||'Unknown' }
        const r = calcESOPCost(g, emp, evByGrant[g.id]||[], fmv)
        allCost+=r.totalCost
        Object.entries(r.fyAllocation).forEach(([fy,cost])=>{ allFy[fy]=(allFy[fy]||0)+cost })
        return { ...r, fmv, grantId:g.id }
      }).sort((a:any,b:any)=>b.totalCost-a.totalCost)

      setResults(res); setTotalCost(allCost); setFyTotals(allFy); setBusy(false)
    }
    load()
  }, [companyId])

  if (loading||busy) return <Layout title="ESOP Cost"><div style={{ display:'flex', justifyContent:'center', padding:64 }}><div className="spinner-lg"/></div></Layout>
  if (!can('esop_cost')) return <Layout title="ESOP Cost"><div className="alert alert-warning">Advanced plan required.</div></Layout>

  const sortedFY = Object.entries(fyTotals).sort()

  return (
    <Layout title="ESOP Cost">
      <div style={{ maxWidth:1100 }}>
        <div style={{ marginBottom:24 }}>
          <h1 className="page-title">ESOP Cost (IndAS 102)</h1>
          <p className="page-subtitle">Intrinsic value method — P&L expense per financial year</p>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
          <div className="card">
            <div className="stat-val">{fmtC(totalCost)}</div>
            <div className="stat-label">Total ESOP Expense</div>
            <div className="stat-sub">All active grants (intrinsic value)</div>
          </div>
          <div className="card">
            <h3 className="section-title mb-3">FY Allocation</h3>
            {sortedFY.length===0
              ? <div style={{ fontSize:12, color:'var(--text3)' }}>Add valuations to see FY allocation</div>
              : sortedFY.map(([fy,cost])=>(
                <div key={fy} style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:13 }}>
                  <span style={{ color:'var(--text2)' }}>{fy}</span>
                  <span style={{ fontWeight:700 }}>{fmtC(cost as number)}</span>
                </div>
              ))
            }
          </div>
        </div>

        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Grant #</th><th>Employee</th><th>Exercise Price</th>
                <th>FMV at Grant</th><th>Intrinsic Value</th><th>Options</th>
                <th>Total Expense</th>
                {sortedFY.map(([fy])=><th key={fy}>{fy}</th>)}
              </tr>
            </thead>
            <tbody>
              {results.length===0
                ? <tr><td colSpan={7+sortedFY.length} style={{ textAlign:'center', padding:32, color:'var(--text3)' }}>No active grants found.</td></tr>
                : results.map((r:any)=>(
                  <tr key={r.grantId}>
                    <td>
                      <Link href={`/grants/${r.grantId}`} style={{ fontFamily:'monospace', color:'var(--accent)', fontWeight:700, textDecoration:'none', fontSize:12 }}>
                        {r.grantNumber}
                      </Link>
                    </td>
                    <td style={{ fontSize:13 }}>{r.employeeName}</td>
                    <td>{fmtC(r.exercisePrice)}</td>
                    <td>{fmtC(r.fmv)}</td>
                    <td>{fmtC(r.intrinsicValue)}</td>
                    <td>{fmtN(r.grantId ? results.find((x:any)=>x.grantId===r.grantId)?.totalCost/Math.max(1,r.intrinsicValue)||0 : 0)}</td>
                    <td style={{ fontWeight:700 }}>{fmtC(r.totalCost)}</td>
                    {sortedFY.map(([fy])=>(
                      <td key={fy} style={{ fontFamily:'monospace', fontSize:12 }}>
                        {r.fyAllocation[fy] ? fmtC(r.fyAllocation[fy]) : '—'}
                      </td>
                    ))}
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  )
}
