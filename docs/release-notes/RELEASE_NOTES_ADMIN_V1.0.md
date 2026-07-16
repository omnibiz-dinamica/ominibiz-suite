# Release Notes — Administrador — OmniBiz V1.0

> **Público:** Super Admin / Owner · **Data:** 2026-07-16

## Novidades relevantes para o Administrador

### 1. Liberação de Identidade (ADR-016)
RPC `public.admin_release_user_identity(_user_id uuid)` — Super Admin, `SECURITY DEFINER`, idempotente. Libera o e-mail de um utilizador de homologação para reutilização preservando 100% do histórico operacional.

**Regras de segurança:**
- Apenas Super Admin invoca.
- Identidade permanente por UUID; e-mail é atributo mutável.
- Nunca aplicar em utilizadores de clientes reais.

### 2. Homologação — reset de senhas
Estratégia oficial: senha fixa `Homolog@2026` aplicada via `supabase.auth.admin.updateUserById` a partir de contexto administrativo. O reset em massa não é executado automaticamente pelo sandbox (limitação documentada em KI-022); execução recomendada por painel administrativo ou script server-side com service role.

### 3. Retrocompatibilidade
Migrations desta versão são **aditivas** — nenhuma coluna existente foi removida, nenhuma policy foi afrouxada, nenhum GRANT foi revogado.

### 4. Auditoria
`time_entries_audit`, `contract_audit_events` e `financial_audit` continuam capturando todas as mutações operacionais e financeiras. RLS mantida.

### 5. Roadmap técnico
Ver seção "Roadmap Técnico Futuro" em `docs/DECISIONS.md`.

---

## Ações requeridas do Administrador

1. Validar valores padrão em `/app/empresa` (opcional, mas recomendado).
2. Comunicar aos gestores as novas hierarquias de cobrança (empresa → cliente → funcionário).
3. Coordenar reset das contas de homologação (procedimento documentado em `docs/HOMOLOGACAO_RBAC.md`).

## Notas de segurança
- Nenhum novo endpoint público foi criado.
- Nenhum novo secret é necessário.
- RLS validada em `profiles`, `clients`, `companies`, `tasks`, `time_entries`.