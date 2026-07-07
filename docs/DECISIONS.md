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

## ADR-009 — Geocoding server-side via Lovable Connector Gateway

- **Data:** 2026-07-06 · **Status:** Aceita (Fase 3)
- **Contexto:** A browser key gerida pela Lovable é restrita por HTTP Referrer e só autoriza Maps JavaScript API + Places API (New); chamadas ao Geocoding API sempre retornam `REQUEST_DENIED` (KI-001). Expor uma key com Geocoding habilitado no navegador criaria risco de abuso e custos incontroláveis.
- **Decisão:** Todo geocoding (direto e reverso) roda em **server functions TanStack Start** (`src/lib/maps/geocoding.functions.ts`) que chamam `connector-gateway.lovable.dev/google_maps/maps/api/geocode/json` com `Authorization: Bearer ${LOVABLE_API_KEY}` + `X-Connection-Api-Key: ${GOOGLE_MAPS_API_KEY}`. O provider `MapProvider.geocode/reverseGeocode` continua sendo o único ponto de acoplamento da UI (contrato preservado).
- **Consequências:** (+) segredos nunca cruzam o boundary do navegador; (+) roundtrip único mesmo em Preview e Produção; (+) telemetria server-side no gateway; (−) latência adicional de 1 hop; (−) endpoint sujeito às cotas do gateway.
- **Alternativas consideradas:** (a) Habilitar Geocoding na browser key — rejeitada por exposição/custos; (b) Usar Places API (New) no browser para autocomplete — mantém-se em avaliação para autocomplete, mas o geocoding textual permanece server-side.

---

## ADR-010 — Cache central de Clientes (`invalidateClientsCache`)

- **Data:** 2026-07-06 · **Status:** Aceita (Fase 3)
- **Contexto:** Seis queryKeys diferentes leem `public.clients` (KI-002). Cada mutation local só invalidava uma parte, causando UI desatualizada em telas secundárias (tarefas, ponto, gestão, wizard).
- **Decisão:** Um único helper `invalidateClientsCache(qc)` em `src/lib/cache/clients.ts` invalida em bloco todos os prefixos declarados em `CLIENTS_QUERY_PREFIXES`. Toda mutation e realtime subscriber que altere `public.clients` DEVE chamar esse helper — nunca invalidar prefixos avulsos.
- **Consequências:** (+) fonte única de verdade para invalidação; (+) adicionar nova tela que consome clientes vira uma linha no array; (−) invalidações extras (baixo custo — dados pequenos).
- **Alternativas consideradas:** (a) Padronizar um único queryKey em toda a base — rejeitada por custo de refactor e perda de granularidade; (b) Depender apenas de Realtime — rejeitada porque a UI otimista precisa refletir antes do broadcast.

---

## ADR-011 — Infraestrutura Realtime unificada (`useRealtimeInvalidate`)

- **Data:** 2026-07-06 · **Status:** Aceita (Fase 4)
- **Contexto:** Cada módulo criava seu próprio `supabase.channel(...).subscribe()` inline, com risco alto de: (a) esquecer o cleanup e vazar subscribers em loop, (b) colidir nome de canal entre módulos, (c) reagir com `invalidateQueries` avulso — bypassing o helper de cache do módulo. A regra `cloud-realtime` já obriga cleanup em `useEffect`; faltava um wrapper que impedisse regressão.
- **Decisão:** `src/lib/realtime/subscribe.ts` centraliza toda subscrição Realtime. Módulos NUNCA chamam `supabase.channel(...)` diretamente para reagir a `postgres_changes`. Padrão obrigatório em novos módulos: `useRealtimeInvalidate({ channel, table, filter, queryClient, invalidate: <cacheHelper> })`.
- **Consequências:** (+) contrato uniforme (nome de canal, cleanup, filtro); (+) força uso do helper de cache do módulo (ADR-012); (+) trivial migrar para Domain Events (ADR-007) — basta trocar `table` por `domain_events` com filtro `aggregate_type=eq.<x>`; (−) uma camada de indireção.
- **Alternativas consideradas:** (a) manter subscribe inline por módulo — rejeitada (padrão frágil); (b) mover tudo para um único WebSocket agregador server-side — reavaliada em ADR-007 quando `domain_events` existir.

---

## ADR-012 — Helpers de cache obrigatórios por módulo

