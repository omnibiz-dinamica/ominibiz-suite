## Objetivo

Tornar o fluxo de aprovação de férias configurável por empresa, cobrindo corretamente férias de gestores e introduzindo o conceito de **Owner** (proprietário interno da empresa, distinto de super_admin SaaS).

## 1. Banco de dados (migration)

### Novo papel `owner`
- Adicionar valor `owner` ao enum `app_role`.
- Owner é membro da empresa (`user_roles.company_id` preenchido), com permissões equivalentes a manager + capacidade de aprovar férias de gestores.
- Atualizar `is_company_manager` para considerar `owner` também como gestor (assim policies existentes continuam funcionando).
- Criar helper `is_company_owner(_user, _company)`.

### Configuração de RH por empresa
Nova tabela `company_hr_settings`:
- `company_id` (PK, FK companies)
- `employee_approver_kind` enum: `manager` | `supervisor` | `owner` | `specific_user` (default `manager`)
- `employee_approver_user_id` uuid (quando `specific_user`)
- `manager_approver_kind` enum: `owner` | `other_manager` | `specific_user` | `self_allowed` (default `owner`)
- `manager_approver_user_id` uuid (quando `specific_user`)

RLS: managers/owners da empresa leem e atualizam; super_admin tudo.

### Resolução de aprovador
- Adicionar coluna `assigned_approver_id` em `vacation_requests` (snapshot do aprovador resolvido na criação).
- Função `resolve_vacation_approver(_user_id, _company_id)` retorna `uuid`:
  - Detecta se o solicitante é gestor/owner ou funcionário.
  - Aplica regras das settings (fallback para manager se config faltar).
  - Funcionário nunca autoaprova; gestor só se `self_allowed`.
- Atualizar trigger `vacation_fill_context` para popular `assigned_approver_id`.
- Atualizar `vacation_decide` para permitir decisão pelo `assigned_approver_id` OU por owner OU por super_admin (não apenas `is_company_manager`).
- Atualizar `vacation_notify_insert` para notificar **apenas o aprovador resolvido** (não todos os gestores).

## 2. Frontend

### `src/routes/app.empresa.tsx` — nova seção "Configurações RH"
- Visível apenas para owner/manager.
- Dois selects:
  - Aprovador padrão (funcionários): Gestor / Supervisor / Owner / Usuário específico
  - Aprovador (gestores): Owner / Outro gestor / Usuário específico / Autoaprovação permitida
- Quando "Usuário específico": combo com membros da empresa.
- Persistir via upsert em `company_hr_settings`.

### `src/routes/app.ferias.tsx`
- Mostrar ao solicitante o nome do aprovador que receberá a solicitação (lookup após resolve).
- Lista "Pendentes" do lado aprovador: filtrar por `assigned_approver_id = auth.uid()` em vez de `isManager`.
- Cancelamento continua igual.

### `src/routes/app.equipe.tsx`
- Adicionar opção `owner` no select de papel (apenas owner/super_admin podem atribuir owner).

### `src/lib/auth.tsx`
- Tratar `owner` como manager para `isManager` (UI continua funcionando).
- Expor `isOwner`.

## 3. Notificações
- Trigger envia para `assigned_approver_id` apenas.
- Mantém evento `vacation_requested`.

## Escopo NÃO incluído (MVP)
- Workflow multi-step / cadeias com vários níveis.
- Delegação temporária / férias do próprio aprovador.
- Edição do aprovador após criação da solicitação.

Confirma para eu prosseguir com a migration + código?
