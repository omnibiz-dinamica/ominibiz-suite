
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

## 14/09/2026 — Dashboard operacional (concluído)
- [x] Excluir tarefas atribuídas a gestores, owners e super admins dos contadores operacionais.
- [x] Confirmar o total de 3 atrasadas na Grupo V-clean: Sara Coelho (2) e Marco Ribeiro (1).

## 16/09/2026 — Recorrências sem fim (horizonte de 12 meses)
- [x] Etapa 1 — horizonte rolante de 12 meses na geração, em lote e sem datas passadas.
- [x] Etapa 2 — rotina diária `recurrence_extend_horizon` série por série (substitui job por empresa).
- [ ] Etapa 3 — encerrar a série "Crelan" (aguarda confirmação explícita).
- [x] Etapa 4 — painel reproduzido na Grupo V-clean sem erro; aguarda mensagem exata do erro relatado.
- [x] Etapa 5 — testes (179/179), CHANGELOG, DECISIONS (ADR-065), ARCHITECTURE_INDEX.


## 17/09/2026 — Rastreabilidade de criação de tarefas
- [x] Auditoria de criação (`created` em task_audit_events com origem manual/recurrence_seed/recurrence).
- [x] Notificação e selo identificam ocorrências geradas automaticamente.
- [x] Prova real nos dois caminhos (OMNIBIZ TESTES), dados de teste removidos; testes 184/184, typecheck OK.

## 18/09/2026 — Férias: encaminhar para autorização (concluído)
- [x] Criar na base de dados a operação de encaminhamento (`vacation_forward_for_authorization`) e recarregar o cache da API.
- [x] Registo de quem encaminhou/quando, histórico `solicitar`/`encaminhar` e avisos ao autorizador e ao remetente.
- [x] Teste end-to-end na tela, com dados de teste removidos.
- [x] Tarefas canceladas (empresa teste): confirmado comportamento esperado, sem correção necessária.

## 21/09/2026 — Help Desk: encerramento e avisos (Etapa A concluída)
- [x] Regra canónica de encerramento por papel/fila (`support_can_close_ticket`) + botão oculto conforme a mesma regra.
- [x] Super Admin encerra qualquer ticket em qualquer estado.
- [x] Auditoria de encerramento (`closed_by` + evento).
- [x] Avisos: encerramento, resposta do atendimento, resposta do solicitante; sem auto-aviso e idempotentes.
- [ ] Etapa B (rename "Owner" -> "Proprietário Empresa" e matriz de atribuição de papéis) — apenas diagnóstico entregue, aguarda confirmação.
