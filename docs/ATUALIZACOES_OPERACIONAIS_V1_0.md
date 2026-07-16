# OmniBiz — Atualizações Operacionais V1.0

> **Status:** Oficial · **Data:** 2026-07-16 · **Escopo:** Refinamento operacional de valores, cobrança, apontamento, dashboard e filtros por funcionário.

Este documento consolida em linguagem simples e profissional as novidades introduzidas na versão V1.0 da sprint de refinamento operacional. Serve como manual das novidades para gestores, funcionários e administradores.

---

## Sumário

1. Modo de apontamento por cliente (Start/Stop vs Manual)
2. Forma de cobrança expandida — Hora · Fixo · Mensal · Misto
3. Valores padrão da empresa
4. Sobrescrita de valores por funcionário
5. Recorrência condicional (datas apenas para clientes manuais)
6. Dashboard clicável por status
7. Filtros persistentes em Tarefas (`?status=` e `?employee=`)
8. Rollout do `EmployeePicker` como filtro universal
9. Liberação de Identidade (ADR-016) — reutilização de e-mails em homologação

---

## 1 · Modo de apontamento por cliente

**Objetivo.** Diferenciar clientes que exigem batida de ponto em tempo real (`Start/Stop`) de clientes onde apenas o registro manual do serviço prestado é necessário (`Manual`).

**Como utilizar.** Em `/app/clientes`, editar o cliente e escolher o **Modo de apontamento**: `Start/Stop` ou `Manual`. O sistema propaga a escolha para tarefas e recorrências vinculadas.

**Benefícios.** Elimina fricção operacional em clientes onde o gestor prefere registrar horas depois do serviço; mantém a rastreabilidade GPS quando o modo é `Start/Stop`.

**Observações.** O modo herda o comportamento clássico (`Start/Stop`) quando não configurado.

**FAQ.**
- *E se eu mudar o modo depois?* Tarefas já concluídas mantêm o histórico; novas tarefas passam a usar o novo modo.
- *Posso ter dois modos no mesmo cliente?* Não. É uma escolha por cliente.

> _Screenshot: `/app/clientes` → editar cliente → seção "Modo de apontamento"._

---

## 2 · Forma de cobrança expandida

**Objetivo.** Suportar quatro modelos: **Hora**, **Fixo**, **Mensal** e **Misto**.

**Como utilizar.** Em `/app/clientes`, campo **Forma de cobrança**. Cada modo revela apenas os campos necessários (valor/hora, valor fixo, mensalidade). Deixar em branco = herda o valor padrão da empresa.

**Benefícios.** Contratos mensais fixos e modelos híbridos passam a ser suportados nativamente, sem gambiarras.

**Observações.** A hierarquia é: **override do funcionário → valor do cliente → valor padrão da empresa**.

**FAQ.**
- *"Misto" como funciona?* Combina um valor fixo base com um adicional por hora extra (ver ADR-017).

> _Screenshot: `/app/clientes` → editar → seção "Forma de cobrança"._

---

## 3 · Valores padrão da empresa

**Objetivo.** Permitir ao gestor definir uma tabela padrão para toda a operação (hora, fixo, mensal), evitando preencher cada cliente/funcionário individualmente.

**Como utilizar.** Em `/app/empresa`, card **Valores padrão**. Preencher os três campos. Clientes/funcionários sem valor próprio herdam automaticamente.

**Benefícios.** Reduz erro de digitação e padroniza a tabela financeira da empresa.

**Observações.** Requer papel `manager`, `owner` ou `super_admin`.

> _Screenshot: `/app/empresa` → card "Valores padrão"._

---

## 4 · Sobrescrita de valores por funcionário

**Objetivo.** Permitir contratos individuais fora da tabela padrão (funcionário premium, temporário, etc.).

**Como utilizar.** Em `/app/equipe`, editar o funcionário, aba **Financeiro**, seção **Sobrescrever valores**. Preencher hora / fixo / mensal conforme necessário. Vazio = herda do cliente/empresa.

**Benefícios.** Flexibilidade sem quebrar a hierarquia geral.

**Observações.** As colunas `manual_hourly_rate`, `manual_fixed_rate` e `manual_monthly_rate` são registradas na tabela `profiles`.

> _Screenshot: `/app/equipe` → editar funcionário → aba Financeiro → "Sobrescrever valores"._

---

## 5 · Recorrência condicional

