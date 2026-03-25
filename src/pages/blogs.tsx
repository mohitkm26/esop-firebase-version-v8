import { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import PublicLayout from '@/components/layout/PublicLayout'

interface Article {
  id: string
  tag: string
  tagColor: string
  title: string
  date: string
  readTime: string
  summary: string
  body: string
  source: string
}

const ARTICLES: Article[] = [
  {
    id:'indian-esop-billion',
    tag:'Market', tagColor:'#2563eb',
    title:'Indian Startup Employees Unlock $1B via ESOPs in 2025 IPO Frenzy',
    date:'Feb 2025', readTime:'4 min read',
    source:'Inc42 / Qapita',
    summary:'At least 16 Indian startups went public in 2025, creating unprecedented ESOP wealth for employees. Meesho, Groww, and Urban Company led the wave.',
    body:`The Indian startup ecosystem witnessed a landmark year in 2025 as the IPO boom created significant ESOP wealth for employees across the country.

**Key Highlights:**
- 16+ startups completed IPOs in 2025, up from 8 in 2024
- Total ESOP wealth unlocked crossed the $1 billion mark for the first time
- 12 pre-IPO buybacks worth approximately $158 million were conducted
- Meesho, Groww, and Urban Company were the largest beneficiaries by employee count

**Top Companies by ESOP Wealth Created:**
PhonePe led with an internal buyback valuing ESOPs at ₹700-800 crore benefiting ~1,000 employees. DarwinBox conducted a ₹86 crore buyback benefiting 350+ employees.

**What This Means for Indian Startups:**
ESOP management has become a critical function. Companies with organised ESOP programs saw faster employee adoption and lower exercise complexity. The trend is expected to continue as 30+ startups are reportedly preparing for IPOs in 2026.

**The Compliance Challenge:**
With wealth creation comes complexity. Companies need robust systems to track grant letters, vesting schedules, exercise records, and 409A valuations — not just spreadsheets.`,
  },
  {
    id:'sebi-founder-esop',
    tag:'Regulation', tagColor:'#7c3aed',
    title:'SEBI Clarifies: Founder ESOPs Survive IPO Promoter Reclassification',
    date:'Sep 2025', readTime:'3 min read',
    source:'SEBI Circular / Bar & Bench',
    summary:'SEBI\'s September 2025 amendment clarifies that employee stock options granted at least 12 months before DRHP filing remain exercisable even after promoter reclassification.',
    body:`SEBI issued a significant clarification in September 2025 that has been welcomed by founder-heavy startups preparing for IPOs.

**The Problem Before the Circular:**
When founders reclassify as public shareholders (non-promoters) ahead of an IPO, existing regulations created ambiguity about whether their stock options could still be exercised. This was a concern for co-founders and early employees with significant ESOP holdings.

**SEBI's Clarification:**
Under the amended SEBI (Issue of Capital and Disclosure Requirements) Regulations, options that were:
1. Granted at least 12 months before the date of filing the Draft Red Herring Prospectus (DRHP)
2. Part of a valid ESOP scheme approved by shareholders
3. Not yet exercised at the time of reclassification

...remain exercisable by the grantee regardless of their subsequent reclassification as non-promoter.

**Impact on Startups:**
This circular provides much-needed certainty for companies in pre-IPO stages. HR teams now have a clear guideline when structuring ESOP grants for founders and early employees.

**Action Items for Companies:**
- Review your ESOP grant dates relative to planned DRHP filing timelines
- Ensure grant documentation includes precise grant dates
- Maintain clean audit trails — SEBI may ask for documentation during review`,
  },
  {
    id:'indas-102-guide',
    tag:'Accounting', tagColor:'#16a34a',
    title:'IndAS 102 vs IFRS 2: Practical Guide for Indian Startups',
    date:'Jan 2025', readTime:'6 min read',
    source:'Numerica / ICAI',
    summary:'Indian startups face unique challenges under IndAS 102. This guide explains fair value methodology, expense recognition, and key differences from IFRS 2.',
    body:`IndAS 102 (Share-Based Payments) governs how Indian companies account for ESOPs in their financial statements. Here is what every startup founder and CFO needs to know.

**Fair Value Methodology:**
Under IndAS 102, you must recognise ESOP expense using the **grant-date fair value** of the options, spread over the vesting period.

*Two accepted methods:*
1. **Black-Scholes Model** — standard for most listed/pre-IPO startups
2. **Binomial/Lattice Model** — for complex vesting structures

Key inputs for Black-Scholes: current share price, exercise price, risk-free rate (use 10-year G-Sec yield), expected volatility, expected term, dividend yield.

**Intrinsic Value Method — Indian Exception:**
ICAI allows an alternative: if you cannot reliably estimate fair value, you may use the **intrinsic value method** (difference between fair market value and exercise price at grant date). This is simpler and commonly used by early-stage startups.

**Key Differences from IFRS 2:**
| Aspect | IndAS 102 | IFRS 2 |
|--------|-----------|---------|
| Measurement date | Grant date | Grant date |
| Reload features | Follow through | Same |
| Tax treatment | Some local carve-outs | IAS 12 alignment |
| Employee definition | Narrower per Indian law | Broader |

**Lapse and Forfeiture Treatment:**
- If employee leaves before vesting: reverse previously recognised expense
- If option expires unexercised: no reversal (expense already recognised is retained in equity)

**Disclosure Requirements:**
- Nature and extent of ESOP arrangements
- Fair value measurement description
- Effect on P&L and balance sheet
- Weighted average exercise price movements`,
  },
  {
    id:'esop-taxation-guide',
    tag:'Tax', tagColor:'#d97706',
    title:'ESOP Taxation in India 2025 — Complete Guide',
    date:'Mar 2025', readTime:'5 min read',
    source:'Startup India / ClearTax',
    summary:'Understanding the three taxable events for ESOPs in India: grant (no tax), exercise (perquisite as salary), and sale (capital gains). Includes the 48-month deferral benefit.',
    body:`ESOP taxation in India involves three distinct events. Understanding each is critical for employees and HR teams alike.

**Event 1: Grant**
No tax at grant. This is an important distinction — employees do not have taxable income just because they receive stock options.

**Event 2: Exercise**
This is the most significant taxable event. When employees exercise options, the difference between:
- **Fair Market Value (FMV)** on the date of exercise
- **Exercise Price** paid

...is treated as **perquisite income** and taxed as part of salary at the employee's applicable income tax slab rate.

The employer must deduct TDS on this perquisite income. The FMV is determined as:
- For listed companies: closing price on the stock exchange on exercise date
- For unlisted companies: fair value certified by a SEBI-registered Category I merchant banker

**Event 3: Sale of Shares**
Capital gains tax applies on the difference between sale price and FMV on exercise date.

- **Short-term capital gains (STCG):** If held less than 12 months — taxed at 15% (listed) or slab rate (unlisted)
- **Long-term capital gains (LTCG):** If held more than 12 months — taxed at 10% above ₹1 lakh (listed) or 20% with indexation (unlisted)

**48-Month Deferral for Eligible Startups (DPIIT):**
Under Section 192(1C), employees of eligible startups (DPIIT-recognised) can defer TDS payment on exercise for up to 48 months or until they leave the company or sell shares — whichever comes first.

This is a significant cash flow benefit. Employers must file Form 12BB and ensure proper documentation.

**Key Compliance Checklist:**
- Maintain a perquisite register with exercise dates, FMV, exercise price per employee
- Issue Form 16 with correct perquisite values
- Ensure TDS is deposited (or deferred if eligible)
- Obtain merchant banker certificate for unlisted FMV annually`,
  },
  {
    id:'esop-pool-design',
    tag:'Strategy', tagColor:'#0891b2',
    title:'How to Design Your ESOP Pool: Size, Vesting & Refresh Mechanics',
    date:'Dec 2024', readTime:'4 min read',
    source:'Qapita / Startup India',
    summary:'Best practices for sizing your ESOP pool (10-15% pre-IPO), setting vesting schedules with cliff, and designing refresh grants for retention.',
    body:`Designing an ESOP program requires balancing employee motivation, dilution management, and legal compliance. Here is a framework used by leading Indian startups.

**Pool Sizing:**
- **Early-stage (Seed/Series A):** 10-15% of fully diluted shares
- **Growth-stage (Series B/C):** Typically reduced to 8-12% after replenishment
- **Pre-IPO:** Most companies maintain 5-8% unissued pool

Rule of thumb: Each new hire at senior level should receive 0.1-0.5% of the total pool. Reserve 30-40% for future hires and refreshes.

**Vesting Schedules:**
The most common structure in India:
- **4-year total vesting period**
- **1-year cliff** (no vesting in first year)
- Monthly or quarterly vesting thereafter

Example: 1,000 options over 4 years with 1-year cliff
- Year 1: 0 (cliff period)
- Month 13: 250 options vest (25% cliff vest)
- Months 14-48: ~21 options vest per month

**Alternative structures:**
- Performance vesting: milestone-based (exit event, revenue target)
- Graded vesting: higher % in later years for retention
- Accelerated vesting: double-trigger on acquisition

**Refresh Grants:**
Refresh grants prevent the "cliff effect" where employees become disengaged once fully vested. Best practice:
- Issue refresh grants at Year 2-3 mark
- Typical refresh: 25-50% of original grant
- Apply new 4-year vesting with 1-year cliff
- Some companies use "evergreen" provisions allowing board to replenish the pool annually

**Exercise Window:**
Post-exit: most Indian ESOPs allow 30-90 days. For retirees: up to 5 years is increasingly common. Never set exercise window to less than 30 days.`,
  },
  {
    id:'esop-vs-sar',
    tag:'Compliance', tagColor:'#7c3aed',
    title:'ESOP vs SAR: Which Is Right for Your Company?',
    date:'Nov 2024', readTime:'3 min read',
    source:'Numerica / ICAI',
    summary:'Stock Appreciation Rights (SARs) are cash-settled alternatives to ESOPs. Compare IndAS 102 accounting, tax treatment, and use cases.',
    body:`When structuring employee equity compensation, companies often choose between traditional ESOPs (equity-settled) and Stock Appreciation Rights (SARs, cash-settled). Here is how they compare.

**ESOP (Equity-Settled):**
Employees receive actual shares upon exercise. Company recognises expense at **grant-date fair value** over vesting period. Dilution occurs. Under IndAS 102, once recognised, the ESOP reserve is permanent.

**SAR (Cash-Settled):**
Employees receive cash equal to the appreciation in share value. No equity dilution. Company recognises a **liability** measured at fair value at each balance sheet date. Under IndAS 102, this must be remeasured every reporting period — potentially creating income statement volatility.

**Key Differences:**

| Feature | ESOP | SAR |
|---------|------|-----|
| Settlement | Shares | Cash |
| Dilution | Yes | No |
| Balance sheet | Equity reserve | Liability |
| Measurement | Grant date only | Every period |
| P&L volatility | Low (fixed at grant) | High (fluctuates) |
| Employee preference | High (if IPO likely) | Preferred if exit unclear |

**Tax Treatment:**
- ESOPs: Perquisite tax at exercise for employee; employer gets deduction
- SARs: Also perquisite tax at settlement; employer deducts TDS and gets deduction

**When to Choose SAR:**
- Listed subsidiaries of foreign parents where cross-border equity is complex
- Companies where employees prefer liquidity over share ownership
- Companies where dilution management is critical pre-fundraise

Most Indian startups default to equity-settled ESOPs. SARs are more common in large corporates and MNC subsidiaries.`,
  },
  {
    id:'esop-buyback-2025',
    tag:'Market', tagColor:'#2563eb',
    title:'ESOP Buybacks in 2025: Who Paid Out and How Much',
    date:'Jan 2025', readTime:'3 min read',
    source:'Inc42',
    summary:'A tracker of major ESOP buybacks in 2024-25. DarwinBox ₹86 Cr (350 employees), PhonePe ₹700-800 Cr, 9,200+ total beneficiaries across 12 companies.',
    body:`Pre-IPO ESOP buybacks have become a critical retention and liquidity tool for Indian startups. Here is a comprehensive look at the 2024-25 buyback landscape.

**Major Buybacks (2024-25):**

**PhonePe** — ₹700-800 crore (~$85-95M)
Beneficiaries: ~1,000 employees
Structure: Secondary buyback at $12B valuation
Notable: Largest single-company employee liquidity event in Indian startup history

**DarwinBox** — ₹86 crore (~$10M)
Beneficiaries: 350 employees
Structure: Primary buyback at ~$950M valuation
Notable: Included both current and former employees

**Meesho** — ₹200 crore (~$24M)  
Beneficiaries: ~500 employees
Structure: Part of pre-IPO secondary sale

**Other Notable Buybacks:**
- Razorpay: $75M liquidity round for employees
- BrowserStack: $50M secondary transaction
- Postman: $150M in secondary buybacks

**Total Landscape:**
Over 9,200 employees benefited from ESOP liquidity events in 2024-25, with total value exceeding ₹2,000 crore across 12+ companies.

**Implications for ESOP Management:**
Buybacks require clean, auditable ESOP records. Companies with disorganized cap tables faced delays in processing buybacks. Having a proper ESOP management system ensures you are ready when a liquidity opportunity arises.`,
  },
  {
    id:'companies-act-esop',
    tag:'Legal', tagColor:'#16a34a',
    title:'Setting Up an ESOP Plan Under Companies Act 2013 — Step by Step',
    date:'Oct 2024', readTime:'5 min read',
    source:'Startup India / Companies Act 2013',
    summary:'Complete legal guide: board resolution, special resolution (75% majority), DPIIT exemptions for startups, and proper exercise price documentation.',
    body:`Creating a legally valid ESOP plan in India requires specific corporate actions under the Companies Act 2013, read with Rule 12 of the Companies (Share Capital and Debentures) Rules, 2014.

**Step 1: Board Resolution**
The board of directors must pass a resolution approving:
- The ESOP scheme name and terms
- Total pool size (as % of paid-up capital)
- Eligibility criteria for employees
- Vesting schedule framework
- Exercise window

**Step 2: Special Resolution (Shareholders)**
A special resolution requires approval of at least 75% of shareholders (by value) present and voting. This must be filed with the Registrar of Companies (ROC) within 30 days.

**Exceptions (Private Companies):**
Under Rule 12(10), private companies may skip the special resolution if:
- All shareholders have approved by way of written consent
- OR if the startup is DPIIT-recognised (see DPIIT exemption below)

**DPIIT Recognised Startup Exemptions:**
DPIIT-recognised startups (under Startup India) enjoy significant relaxations:
1. **No separate special resolution needed** if passing an ordinary resolution with consent of all existing shareholders
2. **Perquisite tax deferral** (Section 192(1C)) — employees can defer TDS for up to 48 months
3. **Relaxed FMV documentation** — internal board valuation acceptable instead of merchant banker certificate in some cases

**Step 3: ESOP Scheme Document**
Draft a scheme document that includes:
- Pool size and vesting framework
- Eligibility (full-time employees only — directors with >10% stake ineligible)
- Exercise price methodology (face value, FMV, or market-linked)
- Forfeiture and lapse provisions
- Buy-back and transfer restrictions

**Step 4: Grant Letters**
Each grant must have a written grant letter specifying:
- Number of options granted
- Grant date
- Vesting schedule
- Exercise price
- Expiry date
- Terms and conditions

**Step 5: Ongoing Compliance**
- Maintain register of ESOPs (Rule 12(10)(a))
- File annual return details in MGT-7
- File disclosure in Board's Report (if applicable)
- Obtain annual FMV certificate from merchant banker (for unlisted companies)`,
  },
]

const ALL_TAGS = ['All', ...Array.from(new Set(ARTICLES.map(a=>a.tag)))]

export default function BlogPage() {
  const [activeTag, setActiveTag] = useState('All')
  const [selected,  setSelected]  = useState<Article|null>(null)

  const filtered = activeTag === 'All' ? ARTICLES : ARTICLES.filter(a=>a.tag===activeTag)

  if (selected) {
    return (
      <PublicLayout>
        <Head><title>{selected.title} — ESOP Manager Blog</title></Head>
        <div style={{ maxWidth:740, margin:'0 auto', padding:'48px 24px' }}>
          <button onClick={()=>setSelected(null)} className="btn btn-ghost btn-sm" style={{ marginBottom:24 }}>← Back to Blog</button>
          <span style={{ fontSize:11, fontWeight:700, background:`${selected.tagColor}18`, color:selected.tagColor, padding:'3px 10px', borderRadius:999, textTransform:'uppercase', letterSpacing:'0.06em' }}>{selected.tag}</span>
          <h1 style={{ fontSize:clamp(28), fontWeight:800, letterSpacing:'-0.03em', marginTop:16, marginBottom:12, lineHeight:1.25 }}>{selected.title}</h1>
          <div style={{ display:'flex', gap:16, color:'var(--muted)', fontSize:13, marginBottom:32 }}>
            <span>{selected.date}</span>
            <span>·</span>
            <span>{selected.readTime}</span>
            <span>·</span>
            <span>Source: {selected.source}</span>
          </div>
          <div style={{ fontSize:15, lineHeight:1.8, color:'var(--text)' }}>
            {selected.body.split('\n\n').map((para, i) => {
              if (para.startsWith('**') && para.endsWith('**')) {
                return <h3 key={i} style={{ fontWeight:700, fontSize:17, marginTop:28, marginBottom:8 }}>{para.replace(/\*\*/g,'')}</h3>
              }
              if (para.includes('**')) {
                return <p key={i} style={{ marginBottom:16 }} dangerouslySetInnerHTML={{ __html: para.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g,'<br/>') }}/>
              }
              if (para.startsWith('- ') || para.startsWith('* ')) {
                const items = para.split('\n').filter(l=>l.startsWith('- ')||l.startsWith('* '))
                return <ul key={i} style={{ paddingLeft:20, marginBottom:16 }}>{items.map((item,j)=><li key={j} style={{ marginBottom:6, fontSize:14 }}>{item.replace(/^[*-] /,'')}</li>)}</ul>
              }
              if (para.includes('|')) {
                const rows = para.split('\n').filter(l=>l.includes('|'))
                return (
                  <div key={i} className="table-wrap" style={{ marginBottom:20 }}>
                    <table style={{width:'100%',borderCollapse:'collapse'}}>
                      {rows.map((r,ri)=>{
                        const cells = r.split('|').filter(Boolean).map(c=>c.trim())
                        if (ri===0) return <thead key={ri}><tr>{cells.map((c,ci)=><th key={ci} className="th">{c}</th>)}</tr></thead>
                        if (r.includes('---')) return null
                        return <tbody key={ri}><tr>{cells.map((c,ci)=><td key={ci} className="td" style={{fontSize:13}}>{c}</td>)}</tr></tbody>
                      })}
                    </table>
                  </div>
                )
              }
              return <p key={i} style={{ marginBottom:16, fontSize:14.5 }}>{para}</p>
            })}
          </div>
          <div style={{ marginTop:48, padding:24, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:16 }}>
            <h3 style={{ fontWeight:700, marginBottom:8 }}>Manage your ESOPs with ESOP Manager</h3>
            <p style={{ fontSize:13.5, color:'var(--muted)', marginBottom:16, lineHeight:1.6 }}>Track grants, vesting, exercises, and compliance — all in one place. Free plan available.</p>
            <Link href="/login" className="btn btn-primary">Start for free →</Link>
          </div>
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <Head>
        <title>Blog — ESOP Manager</title>
        <meta name="description" content="Latest ESOP news, tax updates, compliance guides, and market insights for Indian startups."/>
      </Head>

      <div style={{ background:'var(--surface2)', padding:'64px 24px 40px', textAlign:'center', borderBottom:'1px solid var(--border)' }}>
        <h1 style={{ fontSize:28, fontWeight:800, letterSpacing:'-0.03em', marginBottom:12 }}>ESOP Insights & News</h1>
        <p style={{ color:'var(--muted)', fontSize:15, maxWidth:480, margin:'0 auto' }}>Tax updates, market news, compliance guides, and strategy for Indian startups.</p>
      </div>

      <div className="pub-section">
        {/* Tag filter */}
        <div style={{ display:'flex', gap:8, marginBottom:32, flexWrap:'wrap' }}>
          {ALL_TAGS.map(tag => (
            <button key={tag} onClick={()=>setActiveTag(tag)}
              className={`tab${activeTag===tag?' active':''}`}>{tag}</button>
          ))}
        </div>

        {/* Articles grid */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:24 }}>
          {filtered.map(article => (
            <div key={article.id} className="pub-feature-card" style={{ cursor:'pointer' }} onClick={()=>setSelected(article)}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                <span style={{ fontSize:10, fontWeight:700, background:`${article.tagColor}18`, color:article.tagColor, padding:'3px 9px', borderRadius:999, textTransform:'uppercase', letterSpacing:'0.06em' }}>{article.tag}</span>
                <span style={{ fontSize:11, color:'var(--muted)' }}>{article.readTime}</span>
              </div>
              <h2 style={{ fontWeight:700, fontSize:15, lineHeight:1.5, marginBottom:10, color:'var(--text)' }}>{article.title}</h2>
              <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6, marginBottom:14 }}>{article.summary}</p>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:11, color:'var(--muted)' }}>{article.date}</span>
                <span style={{ fontSize:12, color:'var(--accent)', fontWeight:600 }}>Read more →</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PublicLayout>
  )
}

function clamp(n: number) { return n }
