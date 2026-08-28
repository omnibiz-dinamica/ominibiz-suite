# OmniBiz - Mapa de Fluxos Backend

**Data:** 2026-08-28  
**Modo:** somente leitura

## Convenções

Os fluxos abaixo foram reconstruidos dos call-sites em `src/`, das migrations e dos helpers SQL. Quando nao existe Edge Function, queue ou tabela de eventos, isso esta explicitamente indicado.

## Criacao de empresa e convite

```text
Super Admin UI (`src/routes/app.admin.tsx`)
  -> RPC `admin_create_company_with_invite`
  -> `companies` + `invites`
  -> UI chama `sendInviteEmail`
  -> `sendTransactionalEmail` / fila email / `email_send_log`
  -> gestor aceita link em `aceitar-convite.tsx`
  -> RPC `accept_invite`
  -> `user_roles` + `profiles.current_company_id`
```

O fluxo tem auditoria de convite e envio, mas a identidade do convite e validada por email do JWT, enquanto a identidade permanente continua sendo UUID.

## Contexto e troca de empresa

```text
`AuthProvider` (`src/lib/auth.tsx`)
  -> RPC `get_auth_context`
  -> `profiles` + `user_roles` + `companies`
  -> estado `currentCompanyId` / `effectiveRole`

Troca:
`switchCompany()` -> `set_current_company(_company_id)` -> `profiles.current_company_id`
```

Super Admin pode selecionar qualquer empresa por regra de `set_current_company`; outros papeis precisam ser membros.

## Criacao de tarefa

```text
`src/routes/app.tarefas.tsx`
  -> `tasks` insert/update e `task_recurrences` insert
  -> triggers de auditoria/notificacao
  -> `task_audit_events` / `notifications`
  -> recorrencia: RPC `recurrence_materialize`
  -> ocorrencias em `tasks`
```

Para transicoes, `src/lib/tasks.ts` usa `task_transition`, `task_mark_absent`, `task_cancel` e `task_archive`. O banco abre/fecha ponto para o fluxo automatico. Duplicidade de series tem chave canonica e bloqueio de recorrencia ativa.

## Start/stop e geofencing

```text
`src/lib/punch/v2.ts` + `usePunchGeolocation`
  -> RPC `punch_start_v2` / `punch_stop_v2`
  -> `tasks` + `time_entries`
  -> `_punch_evaluate_geo` / `_punch_log_geopoint`
  -> `time_entry_geopoints` append-only
  -> opcional `time_entry_photos` e Storage `punch-photos`
  -> notificacoes/UI realtime
```

O caminho de recuperacao usa `punch_recover_open_entry` e o admin usa `punch_admin_create/update`, com auditoria em `time_entries_audit`.

## Ferias

```text
`src/routes/app.ferias.tsx`
  -> `vacation_requests`
  -> trigger `vacation_fill_context`
  -> `resolve_vacation_approver`
  -> `notifications` + email transacional
  -> RPC `vacation_decide` / `vacation_confirm`
  -> `vacation_audit` + notificacao de decisao
```

## Despesas

```text
`src/routes/app.despesas.tsx`
  -> Storage `employee-expenses` (comprovante)
  -> `employee_expenses`
  -> trigger `expense_notify_insert`
  -> `notifications`
  -> gestor chama RPC `expense_decide`
  -> `expense_notify_decision` -> notificacao ao funcionario
```

O draft de anexo Android e mantido no cliente antes do envio final. A auditoria desta execucao nao reabriu o fluxo mobile.

## Suporte

```text
`src/lib/support/tickets.ts` / rotas de suporte
  -> RPC `create_support_ticket`
  -> `support_tickets`
  -> evento + `support_notify_managers` / `support_notify_super_admins`
  -> `notifications` / email / WhatsApp quando habilitado

Mensagem:
  -> RPC `post_support_ticket_message`
  -> `support_ticket_messages`
  -> `support_ticket_events`

Anexo:
  -> Storage `support-ticket-attachments`
  -> RPC `register_support_attachment`
  -> `support_ticket_attachments` + evento

Duplicado:
  -> `support_find_similar`, `support_link_tickets`, `support_duplicate_clusters`
```

O banco live tinha 117 tickets, 112 mensagens, 93 anexos e 408 eventos no momento da consulta.

## Fechamento mensal

```text
`src/lib/timesheet.ts`
  -> `timesheet_period_ensure`
  -> `timesheet_build_snapshot`
  -> `timesheet_day_confirm`
  -> `timesheet_sign` / PDF / hash
  -> `timesheet_manager_close`
  -> `timesheet_send_to_accounting`
  -> `timesheet_audit_events`
```

## Modulos verticais

```text
Menu/catalogo (`src/lib/locale.ts`, `src/lib/navigation.ts`)
  -> `companies.business_vertical` + `companies.enabled_modules`
  -> rota vertical
  -> ModuleGuard quando implementado
  -> dados de dominio
```

No estado atual, Restaurante e Material nao possuem tabelas nem fluxo backend de dominio. As rotas terminam em `ComingSoon`. Hotelaria e Oficina nao possuem fluxo.

## Integrações e automacoes

- Email: rotas server-side em `src/routes/lovable/email/*`, fila e `email_send_log`.
- WhatsApp: tabelas/funcoes de fila e triggers de suporte; processamento exige `service_role`.
- Maps: geocoding por server function/gateway, chave de browser no cliente somente para SDK permitido.
- Realtime: tasks, time entries, clients, notifications e suporte aparecem nas migrations; `domain_events` nao foi encontrado live.
- Cron/queue externa: nao foi encontrada evidencia de fila de dominio para recorrencias; materializacao e chamada RPC.
- n8n/Make/ActivePieces: nao foram encontrados call-sites no frontend ou migrations nesta copia do repositorio.

## Classificacao

| Fluxo | Status | Motivo |
|---|---|---|
| Empresa + convite | 🟢 PRONTO | RPC, membership e email existem |
| Tarefas + recorrencia | 🟢 PRONTO | RPCs, indices, auditoria e materializacao |
| Start/stop + ponto | 🟢 PRONTO | RPCs v2, unicidade de ponto aberto e geofencing |
| Ferias | 🟢 PRONTO | aprovador, decisao, notificacao e auditoria |
| Despesas | 🟢 PRONTO | Storage, tabela, RLS, decisao e notificacoes |
| Suporte | 🟢 PRONTO | ticket, mensagens, anexos, eventos e duplicados |
| Fechamento mensal | 🟢 PRONTO | RPCs e snapshot/auditoria |
| Restaurante | 🔴 INEXISTENTE | sem dados/fluxo de dominio; telas placeholder |
| Material de Construcao | 🔴 INEXISTENTE | sem dados/fluxo de dominio; telas placeholder |
| Hotelaria/Oficina | 🔴 INEXISTENTE | sem rotas/tabelas/fluxos |

