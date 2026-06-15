import * as React from 'react'
import { Body, Container, Heading, Img, Section, Text } from '@react-email/components'

export interface BrandProps {
  companyName?: string
  companyLogoUrl?: string
  companyPrimaryColor?: string
}

export const BRAND_DEFAULT = {
  name: 'OmniBiz',
  primary: '#0F172A',
  logoUrl: 'https://ominibiz-suite.lovable.app/icon-192.png',
}

export function resolveBrand(p: BrandProps) {
  return {
    name: p.companyName || BRAND_DEFAULT.name,
    primary: p.companyPrimaryColor || BRAND_DEFAULT.primary,
    logoUrl: p.companyLogoUrl || BRAND_DEFAULT.logoUrl,
  }
}

export const styles = {
  main: { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' },
  container: { padding: '24px', maxWidth: '560px', margin: '0 auto' },
  header: { padding: '8px 0 24px', borderBottom: '1px solid #e5e7eb', marginBottom: '24px' },
  logo: { height: '32px', width: 'auto' },
  h1: { fontSize: '22px', fontWeight: 700 as const, color: '#0F172A', margin: '0 0 16px' },
  text: { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0 0 16px' },
  small: { fontSize: '12px', color: '#6b7280', margin: '24px 0 0' },
  buttonBase: {
    display: 'inline-block',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600 as const,
    borderRadius: '8px',
    padding: '12px 20px',
    textDecoration: 'none',
  },
  card: {
    background: '#f8fafc',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '16px',
    margin: '16px 0',
  },
}

export function BrandShell({
  brand,
  preview,
  title,
  children,
}: {
  brand: ReturnType<typeof resolveBrand>
  preview: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Img src={brand.logoUrl} alt={brand.name} style={styles.logo} />
        </Section>
        <Heading style={styles.h1}>{title}</Heading>
        {children}
        <Text style={styles.small}>
          {brand.name} · Este email foi enviado automaticamente. Caso não tenha solicitado, ignore esta mensagem.
        </Text>
      </Container>
    </Body>
  )
}