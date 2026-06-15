import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/unsubscribe')({
  component: UnsubscribePage,
})

type State =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'already' }
  | { kind: 'ready' }
  | { kind: 'success' }
  | { kind: 'error'; message: string }

function UnsubscribePage() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [submitting, setSubmitting] = useState(false)

  const token = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('token')
    : null

  useEffect(() => {
    if (!token) { setState({ kind: 'invalid' }); return }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) { setState({ kind: 'invalid' }); return }
        if (body.valid === false && body.reason === 'already_unsubscribed') {
          setState({ kind: 'already' }); return
        }
        if (body.valid) { setState({ kind: 'ready' }); return }
        setState({ kind: 'invalid' })
      })
      .catch(() => setState({ kind: 'invalid' }))
  }, [token])

  async function confirm() {
    if (!token) return
    setSubmitting(true)
    try {
      const r = await fetch('/email/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.error || 'Falha ao processar')
      if (body.success === false && body.reason === 'already_unsubscribed') {
        setState({ kind: 'already' })
      } else {
        setState({ kind: 'success' })
      }
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Anular subscrição</h1>
        {state.kind === 'loading' && (
          <p className="mt-4 text-muted-foreground">A validar o link…</p>
        )}
        {state.kind === 'invalid' && (
          <p className="mt-4 text-muted-foreground">Este link é inválido ou expirou.</p>
        )}
        {state.kind === 'already' && (
          <p className="mt-4 text-muted-foreground">Este endereço já está sem subscrição.</p>
        )}
        {state.kind === 'ready' && (
          <>
            <p className="mt-4 text-muted-foreground">
              Tem a certeza que pretende deixar de receber emails desta aplicação?
            </p>
            <div className="mt-6">
              <Button onClick={confirm} disabled={submitting}>
                {submitting ? 'A processar…' : 'Confirmar anulação'}
              </Button>
            </div>
          </>
        )}
        {state.kind === 'success' && (
          <p className="mt-4 text-muted-foreground">
            Pronto. Não receberá mais emails. Pode fechar esta página.
          </p>
        )}
        {state.kind === 'error' && (
          <p className="mt-4 text-destructive">{state.message}</p>
        )}
      </div>
    </div>
  )
}