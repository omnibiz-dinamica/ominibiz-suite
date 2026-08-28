# OmniBiz - Auditoria Tecnica de Prontidao Multi-Ramo

**Data:** 2026-08-28  
**Execucao:** Codex  
**Modo:** somente leitura / diagnostico  
**Nota global:** **62/100**

`docs/ARCHITECTURE_MULTI_VERTICAL.md` nao existe nesta copia; foram usados `ARCHITECTURE_INDEX.md`, `ARCHITECTURE_PRINCIPLES.md`, `ARCHITECTURE_RBAC.md`, `DECISIONS.md`, `KNOWN_ISSUES.md`, `CHANGELOG.md` e a documentacao especifica encontrada.

## Resumo executivo

O OmniBiz ja tem um Core operacional real, com tenancy por `company_id`, RBAC, RLS, tarefas, recorrencias, start/stop, geofencing, ferias, despesas, suporte e fechamento mensal. A arquitetura de menu ja separa vertical e modulos com `business_vertical`, `enabled_modules`, `MODULE_CATALOG` e `ModuleGuard`.

Ele ainda nao esta pronto para centenas de empresas de varios ramos sem trabalho arquitetural adicional. Restaurante e Material de Construcao existem como catalogo de rotas e placeholders, mas nao como dominios de dados. Hotelaria e Oficina estao apenas preparados como valores de vertical. O Comercial SaaS e global/Super Admin-only e nao possui chave tenant.

## Estado live confirmado

| Empresa | Vertical | Modulos ativos observados |
|---|---|---:|
| OMNIBIZ TESTES | cleaning_services | 23; inclui todos os modulos de Material |
| Grupo V-clean | restaurant_delivery | 12 gerais; nenhum `restaurant_*` |
| OMNIBIZ DRYRUN 1783762885 | cleaning_services | 8 |
| Dinâmica Solução | restaurant_delivery | 8 |

Consultas live tambem confirmaram: 23 profiles, 25 clients, 168 time entries, 19 vacation requests, 14 expenses, 117 support tickets, 55 task recurrences, 376 geopoints, 0 photos, 112 ticket messages, 93 ticket attachments e 408 ticket events. `domain_events` e `company_billing_modules` nao foram encontrados; `company_hr_settings` existe, mas SELECT direto retornou `42501`.

## Matriz executiva

| Dominio | Status | Evidencia | Risco | Proximo passo |
|---|---|---|---|---|
| Multi-tenant | 🟡 INCOMPLETO | `company_id`, memberships e contexto ativo existem | relacoes sem FK composto | matriz cross-tenant automatizada |
| RLS | 🟡 INCOMPLETO | migrations habilitam RLS e policies no Core | introspeccao live limitada; base HR tem grant diferente | catalogo SQL administrativo |
| RBAC | 🟢 PRONTO | `user_roles`, `effectiveRole`, RoleGuard, RPCs | duplicidade historica registrada | corrigir constraint de role em janela propria |
| Core | 🟢 PRONTO | tarefas, ponto, RH, suporte e despesas live | N+1/paginacao nao medidos em carga | testes com massa de dados |
| Menu dinamico | 🟢 PRONTO | `resolveAvailableNavigation` centralizado | verticais podem ter dados incoerentes | validar empresa x modulos |
| ModuleGuard | 🟡 INCOMPLETO | Material protegido; Restaurante sem guard | URL direta no Restaurante | adicionar guard antes de dados reais |
| Limpeza | 🟢 PRONTO | tasks, clients, recurrence, ponto, GPS, despesas | escalas/calendario avancado limitado | consolidar calendario/equipes |
| Restaurante | 🔴 INEXISTENTE | 8 rotas `ComingSoon`, sem tabelas | vertical nao opera | modelar dominio e entregar fase por fase |
| Material de Construcao | 🔴 INEXISTENTE | 11 rotas `ComingSoon`, sem tabelas | vertical nao opera | catalogo, estoque e vendas |
| Hotelaria | 🔴 INEXISTENTE | sem rotas/tabelas | futuro sem contrato | modelar property/room/reservation |
| Oficina | 🔴 INEXISTENTE | sem rotas/tabelas | futuro sem OS/veiculos de clientes | modelar asset/OS/parts/labor |
| Estoque | 🔴 INEXISTENTE | nao ha tabelas de stock/produtos | nenhum vertical consegue baixar insumo | dominio comum de estoque |
| Financeiro | 🟡 INCOMPLETO | expenses, audit e contracts/invoices SaaS | invoice nao tenant-owned | separar financeiro operacional e billing |
| RH | 🟢 PRONTO | profiles, vacations, point, payslips, timesheet | `company_hr_settings` acesso direto | padronizar view/RPC |
| Suporte | 🟢 PRONTO | ticket, mensagens, anexos, eventos e dedup | leitura de anexo sem evento proprio | completar auditoria |
| Automacao | 🟡 INCOMPLETO | email queue, WhatsApp, realtime | sem `domain_events` live | publicar eventos transacionais |
| Auditoria | 🟡 INCOMPLETO | audits por dominio existem | cobertura nao e central e domain_events ausente | catalogo de eventos e retenção |
| Escalabilidade | 🟡 INCOMPLETO | indices importantes existem | selects/listas e realtime ainda sem benchmark | carga 100/1000 empresas |

