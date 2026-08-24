# Publicar resposta e resolver SUP-2026-000077

Registar no ticket **SUP-2026-000077 — "recusar tarefa"** a mensagem de resolução
e mudar o estado para resolvido, usando o fluxo oficial da Central de Suporte
(nenhum update manual na base de dados).

## Estado atual do ticket

- Número: SUP-2026-000077 · Título: "recusar tarefa"
- Estado: **Aberto** · Nível: suporte da empresa · Responsável: sem atribuição
- Empresa: OMNIBIZ TESTES · Sem data de resolução registada

## O que será feito

1. **Publicar a mensagem pública de resolução** no histórico do ticket (visível ao
   solicitante), com o descritivo já aprovado: causa raiz, correção aplicada,
   validações server-side, melhorias entregues (histórico de recusas, notificação
   ao gestor, filtro "Recusadas", reatribuição) e resultado dos testes.
2. **Marcar como resolvido** através da resolução pelo gestor, registando também o
   resumo interno da correção (referência ADR-035).
3. **Confirmar o resultado**: reler o ticket e o histórico de mensagens/eventos
   para verificar estado resolvido, data de resolução e a mensagem visível.

## Regras respeitadas

- Nada é apagado; o histórico de mensagens e eventos do ticket é preservado.
- A notificação ao solicitante é a do próprio fluxo de suporte — sem envio manual.
- Nenhum outro ticket é alterado.

## Detalhes técnicos

- Mensagem pública via `post_support_ticket_message(_ticket_id, _message, _is_internal := false)`.
- Resolução via `resolve_support_ticket_by_manager(_ticket_id, _resolution)`, que
  grava `internal_resolution`, `resolved_at`, o evento de auditoria em
  `support_ticket_events` e dispara a notificação ao solicitante.
- Execução com a sessão do gestor/super admin da empresa do ticket, para que RLS e
  as guardas das RPCs se apliquem normalmente.
- Verificação final por leitura de `support_tickets`, `support_ticket_messages` e
  `support_ticket_events`.
