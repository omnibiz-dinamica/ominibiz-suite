# Plano — Atualizações Operacionais V1.0

Escopo grande — execução faseada. Cada fase é atômica e verificável.

## Fase A · Fundações de banco (esta fase)

1. `clients.timing_mode` (`start_stop` | `manual`) — ADR-008 alinhado.
2. `clients.monthly_rate numeric` — complemento a `billing_mode`.
3. `companies.default_hourly_rate|default_fixed_rate|default_monthly_rate`.
4. `profiles.manual_monthly_rate` — override do funcionário.
5. RPC `public.admin_release_user_identity(_user_id uuid)` SECURITY DEFINER:
   - remove `user_roles`
   - limpa `profiles.current_company_id` + `company_id_primary`
   - `profiles.is_active=false`
   - revoga convites `pending` do email atual
   - renomeia `auth.users.email` → `retired+<uuid>@homologacao.invalid` e sincroniza `auth.identities.identity_data->>'email'`
   - PRESERVA todo histórico operacional (tarefas, ponto, geo, férias, despesas, notificações, contratos, recibos, uploads, auditoria)
   - Apenas Super Admin pode invocar
   - Idempotente (chama de novo é no-op)
   - Identidade sempre por UUID (email é atributo)

## Fase B · UI Clientes (billing_mode + timing_mode)

Editor de cliente em `app.clientes.tsx`:
- Radio "Modo de apontamento" (Start/Stop | Manual).
- Radio "Forma de cobrança" (Hora | Valor Fixo | Mensal).
- Campos condicionais: `hourly_rate` / `fixed_rate` / `monthly_rate`.

## Fase C · UI Empresa (valores padrão)

Card "Valores padrão" em `app.empresa.tsx` (RoleGuard manager/owner/super_admin).

## Fase D · UI Funcionário (overrides)

`EmployeeEditor.tsx` — seção "Sobrescrever valores" com hora/fixo/mensal.

## Fase E · Recorrência

`RecurrenceForm.tsx`:
- Se cliente `timing_mode='manual'` → esconder horário/duração; exigir só datas.
- Se `start_stop` → usar HH início/fim já preenchidos no topo (não duplicar).
`EditRecurrenceDialog.tsx` — mantém escopo "esta/futuras/todas" (já existe).

## Fase F · Dashboard

`app.index.tsx` — cards Pendentes/Andamento/Concluídas/Atrasadas ligam a `/app/tarefas?status=<x>`; `app.tarefas.tsx` lê `?status=` e aplica.
Seletor Funcionário no topo do dashboard e das tarefas usando `<EmployeePicker />`.

## Fase G · EmployeePicker universal

Rollout de `<EmployeePicker />` (already em `src/components/common/`) para Ponto, RH, Férias, Despesas, Recibos, Comercial — como filtro de listagem.

## Fase H · Homologação — senhas

Não é possível ler senhas do auth.users (hash). Estratégia:
- Listar todos os utilizadores homologação (`@homologacao` ou empresas de teste).
- Resetar via `supabase.auth.admin.updateUserById` com senha fixa `Homolog@2026`.
- Entregar relatório CSV em `/mnt/documents/`.

## Fase I · Documentação

`docs/ATUALIZACOES_OPERACIONAIS_V1_0.md` + PDF (`reportlab`) em `docs/` e `/mnt/documents/`.
Atualizar CHANGELOG.md, DECISIONS.md (ADR-016 Liberação de Identidade, ADR-017 Herança de valores), KNOWN_ISSUES.md.

## Diretriz permanente

UUID = identidade. Email = atributo. Todas as novas RPCs recebem UUID.