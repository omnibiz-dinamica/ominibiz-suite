# OmniBiz — Índice Oficial de Arquitetura

> **Status:** Oficial · **Versão:** 1.0 · **Escopo:** Porta de entrada única para toda a documentação arquitetural do projeto.
>
> **Objetivo:** Centralizar as arquiteturas oficiais do OmniBiz, garantir rastreabilidade entre documentos e definir o estado atual de cada uma antes de iniciar novas implementações.
>
> **Última revisão:** 2026-07-16

---

## 1. Arquiteturas oficiais

| Documento | Status | Última revisão | Escopo | Dependências |
|---|---|---|---|---|
| [`ARCHITECTURE_PRINCIPLES.md`](./ARCHITECTURE_PRINCIPLES.md) | **Produção** | 2026-07-06 | Princípios obrigatórios: auditoria, timeline, IA-ready, mobile-ready, Domain Events, dashboards realtime, checklists evolutivos, fluxo de comprovação. | Nenhuma — documento raiz |
| [`ARCHITECTURE_RBAC.md`](./ARCHITECTURE_RBAC.md) | **Produção** | 2026-07-04 | Hierarquia de perfis, matriz de permissões, regras de notificação e email, governação de novas features. | Nenhuma — documento raiz |
| [`DECISIONS.md`](./DECISIONS.md) | **Produção** | 2026-07-06 | Architecture Decision Records (ADRs) — registro imutável de decisões arquiteturais. | Nenhuma |
| [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) | **Produção** | 2026-07-06 | Registro vivo de bugs conhecidos, causa raiz, workaround e plano de correção. | Nenhuma |
| [`ATUALIZACOES_OPERACIONAIS_V1_0.md`](./ATUALIZACOES_OPERACIONAIS_V1_0.md) | **Produção** | 2026-07-16 | Manual das novidades V1.0 Operacional — modo de apontamento, cobrança mensal, valores padrão, overrides, recorrência condicional, dashboard clicável, filtros persistentes, `EmployeePicker` universal, Liberação de Identidade. | `DECISIONS.md` (ADR-016/017/018), `CHANGELOG.md` |
| [`release-notes/RELEASE_NOTES_ADMIN_V1.0.md`](./release-notes/RELEASE_NOTES_ADMIN_V1.0.md) | **Produção** | 2026-07-16 | Release notes por público — Administrador. | `ATUALIZACOES_OPERACIONAIS_V1_0.md` |
| [`release-notes/RELEASE_NOTES_GESTOR_V1.0.md`](./release-notes/RELEASE_NOTES_GESTOR_V1.0.md) | **Produção** | 2026-07-16 | Release notes por público — Gestor. | `ATUALIZACOES_OPERACIONAIS_V1_0.md` |
| [`release-notes/RELEASE_NOTES_FUNCIONARIO_V1.0.md`](./release-notes/RELEASE_NOTES_FUNCIONARIO_V1.0.md) | **Produção** | 2026-07-16 | Release notes por público — Funcionário. | `ATUALIZACOES_OPERACIONAIS_V1_0.md` |
| [`ARCHITECTURE_TASK_PHOTOS.md`](./ARCHITECTURE_TASK_PHOTOS.md) | **Proposta** | 2026-07-06 | Fotos, IA de validação, offline queue, LGPD, certificado de execução (item 12). | `ARCHITECTURE_PRINCIPLES.md`, `ARCHITECTURE_GEOFENCING.md` |
| [`RELATORIO_GEOLOCALIZACAO.md`](./RELATORIO_GEOLOCALIZACAO.md) | **Diagnóstico Fase 1** | 2026-07-06 | Análise do fluxo GPS atual + proposta `watchPosition` progressivo (item 09). | `ARCHITECTURE_GEOFENCING.md` |
| [`RELATORIO_GEOCODING.md`](./RELATORIO_GEOCODING.md) | **Diagnóstico Fase 1** | 2026-07-06 | Causa raiz do `REQUEST_DENIED` + proposta de correção via gateway (item 16). | `ARCHITECTURE_MAP_PROVIDER.md` |
| [`RELATORIO_CACHE_CLIENTES.md`](./RELATORIO_CACHE_CLIENTES.md) | **Diagnóstico Fase 1** | 2026-07-06 | Mapa de 7 queryKeys e helper central de invalidação (item 14). | Nenhuma |
| [`GEOFENCING_UX_EXPLAINED.md`](./GEOFENCING_UX_EXPLAINED.md) | **Produção** | 2026-07-06 | Guia conceitual e UX de geofencing (item 17). | `ARCHITECTURE_GEOFENCING.md` |
| [`ARCHITECTURE_GEOFENCING.md`](./ARCHITECTURE_GEOFENCING.md) | **Aprovado** | 2026-07-04 | Validação de localização no início/término de tarefas na Folha de Ponto, configurações independentes start/stop, classificação de accuracy, histórico de eventos, fotos (v1.1), abstração de mapas. | [`ARCHITECTURE_RBAC.md`](./ARCHITECTURE_RBAC.md) |
| [`ARCHITECTURE_MAP_PROVIDER.md`](./ARCHITECTURE_MAP_PROVIDER.md) | **Aprovado** | 2026-07-04 | Abstração única de provedores de mapas (Google, OSM, Mapbox), componentes reutilizáveis, fallback offline, diagnóstico Super Admin. | [`ARCHITECTURE_GEOFENCING.md`](./ARCHITECTURE_GEOFENCING.md) |
| [`RPC_PUNCH_V2.md`](./RPC_PUNCH_V2.md) | **Passo 2 concluído** | 2026-07-04 | Especificação das RPCs `punch_*_v2` para o Geofencing: máquina de estados, idempotência, códigos de erro, log de rejeições, plano de homologação. | [`ARCHITECTURE_GEOFENCING.md`](./ARCHITECTURE_GEOFENCING.md) |
| [`HOOK_PUNCH_GEOLOCATION.md`](./HOOK_PUNCH_GEOLOCATION.md) | **Passo 4 concluído** | 2026-07-04 | Hook `usePunchGeolocation` + `classifyAccuracy`: única camada de captura GPS no cliente, estados padronizados, códigos de erro, diagnóstico Super Admin. | [`ARCHITECTURE_GEOFENCING.md`](./ARCHITECTURE_GEOFENCING.md) |
| `src/lib/realtime/subscribe.ts` | **Produção** | 2026-07-06 | Infra Realtime unificada (ADR-011): `useRealtimeSubscription`, `useRealtimeInvalidate`. Obrigatória em todo módulo novo. | [`DECISIONS.md`](./DECISIONS.md) |
| `src/lib/cache/*` | **Produção** | 2026-07-06 | Helpers de cache por módulo (ADR-012). Novos módulos não invalidam prefixos avulsos. Ativo: `clients.ts`, `notifications.ts`. | [`DECISIONS.md`](./DECISIONS.md) |
| `src/lib/events/` | **Scaffold** | 2026-07-06 | Reserva estrutural para Domain Events (ADR-007). Sem implementação funcional. | [`ARCHITECTURE_PRINCIPLES.md`](./ARCHITECTURE_PRINCIPLES.md) §5 |
| `src/components/common/EmployeePicker.tsx` | **Produção** | 2026-07-06 | Picker reutilizável de funcionário (ADR-013): debounce, virtualização leve, busca por nome/cargo/equipe/email. | [`DECISIONS.md`](./DECISIONS.md) |

