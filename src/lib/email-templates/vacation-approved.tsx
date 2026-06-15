import * as React from 'react'
import { Button, Head, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BrandShell, resolveBrand, styles, type BrandProps } from './_brand'

interface Props extends BrandProps {
  startDate?: string
  endDate?: string
  totalDays?: number
  decidedBy?: string
  appUrl?: string
}

const Email = ({ startDate, endDate, totalDays, decidedBy, appUrl, ...brandProps }: Props) => {
  const brand = resolveBrand(brandProps)
  return (
    <Html lang="pt-PT" dir="ltr">
      <Head />
      <Preview>O seu pedido de férias foi aprovado</Preview>
      <BrandShell brand={brand} preview="" title="Pedido de férias aprovado">
        <Text style={styles.text}>Boas notícias! O seu pedido de férias foi aprovado.</Text>
        <Section style={styles.card}>
          <Text style={{ ...styles.text, margin: 0 }}>
            <strong>Período:</strong> {startDate} → {endDate}<br />
            {totalDays ? <><strong>Dias:</strong> {totalDays}<br /></> : null}
            {decidedBy ? <><strong>Aprovado por:</strong> {decidedBy}</> : null}
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
  subject: 'O seu pedido de férias foi aprovado',
  displayName: 'Férias aprovadas',
  previewData: { startDate: '01/07/2026', endDate: '15/07/2026', totalDays: 11, decidedBy: 'Gestor' },
} satisfies TemplateEntry