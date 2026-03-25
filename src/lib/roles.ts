export type UserRole =
  | 'superAdmin'
  | 'companyAdmin'
  | 'financeAdmin'
  | 'hrAdmin'
  | 'editor'
  | 'employee'
  | 'auditor'
  | 'support'

export type Role = UserRole

export const ROLE_LABELS: Record<UserRole,string> = {
  superAdmin:'Super Admin',
  companyAdmin:'Company Admin',
  financeAdmin:'Finance Admin',
  hrAdmin:'HR Admin',
  editor:'Editor',
  employee:'Employee',
  auditor:'Auditor',
  support:'Support'
}

export const ASSIGNABLE_ROLES: Role[] = [
  'companyAdmin',
  'financeAdmin',
  'hrAdmin',
  'editor',
  'employee',
  'auditor'
]

export const canAdmin   = (r?:string)=>['superAdmin','companyAdmin'].includes(r||'')
export const canEdit    = (r?:string)=>['superAdmin','companyAdmin','hrAdmin','editor'].includes(r||'')
export const canFinance = (r?:string)=>['superAdmin','companyAdmin','financeAdmin'].includes(r||'')
export const canAudit   = (r?:string)=>['superAdmin','companyAdmin','auditor'].includes(r||'')

export const isSuperAdmin = (r?:string)=>r==='superAdmin'
export const isEmployee   = (r?:string)=>r==='employee'
export const isEmployeeOnly=(r?:string)=>r==='employee'

export const ROLE_COLORS: Record<UserRole,string> = {
  superAdmin:"badge-red",
  companyAdmin:"badge-blue",
  financeAdmin:"badge-purple",
  hrAdmin:"badge-green",
  editor:"badge-yellow",
  employee:"badge-muted",
  auditor:"badge-indigo",
  support:"badge-gray"
}