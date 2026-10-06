## 06102026-A
- 001 (super admin · proposta comercial): a proposta gerada passa a preencher automaticamente o representante comercial Eduardo R S Júnior, a data de emissão no campo de assinatura da OmniBiz e a imagem da assinatura enviada. O campo do representante legal do cliente continua em branco para assinatura do cliente. (`src/lib/commercial-proposal.ts`, `src/assets/assinatura-eduardo.png.asset.json`)

## 29092026-A
- 001 (tarefas · nome completo do funcionário): `taskMemberName` passa a devolver o nome COMPLETO (`full_name`) em vez do primeiro nome; `memberNames` idem. Afeta o filtro "Todos os funcionários", cartões do calendário, lista, diálogos e o "Responsável atual" do Reatribuir. O selo compacto de tarefas em equipe continua abreviado através da nova `taskMemberFirstName`. Nomes longos são cortados apenas visualmente (`truncate`) com `title` mostrando o nome inteiro, também no `EmployeePicker`/`EmployeeMultiPicker`. Verificado no browser: filtro lista "Keila Oliveira TESTE" e "Eduardo R S Junior TESTE", e a pesquisa por apelido ("Oliveira") continua a funcionar. (`src/routes/app.tarefas.tsx`, `src/components/common/EmployeePicker.tsx`)
- 002 (recorrências · checkpoint): confirmado que o horizonte de 12 meses está aplicado em `recurrence_materialize` no banco e que as séries recentes geram ocorrências (V-clean TESTE: "All nuts" 260 tarefas, "HappyKot - ASTRID 37" 26 tarefas, visíveis no calendário). A única série ativa sem ocorrências em todo o sistema continua a ser o resíduo "Banco Crelan" (personalizada de 24/08/2026 gravada sem datas). Sem alterações a `canonical_key`, `uq_tasks_recurrence_date` ou RLS.

## 28092026-D
- 001 (super admin · proposta comercial): novo gerador de Proposta Comercial em A4 pronta para imprimir/guardar em PDF, alimentado pelo plano, módulos, desconto e implantação já configurados na ficha da empresa (sem persistir nada). Inclui referência automática `PROP-AAAAMMDD-EMPRESA`, data de emissão, validade configurável (padrão 15 dias), identificação do cliente, limites do plano, módulos incluídos e adicionais com valores, condições financeiras (subtotal, desconto, mensalidade final), implantação em 2 prestações (entrada + 15 dias), condições gerais e bloco de aceitação/assinaturas. Botão "Gerar proposta (PDF)" ao lado de "Salvar plano e módulos". (`src/lib/commercial-proposal.ts`, `src/components/admin/CommercialProposalDialog.tsx`, `src/routes/app.admin.tsx`)

## 28092026-C

- 001 (super admin · planos): nova tabela de preços Europa (PT/BE/ES): Starter 80/160, Professional 115/230, Business 150/300, Enterprise 185/370. Brasil mantém os valores anteriores. Novo `PLAN_SETUP_PRICES` e `planSetupFee()`. (`src/lib/locale.ts`)
- 002 (super admin · desconto): colunas `companies.billing_setup_fee`, `billing_discount_kind` ('none'|'percent'|'amount') e `billing_discount_value`, protegidas pelo guard de super admin. Desconto incide **só na mensalidade** (`billingDiscountAmount`, limitado ao subtotal); implantação nunca recebe desconto e é dividida em 2x (entrada + 15 dias) por `billingSetupInstallments`, com cêntimos ímpares na entrada. Resumo na ficha mostra plano, adicionais, subtotal, desconto, mensalidade final e as duas parcelas. (`src/routes/app.admin.tsx`)
- 003 (módulos base): `notes` passa a módulo essencial (Notas por padrão, `companies_enforce_essential_modules` e backfill de `enabled_modules`); Clientes migra de `crm` para `tasks` (menu e `ROUTE_MODULES`), ficando em Planeamento e Tarefas; `finance` sem custo adicional; adicionais: CRM 24, Frota 19, WhatsApp IA 49, BI 24, Automações IA 49. (`src/lib/navigation.ts`, `src/lib/locale.ts`)

## 28092026-B
- 001 (tarefas · programação do cliente): novo campo `schedule_name` em `tasks` e `task_recurrences`. O formulário de tarefa mostra o seletor "Programação do cliente" (Livre/Manual + programações com nome, ex.: Klein/Grote) quando o cliente tem programações nomeadas; a escolha carrega horários/ciclo e grava a etiqueta na tarefa avulsa e na série. `recurrence_materialize` copia a etiqueta (por regra de ciclo ou da série) para cada ocorrência gerada. Etiqueta exibida no calendário (mês/ano e cartões do dia/semana) e na lista de tarefas. (`src/routes/app.tarefas.tsx`, `src/lib/tasks/client-schedule.ts`, `src/lib/tasks.ts`, `tests/client-schedule-name.test.ts`)

## 28092026-A
- 001 (clientes · equipa): as duas categorias listam todos os ativos da empresa (vinculados primeiro, depois alfabética), 5 linhas visíveis com rolagem, pesquisa sem maiúsculas/acentos; vinculado inativo aparece com selo "Inativo" só para remoção; estados carregando/erro/vazio.
- 002 (clientes · principal): trigger `trg_unlink_primary_on_inactivation` retira `is_primary` quando a pessoa fica inativa, com auditoria em `client_primary_audit`. `client_default_assignees` usa a regra completa de ativo. Sem ajuste retroativo.

