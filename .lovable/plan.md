# Rastreabilidade de criação de tarefas

Contexto: a ocorrência "All nuts · 19/11/2026" foi gerada automaticamente pela série recorrente (criada pela Gestor Sara em 14/09), mas a notificação e a tarefa pareciam criação manual. O usuário aprovou duas melhorias: identificar origem automática e auditoria de criação.

## Etapa 1 — Auditoria de criação (banco)

- Nova migração: trigger `AFTER INSERT` em `tasks` que grava em `task_audit_events` um evento `created` com:
  - `actor_user_id`: autor da criação quando manual; `NULL` (sistema) quando gerada por recorrência;
  - `recurrence_id` e `occurrence_date` já existentes na tabela, preenchidos quando for ocorrência;
  - `reason`: origem da criação — `manual`, `recurrence` (gerada pela rotina/materialização) ou `recurrence_seed` (primeira geração ao salvar a série).
- Não altera `canonical_key`, `uq_tasks_recurrence_date` nem RLS. Nenhum dado existente é modificado (sem backfill).

## Etapa 2 — Origem automática visível (telas)

- **Notificações:** quando a tarefa tiver `recurrence_id`, o texto passa a indicar "Gerada automaticamente pela recorrência" em vez de soar como atribuição manual. Ajuste na trigger `tasks_notify_insert` (apenas texto; mesma regra de destinatários).
- **Lista/detalhe da tarefa:** ocorrências de recorrência exibem selo "Recorrente (automática)"; tarefas manuais não mudam.

## Etapa 3 — Validação

- Testes unitários do texto de notificação e do selo.
- Prova real: criar série de teste na empresa OMNIBIZ TESTES, materializar, confirmar evento `created` com origem `recurrence` e notificação com o novo texto; remover dados de teste.
- Typecheck (`bunx tsgo`), build e suíte de testes.
- Atualizar `docs/CHANGELOG.md`, `docs/DECISIONS.md` (novo ADR), `docs/ARCHITECTURE_INDEX.md` e `roadmap.md`.

## Restrições mantidas

- Sem alteração de `canonical_key`, `uq_tasks_recurrence_date` ou RLS.
- Sem backfill de auditoria para tarefas antigas.
- Nada é publicado sem confirmação de deploy.

## Detalhes técnicos

- `task_audit_events` já possui `recurrence_id`/`occurrence_date`/`actor_role` — reutilizados; o evento novo é `created` com `reason` carregando a origem.
- A trigger deduz a origem por `NEW.recurrence_id IS NULL` (manual) vs. preenchido (recorrência); o ator manual vem de `NEW.created_by`.
