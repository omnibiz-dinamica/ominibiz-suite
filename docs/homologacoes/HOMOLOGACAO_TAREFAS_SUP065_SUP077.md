# Homologação — SUP-2026-000065 e SUP-2026-000077

Data: 2026-08-23 · Empresa: **OMNIBIZ TESTES** · Testes reais de interface
(sessões reais de gestor e funcionário, sem mocks).

## 1. SUP-2026-000065 — Tarefa sem responsável

| # | Cenário | Perfil | Resultado |
|---|---|---|---|
| 1 | Criar tarefa com cliente e datas, **sem** responsável | manager | Toast «Atribua a tarefa a um funcionario antes de salvar.» ✅ |
| 2 | Verificar rede durante o cenário 1 | manager | Nenhum `POST /rest/v1/tasks` ✅ |
| 3 | Modal após erro | manager | Permanece aberto com os dados preenchidos ✅ |
| 4 | Bypass da UI: insert direto sem `assigned_to` com o token do gestor | manager | **HTTP 400** `P0001` «Atribua a tarefa a um funcionário antes de salvar.» ✅ |
| 5 | Regressão: criar tarefa **com** responsável | manager | «Tarefa criada»; contador do funcionário 7 → 8 ✅ |
| 6 | Recorrências e rotinas internas | sistema | Não afetadas (`recurrence_id IS NOT NULL` / `auth.uid() IS NULL`) ✅ |
| 7 | Tarefas legadas sem responsável (29) | — | Preservadas, nenhuma alteração ✅ |

Camadas de defesa:

1. **UI** — `src/routes/app.tarefas.tsx`: bloqueio antes do submit.
2. **Banco** — trigger `trg_tasks_require_assignee`
   (`public.tasks_require_assignee_on_insert`), `SECURITY DEFINER`,
   `search_path = public`, `EXECUTE` revogado de `anon`/`authenticated`.

## 2. SUP-2026-000077 — Erro ao recusar tarefa

| # | Cenário | Perfil | Resultado |
|---|---|---|---|
| 1 | Recusar tarefa pendente com motivo | employee | «Tarefa atualizada»; estado **Cancelado** ✅ |
| 2 | Consola do navegador | employee | Sem erros ✅ |
| 3 | Campos gravados | — | `refusal_reason`, `refused_by`, `cancelled_by` = próprio utilizador ✅ |

Causa raiz: `task_transition` grava `cancelled_by` na recusa e o trigger
`tasks_restrict_employee_update` bloqueava a coluna para o funcionário.
Correção: exceção estrita de **auto-recusa** (`OLD.assigned_to = auth.uid()`,
`OLD.status IN ('pendente','autorizado')`, `NEW.status = 'cancelado'`,
`OLD.cancelled_by IS NULL`, `NEW.refused_by = auth.uid()`, motivo presente).

## 3. RBAC / RLS

Nenhuma política alterada. `public.tasks` mantém:

- `managers manage company tasks` — `is_company_manager(auth.uid(), company_id)`
- `super admin all tasks` — `is_super_admin(auth.uid())`
- `employees view assigned tasks` / `employees update assigned task status` —
  restritas a `assigned_to = auth.uid()`

INSERT continua exclusivo de gestor/owner/super admin. As duas alterações são
**apenas validações adicionais**: nenhuma permissão foi ampliada.

## 4. Conclusão

Ambos os cenários **APROVADOS** em teste real. SUP-000065 protegido em UI e
banco; SUP-000077 corrigido e comprovado ponta a ponta.
