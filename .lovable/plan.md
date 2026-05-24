## Auditoria — Folha de Ponto / RH / Remuneração (estado atual real)

Apenas leitura de código + schema. Sem implementação.

---

### 1) GESTOR — visão completa dos pontos da equipe

**Existe tela dedicada de gestão de folha de ponto da equipe?** **NÃO.**

O que existe parcialmente:

- **Rota:** `/app/ponto` → `src/routes/app.ponto.tsx` (componente `PontoPage`)
- Quando o usuário logado é gestor (`isManager`), a query `["punch-history"]` filtra por `company_id` em vez de `user_id` e retorna **os 15 registros mais recentes encerrados da empresa**, com colunas: tarefa, início, fim, com/sem pausa, duração efetiva.
- Mesma página, query `["punch-upcoming"]`: gestor vê próximas tarefas de toda a empresa (status `pendente|autorizado|ausente|em_andamento`), limite 12.

**Limitações reais (não implementado):**

| Capacidade pedida | Estado |
|---|---|
| Visualizar TODOS os pontos de TODOS os funcionários | NÃO — só os 15 últimos encerrados, sem filtro por funcionário, sem paginação, sem intervalo |
| Editar entrada (`started_at`) | NÃO — nenhum UPDATE de `started_at` no código |
| Editar saída (`ended_at`) | NÃO |
| Editar pausa (`paused_at`/`resumed_at`) | NÃO |
| Corrigir horas (`effective_minutes`) | NÃO |
| Adicionar ponto perdido (INSERT manual de `time_entries` pelo gestor) | NÃO — único INSERT vem de RPC `task_transition`/`punch_manual_start` disparado pelo próprio funcionário |
| Justificar alteração | NÃO — não existe coluna de justificativa nem tabela de auditoria de `time_entries` |
| Histórico de alterações | NÃO — não há tabela `time_entries_audit` nem trigger |

**Permissões/RLS atuais em `time_entries`:**
- `user view own punches` (SELECT por `user_id = auth.uid()`)
- `managers view company punches` (SELECT por `is_company_manager`)
- `super admin all punches` (ALL)
- **Nenhuma policy de UPDATE/INSERT/DELETE para gestor** → mesmo se a UI existisse, RLS bloqueia.

---

### 2) MODOS DE FOLHA DE PONTO

**Estado:** Manual, Automático **e** Ambos — todos implementados.

- **Schema:** enum `public.punch_mode = ('automatico','manual','ambos')` (migration `20260524084053`)
- **Campo default da empresa:** `company_hr_settings.default_punch_mode punch_mode NOT NULL DEFAULT 'automatico'`
- **Override por tarefa/recorrência:** `tasks.punch_mode_override punch_mode NULL` e `task_recurrences.punch_mode_override`
- **Resolução efetiva:** função `public.task_effective_punch_mode(_task_id)` retorna `COALESCE(task.override, company.default, 'automatico')`
- **Configuração na UI:** ❌ não há seletor de `default_punch_mode` na página `/app/empresa` (a tela `HRSettingsCard` só configura aprovadores de férias). O default só é alterável diretamente no banco.
- **Override por tarefa na UI:** ✅ `app.tarefas.tsx` linha 478–480 (select `automatico|manual|ambos` no formulário de tarefa).
- **Comportamento em runtime (`app.ponto.tsx`):**
  - `automatico` → `transitionTask("iniciar")` abre ponto junto com a tarefa
  - `manual` → `punchManualStart/End` (entrada/saída separada do ciclo da tarefa)
  - `ambos` → dialog pergunta ao funcionário qual usar

---

### 3) CLIENTE → MODELO DE PAGAMENTO (hourly / fixed / mixed)

**Existe?** **NÃO.**

Tabela `public.clients` tem apenas: `id, company_id, name, phone, email, address, notes, status, created_by, created_at, updated_at`. Nenhuma coluna de modelo de pagamento, valor/hora, valor fixo, moeda ou faturação. Nenhuma referência a `hourly/fixed/mixed` no código.

> Obs.: existe `commercial_clients` (pipeline comercial da OmniBiz) e `contracts` com `monthly_fee` — mas isso é **contrato SaaS da OmniBiz com tenants**, não modelo de pagamento do tenant para os clientes dele.

