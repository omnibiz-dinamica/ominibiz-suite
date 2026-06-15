import * as React from 'react'
import { Button, Head, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BrandShell, resolveBrand, styles, type BrandProps } from './_brand'

interface Props extends BrandProps {
  employeeName?: string
  startDate?: string
  endDate?: string
  totalDays?: number
  note?: string
  reviewUrl?: string
}

const Email = ({ employeeName, startDate, endDate, totalDays, note, reviewUrl, ...brandProps }: Props) => {
  const brand = resolveBrand(brandProps)
  return (
    <Html lang="pt-PT" dir="ltr">
      <Head />
      <Preview>Novo pedido de férias para aprovação</Preview>
      <BrandShell brand={brand} preview="" title="Novo pedido de férias">
        <Text style={styles.text}>
          <strong>{employeeName || 'Um funcionário'}</strong> submeteu um pedido de férias para análise.
        </Text>
        <Section style={styles.card}>
          <Text style={{ ...styles.text, margin: 0 }}>
            <strong>Período:</strong> {startDate} → {endDate}<br />
            {totalDays ? <><strong>Dias:</strong> {totalDays}<br /></> : null}
            {note ? <><strong>Observação:</strong> {note}</> : null}
          </Text>
        </Section>
        <Button href={reviewUrl || '#'} style={{ ...styles.buttonBase, backgroundColor: brand.primary }}>
          Analisar pedido
        </Button>
      </BrandShell>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: 'Novo pedido de férias para aprovação',
  displayName: 'Pedido de férias (gestor)',
  previewData: { employeeName: 'João Silva', startDate: '01/07/2026', endDate: '15/07/2026', totalDays: 11, reviewUrl: 'https://example.com/ferias' },
} satisfies TemplateEntry