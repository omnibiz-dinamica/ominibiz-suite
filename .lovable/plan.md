## Bloco 1 — Gestão operacional de Folha de Ponto (desenho técnico)

Apenas desenho. Nenhum código será escrito até aprovação.

---

### 1. Schema (migration)

#### 1.1 `time_entries` — colunas novas
```sql
ALTER TABLE public.time_entries
  ADD COLUMN created_by    uuid,                          -- quem criou o registro
  ADD COLUMN origin        text NOT NULL DEFAULT 'employee_punch'
             CHECK (origin IN ('employee_punch','manager_manual','manager_correction')),
  ADD COLUMN last_edited_by    uuid,
  ADD COLUMN last_edited_at    timestamptz,
  ADD COLUMN last_edit_reason  text;
```
- `user_id` (já existe) = funcionário dono do ponto
- `created_by` é novo; backfill: `UPDATE ... SET created_by = user_id` para registros existentes
- `origin = 'employee_punch'` para tudo que já existe

#### 1.2 Nova tabela `time_entries_audit`
```sql
CREATE TABLE public.time_entries_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id   uuid NOT NULL,            -- referência lógica (sem FK p/ permitir DELETE futuro)
  company_id      uuid NOT NULL,            -- denormalizado p/ RLS rápida
  action          text NOT NULL CHECK (action IN ('create','update','delete')),
  changed_by      uuid NOT NULL,            -- auth.uid() do gestor
  changed_at      timestamptz NOT NULL DEFAULT now(),
  reason          text NOT NULL,            -- justificativa obrigatória
  changes         jsonb NOT NULL DEFAULT '{}'::jsonb
    -- formato: { "field": { "old": <v>, "new": <v> }, ... }
);
CREATE INDEX ON public.time_entries_audit (time_entry_id, changed_at DESC);
CREATE INDEX ON public.time_entries_audit (company_id, changed_at DESC);
ALTER TABLE public.time_entries_audit ENABLE ROW LEVEL SECURITY;
```

#### 1.3 Enum `punch_admin_action` — não precisa, usamos `text` com CHECK.

---

### 2. RPCs (SECURITY DEFINER, search_path = public)

Toda mutação de gestor passa por RPC. RLS direta em `time_entries` continua bloqueando UPDATE/INSERT pelo cliente — só super_admin escreve direto. Isso garante que **nada** edita silenciosamente sem audit.

#### 2.1 `punch_admin_create(_payload jsonb, _reason text) → time_entries`
- Valida: `auth.uid()` é manager da empresa-alvo (`is_company_manager`) **ou** super_admin
- Valida: `_reason` ≥ 5 chars
- Valida: `user_id` informado é membro da `company_id`
- Valida: `started_at <= ended_at`, intervalos coerentes
- Calcula `effective_minutes` via `effective_minutes_round`
- INSERT em `time_entries` com `origin='manager_manual'`, `created_by=auth.uid()`, `last_edited_by=auth.uid()`, `last_edit_reason=_reason`
- INSERT em `time_entries_audit` action=`create`, `changes` = snapshot inicial

#### 2.2 `punch_admin_update(_id uuid, _payload jsonb, _reason text) → time_entries`
- Permissão idem
- `_reason` obrigatório
- Carrega linha atual `FOR UPDATE`
- Para cada campo presente em `_payload` (whitelist: `started_at, paused_at, resumed_at, ended_at, effective_minutes, notes`), monta diff `{ field: { old, new } }`
- Se nenhum diff real → raise `'Nada a alterar'`
- Recalcula `effective_minutes` automaticamente se as bases mudaram **e** o gestor não enviou override explícito
- UPDATE em `time_entries` + seta `last_edited_by/at/reason` e `origin='manager_correction'` se ainda era `employee_punch`
- INSERT audit action=`update`, `changes` = diff calculado

#### 2.3 `punch_audit_list(_time_entry_id uuid) → SETOF time_entries_audit`
- STABLE SECURITY DEFINER
- Retorna apenas se `is_company_manager(auth.uid(), company_id)` ou super_admin

> **Sem DELETE** nesta fase. Correção é UPDATE; remoção de ponto inválido é assunto separado.

---

### 3. RLS

#### 3.1 `time_entries` — manter o que existe + acrescentar
Atual (somente leitura): user vê os próprios, manager vê da empresa, super_admin tudo.

Acréscimo:
```sql
-- Gestor escreve via RPC (SECURITY DEFINER bypassa RLS); manter UPDATE/INSERT
-- bloqueados na RLS para forçar passagem pelas RPCs auditadas.
-- Nenhuma policy nova de UPDATE/INSERT para 'authenticated' role.
```
Resultado prático: funcionário continua sem conseguir editar. Gestor só consegue editar via `punch_admin_update`. Super_admin continua com policy ALL.

#### 3.2 `time_entries_audit`
```sql
CREATE POLICY "managers view company audit"
  ON public.time_entries_audit FOR SELECT TO authenticated
  USING (is_company_manager(auth.uid(), company_id));

CREATE POLICY "super admin audit all"
  ON public.time_entries_audit FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
```
INSERT só via RPC (SECURITY DEFINER) — nenhuma policy de INSERT para `authenticated`.

