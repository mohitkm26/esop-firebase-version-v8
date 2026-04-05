import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, orderBy, where, getDoc, doc } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import { fmtDate, fmtN, fmtC, today, computeVesting, computeVestingStatus, downloadBlob } from '@/lib/utils'

type ReportType =
  | 'vesting_forecast' | 'grants_issued' | 'exercises' | 'vested_period'
  | 'pool_utilization' | 'employee_wealth' | 'tds_worksheet'
  | 'cliff_expiry_calendar' | 'lapsed_grants' | 'esop_cost'
  | 'cap_table_impact' | 'exit_buyback'

const REPORT_META: Record<ReportType, { label: string; desc: string; needsDate: boolean; dateLabel?: string }> = {
  vesting_forecast:    { label: 'Vesting Forecast',        desc: 'Options vested as of a given date',       needsDate: false, dateLabel: 'As of Date' },
  grants_issued:       { label: 'Grants Issued',           desc: 'All grants in a date range',              needsDate: true },
  exercises:           { label: 'Exercises',               desc: 'Option exercises with tax data',          needsDate: true },
  vested_period:       { label: 'Vested in Period',        desc: 'Options vested in date range',            needsDate: true },
  pool_utilization:    { label: 'ESOP Pool Utilization',   desc: 'Pool usage vs board-approved limit',      needsDate: false },
  employee_wealth:     { label: 'Employee Wealth Summary', desc: 'Per-employee option wealth snapshot',     needsDate: false },
  tds_worksheet:       { label: 'TDS / Perquisite Tax',    desc: 'Tax worksheet for exercises (Form 12BB)', needsDate: true },
  cliff_expiry_calendar: { label: 'Cliff & Expiry Calendar', desc: 'Upcoming cliff and expiry dates',       needsDate: false },
  lapsed_grants:       { label: 'Lapsed / Forfeited',      desc: 'Grants lapsed on employee exit',         needsDate: false },
  esop_cost:           { label: 'ESOP Cost (Ind AS 102)',  desc: 'Accounting expense for the period',      needsDate: true },
  cap_table_impact:    { label: 'Cap Table Impact',        desc: 'Shareholding % impact of exercises',     needsDate: false },
  exit_buyback:        { label: 'Exit & Buyback Summary',  desc: 'Exited employees and option status',     needsDate: false },
}

