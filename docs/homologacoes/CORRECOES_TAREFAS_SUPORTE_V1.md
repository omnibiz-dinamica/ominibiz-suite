# Correções Operacionais — Tarefas, Recorrência e Central de Suporte (v1)

**Data:** 2026-07-17
**Autor:** Sprint de Correção Operacional
**Escopo:** correções pontuais sem alteração de arquitetura, RLS/RBAC ou schema.

---

## 1. Divergência de horário Gestor × Funcionário — **CORRIGIDO**

### Causa raiz
A arquitetura oficial já define horário-parede: `src/lib/wall-clock.ts`
serializa datetimes locais como `YYYY-MM-DDTHH:MM:SS.000Z` para preservar
os componentes exatamente como o Gestor os cadastrou, e `formatWallDate` /
`formatWallTime` leem os componentes **UTC** do ISO — sem aplicar fuso.

A visão do Gestor (`src/routes/app.tarefas.tsx`) já usava esses helpers.
A visão do Funcionário estava usando `new Date(iso).toLocaleString(...)` /
`.toLocaleTimeString(...)`, que interpreta `T14:06:00.000Z` como UTC e
converte para o fuso local (`Europe/Lisbon`, UTC+1 no verão) → 15:06.

### Arquivos alterados
| Arquivo | Ocorrências |
|---|---|
| `src/routes/app.ponto.tsx` | 3 (hero, header em execução, fila "Depois") |
| `src/components/dashboards/EmployeeDashboard.tsx` | 1 (lista de próximas tarefas) |

Todos substituídos por `formatWallDate` / `formatWallTime`.

### Teste
1. Gestor cria tarefa às 14:06.
2. Funcionário abre `/app/ponto` e `/` (dashboard).
3. Ambos devem exibir **14:06** — independentemente do fuso do dispositivo.

---

## 2. Tarefa sem horário para clientes em modo Manual — **HABILITADO**

### Situação
- `public.tasks.scheduled_for` já é `NULL`-able no schema — não requer migration.
- O submit já aceitava strings vazias e serializava `null` via `wallInputToISO`.
- **Faltava** apenas: sinalização visual na UI e mensagem apropriada nas listagens.

### Regra aplicada
- Cliente com `clients.timing_mode = 'manual'` → Início/Fim marcados como
  **opcionais** no formulário (label sufixado, hint azul explicando o fluxo).
- Cliente com `timing_mode = 'start_stop'` → mantém regras atuais.
- Lista do Gestor (`app.tarefas`) e visão do Funcionário exibem
  **"Sem horário definido"** quando `scheduled_for IS NULL`.
- Nenhum horário é inventado, nenhum default aplicado, nenhum
  deslocamento por timezone.

### Arquivos alterados
- `src/routes/app.tarefas.tsx` (`TaskForm` + `TaskRowItem`).
- Efeitos herdados em `EmployeeDashboard` e `app.ponto` (via mensagem
  "Sem horário definido").

### Teste
1. Selecionar um cliente Manual, preencher apenas data em Início (ou nada).
2. Salvar → sem erro.
3. Confirmar exibição "Sem horário definido" nas listagens.
4. Funcionário registra entrada/saída manualmente na Folha de Ponto.

---

## 3. Recorrência — fallback de 60 minutos — **REMOVIDO**

### Correção
`emptyRecurrence()` passou a inicializar `scheduledTime: ""` e
`durationMinutes: 0`. Como esses campos já eram sobrescritos no submit
(derivados do topo para `start_stop`, fixos `00:00`/0 para `manual`),
esta é uma correção de higiene — elimina qualquer risco de fallback
silencioso e evita confusão de leitura de código.

O bloco de recorrência na UI segue exibindo apenas **Data inicial** e
**Data final**, herdando horários do topo — comportamento já validado
na `HOMOLOGACAO_SARA_V1_0`.

### Arquivo alterado
- `src/components/tasks/RecurrenceForm.tsx`.

---

