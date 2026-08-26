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
---

## ADR-016 — Liberação de Identidade (soft release)

- **Data:** 2026-07-14 · **Status:** Aceita (Fase A das Atualizações Operacionais V1.0)
- **Contexto:** Em homologação surgem casos em que um email precisa ser reutilizado sem apagar o histórico operacional (tarefas, ponto, geolocalização, valorizações) daquele UUID. Um `DELETE` em `auth.users` violaria a integridade referencial do OmniBiz, cujo princípio é UUID = identidade permanente.
- **Decisão:** Introduzir a RPC `public.admin_release_user_identity(_user_id uuid)` (SECURITY DEFINER, restrita a super_admin), que:
  1. remove `user_roles` do utilizador;
  2. limpa `profiles.current_company_id` e `company_id_primary`;
  3. marca `profiles.is_active = false`;
  4. revoga convites `pending` do email atual;
  5. renomeia `auth.users.email` para `retired+<uuid>@homologacao.invalid` e sincroniza `auth.identities.identity_data->>'email'`.
  Nada é apagado. Todo histórico operacional (tasks, time_entries, geopoints, valuations, employee_expenses, vacation_requests, contracts, notifications, payslips) permanece íntegro. Idempotente.
- **Consequências:** (+) reutilização segura de emails em homologação; (+) auditoria preservada; (+) fluxo oficial de convite volta a funcionar; (−) o UUID retirado permanece visível em relatórios históricos com o email `retired+…@homologacao.invalid` (aceito, pois é o próprio propósito da preservação).
- **Aplicado em:** migration Fase A · consumida via SQL admin ou (roadmap) endpoint interno restrito.

---

## ADR-017 — Hierarquia de valores de faturação

- **Data:** 2026-07-15 · **Status:** Aceita (Fases A · B · C · D das Atualizações Operacionais V1.0)
- **Contexto:** Cada cliente pode ter forma de cobrança própria (hora, fixo, mensal ou misto) e cada funcionário pode receber valorização diferente por acordo individual. Sem regra clara de precedência, cada rotina de valorização inventaria a sua.
- **Decisão:** Estabelecer hierarquia única de resolução do valor efetivo, aplicada em toda rotina de valorização (tasks → time_entry_valuations → payslips):
  1. **`profiles.manual_hourly_rate` / `manual_fixed_rate` / `manual_monthly_rate`** — override individual do funcionário (Aba Financeiro do EmployeeEditor).
  2. **`clients.hourly_rate` / `fixed_rate` / `monthly_rate`** — valor definido no cliente (`app.clientes`).
  3. **`companies.default_hourly_rate` / `default_fixed_rate` / `default_monthly_rate`** — fallback da empresa (card "Valores padrão" em `/app/empresa`).
  Valor `NULL` significa "herda do nível seguinte". Se todos forem `NULL`, o motor de valorização registra `not_applicable` — nunca zero implícito.
- **Consequências:** (+) resolução previsível e auditável; (+) permite migrar clientes/funcionários gradualmente para valores próprios; (+) integra `billing_mode` misto (hora + fixo + mensal); (−) exige que todas as futuras rotinas de valorização consumam a mesma cadeia (encapsular num helper `resolve_billing_rate` é a próxima ADR quando o motor de valorização for reescrito).
- **Aplicado em:** migrations Fase A + Bloco 1; UIs `app.empresa` (empresa), `app.clientes` (cliente), `EmployeeEditor · Financeiro` (funcionário).

---

## ADR-018 — Recorrência condicional por modo de apontamento

- **Data:** 2026-07-16 · **Status:** Aceita (Fase E das Atualizações Operacionais V1.0)
- **Contexto:** Clientes com `timing_mode = 'manual'` não usam start/stop de folha de ponto — apenas registram a existência da tarefa. Exibir "Horário" e "Duração estimada" no formulário de recorrência confunde e induz dados inúteis.
- **Decisão:** `RecurrenceForm` aceita prop `timingMode?: 'start_stop' | 'manual'`. Quando `manual`, os campos "Horário" e "Duração estimada" são ocultados; apenas datas (início/fim) são requeridas. O consumidor (formulário de tarefa) deriva o `timingMode` a partir do cliente selecionado; `undefined` mantém o comportamento clássico (start_stop) por retrocompatibilidade.
- **Consequências:** (+) UI segue o contrato do cliente sem duplicação de código; (+) retrocompatível — chamadores existentes não quebram; (−) o valor `scheduled_time` gravado em `task_recurrences` para clientes manual será o default do form (`09:00`); ao materializar tarefas o motor de materialização deve ignorar `scheduled_time` quando o cliente é manual (já está no roadmap do motor de valorização).
- **Aplicado em:** `src/components/tasks/RecurrenceForm.tsx`, `src/routes/app.tarefas.tsx`.

---

## ADR-019 — Filtros de listagem em Tarefas via search-params validados

- **Data:** 2026-07-16 · **Status:** Aceita (Fase F das Atualizações Operacionais V1.0)
- **Contexto:** A tela `/app/tarefas` precisava aceitar filtros vindos do dashboard (status) e permitir filtragem por funcionário sem recarga, mas o estado devia ser compartilhável (bookmark, chat, deep-link).
- **Decisão:** Adotar `validateSearch` do TanStack Router com o shape `{ status?: StatusFilter; employee?: string }`. O filtro `atrasadas` é **derivado** (não é status persistido) — combina `status ≠ concluido` + `due_at < now()`. O dashboard passa `search={{ status }}` no `<Link>` e a UI de tarefas lê `Route.useSearch()`; alterações usam `Route.useNavigate({ replace: true })` para não poluir o histórico de navegação.
- **Consequências:** (+) filtros bookmarkable/compartilháveis; (+) validação forte de search-params impede injeção; (+) retrocompatível — URLs sem query continuam válidas; (−) filtro `atrasadas` fica no cliente (pequenos volumes) — quando lista escalar, mover cálculo para a query.
- **Aplicado em:** `src/routes/app.tarefas.tsx`, `src/routes/app.index.tsx`.

---

## ADR-020 — `EmployeePicker` como componente canônico de filtro por funcionário

- **Data:** 2026-07-16 · **Status:** Aceita (Fase G das Atualizações Operacionais V1.0)
- **Contexto:** Cada módulo gerencial reinventava seu `<Select>` de "colaborador" — sem busca por cargo/equipe, sem virtualização, com UX divergente.
- **Decisão:** `src/components/common/EmployeePicker.tsx` é a única implementação canônica. Contrato aberto (`{ id, full_name, email?, job_title?, team? }`), debounce 180 ms, virtualização automática > 60 itens, `role="combobox"`. Rollout inicial: Tarefas, Despesas, Férias e Ponto/Gestão. RH-Recibos e Comercial adotarão no próximo ciclo (KI-021).
- **Consequências:** (+) UX consistente e código não duplicado; (+) performance previsível; (−) módulos ainda não migrados apresentam divergência de UX temporária.
- **Aplicado em:** `src/routes/app.tarefas.tsx`, `src/routes/app.despesas.tsx`, `src/routes/app.ferias.tsx`, `src/routes/app.ponto_.gestao.tsx`.

---

## Roadmap Técnico Futuro

Recomendações arquiteturais identificadas durante o desenvolvimento das Atualizações Operacionais V1.0, registradas aqui para que nenhuma melhoria seja perdida. Ordem sugerida:

