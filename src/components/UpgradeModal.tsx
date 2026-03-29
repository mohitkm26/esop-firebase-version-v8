import Link from 'next/link'
import { Plan, PLAN_LABELS } from '@/lib/plan-context'

interface Props {
  open: boolean
  requiredPlan: Plan
  onClose: () => void
}

export default function UpgradeModal({ open, requiredPlan, onClose }: Props) {
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade required"
      style={{ position:'fixed', inset:0, zIndex:120, display:'flex', alignItems:'center', justifyContent:'center' }}
    >
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(10,10,10,0.55)' }} />
      <div style={{ position:'relative', width:'min(92vw, 420px)', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:20, boxShadow:'0 16px 48px rgba(0,0,0,0.35)' }}>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ position:'absolute', top:10, right:10, border:'none', background:'transparent', color:'var(--text3)', fontSize:18, cursor:'pointer' }}
        >
          ✕
        </button>

        <div style={{ fontSize:28, marginBottom:8 }}>🔒</div>
        <h3 style={{ margin:'0 0 6px', fontSize:18, color:'var(--text)' }}>Feature unavailable on your plan</h3>
        <p style={{ margin:'0 0 14px', color:'var(--text2)', fontSize:13, lineHeight:1.45 }}>
          Upgrade to <strong>{PLAN_LABELS[requiredPlan]}</strong> to use this feature.
        </p>

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ textDecoration:'none', padding:'8px 12px' }}
          >
            Not now
          </button>
          <Link href="/pricing" className="btn btn-primary" style={{ padding:'8px 12px' }}>
            Upgrade
          </Link>
        </div>
      </div>
    </div>
  )
}
