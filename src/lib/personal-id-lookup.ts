import { collection, collectionGroup, getDocs, query, where, Firestore } from 'firebase/firestore'

const EMPLOYEE_EMAIL_FIELDS = ['work_email', 'personal_email', 'email', 'officialEmail'] as const
const EMPLOYEE_ID_FIELDS = ['personal_id', 'personalId'] as const

function normalizeEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase()
}

function normalizePersonalId(personalId?: string | null): string {
  return (personalId || '').trim().toLowerCase()
}

function getEmailFromEmployeeData(data: Record<string, any>): string {
  for (const fieldName of EMPLOYEE_EMAIL_FIELDS) {
    const value = normalizeEmail(data?.[fieldName])
    if (value) return value
  }
  return ''
}

export async function findEmployeeEmailByPersonalId(db: Firestore, personalId?: string | null): Promise<string | null> {
  const normalizedPersonalId = normalizePersonalId(personalId)
  if (!normalizedPersonalId) return null

  for (const fieldName of EMPLOYEE_ID_FIELDS) {
    const [companyEmployeesSnap, legacyEmployeesSnap] = await Promise.all([
      getDocs(query(collectionGroup(db, 'employees'), where(fieldName, '==', normalizedPersonalId))),
      getDocs(query(collection(db, 'employees'), where(fieldName, '==', normalizedPersonalId))),
    ])

    const companyEmployeeDoc = companyEmployeesSnap.docs[0]
    if (companyEmployeeDoc) {
      const email = getEmailFromEmployeeData(companyEmployeeDoc.data() as Record<string, any>)
      if (email) return email
    }

    const legacyEmployeeDoc = legacyEmployeesSnap.docs[0]
    if (legacyEmployeeDoc) {
      const email = getEmailFromEmployeeData(legacyEmployeeDoc.data() as Record<string, any>)
      if (email) return email
    }
  }

  return null
}
