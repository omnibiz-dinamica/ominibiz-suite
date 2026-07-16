## Diagnóstico

Investigação executada em `auth.users`, `public.profiles`, `public.user_roles` e `public.companies`. Resultado:

| Conta | UUID | auth.users | profile | role | Empresa |
|---|---|---|---|---|---|
| `edurts.pt@gmail.com` (Super Admin) | `82ae91cb-315c-4641-8eaa-9b75b6f153f5` | confirmado, sem ban, `last_sign_in_at = 2026-07-15 15:28`, hash bcrypt presente | existe, `is_active=false` | `super_admin` (+ `owner`) | OMNIBIZ TESTES (`eec32f9a-…`) |
| `manager@homologacao.test` | `549e267d-6809-473c-9f50-04c413026564` | confirmado, sem ban, hash bcrypt presente | existe, `is_active=true` | `manager` | OMNIBIZ TESTES |
| `employee@homologacao.test` | `58f72122-cd91-4db6-9fd0-55bd66885ce3` | confirmado, sem ban, hash bcrypt presente | existe, `is_active=true` | `employee` | OMNIBIZ TESTES |

**Causa raiz das "Credenciais inválidas":** as três contas existem, estão confirmadas e ativas — o único motivo de falha é **senha divergente**. Os logs GoTrue confirmam `invalid_credentials` (grant_type=password) e o Super Admin efetivamente entrou em 2026-07-15 com sua senha real, portanto para ele **não há problema de credencial** (a senha `Homolog@2026` documentada nunca foi aplicada ao Super Admin — a conta é do dono real do produto). As contas `manager@homologacao.test` e `employee@homologacao.test` são as contas oficiais de homologação e são as que precisam ter a senha padrão `Homolog@2026` aplicada (KI-022 documenta que o reset em massa não foi executado no sandbox).

**Nenhuma migration recente alterou login/policies/middleware.** As contas não estão em estado "retired+…".

## Bloqueadores estruturais colaterais (fora do escopo do pedido, apenas reportar)

Encontrados durante a verificação — **não serão corrigidos nesta tarefa** por não fazerem parte do escopo (o pedido é apenas restaurar credenciais) e para não violar "não alterar permissões / regras":

1. `public.user_roles` do Super Admin possui **615 linhas duplicadas** com `role='super_admin'` (a tabela deveria ter `UNIQUE(user_id, role)` conforme `docs/ARCHITECTURE_RBAC.md`). O UNIQUE parece ausente ou foi removido em algum ponto.
2. `public.profiles.is_active = false` para o Super Admin, apesar de ele conseguir autenticar normalmente (o gate de login não consulta esse campo).

Ambos serão apenas registrados como observação no relatório final e propostos em backlog. Não serão alterados nesta tarefa.

## Ação proposta (mínima, cirúrgica)

Redefinir a senha **apenas** de `manager@homologacao.test` e `employee@homologacao.test` para `Homolog@2026`, preservando UUID, histórico, profile, roles, empresa, auditoria, ponto, tarefas, documentos, notificações.

**Não** tocar em `edurts.pt@gmail.com` — é conta real do dono, e a documentação de homologação nunca deveria ter listado a senha `Homolog@2026` para ela. Apenas documentar isso no CHANGELOG/KI-022.

### Passos

1. **Migração SQL** (`supabase/migrations/<timestamp>_reset_homolog_passwords.sql`) executando:
   ```sql
   UPDATE auth.users
   SET encrypted_password = crypt('Homolog@2026', gen_salt('bf')),
       updated_at = now()
   WHERE email IN ('manager@homologacao.test', 'employee@homologacao.test')
     AND id IN (
       '549e267d-6809-473c-9f50-04c413026564',
       '58f72122-cd91-4db6-9fd0-55bd66885ce3'
     );
   ```
   - Dupla trava por email **e** UUID → impossível atingir Super Admin ou qualquer outra conta.
   - Sem `DELETE`, sem `INSERT`, sem alteração de `id`, sem alteração de `email`, sem toque em `profiles`/`user_roles`/`companies`/tabelas operacionais.
   - `pgcrypto` já está disponível no projeto (usado por outras migrations).

2. **Validação E2E via Playwright** (headless, dentro do sandbox):
   - Login `manager@homologacao.test` / `Homolog@2026` → captura screenshot da rota autenticada (dashboard do gestor).
   - Logout → login novamente → confirma criação de sessão e refresh token.
   - Repetir para `employee@homologacao.test` → dashboard do funcionário.
   - Não testar Super Admin (senha real do usuário, fora de escopo).

3. **Documentação:**
   - `docs/CHANGELOG.md`: nova entrada "Fase H — reset de senhas de homologação (manager/employee) executado; Super Admin fora de escopo".
   - `docs/KNOWN_ISSUES.md`: KI-022 marcado como **✅ Resolvido** para as duas contas de homologação, com nota explicando que Super Admin nunca deveria estar sob senha padrão e recomendação de remover essa menção da documentação de homologação.
   - Registrar as duas anomalias colaterais (roles duplicadas + `is_active=false` do Super Admin) como novas entradas em `docs/KNOWN_ISSUES.md` (severidade 🟡) para tratamento futuro.

## Relatório final (a entregar após execução)

- Causa raiz: senha divergente nas contas de homologação (não é bug de auth, RLS, middleware nem migration).
- Arquivos alterados: 1 migration + `CHANGELOG.md` + `KNOWN_ISSUES.md`.
- UUIDs preservados: `549e267d-…` e `58f72122-…`.
- Histórico preservado: nenhuma tabela operacional tocada.
- Evidências: screenshots Playwright dos dois logins bem-sucedidos.
- Observações estruturais registradas em KI (roles duplicadas do Super Admin, `is_active=false` do Super Admin).

## Confirmação necessária antes de implementar

Confirma que:
1. Está de acordo em **não redefinir a senha do Super Admin** (`edurts.pt@gmail.com`) — ele já autentica normalmente e a senha real pertence ao dono do produto?
2. Está de acordo em apenas **documentar** (não corrigir) as duas anomalias colaterais encontradas (615 `user_roles` duplicadas e `profiles.is_active=false` do Super Admin)?

Se sim para ambos, prossigo com a migração + testes E2E + documentação.