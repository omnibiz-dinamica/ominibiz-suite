# OmniBiz — Architecture Decision Records (ADR)

> **Status:** Oficial · **Versão:** 1.0 · **Última revisão:** 2026-07-06
> **Escopo:** Registro imutável de decisões arquiteturais e produto. Cada decisão é numerada e nunca editada — apenas superseded por outra ADR posterior.

---

## Formato

```
## ADR-XXX — Título
- Data: YYYY-MM-DD
- Status: Proposta · Aceita · Superseded por ADR-YYY · Descartada
- Contexto: por que a decisão foi necessária
- Decisão: o que foi decidido
- Consequências: trade-offs, impactos, débitos aceitos
- Alternativas consideradas
```

---

## ADR-001 — Adoção do modelo RBAC com roles em tabela separada

- **Data:** 2026-06-01 · **Status:** Aceita
- **Contexto:** Necessidade de escalabilidade multiempresa e prevenção de escalação de privilégios.
- **Decisão:** Roles armazenadas em `public.user_roles` com `has_role()` SECURITY DEFINER. Nunca em `profiles`.
- **Consequências:** Prevenção de recursão RLS; JOIN extra em queries; ganho de segurança > custo.
- **Alternativas:** Coluna `role` em `profiles` (rejeitada — vetor de ataque).

---

## ADR-002 — Abstração de provedor de mapas (MapProvider)

- **Data:** 2026-07-01 · **Status:** Aceita
- **Contexto:** Custo do Google Maps escalando com uso; necessidade de trocar provedor sem refactor de features.
- **Decisão:** Interface única `MapProvider` com implementações Google (ativa), OSM e Mapbox (stubs). Feature code nunca importa provider direto.
- **Consequências:** Camada extra de indireção; troca de provedor via `VITE_MAP_PROVIDER` sem código.
- **Alternativas:** Uso direto do SDK Google (rejeitada — lock-in).

---

## ADR-003 — RPCs Punch v2 com política matricial de geofencing

- **Data:** 2026-07-04 · **Status:** Aceita
- **Contexto:** Necessidade de políticas independentes para start/stop e para fora-do-raio vs sem-GPS.
- **Decisão:** Novo conjunto `punch_*_v2` mantendo v1 para retrocompatibilidade. Políticas em `company_hr_settings`. Rejeições registradas em `time_entry_geopoints` com prefixo `__REJECTED__:<CODE>`.
- **Consequências:** Duplicação temporária de RPCs; caminho claro de migração; auditoria completa mesmo em rejeições.

---

## ADR-004 — Documentação como código

- **Data:** 2026-07-06 · **Status:** Aceita
- **Contexto:** Sprint de refinamento exige rastreabilidade entre análises, decisões e implementações.
- **Decisão:** Toda arquitetura, relatório e decisão vive em `docs/` versionado. `ARCHITECTURE_INDEX.md` é a porta única. Novos módulos incluem doc no mesmo commit da migração.
- **Consequências:** Overhead de escrita; ganho em onboarding e auditoria; reduz PRs "misteriosos".

---

## ADR-005 — Princípios arquiteturais como pré-requisito de módulo

- **Data:** 2026-07-06 · **Status:** Aceita
- **Contexto:** Evitar débito estrutural em novos módulos (IA, mobile, dashboards realtime).
- **Decisão:** `ARCHITECTURE_PRINCIPLES.md` (auditoria, timeline, IA-ready, mobile-ready, Domain Events, dashboards realtime, checklists evolutivos, proof-of-work) é leitura obrigatória para todo módulo novo.
- **Consequências:** Sprint inicial mais lento por módulo; migrações posteriores muito mais baratas.
- **Alternativas:** "Fazer simples primeiro e refatorar depois" (rejeitada — histórico mostra que refactor nunca acontece).

---

## ADR-006 — Geocoding via server function em vez de SDK cliente

- **Data:** 2026-07-06 · **Status:** Proposta (Fase 3)
- **Contexto:** Browser key restrita por referrer não autoriza Geocoding API → `REQUEST_DENIED` (ver KI-001).
- **Decisão:** Encaminhar `geocode` e `reverseGeocode` do provider Google via `createServerFn` → gateway `connector-gateway.lovable.dev/google_maps`.
- **Consequências:** Um roundtrip extra; segurança preservada; unblock da UX de clientes.
- **Alternativas:** Configurar Geocoding na browser key (rejeitada — chave é managed, não editável).

---

## ADR-007 — Domain Events como espinha dorsal de dashboards e IA

- **Data:** 2026-07-06 · **Status:** Proposta (Fase 5)
- **Contexto:** Dashboards múltiplos consultam tabelas heterogêneas; futura IA precisa de stream unificado.
- **Decisão:** Tabela `domain_events` append-only publicada em Realtime. Eventos `<aggregate>.<past_participle>`. Payload autocontido.
- **Consequências:** Escrita dupla (tabela + evento); ganho enorme em observabilidade e futura BI.

---

## ADR-008 — Perfil operacional por cliente (`operational_profile`)

- **Data:** 2026-07-06 · **Status:** Proposta (Fase 5)
- **Contexto:** Cliente COIFA exige modo manual sem "iniciar tarefa"; futuros clientes terão outros perfis.
- **Decisão:** Enum `client_operational_profile` (`standard`, `manual_only`, `photo_required`, `checklist_required`, `full_proof`). Regras de UI e RPC leem esse perfil.
- **Consequências:** Configuração no cadastro do cliente; escala sem código para novos perfis com regras já mapeadas.
- **Alternativas:** Hard-code de "COIFA" (rejeitada — inviável para SaaS).

---

**Regra:** ADR aprovada é imutável. Mudança de rumo cria nova ADR marcando a anterior como `Superseded por ADR-YYY`.