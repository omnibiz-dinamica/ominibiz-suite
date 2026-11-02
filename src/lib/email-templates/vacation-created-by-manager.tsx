import * as React from 'react'
import { Button, Head, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BrandShell, resolveBrand, styles, type BrandProps } from './_brand'

interface Props extends BrandProps {
  employeeName?: string
  managerName?: string
  startDate?: string
  endDate?: string
  totalDays?: number
  note?: string
  reviewUrl?: string
}

const Email = ({ employeeName, managerName, startDate, endDate, totalDays, note, reviewUrl, ...brandProps }: Props) => {
  const brand = resolveBrand(brandProps)
  return (
    <Html lang="pt-PT" dir="ltr">
      <Head />
      <Preview>Férias marcadas pelo gestor</Preview>
      <BrandShell brand={brand} preview="" title="Férias marcadas para si">
        <Text style={styles.text}>
          Olá{employeeName ? ` ${employeeName}` : ''}, {managerName || 'o gestor'} marcou-lhe férias.
          Não é preciso confirmar: as férias já estão aprovadas.
        </Text>
        <Section style={styles.card}>
          <Text style={{ ...styles.text, margin: 0 }}>
            <strong>Período:</strong> {startDate} → {endDate}<br />
            {totalDays ? <><strong>Dias:</strong> {totalDays}<br /></> : null}
            {note ? <><strong>Nota:</strong> {note}</> : null}
          </Text>
        </Section>
        <Button href={reviewUrl || '#'} style={{ ...styles.buttonBase, backgroundColor: brand.primary }}>
          Ver as minhas férias
        </Button>
      </BrandShell>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: 'Férias marcadas pelo gestor',
  displayName: 'Férias agendadas pelo gestor',
  previewData: { employeeName: 'João', managerName: 'Maria', startDate: '01/07/2026', endDate: '15/07/2026', totalDays: 11 },
} satisfies TemplateEntry