import * as React from 'react'
import { Button, Head, Html, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BrandShell, resolveBrand, styles, type BrandProps } from './_brand'

interface Props extends BrandProps {
  ticketNumber?: string
  companyName?: string
  requesterName?: string
  priority?: string
  status?: string
  title?: string
  ticketUrl?: string
}

const Email = ({ ticketNumber, companyName, requesterName, priority, status, title, ticketUrl, ...brandProps }: Props) => {
  const brand = resolveBrand(brandProps)
  return (
    <Html lang="pt-PT" dir="ltr">
      <Head />
      <BrandShell brand={brand} preview="Novo ticket de suporte" title="Novo ticket aberto">
        <Text style={styles.text}>
          Foi aberto um novo ticket de suporte na plataforma.
        </Text>
        <Text style={styles.text}>
          <strong>Ticket:</strong> {ticketNumber || '—'}<br />
          <strong>Empresa:</strong> {companyName || '—'}<br />
          <strong>Solicitante:</strong> {requesterName || '—'}<br />
          <strong>Prioridade:</strong> {priority || '—'}<br />
          <strong>Status:</strong> {status || '—'}<br />
          <strong>Título:</strong> {title || '—'}
        </Text>
        {ticketUrl ? (
          <Button href={ticketUrl} style={{ ...styles.buttonBase, backgroundColor: brand.primary }}>
            Abrir ticket
          </Button>
        ) : null}
      </BrandShell>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => `🎫 Novo ticket aberto — ${data.ticketNumber || 'OmniBiz'}`,
  displayName: 'Novo ticket de suporte',
} satisfies TemplateEntry
