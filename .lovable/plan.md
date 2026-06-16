## Auditoria — Módulo Férias (estado real)

| # | Requisito | Estado |
|---|---|---|
| 1 | Funcionário cria férias | IMPLEMENTADO |
| 2 | Gestor recebe notificação ao ser criada | PARCIAL — existe função `vacation_notify_insert` no banco, mas não há trigger ativo em `vacation_requests` (sem registo em `information_schema.triggers`). Nada é gravado em `notifications` no fluxo frontend. |
| 3 | Status pendente inicial | IMPLEMENTADO |
| 4 | Gestor aprova/rejeita | IMPLEMENTADO via RPC `vacation_decide` |
| 5 | Funcionário recebe notificação da decisão | NÃO IMPLEMENTADO — sem trigger/insert em `notifications` e sem chamada a `sendTransactionalEmail` no fluxo |
| 6 | Gestor cria férias para funcionário | NÃO IMPLEMENTADO — o formulário insere sempre com `user_id = auth.uid()`; não há seletor de colaborador |
| 7 | Funcionário recebe solicitação para aceitar/alterar | PARCIAL — a UI tem secção "Aguardando sua confirmação" e botões Confirmar/Recusar, mas o RPC `vacation_confirm` **não existe no banco** (rotinas presentes: `vacation_decide`, `vacation_notify_insert`, `vacation_fill_context`, `resolve_vacation_approver`). Clicar quebra em runtime. |
| 8 | Gestor vê "Pendente de Confirmação" | PARCIAL — UI renderiza o status, mas como o fluxo de criação pelo gestor (#6) não existe, esse estado nunca é gerado |
| 9 | Funcionário pode Confirmar / Solicitar alteração | PARCIAL — UI tem "Confirmar" e "Recusar" (não "Solicitar alteração"); ambos chamam RPC inexistente |
| 10 | Tela mostra Local de trabalho | IMPLEMENTADO (form + lista de pendentes) |
| 11 | Tela mostra Função (cargo) | NÃO IMPLEMENTADO |
| 12 | Tela mostra Colaborador | IMPLEMENTADO (apenas vista de gestor) |
| 13 | Filtro Colaborador | IMPLEMENTADO |
| 14 | Filtro Mês | IMPLEMENTADO |
| 15 | Filtro Ano | NÃO IMPLEMENTADO (apenas mês YYYY-MM) |
| 16 | Filtro Status | NÃO IMPLEMENTADO (listas separadas por status, sem seletor) |
| 17 | Dias úteis calculados automaticamente | IMPLEMENTADO (toggle "apenas dias úteis", `businessDaysBetween`) |
| 18 | Exportação Excel | NÃO IMPLEMENTADO |
| 19 | Exportação PDF | NÃO IMPLEMENTADO |
| 20 | Emails integrados | NÃO IMPLEMENTADO — templates `vacation-request/approved/rejected` existem em `src/lib/email-templates/` e estão no registry, mas nenhum ponto do fluxo chama `sendTransactionalEmail` para férias |
| 21 | Notificações integradas | NÃO IMPLEMENTADO — função `vacation_notify_insert` definida mas sem trigger; nenhum insert manual em `notifications` |

### Arquivos relevantes inspecionados
- `src/routes/app.ferias.tsx` (650 linhas) — UI completa do módulo
- `src/lib/email/send.ts` — declara triggers `vacation_request|approved|rejected` mas sem call site
- `src/lib/email-templates/vacation-{request,approved,rejected}.tsx` — templates prontos, não acionados
- `src/lib/email-templates/registry.ts` — templates registados

### Migrations existentes (vacation)
- `20260520092549`, `20260520112516`, `20260520113619`, `20260524105813`, `20260524140014`, `20260524141056`, `20260615181116`, `20260615181153`

Funções no banco: `vacation_decide`, `vacation_notify_insert`, `vacation_fill_context`, `resolve_vacation_approver`. **Sem** `vacation_confirm`. **Sem** triggers ativos em `vacation_requests`.

### Testes realizados
- Inspeção estática do código (`app.ferias.tsx`, `email/send.ts`, registry).
- Consulta a `information_schema.routines` e `information_schema.triggers` no banco para confirmar funções/triggers ativos.
- Nenhum teste E2E executado (não solicitado e fora do escopo de uma auditoria de estado).

### Resumo executivo
Bloqueadores críticos: (a) `vacation_confirm` invocado pela UI não existe no banco — botão "Confirmar/Recusar" falha; (b) sem trigger ligando `vacation_notify_insert` a inserts/updates — nenhuma notificação chega; (c) emails de férias nunca disparados apesar dos templates existirem; (d) fluxo "Gestor cria férias para funcionário" inexistente; (e) sem exportação Excel/PDF; (f) faltam filtros Ano e Status e coluna Função.
