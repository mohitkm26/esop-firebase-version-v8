import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { db } from './firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { useAuth } from './auth-context'
import { hasFeatureAccess } from './feature-gate'

export type Plan = 'basic' | 'pro' | 'advanced'

export type Feature =
  | 'valuation' | 'esop_cost' | 'reports' | 'audit_logs'
  | 'bulk_upload' | 'email_letters' | 'employee_portal_auth'

export interface CompanyData {
  companyName?: string; logoUrl?: string; letterheadUrl?: string
  address?: string; signatoryName?: string; signatoryTitle?: string
  plan: Plan; planExpiry?: string|null; onboarded?: boolean
  currency?: string; tandcTemplate?: string
  grantExpiryDays?: number; vestingCliff?: number; vestingPeriod?: number
  exerciseWindowDays?: number
}

interface PlanCtx {
  plan: Plan; companyId: string; companyData: CompanyData|null
  loading: boolean; can: (f: Feature) => boolean
  refreshCompany: () => Promise<void>
}

const Ctx = createContext<PlanCtx>({
  plan:'basic', companyId:'', companyData:null,
  loading:true, can:()=>false, refreshCompany:async()=>{}
})
export const usePlan = () => useContext(Ctx)

export function PlanProvider({ children }: { children: ReactNode }) {
  const { user, profile, loading: authLoading } = useAuth()
  const [plan, setPlan]           = useState<Plan>('basic')
  const [companyId, setCompanyId] = useState('')
  const [companyData, setCompanyData] = useState<CompanyData|null>(null)
  const [loading, setLoading]     = useState(true)

  async function loadCompany(cid: string) {
    setCompanyId(cid)
    const snap = await getDoc(doc(db,'companies',cid))
    if (!snap.exists()) {
      await setDoc(doc(db,'companies',cid), {
        companyId: cid, plan:'basic', createdAt: new Date().toISOString(),
        onboarded: false, currency:'INR', grantExpiryDays:30,
        vestingCliff:12, vestingPeriod:48, exerciseWindowDays:90,
      })
      setPlan('basic'); setCompanyData({ plan:'basic' })
    } else {
      const data = snap.data() as CompanyData
      const eff = (data.planExpiry && new Date(data.planExpiry) < new Date()) ? 'basic' : (data.plan||'basic')
      setPlan(eff as Plan); setCompanyData(data)
    }
  }

  const refreshCompany = async () => {
    if (companyId) await loadCompany(companyId)
  }

  useEffect(() => {
    if (authLoading) return
    if (!user || !profile) { setLoading(false); return }
    const cid = profile.companyId || user.uid
    loadCompany(cid).finally(() => setLoading(false))
  }, [user, profile, authLoading])

  const can = (f: Feature) => hasFeatureAccess(plan, f)
  return <Ctx.Provider value={{ plan, companyId, companyData, loading, can, refreshCompany }}>{children}</Ctx.Provider>
}

export const PLAN_LABELS: Record<Plan,string> = {
  basic:'Basic (Free)', pro:'Pro', advanced:'Advanced'
}
export const PLAN_COLORS: Record<Plan,string> = {
  basic:'#6b6b6b', pro:'#2d5fa8', advanced:'#c8922a'
}
