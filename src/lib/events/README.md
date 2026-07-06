# `src/lib/events/` — Domain Events (Scaffold)

> **Status:** Scaffold · **Fase 4** (2026-07-06) · **Sem implementação funcional ainda.**

Esta pasta reserva o espaço arquitetural para os **Domain Events** definidos
em [`docs/ARCHITECTURE_PRINCIPLES.md §5`](../../../docs/ARCHITECTURE_PRINCIPLES.md)
e em [`docs/DECISIONS.md · ADR-007`](../../../docs/DECISIONS.md).

## Objetivo (Fase futura)

Fonte única de escrita e leitura para a tabela `domain_events` (append-only),
consumida por:

- Dashboards agregados multi-módulo
- Timelines históricas (`<XxxTimeline />`)
- Integrações externas (webhooks, BI)
- Camada de IA (RAG, análise de padrões, alertas)

## O que existe hoje

- [`types.ts`](./types.ts) — contratos TypeScript para o payload de eventos.
  Serve como referência de nomenclatura enquanto a tabela `domain_events`
  não existe.

## O que NÃO fazer ainda

- Não criar migração da tabela `domain_events` sem ADR aprovada.
- Não escrever emissores (`emitEvent`) nem consumidores neste diretório.
- Não usar estes tipos em código de produção (apenas leitura conceitual).

## Roadmap de ativação

1. Aprovar ADR-007 (proposta hoje).
2. Migração: criar `public.domain_events` + GRANTs + RLS.
3. Publicação Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE domain_events`.
4. Implementar `emitEvent(supabase, event)` server-side em RPCs de escrita.
5. Consumir via [`src/lib/realtime/subscribe.ts`](../realtime/subscribe.ts).