1. **Helper `resolve_billing_rate(user_id, client_id)`** — encapsular a hierarquia funcionário → cliente → empresa em uma única função (SQL + TS). Motor de valorização, payslips e relatórios devem consumir apenas esse helper. Prevê-se ADR-021.
2. **Motor de materialização ciente de `timing_mode`** — quando o cliente é manual, ignorar `scheduled_time` e `duration_minutes` no materializador de `task_recurrences` (hoje o form já esconde, mas o backend ainda persiste defaults).
3. **Rollout do `EmployeePicker` em RH-Recibos e Comercial** — completar a paridade de UX (KI-021).
4. **Painel Super Admin: "Homologação — reset de senhas"** — implementar UI + `createServerFn` protegido por `requireSupabaseAuth` + validação Super Admin + `supabaseAdmin.auth.admin.updateUserById`, com whitelist explícita de e-mails de homologação. Substitui procedimentos SQL manuais e resolve KI-022.
5. **Auditoria de mudança de `billing_mode` e `timing_mode`** — hoje as alterações em `clients` gravam `updated_at` mas não emitem Domain Event específico. Adicionar `client_billing_changed` e `client_timing_changed` ao futuro barramento de Domain Events.
6. **Materialização de "Atrasadas" no servidor** — quando volumes crescerem, mover o cálculo do filtro derivado `atrasadas` para uma view SQL ou índice parcial, evitando trazer toda a lista para o cliente.
7. **`inputValidator` com Zod em todas as serverFns** — padronização progressiva; começar por funções de alto risco (admin, financeiro).
8. **Testes E2E em Playwright para os fluxos V1.0** — cobrir dashboard clicável, filtros persistentes, hierarquia de valores e recorrência condicional.
9. **Índice `tasks (assigned_to, status, due_at)`** — o filtro derivado atrasadas + `EmployeePicker` combinados serão os queries mais frequentes; um índice composto acelera o dashboard.
10. **Wiring de `functionMiddleware` em `src/start.ts`** — atualmente o projeto não expõe `start.ts`. Sem esse wiring, `createServerFn` protegido por `requireSupabaseAuth` não recebe bearer no cliente. Pré-requisito para o item 4.

## ADR-021 — Central de Suporte em 2 Níveis (2026-07-23)

**Contexto.** O fluxo original enviava tickets diretamente ao Super Admin,
misturando dúvidas operacionais (que o Gestor resolveria) com pedidos
técnicos reais, sobrecarregando o SA e retirando autonomia do Gestor.

**Decisão.**
1. **Nível 1 (Empresa · Gestor)** — funcionário abre ticket; Gestor tem
   propriedade inicial (`current_owner_role='manager'`,
   `support_level='company'`) e pode: solicitar informação, resolver
   internamente (`resolved_by_manager`) ou escalar
   (`escalated → under_technical_review`).
2. **Nível 2 (Técnico · Super Admin)** — recebido via escalonamento ou
   criado diretamente pelo SA. SA pode devolver a triagem
   (`returned_to_manager`).
3. **Propriedade explícita** — todas as transições passam por RPC
   `SECURITY DEFINER`; UI apenas expõe as ações válidas para o
   `effectiveRole` × `current_owner_role`.
4. **Isolamento do funcionário** — RLS restringe SELECT/UPDATE aos
   próprios tickets; notas internas nunca são retornadas; trigger bloqueia
   alteração de status/prioridade/nível pelo funcionário.

**Consequências.** Gestor ganha autonomia operacional; SA foca em
desenvolvimento técnico; auditoria completa via `support_ticket_events`
append-only; base preparada para SLAs distintos por nível (roadmap).

---

## ADR-022 — Ordenação canônica de tarefas e regularização de ponto (2026-07-26)

**Contexto.** Cada tela (lista desktop, lista mobile, calendário, folha de
ponto, dashboard) aplicava o seu próprio `sort()` com critérios diferentes
(`due_at`, `scheduled_for`, `created_at`), produzindo ordens divergentes entre
Gestor e Funcionário (SUP-2026-000040). Além disso, tarefas passadas ausentes
ou atrasadas apareciam no topo da operação e davam a impressão de bloquear a
tarefa seguinte.

**Decisão.**
1. **Ponto único de ordenação** em `src/lib/tasks.ts`. Nenhuma tela pode
   reimplementar comparadores; `sortTasksForDisplay` é obrigatório e é
   reaplicado após qualquer filtro.
2. **Buckets operacionais**: em andamento → atrasadas → pendentes → ausentes →
   concluídas → canceladas. Atrasadas ordenam da mais antiga (mais crítica);
   pendentes, da mais próxima do agora; terminais, pela data oficial do estado.
3. **Wall-clock**: chaves de ordenação derivam do horário-parede da ocorrência,
   sem influência do fuso do dispositivo; ausência de horário ordena no fim do
   próprio dia e é rotulada "Sem horário definido".
4. **Sem bloqueio em cascata**: tarefa anterior ausente/atrasada nunca impede
   iniciar a próxima. O funcionário regulariza o registo perdido via
   `punch_employee_regularize` (`origin='manual_adjustment'`), com motivo
   obrigatório, validação de sobreposição e auditoria before/after.

**Consequências.** Ordem idêntica em todos os papéis e dispositivos; correções
futuras de prioridade são feitas num único comparador; ajustes manuais do
funcionário são rastreáveis e distinguíveis dos apontamentos automáticos.

---

## ADR-023 — Confirmação de férias baseada na autoria do pedido (2026-07-26)

**Contexto.** `vacation_decide` exigia confirmação do colaborador sempre que
o aprovador era diferente do solicitante. Como o fluxo padrão é
"funcionário pede → gestor aprova", pedidos aprovados caíam indevidamente em
`pendente_confirmacao`, gerando notificação de ação requerida sem necessidade
(SUP-2026-000045).

**Decisão.**
1. `vacation_requests.created_by` passa a registar a autoria (trigger).
2. A aprovação exige confirmação **apenas** quando `created_by <> user_id`,
   isto é, quando o gestor agenda férias em nome do colaborador.
3. Pedido criado pelo próprio colaborador: aprovação do gestor é **final** →
   estado `aprovado`, e-mail de aprovação e notificação informativa.
4. Notificações de férias carregam `vacation_id` e `action_required`, com
   deep-link `/app/ferias?request=<id>`; o botão de abertura permanece
   disponível após a notificação ser lida.

**Consequências.** Fim das confirmações duplicadas; estado da notificação
coerente com o estado do pedido; o fluxo de confirmação continua íntegro
para férias agendadas pelo gestor.

---

## ADR-024 — Destinatário único para notificações WhatsApp de tickets (2026-07-26)

**Contexto.** A integração de notificações de tickets (ActivePieces/WhatsApp)
precisa de um destinatário determinístico. Enviar para "todos os gestores" ou
"todos os super admins" gera ruído, custo e risco de fuga de contexto entre
empresas.

**Decisão.**
1. **Nunca** notificar um papel inteiro. A resolução devolve no máximo **um**
   utilizador, via `public.resolve_ticket_whatsapp_recipient(_ticket_id)`
   (`SECURITY DEFINER`, `SET search_path = public`).
2. Ordem de resolução:
   - `assigned_user_id` preenchido → esse responsável;
   - vazio e `current_owner_role = 'manager'` →
     `company_hr_settings.default_support_manager_id`;
   - vazio e `current_owner_role = 'super_admin'` →
     `platform_settings.default_support_super_admin_id`.
3. Validação obrigatória do candidato: perfil existente, `is_active = true`,
   papel compatível (gestor da empresa / `super_admin`) e `profiles.whatsapp`
   em E.164 (`^\+[1-9]\d{7,14}$`).
