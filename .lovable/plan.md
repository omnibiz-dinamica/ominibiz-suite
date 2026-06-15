# Sprint OmniBiz — Plano de Execução

O escopo enviado é muito grande para uma única entrega segura (mexe em Clientes, Usuários, Auth, Tarefas, Férias, Ponto, Dashboards e prepara arquitetura). Proponho dividir em **4 fases entregáveis**, cada uma fechada e testável antes da próxima. Você aprova fase a fase.

---

## FASE 1 — Correções críticas (bloqueios do dia a dia)

Objetivo: destravar uso imediato.

1. **Reset de senha** — auditar `src/routes/reset-password.tsx`, verificar token/PASSWORD_RECOVERY, remover `disabled` indevido nos inputs, garantir que o formulário funciona ao chegar pelo email.
2. **Tarefas — "valor inválido"** — auditar parser de horário/timezone em criação e edição de tarefas (`app.tarefas.tsx`, dialogs de recorrência), normalizar para ISO local, corrigir validação.
3. **Tarefas — remover Prioridade** da UI operacional (campos, filtros, badges). Coluna do banco fica, só é ocultada.
4. **Correção de ponto — motivo opcional** — alterar `PunchEditorDrawer` e função de update para aceitar motivo vazio, manter gravação na auditoria quando informado.
5. **Usuários — auditoria do convite/criação**: relatório objetivo (envio, template, provedor, link de acesso, link de senha, log). Corrigir o que estiver quebrado no fluxo de invite/recovery.

Entrega: relatório IMPLEMENTADO/CORRIGIDO/PENDENTE para cada item.

---

## FASE 2 — Clientes, Ponto e Férias (notificações + UI)

1. **Clientes — exportação Excel (.xlsx) e PDF** com os campos listados, respeitando filtros ativos.
2. **Ponto — exportação Excel e PDF** na Gestão de Folha de Ponto, respeitando filtros.
3. **Férias — notificações automáticas**:
   - Funcionário solicita → gestor recebe notificação + pedido pendente.
   - Gestor aprova/rejeita → funcionário recebe notificação.
4. **Férias programadas pelo gestor** — novo status `pendente_confirmacao`, funcionário pode **Aceitar** ou **Solicitar alteração**; vira `confirmada` após resposta.
5. **Tela de Férias** — mostrar Nome, Local de Trabalho, Função; filtros por Colaborador, Mês, Ano, Status; cálculo de **dias corridos** e **dias úteis** ao lado das datas.

Requer migration (novo status + colunas auxiliares) e ajustes em `app.ferias.tsx` + notifications.

---

## FASE 3 — Dashboards (RH, Clientes, Frota)

Indicadores agregados via views/RPC:

- **RH**: ativos, em férias, férias pendentes, horas trabalhadas mês, horas extras, recibos enviados.
- **Clientes**: valor mensal estimado, contagem por tipo de cobrança, horas consumidas por cliente.
- **Frota**: consumo médio, KM percorridos, custo/KM, ranking de abastecimentos.

Entregue como blocos no dashboard atual de Super Admin / Gestor.

---

## FASE 4 — Preparação arquitetural (sem implementar features)

Apenas estrutura de pastas/rotas placeholder e notas no `plan.md` para:
Financeiro, Relatórios, Contratos (já existe parcial), Inventário, Assinatura eletrónica, Aplicação móvel.

Sem migrations nem UI funcional — só esqueleto para crescimento.

---

## Detalhes técnicos

- Exportações: `xlsx` (SheetJS) já não está no projeto — adicionarei `xlsx` e usarei `jspdf` + `jspdf-autotable` para PDF (client-side, sem custo de servidor).
- Dias úteis: cálculo client-side considerando seg–sex (feriados PT podem entrar depois se desejar — confirmar).
- Notificações de férias: usar tabela `notifications` já existente + trigger SQL no `vacation_requests`.
- Dashboards: criar RPCs `dashboard_rh_metrics`, `dashboard_clientes_metrics`, `dashboard_frota_metrics` (security definer, escopadas por empresa).

---

## Confirmações que preciso antes de começar a Fase 1

1. **Posso começar pela Fase 1 agora** e seguir fase a fase com aprovação no fim de cada uma?
2. **Dias úteis**: considerar apenas seg–sex, OU seg–sex + feriados nacionais de Portugal?
3. **Exportação PDF de Clientes/Ponto**: paisagem A4 com logo da empresa no topo está OK?
4. **Remoção de Prioridade**: apenas esconder na UI (mantendo dados antigos) — confirma?