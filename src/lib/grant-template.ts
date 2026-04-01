import { storage } from '@/lib/firebase'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'

const MAX_GRANT_TEMPLATE_SIZE_BYTES = 5 * 1024 * 1024

function isDocxFile(file: File) {
  const nameOk = file.name.toLowerCase().endsWith('.docx')
  const mimeOk = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  return nameOk || mimeOk
}

export function validateGrantTemplate(file: File) {
  if (!isDocxFile(file)) {
    throw new Error('Only .docx files are allowed.')
  }
  if (file.size > MAX_GRANT_TEMPLATE_SIZE_BYTES) {
    throw new Error('File size must be 5MB or less.')
  }
}

export async function uploadGrantTemplate(file: File, companyId: string) {
  validateGrantTemplate(file)
  const safeName = file.name.replace(/\s+/g, '_')
  const storageRef = ref(storage, `companies/${companyId}/grant-template/${Date.now()}_${safeName}`)
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}