## Core universal

### Dashboard

🟡 **INCOMPLETO.** O dashboard tem KPIs, links e contexto de empresa; nao foi encontrado mecanismo de materializacao ou benchmark para grandes volumes. A busca live mostra que a base ja tem pelo menos 1000 tasks/roles/notifications nos limites consultados.

### CRM/Clientes

🟡 **INCOMPLETO.** `clients` e operacional e tenant-scoped. O dominio `commercial_clients` e outra tabela, sem `company_id`, com policies exclusivas do Super Admin. Contatos/oportunidades nao formam ainda um CRM multi-tenant completo.

### Financeiro

🟡 **INCOMPLETO.** Despesas e auditoria existem com decisao por RPC. Billing SaaS tem `contracts`/`invoices`, mas como backoffice global. Nao foi encontrado faturamento recorrente tenant-owned, contas a pagar/receber operacional ou relatorio financeiro completo.

### RH

🟢 **PRONTO** para o escopo atual de colaboradores, ferias, ponto, geofencing, recibos e fechamento. E 🟡 **INCOMPLETO** para folha salarial completa, pois nao foram encontradas tabelas de calculo de folha/pagamentos; `timesheet` e fechamento de ponto nao equivalem a payroll.

### Suporte

🟢 **PRONTO** para ticketing atual: prioridades, status, mensagens, anexos, destinos, reabertura, devolucao, duplicados e eventos existem. A automacao de resposta e a leitura auditada de anexos continuam parciais.

## Servicos de campo/Limpeza

🟢 **PRONTO** no nucleo: cliente, responsaveis, tarefa, recorrencia, tolerancia, modos automatico/manual, start/stop, ponto manual, geofencing, ausencia, cancelamento, arquivamento, ferias, despesas e equipes aparecem no codigo e schema.

🟡 **INCOMPLETO** para escalas complexas: nao foi encontrada uma entidade de escala independente nem calendario de disponibilidade robusto. A recorrencia materializa tarefas e client assignees cobre responsaveis, mas ferias/conflitos precisam ser tratados na camada de tarefas/ponto.

## Faturamento de servicos

🟡 **INCOMPLETO.** Existe `time_entry_valuations`, `resolve_effective_compensation` e campos de remuneracao em migrations recentes, mas a auditoria nao encontrou um fluxo completo de faturamento recorrente com snapshot por cliente/funcionario/empresa. As colunas nao foram consideradas prova de fluxo completo.

Hierarquia confirmada parcialmente: empresa/cliente/funcionario aparecem no modelo de compensacao; prioridade e regras de snapshot precisam de teste de ponta a ponta.

## Restaurante e Alimentacao

🔴 **INEXISTENTE** no dominio de dados. Existem catalogo, abas e 8 rotas, todas `ComingSoon`. Nao existem tabelas live/migrations para produtos, categorias, variantes, ingredientes, receitas, pedidos, mesas, comandas, cozinha, delivery ou entregadores.

## Material de Construcao/Varejo

🔴 **INEXISTENTE** no dominio de dados. Existem 11 chaves de modulo e rotas placeholder. Nao existem tabelas para SKU, barcode, marcas, fornecedores, compras, estoque, movimentacao, orcamento, venda, entrega ou unidade de medida.

Consequentemente, grade de produto, ficha tecnica/fracionamento e conversoes de kg/g/l/ml/m2/m3/caixa/pacote/saco/rolo/barra nao estao implementadas.

## Hotelaria e Oficina

