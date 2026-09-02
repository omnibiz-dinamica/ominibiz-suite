import { createEmailWebhookHandler } from '@lovable.dev/email-js'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'

type Reason = 'bounce' | 'complaint' | 'unsubscribe'

function mapReasonToStatus(reason: Reason): 'bounced' | 'complained' | 'suppressed' {
  switch (reason) {
    case 'bounce':
      return 'bounced'
    case 'complaint':
      return 'complained'
    default:
      return 'suppressed'
  }
}

function mapReasonToMessage(reason: Reason): string {
  switch (reason) {
    case 'bounce':
      return 'Permanent bounce — email address is invalid or rejected'
    case 'complaint':
      return 'Spam complaint — recipient marked email as spam'
    case 'unsubscribe':
      return 'Recipient unsubscribed'
    default:
      return 'Email suppressed'
  }
}

function serviceClient() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables')
  }
  return createClient(supabaseUrl, supabaseServiceKey)
}

/**
 * Registo (apenas informativo) dos resultados de entrega. A supressão efetiva
 * é garantida pela infraestrutura da Lovable; estas tabelas mantêm-se para
 * histórico/auditoria da aplicação.
 */
async function record(reason: Reason, recipient: string, eventId: string) {
  const supabase = serviceClient()
  const normalizedEmail = recipient.toLowerCase()

  const { error: suppressError } = await supabase.from('suppressed_emails').upsert(
    { email: normalizedEmail, reason, metadata: null },
    { onConflict: 'email' },
  )
  if (suppressError) {
    console.error('Failed to upsert suppressed email', {
      code: suppressError.code,
      message: suppressError.message,
      event_id: eventId,
    })
    throw new Error('Failed to write suppression')
  }

  const { error: insertError } = await supabase.from('email_send_log').insert({
    message_id: null,
    template_name: 'system',
    recipient_email: normalizedEmail,
    status: mapReasonToStatus(reason),
    error_message: mapReasonToMessage(reason),
    metadata: null,
  })
  if (insertError) {
    console.warn('Failed to insert email_send_log', {
      code: insertError.code,
      message: insertError.message,
      event_id: eventId,
    })
  }
}

export const Route = createFileRoute("/lovable/email/events")({
  server: {
    handlers: {
      POST: ({ request }) => {
        const apiKey = process.env['LOVABLE_API_KEY']
        if (!apiKey) {
          console.error('Missing required environment variables')
          return Response.json({ error: 'Server configuration error' }, { status: 500 })
        }
        const handler = createEmailWebhookHandler({
          apiKey,
          on: {
            'email.bounced': async (event) => {
              await record('bounce', event.data.recipient, event.event_id)
            },
            'email.complaint': async (event) => {
              await record('complaint', event.data.recipient, event.event_id)
            },
            'email.unsubscribed': async (event) => {
              await record('unsubscribe', event.data.recipient, event.event_id)
            },
          },
        })
        return handler(request)
      },
    },
  },
})