- **Data:** 2026-07-06 · **Status:** Aceita (Fase 4)
- **Contexto:** KI-002 nasceu porque cada tela criava seu próprio `queryKey` e mutations invalidavam parcialmente. A Fase 3 resolveu para Clientes com `invalidateClientsCache`. Precisamos padronizar antes que novos módulos repitam o padrão antigo.
- **Decisão:** Todo módulo com dois ou mais `queryKey` que leem da mesma entidade DEVE expor `src/lib/cache/<modulo>.ts` com: (a) constante `<MODULO>_QUERY_PREFIXES`, (b) `invalidate<Modulo>Cache(qc)` e opcional `invalidate<Modulo>CacheAsync(qc)`. Nenhum código de produção pode invalidar prefixos de tabelas cobertas por helper via `qc.invalidateQueries` avulso.
- **Consequências:** (+) fonte única de verdade; (+) auditável (grep no prefixo revela todos os consumers); (+) adiciona uma tela nova = 1 linha no array; (−) fluxo levemente mais burocrático em módulos triviais.
- **Aplicado em Fase 4:** `src/lib/cache/notifications.ts`. Roadmap: RH, Tarefas, Férias, Despesas, Comercial, Frota, Contratos.

---

## ADR-013 — Componentes reutilizáveis em `src/components/common/*`

- **Data:** 2026-07-06 · **Status:** Aceita (Fase 4)
- **Contexto:** `<EmployeePicker />` seria útil em Tarefas, RH, Férias, Despesas, Comercial, Frota, Recibos e Contratos. Sem regra clara, cada módulo criaria a sua variante.
- **Decisão:** Componentes de uso transversal (picker de funcionário, picker de cliente, timeline, uploader de fotos etc.) vivem em `src/components/common/`. Contratos de props devem ser abertos (aceitam superconjunto de campos) para reduzir acoplamento com o schema exato de cada tela. Componentes específicos de módulo permanecem em `src/components/<modulo>/`.
- **Consequências:** (+) reduz duplicação; (+) evolução central (a11y, virtualização, i18n) beneficia todos os módulos; (−) exige disciplina para não vazar lógica de módulo dentro do componente comum.
- **Aplicado em Fase 4:** `src/components/common/EmployeePicker.tsx`. Roadmap Fase 5: `ClientPicker`, `PhotoUploader`, `AuditTimeline`.

---

**Regra:** ADR aprovada é imutável. Mudança de rumo cria nova ADR marcando a anterior como `Superseded por ADR-YYY`.

---

## ADR-014 — Envio automático do convite (Onboarding)

- **Data:** 2026-07-07 · **Status:** Aceita (Fase 5)
- **Contexto:** O fluxo Super Admin → criar empresa exibia link para o gestor copiar. Isso obrigava envio manual, gerava links fora do canal oficial e não ficava registado em `email_send_log`.
- **Decisão:** Toda criação/reenvio/troca-de-email de convite dispara automaticamente `sendTransactionalEmail` (template `invite`, `trigger_source='invite'`). O envio manual sobrevive **apenas como contingência** oculta em `<details>` caso o envio automático falhe.
- **Consequências:** (+) auditoria completa em `email_send_log`; (+) UX consistente com o fluxo já homologado em Equipe; (+) elimina passo manual do Super Admin; (−) exige monitorar falhas de envio (visível ao Super Admin no toast + card de convite da empresa).
- **Aplicado em Fase 5:** `src/routes/app.admin.tsx`, `src/components/empresa/ManagerInviteCard.tsx`.

---

## ADR-015 — Helper único `sendInviteEmail`

- **Data:** 2026-07-07 · **Status:** Aceita (Fase 5)
- **Contexto:** `app.equipe.tsx` já montava payload de email de convite. `app.admin.tsx` e o novo card de empresa precisariam repetir a lógica (montar `inviteUrl`, `idempotencyKey`, `templateData`).
- **Decisão:** Centralizar em `src/lib/invites/send-invite-email.ts`. `idempotencyKey` deriva de `kind + inviteId + sendCount` (`create` / `resend` / `replace`), garantindo dedupe correta.
- **Consequências:** (+) fonte única para o payload do template; (+) alterações futuras (novo campo, novo template) num único ponto; (−) call sites existentes em `app.equipe.tsx` continuarão funcionando; migração para o helper é oportunista, não obrigatória agora.
- **Aplicado em Fase 5:** `app.admin.tsx`, `ManagerInviteCard`. Roadmap: refatorar `app.equipe.tsx` para consumir o helper.