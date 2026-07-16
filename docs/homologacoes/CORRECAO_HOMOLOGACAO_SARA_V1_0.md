# Correção — Homologação Sara V1.0

**Data:** 2026-07-16
**Status final:** APROVADO COM OBSERVAÇÕES (aguarda validação Playwright dos arquivos exportados)
**Escopo:** Correções pontuais dos achados P1/P2 da homologação Sara V1.0. Nenhuma funcionalidade nova adicionada, nenhum dado operacional apagado, RBAC/RLS preservados.

---

## 1. Achados originais

| # | Sev | Descrição |
|---|-----|-----------|
| A1 | P1 | Funcionário acessa `/app/rh` por URL direta e visualiza Dashboard RH. |
| A2 | P1 | Recorrência exibe horário/duração próprios; deveria herdar do topo e usar apenas datas. |
| A3 | P2 | Separadores do editor de colaborador aparecem como "RH" / "Docs". |
| A4 | P2 | Gestor clica em "Recibos" e cai no Dashboard RH em vez da gestão de recibos. |
| A5 | Obs | Exportações Excel/PDF acionadas sem erro visual, sem inspeção do conteúdo. |

---

## 2. Causa raiz e correção

### A1 — `/app/rh` sem guarda de rota

**Causa:** `src/routes/app.rh.tsx` era um leaf sem `RoleGuard`; a proteção existia apenas por omissão no menu.

**Correção:**
- Renomeado `src/routes/app.rh.tsx` → `src/routes/app.rh.index.tsx` (Dashboard RH inalterado).
- Novo `src/routes/app.rh.tsx` implementa layout com `<Outlet />` e `RoleGuard allow={["manager","owner","super_admin"]}`. Toda a subárvore `/app/rh/*` herda o guard.
- RLS das tabelas RH permanece inalterado (defesa em profundidade); a correção não relaxou políticas.

### A2 — Recorrência com horário/duração próprios

**Causa:** `RecurrenceForm` renderizava campos `scheduledTime` e `durationMinutes` como se fossem independentes do topo do formulário de tarefa.

**Correção:**
- `RecurrenceForm` agora exibe **apenas Data inicial / Data final**, tanto para clientes `start_stop` quanto `manual`.
- Em `app.tarefas.tsx`, o submit deriva:
  - `scheduled_time` de `scheduledFor` (HH:MM) para `start_stop`; `"00:00"` para `manual`.
  - `duration_minutes` = `(scheduled_end − scheduled_for)` para `start_stop`; `0` para `manual`.
- `formatDuration()` passou a retornar sempre `HH:MM`.

### A3 — Rótulos "RH" / "Docs"

**Correção:** em `EmployeeEditor.tsx`, `TabsTrigger` "RH" → "Contabilidade/RH" e "Docs" → "Documentos". Nenhuma alteração de rota, migration, RPC ou nome técnico.

### A4 — Gestor cai no Dashboard RH ao clicar em Recibos

**Causa:** com `app.rh.tsx` sendo leaf, TSR tratava `app.rh.recibos.tsx` como filho de `/app/rh`, mas o parent não renderizava `<Outlet />` — a URL `/app/rh/recibos` acabava exibindo o Dashboard RH.

**Correção:** ver A1 — o novo layout `app.rh.tsx` monta `<Outlet />`, e `/app/rh/recibos` renderiza a página `PayslipsAdminPage`.

### A5 — Exportações

Sem alteração de código. Requer validação Playwright dos artefatos (`.xlsx` e `.pdf`) para promoção final a APROVADO.

---

## 3. Auditoria complementar (defesa em profundidade)

`src/routes/app.frota.cartoes.tsx` recebeu `RoleGuard` (gestor/owner/super admin) — cartões de combustível deixam de ser acessíveis a funcionários por URL direta.

### Matriz Rota × Papel

| Rota | Funcionário | Gestor | Owner | Super Admin |
|---|---|---|---|---|
| `/app/rh` | ❌ redirect `/app` | ✅ | ✅ | ✅ |
| `/app/rh/recibos` | ❌ redirect `/app` | ✅ | ✅ | ✅ |
| `/app/equipe` | ❌ | ✅ | ✅ | ✅ |
| `/app/empresa` | ❌ | ✅ | ✅ | ✅ |
| `/app/admin` | ❌ | ❌ | ❌ | ✅ |
| `/app/ponto_/gestao` | ❌ | ✅ | ✅ | ✅ |
| `/app/clientes` | ❌ | ✅ | ✅ | ✅ |
| `/app/comercial(...)` | ❌ | ❌ | ❌ | ✅ |
| `/app/frota/cartoes` | ❌ | ✅ | ✅ | ✅ |
| `/app/meus-recibos` | ✅ (próprios) | ✅ | ✅ | ✅ |
| `/app/despesas` | ✅ (próprios) | ✅ (empresa) | ✅ | ✅ |

RLS e RPCs `SECURITY DEFINER` continuam sendo a barreira final; o RoleGuard evita apenas o carregamento da tela.

---

## 4. Arquivos alterados

- `src/routes/app.rh.tsx` (novo layout com guard)
- `src/routes/app.rh.index.tsx` (renomeado a partir de `app.rh.tsx`)
- `src/routes/app.frota.cartoes.tsx` (RoleGuard adicionado)
- `src/components/tasks/RecurrenceForm.tsx` (remove horário/duração)
- `src/components/tasks/EditRecurrenceDialog.tsx` (remove escopo "toda a série")
- `src/routes/app.tarefas.tsx` (deriva horário/duração do topo)
- `src/lib/tasks.ts` (`formatDuration` → HH:MM)
- `src/components/equipe/EmployeeEditor.tsx` (rótulos)
- `docs/CHANGELOG.md`
- `docs/KNOWN_ISSUES.md`

Migrations: **nenhuma**. Nenhuma alteração de schema, RLS ou RPC.

---

## 5. Riscos residuais

- Exportações Excel/PDF aguardam validação end-to-end via Playwright (A5).
- `RecurrenceFormValue.scheduledTime` / `durationMinutes` continuam no state para compatibilidade — os valores gravados vêm do topo do formulário no submit; a UI não os expõe.

---

## 6. Classificação final

**APROVADO COM OBSERVAÇÕES** — todos os achados P1/P2 resolvidos; A5 pendente de validação binária dos artefatos exportados.