# Central de Suporte — Fluxo em 2 Níveis (Nível 1 Empresa / Nível 2 Técnico)

## Objetivo
Reestruturar o módulo de suporte para operar em dois níveis com triagem obrigatória do Gestor. O Funcionário nunca envia diretamente ao Super Admin. O Super Admin recebe apenas: (a) tickets encaminhados pelo Gestor, (b) tickets técnicos criados por ele próprio. O Gestor continua acompanhando tickets encaminhados. Isolamento por empresa, UUID como identidade, nenhum apagamento físico, auditoria append-only mantida.

---

## 1. Banco de Dados (migração aditiva)

Alterar `public.support_tickets` (sem quebrar dados existentes):

- `support_level text NOT NULL DEFAULT 'company'` CHECK (`'company'|'technical'`)
- `current_owner_role text NOT NULL DEFAULT 'manager'` CHECK (`'manager'|'super_admin'`)
- `escalated_to_super_admin boolean NOT NULL DEFAULT false`
- `escalated_at timestamptz`, `escalated_by uuid`
- `returned_to_manager_at timestamptz`, `returned_to_manager_by uuid`
- `created_by_role text` (backfill a partir dos criadores existentes)
- `technical_summary text`, `escalation_reason text`, `internal_resolution text`

Extensão do enum `support_ticket_status` (aditiva) com:
`under_manager_review`, `waiting_employee`, `resolved_by_manager`, `escalated`, `under_technical_review`, `waiting_manager`, `returned_to_manager`.
(Os valores existentes — `aberto`, `em_analise`, `aguardando_cliente`, `em_desenvolvimento`, `em_validacao`, `resolvido`, `rejeitado`, `fechado` — permanecem e continuam válidos; mapeamento de UI abaixo.)

Backfill: todos os tickets atuais recebem `support_level='technical'`, `current_owner_role='super_admin'`, `escalated_to_super_admin=true`, `created_by_role='manager'|'super_admin'` (derivado do requester atual via `user_roles`) — preserva 100% do histórico e comportamento vigente até que sejam explicitamente triados.

Novos eventos append-only aceitos por `support_ticket_events` (só via RPC — trigger de append-only mantido):
`employee_ticket_created`, `manager_ticket_opened`, `manager_requested_information`, `manager_resolved_ticket`, `manager_escalated_ticket`, `super_admin_opened_ticket`, `super_admin_replied`, `super_admin_returned_ticket`, `super_admin_started_development`, `super_admin_resolved_ticket`, `ticket_closed`, `ticket_reopened`.

---

## 2. RLS (revisão completa)

`support_tickets`:
- **Funcionário** — SELECT apenas onde `requester_user_id = auth.uid()`. INSERT apenas na própria empresa, forçando `requester_user_id=auth.uid()`, `support_level='company'`, `escalated_to_super_admin=false`, `current_owner_role='manager'`, `created_by_role='employee'`. UPDATE bloqueado em campos sensíveis (via trigger BEFORE UPDATE que impede alteração de `company_id`, `support_level`, `escalated_to_super_admin`, `current_owner_role`, `assigned_user_id`, `priority` quando role=employee).
- **Gestor/Owner** — SELECT/INSERT/UPDATE apenas da própria empresa. Trigger bloqueia mudança de `company_id` e escalonamento fora das RPCs.
- **Super Admin** — SELECT global de tickets com `support_level='technical'` OU criados por ele; INSERT irrestrito; UPDATE em técnicos e nos que devolve.

`support_ticket_messages` — Funcionário SELECT/INSERT apenas em tickets próprios e não-internas; demais políticas mantidas.
`support_ticket_attachments` — idem.
`support_ticket_events` — SELECT alinhado (Funcionário vê apenas eventos dos próprios tickets; notas internas continuam invisíveis).

Correção KI-028 (predicado autorreferencial) permanece.

---

## 3. RPCs (SECURITY DEFINER, todas append-only auditadas)

Adicionar:
- `create_support_ticket_v2(...)` — aceita `_created_by_role` (deriva do papel do caller); define `support_level`/`current_owner_role`/`escalated_*` conforme regras acima. Funcionário → notifica **Gestores da empresa** (não notifica SA). Gestor → notifica Gestores da empresa. Super Admin → notifica SA + Gestor da empresa vinculada, se houver. Substitui o disparo atual "notifica todos os super admins".
- `escalate_support_ticket(_ticket_id, _reason, _technical_summary, _impact, _suggested_priority)` — autoriza Gestor/Owner da empresa; muda para `support_level='technical'`, `current_owner_role='super_admin'`, `status='escalated'`, grava `escalated_at/by`, evento `manager_escalated_ticket`, notifica SA.
- `resolve_support_ticket_by_manager(_ticket_id, _resolution)` — Gestor/Owner; `status='resolved_by_manager'`, mantém `support_level='company'`, evento `manager_resolved_ticket`, notifica requester.
- `return_support_ticket_to_manager(_ticket_id, _reason)` — Super Admin; `support_level='company'`, `current_owner_role='manager'`, `status='returned_to_manager'`, evento `super_admin_returned_ticket`, notifica Gestores da empresa.
- `manager_request_information(_ticket_id, _message)` — evento + mensagem pública + `status='waiting_employee'`, notifica requester.

Atualizar `post_support_ticket_message`, `update_support_ticket_status`, `update_support_ticket_priority`, `assign_support_ticket`, `reopen_support_ticket` para respeitar `current_owner_role` (ex.: Gestor só edita quando `current_owner_role='manager'`; SA só quando `='super_admin'` ou seu ticket próprio) e emitir eventos com nomes novos. Notas internas continuam restritas a SA. `create_support_ticket` original mantido como shim que chama a v2 para não quebrar callers antigos.

