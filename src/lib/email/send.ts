/**
 * Single send helper for ALL app emails. Triggers MUST go through this —
 * no hardcoded fetches scattered across the app.
 *
 * - Resolves company branding (name/logo/primary color) and injects into templateData
 * - Calls /lovable/email/transactional/send with current user JWT
 * - Records trigger_source/company_id in metadata so the queue worker can
 *   persist them on email_send_log (audit reforçada)
 */
import { supabase } from '@/integrations/supabase/client'

export type TriggerSource =
  | 'invite'
  | 'password_reset'
  | 'vacation_request'
  | 'vacation_approved'
  | 'vacation_rejected'
  | 'vacation_created_by_manager'
  | 'vacation_change_requested'
  | 'vacation_confirmed'
  | 'payslip_published'
  | 'manual'

export interface SendArgs {
  templateName: string
  recipientEmail: string
  idempotencyKey: string
  triggerSource: TriggerSource
  companyId?: string | null
  templateData?: Record<string, any>
}

async function fetchBranding(companyId?: string | null) {
  if (!companyId) return {}
  const { data } = await supabase
    .from('companies')
    .select('name, logo_url, primary_color')
    .eq('id', companyId)
    .maybeSingle()
  if (!data) return {}
  return {
    companyName: data.name,
    companyLogoUrl: data.logo_url ?? undefined,
    companyPrimaryColor: data.primary_color ?? undefined,
  }
}

export async function sendTransactionalEmail(args: SendArgs) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('No active session')

  const branding = await fetchBranding(args.companyId)

  const res = await fetch('/lovable/email/transactional/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      templateName: args.templateName,
      recipientEmail: args.recipientEmail,
      idempotencyKey: args.idempotencyKey,
      templateData: {
        ...branding,
        ...(args.templateData ?? {}),
      },
      metadata: {
        trigger_source: args.triggerSource,
        company_id: args.companyId ?? null,
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Email send failed [${res.status}]: ${body.slice(0, 200)}`)
  }
  return res.json().catch(() => ({}))
}