## Módulo Avançado de Contratos SaaS — OmniBiz Comercial

Vou expandir o módulo Comercial existente de forma **incremental e isolada**, preservando 100% das funcionalidades atuais (clientes, contratos, templates, wizard, assinatura, PDF dinâmico que já implementamos). Adicionarei o que ainda falta para chegar ao escopo Reportei-like, sem refatorar nada fora de `/app/comercial/*`.

### O que já existe e será mantido
- Tabelas: `commercial_clients`, `contract_templates`, `contracts`, `contract_services`, `contract_workflow`, `invoices`, `ai_usage` — com RLS `is_super_admin` ✅
- Rotas: dashboard, clientes, contratos, novo (wizard 5 etapas), detalhe, templates ✅
- Página pública `/sign/$token` com `contract_sign_submit` ✅
- Geração de PDF dinâmico com pdf-lib + master template ✅
- Guard `RoleGuard allow={["super_admin"]}` no layout ✅

### Lacunas a fechar (foco desta entrega)

**1. Banco — extensões mínimas (migração isolada, sem quebrar nada)**
- `commercial_clients`: + `legal_name`, `tax_id_kind` (cnpj/cpf/nif), `city`, `state`, `country`, `website`, `status` (lead/negotiation/active/inactive)
- Nova tabela `commercial_client_contacts` (id, client_id, name, role, email, phone, is_primary_signer)
- `contract_templates`: + `category`, `description`, `status` (active/draft/archived)
- `contracts`: + `title`, `billing_cycle` (monthly/quarterly/annual), `end_date`, `auto_renew`, `notice_days`, `jurisdiction`, `contract_data` jsonb (escopo/cláusulas)
- Nova tabela `contract_audit_events` (id, contract_id, actor_id, event_type, metadata, created_at) + trigger que registra criação/edição/envio/visualização/assinatura/cancelamento
- RLS `is_super_admin` em todas as novas tabelas + leitura pública limitada de audit por token

**2. Sistema de variáveis dinâmicas (expandir `contract-vars.ts`)**
- Novo dialect com namespaces: `{{organization.*}}`, `{{client.*}}`, `{{contract.*}}`, `{{today}}`
- Filtros: `| uppercase`, `| lowercase`, `| currency`, `| date`
- Helper `extractMissingVars(template, vars)` para checklist
- Preview destaca pendentes com `<mark class="bg-amber-200">{{var}}</mark>`

**3. Dashboard Comercial (substituir página atual)**
- Cards: total clientes, rascunhos, enviados, assinados, vencendo em 30d, MRR contratado, aguardando assinatura
- Lista de atividades recentes (últimos 10 audit events)

**4. Clientes — formulário completo**
- Adicionar campos novos no form
- Sub-aba "Contatos" com CRUD de `commercial_client_contacts`
- Sub-aba "Contratos vinculados" mostrando lista filtrada

**5. Templates — biblioteca com categorias + seed**
- Filtros por categoria/status
- Seed 6 templates iniciais (Assinatura SaaS, Proposta, Prestação Serviços, NDA, DPA, Renovação) com corpo Markdown e variáveis novas
- Status badge

**6. Wizard "Novo contrato" — 5 etapas (refinado)**
- Etapa 1 Cliente (existente + botão "criar rápido" inline)
- Etapa 2 Template (com descrição/categoria)
- Etapa 3 Dados comerciais: plano, valor, ciclo, início/fim, auto_renew, notice_days, jurisdição
- Etapa 4 Escopo & cláusulas: checkboxes de módulos + SLA + suporte + cláusulas opcionais (gravadas em `contract_data`)
- Etapa 5 Revisão: preview A4 + checklist de variáveis pendentes + 3 botões (salvar rascunho / gerar / enviar assinatura)

**7. Detalhe do contrato**
- Cabeçalho com badges de status (draft, in_review, approved, sent, viewed, signed, expired, cancelled)
- Preview A4 com Markdown renderizado
- Timeline de audit events
- Painel de signatários
- Ações conforme status (copiar link, reenviar, cancelar, baixar PDF)
- Registro automático de evento `viewed` quando público acessa /sign/$token

**8. Preview documento A4**
- Componente `<ContractPreviewA4>` reutilizável (formulário ↔ preview toggle)
- Renderiza Markdown via `react-markdown` (já leve), aplica `renderTemplate`, destaca pendentes
- CSS `@page A4` com margens, fonte serif

**9. Assinatura MVP — já funciona**
- Garantir registro de evento `signed` na timeline (trigger)
- Mostrar evento `viewed` quando link é aberto (RPC pública incrementa)

### Arquivos a criar/editar
- `supabase/migrations/...` — colunas + tabelas + RLS + trigger audit
- `src/lib/contract-vars.ts` — expandir com filtros e namespaces (manter retro-compat)
- `src/lib/contract-audit.ts` — helper para registrar eventos
- `src/components/contracts/ContractPreviewA4.tsx`
- `src/components/contracts/ContractTimeline.tsx`
- `src/components/contracts/StatusBadge.tsx`
- `src/routes/app.comercial.index.tsx` — dashboard com KPIs reais
- `src/routes/app.comercial.clientes.tsx` — campos novos + contatos
- `src/routes/app.comercial.contratos.tsx` — colunas/status atualizados
- `src/routes/app.comercial.contratos.$id.tsx` — preview A4 + timeline
- `src/routes/app.comercial.contratos.novo.tsx` — etapas refinadas
- `src/routes/app.comercial.templates.tsx` — categorias + status
- `src/routes/sign.$token.tsx` — registra evento viewed

### Garantias
- Nenhuma tabela existente fora do módulo é tocada
- Nenhuma rota fora de `/app/comercial/*` e `/sign/$token` é alterada
- RoleGuard + RLS `is_super_admin` em todas as superfícies (defesa em profundidade)
- Migração só adiciona colunas com defaults — zero impacto em dados existentes
- Funcionalidades atuais continuam funcionando (PDF master template, assinatura, workflow pós-assinatura)

Posso prosseguir?
