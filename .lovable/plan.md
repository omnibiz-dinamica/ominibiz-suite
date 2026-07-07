## Situação atual (auditoria)

- Infra já existente e reutilizada: tabela `public.invites` (token, status, send_count, expires_at, RLS por manager/super_admin), RPCs `admin_create_company_with_invite`, `create_or_resend_invite`, `resend_invite`, `accept_invite`, `get_invite_preview`, template `invite` no registry, helper `sendTransactionalEmail` já grava em `email_send_log` com `trigger_source='invite'`.
- **Equipe (`app.equipe.tsx`) já envia email automaticamente** ao criar/reenviar convite. Único gap operacional: **`app.admin.tsx` (Super Admin) ainda mostra o link para copiar** — não dispara email.
- `admin_create_company_with_invite` cria empresa + convite, mas não trata *conflict* caso já exista convite pendente para o mesmo email nessa empresa (raro no fluxo Super Admin, mas planejar).
- Não há "trocar email do gestor antes do aceite" no Super Admin — precisa novo botão + fluxo.
- `letrasmodestas@hotmail.com`: invite `accepted` em `OMNIBIZ TESTES` (empresa `eec32f9a-…`) + invite `pending` em outra empresa (`7b79e6a5-…`). auth.users é inacessível via psql restrito; usar RPC `SECURITY DEFINER` para resolver `user_id` por email e limpar vínculos.

Nenhuma alteração de RLS/RBAC/schemas necessária — apenas 1 RPC nova (revogar acesso por email) e 1 RPC nova (trocar email do convite pendente do Super Admin). Zero migração destrutiva.

## Fase 1 — Fluxo automático de convite (Super Admin)

**Frontend (`src/routes/app.admin.tsx`)**
- Após `admin_create_company_with_invite`, disparar `sendTransactionalEmail({ templateName:'invite', recipientEmail, idempotencyKey:'invite-<invite_id>-1', triggerSource:'invite', companyId, templateData:{ inviteUrl, companyName, inviterName:'OmniBiz' } })`.
- Substituir a UI "Copiar link" por **toast** `Empresa criada com sucesso. Convite enviado para <email>` + fechar modal.
- Manter fallback "Copiar link" **apenas** dentro de um `<details>` "Envio manual (contingência)" caso o email falhe — o erro do send é logado e exibido, o convite não é revertido.
- Para expor `invite_id` no retorno, alterar `admin_create_company_with_invite` para também retornar `invite_id` (adição de coluna no RETURN TABLE, retrocompatível — clientes existentes leem por nome).

**Impacto:** somente a rota Super Admin. Fluxo homologado de `app.equipe.tsx` intocado.

## Fase 2 — Reenvio + Troca de email na tela da empresa

**Nova seção "Convite do Gestor" em `src/routes/app.empresa.tsx`** (visível apenas para super_admin ou owner):
- Listar convite pendente/aceito para role `manager/owner` da empresa atual (query em `invites`, filtrada pelas RLS existentes).
- Badge de status: **Pendente** / **Enviado há Xh** / **Expirado** / **Aceito**. Mostrar `send_count`, `last_sent_at`, `expires_at`.
- **Botão "Reenviar convite"**: chama `resend_invite(_invite_id)` (RPC existente — rotaciona token, incrementa send_count, atualiza `last_sent_at`) → dispara email com `idempotencyKey: 'invite-resend-<id>-<send_count>'`. Mesma lógica já em `app.equipe.tsx`.
- **Botão "Alterar email do gestor"** (só se `status='pending'`): abre dialog → nova RPC `admin_replace_manager_invite(_invite_id uuid, _new_email text)` SECURITY DEFINER que:
  1. valida super_admin;
  2. marca invite atual como `revoked`;
  3. cria novo invite (mesma company, role='manager', novo token) → retorna nova row;
  4. registra em `invite_email_audit` (função existente para auditoria).
  Frontend então envia email para o novo endereço com `idempotencyKey: 'invite-replace-<new_invite_id>-1'`.

Todos os envios continuam gravados em `email_send_log` (feito pela `sendTransactionalEmail`).

## Fase 3 — Remover vínculos de `letrasmodestas@hotmail.com` em OMNIBIZ TESTES

Nova RPC SECURITY DEFINER, executada uma vez via `supabase--insert`:

```sql
-- 1. Resolver user_id por email em auth.users (dentro da RPC, service role)
-- 2. DELETE FROM public.user_roles WHERE user_id=? AND company_id='eec32f9a-…'
-- 3. UPDATE public.invites SET status='revoked'
--    WHERE lower(email)='letrasmodestas@hotmail.com' AND company_id='eec32f9a-…' AND status IN ('pending','accepted')
-- 4. UPDATE public.profiles SET current_company_id = NULL WHERE id=? AND current_company_id='eec32f9a-…'
-- 5. Retornar contagem de rows afetadas para relatório
```

Não toca: `auth.users`, `notifications`, `task_documents`, `employee_attachments`, `time_entries*`, `payslips`, `employee_expenses` etc. Histórico preservado. Usuário continua existindo. Como o email fica **sem** vínculo em OMNIBIZ TESTES e o convite pendente na outra empresa fica intacto, ele já pode ser usado como Gestor Principal de nova empresa (não há UNIQUE(email) global em invites/profiles que impeça).

Validações pré-execução (relatório antes de rodar):
- Confirmar user_id resolvido;
- Confirmar não é o único `owner` da empresa (não é — owner é `82ae91cb-…`);
- Confirmar contagem exata de rows a remover (esperado: 1 role, 1 invite accepted → revoked).

## Fase 4 — Testes E2E

Sequência via Playwright (localhost + Supabase real): criar empresa nova como super_admin → verificar toast → conferir `email_send_log` (SELECT via psql) com `template_name='invite'` e `trigger_source='invite'` → aceitar convite via `/aceitar-convite?token=…` → criar senha → login → checar `user_roles` e `current_company_id`. Depois: rodar RPC de limpeza → SELECT confirmando 0 rows em `user_roles` para letrasmodestas em OMNIBIZ TESTES → criar nova empresa usando esse email → aceitar → login.

## Entregáveis

1. Migração: alteração de `admin_create_company_with_invite` (retornar `invite_id`), nova RPC `admin_replace_manager_invite`, nova RPC `admin_revoke_user_from_company`.
2. Código: `app.admin.tsx` (auto-send + toast), `app.empresa.tsx` (card "Convite do Gestor" com reenviar/trocar-email), helper `src/lib/invites/send.ts` centralizando montagem do payload de email (evitar duplicação com `app.equipe.tsx`).
3. Execução única do revoke para OMNIBIZ TESTES + letrasmodestas.
4. Atualizar `docs/CHANGELOG.md`, `docs/DECISIONS.md` (ADR-014 auto-send invite + ADR-015 helper unificado), `docs/KNOWN_ISSUES.md` (registrar como resolvido o envio manual).
5. Relatório final: arquivos, fluxo antigo × novo, evidências (SELECTs de `email_send_log` e `user_roles`), testes, riscos residuais (email pode falhar → super admin vê erro + tem contingência de copiar link).

## Fora do escopo (não mexer)

- `app.equipe.tsx` (fluxo homologado, apenas refatora para consumir novo helper — sem mudança de comportamento).
- Templates de email, RLS, RBAC, esquema de `invites`, `companies`, `profiles`, `auth.*`.

Aguardo aprovação para iniciar Fase 1.