4. Sem destinatário válido → registo em `whatsapp_notifications` com
   `status = 'skipped'` e `last_error` com o motivo específico. Nada é enviado,
   mas o evento fica auditável e reprocessável após configurar o responsável.

**Armazenamento das configurações.**
- Por empresa: `company_hr_settings.default_support_manager_id` — a tabela já
  é o repositório de definições por empresa e de responsáveis (aprovadores).
  Rejeitado `companies.default_support_manager_id` (tabela de faturação/limites,
  gerida por outro perfil).
- Global: nova tabela singleton `public.platform_settings` (`id = 1`), destinada
  a configurações globais de produto em geral. Rejeitado reaproveitar
  `email_send_state`, que é específico do módulo de e-mail.
  Leitura/escrita apenas para Super Admin; `service_role` com acesso total.

**Instrumentação.** O enfileiramento é feito por *outbox transacional*, através
de triggers `AFTER INSERT/UPDATE` em `support_tickets` e `AFTER INSERT` em
`support_ticket_messages` (mensagens internas são ignoradas), chamando
`public.enqueue_ticket_whatsapp`. Isto cobre todas as RPCs de suporte
existentes e futuras sem duplicar lógica em cada função. Eventos:
`ticket_created`, `ticket_escalated`, `ticket_returned_to_manager`,
`ticket_assigned`, `ticket_status_changed`, `ticket_message`.

**Consequências.** Notificações previsíveis e auditáveis; nenhum broadcast por
papel; o disparo HTTP para o ActivePieces fica desacoplado (worker lê apenas
linhas `pending`).

---

## ADR-025 — Idempotência e máquina de estados do outbox WhatsApp (2026-07-26)

**Estado.** Aceite.

**Contexto.** A ADR-024 definiu o outbox e o destinatário único, mas sem
garantias contra duplicados e sem processo de envio. Retry de RPC, dupla
execução ou dois UPDATEs concorrentes produziam linhas repetidas, e não
existia transição `pending → sending → sent | failed`.

**Decisão.**
1. **Idempotência por `dedupe_key`** = `ticket_id : evento : md5(payload)`,
   com índice único parcial limitado a `pending | sending | sent`. Registos
   `skipped` e `failed` não bloqueiam um reenvio legítimo posterior.
   `enqueue_ticket_whatsapp` usa `ON CONFLICT DO NOTHING`.
2. **Eventos independentes** no trigger de `support_tickets` (sem `ELSIF`):
   escalonamento, devolução, atribuição, prioridade e estado são avaliados
   separadamente, para que uma transação que muda vários campos gere todos os
   avisos. Transições de/para estados terminais produzem `ticket_resolved` e
   `ticket_reopened`.
3. **Máquina de estados** `pending → sending → sent | pending (retry) | failed`,
   com reserva de lote via `FOR UPDATE SKIP LOCKED` (seguro sob concorrência) e
   recuperação de linhas presas em `sending` há mais de 10 minutos.
4. **Backoff exponencial** 30 s × 2^(tentativa−1), teto de 3600 s, até
   `max_attempts` (5). Esgotadas as tentativas, o registo fica `failed` e só
   volta à fila por ação explícita do Super Admin (`whatsapp_requeue`).
5. **Worker HTTP** em `/api/public/whatsapp/dispatch`, autenticado por `apikey`,
   com timeout de 10 s. A URL do ActivePieces vive no secret de servidor
   `ACTIVEPIECES_WEBHOOK_URL` e nunca é exposta ao browser. Agendado por
   `pg_cron` a cada minuto.

**Alternativas rejeitadas.** Disparo HTTP dentro da RPC do ticket (tornaria a
ação do utilizador dependente de um serviço externo) e `pg_net` a chamar
diretamente o ActivePieces (sem controlo de tentativas nem auditoria do corpo
da resposta).

**Consequências.** As RPCs de ticket continuam não bloqueantes (apenas um
INSERT); o envio é assíncrono e auditável; duplicados deixam de ser possíveis
dentro da janela ativa da fila.

---

## ADR-025 — Clientes com apontamento Manual não geram ausência nem atraso

**Data.** 2026-07-29 · **Estado.** Aceite

**Contexto.** Clientes com `clients.timing_mode = 'manual'` não exigem que o
funcionário registe entrada no horário previsto: o tempo é lançado manualmente
após a execução. Ainda assim, as rotinas automáticas marcavam essas tarefas
como `ausente` e emitiam notificação de atraso, bloqueando a operação.

**Decisão.** O modo de apontamento do cliente passa a ser regra de negócio
central, aplicada no banco (fonte única de verdade):

1. `public.task_timing_is_manual(uuid)` — helper `SECURITY DEFINER` que resolve
   o modo do cliente da tarefa.
2. `tasks_sweep_absent` e `notifications_sweep_late` ignoram tarefas de clientes
   manuais.
3. `task_transition` recusa a ação `marcar_ausente` nessas tarefas, mesmo para
   gestor — a proibição não é apenas de UI.
4. Registos históricos incorretos são revertidos para `pendente`, com nota de
   auditoria na descrição (o histórico não é apagado).
5. `public.tasks_timing_modes(uuid[])` expõe o modo à UI de forma segura, pois
   a RLS de `clients` não permite ao funcionário ler a ficha do cliente.

**Consequências.** No frontend, `isVisuallyLate` e `canBecomeAbsent`
(`src/lib/tasks.ts`) devolvem `false` para tarefas manuais; as listagens de
`/app/tarefas` e `/app/ponto` enriquecem as tarefas via `attachClientTimingModes`.
Iniciar e concluir a tarefa continua livre — nunca bloqueado por horário.

## ADR-026 — Design System único para modais

**Contexto.** Cada ecrã montava o seu próprio modal com helpers de classes
soltos (`modalContentFrame`, `modalSafePadding`, …), o que gerava scrolls
aninhados, cabeçalhos inconsistentes, botões de fechar pequenos e ações
perdidas no meio do conteúdo.

**Decisão.** Introduzir primitivos canónicos em `src/components/ui/dialog.tsx`
(`ModalHeader`, `ModalBody`, `ModalFooter`, `ModalSection`, `ModalTabsBar`) e
obrigar todos os shells (`Dialog`, `Sheet`, `Drawer`, `AlertDialog`) a serem
contentores flex-column sem padding próprio, com **um único** elemento rolável
(`ModalBody`). Larguras por variante no desktop e full-screen no mobile.
Os helpers legados de `src/lib/utils.ts` foram removidos.

**Consequências.** Novos modais devem seguir
`docs/UI_MODAL_GUIDELINES.md`. Em modais com abas, o rodapé é único e submete o
formulário da aba ativa via `form="<id>"` (padrão aplicado no `EmployeeEditor`).
Nenhuma regra de negócio, RBAC ou RLS foi alterada.

## ADR-029 — Reabertura de tickets é atómica e com destino explícito
Reabrir um ticket encerrado passa por uma única RPC `SECURITY DEFINER`
(`reopen_support_ticket_with_message`), que valida permissões e estado, grava a
mensagem, define destino (`employee` | `technical`), atualiza nível/owner,
registra o evento append-only e notifica — sem duplicação no frontend.
O Gestor nunca escolhe status manualmente; escolhe apenas o destino.

## ADR-030 — Navegação tem fonte canónica única e o ramo é aditivo
O menu é resolvido exclusivamente por `resolveAvailableNavigation(context)`
(`src/lib/navigation.ts`), a partir de `effectiveRole`, `currentCompanyId`,
`business_vertical` e `enabled_modules`. Desktop e Drawer Mobile consomem a
mesma lista — é proibido criar listas paralelas.