## 4. Visibilidade de tarefas de Manager — **AUDITADO / SEM ALTERAÇÃO NECESSÁRIA**

### Análise
- Query de `members` (linha 131 de `app.tarefas.tsx`) usa
  `user_roles.select("user_id").eq("company_id", ...)` — **não filtra
  por role**, portanto retorna todos os utilizadores da empresa
  independentemente do papel (`employee`, `manager`, `owner`).
- `EmployeePicker` não aplica nenhum filtro por role.
- Query principal de tarefas com `isManager=true` faz
  `.eq("company_id", currentCompanyId)` sem restringir `assigned_to` —
  Gestor vê todas as tarefas da empresa.
- Filtro "Concluídas" (`STATUS_FILTERS`) opera sobre `t.status`, não
  sobre o role do executor — Employees e Managers concluídos aparecem.

Nenhum bug estrutural identificado. Se um cenário concreto ainda
apresentar problema (ex.: `profiles.is_active = false` para o Manager,
ou desatualização do cache), pedimos reprodução com IDs e screenshot
para diagnóstico dirigido.

---

## 5. Central de Suporte — Detalhe do ticket — **AUDITADO**

O clique em qualquer linha da Central Global (`/app/admin/suporte`)
navega para `/app/suporte/$id` via `<Link to="/app/suporte/$id" params={{ id }}>`.
Essa rota já renderiza a **página de detalhe completa** com:

- Dados principais, solicitante e empresa (RPC `get_support_ticket_requester_info`).
- Bloco "Local do erro" (módulo/rota/URL) e "Informações técnicas"
  (build/commit/ambiente/navegador/plataforma/resolução/timezone).
- Anexos com miniatura, Signed URL (300/900 s), abrir e download.
- Mensagens ordenadas cronologicamente (internas visíveis apenas ao SA).
- Timeline unificada (eventos + mensagens).
- Ações: alteração de status/prioridade, resposta rápida, nota interna,
  reabertura (SA sempre; Gestor até 7 dias após fechamento).

Filtros da Central Global cobrem: status, prioridade, tipo, empresa,
intervalo de datas e busca textual (número, título, descrição, empresa).
Ordenação: **urgente → alta → normal → baixa**, e dentro de cada
prioridade tickets **abertos primeiro, mais antigos primeiro**.

Se o comportamento observado é "clico e não abre" (modal em branco),
pedimos ao Super Admin reprodução com log de console (F12 → Console e
Network) e o `ticket_number` afetado — a URL `/app/suporte/<uuid>` deve
ser acessível diretamente e mostrar o detalhe.

---

## Testes automatizados / manuais

| # | Cenário | Status |
|---|---|---|
| 1 | Tarefa manual sem horário — cria e lista com "Sem horário definido" | ✅ Código |
| 2 | Tarefa às 14:06 aparece igual no Gestor e no Funcionário | ✅ Código (`wall-clock`) |
| 3 | Recorrência sem duração — não injeta 60 min | ✅ Código |
| 4 | Filtro "Concluídas" inclui Employees e Managers | ✅ Auditado |
| 5 | Super Admin abre detalhe do ticket com todos os blocos | ⚠️ Auditado, requer reprodução se ainda falhar |

Testes fim-a-fim via Playwright ficam registrados como pendência
operacional em `KNOWN_ISSUES` (KI-025 já cobre exportações Excel/PDF).

---

## Documentação e Release Notes

- `docs/CHANGELOG.md` — atualizado.
- `docs/homologacoes/CORRECOES_TAREFAS_SUPORTE_V1.md` — este documento.
- Release notes de Gestor/Funcionário/Super Admin serão consolidadas
  quando o ciclo do sprint fechar; alterações desta correção estão
  cobertas pelo CHANGELOG.

## Classificação final

**APROVADO PARA HOMOLOGAÇÃO** — correções aplicadas na causa raiz,
sem alteração de RLS/RBAC/schema/UUIDs, e sem apagamento de histórico.