#### 3.3 Validação em RPC (defense-in-depth)
Mesmo sendo SECURITY DEFINER, toda RPC valida `is_company_manager` explicitamente e nunca confia em `company_id` vindo do payload — sempre deriva do registro existente (update) ou valida pertencimento (create).

---

### 4. UI

#### 4.1 Nova rota
`src/routes/app.ponto.gestao.tsx` → `/app/ponto/gestao`
- Protegida por `RoleGuard allow={['manager','owner','super_admin']}`
- Link adicionado no menu lateral (`AppLayout`) — só visível para gestor
- Página `/app/ponto` (funcionário) permanece intocada

#### 4.2 Layout
```
┌─ Folha de Ponto · Gestão ─────────────────────────────── [+ Adicionar ponto] ┐
│ Filtros (sticky)                                                              │
│   [Funcionário ▾] [Período ▾]  [Status ▾]  [Cliente ▾]  [Buscar tarefa ⌕]   │
│   [Limpar]                                              Total: 482 registros  │
├───────────────────────────────────────────────────────────────────────────────┤
│ Tabela                                                                        │
│  Func.      Tarefa            Início        Fim         Pausa  Efetivo  ⚙    │
│  ─────────  ───────────────   ────────────  ──────────  ─────  ───────  ──   │
│  Ana S.     Limpeza loja A    24/05 09:02   24/05 12:30  15m   3h 13m   ⋯    │
│  ...                                                                          │
├───────────────────────────────────────────────────────────────────────────────┤
│ ◀ Página 1 de 10 ▶                                       Por página: [50 ▾]  │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **Tabela**: virtualizada/paginada server-side, 50 linhas/página, ordenada por `started_at DESC`
- **Coluna ⚙** → menu: `Editar`, `Histórico`, `Marcar como manual` (apenas se origin=employee_punch)
- **Badge** mostrando `origin` quando ≠ `employee_punch` (ex.: chip âmbar "manual")

#### 4.3 Drawer "Adicionar ponto" (lateral, não modal central)
- Funcionário (select, membros da empresa)
- Tarefa (combobox com busca, filtrada por funcionário+empresa)
- Início (datetime-local) · Fim (datetime-local opcional)
- Pausa início · Pausa fim (opcionais)
- Notas (textarea)
- **Motivo (obrigatório, mínimo 5 chars)** — input destacado
- Cálculo de "Efetivo" em tempo real (preview client-side)
- Botão `Criar registro`

#### 4.4 Drawer "Editar ponto"
- Mesmos campos, pré-preenchidos
- Cabeçalho mostra `origin`, `created_by`, `last_edited_by/at`
- **Motivo obrigatório** a cada save
- Diff preview antes do submit: "Você está alterando: ended_at: 12:30 → 12:45"
- Botão `Aplicar correção` → chama `punch_admin_update`

#### 4.5 Drawer "Histórico" (aba ou drawer separado)
- Lista cronológica reversa de `time_entries_audit` daquele registro
- Cada item: ícone (create/update), `changed_at`, `changed_by` (nome via profiles), `reason`, lista de campos alterados com old → new
- Read-only

#### 4.6 Fluxo rápido (UX)
- Atalho `N` abre drawer "Adicionar"
- Atalho `E` edita linha focada
- Filtros persistidos em URL search params (`?user=...&from=...&to=...&status=...&page=...`) → compartilhável e recarregável
- Toast de sucesso com link "Desfazer" → abre histórico (não desfaz automaticamente, conforme política de auditoria)

#### 4.7 Queries (TanStack Query)
- `["punch-admin-list", filters, page]` — `time_entries` + joins (`tasks(title, client_id)`, `profiles!user_id(full_name)`, `clients(name)`), count exato
- `["punch-admin-members", companyId]` — opções do filtro funcionário
- `["punch-admin-clients", companyId]` — opções do filtro cliente
- `["punch-audit", entryId]` — sob demanda quando histórico abre
- Invalidação após mutate cobre lista + audit

---

### 5. Arquivos

**Novos**
- `supabase/migrations/<ts>_punch_admin_audit.sql` — itens 1.1, 1.2, 2.1–2.3, 3.2
- `src/routes/app.ponto.gestao.tsx` — página
- `src/components/ponto/PunchFilters.tsx`
- `src/components/ponto/PunchTable.tsx`
- `src/components/ponto/PunchEditorDrawer.tsx` (create + edit, modo controlado por prop)
- `src/components/ponto/PunchAuditDrawer.tsx`
- `src/lib/punch-admin.ts` — wrappers tipados das RPCs + tipos

**Editados**
- `src/components/AppLayout.tsx` — adicionar item de menu "Folha de Ponto · Gestão" (manager+)
- `src/integrations/supabase/types.ts` — regenerado automaticamente após migration

---

### 6. Itens fora de escopo nesta fase
- Exportação CSV/PDF (próxima iteração)
- Bulk edit
- DELETE de pontos (apenas correção via UPDATE)
- Justificativa do funcionário ao admitir alteração (visto/ack)
- Notificação ao funcionário quando seu ponto é editado (pode entrar agora se quiser — confirmar)

---

Aprovação necessária para:
1. Confirmar nome/rota: `/app/ponto/gestao` ok? (alternativa: `/app/folha-ponto`)
2. Confirmar política "sem DELETE nesta fase"
3. Confirmar se devemos **notificar o funcionário** quando seu ponto for editado pelo gestor (uma linha extra no trigger/RPC)