---

## 2. Detalhamento por documento

### 2.1 `ARCHITECTURE_RBAC.md` — Arquitetura Oficial de Perfis (RBAC)

- **Objetivo:** Definir a fonte única de verdade sobre perfis, permissões, notificações e emails no OmniBiz. Todo novo módulo ou refatoração deve ser validado contra este documento antes de entrar em desenvolvimento.
- **Escopo:**
  - Hierarquia: Super Admin → Owner → Gestor → Funcionário.
  - Matriz de permissões por módulo (Dashboard, RH, Equipa, Férias, Folha de Ponto, Despesas, Frota, Comercial, Clientes, Contratos, Empresa, Administração SaaS, Assistente IA).
  - Regras de herança entre perfis.
  - Fluxos de notificações (`notifyManagers`, `notifyOwner`, `notifyEmployees`, `notifyApprovers`).
  - Fluxos de emails transacionais (`sendTransactionalEmail`, templates em `registry.ts`).
  - Checklist obrigatório antes de abrir PR de nova feature.
- **Componentes envolvidos:**
  - `src/lib/auth.tsx` → `effectiveRole`, `currentCompanyId`, `switchCompany`
  - `src/components/RoleGuard.tsx`
  - `src/lib/email/send.ts` → `sendTransactionalEmail`
  - `src/lib/email-templates/registry.ts`
  - `public.user_roles` (tabela)
  - `public.has_role(_user_id, _role)` (função SQL)