## 27092026-B
- 004 (inativos, regra global): seleção de pessoas passa a usar uma única regra no servidor, independente da empresa (`is_active`, estado cadastral e data de saída). Aplicada também em edição de tarefa, gestão do Ponto, configuração da empresa, recibos, cartões de combustível e reabertura de tickets; históricos mantêm o nome. A Lista Inativa usa a mesma regra e conserva o selo.
- 001 (inativos, tipo A): nova RPC `company_active_member_options` (só ativos, filtro no servidor). Nova Tarefa, Reatribuir, edição de série, Equipa do cliente e sugestão de colega no Ponto passam a listar só ativos (consulta com `is_active = true`). Reatribuir mostra "Responsável atual" mesmo se inativo; edição de série mantém só o atual como "(Inativo)".
- 002 (inativos, tipo B): Usuários esconde inativos por padrão; botão "Lista Inativa" mostra só os inativos com o selo.
- 003 (recorrências): a página /app/tarefas/recorrentes não abria (rota aninhada sem Outlet mostrava Tarefas); rota passou a ser independente.

## 24092026-A
- 001 (férias): "Enviar para autorização" (modal com gestor autorizador) substituído por "Pedir autorização": RPC `vacation_request_authorization` muda o pedido para o novo estado `aguardando_aprovacao`, avisa o funcionário (`vacation_awaiting_approval`) e registra em `vacation_audit` (`pedir_autorizacao`). Mesma checagem de permissão de `vacation_decide`; idempotente (segundo clique não gera aviso). Gestor vê "Aguardando aprovação" fixo; funcionário vê "aguardando". O modal/RPC antigo continuam no código, mas não são mais chamados.
- 002 (férias): `vacation_decide` passa a aceitar também `aguardando_aprovacao` para aprovar/rejeitar/cancelar (sem outras mudanças). Fila compartilhada de gestores mantém o pedido em aberto enquanto aguarda.


## 27092026-A
- 001 Ficha do Cliente: modal reorganizado (nome/status no topo, 2 colunas, observações gerais e instruções adicionais, botão Excluir). Novos campos `clients.schedule_notes` e `clients.instructions`.

## 22092026-A
- 001 (suporte · Parte 3A): nova ação "Assumir ticket" — uma única operação atómica (RPC `support_claim_ticket`) define o responsável do ticket e assume o aviso da fila: some para os restantes gestores e fica em tratamento para quem assumiu. Só gestor/proprietário da empresa (filas administrativas) e super_admin; ticket com responsável não volta a ser assumido. (`src/routes/app.suporte.$id.tsx`, `src/lib/support/tickets.ts`, `src/lib/support/close-permission.ts`)
- 002 (suporte · Parte 3A): `post_support_ticket_message` — com responsável definido, a resposta do solicitante notifica apenas o responsável (notificação de pessoa); sem responsável, mantém o fan-out da fila por papel.
- 003 (suporte · Parte 3B): arquivamento passa a ser só visibilidade — `archived_at`/`archived_by` via RPC `support_archive_ticket`, que NUNCA altera o status. Permissão espelha a Etapa A (`support_can_close_ticket`). Modal "Arquivar agora?" abre ao marcar como resolvido (sim arquiva; não mantém resolvido e não-arquivado com botão "Arquivar ticket" disponível depois). Lista de tickets esconde arquivados com alternância "Mostrar arquivados". (`src/components/support/ArchiveTicketDialog.tsx`, `src/routes/app.suporte.tsx`)
- 004 (suporte · backfill): 119 tickets históricos marcados como arquivados (Grupo V-clean 113: 69 legado "fechado", 41 resolvido, 2 resolvido pelo gestor, 1 rejeitado; OMNIBIZ TESTES 6), `archived_by` nulo (sistema/migração) e evento `archived` com `source=backfill`. Nenhum status alterado.
- 005 (suporte · testes): `tests/support-ticket-archive.test.ts` (permissão de arquivar e assumir) + homologação ao vivo no banco: claim define responsável, segundo gestor bloqueado, funcionário sem permissão não arquiva, arquivar mantém `status=aberto`, fila técnica bloqueada ao gestor.

## 21092026-B
- 001 (tarefas): cartão do quadro semanal simplificado — nome completo sem corte (quebra de linha), selo de status pequeno na linha do horário, apenas o lápis visível; demais ações (Editar, série, reatribuir, excluir, Autorizar/Iniciar/Cancelar) abrem ao tocar no lápis. Visão de funcionário inalterada. (src/routes/app.tarefas.tsx)
- 002 (tarefas): removida a repetição do nome do cliente abaixo do título no quadro por colaborador; no agrupamento por cliente, o nome do colaborador continua visível como contexto. (src/routes/app.tarefas.tsx)
- 003 (tarefas): removida definitivamente a segunda linha de identificação dos cartões do calendário em todos os agrupamentos; o cartão mantém apenas o nome em negrito, horário, estado e lápis. (src/routes/app.tarefas.tsx)

## Tarefas — hora de fim opcional e exclusão com anexos (28/09/2026)
- A hora de fim deixou de ser preenchida ou derivada pelo sistema. Se o gestor ou super admin não a registar, a tarefa é gravada sem hora de fim. A distribuição da carga contratada só recalcula uma hora de fim já registada manualmente.
- `task_soft_delete`: documentos anexados não bloqueiam mais a exclusão de tarefas não iniciadas (pendente, autorizado, cancelado, ausente). Apenas execução real (status em andamento/concluído ou registos de ponto) impede. Os anexos são removidos junto com a tarefa.
- O modal de exclusão informa quantos anexos existem antes de confirmar.
