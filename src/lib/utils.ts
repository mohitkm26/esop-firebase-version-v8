// ── Formatting ───────────────────────────────────────────────────────────────
export const fmtN    = (n: number) => Number(n||0).toLocaleString('en-IN')
export const fmtC    = (n: number) => '₹' + Number(n||0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
export const fmtDate = (s: string|null|undefined) => {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
}
export const toISO = (d: Date) => d.toISOString().split('T')[0]
export const today = () => toISO(new Date())

// ── Grant number — FIXED (no scientific notation) ─────────────────────────────
// V7 BUG: used Math.max on array with String values → scientific notation
// V8 FIX: parse only the sequence digits, pad with leading zeros
// Accepts (existing, year?) OR (existing, prefix_ignored, year) for backwards compatibility
export function generateGrantNumber(existingGrantNumbers: string[], yearOrPrefix?: number|string, yearArg?: number): string {
  const yr = typeof yearOrPrefix === 'number' ? yearOrPrefix : (yearArg || new Date().getFullYear())
  const prefix = `G-${yr}-`
  const seqs = existingGrantNumbers
    .filter(n => typeof n === 'string' && n.startsWith(prefix))
    .map(n => {
      const seq = n.slice(prefix.length)
      const num = parseInt(seq, 10)
      return isNaN(num) ? 0 : num
    })
  const maxSeq = seqs.length > 0 ? Math.max(...seqs) : 0
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`
}
// Example: G-2026-001, G-2026-002, G-2026-023

// ── Date parsing ─────────────────────────────────────────────────────────────
export function parseFlexDate(s: string): string|null {
  if (!s?.trim()) return null
  s = s.trim()
  const mon: Record<string,string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'
  }
  const m = s.match(/^(\d{1,2})[-\/](\w{3})[-\/](\d{2,4})$/i)
  if (m) {
    const mo = mon[m[2].toLowerCase()]
    if (!mo) return null
    let yr = parseInt(m[3]); if (yr < 100) yr += yr < 50 ? 2000 : 1900
    return `${yr}-${mo}-${m[1].padStart(2,'0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s); return isNaN(d.getTime()) ? null : toISO(d)
}

// ── Month diff ────────────────────────────────────────────────────────────────
export function monthDiff(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
}

// ── Vesting status computation ─────────────────────────────────────────────
export function computeVestingStatus(
  vestDate: string, exitDate: string|null|undefined,
  existingStatus?: 'pending'|'vested'|'lapsed'
): 'pending'|'vested'|'lapsed' {
  if (existingStatus === 'lapsed') return 'lapsed'
  if (exitDate && vestDate > exitDate) return 'lapsed'
  return vestDate <= today() ? 'vested' : 'pending'
}

export interface VestingEvent {
  id: string; grantId: string; employeeId: string
  vestDate: string; optionsCount: number
  status: 'pending'|'vested'|'lapsed'
}

export interface VestingResult {
  total: number; vested: number; lapsed: number; pending: number
  exercised: number; netVested: number; vestedValue: number; pct: number
}

export function computeVesting(
  events: VestingEvent[], totalOptions: number,
  fairValue = 0, exercised = 0, exitDate?: string|null
): VestingResult {
  let vested = 0, lapsed = 0, pending = 0
  events.forEach(ev => {
    const st = exitDate !== undefined
      ? computeVestingStatus(ev.vestDate, exitDate, ev.status) : ev.status
    if (st === 'lapsed') lapsed += ev.optionsCount
    else if (st === 'vested') vested += ev.optionsCount
    else pending += ev.optionsCount
  })
  const netVested = Math.max(0, vested - exercised)
  const effectiveTotal = vested + lapsed + pending
  return {
    total: totalOptions || effectiveTotal, vested, lapsed, pending, exercised,
    netVested, vestedValue: netVested * fairValue,
    pct: totalOptions > 0 ? Math.round((vested / totalOptions) * 100) : 0,
  }
}

// ── Exercise validation (V8 FIX — prevents exceeding vested shares) ───────────
export function validateExercise(
  events: VestingEvent[], totalOptions: number, alreadyExercised: number,
  exerciseQty: number, exerciseDate: string, exitDate?: string|null
): { valid: boolean; error?: string; vestedOnDate: number; available: number } {
  let vestedOnDate = 0
  events.forEach(ev => {
    if (ev.vestDate <= exerciseDate) {
      const st = computeVestingStatus(ev.vestDate, exitDate, ev.status)
      if (st !== 'lapsed') vestedOnDate += ev.optionsCount
    }
  })
  const available = Math.max(0, vestedOnDate - alreadyExercised)
  if (exerciseQty > available) {
    return {
      valid: false,
      error: `Cannot exercise ${fmtN(exerciseQty)} options. Only ${fmtN(available)} are vested and unexercised as of ${fmtDate(exerciseDate)}.`,
      vestedOnDate, available,
    }
  }
  return { valid: true, vestedOnDate, available }
}

// ── Valuation lookup ──────────────────────────────────────────────────────────
export function getLatestValuation(
  valuations: Array<{valuationDate:string, fairMarketValue:number}>, asOf?: string
) {
  const cutoff = asOf || today()
  return valuations
    .filter(v => v.valuationDate <= cutoff)
    .sort((a,b) => b.valuationDate.localeCompare(a.valuationDate))[0]?.fairMarketValue || 0
}

// ── ESOP Cost (IndAS 102 — Intrinsic Value) ───────────────────────────────────
export interface ESOPCostResult {
  grantId: string; grantNumber: string; employeeName: string
  exercisePrice: number; grantDateFV: number; intrinsicValue: number
  totalCost: number; fyAllocation: Record<string,number>
}

export function calcESOPCost(
  grant: {id:string;grantNumber:string;grantDate:string;exercisePrice:number;totalOptions:number},
  employee: {name:string},
  events: VestingEvent[],
  grantDateFV: number
): ESOPCostResult {
  const intrinsicValue = Math.max(0, grantDateFV - (grant.exercisePrice || 0))
  const totalCost = intrinsicValue * grant.totalOptions
  const fyAllocation: Record<string,number> = {}
  events.forEach(ev => {
    if (ev.status === 'lapsed') return
    const d = new Date(ev.vestDate)
    const fyStart = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
    const fy = `FY ${fyStart}-${String(fyStart + 1).slice(2)}`
    fyAllocation[fy] = (fyAllocation[fy] || 0) + (intrinsicValue * ev.optionsCount)
  })
  return { grantId:grant.id, grantNumber:grant.grantNumber, employeeName:employee.name,
    exercisePrice:grant.exercisePrice||0, grantDateFV, intrinsicValue, totalCost, fyAllocation }
}

// ── Grant letter HTML ─────────────────────────────────────────────────────────
export function buildGrantLetterHTML(params: {
  grantNumber: string; employeeName: string; employeeCode: string
  grantDate: string; totalOptions: number; exercisePrice: number
  vestingSchedule: Array<{date:string,quantity:number}>
  companyName: string; notes?: string
  signatoryName?: string; signatoryTitle?: string
  logoUrl?: string; letterheadUrl?: string; address?: string; website?: string
  footerMeta?: { gstin?: string; cin?: string }
  tandc?: string
  acceptedAt?: string | Date | { toDate?: () => Date } | null
}) {
  const { grantNumber,employeeName,employeeCode,grantDate,totalOptions,exercisePrice,
    vestingSchedule,companyName,notes,signatoryName,signatoryTitle,
    logoUrl,letterheadUrl,address,website,footerMeta,tandc,acceptedAt } = params
  const rows = vestingSchedule.reduce((acc:{html:string,cum:number},ev) => {
    acc.cum += ev.quantity
    acc.html += `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${fmtDate(ev.date)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${fmtN(ev.quantity)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;color:#1a56db;font-weight:600">${fmtN(acc.cum)}</td></tr>`
    return acc
  },{html:'',cum:0}).html

  const defaultTC = `This grant is subject to: (a) the Company's ESOP Plan; (b) your employment agreement; (c) applicable laws including the Companies Act 2013 and Income Tax Act 1961. Options lapse if not exercised within the exercise window following cessation of employment.`
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  const tandcFormatted = escapeHtml(tandc || defaultTC).replace(/\n/g, '<br/>')
  const acceptedDate =
    !acceptedAt ? null
      : acceptedAt instanceof Date ? acceptedAt
      : typeof (acceptedAt as any)?.toDate === 'function' ? (acceptedAt as any).toDate()
      : new Date(acceptedAt as string)
  const hasAcceptedDate = Boolean(acceptedDate && !isNaN(acceptedDate.getTime()))
  const acceptedStamp = hasAcceptedDate
    ? `✅ Digitally accepted on ${acceptedDate!.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })} & ${acceptedDate!.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', hour12:false })}`
    : ''
  const footerLine = [address, footerMeta?.gstin ? `GSTIN: ${footerMeta.gstin}` : '', footerMeta?.cin ? `CIN: ${footerMeta.cin}` : '']
    .filter(Boolean)
    .join(' | ')

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @page { margin: 120px 40px 100px 40px; }
  * { box-sizing: border-box; }
  body{
    margin:0;
    font-family:Arial,sans-serif;
    color:#1a1714;
    font-size:12px;
    line-height:1.5;
  }
  .header{
    position:fixed;
    top:-100px;
    left:0;
    right:0;
    height:80px;
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    border-bottom:2px solid #c8922a;
    padding:10px 0 12px;
    gap:12px;
    background:#fff;
  }
  .header-left{display:flex;align-items:center;min-width:0}
  .header-logo{
    max-height:58px;
    max-width:180px;
    width:auto;
    object-fit:contain;
    filter:none;
    -webkit-filter:none;
  }
  .header-right{margin-left:auto;text-align:right}
  .header-right h1{font-size:18px;line-height:1.2;margin:0}
  .header-right p{margin:3px 0 0;color:#4a4a4a;font-size:11px}
  .footer{
    position:fixed;
    bottom:-80px;
    left:0;
    right:0;
    height:60px;
    border-top:1px solid #dedede;
    text-align:center;
    font-size:10px;
    color:#5a5a5a;
    display:flex;
    align-items:center;
    justify-content:center;
    background:#fff;
    padding:0 8px;
  }
  .content{font-family:Arial,sans-serif;font-size:12px;line-height:1.5}
  h2{font-size:20px;margin:0 0 2px}
  h3{font-size:14px;margin:24px 0 10px;color:#8f6115}
  table{width:100%;border-collapse:collapse}
  th{background:#fdf6ec;padding:8px 10px;text-align:left;border-bottom:2px solid #c8922a}
  td{vertical-align:top}
  table,.section,.sig,.accept,.annexure{page-break-inside:avoid;break-inside:avoid}
  .meta td{padding:8px 10px;border-bottom:1px solid #eee}
  .meta td:first-child{width:34%;font-weight:600}
  .meta tr:nth-child(even){background:#fdf8f2}
  .highlight td{background:#c8922a;color:#fff;font-weight:700;font-size:13px}
  .note{margin:18px 0;padding:10px 12px;background:#fffbf0;border-left:3px solid #c8922a}
  .sig{margin-top:42px}
  .sig-box{display:inline-block;min-width:230px;border-top:1px solid #333;padding-top:8px;margin-top:40px}
  .accept{margin-top:28px;padding:14px;border:1px dashed #999;border-radius:8px;background:#fafaf8}
  .annexure{margin-top:30px;border-top:1px solid #c8922a;padding-top:14px}
  .letterhead{width:100%;max-height:100px;object-fit:contain;margin-bottom:14px;filter:none;-webkit-filter:none}
</style></head><body>
<div class="header">
  <div class="header-left">
    ${logoUrl ? `<img src="${logoUrl}" class="header-logo" alt="logo"/>` : ''}
  </div>
  <div class="header-right">
    <h1>${companyName}</h1>
    ${address ? `<p>${address}</p>` : ''}
    ${website ? `<p>${website}</p>` : ''}
  </div>
</div>
<div class="footer">${footerLine || '&nbsp;'}</div>
<div class="content">
${letterheadUrl ? `<img src="${letterheadUrl}" class="letterhead" alt="letterhead"/>` : ''}
<p style="margin:0 0 14px">Date: <strong>${fmtDate(today())}</strong> &nbsp;|&nbsp; Ref: <strong>${grantNumber}</strong></p>
<h2>Employee Stock Option Grant Letter</h2>
<p style="margin:0 0 14px">Dear <strong>${employeeName}</strong>,</p>
<p class="section">We are pleased to inform you that the Board of Directors of <strong>${companyName}</strong> has approved the grant of Employee Stock Options to you under the Company's ESOP Plan.</p>
<table class="meta section" style="margin:18px 0 8px">
  <tr><td><strong>Employee Name</strong></td><td>${employeeName}</td></tr>
  <tr><td><strong>Employee Code</strong></td><td>${employeeCode}</td></tr>
  <tr><td><strong>Grant Reference</strong></td><td>${grantNumber}</td></tr>
  <tr><td><strong>Grant Date</strong></td><td>${fmtDate(grantDate)}</td></tr>
  <tr><td><strong>Exercise Price</strong></td><td>${fmtC(exercisePrice)} per option</td></tr>
  <tr class="highlight"><td>Total Options Granted</td><td>${fmtN(totalOptions)}</td></tr>
</table>
<h3>Vesting Schedule</h3>
<table class="section"><thead><tr><th>Vesting Date</th><th style="text-align:right">Options</th><th style="text-align:right">Cumulative</th></tr></thead>
<tbody>${rows}</tbody></table>
${notes ? `<div class="note"><strong>Notes:</strong> ${notes}</div>` : ''}
<div class="sig">
  <p>For and on behalf of <strong>${companyName}</strong></p>
  <div class="sig-box">
    <p style="margin:0"><strong>${signatoryName||'Authorised Signatory'}</strong></p>
    <p style="margin:2px 0;font-size:12px;color:#555">${signatoryTitle||'Director / HR'}</p>
    <p style="margin:4px 0;font-size:11px;color:#888">Date: ___________________</p>
  </div>
</div>
<div class="accept">
  <h3 style="margin:0 0 12px;color:#c8922a">Employee Acceptance</h3>
  <p style="font-size:13px">I, <strong>${employeeName}</strong>, hereby accept the grant of ${fmtN(totalOptions)} stock options under Grant Ref: <strong>${grantNumber}</strong>, and agree to be bound by the terms of the ESOP Plan.</p>
  ${hasAcceptedDate ? `<div style="display:inline-block;background:#111;color:#22c55e;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;margin:8px 0 10px">☑ ${acceptedStamp}</div>` : ''}
  <table style="width:100%;margin-top:20px"><tr>
    <td style="width:50%"><div style="border-top:1px solid #333;padding-top:6px;margin-top:40px">Employee Signature</div></td>
    <td style="width:50%;text-align:right"><div style="border-top:1px solid #333;padding-top:6px;margin-top:40px">Date</div></td>
  </tr></table>
</div>
<div class="annexure">
  <h3 style="margin-top:0">Annexure A — Terms and Conditions</h3>
  <div style="white-space:normal">${tandcFormatted}</div>
</div>
</div>
</body></html>`
}

export function grantLetterPdfOptions() {
  return {
    format: 'A4',
    printBackground: true,
    margin: {
      top: '120px',
      bottom: '100px',
      left: '40px',
      right: '40px'
    }
  }
}

export async function renderGrantLetterPdf(
  page: {
    setContent: (html: string, options?: { waitUntil?: 'networkidle0' | 'load' }) => Promise<void>
    emulateMediaType?: (type: 'print' | 'screen') => Promise<void>
    pdf: (options: ReturnType<typeof grantLetterPdfOptions>) => Promise<Uint8Array | Buffer>
  },
  html: string
) {
  await page.setContent(html, { waitUntil: 'networkidle0' })
  if (page.emulateMediaType) await page.emulateMediaType('print')
  return page.pdf(grantLetterPdfOptions())
}

// ── CSV utils ──────────────────────────────────────────────────────────────────
export function smartSplit(line: string) {
  const r: string[] = []; let cur='',inQ=false
  for (const c of line) {
    if (c==='"'){inQ=!inQ;continue}
    if (c===','&&!inQ){r.push(cur);cur='';continue}
    cur+=c
  }
  r.push(cur); return r
}

export function downloadBlob(content: string, filename: string, type='text/csv') {
  const blob = new Blob([content],{type})
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click()
}

// ── Notification helper ────────────────────────────────────────────────────────
import { db as _db } from './firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'

export async function createNotification(
  companyId: string, userId: string,
  type: string, message: string, link?: string
) {
  try {
    await addDoc(collection(_db,'companies',companyId,'notifications'), {
      companyId, userId, type, message,
      link: link||null, read: false, createdAt: serverTimestamp()
    })
  } catch(e) { console.error('Notification failed:', e) }
}