🔴 **INEXISTENTE** operacionalmente. A arquitetura aceita `hospitality` e `auto_repair`, mas nao ha rotas, tabelas ou fluxos. A recomendacao futura e separar propriedade/quarto/reserva para Hotelaria e cliente/veiculo/OS/itens/pecas/mao de obra/aprovacao para Oficina.

## Automacao externa

O que deve permanecer no Core: transacoes, estoque futuro, ponto, pagamentos, permissions, RLS, mudanca de status, idempotencia e auditoria.

O que pode sair para automacao externa: notificacoes secundarias, exportacoes, marketing e sincronizacoes nao criticas. Email/WhatsApp ja possuem infraestrutura propria; n8n/Make/ActivePieces nao foram encontrados nesta copia e nao devem substituir transacoes do banco.

## 10 principais lacunas

1. 🔴 Falta dos dominios de dados Restaurante e Material de Construcao.
2. 🟠 Relacoes cross-tenant sem garantia estrutural por empresa relacionada.
3. 🟠 Comercial SaaS sem `company_id`, impossibilitando CRM tenant-owned.
4. 🟠 Ausencia live de `domain_events`, apesar de ser principio oficial.
5. 🟠 Contrato inconsistente de leitura de `company_hr_settings`.
6. 🟡 Rotas Restaurante sem `ModuleGuard`.
7. 🟡 Sem estoque comum, ficha tecnica, fracionamento ou conversoes.
8. 🟡 Escalas/disponibilidade ainda representadas principalmente por recorrencia/equipe.
9. 🟡 Auditoria de leitura de anexos e cobertura de eventos incompleta.
10. 🟡 Benchmark de carga, paginacao e materializacao para centenas de tenants ainda nao executado.

## 10 proximos passos arquiteturais

1. Fechar o contrato de tenancy e FK composto nos dominios Core.
2. Rodar suite cross-tenant com utilizadores reais A/B, incluindo URL direta e RPC adulterada.
3. Decidir Comercial global versus tenant-owned e registrar ADR.
4. Uniformizar `company_hr_settings` por view/RPC e corrigir call-sites.
5. Adicionar `ModuleGuard` ao Restaurante antes de implementar dados.
6. Criar dominio comum de produtos, unidades, variantes e estoque.
7. Implementar Restaurante por fatias: catalogo, pedidos, cozinha, delivery.
8. Implementar Material por fatias: catalogo, estoque, compras, vendas, entrega.
9. Introduzir `domain_events` append-only com RLS/realtime quando o dominio estiver definido.
10. Executar testes de carga e observabilidade para 10, 100 e 1.000 empresas.

## Lacunas detalhadas

### Restaurante

**Existe hoje:** catalogo de `ModuleKey`, menus e 8 rotas placeholder.  
**Problema:** nao ha tabelas nem transacoes para menu, pedidos, mesas, cozinha ou delivery.  
**Impacto:** ativar o vertical hoje apenas expõe telas sem operacao persistente.  
**Arquitetura recomendada:** bounded context Restaurante sobre o Core de identidade, empresa, clientes, documentos e notificacoes.  
**Tabelas recomendadas:** `restaurant_products`, `restaurant_categories`, `restaurant_orders`, `restaurant_order_items`, `restaurant_tables`, `restaurant_kitchen_events`, `restaurant_deliveries`, `restaurant_couriers`, `restaurant_delivery_zones`.  
**Relacionamentos:** todas as tabelas devem ter `company_id`; pedidos devem ligar cliente, unidade e itens da mesma empresa; delivery deve ligar pedido e entregador da mesma empresa.  
**Backend:** RPCs transacionais para fechar pedido, enviar cozinha, cancelar e concluir entrega; RLS e auditoria no banco.  
**Frontend:** substituir `ComingSoon` por fatias pequenas, mantendo ModuleGuard e o resolver de navegacao.  
**Automacao externa:** sim, somente notificacoes/sincronizacoes secundarias; estoque, pedido e pagamento ficam no Core.

### Material de Construcao e Estoque

