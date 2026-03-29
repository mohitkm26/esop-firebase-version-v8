import { Feature, Plan } from './plan-context'

const PLAN_ORDER: Record<Plan, number> = {
  basic: 0,
  pro: 1,
  advanced: 2,
}

const FEATURE_MIN_PLAN: Record<Feature, Plan> = {
  bulk_upload: 'basic',
  email_letters: 'pro',
  valuation: 'pro',
  employee_portal_auth: 'pro',
  reports: 'pro',
  esop_cost: 'advanced',
  audit_logs: 'advanced',
}

export function requiredPlanForFeature(feature: Feature): Plan {
  return FEATURE_MIN_PLAN[feature]
}

export function hasFeatureAccess(currentPlan: Plan, feature: Feature): boolean {
  return PLAN_ORDER[currentPlan] >= PLAN_ORDER[requiredPlanForFeature(feature)]
}

export function isPlanGated(currentPlan: Plan, requiredPlan: Plan): boolean {
  return PLAN_ORDER[currentPlan] < PLAN_ORDER[requiredPlan]
}
