import { usePlan, Feature, Plan, PLAN_LABELS } from '@/lib/plan-context'
import { ReactNode } from 'react'

interface Props {
  feature: Feature
  children: ReactNode
  overlay?: boolean
}

export default function PlanGate({ feature, children, overlay = true }: Props) {
  const { can, plan } = usePlan()

  if (can(feature)) return <>{children}</>

  const msg = {
    title: "Feature Locked",
    desc: "Upgrade your plan to use this feature"
  }

  const required = plan

  if (!overlay) return (
    <div className="card text-center py-10">
      <div className="text-3xl mb-3">🔒</div>
      <div className="font-semibold text-white mb-1">{msg.title}</div>
      <p className="text-sm text-muted mb-4 max-w-xs mx-auto">{msg.desc}</p>
      <UpgradeButton required={required} />
    </div>
  )

  return (
    <div className="relative" style={{ minHeight: 120 }}>
      <div style={{ filter: 'blur(3px)', pointerEvents: 'none', opacity: 0.3 }}>
        {children}
      </div>
      <div className="plan-gate-overlay">
        <div className="text-center p-6 max-w-xs">
          <div className="text-3xl mb-2">🔒</div>
          <div className="font-semibold text-white mb-1">{msg.title}</div>
          <p className="text-xs text-muted mb-4">{msg.desc}</p>
          <UpgradeButton required={required} />
        </div>
      </div>
    </div>
  )
}

function UpgradeButton({ required }: { required: Plan }) {
  return (
    <a href="/pricing" className="btn btn-primary btn-sm">
      Upgrade to {PLAN_LABELS[required]} →
    </a>
  )
}