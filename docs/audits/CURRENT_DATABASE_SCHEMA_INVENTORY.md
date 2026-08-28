# OmniBiz - Inventario do Banco Atual

**Data da auditoria:** 2026-08-28  
**Modo:** somente leitura / diagnostico  
**Fonte principal:** migrations versionadas em `supabase/migrations/`  
**Validacao live:** consultas REST somente leitura ao Cloud Database com sessao autenticada do projeto

## Limites da evidencia

O projeto nao disponibiliza uma conexao SQL administrativa nem uma RPC de introspeccao de `pg_catalog`/`information_schema`. Por isso, este arquivo nao tenta inventar um DDL atual. O schema estrutural foi reconstruido das migrations versionadas e confrontado com probes REST live. A existencia de RLS, policies, indices, constraints e triggers deve ser confirmada por uma consulta administrativa ao catalogo antes de qualquer mudanca de seguranca.

O Cloud Database respondeu com `42501` para `company_hr_settings` e com `PGRST205` para `domain_events` e `company_billing_modules`. Esses resultados sao mantidos como evidencia, nao tratados como falha de rede.

## Chave de isolamento encontrada

- Chave de empresa predominante: `company_id`.
- Contexto ativo do utilizador: `profiles.current_company_id`.
- Membership e papel: `user_roles(user_id, company_id, role)`.
- Identidade permanente: `auth.users.id`, espelhada por `profiles.id`.
- Super Admin: role `super_admin` com `company_id = NULL`, com bypass deliberado nas funcoes auxiliares.
- Modulos: array `companies.enabled_modules`; nao existe tabela live `company_billing_modules`.
- Vertical: `companies.business_vertical`.

## Tabelas de negocio relevantes

| Tabela | Objetivo | Empresa | PK/FK principal | RLS/policies na migration | Live |
|---|---|---|---|---|---|
| `companies` | tenants | propria linha | `id`; `created_by` | habilitada; Super Admin, membro, criacao, gestor | 4 linhas |
| `profiles` | identidade/profil | indireta por memberships | `id -> auth.users` | habilitada; proprio, gestor, Super Admin | 23 linhas |
| `user_roles` | memberships e RBAC | `company_id` | `id`; `user_id` | habilitada; proprio, gestor, Super Admin | >=1000 linhas no limite consultado |
| `invites` | convites | `company_id` | `id`; `company_id` | habilitada; convidado, gestor, Super Admin | nao contado nesta auditoria |
| `tasks` | tarefas operacionais | `company_id` | `id`; task/client/user | habilitada; gestor, funcionario atribuido, Super Admin | >=1000 |
| `task_recurrences` | series recorrentes | `company_id` | `id`; client/user | habilitada; gestor, Super Admin | 55 |
| `clients` | clientes operacionais | `company_id` | `id`; sem FK de empresa composto | habilitada; membro, gestor, Super Admin | 25 |
| `client_assignees` | equipas/responsaveis | `company_id` | `id`; `client_id` | habilitada; membro/gestor/Super Admin | nao contado |
| `time_entries` | pontos start/stop | `company_id` | `id`; `task_id` | habilitada; proprio, gestor, Super Admin; escrita por RPC | 168 |
| `time_entry_geopoints` | eventos GPS | `company_id` | `id`; `time_entry_id` | habilitada; proprio, gestor, Super Admin; append-only | 376 |
| `time_entry_photos` | fotos do ponto | `company_id` | `id`; `time_entry_id` | habilitada; proprio, gestor, Super Admin | 0 |
| `time_entries_audit` | historico do ponto | `company_id` | `id`; ponto/ator | habilitada; proprio/gestor | nao contado |
| `vacation_requests` | ferias/ausencias | `company_id` | `id`; funcionario/aprovador | habilitada; proprio, aprovador, gestor, Super Admin | 19 |
| `employee_expenses` | despesas | `company_id` | `id`; funcionario/decisor | habilitada; proprio, gestor, owner, Super Admin | 14 |
| `employee_attachments` | documentos de funcionario | `company_id` | `id`; profile | habilitada; membro/gestor/Super Admin | 1 |
| `vehicles` | veiculos | `company_id` | `id` | habilitada; membro/gestor/Super Admin | 0 |
| `fuel_records` | abastecimentos | `company_id` | `id`; vehicle/user | habilitada | nao contado |
| `support_tickets` | tickets | `company_id` | `id`; requester/assigned | habilitada; requester, gestor, Super Admin | 117 |
| `support_ticket_messages` | mensagens | `company_id` | `id`; ticket/autor | habilitada; ticket/autor/gestor/Super Admin | 112 |
| `support_ticket_attachments` | anexos de tickets | `company_id` | `id`; ticket | habilitada; ticket/autor/gestor/Super Admin | 93 |
| `support_ticket_events` | timeline de suporte | `company_id` | `id`; ticket/ator | habilitada; leitura por escopo | 408 |
| `support_ticket_links` | relacoes/duplicados | `company_id` | `id`; ticket relacionado | habilitada | nao contado |
| `support_ticket_affected` | empresas/afetados | `company_id` | `id`; ticket/user | habilitada | nao contado |
| `notifications` | notificacoes | `company_id` | `id`; user/entity | habilitada; proprio, gestor, Super Admin | >=1000 |
| `commercial_clients` | clientes comerciais SaaS | **nao possui** | `id` | habilitada; policy `super_admin_all` | 0 |
| `contracts` | contratos SaaS | indireta por `client_id` | `id`; commercial client | habilitada; Super Admin | nao contado |
| `contract_services` | servicos do contrato | indireta por contrato | `id`; contract | habilitada; Super Admin | nao contado |
| `contract_workflow` | etapas de implantacao | indireta por contrato | `id`; contract | habilitada; Super Admin | nao contado |
| `invoices` | faturas SaaS | indireta por contrato | `id`; contract | habilitada; Super Admin | 0 |
| `ai_usage` | consumo de creditos | indireta por contrato | `id`; contract | habilitada; Super Admin | nao contado |
| `company_hr_settings` | politicas de RH/geofence | `company_id` PK | `company_id -> companies` | habilitada; membro SELECT, gestor/Super Admin escrita | REST SELECT negado |
| `financial_audit` | auditoria financeira | `company_id` | `id` | habilitada; gestor/Super Admin | nao contado |
| `task_audit_events` | auditoria de tarefas | `company_id` | `id`; task/actor | habilitada; escrita controlada | nao contado |
| `timesheet_periods` | fechamento mensal | `company_id` | `id`; company | habilitada; gestor/contabilista | nao contado |