- **Dependências:** Nenhuma — este é o documento raiz da governança de arquitetura.
- **Status:** Produção.

---

### 2.2 `ARCHITECTURE_GEOFENCING.md` — Geofencing Inteligente (Folha de Ponto)

- **Objetivo:** Garantir que o colaborador inicia e termina a tarefa no local correto do cliente, registrando localização, accuracy, timestamp e dispositivo para auditoria, sem confiar apenas nos dados enviados pelo cliente.
- **Escopo:**
  - Cadastro de coordenadas e raio por cliente (`clients.geo_lat`, `geo_lng`, `geo_radius_m`).
  - Configurações independentes de início e término em `company_hr_settings` (`geo_required_start`, `geo_required_stop`, `geo_out_of_range_policy_start`, `geo_out_of_range_policy_stop`, `geo_no_location_policy_start`, `geo_no_location_policy_stop`, `geo_default_radius_m`, `geo_photo_start_enabled`, `geo_photo_stop_enabled`).
  - Classificação visual de accuracy (`classifyAccuracy`): Excelente, Boa, Baixa, Muito baixa.
  - Histórico completo de eventos (`arrival`, `start`, `pause`, `resume`, `stop`, `departure`) em `time_entry_geopoints` (append-only).
  - Fotos opcionais: estrutura `time_entry_photos` + bucket `punch-photos` preparada para v1.1.
  - Mapa na gestão de ponto (`PunchTimelineMap`) com timeline geográfica.
  - Abstração de mapas via `MapProvider`.
  - Compatibilidade Android, iOS, Desktop sem alterações RBAC.
- **Componentes envolvidos:**
  - Tabelas: `clients` (colunas geo), `company_hr_settings` (colunas geo), `time_entries` (colunas geo), `time_entry_geopoints`, `time_entry_photos`.
  - Enums: `geo_policy`, `punch_event_kind`, `geo_status`.
  - Função SQL: `public.haversine_m`.
  - Hook: `usePunchGeolocation()`.
  - UI: `<GeoStatusBadge/>`, `<PunchTimelineMap/>`, drawer `PunchEditorDrawer`, `PunchAuditDrawer`.
- **Dependências:** [`ARCHITECTURE_RBAC.md`](./ARCHITECTURE_RBAC.md).
- **Status:** Aprovado — v1.0.

---

### 2.3 `ARCHITECTURE_MAP_PROVIDER.md` — Provider de Mapas

