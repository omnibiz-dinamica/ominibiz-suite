
# RH → Recibos de Pagamento (MVP)

Foco: distribuição segura de recibos já existentes (PDF). Sem cálculo de folha.

---

## 1. Schema (migration)

### 1.1 Bucket de storage
```sql
insert into storage.buckets (id, name, public)
values ('payslips', 'payslips', false);
```
Path convention: `payslips/{company_id}/{user_id}/{yyyy}-{mm}/{uuid}.pdf`

### 1.2 Tabela `payslips`
```sql
create type payslip_status as enum (
  'unassigned',   -- upload sem funcionário associado
  'assigned',     -- associado ao funcionário, não enviado
  'sent',         -- email enviado
  'failed',       -- envio falhou
  'archived'
);

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid,                       -- null = não associado
  uploaded_by uuid not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null default 'application/pdf',
  size_bytes bigint,

  -- metadados extraídos (parser)
  period_year int,                    -- ex.: 2026
  period_month int,                   -- 1..12
  employee_name_detected text,
  gross_amount numeric(12,2),
  net_amount numeric(12,2),
  parse_confidence numeric(3,2),      -- 0..1
  parse_raw jsonb default '{}'::jsonb,

  status payslip_status not null default 'unassigned',

  -- entrega por email
  email_to text,
  email_sent_at timestamptz,
  email_delivery_status text,         -- queued|sent|delivered|bounced|failed
  email_opened_at timestamptz,        -- estrutura preparada (tracking futuro)
  email_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.payslips(company_id, period_year desc, period_month desc);
create index on public.payslips(company_id, user_id);
create index on public.payslips(company_id, status);
```