## Tabelas/estruturas ausentes no banco live

Nao foram encontradas nas migrations nem no REST live tabelas operacionais para `restaurant_*`, produtos, ingredientes, receitas/ficha tecnica, estoque, movimentacao de estoque, pedidos, mesas, cozinha/KDS, delivery, entregadores, fornecedores de material, compras, orcamentos, vendas/PDV, unidades ou conversoes. As rotas desses verticais sao placeholders.

Tambem nao foi encontrada a tabela `domain_events` descrita em `ARCHITECTURE_PRINCIPLES.md`; o proprio REST respondeu `PGRST205`.

## Enums e tipos relevantes

`app_role`, `company_status`, `task_status`, `task_priority`, `invite_status`, `client_status`, `notification_event`, `notification_priority`, `vacation_status`, `vehicle_status`, `fuel_type`, `vehicle_kind`, `fuel_card_status`, `contract_status`, `contract_service`, `workflow_step`, `workflow_step_status`, `invoice_status`, `punch_mode`, `recurrence_frequency`, `recurrence_status`, `geo_policy`, `punch_event_kind`, `geo_status`, `geo_reason_code`, `location_source`, `support_ticket_type`, `support_ticket_priority`, `support_ticket_status`, `timesheet_status` e tipos de aprovador de RH.

## Views

Existe `public.company_hr_punch_settings`, uma view restrita que expone somente o modo de ponto por empresa membro. A migration concede SELECT para `authenticated`; a tabela base continua sem SELECT direto para o papel autenticado, coerente com a protecao pretendida.

## Funcoes/RPCs relevantes

### Identidade e tenancy

`get_auth_context()`, `set_current_company(uuid)`, `has_role(uuid, app_role, uuid)`, `is_super_admin(uuid)`, `is_company_member(uuid, uuid)`, `is_company_manager(uuid, uuid)`, `is_company_owner(uuid, uuid)`.

### Tarefas e recorrencia

`task_transition`, `task_mark_absent`, `task_cancel`, `task_archive`, `task_soft_delete`, `recurrence_materialize`, `task_recurrences_canonical_key`, `task_recurrences_block_duplicate_active`, `task_series_delete`, `client_default_assignees`, `resolve_effective_compensation`.

### Ponto/geofencing

`punch_start_v2`, `punch_stop_v2`, `punch_pause_v2`, `punch_resume_v2`, `punch_arrival_v2`, `punch_departure_v2`, `punch_employee_regularize`, `punch_recover_open_entry`, `punch_open_entry_self`, `punch_open_entries_list`, `punch_admin_create`, `punch_admin_update`, `punch_audit_list`.

### RH/fechamento

`resolve_vacation_approver`, `vacation_decide`, `vacation_confirm`, `timesheet_period_ensure`, `timesheet_build_snapshot`, `timesheet_day_confirm`, `timesheet_manager_close`, `timesheet_send_to_accounting`, `timesheet_sign`, `timesheet_register_pdf`, `timesheet_request_correction`, `timesheet_log_access`.

### Suporte

`create_support_ticket`, `post_support_ticket_message`, `register_support_attachment`, `update_support_ticket_status`, `update_support_ticket_priority`, `assign_support_ticket`, `reopen_support_ticket`, `reopen_support_ticket_with_message`, `resolve_support_ticket_by_manager`, `manager_request_information`, `return_support_ticket_to_manager`, `support_find_similar`, `support_duplicate_clusters`, `support_link_tickets`, `support_related_tickets`.

As RPCs sensiveis encontradas sao `SECURITY DEFINER` com `SET search_path = public` e grants principalmente para `authenticated`; as de fila WhatsApp/email ficam restritas a `service_role`. A validacao de cada corpo deve ser feita em revisao de seguranca dedicada.

## Storage observado nas migrations

Buckets e namespaces encontrados: `payslips`, `employee-docs`, `employee-signatures`, `employee-expenses`, `contracts`, `support-ticket-attachments`, `punch-photos` e arquivos de frota. As policies usam, em geral, o primeiro segmento do path como `company_id` e validam membership/gestor. O inventario live de buckets nao foi possivel via REST autenticado sem endpoint administrativo; por isso o estado live de cada bucket fica pendente de confirmacao administrativa.

