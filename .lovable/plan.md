# Motor Operacional: Recorrência + Documentos + Modos de Ponto

Escopo grande e estrutural. Implementação incremental, sem refatorar fora da área Tarefas/Ponto.

## 1. Modos de Folha de Ponto

Hoje: ao `task_transition('iniciar')` o sistema abre `time_entry` automaticamente. Não há modo manual.

**Mudanças:**
- Novo enum `punch_mode`: `automatico | manual | ambos` (padrão: `automatico`).
- Coluna `companies.default_punch_mode` (config global da empresa, em `company_hr_settings` para ficar junto das prefs de RH).
- Coluna opcional `tasks.punch_mode_override` (gestor pode forçar modo em uma tarefa específica).
- **Importante:** modo MANUAL **não** desvincula da tarefa — apenas troca quem dispara o `time_entry`.
- Novas RPCs:
  - `punch_manual_start(_task_id)` — abre `time_entry` sem mudar status da tarefa (ou move pra `em_andamento`).
  - `punch_manual_end(_task_id)` — fecha `time_entry`.
- `task_transition('iniciar')`:
  - se modo `automatico` → comportamento atual (abre ponto).
  - se modo `manual` → move tarefa pra `em_andamento` sem abrir `time_entry`; UI mostra botão "Bater ponto".
  - se modo `ambos` → UI no check-in pergunta ao funcionário; ambas as RPCs disponíveis.
- UI em `/app/ponto` e `/app/tarefas`: badge do modo + botões condicionais.

## 2. Documentação Operacional

**Banco:**
- Nova tabela `task_documents`:
  - `id, task_id, company_id, uploaded_by, kind (pdf|image|checklist|video), title, storage_path, mime_type, size_bytes, created_at`.
  - `kind` como enum preparado pra futuro (`checklist`, `video` aceitos no schema mas UI só implementa `pdf|image` agora).
- RLS: gestores da empresa CRUD; funcionário assignee só SELECT.
- Bucket `task-docs` (privado), policies por `company_id/task_id/` no path.

**UI:**
- Aba "Documentos" no detalhe da tarefa: upload (PDF/JPG/PNG até ~10MB), lista, preview inline (img) ou link assinado (PDF), delete (gestor).
- Funcionário vê os docs na sua tela de tarefa/ponto.

## 3. Tarefas Recorrentes

**Banco:**
- Nova tabela `task_recurrences`:
  - `id, company_id, template_task_id (nullable, vincula à "tarefa-mãe"), title, description, assigned_to, client_id, priority, location, scheduled_time (hora do dia), duration_minutes, absence_grace_minutes`.
  - `frequency` enum: `daily|weekly|monthly|custom`.
  - `weekdays int[]` (0–6) para semanal.
  - `monthly_rule jsonb` (`{day_of_month}` ou `{week_of_month, weekday}`).
  - `custom_cron text` (opcional, futuro).
  - `start_date date NOT NULL, end_date date NULL`.
  - `status enum active|paused|ended`, `ended_reason text, ended_at`.
- Cada `tasks` materializada ganha `recurrence_id uuid NULL` e `recurrence_date date NULL` (data da ocorrência).
- RPCs:
  - `recurrence_create(...)`, `recurrence_update(...)`, `recurrence_end(_id, _reason)`.
  - `recurrence_materialize(_company_id, _days_ahead int default 14)` — gera próximas N ocorrências em `tasks` sem duplicar (unique `recurrence_id, recurrence_date`).
- pg_cron diário às 03:00 chamando `recurrence_materialize` em todas empresas.
- Eventos de encerramento automático (triggers):
  - `user_roles` DELETE → recorrências do funcionário viram `ended` (motivo: `employee_offboarded`).
  - `commercial_clients`/`clients` status `inativo` → ended (`client_closed`).
  - `services` change → manual por enquanto.

**UI:**
- Em "Nova tarefa", novo bloco "Recorrência" com seletor das frequências.
- Nova rota `/app/tarefas/recorrentes`: listar, pausar, encerrar.
- Calendário em `/app/tarefas` mostra ocorrências geradas.

## 4. Reatribuição com Escopo

Ao trocar `assigned_to` numa tarefa que tem `recurrence_id`, dialog pergunta:
- Somente esta ocorrência
- A partir desta (atualiza recurrence + futuras)
- Recorrência completa (todas, inclusive passadas pendentes)

RPC `recurrence_reassign(_task_id, _new_user, _scope)`.

## Arquivos

**Migração SQL:**
- `task_documents` + storage bucket `task-docs` + policies.
- `task_recurrences` + colunas em `tasks` + RPCs + triggers de encerramento.
- `punch_mode` enum + colunas + RPCs `punch_manual_*`.
- pg_cron job de materialização.

**Frontend:**
- `src/components/tasks/TaskDocuments.tsx` (upload/lista/preview).
- `src/components/tasks/RecurrenceForm.tsx` (configurador).
- `src/components/tasks/ReassignDialog.tsx` (escopo).
- `src/components/tasks/PunchModeBadge.tsx`.
- Editar `src/routes/app.tarefas.tsx`, `app.ponto.tsx`, criar `app.tarefas.recorrentes.tsx`.
- Editar `src/lib/tasks.ts` para tipos + helpers de modo/recorrência.

## Garantias

- Nenhuma tabela existente é dropada; só ALTERs aditivos com defaults.
- `task_transition` mantém retrocompat: empresas sem config = `automatico` (igual a hoje).
- `time_entries` continua sendo fonte única do tempo trabalhado.
- Tudo escopado a `company_id` e RLS preservada.

## Implementação em ordem

1. Migração SQL completa (uma só).
2. Tipos regenerados → helpers em `src/lib/tasks.ts`.
3. UI de Documentos (independente).
4. UI de Modos de Ponto.
5. UI de Recorrência + página dedicada.
6. Dialog de reatribuição.
