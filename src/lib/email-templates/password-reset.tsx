import * as React from 'react'
import { Button, Head, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BrandShell, resolveBrand, styles, type BrandProps } from './_brand'

interface Props extends BrandProps {
  resetUrl?: string
  expiresInMinutes?: number
}

const Email = ({ resetUrl, expiresInMinutes = 60, ...brandProps }: Props) => {
  const brand = resolveBrand(brandProps)
  return (
    <Html lang="pt-PT" dir="ltr">
      <Head />
      <Preview>Redefinir palavra-passe — {brand.name}</Preview>
      <BrandShell brand={brand} preview="" title="Redefinir palavra-passe">
        <Text style={styles.text}>
          Recebemos um pedido para redefinir a palavra-passe da sua conta em <strong>{brand.name}</strong>.
        </Text>
        <Button href={resetUrl || '#'} style={{ ...styles.buttonBase, backgroundColor: brand.primary }}>
          Definir nova palavra-passe
        </Button>
        <Text style={{ ...styles.text, marginTop: '20px' }}>
          Este link é de uso único e expira em <strong>{expiresInMinutes} minutos</strong>.
          Se não foi você, ignore este email e a sua palavra-passe permanecerá inalterada.
        </Text>
      </BrandShell>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: 'Redefinir palavra-passe',
  displayName: 'Reset de palavra-passe',
  previewData: { resetUrl: 'https://example.com/reset', expiresInMinutes: 60 },
} satisfies TemplateEntry