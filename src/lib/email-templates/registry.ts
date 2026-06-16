import type { ComponentType } from 'react'
import { template as inviteTemplate } from './invite-app'
import { template as passwordResetTemplate } from './password-reset'
import { template as vacationRequestTemplate } from './vacation-request'
import { template as vacationApprovedTemplate } from './vacation-approved'
import { template as vacationRejectedTemplate } from './vacation-rejected'
import { template as vacationCreatedByManagerTemplate } from './vacation-created-by-manager'
import { template as vacationChangeRequestedTemplate } from './vacation-change-requested'
import { template as payslipPublishedTemplate } from './payslip-published'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  invite: inviteTemplate,
  password_reset: passwordResetTemplate,
  vacation_request: vacationRequestTemplate,
  vacation_approved: vacationApprovedTemplate,
  vacation_rejected: vacationRejectedTemplate,
  vacation_created_by_manager: vacationCreatedByManagerTemplate,
  vacation_change_requested: vacationChangeRequestedTemplate,
  payslip_published: payslipPublishedTemplate,
}
