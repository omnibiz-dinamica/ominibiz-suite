
## Correções de drift (2026-09-02)
- [x] Aplicar migration do campo `profiles.sector`
- [x] Corrigir `round(score::numeric,3)` em `support_find_similar`
- [x] Corrigir erros de typecheck em `src/routes/api/admin/users/email.ts` (tabelas de email/auditoria ausentes nos tipos)

## 11/09/2026 — Fase 0 a 2 (concluído)
- [x] Fase 0 — empresa Grupo V-clean TESTE clonada (novo company_id) e validada.
- [x] Fase 1 — identificadores funcionais DDMMAAAA-XXXc/a (`src/lib/change-log.ts`) visíveis junto ao build/commit.
- [x] Item 1 — horário habitual flexível: sem alterações, regressão validada.
- [x] Item 2 — voltar à aba/janela não atualiza nem descarta estado.
- [x] Item 4 — pesquisa de funcionário na equipa responsável do cliente.
- [x] Item 5 — equipa responsável do cliente volta a ser gravada (campo em falta na base de dados).
- [x] Item 6 — datas da recorrência editáveis, data final inclusiva respeitada.