---

### 4) CONFIGURAÇÃO EMPRESA → valores default (valor hora / valor fixo)

**Existe?** **NÃO.**

Tabelas inspecionadas:
- `companies` → `name, slug, country, timezone, currency, language, status` — sem campos financeiros operacionais
- `company_hr_settings` → apenas `default_punch_mode` + aprovadores de férias (`employee_approver_kind/_user_id`, `manager_approver_kind/_user_id`)

Não há `default_hourly_rate`, `default_fixed_rate`, nem tabela equivalente.

---

### 5) CHECKIN / FUNCIONÁRIO — valor informativo na tela

**Existe?** **NÃO.**

Em `app.ponto.tsx` o card ativo (`ActiveTaskCard`) e `UpcomingTasks` mostram: título, cliente, status, horário agendado, modo de ponto, cronômetro, duração efetiva. Nenhum valor/hora ou valor/fixo é exibido (e não há de onde ler — vide §3 e §4).

---

### 6) VISTO / ASSINATURA

| Item | Estado |
|---|---|
| Assinatura digital com `signature_pad` | ✅ existe, mas **apenas para contratos comerciais OmniBiz** — `src/routes/sign.$token.tsx` linhas 4, 22, 54; persiste em `contracts.signature_hash/signed_at/signed_ip/signed_user_agent` via RPC `contract_sign_submit` |
| Visto do funcionário por linha de ponto | ❌ não existe coluna `acknowledged_at`/`employee_ack` em `time_entries` |
| Visto do gestor por linha de ponto | ❌ idem |
| Geração de folha mensal (PDF) com linhas + vistos | ❌ não existe rota, componente, função, nem helper. `src/lib/contract-pdf.ts` é exclusivo de contrato comercial |
| Assinatura final do documento de folha | ❌ |
| Tabela `payroll`, `payroll_periods`, `timesheet_signatures` ou similar | ❌ nenhuma no schema |

---

### RELATÓRIO FINAL

**IMPLEMENTADO**
- Enum `punch_mode` com 3 valores + default por empresa + override por tarefa/recorrência + função `task_effective_punch_mode`
- Execução em runtime dos 3 modos em `/app/ponto` (funcionário)
- Histórico recente de pontos visível ao gestor (somente leitura, últimos 15)
- Assinatura digital — **somente** para contratos comerciais OmniBiz (não para folha de ponto)
- Aprovadores de férias configuráveis (`company_hr_settings`)

**PARCIALMENTE IMPLEMENTADO**
- Visão do gestor sobre pontos da equipe → existe leitura básica (15 últimos da empresa), **sem** filtros por funcionário/período, **sem** edição, **sem** auditoria, **sem** justificativa
- Configuração de RH da empresa → existe a tabela `company_hr_settings` com `default_punch_mode`, mas a UI `/app/empresa` **não expõe** esse campo (só aprovadores de férias)

**NÃO IMPLEMENTADO**
- Tela dedicada de gestão de folha de ponto (filtros por funcionário, intervalo, status, exportação)
- Edição/correção de `started_at`, `ended_at`, `paused_at`, `resumed_at`, `effective_minutes` pelo gestor
- INSERT manual de ponto perdido pelo gestor
- Justificativa de alteração + tabela de auditoria de `time_entries`
- Policies RLS de UPDATE/INSERT/DELETE para gestor em `time_entries`
- Modelo de pagamento por cliente (`hourly`/`fixed`/`mixed`) — campos não existem em `clients`
- Valor/hora e valor fixo configuráveis por cliente
- Valores default financeiros da empresa (valor/hora default, valor fixo default)
- Exibição informativa de valor/hora ou valor fixo no check-in do funcionário
- Visto do funcionário e visto do gestor por linha de ponto
- Geração de folha mensal (PDF) com vistos por linha
- Assinatura final do documento de folha mensal
- Qualquer tabela de remuneração / folha (`payroll`, `payroll_periods`, `timesheet_signatures`)

---

Nenhum arquivo será criado ou alterado nesta etapa. Aguardando definição do próximo passo (qual bloco priorizar primeiro: visão+edição do gestor, modelo de pagamento por cliente, ou folha mensal com assinaturas).
