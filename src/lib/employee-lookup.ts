import { collection, collectionGroup, getDocs, query, where, Firestore } from 'firebase/firestore'

export interface EmployeeLookupResult {
  employeeId: string
  companyId: string
}

const EMPLOYEE_EMAIL_FIELDS = ['work_email', 'personal_email', 'email', 'officialEmail'] as const

function normalizeEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase()
}

function getCompanyIdFromPath(path: string): string | null {
  const parts = path.split('/')
  const companyIndex = parts.findIndex((part) => part === 'companies')
  if (companyIndex === -1 || companyIndex + 1 >= parts.length) return null
  return parts[companyIndex + 1] || null
}

export async function findEmployeeByAuthEmail(db: Firestore, email?: string | null): Promise<EmployeeLookupResult | null> {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return null

  for (const fieldName of EMPLOYEE_EMAIL_FIELDS) {
    const [companyEmployeesSnap, legacyEmployeesSnap] = await Promise.all([
      getDocs(query(collectionGroup(db, 'employees'), where(fieldName, '==', normalizedEmail))),
      getDocs(query(collection(db, 'employees'), where(fieldName, '==', normalizedEmail))),
    ])

    const companyEmployeeDoc = companyEmployeesSnap.docs.find((docSnap) => !!getCompanyIdFromPath(docSnap.ref.path))
    if (companyEmployeeDoc) {
      const companyId = getCompanyIdFromPath(companyEmployeeDoc.ref.path)
      if (companyId) {
        return { employeeId: companyEmployeeDoc.id, companyId }
      }
    }

    const legacyEmployeeDoc = legacyEmployeesSnap.docs.find((docSnap) => {
      const data = docSnap.data() as { companyId?: string | null }
      return !!data?.companyId
    })

    if (legacyEmployeeDoc) {
      const data = legacyEmployeeDoc.data() as { companyId?: string | null }
      return { employeeId: legacyEmployeeDoc.id, companyId: String(data.companyId) }
    }
  }

  return null
}
