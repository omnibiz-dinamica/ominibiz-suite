import * as React from 'react'
import { Button, Head, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BrandShell, resolveBrand, styles, type BrandProps } from './_brand'

interface Props extends BrandProps {
  startDate?: string
  endDate?: string
  reason?: string
  decidedBy?: string
  appUrl?: string
}

const Email = ({ startDate, endDate, reason, decidedBy, appUrl, ...brandProps }: Props) => {
  const brand = resolveBrand(brandProps)
  return (
    <Html lang="pt-PT" dir="ltr">
      <Head />
      <Preview>O seu pedido de férias foi rejeitado</Preview>
      <BrandShell brand={brand} preview="" title="Pedido de férias rejeitado">
        <Text style={styles.text}>O seu pedido de férias foi analisado e não foi aprovado.</Text>
        <Section style={styles.card}>
          <Text style={{ ...styles.text, margin: 0 }}>
            <strong>Período:</strong> {startDate} → {endDate}<br />
            {decidedBy ? <><strong>Decidido por:</strong> {decidedBy}<br /></> : null}
            {reason ? <><strong>Motivo:</strong> {reason}</> : null}
          </Text>
        </Section>
        {appUrl ? (
          <Button href={appUrl} style={{ ...styles.buttonBase, backgroundColor: brand.primary }}>
            Ver detalhes
          </Button>
        ) : null}
      </BrandShell>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: 'Atualização sobre o seu pedido de férias',
  displayName: 'Férias rejeitadas',
  previewData: { startDate: '01/07/2026', endDate: '15/07/2026', decidedBy: 'Gestor', reason: 'Período com pico operacional.' },
} satisfies TemplateEntry