### 1.3 Tabela `payslip_email_events` (auditoria)
```sql
create table public.payslip_email_events (
  id uuid primary key default gen_random_uuid(),
  payslip_id uuid not null,
  company_id uuid not null,
  event text not null,                -- queued|sent|delivered|bounced|opened|failed
  detail jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

### 1.4 GRANTs + RLS

**payslips**
- `GRANT SELECT, INSERT, UPDATE, DELETE ON public.payslips TO authenticated`
- `GRANT ALL ON public.payslips TO service_role`

Policies:
- `employee view own payslips` SELECT — `user_id = auth.uid() AND status IN ('assigned','sent')`
- `managers manage company payslips` ALL — `is_company_manager(auth.uid(), company_id)`
- `super admin all payslips` ALL — `is_super_admin(auth.uid())`

**payslip_email_events**
- SELECT manager + super_admin; INSERT só via RPC (sem policy authenticated).

**storage.objects (bucket `payslips`)**
- `payslips manager write` INSERT/UPDATE/DELETE — `bucket_id='payslips' AND is_company_manager(auth.uid(), (foldername(name))[1]::uuid)`
- `payslips employee read own` SELECT — `bucket_id='payslips' AND ((foldername(name))[2] = auth.uid()::text OR is_company_manager(auth.uid(), (foldername(name))[1]::uuid))`
- `payslips super admin all` ALL — `is_super_admin(auth.uid())`

---

## 2. RPCs (SECURITY DEFINER)

### 2.1 `payslip_assign(_id uuid, _user_id uuid)`
- Valida manager da company do payslip.
- Move/renomeia o objeto no storage para o path do user_id.
- UPDATE `user_id`, `status='assigned'`, `email_to = profiles.email`.

### 2.2 `payslip_mark_sent(_id uuid, _status text, _detail jsonb)`
- Chamada pelo server fn de envio.
- UPDATE `email_sent_at`, `email_delivery_status`, `status='sent'|'failed'`.
- INSERT em `payslip_email_events`.

### 2.3 `payslip_dashboard_counts(_company_id uuid)`
- Retorna `{ unassigned, assigned, sent, failed, total }` para o gestor.

---

## 3. Server functions (TanStack `createServerFn`)

Todas em `src/lib/payslips.functions.ts` com `requireSupabaseAuth`.

- `uploadPayslip({ file })` — upload temporário em `unassigned/` + parse + retorna draft.
  - Multiplos PDFs: cliente chama em paralelo.
- `parsePayslipText(text)` — heurística (regex):
  - Período: meses PT (`janeiro|fev|...`) + ano `20\d{2}`.
  - Nome: linhas após "Nome", "Funcionário", "Colaborador".
  - Valores: `Líquido a receber`, `Total líquido`, `Vencimento bruto`.
  - Retorna `parse_confidence` baseado em quantos campos foram encontrados.
- `matchEmployee({ name, companyId })` — fuzzy match em `profiles.full_name` da company; retorna sugestões top-3.
- `assignPayslip({ id, userId })` → RPC 2.1.
- `sendPayslipEmail({ id })` — usa Lovable Emails (Resend conector OK quando configurado); registra eventos via RPC 2.2.
- `bulkSendPayslips({ companyId, period })`.
- `listMyPayslips()` — funcionário (RLS já filtra).
- `listCompanyPayslips({ filters })` — gestor.
- `dashboardCounts({ companyId })`.

**Parser PDF**: usar `pdfjs-dist` (Worker-compatible) em server fn; extrair texto com `getTextContent()`. OCR/imagens ficam fora desta fase (estrutura `mime_type` permite, mas parser só atua em `application/pdf`).

---

## 4. UI

### 4.1 Gestor — `/app/rh/recibos`
- Header: dashboard cards (processados, pendentes, não associados, enviados, falhados).
- Tabs: `Não associados` · `Associados` · `Enviados` · `Falhas`.
- Botão **Upload** (drop zone, multi-PDF).
- Tabela:
  - Período · Funcionário detectado · Sugestão (com confirmar/alterar) · Valor líquido · Status · Ações (`Atribuir`, `Enviar`, `Baixar`, `Excluir`).
- Drawer "Atribuir": combobox de funcionários da empresa + preview do PDF.
- Ação em lote: `Enviar selecionados`.

### 4.2 Funcionário — `/app/meus-recibos`
- Lista cards por ano agrupado, com filtro `Mês` / `Ano` / `Status`.
- Botão **Baixar PDF** (signed URL 5 min).
- Badge "Enviado por email em DD/MM".

### 4.3 Menu (`AppLayout`)
- Manager menu: novo item **Recibos** (ícone `Receipt`) → `/app/rh/recibos`.
- Employee menu: novo item **Meus recibos** → `/app/meus-recibos`.

---

## 5. Email

- Provedor padrão: **Lovable Emails** (built-in). Fallback: conector Resend se já configurado.
- Template: assunto `Recibo de vencimento — {mês}/{ano}`, corpo com link signed URL (7 dias) + anexo PDF (se < 8MB).
- Tracking: `email_opened_at` preparado; webhook de open/bounce fora do MVP (estrutura `payslip_email_events` já aceita).

---

## 6. Arquivos

**Novos**
- `supabase/migrations/<ts>_payslips.sql`
- `src/lib/payslips.functions.ts`
- `src/lib/payslip-parser.ts`
- `src/routes/app.rh.recibos.tsx`
- `src/routes/app.meus-recibos.tsx`
- `src/components/payslips/UploadDropzone.tsx`
- `src/components/payslips/PayslipTable.tsx`
- `src/components/payslips/AssignDrawer.tsx`
- `src/components/payslips/DashboardCards.tsx`

**Editados**
- `src/components/AppLayout.tsx` (menus)
- `src/integrations/supabase/types.ts` (auto)

---

## 7. Fora de escopo (próximas fases)
- OCR de imagens (jpg/png) — estrutura pronta, parser não atua.
- Cálculo de folha / impostos.
- Assinatura digital do recibo pelo funcionário.
- Webhook de open/bounce do provedor de email.
- Notificação in-app quando recibo chega (pode entrar — confirmar).

---

## Decisões necessárias antes de implementar

1. **Provedor de email**: usar Lovable Emails (default) ou Resend (se já há conector)?
2. **Anexar PDF no email** ou enviar apenas link signed URL?
3. **Notificação in-app** ao funcionário quando recibo é publicado (sim/não)?
4. **Retenção**: manter recibos indefinidamente ou arquivar após N meses?
