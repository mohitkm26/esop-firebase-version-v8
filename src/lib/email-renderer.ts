// Email template renderer — loads templates from Firestore and substitutes variables
import { db } from './firebase'
import { doc, getDoc } from 'firebase/firestore'

export type TemplateKey =
  | 'user_invite' | 'employee_invite' | 'grant_issued' | 'grant_acceptance_reminder'
  | 'grant_accepted' | 'grant_rejected' | 'vesting_milestone' | 'exit_portal_access'
  | 'plan_upgraded' | 'invoice_generated' | 'password_reset'

export interface TemplateVariables {
  employeeName?: string; companyName?: string; grantNumber?: string; grantDate?: string
  grantType?: string; totalOptions?: string; exercisePrice?: string; loginLink?: string
  tempPassword?: string; role?: string; vestDate?: string; vestOptions?: string
  planName?: string; invoiceNumber?: string; amount?: string; acceptDeadline?: string
  portalLink?: string; [key: string]: string | undefined
}

export const DEFAULT_TEMPLATES: Record<TemplateKey, { subject: string; bodyHtml: string }> = {
  user_invite: {
    subject: 'You are invited to {{companyName}} ESOP Manager',
    bodyHtml: `<p>Hi {{employeeName}},</p><p>You have been invited to join <strong>{{companyName}}</strong> on ESOP Manager as <strong>{{role}}</strong>.</p><p><strong>Temporary Password:</strong> {{tempPassword}}</p><p><a href="{{loginLink}}" style="background:#111827;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Login to ESOP Manager</a></p><p style="color:#6b7280;font-size:12px">Please change your password after first login.</p>`,
  },
  employee_invite: {
    subject: 'Welcome to {{companyName}} Employee ESOP Portal',
    bodyHtml: `<p>Hi {{employeeName}},</p><p>Your employee account has been created on <strong>{{companyName}}</strong>'s ESOP portal.</p><p><strong>Temporary Password:</strong> {{tempPassword}}</p><p><a href="{{loginLink}}" style="background:#2d5fa8;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Access Employee Portal</a></p>`,
  },
  grant_issued: {
    subject: 'Your ESOP Grant Letter — {{grantNumber}}',
    bodyHtml: `<p>Hi {{employeeName}},</p><p>Congratulations! A new ESOP grant has been issued to you by <strong>{{companyName}}</strong>.</p><table style="border-collapse:collapse;width:100%;margin:16px 0"><tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Grant Number</strong></td><td style="padding:8px;border:1px solid #e5e7eb">{{grantNumber}}</td></tr><tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Grant Date</strong></td><td style="padding:8px;border:1px solid #e5e7eb">{{grantDate}}</td></tr><tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Total Options</strong></td><td style="padding:8px;border:1px solid #e5e7eb">{{totalOptions}}</td></tr><tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Exercise Price</strong></td><td style="padding:8px;border:1px solid #e5e7eb">{{exercisePrice}}</td></tr></table><p>Please review and accept your grant letter before <strong>{{acceptDeadline}}</strong>.</p><p><a href="{{portalLink}}" style="background:#2d5fa8;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View &amp; Accept Grant</a></p>`,
  },
  grant_acceptance_reminder: {
    subject: 'Reminder: Please accept your ESOP grant {{grantNumber}}',
    bodyHtml: `<p>Hi {{employeeName}},</p><p>This is a reminder that your ESOP grant <strong>{{grantNumber}}</strong> from <strong>{{companyName}}</strong> is awaiting your acceptance. Please review and accept before <strong>{{acceptDeadline}}</strong>.</p><p><a href="{{portalLink}}" style="background:#2d5fa8;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Review Grant Letter</a></p>`,
  },
  grant_accepted: {
    subject: 'Grant Accepted — {{grantNumber}}',
    bodyHtml: `<p>Hi {{employeeName}},</p><p>You have successfully accepted ESOP grant <strong>{{grantNumber}}</strong> from <strong>{{companyName}}</strong>. Your acceptance has been recorded.</p>`,
  },
  grant_rejected: {
    subject: 'Grant Rejection Noted — {{grantNumber}}',
    bodyHtml: `<p>Hi {{employeeName}},</p><p>Your rejection of ESOP grant <strong>{{grantNumber}}</strong> has been recorded. Please contact HR if you have any questions.</p>`,
  },
  vesting_milestone: {
    subject: '🎉 Congratulations! {{vestOptions}} options vested — {{grantNumber}}',
    bodyHtml: `<p>Hi {{employeeName}},</p><p>Great news! <strong>{{vestOptions}}</strong> options from your grant <strong>{{grantNumber}}</strong> vested on <strong>{{vestDate}}</strong>.</p><p><a href="{{portalLink}}" style="background:#2d7a4f;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View My Options</a></p>`,
  },
  exit_portal_access: {
    subject: 'Your post-exit ESOP portal access — {{companyName}}',
    bodyHtml: `<p>Hi {{employeeName}},</p><p>Your employment with <strong>{{companyName}}</strong> has ended. You can continue to access your ESOP portal using this personal email address.</p><p><strong>Temporary Password:</strong> {{tempPassword}}</p><p><a href="{{loginLink}}" style="background:#111827;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Access ESOP Portal</a></p><p>Please note your exercise window may be limited. Review your grants promptly.</p>`,
  },
  plan_upgraded: {
    subject: 'Plan Updated — {{planName}}',
    bodyHtml: `<p>Hi,</p><p>Your <strong>{{companyName}}</strong> account has been updated to the <strong>{{planName}}</strong> plan. New features are now available.</p>`,
  },
  invoice_generated: {
    subject: 'Invoice {{invoiceNumber}} — {{companyName}}',
    bodyHtml: `<p>Hi,</p><p>An invoice has been generated for your ESOP Manager subscription.</p><p><strong>Invoice Number:</strong> {{invoiceNumber}}<br/><strong>Amount:</strong> {{amount}}</p><p>Please contact support if you have questions.</p>`,
  },
  password_reset: {
    subject: 'Reset your ESOP Manager password',
    bodyHtml: `<p>Hi {{employeeName}},</p><p>A password reset was requested for your account. Click below to reset:</p><p><a href="{{loginLink}}" style="background:#111827;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Reset Password</a></p><p style="color:#6b7280;font-size:12px">If you did not request this, ignore this email.</p>`,
  },
}

export function renderTemplate(templateHtml: string, vars: TemplateVariables): string {
  return templateHtml.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

export async function getEmailTemplate(
  companyId: string, key: TemplateKey, vars: TemplateVariables
): Promise<{ subject: string; bodyHtml: string; bodyText: string }> {
  try {
    const snap = await getDoc(doc(db, 'companies', companyId, 'emailTemplates', key))
    if (snap.exists()) {
      const t = snap.data() as { subject: string; bodyHtml: string; enabled?: boolean }
      if (t.enabled !== false) {
        const subject  = renderTemplate(t.subject || '', vars)
        const bodyHtml = renderTemplate(t.bodyHtml || '', vars)
        return { subject, bodyHtml, bodyText: bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }
      }
    }
  } catch (_) { /* fallback to default */ }
  const def = DEFAULT_TEMPLATES[key]
  if (!def) throw new Error(`No template found for key: ${key}`)
  const subject  = renderTemplate(def.subject, vars)
  const bodyHtml = renderTemplate(def.bodyHtml, vars)
  return { subject, bodyHtml, bodyText: bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }
}
