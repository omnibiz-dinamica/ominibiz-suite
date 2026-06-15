import * as React from 'react'
import { Button, Head, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BrandShell, resolveBrand, styles, type BrandProps } from './_brand'

interface Props extends BrandProps {
  inviteUrl?: string
  role?: string
  expiresAt?: string
}

const Email = ({ inviteUrl, role, expiresAt, ...brandProps }: Props) => {
  const brand = resolveBrand(brandProps)
  return (
    <Html lang="pt-PT" dir="ltr">
      <Head />
      <Preview>Foi convidado para {brand.name}</Preview>
      <BrandShell brand={brand} preview="" title={`Convite para ${brand.name}`}>
        <Text style={styles.text}>
          Olá! Recebeu um convite para integrar a equipa de <strong>{brand.name}</strong>
          {role ? <> como <strong>{role}</strong></> : null}.
        </Text>
        <Text style={styles.text}>
          Clique no botão abaixo para aceitar o convite e criar a sua conta.
        </Text>
        <Button
          href={inviteUrl || '#'}
          style={{ ...styles.buttonBase, backgroundColor: brand.primary }}
        >
          Aceitar convite
        </Button>
        {expiresAt ? (
          <Text style={{ ...styles.text, marginTop: '20px' }}>
            Este convite expira em <strong>{expiresAt}</strong> e só pode ser usado uma vez.
          </Text>
        ) : null}
      </BrandShell>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Convite para ${d.companyName || 'OmniBiz'}`,
  displayName: 'Convite de equipa',
  previewData: {
    companyName: 'OmniBiz',
    inviteUrl: 'https://ominibiz-suite.lovable.app/aceitar-convite?token=demo',
    role: 'Funcionário',
    expiresAt: '14 dias',
  },
} satisfies TemplateEntry