---

## 4. UI / Rotas

- **Funcionário** — nova rota `/app/meu-suporte` (ou reaproveitar `/app/suporte` com RoleGuard): lista dos próprios tickets + `NewTicketDialog`. Sem opção de escolher destinatário; nunca mostra notas internas ou tickets de terceiros. Adicionar item de menu "Meu Suporte" no `AppLayout` para role `employee`.
- **Gestor/Owner** — `/app/suporte` reformulada com abas: `Novos`, `Em análise`, `Aguardando funcionário`, `Resolvidos internamente`, `Encaminhados`, `Devolvidos`, `Todos`. Detalhe (`/app/suporte/$id`) ganha ações: **Resolver internamente**, **Solicitar mais informações**, **Encaminhar para Desenvolvimento** (modal obrigatório com motivo, resumo técnico, impacto, prioridade sugerida, anexos, confirmação), **Rejeitar**, **Fechar**. Após encaminhar, ticket permanece visível ao Gestor.
- **Super Admin** — `/app/admin/suporte` renomeada "Suporte Técnico" com abas: `Encaminhados`, `Em análise`, `Em desenvolvimento`, `Aguardando Gestor`, `Em validação`, `Resolvidos`, `Criados por mim`, `Todos técnicos`. Botão **Novo ticket técnico** com formulário completo (empresa opcional, utilizador opcional, módulo, ambiente, prioridade, prazo, responsável). Detalhe ganha ação **Devolver ao Gestor** (motivo obrigatório).
- Detalhe compartilhado (`app.suporte.$id.tsx`) mostra: nível atual, responsável atual, histórico de encaminhamentos/devoluções, motivo, timeline completa. Botões condicionais por perfil + `current_owner_role`. Funcionário nunca vê notas internas nem campos técnicos privados.
- Botão global "Reportar problema" no header: mantém-se para Gestor/Owner/SA; para Funcionário passa a criar ticket nível-empresa via mesma RPC.

---

## 5. Notificações

Todas disparadas dentro das RPCs (sem duplicação):
- Funcionário cria → Gestores da empresa.
- Gestor responde/solicita info → Funcionário requester.
- Gestor encaminha → Super Admins.
- Super Admin responde → Gestores da empresa (e requester se `support_level` voltou a `company`).
- Super Admin devolve → Gestores da empresa.
- Gestor resolve → Funcionário requester.
- Super Admin resolve → Gestores + Funcionário requester quando existir.
Realtime já configurado via `useRealtimeInvalidate` — mantém-se; canais reutilizados.

---

## 6. Documentação e Homologação

Atualizar: `ARCHITECTURE_SUPPORT_TICKETS.md` (secção "Fluxo em 2 níveis"), `ARCHITECTURE_RBAC.md` (matriz Funcionário/Gestor/SA no módulo Suporte), `ARCHITECTURE_INDEX.md`, `CHANGELOG.md`, `DECISIONS.md` (nova ADR "Suporte em 2 níveis com triagem do Gestor"), `KNOWN_ISSUES.md`.
Criar `docs/homologacoes/HOMOLOGACAO_SUPORTE_NIVEL_1_NIVEL_2.md` com os 23 casos listados no pedido.
Release notes por perfil (Funcionário, Gestor, Super Admin).

---

## Detalhes técnicos (para revisão)

**Arquivos alterados / criados**

- Migração nova: `alter table support_tickets add columns...`, extensão do enum `support_ticket_status`, backfill, novas RPCs, revisão de RLS, trigger `support_tickets_prevent_forbidden_updates` por role.
- `src/lib/support/constants.ts` — adicionar rótulos/tons para novos status; helpers `canEscalate`, `canReturn`, `canResolveByManager` dado `role` + `current_owner_role`.
- `src/lib/support/tickets.ts` — funções `escalateTicket`, `resolveByManager`, `returnToManager`, `requestInformation`, `createTechnicalTicket`. Adicionar `createdByRole`, `targetCompanyId`, `targetUserId` ao input.
- `src/components/support/NewTicketDialog.tsx` — variantes: `mode: 'employee' | 'manager' | 'super_admin_technical'`.
- Novo `src/components/support/EscalateTicketDialog.tsx` e `ReturnToManagerDialog.tsx`.
- `src/routes/app.suporte.tsx` — abas para Gestor, filtros por `support_level` e `current_owner_role`.
- `src/routes/app.suporte.$id.tsx` — ações condicionais + histórico de encaminhamento.
- `src/routes/app.admin.suporte.tsx` — abas SA, botão "Novo ticket técnico", filtros `support_level='technical' OR created_by_role='super_admin'`.
- `src/components/AppLayout.tsx` — item de menu "Meu Suporte" para Funcionário; renomear item SA para "Suporte Técnico".
- `RoleGuard` em rota do Funcionário liberando role `employee`.
- Cache: `invalidateSupportCache` cobre novas queries; adicionar chave `["support-tickets","technical"]` se necessário.

**Compatibilidade**
- Enum estendido, não substituído.
- RPCs antigas mantidas como shims → não quebra qualquer chamada.
- Backfill mantém tickets legados 100% visíveis ao SA (comportamento igual ao atual).
- Nenhum DELETE, nenhum drop de coluna.

**Riscos**
- Regressão de visibilidade caso a triagem falhe → mitigado por policies explícitas + testes 1–23.
- Timezone/duplicação de notificação → centralização nas RPCs elimina disparo duplo.