Regras: (1) o ramo (business vertical) é **aditivo** — acrescenta grupos e
define ordem, nunca remove módulos gerais/core; (2) itens sem `module` são core
e não são filtráveis; (3) contexto em carregamento devolve `ready: false` e o
consumidor mostra skeleton — loading nunca equivale a "sem permissão"; (4)
menu autorizado ⇒ rota autorizada, com o guard de módulo a correr somente após
o contexto estar resolvido. RBAC e RLS permanecem inalterados.

## ADR-031 — Modelo financeiro V2: pagamento do funcionário por Hora / Dia / Mês

**Contexto.** O sistema tinha `pay_model ∈ {hourly, fixed, mixed}`, onde `fixed`
significa **valor por tarefa/empreitada** (`clients.fixed_rate`,
`profiles.manual_fixed_rate`, `company_hr_settings.default_fixed_rate`). Além
disso, `resolve_billing_rule` era *all-or-nothing*: se o funcionário tinha
`pay_rate_source='manual'` usava só o funcionário; senão, se havia cliente,
usava só o cliente; o tipo de pagamento vinha de `clients.billing_mode`.
Os valores padrão da empresa estavam duplicados em `companies.default_*`
(usado pela UI) e `company_hr_settings.default_*` (usado pelo motor).

**Decisão.**
1. **Nada de reaproveitar `fixed` como diário.** Criado conceito explícito
   `daily`: `clients.daily_rate`, `profiles.manual_daily_rate`,
   `company_hr_settings.default_daily_rate`. `fixed` mantém o significado
   histórico (por tarefa) — nenhuma alteração semântica silenciosa.
2. `profiles.pay_model` aceita `hourly | daily | monthly | fixed | mixed`; o
   cadastro do Funcionário oferece apenas **Hora / Dia / Mês**, mostrando só o
   campo de valor relevante (opcional — vazio herda).
3. **Hierarquia campo a campo:** FUNCIONÁRIO > CLIENTE > EMPRESA. O
   **tipo de pagamento** é sempre o do funcionário; o **valor** cai para o
   cliente e depois para a empresa quando vazio. `pay_rate_source` deixa de ser
   porteiro: basta o valor do funcionário existir.
4. **Fonte única dos padrões da empresa:** `company_hr_settings.default_*`.
   Os valores de `companies.default_*` foram migrados para lá e essas colunas
   ficam legadas (não são mais lidas nem escritas pela UI).
5. **Cálculo:** `hourly` = tempo real × valor hora (com regra de extras já
   existente); `daily` = valor do dia **uma única vez por dia trabalhado** por
   funcionário (nunca multiplicado por horas; segunda tarefa no mesmo dia grava
   `amount=0` com `breakdown.day_already_paid=true`); `monthly` = remuneração
   base, `amount=0` por registo de ponto (horas continuam registadas para
   presença/extras/auditoria).
6. **Snapshot histórico preservado:** `time_entry_valuations` ganha
   `daily_applied` e `monthly_applied`; alterar valores hoje não recalcula
   registos já valorizados.
7. **Helper canónico:** `public.resolve_effective_compensation(employee, client,
   company)` (RPC, `authenticated`, valida gestor/próprio/SA) e
   `src/lib/compensation.ts` no frontend. Proibido reimplementar a hierarquia
   em telas.

**Consequências.** RBAC/RLS inalterados. `resolve_billing_rule` passa a devolver
também `*_source` por campo, o que permite exibir a **fonte do valor** na folha
e nas exportações.


## ADR-032 — Multi-responsável por fan-out com `task_group_id`

**Data:** 2026-08-23 · **Estado:** Aceite · **Contexto:** Fase B do Pacote
Operacional V2.

**Decisão.** Atribuir vários responsáveis **não** cria uma tarefa partilhada:
cria uma tarefa por responsável (fan-out), todas com o mesmo `task_group_id`.

1. **Independência total:** estado, ponto, recusa, ausência e conclusão são por
   tarefa. A ação de um responsável nunca altera a de outro.
2. **`task_group_id` é rastreio, não regra de negócio:** serve para dedup de
   notificações, progresso consolidado e auditoria. Nunca é usado para bloquear
   transições de estado.
3. **Notificações:** cada responsável é notificado individualmente; gestores
   recebem **uma** notificação por lote, escolhida de forma determinística
   (menor `id` do grupo) — ver KI-027.
4. **Equipa do cliente é sugestão, não imposição:** `client_default_assignees`
   pré-preenche os responsáveis; se o gestor já editou a seleção, a troca de
   cliente exige confirmação explícita.
5. **Sem alteração de schema em `tasks` além da coluna de grupo:** RBAC e RLS
   mantêm-se inalterados (`assigned_to` continua a ser a chave de visibilidade).

**Consequências.** Relatórios por tarefa continuam válidos sem migração de
dados; tarefas legadas ficam com `task_group_id = NULL` e comportam-se como
individuais.

## ADR-033 — Vertical `building_materials` (Material de Construção) e ModuleGuard canónico

**Data.** 2026-08-23 · **Estado.** Aceite (Fase A)

**Contexto.** Necessidade de um novo ramo técnico (Material de Construção) sem
qualquer regressão nos ramos Limpeza e Restaurante & Delivery. Auditoria da Fase A
revelou que as rotas de Restaurante só usam `RoleGuard` + `ComingSoon`: esconder o
item de menu não impede acesso por URL direta.

**Decisão.**
1. `companies.business_vertical` passa a aceitar `building_materials`, `hospitality`
   e `auto_repair`. A migration é idempotente, valida os valores existentes antes de
   recriar o CHECK e **não executa nenhum UPDATE** de dados.
2. Os 11 módulos `building_materials_*` **nunca** entram em `DEFAULT_ENABLED_MODULES`
   nem são ativados automaticamente ao mudar o ramo (ao contrário de
   `RESTAURANT_ENABLED_MODULES`, mantido por retrocompatibilidade — ADR-027).
   Ativação é sempre manual, módulo a módulo, pelo Super Admin.
3. Novo componente canónico `src/components/ModuleGuard.tsx`: resolve
   `companies.enabled_modules` da empresa ativa e devolve estado 403 quando o módulo
   não está ativo. Contexto em carregamento nunca equivale a "sem permissão" (ADR-030).
4. O `ModuleGuard` é aplicado obrigatoriamente a **todas** as rotas
   `/app/material-construcao/*`.
5. **Rotas de Restaurante ficam intencionalmente fora desta alteração.** Grupo V-clean
   e Dinâmica Solução estão marcadas como `restaurant_delivery` sem qualquer módulo
   `restaurant_*` ativo (anomalia pré-existente); aplicar o guard mudaria o
   comportamento atual (ComingSoon → 403) sem necessidade nesta fase. Gap registado
   em KNOWN_ISSUES para auditoria dedicada.
6. `hospitality` e `auto_repair` ficam apenas como verticais preparados: aparecem no
   seletor de ramo e como abas vazias, sem menus nem rotas operacionais.

**Consequências.** O menu é aditivo (o grupo Material de Construção só aparece com
módulos ativos) e o acesso por URL é bloqueado no componente, não apenas no menu.

---

## ADR-034 — Recuperação de Ponto Aberto (nunca fechar ponto silenciosamente)

**Data.** 2026-08-24 · **Estado.** Aceite

