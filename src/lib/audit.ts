import { db } from './firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'

export type AuditAction =
  | 'employee_created' | 'employee_updated' | 'employee_exited'
  | 'grant_created'    | 'grant_modified'   | 'grant_deleted'
  | 'grant_issued'     | 'grant_accepted'   | 'grant_cancelled' | 'grant_expired'
  | 'exercise_recorded'| 'exercise_deleted'
  | 'valuation_updated'
  | 'user_invited'     | 'user_role_changed'| 'user_removed'
  | 'settings_updated' | 'company_updated'  | 'bulk_import'

interface AuditParams {
  companyId:   string
  userId:      string
  userEmail:   string
  action:      AuditAction
  entityType:  string
  entityId:    string
  entityLabel?: string
  before?:     Record<string,any>
  after?:      Record<string,any>
  note?:       string
}

export async function logAudit(p: AuditParams) {
  try {
    await addDoc(collection(db, 'companies', p.companyId, 'auditLogs'), {
      companyId:   p.companyId,
      userId:      p.userId,
      userEmail:   p.userEmail,
      action:      p.action,
      entityType:  p.entityType,
      entityId:    p.entityId,
      entityLabel: p.entityLabel || p.entityId,
      before:      p.before  || null,
      after:       p.after   || null,
      note:        p.note    || null,
      timestamp:   serverTimestamp(),
    })
  } catch(e) { console.error('Audit log failed:', e) }
}
