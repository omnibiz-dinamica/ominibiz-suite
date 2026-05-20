## Módulo Comercial & Gestão de Contratos (Super Admin)

Vou implementar um módulo grande e novo. Antes de codar, confirmo escopo e divisão em fases para garantir entrega utilizável.

### Escopo confirmado
- Acesso restrito a **super_admin** (rota `/app/comercial/*` com `RoleGuard`).
- 7 tabelas novas: `commercial_clients`, `contracts`, `contract_templates`, `contract_services`, `contract_workflow`, `invoices`, `ai_usage`.
  - Uso prefixo `commercial_clients` para não colidir com a tabela `clients` existente (que pertence à operação de cada empresa).
- Wizard de criação de contrato (5 passos), lista, dashboard comercial.
- Templates com variáveis `{{company_name}}`, `{{nif}}`, `{{plan_name}}`, `{{monthly_fee}}`, `{{credits_limit}}`, `{{services}}`.
- Geração de PDF (client-side via jsPDF) com armazenamento em Supabase Storage (bucket `contracts`).
- Fluxo de assinatura digital via URL pública assinada (`/sign/$token`) com captura de IP, user-agent, timestamp, hash SHA-256.
- Ao assinar → criar automaticamente 7 tarefas de onboarding em `contract_workflow`.
- Dashboard analítico: MRR, contratos ativos/pendentes, taxa conversão, serviços mais vendidos.

### Banco (1 migration)
- Enums: `contract_status` (draft, sent, signed, implementation, promo_period, active, suspended, cancelled), `workflow_step_status`, `invoice_status`.
- `commercial_clients`: razão social, NIF, email, telefone, endereço, contacto, criado_por.
- `contract_templates`: nome, corpo (markdown com variáveis), versão, ativo.
- `contracts`: client_id, template_id, plan_name, monthly_fee, credits_limit, promo_months, start_date, status, signed metadata (ip, user_agent, hash, signed_at, signer_name), pdf_path, sign_token, sign_expires_at.
- `contract_services`: contract_id, service (enum: whatsapp, instagram, website, dashboard, ai_support, reports, scheduling), config jsonb.
- `contract_workflow`: contract_id, step (enum 7 passos), status, assigned_to, due_at, completed_at, notes.
- `invoices`: contract_id, amount, due_date, paid_at, status, reference.
- `ai_usage`: contract_id, month, credits_used, cost.
- Trigger `contracts_after_signed` → cria os 7 passos de workflow.
- RLS: tudo restrito a `is_super_admin(auth.uid())`. `contracts` tem policy adicional **pública por sign_token** (SELECT/UPDATE limitada) via RPC `contract_sign_get(token)` + `contract_sign_submit(token, signer_name, signature_data_url)` (security definer).
- Bucket storage `contracts` (privado) com policies para super_admin.

### Frontend
- `src/routes/app.comercial.tsx` (layout com sub-nav + RoleGuard super_admin) + Outlet.
- `src/routes/app.comercial.index.tsx` (dashboard).
- `src/routes/app.comercial.clientes.tsx` (lista + criar/editar em dialog).
- `src/routes/app.comercial.contratos.tsx` (lista com status badges + ações: ver, copiar link assinatura, baixar PDF, marcar implementation/active, suspender).
- `src/routes/app.comercial.contratos.novo.tsx` (wizard 5 passos com `useState` por etapa + `Stepper`).
- `src/routes/app.comercial.templates.tsx` (CRUD de templates).
- `src/routes/app.comercial.contratos.$id.tsx` (detalhe + workflow checklist + faturas).
- `src/routes/sign.$token.tsx` (rota PÚBLICA — sem AppLayout — exibe contrato renderizado + canvas de assinatura + confirmação).
- Adicionar item "Comercial" no menu visível só para super_admin.

### PDF
- `src/lib/contract-pdf.ts`: usa `jspdf` para renderizar template processado em PDF; upload ao bucket `contracts` via `supabase.storage.from('contracts').upload(...)`.
- `src/lib/contract-vars.ts`: substituição de variáveis + helper de moeda EUR.

### Assinatura
- `signature_pad` (lib leve) para canvas; submete dataURL para RPC `contract_sign_submit` que calcula hash, marca `signed`, dispara trigger de workflow.
- IP capturado via `request_ip` no RPC (`inet_client_addr()`).

### Fases de entrega
1. **Migration** (tabelas, enums, RLS, RPCs, bucket, trigger workflow).
2. **Tipos + rotas base**: layout `/app/comercial` + clientes + templates.
3. **Wizard de contrato + listagem + dashboard**.
4. **PDF + página pública de assinatura `/sign/$token`**.
5. **Workflow de onboarding (UI) + faturas básicas + ai_usage placeholder**.

### Fora do escopo MVP (para não inflar)
- Envio de e-mail real do contrato (apenas botão "copiar link de assinatura").
- Cobrança automática / integração Stripe nas invoices (apenas registo manual).
- Editor rich-text de templates (apenas textarea com preview de variáveis).
- Métricas IA reais (registo manual em `ai_usage`).

Confirmas para eu seguir com a migration + implementação completa nas 5 fases?