**Contexto.** A constraint `uniq_open_punch_per_user` (um único ponto aberto por
utilizador) é correta, mas deixava o funcionário bloqueado: ao tentar iniciar uma
nova tarefa recebia apenas `ENTRY_ALREADY_OPEN` sem forma de localizar ou encerrar
o registo antigo, e o gestor não tinha ferramenta dedicada para resolver em nome dele.

**Decisão.**
1. A regra de **um único ponto aberto permanece ativa**. Nenhum `time_entries` é
   apagado e nenhum ponto é fechado automaticamente/silenciosamente.
2. Novas RPCs canónicas: `punch_open_entry_self()`,
   `punch_open_entries_list(_company_id)`,
   `punch_recover_open_entry(_time_entry_id, _ended_at, _reason_code, _reason_text, _complete_task)`
   e `punch_open_entry_request_help(_time_entry_id, _attempted_task_id, _correlation_id)`.
3. A regularização exige sempre `reason_code` + `reason_text`, valida que a saída não
   é futura nem se sobrepõe a registos posteriores, grava `origin='manager_correction'`,
   `last_edit_reason` e uma linha em `time_entries_audit` com `source`, `actor_role` e
   `original_started_at`.
4. Fluxo do funcionário (`OpenPunchRecoveryDialog`, aberto pelo bloqueio em
   `/app/ponto`): voltar à tarefa em curso · encerrar o ponto anterior com hora e
   motivo · pedir ajuda ao gestor (notificação `punch_open_help_requested`).
5. Fluxo do gestor (`OpenPunchPanel` em `/app/ponto/gestao`): lista de pontos em
   aberto com severidade (Normal/Aviso/Crítico) e inconsistências (tarefa concluída
   com ponto aberto); resolução direta notifica o funcionário (`punch_regularized`).

**Consequências.** O desbloqueio é sempre auditado e atribuível. Novos eventos em
`notification_event`: `punch_open_help_requested`, `punch_regularized`.

---

## ADR-035 — Recusa de tarefa é transição autorizada, nunca UPDATE livre do funcionário

**Data:** 2026-08-24 · **Estado:** Aceite · **Contexto:** SUP-2026-000077

**Problema.** O funcionário recebia «Sem permissão para alterar estes campos da
tarefa» ao recusar. O trigger `tasks_restrict_employee_update` protege colunas
operacionais e a exceção de auto-recusa era demasiado estreita (dependência de
`cancelled_by`/`refused_by` e sem idempotência).

**Decisão.**
1. A recusa passa **exclusivamente** pela RPC `task_transition(_task_id,'recusar',_reason)`
   (`SECURITY DEFINER`), nunca por UPDATE direto do cliente. O funcionário
   continua **sem** permissão genérica de edição de tarefas.
2. Validação server-side: motivo obrigatório (não vazio), tarefa atribuída ao
   próprio (`assigned_to = auth.uid()`), estado em `pendente`/`autorizado`, e
   bloqueio quando a tarefa já foi iniciada / tem ponto aberto.
3. Histórico permanente em `public.task_refusals` (nunca apagado); a operação é
   **idempotente** — recusar duas vezes não duplica auditoria nem notificação.
4. Notificação `task_rejected` dirigida a gestores/owners da empresa
   (`notifyManagers`), com motivo e deep-link para a tarefa.
5. Reativação apenas pelo gestor via `task_reassign_from_refusal`, que limpa os
   campos de recusa, devolve o estado a `pendente` e preserva o histórico.

**Consequências.** O funcionário nunca fica bloqueado sem saída, o gestor tem
rasto completo (quem, quando, porquê) e a superfície de escrita do funcionário
mantém-se mínima. UI: filtro «Recusadas» em `/app/tarefas` e destaque do motivo
no cartão/lista.


## ADR-036 — Arquivamento é visibilidade, nunca status; cancelamento é auditado

**Contexto.** Tarefas antigas em `ausente` ocupavam indefinidamente a fila
operacional da Folha de Ponto, e não havia forma de o funcionário tratar o caso.

**Decisão.**
1. `status` (operacional) e `archived_at` (visibilidade) são dimensões
   independentes. Arquivar **não** altera o status.
2. Arquivamento é sempre **manual e explícito** — nunca automático, nunca por
   cron, nunca por antiguidade. Ausente permanece visível até ser tratada.
3. Cancelamento passa pela RPC `public.task_cancel` com motivo obrigatório;
   funcionário só cancela a tarefa atribuída a si, gestor cancela na empresa.
   Sem `UPDATE` genérico em `tasks` para funcionários.
4. Ponto aberto bloqueia cancelamento e arquivamento (`TASK_HAS_OPEN_PUNCH`),
   reencaminhando para a Recuperação de Ponto Aberto (ADR-034).
5. Auditoria permanente em `public.task_audit_events`; nada é apagado.
6. Apenas um `time_entry` realmente aberto impede novo início — ausente,
   atrasada, cancelada ou arquivada nunca bloqueiam a tarefa seguinte.

**Consequências.** Fila limpa para o funcionário, histórico íntegro para a
gestão («Ver arquivados» com desarquivamento) e superfície de escrita mínima.

---

## ADR-037 — Recorrência quinzenal ancorada na semana (`interval_weeks`)

**Estado.** Aceite.

**Contexto.** O motor de recorrência suportava apenas `daily`, `weekly`,
`monthly` e `custom`, sempre com intervalo 1. Não havia «Quinzenal». A abordagem
ingénua («data + 14 dias») acumula desvio ao atravessar meses de 31 dias,
mudanças de horário de verão e viragens de ano.

**Decisão.**
1. Modelar o intervalo como `public.task_recurrences.interval_weeks`
   (default `1`), com a semântica do RRULE `FREQ=WEEKLY;INTERVAL=n` + `BYDAY`.
2. `public.recurrence_materialize` calcula o offset em semanas entre
   `date_trunc('week', dia)` e `date_trunc('week', start_date)`; a ocorrência só
   é gerada quando `offset % interval_weeks = 0`. O dia da semana é preservado
   por construção.
3. A UI não expõe `interval_weeks` como número: apresenta a opção
   «Semana sim, semana não», mapeada para `weekly` + `interval_weeks = 2`.
   Ao escolhê-la, o dia da semana é ancorado no da data inicial.

**Consequências.** Quinzenal estável a longo prazo (validado até 2027 com
travessia de mês e ano), séries antigas intactas (`interval_weeks = 1`) e espaço
para intervalos futuros (3, 4 semanas) sem nova migração.


---

## ADR-038 — Fechamento Mensal da Folha de Ponto (snapshots imutáveis)

**Estado.** Aceite.

**Contexto.** O ponto vivia apenas em `time_entries` + `time_entry_valuations`,
sem nenhum documento mensal conferível, assinável ou entregável à contabilidade.
Regularizações posteriores alteravam retroactivamente aquilo que o funcionário
já tinha visto, e não existia papel para o contabilista.

**Decisão.**
1. **Nada de duplicar o ponto.** `time_entries` continua a ser a única fonte de
   verdade operacional. O fechamento cria um **snapshot JSON imutável** em
   `timesheet_period_versions` (append-only por trigger), calculado por
   `timesheet_build_snapshot` a partir do ponto e do motor financeiro existente
   (`resolve_effective_compensation`, `finance_summary`).
2. **Estado no período, história nas versões.** `timesheet_periods` guarda um
   registo por (empresa, funcionário, ano, mês) com `status` e `current_version`;
   cada assinatura incrementa a versão. Assinar é o único evento que cria versão.
3. **Assinatura é do funcionário, fecho é do gestor, leitura é do contabilista.**
   `timesheet_sign` exige conferência prévia; `timesheet_manager_close` e
   `timesheet_send_to_accounting` **não recalculam valores** — consomem a versão
   assinada. O novo papel `accountant` só vê `disponivel_contabilidade`.