export default function Reports() {
  const { user, loading } = useAuth()
  const { companyId, can } = usePlan()
  const router = useRouter()

  const [reportType, setReportType] = useState<ReportType>('vesting_forecast')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState(today())
  const [forecastDate, setForecastDate] = useState(today())
  const [results, setResults] = useState<any[]>([])
  const [summary, setSummary] = useState<Record<string, any>>({})
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])

  async function runReport() {
    if (!companyId) return
    setRunning(true); setResults([]); setSummary({}); setError('')
    try {
      const meta = REPORT_META[reportType]
      if (meta.needsDate && !dateFrom) { setError('Please set a From date'); setRunning(false); return }

      const [gSnap, evSnap, exSnap, empSnap, valSnap] = await Promise.all([
        getDocs(query(collection(db, 'companies', companyId, 'grants'))),
        getDocs(collection(db, 'companies', companyId, 'vestingEvents')),
        getDocs(collection(db, 'companies', companyId, 'exercises')),
        getDocs(collection(db, 'companies', companyId, 'employees')),
        getDocs(query(collection(db, 'companies', companyId, 'valuations'), orderBy('valuationDate', 'desc'))),
      ])

      const grants = gSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]
      const events = evSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]
      const exercises = exSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]
      const employees = empSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]
      const valuations = valSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]
      const latestFMV = valuations[0]?.fmv || valuations[0]?.value || 0
      const empMap = Object.fromEntries(employees.map(e => [e.id, e]))

      const evByGrant: Record<string, any[]> = {}
      events.forEach(ev => { if (!evByGrant[ev.grantId]) evByGrant[ev.grantId] = []; evByGrant[ev.grantId].push(ev) })
      const exByGrant: Record<string, any[]> = {}
      exercises.forEach(ex => { if (!exByGrant[ex.grantId]) exByGrant[ex.grantId] = []; exByGrant[ex.grantId].push(ex) })

      if (reportType === 'vesting_forecast') {
        let totalVested = 0; let totalGranted = 0
        const rows = grants.filter(g => !['cancelled'].includes(g.status)).map(g => {
          const emp = empMap[g.employeeId]
          const evs = (evByGrant[g.id] || []).map((ev: any) => ({
            ...ev, status: computeVestingStatus(ev.vestDate, emp?.exitDate, ev.status)
          }))
          const exed = (exByGrant[g.id] || []).reduce((s: number, x: any) => s + x.sharesExercised, 0)
          const r = computeVesting(evs, g.totalOptions, latestFMV, exed, emp?.exitDate)
          totalVested += r.vested; totalGranted += g.totalOptions
          return { employee: g.employeeName, grant: g.grantNumber, type: g.grantType, total: g.totalOptions, vested: r.vested, lapsed: r.lapsed, exercised: exed, available: r.netVested, pending: r.pending, pct: r.pct }
        })
        setResults(rows); setSummary({ asOf: forecastDate, totalGranted, totalVested, vestPct: totalGranted ? Math.round(totalVested / totalGranted * 100) : 0 })
      }

      else if (reportType === 'grants_issued') {
        const rows = grants.filter(g => g.grantDate >= dateFrom && g.grantDate <= dateTo)
          .sort((a, b) => b.grantDate.localeCompare(a.grantDate))
          .map(g => ({ grantNumber: g.grantNumber, employee: g.employeeName, date: g.grantDate, type: g.grantType, options: g.totalOptions, exercisePrice: g.exercisePrice, status: g.status || 'issued' }))
        setResults(rows); setSummary({ count: rows.length, totalOptions: rows.reduce((s, r) => s + r.options, 0) })
      }

      else if (reportType === 'exercises') {
        const rows = exercises.filter(x => x.exerciseDate >= dateFrom && x.exerciseDate <= dateTo)
          .sort((a, b) => b.exerciseDate.localeCompare(a.exerciseDate))
          .map(x => ({ employee: x.employeeName, grant: x.grantNumber || '—', date: x.exerciseDate, shares: x.sharesExercised, exercisePrice: x.exercisePrice, fmv: x.fairMarketValue, perquisite: x.perquisiteValue || 0, totalCost: x.exercisePrice * x.sharesExercised }))
        setResults(rows); setSummary({ count: rows.length, totalShares: rows.reduce((s, r) => s + r.shares, 0), totalPerquisite: rows.reduce((s, r) => s + r.perquisite, 0) })
      }

      else if (reportType === 'vested_period') {
        const rows = events.filter(ev => ev.vestDate >= dateFrom && ev.vestDate <= dateTo)
          .map(ev => { const g = grants.find(x => x.id === ev.grantId); return { date: ev.vestDate, employee: g?.employeeName || '—', grant: g?.grantNumber || '—', options: ev.optionsCount, status: ev.status } })
          .sort((a, b) => a.date.localeCompare(b.date))
        setResults(rows); setSummary({ count: rows.length, totalVested: rows.filter(r => r.status !== 'lapsed').reduce((s, r) => s + r.options, 0) })
      }

      else if (reportType === 'pool_utilization') {
        const poolSnap = await getDoc(doc(db, 'companies', companyId, 'esopPool', 'config'))
        const pool = poolSnap.exists() ? poolSnap.data() as any : {}
        const totalGranted = grants.filter(g => !['cancelled'].includes(g.status)).reduce((s, g) => s + g.totalOptions, 0)
        const totalExercised = exercises.reduce((s, x) => s + x.sharesExercised, 0)
        const rows = grants.filter(g => !['cancelled'].includes(g.status)).map(g => ({ grant: g.grantNumber, employee: g.employeeName, date: g.grantDate, type: g.grantType, options: g.totalOptions, status: g.status, exercised: (exByGrant[g.id] || []).reduce((s: number, x: any) => s + x.sharesExercised, 0) }))
        setResults(rows); setSummary({ boardApproved: pool.boardApprovedShares || 0, totalGranted, totalExercised, available: (pool.boardApprovedShares || 0) - totalGranted, utilizationPct: pool.boardApprovedShares ? Math.round(totalGranted / pool.boardApprovedShares * 100) : 0 })
      }

      else if (reportType === 'employee_wealth') {
        const byEmp: Record<string, any> = {}
        grants.filter(g => !['cancelled'].includes(g.status)).forEach(g => {
          if (!byEmp[g.employeeId]) byEmp[g.employeeId] = { employee: g.employeeName, grants: 0, totalGranted: 0, vested: 0, exercised: 0, available: 0, pending: 0, currentValue: 0 }
          const emp = empMap[g.employeeId]; const evs = (evByGrant[g.id] || []).map((ev: any) => ({ ...ev, status: computeVestingStatus(ev.vestDate, emp?.exitDate, ev.status) }))
          const exed = (exByGrant[g.id] || []).reduce((s: number, x: any) => s + x.sharesExercised, 0)
          const r = computeVesting(evs, g.totalOptions, latestFMV, exed, emp?.exitDate)
          byEmp[g.employeeId].grants += 1; byEmp[g.employeeId].totalGranted += g.totalOptions
          byEmp[g.employeeId].vested += r.vested; byEmp[g.employeeId].exercised += exed
          byEmp[g.employeeId].available += r.netVested; byEmp[g.employeeId].pending += r.pending
          byEmp[g.employeeId].currentValue += r.netVested * latestFMV
        })
        setResults(Object.values(byEmp).sort((a, b) => b.currentValue - a.currentValue))
        setSummary({ fmv: latestFMV, totalEmployees: Object.keys(byEmp).length, totalWealthValue: Object.values(byEmp).reduce((s, e: any) => s + e.currentValue, 0) })
      }

      else if (reportType === 'tds_worksheet') {
        const rows = exercises.filter(x => x.exerciseDate >= dateFrom && x.exerciseDate <= dateTo).map(x => ({
          employee: x.employeeName, employeeId: x.employeeId, grant: x.grantNumber || '—',
          date: x.exerciseDate, shares: x.sharesExercised, exercisePrice: x.exercisePrice,
          fmv: x.fairMarketValue, perquisite: x.perquisiteValue || 0,
          tdsRate: '30%', estimatedTDS: Math.round((x.perquisiteValue || 0) * 0.30),
        })).sort((a, b) => a.employee.localeCompare(b.employee))
        setResults(rows); setSummary({ count: rows.length, totalPerquisite: rows.reduce((s, r) => s + r.perquisite, 0), totalEstimatedTDS: rows.reduce((s, r) => s + r.estimatedTDS, 0) })
      }

      else if (reportType === 'cliff_expiry_calendar') {
        const upcoming: any[] = []
        grants.filter(g => !['cancelled', 'accepted'].includes(g.status)).forEach(g => {
          const cliffMonths = g.vestingCliff || 12
          const startDate = g.vestingStartDate || g.grantDate
          const cliffDate = new Date(startDate); cliffDate.setMonth(cliffDate.getMonth() + cliffMonths)
          const cliffStr = cliffDate.toISOString().split('T')[0]
          upcoming.push({ type: 'Cliff', employee: g.employeeName, grant: g.grantNumber, date: cliffStr, detail: `${cliffMonths}-month cliff — ${fmtN(g.totalOptions)} options begin vesting` })
          if (g.expiresAt) upcoming.push({ type: 'Acceptance Deadline', employee: g.employeeName, grant: g.grantNumber, date: g.expiresAt.slice(0, 10), detail: 'Grant acceptance deadline' })
        })
        upcoming.sort((a, b) => a.date.localeCompare(b.date))
        setResults(upcoming.slice(0, 50)); setSummary({ showing: Math.min(upcoming.length, 50), total: upcoming.length })
      }

      else if (reportType === 'lapsed_grants') {
        const rows: any[] = []
        grants.filter(g => !['cancelled'].includes(g.status)).forEach(g => {
          const emp = empMap[g.employeeId]; if (!emp?.exitDate) return
          const lapsedEvs = (evByGrant[g.id] || []).filter((ev: any) => ev.vestDate > emp.exitDate)
          const lapsedQty = lapsedEvs.reduce((s: number, ev: any) => s + ev.optionsCount, 0)
          if (lapsedQty > 0) rows.push({ employee: g.employeeName, grant: g.grantNumber, exitDate: emp.exitDate, lapsedOptions: lapsedQty, lapsedValue: lapsedQty * latestFMV })
        })
        setResults(rows); setSummary({ count: rows.length, totalLapsed: rows.reduce((s, r) => s + r.lapsedOptions, 0), totalValueLapsed: rows.reduce((s, r) => s + r.lapsedValue, 0) })
      }

      else if (reportType === 'exit_buyback') {
        const exitedEmps = employees.filter(e => e.exitDate)
        const rows = exitedEmps.map(e => {
          const empGrants = grants.filter(g => g.employeeId === e.id && !['cancelled'].includes(g.status))
          const totalGranted = empGrants.reduce((s, g) => s + g.totalOptions, 0)
          const vestedAtExit = empGrants.reduce((s, g) => {
            const evs = (evByGrant[g.id] || []).filter((ev: any) => ev.vestDate <= e.exitDate)
            return s + evs.reduce((ss: number, ev: any) => ss + ev.optionsCount, 0)
          }, 0)
          const exercised = empGrants.reduce((s, g) => s + (exByGrant[g.id] || []).reduce((ss: number, x: any) => ss + x.sharesExercised, 0), 0)
          return { employee: e.name, exitDate: e.exitDate, totalGranted, vestedAtExit, exercised, unvested: totalGranted - vestedAtExit, unexercised: vestedAtExit - exercised }
        })
        setResults(rows); setSummary({ exitedEmployees: rows.length, totalUnexercised: rows.reduce((s, r) => s + r.unexercised, 0) })
      }

      else if (reportType === 'cap_table_impact') {
        const totalExercised = exercises.reduce((s, x) => s + x.sharesExercised, 0)
        const compSnap = await getDoc(doc(db, 'companies', companyId))
        const totalShares = (compSnap.data() as any)?.totalShares || 0
        const rows = grants.filter(g => !['cancelled'].includes(g.status)).map(g => {
          const exed = (exByGrant[g.id] || []).reduce((s: number, x: any) => s + x.sharesExercised, 0)
          return { employee: g.employeeName, grant: g.grantNumber, options: g.totalOptions, exercised: exed, sharesPercent: totalShares ? ((exed / totalShares) * 100).toFixed(4) + '%' : 'N/A' }
        })
        setResults(rows); setSummary({ totalExercised, totalShares, totalExercisedPct: totalShares ? ((totalExercised / totalShares) * 100).toFixed(3) + '%' : 'Configure total shares in company settings' })
      }

      else if (reportType === 'esop_cost') {
        const rows = grants.filter(g => g.grantDate >= dateFrom && g.grantDate <= dateTo && !['cancelled'].includes(g.status)).map(g => {
          const fmvAtGrant = valuations.find(v => v.valuationDate <= g.grantDate)?.fmv || latestFMV
          const intrinsicValue = Math.max(0, fmvAtGrant - (g.exercisePrice || 0)) * g.totalOptions
          const vestPeriod = g.vestingPeriod || 48
          const monthlyCharge = intrinsicValue / vestPeriod
          return { employee: g.employeeName, grant: g.grantNumber, date: g.grantDate, options: g.totalOptions, exercisePrice: g.exercisePrice, fmvAtGrant, intrinsicValue, vestPeriod, monthlyCharge: Math.round(monthlyCharge) }
        })
        setResults(rows); setSummary({ count: rows.length, totalIntrinsicValue: rows.reduce((s, r) => s + r.intrinsicValue, 0), totalMonthlyCharge: rows.reduce((s, r) => s + r.monthlyCharge, 0) })
      }

    } catch (e: any) { setError(e.message) }
    setRunning(false)
  }

  function exportCSV() {
    if (!results.length) return
    const keys = Object.keys(results[0])
    const rows = [keys, ...results.map(r => keys.map(k => String(r[k] ?? '')))]
    downloadBlob(rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n'), `${reportType}_${today()}.csv`)
  }

  if (loading) return <Layout title="Reports"><div className="spinner-lg" /></Layout>
  if (!can('reports')) return <Layout title="Reports"><div className="alert alert-warning">Upgrade to Pro to access Reports.</div></Layout>

  const meta = REPORT_META[reportType]

  return (
    <Layout title="Reports">
      <div style={{ maxWidth: 1100 }}>
        <div style={{ marginBottom: 24 }}><h1 className="page-title">Reports</h1><p className="page-subtitle">Analyse vesting, grants, exercises, tax and equity</p></div>

        <div className="card mb-4">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ minWidth: 260 }}>
              <label className="label">Report Type</label>
              <select className="input" value={reportType} onChange={e => { setReportType(e.target.value as ReportType); setResults([]) }}>
                {(Object.keys(REPORT_META) as ReportType[]).map(k => (
                  <option key={k} value={k}>{REPORT_META[k].label}</option>
                ))}
              </select>
            </div>
            {!meta.needsDate ? (
              reportType === 'vesting_forecast' ? (
                <div><label className="label">As of Date</label><input type="date" className="input" value={forecastDate} onChange={e => setForecastDate(e.target.value)} /></div>
              ) : null
            ) : (
              <>
                <div><label className="label">From Date</label><input type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
                <div><label className="label">To Date</label><input type="date" className="input" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
              </>
            )}
            <button onClick={runReport} disabled={running} className="btn btn-primary">
              {running ? '⏳ Running...' : '≋ Run Report'}
            </button>
          </div>
          {meta.desc && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text3)' }}>{meta.desc}</div>}
        </div>

        {error && <div className="alert alert-danger mb-4">{error}</div>}

        {Object.keys(summary).length > 0 && (
          <div className="card mb-4">
            <h3 className="section-title mb-3">Summary</h3>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {Object.entries(summary).map(([k, v]) => (
                <div key={k}>
                  <div className="text-xs text-muted">{k.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()}</div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>
                    {typeof v === 'number'
                      ? k.toLowerCase().includes('value') || k.toLowerCase().includes('tds') || k.toLowerCase().includes('mrr') || k.toLowerCase().includes('cost') ? fmtC(v) : fmtN(v)
                      : String(v)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{results.length} rows</span>
              <button onClick={exportCSV} className="btn btn-secondary btn-sm">↓ Export CSV</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>{Object.keys(results[0]).map(k => <th key={k}>{k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()}</th>)}</tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i}>
                      {Object.entries(r).map(([k, v]: any, j) => (
                        <td key={j} style={{ fontFamily: typeof v === 'number' && j > 0 ? 'monospace' : '' }}>
                          {typeof v === 'number'
                            ? k.toLowerCase().includes('price') || k.toLowerCase().includes('value') || k.toLowerCase().includes('fmv') || k.toLowerCase().includes('cost') || k.toLowerCase().includes('tds') || k.toLowerCase().includes('charge')
                              ? fmtC(v)
                              : fmtN(v)
                            : typeof v === 'string' && v.match(/^\d{4}-\d{2}-\d{2}$/)
                              ? fmtDate(v)
                              : String(v ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
