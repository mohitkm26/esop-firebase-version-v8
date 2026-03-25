import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import { fmtDate, fmtN, fmtC, today, computeVesting, downloadBlob } from '@/lib/utils'

type ReportType = 'vesting_forecast'|'grants_issued'|'exercises'|'vested_period'

export default function Reports() {
  const { user, loading } = useAuth()
  const { companyId, can } = usePlan()
  const router = useRouter()
  const [reportType, setReportType] = useState<ReportType>('vesting_forecast')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState(today())
  const [forecastDate, setForecastDate] = useState(today())
  const [results, setResults] = useState<any[]>([])
  const [summary, setSummary] = useState<any>({})
  const [running, setRunning] = useState(false)

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])

  async function runReport() {
    if (!companyId) return
    setRunning(true); setResults([])
    try {
      if (reportType === 'vesting_forecast') {
        const [gSnap, evSnap] = await Promise.all([
          getDocs(query(collection(db,'companies',companyId,'grants'), where('status','!=','cancelled'))),
          getDocs(collection(db,'companies',companyId,'vestingEvents')),
        ])
        const evByGrant: Record<string,any[]> = {}
        evSnap.docs.forEach(d => { const g=d.data().grantId; if(!evByGrant[g]) evByGrant[g]=[]; evByGrant[g].push(d.data()) })
        const rows: any[] = []
        let totalVested = 0
        gSnap.docs.forEach(d => {
          const g = { id:d.id, ...d.data() } as any
          const events = (evByGrant[g.id]||[]).map((ev:any) => ({
            ...ev, id:ev.id||'',
            status: ev.vestDate <= forecastDate ? 'vested' : 'pending'
          }))
          const r = computeVesting(events, g.totalOptions)
          totalVested += r.vested
          rows.push({ employee:g.employeeName, grantNumber:g.grantNumber, total:g.totalOptions, vested:r.vested, unvested:r.pending, pct:r.pct })
        })
        setResults(rows)
        setSummary({ totalVested, date:forecastDate })

      } else if (reportType === 'grants_issued') {
        if (!dateFrom) { alert('Please set a from date'); setRunning(false); return }
        const snap = await getDocs(query(collection(db,'companies',companyId,'grants'), where('grantDate','>=',dateFrom), where('grantDate','<=',dateTo), orderBy('grantDate','desc')))
        const rows = snap.docs.map(d => { const g={id:d.id,...d.data()} as any; return { grantNumber:g.grantNumber, employee:g.employeeName, date:g.grantDate, type:g.grantType, options:g.totalOptions, price:g.exercisePrice, status:g.status } })
        setResults(rows); setSummary({ count:rows.length, totalOptions:rows.reduce((s,r)=>s+r.options,0) })

      } else if (reportType === 'exercises') {
        if (!dateFrom) { alert('Please set a from date'); setRunning(false); return }
        const snap = await getDocs(query(collection(db,'companies',companyId,'exercises'), where('exerciseDate','>=',dateFrom), where('exerciseDate','<=',dateTo), orderBy('exerciseDate','desc')))
        const rows = snap.docs.map(d => { const x={id:d.id,...d.data()} as any; return { employee:x.employeeName, grantNumber:x.grantNumber||'—', date:x.exerciseDate, shares:x.sharesExercised, price:x.exercisePrice, fmv:x.fairMarketValue, perquisite:x.perquisiteValue||0 } })
        setResults(rows); setSummary({ count:rows.length, totalShares:rows.reduce((s,r)=>s+r.shares,0), totalPerquisite:rows.reduce((s,r)=>s+r.perquisite,0) })

      } else if (reportType === 'vested_period') {
        if (!dateFrom) { alert('Please set a from date'); setRunning(false); return }
        const evSnap = await getDocs(query(collection(db,'companies',companyId,'vestingEvents'), where('vestDate','>=',dateFrom), where('vestDate','<=',dateTo), orderBy('vestDate')))
        const gSnap = await getDocs(collection(db,'companies',companyId,'grants'))
        const gMap = Object.fromEntries(gSnap.docs.map(d=>[d.id,d.data()]))
        const rows = evSnap.docs.map(d => { const ev=d.data() as any; const g=gMap[ev.grantId]||{}; return { date:ev.vestDate, employee:(g as any).employeeName||'—', grantNumber:(g as any).grantNumber||'—', options:ev.optionsCount, status:ev.status } })
        setResults(rows); setSummary({ count:rows.length, totalVested:rows.filter(r=>r.status!=='lapsed').reduce((s,r)=>s+r.options,0) })
      }
    } catch(e:any) { alert('Error: '+e.message) }
    setRunning(false)
  }

  function exportCSV() {
    if (!results.length) return
    const keys = Object.keys(results[0])
    const rows = [keys, ...results.map(r=>keys.map(k=>String(r[k]||'')))]
    downloadBlob(rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n'), `report_${reportType}.csv`)
  }

  if (loading) return <Layout title="Reports"><div className="spinner-lg"/></Layout>
  if (!can('reports')) return <Layout title="Reports"><div className="alert alert-warning">Pro plan required.</div></Layout>

  return (
    <Layout title="Reports">
      <div style={{ maxWidth:1000 }}>
        <div style={{ marginBottom:24 }}><h1 className="page-title">Reports</h1><p className="page-subtitle">Analyse vesting, grants, and exercises</p></div>

        <div className="card mb-4">
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
            <div>
              <label className="label">Report Type</label>
              <select className="input" style={{ minWidth:220 }} value={reportType} onChange={e=>{ setReportType(e.target.value as ReportType); setResults([]) }}>
                <option value="vesting_forecast">Vesting Forecast on Date</option>
                <option value="grants_issued">Grants Issued — Period</option>
                <option value="exercises">Exercises — Period</option>
                <option value="vested_period">Options Vested — Period</option>
              </select>
            </div>
            {reportType === 'vesting_forecast' ? (
              <div>
                <label className="label">As of Date</label>
                <input type="date" className="input" value={forecastDate} onChange={e=>setForecastDate(e.target.value)}/>
              </div>
            ) : (
              <>
                <div><label className="label">From Date</label><input type="date" className="input" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></div>
                <div><label className="label">To Date</label><input type="date" className="input" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></div>
              </>
            )}
            <button onClick={runReport} disabled={running} className="btn btn-primary">
              {running?'⏳ Running...':'≋ Run Report'}
            </button>
          </div>
        </div>

        {results.length > 0 && (
          <>
            {/* Summary */}
            <div className="card mb-4">
              <h3 className="section-title mb-3">Summary</h3>
              <div style={{ display:'flex', gap:24, flexWrap:'wrap' }}>
                {Object.entries(summary).map(([k,v]) => (
                  <div key={k}><div className="text-xs text-muted">{k.replace(/_/g,' ')}</div><div style={{ fontWeight:700, fontSize:18 }}>{typeof v === 'number' ? fmtN(v as number) : String(v)}</div></div>
                ))}
              </div>
            </div>
            {/* Table */}
            <div className="card mb-4" style={{ padding:0, overflow:'hidden' }}>
              <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontWeight:600, fontSize:13 }}>{results.length} rows</span>
                <button onClick={exportCSV} className="btn btn-secondary btn-sm">↓ Export CSV</button>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table className="tbl">
                  <thead><tr>{Object.keys(results[0]).map(k=><th key={k}>{k.replace(/_/g,' ')}</th>)}</tr></thead>
                  <tbody>
                    {results.map((r,i)=>(
                      <tr key={i}>
                        {Object.values(r).map((v:any,j)=>(
                          <td key={j} style={{ fontFamily: typeof v==='number'&&j>1?'monospace':'' }}>
                            {typeof v==='number'? fmtN(v) : typeof v==='string'&&v.match(/^\d{4}-\d{2}-\d{2}$/) ? fmtDate(v) : String(v||'—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
