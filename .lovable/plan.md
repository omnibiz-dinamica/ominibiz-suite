## Objetivo

Corrigir os 7 bloqueios encontrados na validação e tornar o módulo de notificações WhatsApp de tickets Production Ready.

## Bloqueio 1 — Idempotência da fila

- Adicionar `dedupe_key text` em `whatsapp_notifications` com índice único parcial (`WHERE status IN ('pending','sent')`).
- Chave = `ticket_id + event + hash do payload relevante`.
- `enqueue_ticket_whatsapp` passa a usar `ON CONFLICT DO NOTHING`, eliminando duplicados por retry de RPC, dupla execução ou concorrência.

## Bloqueio 2 — Cobertura de eventos

- Adicionar `ticket_priority_changed`.
- Substituir a cadeia `ELSIF` do trigger por avaliações independentes, para que responsável + status alterados na mesma transação gerem os dois eventos.
- Distinguir `ticket_resolved` e `ticket_reopened` a partir da transição de status, em vez de um genérico `ticket_status_changed`.

## Bloqueio 3 — Máquina de estados da fila

- Ampliar o `CHECK` de `status` para `pending | sending | sent | failed | skipped`.
- Novas colunas: `next_attempt_at timestamptz`, `max_attempts int default 5`, `locked_at`, `http_status`, `response_body`.
- RPC `whatsapp_claim_batch(_limit)` — marca `pending → sending` com `FOR UPDATE SKIP LOCKED` (seguro sob concorrência).
- RPCs `whatsapp_mark_sent` e `whatsapp_mark_failed` (aplica backoff exponencial; ao esgotar tentativas fixa `failed` definitivo).

## Bloqueio 4 — Worker de disparo

- Rota TanStack `src/routes/api/public/whatsapp/dispatch.ts`, autenticada por `apikey` (chave publicável), nunca exposta no frontend.
- Fluxo: claim do lote → POST para a URL do ActivePieces (secret de servidor) → marca `sent` ou `failed`.
- Timeout por requisição (10s) e tratamento explícito de 401, 5xx, rede indisponível.
- Agendamento por `pg_cron` a cada minuto chamando o endpoint.
- Secret necessário: `ACTIVEPIECES_WEBHOOK_URL` (solicitado ao utilizador no momento da implementação).

## Bloqueio 5 — Painel de auditoria da fila

- Bloco em `/app/admin/suporte`: últimas notificações com evento, destinatário, status, tentativas, `last_error` e ação de reenfileirar linhas `failed`.

## Bloqueio 6 — Dívida de segurança pré-existente

- Adicionar `SET search_path = public` em `delete_email`, `enqueue_email`, `move_to_dlq`, `read_email_batch`.

## Bloqueio 7 — Dry-run real e relatório

Executado em empresa de homologação, nunca em dados de clientes reais:

1. Configurar WhatsApp do gestor e do super admin de homologação, `default_support_manager_id` e `default_support_super_admin_id`.
2. Percorrer criar → atribuir → status → prioridade → escalonar → devolver → resolver → reabrir → mensagem, conferindo em cada passo: evento em `support_ticket_events`, linha em `whatsapp_notifications`, destinatário, payload e status.
3. Cenários negativos: responsável inativo, sem WhatsApp, WhatsApp inválido, papel incorreto, configurações vazias — todos devem produzir `skipped` com motivo.
4. Cenários de retry: 401, 500, timeout e webhook indisponível.
5. Relatório final com payload real enviado e exemplos de log de sucesso, falha e skipped.

## Documentação

`docs/ARCHITECTURE_SUPPORT_TICKETS.md` (seção de notificações WhatsApp), ADR-025 (idempotência + máquina de estados do outbox), CHANGELOG e `docs/KNOWN_ISSUES.md`.
