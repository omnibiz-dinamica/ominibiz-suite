import * as React from 'react'
import { Button, Head, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BrandShell, resolveBrand, styles, type BrandProps } from './_brand'

interface Props extends BrandProps {
  employeeName?: string
  startDate?: string
  endDate?: string
  reason?: string
  reviewUrl?: string
}

const Email = ({ employeeName, startDate, endDate, reason, reviewUrl, ...brandProps }: Props) => {
  const brand = resolveBrand(brandProps)
  return (
    <Html lang="pt-PT" dir="ltr">
      <Head />
      <Preview>Funcionário solicitou alteração nas férias agendadas</Preview>
      <BrandShell brand={brand} preview="" title="Pedido de alteração de férias">
        <Text style={styles.text}>
          <strong>{employeeName || 'O funcionário'}</strong> pediu uma alteração nas férias que foram agendadas.
        </Text>
        <Section style={styles.card}>
          <Text style={{ ...styles.text, margin: 0 }}>
            <strong>Período proposto:</strong> {startDate} → {endDate}<br />
            <strong>Motivo:</strong> {reason || '—'}
          </Text>
        </Section>
        <Button href={reviewUrl || '#'} style={{ ...styles.buttonBase, backgroundColor: brand.primary }}>
          Rever pedido
        </Button>
      </BrandShell>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: 'Pedido de alteração de férias',
  displayName: 'Solicitação de alteração de férias',
  previewData: { employeeName: 'João', startDate: '01/07/2026', endDate: '15/07/2026', reason: 'Conflito com compromisso familiar' },
} satisfies TemplateEntry