**Objetivo.** Simplificar o cadastro de recorrências para clientes em modo **Manual** — nesses casos, horário e duração não fazem sentido, apenas as datas.

**Como utilizar.** Ao criar uma tarefa recorrente em `/app/tarefas`, escolher o cliente. Se ele estiver em modo **Manual**, o formulário de recorrência oculta os campos de horário e duração automaticamente.

**Benefícios.** Interface mais limpa e coerente com a realidade operacional.

**Observações.** Sem cliente selecionado, mantém o comportamento clássico (`Start/Stop`).

> _Screenshot: `/app/tarefas` → nova tarefa recorrente → escolher cliente manual._

---

## 6 · Dashboard clicável por status

**Objetivo.** Transformar os cards do dashboard em atalhos operacionais reais.

**Como utilizar.** No dashboard (`/app/`), clicar em qualquer card (**Pendentes** · **Em andamento** · **Concluídas** · **Atrasadas**) leva a `/app/tarefas` já filtrada pelo status escolhido.

**Benefícios.** Menos cliques, mais foco. "Atrasadas" é filtro derivado (não status persistido): tarefas não concluídas com prazo vencido.

**FAQ.**
- *Posso compartilhar o link filtrado?* Sim. A URL contém `?status=` — bookmarks e chats funcionam.

> _Screenshot: `/app/` → clique no card "Atrasadas"._

---

## 7 · Filtros persistentes em Tarefas

**Objetivo.** Reter os filtros em URL para compartilhamento e continuidade entre sessões.

**Como utilizar.** Em `/app/tarefas`, barra de filtros no topo (chips de status + `EmployeePicker`). Alterar um filtro atualiza a URL (`?status=` e `?employee=`).

**Benefícios.** Sem perder contexto ao recarregar; suporte a deep-links (`/app/tarefas?status=atrasadas&employee=<uuid>`).

**Observações.** Search-params são validados via `validateSearch` — valores inválidos são simplesmente ignorados.

> _Screenshot: `/app/tarefas` → barra de filtros aplicada._

---

## 8 · Rollout do `EmployeePicker`

**Objetivo.** Padronizar a busca por funcionário em todas as listagens gerenciais (busca por nome/cargo/equipe/e-mail, virtualização automática > 60 itens, debounce 180 ms).

**Adotado em.** Tarefas · Despesas · Férias · Ponto/Gestão.

**Roadmap.** RH-Recibos e Comercial adotarão o picker no próximo ciclo (KI-021).

**Benefícios.** UX consistente, performance previsível, código não duplicado.

> _Screenshot: `/app/despesas` → filtro de colaborador._

---

## 9 · Liberação de Identidade (ADR-016)

**Objetivo.** Permitir a reutilização de e-mails em ambiente de **homologação**, preservando integralmente o histórico operacional dos utilizadores retirados.

**Como funciona.** RPC `public.admin_release_user_identity(_user_id uuid)` (Super Admin, SECURITY DEFINER, idempotente):

1. Remove vínculos ativos em `user_roles`.
2. Limpa `profiles.current_company_id` e `company_id_primary`.
3. Marca `profiles.is_active = false`.
4. Revoga convites pendentes do e-mail atual.
5. Renomeia `auth.users.email` para `retired+<uuid>@homologacao.invalid` e sincroniza `auth.identities`.
6. **Preserva** todo histórico operacional: `tasks`, `time_entries`, `time_entry_geopoints`, `time_entry_valuations`, `employee_expenses`, `vacation_requests`, `notifications`, `contracts`, `payslips`, `employee_attachments`, `time_entries_audit`.

**Diretriz permanente.** Identidade sempre por UUID; e-mail é atributo. Todas as novas RPCs recebem UUID.

---

## Observações de retrocompatibilidade

- Migrations aditivas — colunas nullable com herança implícita.
- URLs antigas de `/app/tarefas` continuam válidas (filtros ficam em "Todos").
- Nenhum campo/registro operacional foi removido em qualquer fase.

---

## Referências

- `docs/CHANGELOG.md` — timeline detalhado.
- `docs/DECISIONS.md` — ADR-016 (Liberação de Identidade), ADR-017 (Hierarquia de valores), ADR-018 (Recorrência condicional).
- `docs/KNOWN_ISSUES.md` — KI-021 (`EmployeePicker` em RH e Comercial).
- `docs/ARCHITECTURE_INDEX.md` — índice geral.