- **Objetivo:** Criar uma única interface de interação com mapas, permitindo trocar entre Google Maps, OpenStreetMap e Mapbox sem alterar regras de negócio ou componentes de feature.
- **Escopo:**
  - Provider único: `MapProvider` com `mount`, `geocode`, `reverseGeocode`.
  - Handle imperativo: `addMarker`, `drawCircle`, `drawPolyline`, `fitBounds`, `setCenter`, `clear`, `destroy`.
  - Implementações: Google (ativo), OSM (stub v1.0), Mapbox (stub v1.0).
  - Componentes reutilizáveis: `GeoMap`, `GeoMarker`, `GeoCircle`, `GeoRoute`, `GeoTimeline`, `GeoOfflineFallback`, `MapDiagnosticsPanel`.
  - Performance: instância do mapa mantida viva; atualizações idempotentes por `id`.
  - Responsividade: Desktop, Tablet, Mobile.
  - Offline: fallback textual com lat/lng/accuracy/distância/endereço.
  - Diagnóstico Super Admin via `MapDiagnosticsPanel`.
  - Preparação para Heat Map, Replay, Cluster e cercas múltiplas.
- **Componentes envolvidos:**
  - `src/lib/maps/types.ts` — contratos `MapProvider`, `MapHandle`, `GeocodeResult`.
  - `src/lib/maps/index.ts` — `getMapProvider()`, `recordMapDiagnostic()`.
  - `src/lib/maps/providers/google.ts`, `osm.ts`, `mapbox.ts`.
  - `src/lib/maps/diagnostics.ts` — ring buffer de eventos.
  - `src/components/maps/GeoMap.tsx`, `GeoMarker.tsx`, `GeoCircle.tsx`, `GeoRoute.tsx`, `GeoTimeline.tsx`, `GeoOfflineFallback.tsx`, `MapDiagnosticsPanel.tsx`.
  - Variável de ambiente: `VITE_MAP_PROVIDER`.
- **Dependências:** [`ARCHITECTURE_GEOFENCING.md`](./ARCHITECTURE_GEOFENCING.md).
- **Status:** Aprovado — v1.0.

---

### 2.4 `RPC_PUNCH_V2.md` — RPCs Punch v2 (Geofencing)

- **Objetivo:** Especificar as regras de negócio das RPCs de ponto v2, incluindo máquina de estados, idempotência, tratamento de erros, log de tentativas rejeitadas e plano de homologação.
- **Escopo:**
  - RPCs: `punch_start_v2`, `punch_stop_v2`, `punch_pause_v2`, `punch_resume_v2`, `punch_arrival_v2`, `punch_departure_v2`.
  - RPCs v1 preservadas para retrocompatibilidade.
  - Máquina de estados: `none → arrival → start ↔ pause → stop → departure`.
  - Idempotência de 20 segundos.
  - Timestamps do servidor (`NOW()`); `captured_at` apenas para auditoria.
  - Log de rejeições em `time_entry_geopoints` via prefixo `__REJECTED__:<CODE>`.
  - Matriz de política: `alert`, `justify`, `block` para fora do raio e sem GPS.
  - Códigos padronizados de sucesso e erro.
  - Homologação funcional, RBAC e performance.
- **Componentes envolvidos:**
  - RPCs no banco: `punch_start_v2`, `punch_stop_v2`, `punch_pause_v2`, `punch_resume_v2`, `punch_arrival_v2`, `punch_departure_v2`.
  - Helpers SQL: `_punch_last_accepted_event`, `_punch_state`, `_punch_resolve_policy`, `_punch_log_geopoint`, `_punch_evaluate_geo`.
  - Tabelas: `time_entries`, `time_entry_geopoints`, `clients`, `company_hr_settings`, `tasks`.
  - Função SQL: `public.haversine_m`.
- **Dependências:** [`ARCHITECTURE_GEOFENCING.md`](./ARCHITECTURE_GEOFENCING.md).
- **Status:** Passo 2 concluído (migração e RPCs implementados); aguardando Passo 3 finalizado e Passo 4 (`usePunchGeolocation`).

---

## 3. Ordem de leitura recomendada

1. [`ARCHITECTURE_RBAC.md`](./ARCHITECTURE_RBAC.md) — entender perfis e permissões.
2. [`ARCHITECTURE_GEOFENCING.md`](./ARCHITECTURE_GEOFENCING.md) — entender o domínio de geolocalização na Folha de Ponto.
3. [`ARCHITECTURE_MAP_PROVIDER.md`](./ARCHITECTURE_MAP_PROVIDER.md) — entender a abstração de mapas.
4. [`RPC_PUNCH_V2.md`](./RPC_PUNCH_V2.md) — entender as regras das RPCs de ponto v2.

