import * as React from 'react'
import { Button, Head, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BrandShell, resolveBrand, styles, type BrandProps } from './_brand'

interface Props extends BrandProps {
  periodLabel?: string
  downloadUrl?: string
  downloadExpiresAt?: string
}

const Email = ({ periodLabel, downloadUrl, downloadExpiresAt, ...brandProps }: Props) => {
  const brand = resolveBrand(brandProps)
  return (
    <Html lang="pt-PT" dir="ltr">
      <Head />
      <Preview>O seu recibo de vencimento está disponível</Preview>
      <BrandShell brand={brand} preview="" title="Recibo disponível">
        <Text style={styles.text}>
          O seu recibo de vencimento {periodLabel ? <>referente a <strong>{periodLabel}</strong> </> : null}
          já está disponível em <strong>{brand.name}</strong>.
        </Text>
        {downloadUrl ? (
          <>
            <Button href={downloadUrl} style={{ ...styles.buttonBase, backgroundColor: brand.primary }}>
              Descarregar recibo
            </Button>
            {downloadExpiresAt ? (
              <Text style={{ ...styles.text, marginTop: '16px' }}>
                Este link de descarga expira em <strong>{downloadExpiresAt}</strong>.
              </Text>
            ) : null}
          </>
        ) : (
          <Section style={styles.card}>
            <Text style={{ ...styles.text, margin: 0 }}>
              Aceda a {brand.name} para visualizar e descarregar o seu recibo.
            </Text>
          </Section>
        )}
      </BrandShell>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Recibo disponível${d.periodLabel ? ` — ${d.periodLabel}` : ''}`,
  displayName: 'Recibo publicado',
  previewData: { periodLabel: '06/2026', downloadUrl: 'https://example.com/recibo', downloadExpiresAt: '7 dias' },
} satisfies TemplateEntry