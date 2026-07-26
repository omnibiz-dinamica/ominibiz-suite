# OmniBiz — Arquitetura Oficial do Módulo Central de Suporte

> **Status:** Fase 1 (funcional). Fase 2 (emails/dashboards) e Fase 3 (manuais/homologação) pendentes.
> **Versão:** 1.0
> **Fonte única:** este documento vive junto de `ARCHITECTURE_RBAC.md` e é
> a referência oficial para qualquer alteração no módulo.

---

## 1. Escopo

Módulo de tickets de suporte que permite:

- **Gestor/Owner:** abrir tickets sobre a própria empresa, acompanhar
  histórico, responder, anexar arquivos, reabrir tickets fechados
  dentro de uma janela de 7 dias.
- **Super Admin:** receber, organizar, priorizar, atribuir e responder
  tickets de todas as empresas. Adicionar notas internas invisíveis ao
  Gestor.
- **Funcionário:** sem acesso (arquitetura preparada para habilitar no
  futuro sem migração destrutiva).

Segue os princípios de:
- `docs/ARCHITECTURE_PRINCIPLES.md` — UUID como identidade, isolamento
  por empresa, auditoria completa, RLS obrigatório, nenhum apagamento
  físico.
- `docs/ARCHITECTURE_RBAC.md` — matriz de perfis, notas internas
  restritas a Super Admin, herança Owner ⇐ Gestor.

## 2. Modelo de dados

```
support_tickets
  id uuid PK
  ticket_number text UNIQUE (SUP-YYYY-NNNNNN, gerado pela sequência
                             support_ticket_number_seq)
  company_id uuid FK companies
  requester_user_id uuid FK profiles
  assigned_user_id uuid FK profiles (nullable)
  type support_ticket_type
  priority support_ticket_priority (baixa|normal|alta|urgente)
  status support_ticket_status (aberto|em_analise|aguardando_cliente|
                                em_desenvolvimento|em_validacao|
                                resolvido|rejeitado|fechado)
  title, description, module, route, page_url
  technical_context jsonb (user_agent, viewport, timezone, build, commit)
  first_response_at, resolved_at, closed_at, archived_at
  created_at, updated_at

support_ticket_messages (mensagens da conversa)
  is_internal boolean — visível apenas ao Super Admin (RLS)

support_ticket_attachments (metadados; arquivos no bucket privado)
  storage_path (=<company_id>/<ticket_id>/<uuid>-<nome>)
  mime_type, size_bytes (≤ 20 MB), sha256_hex

support_ticket_events (append-only)
  event_type text (ticket_created, message_added, internal_note_added,
                   status_changed, priority_changed, assignee_changed,
                   attachment_added, ticket_reopened)
  before_data jsonb, after_data jsonb, metadata jsonb
  UPDATE/DELETE bloqueados por trigger
```

### 2.1 RLS

| Tabela | Super Admin | Gestor/Owner | Funcionário |
|---|---|---|---|
| `support_tickets` | ALL | SELECT/INSERT/UPDATE da própria empresa | — |
| `support_ticket_messages` | ALL | SELECT das não-internas da empresa; INSERT não-interna | — |
| `support_ticket_attachments` | ALL | SELECT + INSERT na empresa | — |
| `support_ticket_events` | ALL | SELECT da empresa (append via RPC) | — |
| `storage.objects` (bucket `support-ticket-attachments`) | ALL | SELECT/INSERT quando `foldername[0] = company_id` gerenciado | — |

> **Correção 2026-07-16 (P0 · KI-028):** as policies `INSERT` de
> `support_ticket_attachments` e `support_ticket_messages` tinham
> `t.company_id = t.company_id` (autorreferencial, sempre `TRUE`).
> Corrigido para `t.company_id = <tabela>.company_id`, garantindo que
> anexos/mensagens só possam ser inseridos quando o ticket
> referenciado pertence à mesma empresa informada no payload. Todos
> os demais predicados foram preservados.

## 3. RPCs (SECURITY DEFINER, `search_path = public`)

Todas as operações de escrita passam por RPCs para centralizar regras,
auditoria e notificações:

| RPC | Autorizado | Efeito |
|---|---|---|
| `create_support_ticket` | Super Admin ou Gestor da empresa | Insere ticket, gera número, cria evento `ticket_created`, notifica todos os super admins. Rate limit: 20/24h por utilizador. |
| `post_support_ticket_message` | Super Admin (interna ou externa) · Gestor (apenas externa) | Insere mensagem, cria evento, atualiza `first_response_at` quando Super Admin responde, notifica a outra parte. |
| `update_support_ticket_status` | Super Admin | Atualiza status, marca `resolved_at`/`closed_at`, notifica solicitante. |
| `update_support_ticket_priority` | Super Admin | Atualiza prioridade + evento. |
| `assign_support_ticket` | Super Admin | Define responsável + evento. |
| `reopen_support_ticket` | Super Admin sempre · Gestor dentro de 7 dias | Volta status para `em_analise`, evento `ticket_reopened`, notifica Super Admins. |
| `register_support_attachment` | Super Admin ou Gestor da empresa | Registra metadados após upload direto ao bucket + evento. |

Helpers auxiliares:
`support_ticket_log_event`, `support_notify_super_admins`,
`support_notify_user`.

## 4. Rotas e UI

| Rota | Perfil | Descrição |
|---|---|---|
| `/app/suporte` | Super Admin · Owner · Gestor | Lista da empresa selecionada + botão "Novo ticket". |
| `/app/suporte/$id` | Super Admin · Owner · Gestor (da empresa) | Detalhe compartilhado: descrição, timeline, conversa, anexos. Lateral com ações do Super Admin. |
| `/app/admin/suporte` | Super Admin | Central Global: todas as empresas, filtros e ordenação por prioridade → mais antigos sem resposta → recentes. KPIs (Total, Abertos, Urgentes, Em desenvolvimento). |

Componente reutilizável `NewTicketDialog` (em `src/components/support/`)
é usado tanto pela página quanto pelo botão global "Reportar problema"
no header do `AppLayout` (visível a todos os perfis exceto Funcionário).

## 5. Notificações

- **Ao criar ticket:** todos os Super Admins recebem notificação in-app
  com prioridade derivada do ticket (`urgente`/`alta`/`media`).
- **Ao responder (Gestor → SA):** super admins.
- **Ao responder (SA → Gestor):** apenas o solicitante.
- **Ao alterar status:** solicitante.
- **Ao reabrir:** super admins.
- **Notas internas:** nunca disparam notificação para Gestor.

Não há duplicação porque a fonte de disparo é a própria RPC.

## 6. Auditoria

- Nenhum registro é apagado fisicamente. Fechamento marca
  `closed_at`; o operador pode arquivar via `archived_at` no futuro.
- Todos os eventos críticos geram uma linha em
  `support_ticket_events`. UPDATE/DELETE nessa tabela abortam com
  `support_ticket_events is append-only`.

## 7. Cache

- Helper único: `src/lib/cache/support.ts` (`invalidateSupportCache`,
  `invalidateSupportTicket`).
- Realtime configurado via `useRealtimeInvalidate` nas 3 tabelas
  principais.

## 8. Pendências (Fase 2 / Fase 3)

## 7.1 Painel operacional do Super Admin (2026-07-16)

O painel do Super Admin foi consolidado como ferramenta de atendimento:

- **Detalhe (`/app/suporte/$id`)** — blocos *Dados gerais* (empresa,
  solicitante, email, datas), *Local do erro* (módulo/rota/URL) e
  *Informações técnicas* (build, commit, ambiente, navegador,
  plataforma, idioma, resolução, viewport, timezone), grid de anexos
  com miniaturas + download individual (Signed URLs 900s), timeline
  unificada (eventos + mensagens) cronológica com rótulos humanos,
  respostas rápidas (7 templates), botões *copiar* para
  número/título+descrição/URL/JSON técnico.
- **Central Global (`/app/admin/suporte`)** — filtros por status,
  prioridade, tipo, empresa e intervalo de datas; pesquisa por
  número/título/descrição/empresa; ordenação operacional
  (prioridade → em aberto → mais antigos primeiro); 6 KPI-cards
  clicáveis + 4 painéis (1ª resposta média, resolução média, top 3
  empresas, top 3 módulos).

### RPC auxiliar

`get_support_ticket_requester_info(_ticket_id)` — `SECURITY DEFINER`,
`search_path = public`, retorna `(requester_user_id, requester_full_name,
requester_email, company_id, company_name)`. Aplica o mesmo predicado
de acesso da RLS de `support_tickets` (Super Admin sempre;
Gestor/Owner apenas da própria empresa via
`profiles.current_company_id`/`company_id_primary`). Único ponto onde
`auth.users.email` é lido — nunca por join no cliente.

