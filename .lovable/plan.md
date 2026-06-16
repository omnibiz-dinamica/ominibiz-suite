## Objetivo

Permitir a Gestores, Owners e Super Admins reenviarem convites pendentes/expirados a partir da página **Equipe**, sem criar novo utilizador nem novo registo de convite. Adicionar rate limit, dashboard e auditoria do reenvio.

## 1. Migração de base de dados

Alterar `public.invites`:
- Adicionar coluna `last_sent_at TIMESTAMPTZ` (default `created_at` para registos existentes).
- Adicionar coluna `send_count INT NOT NULL DEFAULT 1` (existentes começam em 1 — o envio original).

Criar função RPC `resend_invite(_invite_id UUID)` (SECURITY DEFINER) que:
1. Lê o convite + valida permissões (`is_company_manager(auth.uid(), company_id)` OU `is_super_admin(auth.uid())`). Caso contrário, `RAISE EXCEPTION 'forbidden'`.
2. Bloqueia se `status IN ('accepted','revoked')` → erro "Convite não pode ser reenviado".
3. Rate limit: se `send_count >= 5` E `last_sent_at > now() - interval '24 hours'` → erro "Limite de 5 reenvios por 24h atingido".
4. Se `status = 'expired'` OU `expires_at < now()`:
   - Gera novo token (`encode(gen_random_bytes(24),'hex')`).
   - Renova `expires_at = now() + 14 days`.
   - Reabre `status = 'pending'`.
5. Caso contrário, mantém token atual.
6. Incrementa `send_count`, atualiza `last_sent_at = now()`.
7. Devolve `(id, email, token, role, expires_at, send_count)`.

Job leve (opcional): trigger ou cron já existente para marcar `status='expired'` quando `expires_at < now()`. Para esta entrega, fazemos a marcação lazy dentro do próprio RPC (passo 4 cobre o caso).

GRANTs: `GRANT EXECUTE ON FUNCTION public.resend_invite(uuid) TO authenticated;`

## 2. Frontend — `src/routes/app.equipe.tsx`

Substituir a secção **"Convites pendentes"** por uma tabela completa **"Convites"** com:

Colunas:
- Email
- Cargo (Gestor / Funcionário)
- Status (badge colorido: Pendente=amarelo, Aceito=verde, Expirado=vermelho, Cancelado=cinza)
- Data de criação (`created_at`)
- Último envio (`last_sent_at`) + `send_count` ("3x")
- Ações: Copiar link · **Reenviar** · Cancelar

Filtros/Toggle simples: mostrar Todos / Pendentes / Expirados / Aceitos / Cancelados (default: Pendentes+Expirados).

Botão **Reenviar Convite**:
- Visível apenas para status `pending` ou `expired`.
- Desabilitado e com tooltip "Limite atingido" quando `send_count >= 5` E `last_sent_at` < 24h.
- Ao clicar:
  1. Chama `supabase.rpc('resend_invite', { _invite_id })`.
  2. Com o retorno (`email`, `token`, `role`, `expires_at`), chama `sendTransactionalEmail({ templateName: 'invite', recipientEmail, idempotencyKey: 'invite-resend-{id}-{send_count}', triggerSource: 'invite', companyId, templateData: { inviteUrl: buildAppUrl('/aceitar-convite?token=...'), role, expiresAt } })`.
  3. Toast: "Convite reenviado com sucesso." OU erro detalhado vindo do RPC/email.
  4. Invalida query `["invites"]`.

Dashboard (cards no topo da secção):
- **Pendentes** (count)
- **Aceitos** (count)
- **Expirados** (count)

(Cancelados ficam acessíveis pelo filtro, mas não no card principal.)

Card de **Nome** do convidado: o sistema atual não guarda nome no convite; usar o email como identificador principal e mostrar "—" para nome (consistente com o resto da app, que só recolhe nome após aceitação).

## 3. Auditoria e logs

- Cada reenvio gera novo `message_id` no `email_send_log` automaticamente via `sendTransactionalEmail` (já implementado).
- `idempotencyKey` inclui `send_count` para garantir que retries do mesmo botão não duplicam, mas reenvios reais sim aparecem.
- `send_count` e `last_sent_at` no próprio `invites` servem de auditoria operacional rápida.

## 4. Garantias

- Nunca cria novo `auth.users`.
- Nunca cria nova linha em `invites`.
- Reutiliza token quando ainda válido; só gera novo se expirado.
- Rate limit aplicado server-side (RPC), não apenas no UI.
- Permissão validada server-side (não confia em RoleGuard).

## 5. Entregáveis

1. Migração SQL (colunas + RPC + grants).
2. Edição de `src/routes/app.equipe.tsx` (tabela, dashboard, ação reenviar).
3. Relatório no chat: o que foi alterado, ficheiros, regras de negócio e como testar (criar convite → forçar expiração via SQL → reenviar → verificar `email_send_log`).

## Fora de escopo (confirmar se desejado depois)

- Job cron dedicado para marcar `expired` automaticamente (lazy é suficiente para esta release).
- Exportação Excel/PDF da lista de convites.
- Edição de email/role do convite existente (continua sendo cancelar + criar novo).