4. **PDF é derivado e arquivado.** Gerado no cliente (jsPDF), guardado no bucket
   privado `timesheets` com hash SHA-256 em `timesheet_period_versions`. O lote
   reutiliza os ficheiros arquivados (merge via pdf-lib) e só gera prévia para
   períodos ainda não assinados.
5. **Auditoria de acesso.** Cada visualização/download escreve
   `REPORT_VIEWED`/`REPORT_DOWNLOADED` em `timesheet_audit_events`.

**Consequências.** O documento que o funcionário assinou é reproduzível
byte-a-byte; correcções não reescrevem o passado (geram nova versão); a
contabilidade recebe um pacote estável; e a superfície de escrita fica confinada
a RPCs `security definer` com RLS por `company_id`.

---

## ADR-039 — Tarefa e recorrência exigem responsável no servidor
- Data: 2026-08-26
- Status: Aceite
- Ticket: SUP-2026-000065

**Contexto.** A validação de "tarefa sem responsável" existia apenas no
formulário (`app.tarefas.tsx`). Continuavam a aparecer tarefas sem responsável
porque a origem real era uma **recorrência legada** (`task_recurrences`
`6ce41f4c`, criada em 2026-07-02) gravada com `assigned_to IS NULL`:
`recurrence_materialize` propagava o nulo a cada execução (40 tarefas órfãs,
a última em 2026-08-24).

**Decisão.**
1. Guarda server-side: triggers `tasks_require_assignee` e
   `task_recurrences_require_assignee` (BEFORE INSERT OR UPDATE OF
   `assigned_to`) recusam a gravação com `TASK_REQUIRES_ASSIGNEE` /
   `RECURRENCE_REQUIRES_ASSIGNEE`.
2. A guarda dispara apenas quando a linha **passa** a ficar sem responsável:
   linhas legadas já nulas continuam editáveis, para poderem ser atribuídas.
3. `recurrence_materialize` ignora recorrências sem `assigned_to` — deixa de
   gerar ocorrências órfãs.
4. Dados preservados: a recorrência legada foi apenas **pausada**
   (`status='paused'`); nenhuma tarefa foi apagada.

**Consequências.** A regra deixa de depender do ecrã (desktop, mobile, RPC ou
Data API) e a limpeza de dados históricos é feita por atribuição, não por
eliminação.

---

## ADR-040 — Ticket devolvido ao solicitante tem duas saídas explícitas
- Data: 2026-08-26
- Status: Aceite
- Ticket: SUP-2026-000070

**Contexto.** O fluxo de 2 níveis (ADR-021) devolve o ticket ao solicitante em
estados de espera (`waiting_manager`, `waiting_employee`, `aguardando_cliente`,
`returned_to_manager`, `em_validacao`). Nesses estados o gestor não via o botão
de arquivar (restrito a `ARCHIVABLE_STATUSES`) nem o de reabrir (restrito a
estados encerrados) — o ticket ficava sem saída visível.

**Decisão.** Enquanto o ticket aguarda a validação do solicitante, o detalhe
apresenta exactamente duas acções: **«Confirmar solução e arquivar»** (RPC
`close_support_ticket`, motivo registado na timeline) e **«O problema continua»**
(foca a caixa de resposta; o ticket permanece aberto e o suporte é notificado
pela própria RPC de mensagem). `close_support_ticket` passa a aceitar esses
estados para Super Admin, gestor da empresa ou o próprio solicitante.

**Consequências.** Nenhum estado do fluxo fica sem transição disponível ao
solicitante, e o encerramento continua auditado em `support_ticket_events`.

## ADR-041 — Série de recorrência equivalente é bloqueada na origem
- Data: 2026-08-26
- Status: Aceite
- Prioridade: P0

**Contexto.** O calendário apresentava a mesma ocorrência ×2/×3 (Guido Fruit,
Mme Stefani, Escritório Life Tidy PT). O índice único existente
(`recurrence_id`, `recurrence_date`) só protege *dentro* da mesma série, pelo que
submissões repetidas do formulário criaram séries idênticas, cada uma a
materializar a sua própria cópia.

**Decisão.**
1. Dados: soft-delete (`deleted_at`) apenas de duplicatas comprovadas — status
   `pendente` e zero apontamentos, fotos, documentos, recusas ou folha de ponto.
   Tarefas com histórico ficam em `REVISAO_MANUAL` e nunca são tocadas.
2. Origem: índice único parcial sobre a chave canónica das séries `active`
   (`company_id, title, client_id, assigned_to, scheduled_time, frequency,
   weekdays, interval_weeks, monthly_rule, start_date, end_date`) e trigger que
   levanta `RECURRENCE_DUPLICATE_ACTIVE` com o id da série existente.
3. UI: o duplo clique é descartado por ref síncrona; o erro de duplicado é
   tratado como idempotência ("já existe"), não como falha.

**Consequências.** Recorrências legítimas diferentes (outro horário, outro dia,
outro responsável, semanal vs. semana sim/semana não) continuam permitidas —
validado por teste SQL. Toda a operação é reversível e auditada em
`public.task_dedupe_audit`.

## ADR-042 — Todos os eventos de ponto usam a mesma avaliação de geolocalização

**Contexto.** SUP-2026-000071: gestora reportou "erro de geolocalização" sempre na
1ª picagem e muitas vezes na saída, no mesmo local físico. A auditoria mostrou que
`punch_arrival_v2`, `punch_pause_v2`, `punch_resume_v2` e `punch_departure_v2`
gravavam `geo_status = 'within'` sempre que existia `lat/lng`, sem consultar as
coordenadas do cliente, enquanto `punch_start_v2`/`punch_stop_v2` avaliavam a
política real. Como os 18 clientes da empresa não têm `geo_lat/geo_lng`, o Início e
o Encerramento ficavam corretamente como `CLIENT_WITHOUT_LOCATION` (badge violeta)
e os restantes eventos apareciam como "Dentro do raio" — leitura de erro.

**Decisão.** Um único caminho de avaliação: os quatro eventos passam por
`_punch_resolve_policy` + `_punch_evaluate_geo`, com `policy = alert` e
`required = false` fixos (informativo, nunca bloqueante, sem justificativa),
persistindo `client_lat/lng`, raio, distância e `reason_code` verdadeiros.
`CLIENT_WITHOUT_LOCATION` é um estado de configuração, não erro: a UI passa a
explicá-lo e a indicar onde definir a localização do cliente.

**Consequências.** Histórico coerente por registo; "Dentro do raio" volta a
significar validação real contra o raio; o gestor vê que falta configurar a
localização do cliente em vez de suspeitar do GPS do funcionário. Registos
antigos mantêm-se como foram gravados (imutabilidade da auditoria de ponto).

## ADR-043 — Estados de gestão das notificações

**Contexto.** SUP-2026-000095: a lista de notificações só suportava "abrir" e
"marcar como lida", logo o menu acumulava eventos indefinidamente e não havia
forma de registar que um assunto foi encaminhado (contabilista, colegas) ou que
está em tratamento até ser concluído.

