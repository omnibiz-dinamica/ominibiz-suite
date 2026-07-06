# OmniBiz — Princípios Arquiteturais Oficiais

> **Status:** Oficial · **Versão:** 1.0 · **Data:** 2026-07-06
> **Escopo:** Diretrizes obrigatórias para todo módulo novo ou refatoração significativa do OmniBiz.
> **Governança:** Nenhuma PR de novo módulo entra em produção sem validação contra este documento.

---

## 1. Auditoria Completa (obrigatória)

Todo módulo novo deve registrar, para cada operação de escrita:

| Campo | Origem | Observação |
|---|---|---|
| `user_id` | `auth.uid()` | Nunca nulo em ação de usuário |
| `changed_at` | `NOW()` (servidor) | Nunca timestamp do cliente |
| `company_id` | Contexto RLS | Escopo multiempresa |
| `action` | `create` / `update` / `delete` / `custom` | Padronizado |
| `entity` | Nome da tabela ou domínio | Ex.: `task`, `vacation`, `expense` |
| `entity_id` | UUID da linha afetada | |
| `before` | JSONB | Estado anterior (`null` em `create`) |
| `after` | JSONB | Estado posterior (`null` em `delete`) |
| `diff` | JSONB | Campos alterados (calculado) |
| `device` | `user_agent` + `platform` | Quando disponível |
| `ip` | `request.headers['x-forwarded-for']` | Quando disponível |
| `reason` | Texto livre | Obrigatório em correções |

**Padrão de tabela:** `<modulo>_audit` (ex.: `time_entries_audit`, `vacation_audit`).
**Alternativa consolidada:** tabela central `audit_log` (JSONB) para módulos de baixo volume.
**RLS:** Super Admin vê tudo; Gestor vê apenas sua empresa; Funcionário vê apenas ações próprias.

---

## 2. Histórico Operacional (Timeline)

Todo módulo deve expor um componente `<XxxTimeline />` que renderiza eventos em ordem cronológica reversa, com:

- Ícone semântico por tipo de evento
- Ator (nome + avatar)
- Timestamp relativo (`há 5 min`) e absoluto (tooltip)
- Metadados relevantes (delta, motivo, dispositivo)

Base de dados: fonte primária = tabela de auditoria (§1) OU tabela dedicada `<modulo>_events` (Domain Events, §5).

**Referência:** `ContractTimeline.tsx`, `PunchAuditDrawer.tsx`.

---

## 3. Preparação para IA (AI-Ready by Design)

Todo módulo nasce com:

- **Dados estruturados** (evitar campos `text` livres onde enum/jsonb resolve).
- **Embeddings prontos**: coluna reservada `embedding vector(1536)` NULL nas tabelas centrais quando texto relevante existe (não obrigatório popular).
- **Descrição semântica** por entidade (`description` ou `summary`) para RAG futuro.
- **Endpoints de leitura padronizados** via `createServerFn` com paginação, filtros e projeção — consumíveis por agentes.
- **Metadata `ai_metadata jsonb`** opcional em tabelas de eventos para anotações do modelo (score, tags, versão do prompt).

**Regra:** nenhum novo módulo introduz débito que exija refatoração estrutural para adicionar IA. Se a feature de IA vier depois, deve caber sem migração destrutiva.

---

## 4. Preparação para Aplicativo Mobile

- **Camada de dados via RPC** (`createServerFn`), nunca acoplada a componentes React específicos do web.
- **DTOs estáveis** e versionados; contratos publicados em `docs/API_CONTRACTS.md` (a criar quando o mobile iniciar).
- **Assets responsivos**: layouts testados em ≤ 375px de largura.
- **Autenticação por bearer token** (já garantido via `requireSupabaseAuth`).
- **Offline-first friendly**: mutations idempotentes; toda RPC de escrita aceita `client_operation_id` para dedupe.
- **Push notifications-ready**: eventos de domínio (§5) publicam para tópico consumível por FCM/APNS.

---

## 5. Domain Events

Sempre que uma ação tenha valor para dashboards, BI, integrações ou automações futuras, publicar evento em `domain_events`:

```
domain_events(
  id uuid pk,
  occurred_at timestamptz default now(),
  company_id uuid,
  actor_id uuid null,
  aggregate_type text,   -- 'task', 'vacation', 'payslip'
  aggregate_id uuid,
  event_type text,       -- 'task.started', 'vacation.approved'
  payload jsonb,
  version int default 1,
  ai_metadata jsonb null
)
```

**Regras:**
- Nomenclatura `<aggregate>.<past_participle>` (`task.completed`, `expense.rejected`).
- Payload autocontido (não depender de joins futuros).
- Append-only; nunca update/delete.
- Realtime habilitado (`ALTER PUBLICATION supabase_realtime ADD TABLE domain_events`).

---

## 6. Dashboards Realtime-Ready

Todo dashboard novo deve:

- Consumir dados via TanStack Query com `queryKey` estável.
- Subscribed a Realtime nas tabelas críticas do módulo (via `supabase.channel`), com teardown no unmount (ver `cloud-realtime`).
- Invalidar queryKeys específicas ao receber evento (`invalidateQueries({ queryKey })`), nunca cache global.
- Preparar `domain_events` (§5) como canal alternativo para dashboards agregados multi-tabela.
- Suportar exportação (CSV/XLSX) desde a v1.

---

## 7. Checklists — Roadmap de Evolução

A arquitetura inicial de checklists (item 04 do sprint) já deve prever:

| Recurso | v1 | v1.1 | v2 |
|---|:-:|:-:|:-:|
| Itens marcáveis | ✅ | | |
| % / progresso | ✅ | | |
| Itens obrigatórios | ✅ | | |
| Import CSV/XLSX | ✅ | | |
| Foto por item | 🔲 (schema pronto) | ✅ | |
| Observação por item | 🔲 (schema pronto) | ✅ | |
| Tempo por item (`started_at`/`done_at`) | 🔲 (schema pronto) | ✅ | |
| Assinatura final | ✅ | | |
| IA de validação (score, anomalias) | 🔲 (`ai_metadata`) | | ✅ |

**Modelo mínimo v1 com hooks para v1.1/v2:**

```
task_checklist_items(
  id, checklist_id, position, label, required,
  done_at, done_by,
  photo_url null, note null, started_at null,   -- v1.1 ready
  ai_metadata jsonb null                         -- v2 ready
)
```

Nenhuma migração destrutiva será necessária para ativar v1.1 ou v2.

---

## 8. Fluxo de Comprovação da Execução (Proof-of-Work)

Arquitetura unificada, preparada por cliente/tipo operacional (ver Item 11 do sprint — `clients.operational_profile`):

```
┌─── Arrival (GPS) ───┐
│                     │
│  Foto Antes         │  ← opcional por perfil
│  Checklist          │  ← §7
│  Execução           │
│  Foto Depois        │  ← opcional por perfil
│  Assinatura         │  ← funcionário e/ou cliente
│  GPS + Horário      │  ← automático
│  QR Code do local   │  ← v1.1 (validação anti-fraude)
│                     │
└── Certificado PDF ──┘  ← gerado sob demanda
```

**Tabelas envolvidas (target):**

- `time_entry_geopoints` — GPS + horário (já existe)
- `time_entry_photos` — fotos before/after/item (schema pronto, ativação v1.1)
- `task_checklists` + `task_checklist_items` — §7
- `task_signatures` — assinaturas (v1.1)
- `task_location_qr` — QR fixado no local (v2)
- `task_execution_certificates` — PDF gerado (v2)

**Regra:** cada peça é opcional e configurável por `operational_profile` do cliente. Nenhum cliente é forçado ao fluxo completo; nenhum cliente fica preso a um fluxo simplificado quando quiser evoluir.

---

## 9. Governança

- Este documento é **pré-requisito de leitura** para qualquer PR de novo módulo.
- Toda migração de novo módulo deve incluir, no MESMO commit:
  1. Tabela principal
  2. Tabela de auditoria OU registro em `audit_log`
  3. Publicação em `domain_events` (quando aplicável)
  4. GRANTs, RLS e políticas
  5. Documento de arquitetura em `docs/ARCHITECTURE_<MODULO>.md`
- Referência cruzada obrigatória em [`ARCHITECTURE_INDEX.md`](./ARCHITECTURE_INDEX.md).

---

**Fim do documento — versão 1.0**