**Existe hoje:** 11 chaves de modulo e 11 rotas placeholder protegidas.  
**Problema:** nao existe catalogo, SKU, barcode, estoque ou movimentacao.  
**Impacto:** nao e possivel vender, comprar, entregar ou controlar saldo com consistencia.  
**Arquitetura recomendada:** dominio comum de produtos/variantes/unidades/estoque reutilizavel por Restaurante e Material.  
**Tabelas recomendadas:** `products`, `product_variants`, `product_variant_options`, `stock_locations`, `stock_items`, `stock_movements`, `suppliers`, `purchase_orders`, `sales_orders`, `quotes`, `deliveries`, `unit_conversions`.  
**Relacionamentos:** variante deve pertencer ao produto e empresa; movimento deve apontar para item, local e unidade base; conversao deve ser explicita e auditavel.  
**Backend:** uma RPC transacional deve validar saldo, unidade, empresa e idempotencia antes de movimentar estoque.  
**Frontend:** entregar primeiro produto/estoque, depois compras/orcamentos/vendas/entregas.  
**Automacao externa:** nao para baixa de estoque, venda ou pagamento; pode exportar e sincronizar catalogo.

### Hotelaria e Oficina

**Existe hoje:** somente valores `hospitality` e `auto_repair` no vertical.  
**Problema:** nao ha rotas, tabelas ou fluxos.  
**Impacto:** sao preparacao conceitual, nao capacidade operacional.  
**Arquitetura recomendada:** novos bounded contexts, sem forcar campos de hotelaria/oficina nas tabelas Core.  
**Tabelas recomendadas:** Hotelaria: `properties`, `rooms`, `room_rates`, `reservations`, `guests`, `stays`, `room_tasks`; Oficina: `customer_assets`, `vehicles`, `work_orders`, `diagnoses`, `work_order_items`, `parts`, `labor_entries`, `approvals`.  
**Relacionamentos:** cada agregado deve ter empresa e auditoria; OS deve ligar cliente, veiculo, itens e aprovacao na mesma empresa.  
**Backend:** status e precos devem ser transacionais e auditados.  
**Frontend:** criar rotas somente depois do contrato de schema e guard.  
**Automacao externa:** lembretes e marketing podem sair; reserva, OS, aprovacao e faturamento ficam no Core.

### Comercial SaaS

**Existe hoje:** `commercial_clients` e contratos com workflow, invoice e consumo, todos com policy `super_admin_all`.  
**Problema:** as tabelas nao possuem `company_id`.  
**Impacto:** o dominio nao pode ser aberto a empresas clientes como CRM operacional sem remodelagem; hoje e backoffice global.  
**Arquitetura recomendada:** manter explicitamente como Plataforma SaaS ou criar tenancy propria para o cliente comercial.  
**Tabelas recomendadas:** se tenant-owned, adicionar `company_id` nas tabelas atuais ou separar `platform_accounts` de `companies`, com FKs e RLS.  
**Relacionamentos:** contrato, servicos, workflow, invoice e ai_usage devem herdar a conta/plano por FK segura.  
**Backend:** RPCs de contrato e billing devem validar conta e manter snapshot de preco/plano.  
**Frontend:** rotas atuais devem continuar exclusivas do Super Admin enquanto nao houver decisao.  
**Automacao externa:** emissao de email e exportacoes podem ser externas; estado financeiro e billing nao.

### Escalabilidade e eventos

**Existe hoje:** indices por empresa/status, React Query, Realtime seletivo, fila de email e WhatsApp.  
**Problema:** `domain_events` nao existe live; listas grandes e custo de Realtime nao foram medidos em carga de centenas de tenants.  
**Impacto:** observabilidade, integrações e dashboards agregados terao de depender de joins e efeitos colaterais existentes.  
**Arquitetura recomendada:** eventos append-only por agregado, consultas paginadas e indices compostos guiados por perfil de uso.  
**Tabelas recomendadas:** `domain_events` com `company_id`, `aggregate_type`, `aggregate_id`, `event_type`, `payload`, `actor_id` e versionamento; somente se aprovado em migration propria.  
**Relacionamentos:** evento deve referenciar o agregado e a mesma empresa, sem permitir update/delete operacional.  
**Backend:** publicar evento na mesma transacao da mudanca critica; consumidores secundarios podem ser assincronos.  
**Frontend:** query keys estaveis, paginacao/infinite query e invalidacao por dominio.  
**Automacao externa:** sim para consumidores secundarios; nunca para RLS, permissao, estoque, ponto ou pagamento.

## Distincao entre existente e recomendado

Tudo descrito nas secoes de Core, migrations, rotas, RPCs e estado live e **EXISTE HOJE** conforme as fontes listadas. FK composto, estoque, receitas, produtos, `domain_events`, novas tabelas verticais, OS e reservas sao **RECOMENDACAO FUTURA**; nao foram implementados nesta auditoria.