**Decisão.** `public.notifications` ganha `state`
(`nova | em_tratamento | encaminhada | resolvida | arquivada`), `forwarded_to`,
`state_note`, `state_changed_at/by`. A única porta de escrita é a RPC
`public.notification_set_state(_ids, _state, _forwarded_to, _note)`
(`security definer`, restrita a `user_id = auth.uid()`), que exige destinatário
ao encaminhar e marca a notificação como lida em qualquer estado não-`nova`.
O destinatário é texto livre com sugestões rápidas — não fixamos nomes de pessoas
no código, para servir qualquer empresa. A UI expõe pastas (Caixa de entrada,
Em tratamento, Resolvidas, Arquivadas, Todas) e o badge do menu passa a excluir
`resolvida`/`arquivada`.

**Consequências.** A caixa de entrada fica limpa sem apagar histórico; itens
"em tratamento"/"encaminhados" permanecem visíveis até serem resolvidos; o
arquivo é reversível («Restaurar»). Nenhuma alteração nos gatilhos que criam
notificações — o valor por omissão `nova` preserva o comportamento anterior.

## ADR-044 — Registo formal de falta em tarefas

**Contexto.** SUP-2026-000073: uma tarefa aparecia como «Ausente» (varredura
automática) mas o gestor não tinha como registar formalmente a falta do
funcionário — nem motivo, nem classificação, nem autoria. A ação
`marcar_ausente` do `task_transition` exigia o limiar de ausência e só aceitava
tarefas pendentes/autorizadas.

**Decisão.** Criada a RPC `public.task_mark_absent(_task_id, _reason, _justified)`
(`security definer`, apenas gestor/proprietário da empresa da tarefa) como porta
única do registo de falta. Aceita `pendente`, `autorizado`, `em_andamento` e
`ausente` (completar registo), exige motivo, grava
`marked_absent_by/absence_reason/absence_justified/absence_source='manual'` e
audita em `task_audit_events` (`event = 'absence'`). Ponto aberto na tarefa
devolve `TASK_HAS_OPEN_PUNCH`, reutilizando o fluxo de Recuperação de Ponto
Aberto. Clientes em apontamento manual continuam sem ausência automática
(ADR-025), mas o gestor pode registar a falta manualmente.

**Consequências.** A UI de tarefas passa a abrir o `MarkAbsentDialog` em vez de
transitar diretamente, o botão deixa de depender do limiar temporal, e a lista
mostra origem, motivo e classificação da falta. `task_transition` mantém-se
inalterado para compatibilidade (ecrã de ponto).

## ADR-045 — Conclusão de tarefa com ponto esquecido (SUP-2026-000074)

**Contexto.** Quando o funcionário esquecia de bater a saída, o gestor não
conseguia concluir a tarefa: a ação falhava com erro relativo ao ponto aberto ou,
na melhor hipótese, fecharia o registo em `now()` — inflando horas sem qualquer
justificação auditada.

**Decisão.** A conclusão de tarefa com ponto em aberto deixa de ser uma
transição direta. O ecrã de Tarefas consulta os pontos abertos
(`punch_open_entries_list` para gestor, `punch_open_entry_self` para funcionário)
e, quando o ponto pertence a outro utilizador ou começou num dia anterior, abre o
modal canónico `OpenPunchRecoveryDialog` com `completeTask`, delegando o
encerramento a `punch_recover_open_entry(..., _complete_task => true)`: hora real
de saída e motivo obrigatórios, auditoria em `time_entries_audit` e notificação
ao funcionário. Erros de `task_transition` que mencionem ponto aberto também
abrem o mesmo modal.

**Consequências.** Nenhum ponto é fechado silenciosamente e a folha de ponto
reflete a hora real informada. Nenhuma alteração de banco foi necessária — as
RPCs de recuperação (ADR-034) passam a ser o caminho único de conclusão nesses
casos.


## ADR-046 — Cancelamento de férias: ação explícita, auditada e reversível

**Contexto.** Um pedido de férias da funcionária Keila Oliveira (29/09/2026 →
05/10/2026) apareceu como "Cancelado" 16,8 segundos depois de ser criado. A
investigação mostrou que `/app/ferias` expunha botões "Cancelar" de clique único
que disparavam `vacation_decide(action => 'cancelar')` sem confirmação, sem
motivo e sem registo do ator — `vacation_requests` não tinha `cancelled_by`,
pelo que era impossível saber quem cancelou. O botão convivia visualmente com
botões de "Cancelar" que significam "fechar formulário", tornando o clique
acidental provável.

**Decisão.**
1. **Auditoria dedicada.** Nova tabela append-only `public.vacation_audit`
   (`vacation_request_id`, `company_id`, `actor_id`, `action`, `from_status`,
   `to_status`, `reason`, `source`, `metadata`). RLS: Super Admin, gestor/owner
   da empresa e o próprio funcionário leem; ninguém escreve pela Data API.
   `vacation_decide` passa a registar **todas** as transições.
2. **Autoria do cancelamento.** `vacation_requests` ganha `cancelled_by` e
   `cancellation_reason`, preenchidos pela RPC.
3. **Cancelamento é ato privilegiado.** Trigger `vacation_guard_cancel` rejeita
   qualquer transição para `cancelado` que não venha de `vacation_decide`
   (`omnibiz.vacation_cancel_ok`) ou que não tenha ator identificado —
   `UPDATE` livre e efeitos colaterais deixam de conseguir cancelar férias.
4. **UI com dupla confirmação.** `CancelVacationDialog` (ADR-026) substitui o
   clique único: mostra funcionário, período e estado atual, exige motivo
   (mín. 3 caracteres) e um segundo passo de confirmação destrutiva.
5. **Restauração pontual.** Apenas o pedido `754239db-…` voltou a `pendente`,
   com duas linhas em `vacation_audit` (reconstrução histórica do cancelamento
   indevido + restauração administrativa) e nova notificação ao aprovador. Os
   restantes 3 cancelamentos da base — todos com intervalo normal entre criação
   e cancelamento — não foram tocados.

**Consequências.** Nenhum cancelamento de férias volta a ser possível por clique
acidental ou por caminho não auditado; cada cancelamento tem ator, motivo e
timestamp de servidor. O histórico do pedido restaurado permanece visível em vez
de ser apagado.

## ADR-047 — Piso mínimo de módulos essenciais (SUP-2026-000075)

**Contexto.** Um Gestor do "Grupo V-clean" reportou o desaparecimento do menu
"Tarefas". A navegação canónica (ADR-030) filtra itens por
`companies.enabled_modules`; o array da empresa tinha sido gravado sem `tasks`,
`crm` e `fleet`. O resultado é uma falha silenciosa: o item desaparece sem
qualquer explicação e o Super Admin não o consegue restaurar, porque
`toggleModule` ignora módulos com `included: true`.

**Decisão.**
1. Módulos com `included: true` no `MODULE_CATALOG` passam a constituir
   `ESSENTIAL_MODULES` e são sempre adicionados por `normalizeModules` — logo
   nunca faltam à navegação nem ao `ModuleGuard`.
2. O banco garante o mesmo invariante: trigger
   `public.companies_enforce_essential_modules` (BEFORE INSERT/UPDATE OF
   `enabled_modules`) reacrescenta `core`, `tasks`, `time_clock`, `hr` e
   `support`.
3. A UI de administração mostra estes módulos marcados, bloqueados e com selo
   "incluído · sempre ativo", deixando claro que fazem parte do plano.

**Consequências.** Nenhuma empresa pode perder módulos incluídos no plano por
gravação parcial de dados, e nenhuma funcionalidade base desaparece do menu sem
uma decisão explícita. Módulos opcionais e de vertical mantêm-se totalmente
sob controlo do Super Admin.

## ADR-048 · Deteção de tickets duplicados / problemas semelhantes

**Data.** 2026-08-26
**Estado.** Aceite e implementado.