---

## 4. Regras de governança

- **Antes de iniciar qualquer nova funcionalidade**, consultar este índice e os documentos dependentes.
- **Nenhum módulo entra em produção sem validação contra `ARCHITECTURE_RBAC.md`** (via `HOMOLOGACAO_RBAC.md`).
- **Alterações em arquitetura aprovada** requerem atualização do respectivo documento e, se necessário, deste índice.
- **Novos documentos arquiteturais** devem ser adicionados a este índice na mesma PR em que forem criados.

---

## 5. Documentos relacionados

- [`HOMOLOGACAO_RBAC.md`](./HOMOLOGACAO_RBAC.md) — Checklist e relatório de auditoria arquitetural para homologação de módulos.
- [`ARCHITECTURE_MODAL_DESIGN_SYSTEM.md`](./ARCHITECTURE_MODAL_DESIGN_SYSTEM.md) — Design System canónico de modais (Dialog/Sheet/Drawer/AlertDialog). Ver ADR-026.
- [`UI_MODAL_GUIDELINES.md`](./UI_MODAL_GUIDELINES.md) — Guia de uso dos primitivos de modal para novos ecrãs.

---

**Fim do documento — versão 1.0**
- `docs/homologacoes/HOMOLOGACAO_REABERTURA_TICKETS.md` — homologação da reabertura/encaminhamento de tickets (ADR-029).
- `docs/homologacoes/HOMOLOGACAO_TAREFAS_SUP065_SUP077.md` — homologação de tarefa sem responsável (SUP-000065) e recusa pelo funcionário (SUP-000077).

## Navegação

- `src/lib/navigation.ts` — fonte canónica da navegação (`resolveAvailableNavigation`), ADR-030. Ramo aditivo, itens core não filtráveis, skeleton enquanto o contexto carrega. Ver `docs/ARCHITECTURE_RBAC.md`.
- `src/components/ModuleGuard.tsx` — guard canónico de módulo por rota (ADR-033). Bloqueia acesso por URL direta com 403 quando o módulo não está em `companies.enabled_modules`. Obrigatório em `/app/material-construcao/*`.

## Verticais (ramos de atividade)

- `companies.business_vertical`: `cleaning_services`, `restaurant_delivery`, `building_materials`, `hospitality`, `auto_repair`, `generic`.
- `src/lib/locale.ts` — catálogo de módulos, `MODULE_TABS` (abas do Super Admin), `BUILDING_MATERIALS_MODULES` e `BUILDING_MATERIALS_ROUTE_MODULES` (ADR-033).
- Material de Construção: 11 rotas `src/routes/app.material-construcao.*.tsx`, todas com `RoleGuard` + `ModuleGuard`; módulos sempre desativados por omissão.
- Hotelaria e Oficina: verticais preparados, sem menus nem rotas operacionais.
- Release notes: `docs/release-notes/RELEASE_NOTES_BUILDING_MATERIALS_FASE_A.md`.
- `src/lib/timesheet.ts` — porta única para as RPCs do Fechamento Mensal (ADR-038): snapshot, assinatura, fecho, liberação, upload/hash de PDF e auditoria de acesso.
- `src/lib/timesheet-pdf.ts` / `src/lib/timesheet-batch.ts` — geração A4 do relatório e pacote mensal (reutiliza PDFs arquivados; só gera prévia para períodos sem versão assinada).
- `src/components/perfil/SignatureVistoCard.tsx` — captura de assinatura e visto no bucket `employee-signatures` (ADR-038).
- Rotas: `/app/ponto/meus-relatorios` (funcionário), `/app/ponto/fechamento` (gestor), `/app/contabilidade/folhas-ponto` (contabilista, papel `accountant`).
