# Fechamento Mensal da Folha de Ponto

## FASE A — Auditoria (concluída)

O que já existe e será **reutilizado sem duplicar**:

| Necessidade do pedido | Já existe hoje |
| --- | --- |
| Registos de ponto (entrada/saída/pausas/minutos) | `time_entries` (com `effective_minutes`, `paid_leave_minutes`, `entry_kind`, `voided_at`, geo, auditoria em `time_entries_audit`) |
| Motor financeiro canónico | `resolve_effective_compensation`, `calculate_time_entry_value`, snapshots por registo em `time_entry_valuations` (`pay_model_used`, `rate_source`, `rate_applied`, `daily_applied`, `monthly_applied`, `amount`, `currency`) + `finance_summary(company, from, to, user, client)` |
| Tipos de pagamento Hora/Dia/Mês | `src/lib/compensation.ts` (ADR-031) — hierarquia Funcionário > Cliente > Empresa |
| Assinatura e rubrica do funcionário | bucket privado **`employee-signatures`** + colunas `profiles.signature_url` / `profiles.initials_url` (hoje só o Gestor carrega, em `EmployeeEditor.tsx`) |
| Dados de cabeçalho do relatório | `profiles.job_title`, `work_location`, `full_name`; `companies` |
| Notificações | `notifications` + `_notify()` + enum `notification_event` |
| RBAC / multi-tenant | enum `app_role` (super_admin, manager, employee, owner), `has_role`, `is_company_manager`, `is_company_member`, RLS por `company_id` |
| Navegação única | `src/lib/navigation.ts` (ADR-030), resolver único |
| Geração de PDF no cliente | `jspdf` (`src/lib/contract-pdf.ts`) e `pdf-lib` (`src/lib/pdf-fill.ts`) |
| Telas de ponto | `/app/ponto` (Folha de Ponto) e `/app/ponto/gestao` (Ponto · Gestão) — **não serão reescritas** |

Lacunas reais (o que precisa nascer):
1. Não existe entidade de **fechamento mensal** por funcionário (período, status, snapshot, versão, PDF).
2. Não existe papel **contabilista** no enum `app_role`, nem grupo de menu Contabilidade.
3. Não existe fluxo de conferência/assinatura do relatório mensal pelo funcionário (a assinatura hoje é só um ficheiro no perfil, gerido pelo Gestor).
4. Não existe visto diário nem distinção entre visto cadastrado / dia validado / relatório assinado.

## FASE B — Modelo de dados (1 migration, aditiva, sem destruir nada)

- `public.timesheet_periods` — uma linha por (company, employee, ano, mês):
  status, totais (minutos, dias pagos, valor), snapshot financeiro (`payment_type_used`, `rate_used`, `rate_source`, `worked_minutes`, `paid_days`, `monthly_amount`, `calculated_amount`, `currency`), versão actual, datas de assinatura/fecho/liberação e autores.
- `public.timesheet_period_versions` — snapshot histórico imutável: `snapshot jsonb` (linhas diárias + resumo + dados do funcionário no momento), `pdf_path`, `content_hash`, `signed_at`, `version`. Append-only por trigger.
- `public.timesheet_day_confirmations` — visto diário (dia + confirmado_em + autor), distinto da assinatura mensal.
- `public.timesheet_audit_events` — `REPORT_GENERATED`, `EMPLOYEE_SIGNED`, `CORRECTION_REQUESTED`, `REPORT_REGENERATED`, `MANAGER_CLOSED`, `SENT_TO_ACCOUNTING`, `REPORT_VIEWED`, `REPORT_DOWNLOADED` com company/employee/actor/versão/timestamp.
- Enum `timesheet_status`: `em_aberto`, `aguardando_funcionario`, `aguardando_correcao`, `assinado_funcionario`, `em_conferencia`, `fechado_gestor`, `disponivel_contabilidade`.
- `app_role` ganha `accountant` (rótulo “Contabilista”) — valor novo, não altera existentes.
- Bucket privado novo `timesheets` para os PDFs, com policies por empresa + papel.
- GRANTs explícitos + RLS em todas as tabelas novas; funcionário só vê as suas linhas, gestor só a sua empresa, contabilista só empresas onde tem papel e só períodos `disponivel_contabilidade`.
- RPCs (security definer, tudo validado no servidor):
  `timesheet_period_ensure`, `timesheet_build_snapshot` (lê `time_entries` + `time_entry_valuations`, **nunca escreve** em ponto), `timesheet_day_confirm`, `timesheet_sign`, `timesheet_request_correction`, `timesheet_manager_close`, `timesheet_send_to_accounting`, `timesheet_register_pdf`, `timesheet_list`.

