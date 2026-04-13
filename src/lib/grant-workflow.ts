import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { sendGrantLetterEmail } from '@/lib/email'

type GrantMailInput = {
  companyId: string
  grantId: string
  employeeEmail: string
  employeeName: string
  grant: { grantNumber: string; grantDate: string; grantType: string; totalOptions: number; exercisePrice: number }
}

export async function routeGrantForApproval(input: GrantMailInput, company: any) {
  const needsSignatoryApproval = !!company?.requireSignatoryApproval && !!company?.signatoryEmail
  const grantRef = doc(db, 'companies', input.companyId, 'grants', input.grantId)
  if (!needsSignatoryApproval) {
    await sendGrantLetterEmail({ to: input.employeeEmail, employeeName: input.employeeName, companyId: input.companyId, grant: input.grant })
    await updateDoc(grantRef, { status: 'issued', issuedAt: serverTimestamp(), updatedAt: serverTimestamp() })
    return
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const approvalLink = `${baseUrl}/signatory-approval?companyId=${encodeURIComponent(input.companyId)}&grantId=${encodeURIComponent(input.grantId)}`
  await fetch('/api/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'custom',
      to: company.signatoryEmail,
      subject: `Signatory approval required: ${input.grant.grantNumber}`,
      html: `<p>Dear ${company.signatoryName || 'Authorised Signatory'},</p>
             <p>Please review and approve grant letter <strong>${input.grant.grantNumber}</strong> for ${input.employeeName}.</p>
             <p><a href="${approvalLink}">Open Approval Link</a></p>
             <p>You will verify using OTP before release to employee.</p>`,
    }),
  })
  await updateDoc(grantRef, {
    status: 'pending_signatory_approval',
    signatoryApprovalStatus: 'pending',
    signatoryApprovalEmail: company.signatoryEmail,
    updatedAt: serverTimestamp(),
  })
}
