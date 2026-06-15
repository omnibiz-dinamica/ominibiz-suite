// Provider abstraction. To switch providers in the future, set EMAIL_PROVIDER
// env var (lovable | resend | smtp) and implement the matching module.
// Today, the actual send happens server-side inside /lovable/email/queue/process
// using sendLovableEmail. This module exists so server-side helpers can
// resolve a provider name for auditing (email_send_log.provider).

export type ProviderName = 'lovable' | 'resend' | 'smtp'

export function getActiveProviderName(): ProviderName {
  const v = (typeof process !== 'undefined' ? process.env?.EMAIL_PROVIDER : undefined) as
    | ProviderName
    | undefined
  return v || 'lovable'
}