## FASE C — Funcionário

- Perfil (`/app/perfil`): secção **Assinatura e Visto** com pad de desenho (rato/toque) + upload opcional, pré-visualização por signed URL, substituir/remover. Grava em `employee-signatures`, actualiza `signature_url`/`initials_url`. Novas policies permitem o próprio utilizador gerir os seus ficheiros.
- Nova rota `/app/ponto/meus-relatorios`: filtros Ano/Mês/Status, cards por período; detalhe com prévia completa (dias, entrada, saída, pausas, total diário, total mensal), declaração de conferência, **Assinar e gerar relatório** e **Solicitar correção** (motivo obrigatório).
- Menu do funcionário: item “Meus Relatórios” no grupo Operação, sob Folha de Ponto.

## FASE D — Gestor

- Nova rota `/app/ponto/fechamento`: filtros Mês, Ano, pesquisa (nome/email), Status, Tipo de pagamento; tabela com selecção múltipla (Funcionário, Tipo, Horas/Dias, Situação, Assinatura, Contabilidade, Ações).
- Ações individuais: Ver, Imprimir, Baixar PDF, Solicitar correção, Fechar, Enviar para Contabilidade (com o modal de confirmação pedido).
- Ações em lote: selecionar todos, imprimir/baixar selecionados, liberar selecionados, imprimir todos — em fila com progresso, sem bloquear a UI.
- Menu do Gestor: “Fechamento Mensal” no grupo Operação, depois de Ponto · Gestão.

## FASE E — Contabilista

- Papel `accountant`: `useAuth` passa a expor `isAccountant`/`effectiveRole: "accountant"`; convites e promoções por Gestor passam a permitir `employee` e `accountant` apenas.
- Grupo de menu **Contabilidade** com apenas o que existe: Folhas de Ponto (novo) e Recibos (reutiliza `/app/rh/recibos` em modo leitura). Documentos/Exportações ficam de fora até existirem.
- Rota `/app/contabilidade/folhas-ponto`: só períodos liberados; ver/imprimir/baixar, individual e em lote. Sem qualquer acção de escrita — garantido por RLS (só SELECT) e não só pela UI.

## FASE F — PDF, impressão em lote e segurança

- `src/lib/timesheet-pdf.ts` com `jspdf` (já instalado, corre no browser — evita dependências Node no worker): cabeçalho “Folha de Ponto Individual de Trabalho”, identidade OmniBiz/empresa, dados do funcionário, tabela Data/Entrada/Saída/Pausas/Total/Visto com paginação e continuação, Resumo do Mês com o financeiro conforme o tipo efetivo (valores vindos do snapshot, **sem recalcular**), assinaturas e data/hora de geração.
- Upload para bucket `timesheets` em `company_id/employee_id/YYYY-MM/vN.pdf`, hash do conteúdo registado na versão; acesso sempre por signed URL curta.
- Impressão em lote: merge com `pdf-lib` num único PDF para imprimir/baixar, processado em blocos com progresso.

## FASE G — Homologação

Os 28 testes do pedido, incluindo cross-tenant, contabilista bloqueado na escrita, imutabilidade do snapshot após mudança de valor/hora, hora/dia/mês, mobile e desktop. Depois: typecheck, build, CHANGELOG, DECISIONS (ADR-038) e ARCHITECTURE_INDEX.

## Notas técnicas

- Nada de recálculo financeiro no gerador de PDF: o snapshot é construído no banco a partir de `time_entry_valuations`/`finance_summary`.
- Gerar relatório nunca escreve em `time_entries` — correções continuam pelo fluxo de regularização existente (ADR-034/036).
- Uma versão assinada nunca é alterada: correção posterior cria `version + 1` com auditoria.
- Notificações reutilizam `notification_event` (novos valores no enum) para: relatório disponível, assinado, correção solicitada, disponibilizado à contabilidade.