**Contexto.** A Central de Suporte não tinha qualquer mecanismo de deteção de
duplicados: o mesmo problema era aberto várias vezes (pelo mesmo utilizador,
por colegas da mesma empresa e por empresas diferentes), fragmentando o
histórico e obrigando à resolução repetida do mesmo tema. Não existia
qualquer relação entre tickets, nem forma de registar "também tenho este
problema".

**Decisão.** Deteção em dois níveis, calculada **inteiramente no servidor**:

1. **Nível 1 — semelhança textual.** `pg_trgm` + `unaccent`. Cada ticket guarda
   `norm_title` e `search_norm` (texto normalizado sem acentos nem pontuação),
   com índices GIN trigram.
2. **Nível 2 — assinatura semântica.** Léxico determinístico em
   `support_detect_action` (recusar, aprovar, concluir, iniciar, picagem,
   atribuir, apagar, criar, editar, enviar, anexar, guardar, acesso, visualizar)
   e `support_detect_entity` (férias, folha de ponto, despesas, recibos, frota,
   geolocalização, tarefas, suporte, notificações, navegação, relatórios,
   clientes, funcionários, acessos, empresa). A assinatura é deduzida do
   **título + módulo** (a descrição longa introduzia ruído); as palavras-chave
   (`problem_keywords`, stopwords removidas) usam título + descrição + módulo.
   Trigger `support_tickets_fill_signature` mantém tudo atualizado.

**Pontuação** (`support_find_similar`): `0.40·similaridade_título +
0.15·similaridade_corpo + 0.15·sobreposição_palavras + 0.15·(ação igual) +
0.15·(entidade igual) + 0.05·módulo + 0.05·rota + 0.03·tipo`, com penalização
×0.60 quando as ações detetadas divergem (evita colar "iniciar tarefa" a
"concluir tarefa"). `strong` (provável duplicado) quando a similaridade de
título ≥ 0.72 ou quando ação+entidade coincidem com score ≥ 0.60; `related`
a partir de 0.32. Janela de 365 dias.

**Isolamento multiempresa (não negociável).** A RPC exige pertença à empresa
indicada e devolve:
- `own`: tickets da própria empresa com detalhe (número, título, extrato da
  descrição, status, contagem de afetados);
- `others`: **apenas contagem agregada** de tickets semelhantes noutras contas —
  nunca título, número, descrição, empresa ou autor.
Só o Super Admin vê tickets de várias empresas, e apenas através das suas
próprias vistas (`/app/admin/suporte`, agrupamento por assinatura).

**Fluxo.** O botão "Enviar solicitação" faz primeiro `support_find_similar`.
Havendo resultados, abre-se o modal preventivo com três saídas: abrir o ticket
existente, "tenho o mesmo problema" (`support_report_same_problem`, com nota
opcional) ou "abrir novo ticket mesmo assim". A verificação nunca bloqueia: se
falhar, o ticket é criado normalmente.

**Relações.** `support_ticket_links` (`duplicate` | `related`) +
`support_tickets.primary_ticket_id` para agrupar duplicados sob o ticket
original; `support_ticket_affected` (único por ticket+utilizador) para os
relatos "mesmo problema". Gestores ligam apenas tickets da própria empresa;
o Super Admin liga entre empresas. Todas as operações registam evento em
`support_ticket_events` (`same_problem_reported`, `ticket_linked`,
`ticket_unlinked`, `affected_notified`).

**Consequências.** Menos duplicados abertos, um único ticket como fonte de
verdade por tema, visibilidade do impacto real (quantas pessoas e empresas),
e notificação em massa dos afetados quando o tema é resolvido — sem nunca
expor dados entre empresas.

---

## ADR-049 — Destino obrigatório do ticket (filas de atendimento)

**Contexto.** Todos os tickets caíam implicitamente na fila técnica. Na prática,
uma parte significativa é contabilística ("recibo", "IBAN", "IRS") ou
administrativa ("declaração", "documento", "agendamento") e não deve consumir
tempo do Desenvolvimento nem viajar para fora da empresa.

**Decisão.** Introduzir o conceito de **destino (fila)**, distinto do
**responsável (pessoa)**:

- Catálogo em `public.support_destinations` (`code`, `label`, `description`,
  `icon`, `target_role`, `is_technical`, `sort_order`, `is_active`). Acrescentar
  RH, Financeiro ou Jurídico é inserir uma linha — o módulo não muda.
- `support_tickets.destination_code` é obrigatório na criação
  (`create_support_ticket`) e foi backfillado a partir do tipo do ticket.
- `support_set_ticket_destination` reencaminha entre filas (Gestor e Super
  Admin), sempre com evento `destination_changed` em `support_ticket_events`.
- `support_has_destination_access` alimenta as políticas de RLS: membros de uma
  fila (ex.: `accountant`, `secretary`) veem e respondem apenas os tickets
  destinados à sua fila, dentro da própria empresa. O isolamento por
  `company_id` permanece intacto.
- Novo papel `secretary` no enum `app_role`.
- `support_find_similar` usa o destino como reforço de pontuação, nunca como
  filtro: um ticket pode ter sido encaminhado para a fila errada.

**Alternativas rejeitadas.** (1) Derivar o destino do `type` — ambíguo e sem
possibilidade de correção pelo utilizador. (2) Reutilizar `assigned_user_id`
como destino — confunde fila com pessoa e quebra a atribuição individual.

**Consequências.** Encaminhamento correto desde a abertura, tickets internos
resolvidos sem sair da empresa, filas extensíveis por dados e histórico
completo de cada reencaminhamento.


---

## ADR-050 — Motor de recorrência v2: intervalo semanal correto e posição no mês

**Contexto.** «Semana sim, semana não» gerava poucas ocorrências. Duas causas:
(1) a âncora de semana usava `date_trunc('week')` (segunda-feira), enquanto os
dias da semana da série são contados a partir de domingo (`EXTRACT(DOW)`), o que
podia deslocar a paridade das semanas; (2) a materialização só olhava 14 dias à
frente e não havia job periódico — uma série de 3 meses aparecia com 1-2 datas.
Faltava também recorrência por posição no mês (ex.: última sexta-feira).

**Decisão.**
- `recurrence_materialize` calcula o offset semanal a partir do domingo da
  semana de `start_date`: `((dia - dow(dia)) - âncora) / 7 % interval_weeks = 0`.
- Regra mensal por posição no mesmo campo `monthly_rule`: `{ position, weekday }`
  com `position` 1..4 ou `-1` («última»), equivalente a
  `FREQ=MONTHLY;BYDAY=<dow>;BYSETPOS=<pos>`. `{ day_of_month }` continua válido
  e é o fallback quando `position` está ausente.
- Horizonte padrão da RPC passa a 60 dias; a criação de série materializa até a
  data final (cap 400 dias) e o job `tasks-recurrence-materialize-daily`
  (05:10 UTC) gera 60 dias para todas as empresas.
- `previewRecurrenceDates`/`describeRecurrence` em `src/lib/tasks.ts` espelham a
  lógica do banco para o exemplo dinâmico e as «Próximas ocorrências» na UI.

**Alternativas rejeitadas.** (1) Nova coluna `by_set_pos`/`by_day` — `monthly_rule`
já é JSONB e absorve a regra sem migração de dados. (2) Materializar toda a
série de uma vez — cria milhares de tarefas para séries sem data final.

**Consequências.** Séries quinzenais completas até a data final, regras do tipo
«última sexta-feira do mês» disponíveis, previsibilidade na UI e nenhuma
alteração em séries ou tarefas já existentes.
