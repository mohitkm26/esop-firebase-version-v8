import { db } from './firebase'
import { collection, addDoc, getDocs, query, where, updateDoc, doc, orderBy, limit } from 'firebase/firestore'

export type NotifType =
  | 'grant_issued' | 'grant_accepted' | 'grant_expiry'
  | 'exercise_recorded' | 'vesting_milestone'
  | 'ticket_updated' | 'user_invited'

export interface Notification {
  id: string
  userId: string
  companyId: string
  type: NotifType
  message: string
  link?: string
  read: boolean
  createdAt: string
}

export async function createNotification(params: {
  companyId: string
  userId: string
  type: NotifType
  message: string
  link?: string
}) {
  try {
    await addDoc(
      collection(db, 'companies', params.companyId, 'notifications'),
      {
        ...params,
        read: false,
        createdAt: new Date().toISOString(),
      }
    )
  } catch (e) {
    console.error('Notification create failed:', e)
  }
}

export async function markRead(companyId: string, notifId: string) {
  try {
    await updateDoc(
      doc(db, 'companies', companyId, 'notifications', notifId),
      { read: true }
    )
  } catch (e) {
    console.error('Mark read failed:', e)
  }
}

export async function getNotifications(companyId: string, userId: string): Promise<Notification[]> {
  const snap = await getDocs(
    query(
      collection(db, 'companies', companyId, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50)
    )
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification))
}