### Cores de prioridade

Urgente = vermelho, Alta = laranja, Normal = azul, Baixa = cinza
(`TICKET_PRIORITY_TONE` em `src/lib/support/constants.ts`).

- Emails transacionais (`ticket_created`, `ticket_updated`,
  `ticket_waiting_customer`, `ticket_resolved`, `ticket_closed`).
- KPIs de tempo médio de 1ª resposta e resolução no Dashboard Super
  Admin.
- Widget de suporte no Dashboard do Gestor.
- Manuais e release notes em PDF.
- Bateria de homologação E2E (16 testes).
## Atualização 2026-07-23 — Suporte em 2 Níveis

O módulo passou de fila única (SA-only) para **triagem em 2 níveis**:

```
Funcionário/Gestor → cria ticket
  └─ support_level='company', current_owner_role='manager'
       ├─ manager_request_information → waiting_employee
       ├─ resolve_support_ticket_by_manager → resolved_by_manager
       └─ escalate_support_ticket
             └─ support_level='technical', current_owner_role='super_admin', status='under_technical_review'
                  ├─ SA responde / desenvolve / resolve (fluxo prévio)
                  └─ return_support_ticket_to_manager → current_owner_role='manager', status='returned_to_manager'

Super Admin → cria ticket técnico direto
  └─ support_level='technical', current_owner_role='super_admin', created_by_role='super_admin'
```

### Colunas de controle (support_tickets)

| Coluna | Tipo | Uso |
|---|---|---|
| `support_level` | `'company' \| 'technical'` | Nível corrente |
| `current_owner_role` | `'manager' \| 'super_admin'` | Quem responde agora |
| `created_by_role` | `'employee' \| 'manager' \| 'super_admin'` | Origem |
| `escalated_to_super_admin` | `bool` | Já foi escalado |
| `escalated_at`, `escalation_reason`, `escalation_technical_summary` | — | Escalonamento |
| `manager_resolved_at`, `manager_resolution_summary` | — | Resolução N1 |
| `returned_to_manager_at`, `return_reason` | — | Devolução N2→N1 |

### RPCs (SECURITY DEFINER)

- `create_support_ticket` — v2 autodetecta papel; SA cria técnico direto.
- `escalate_support_ticket(_ticket_id, _reason, _technical_summary)`.
- `resolve_support_ticket_by_manager(_ticket_id, _resolution_summary)`.
- `manager_request_information(_ticket_id, _message)`.
- `return_support_ticket_to_manager(_ticket_id, _reason)`.

### RLS

- `employee`: SELECT/INSERT/UPDATE apenas nos próprios tickets/mensagens/anexos.
- Trigger `prevent_forbidden_updates` bloqueia alteração de `status`,
  `priority`, `support_level` pelo funcionário.
- Notas internas (`is_internal=true`) permanecem ocultas para não-admins.
- Central Global (SA) filtra por `support_level='technical' OR created_by_role='super_admin'`.

## Atualização 2026-07-26 — Notificações WhatsApp (outbox + worker)

Ver ADR-024 (destinatário único) e ADR-025 (idempotência e worker).

```
RPC/UPDATE em support_tickets ─ trigger ─▶ enqueue_ticket_whatsapp
   └─ resolve_ticket_whatsapp_recipient
        assigned_user → default_support_manager_id (empresa)
                      → default_support_super_admin_id (plataforma)
   └─ INSERT whatsapp_notifications (dedupe_key único) | status='skipped'+motivo

pg_cron (1/min) ─▶ POST /api/public/whatsapp/dispatch (apikey)
   └─ whatsapp_claim_batch → POST ActivePieces → mark_sent | mark_failed(backoff)
```

Eventos: `ticket_created`, `ticket_assigned`, `ticket_status_changed`,
`ticket_priority_changed`, `ticket_escalated`, `ticket_returned_to_manager`,
`ticket_resolved`, `ticket_reopened`, `ticket_message`.
Notas internas (`is_internal = true`) nunca notificam.

Homologação executada em 2026-07-26 (dry-run, cenários negativos, duplicidade,
multiempresa, retry/backoff, envio real HTTP 200) — ver
`docs/HOMOLOGACAO_SUPORTE_V1.md`.
