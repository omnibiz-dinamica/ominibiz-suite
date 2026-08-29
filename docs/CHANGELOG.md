# OmniBiz — CHANGELOG

> Registro oficial de alterações. Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
> Versionamento segue as releases documentadas em `docs/RELEASE_HISTORY.md`.

---

## [Não lançado] — Sprint de Refinamento Operacional

### 🐞 SUP-2026-000080 — Falta por tarefa não realizada na folha de ponto

#### Corrigido
- Ao persistir uma falta, o período mensal do funcionário é materializado quando
  ainda não existe. Isso evita que a folha desapareça da listagem/relatórios por
  ausência de `timesheet_periods`; períodos existentes e versões assinadas não
  são modificados.
- A Folha de Ponto · Gestão passa a usar um feed operacional único que combina
  `time_entries` reais com faltas por ocorrência, sem criar ponto artificial.
- O feed operacional classifica a origem da falta por evidência do registro
  (funcionário, gestor ou automática), sem usar essa origem como filtro de visibilidade.
- O funcionário responsável pode registrar falta apenas na própria tarefa atribuída;
  gestores mantêm o registro administrativo e ambos os fluxos geram a mesma ocorrência
  na Folha de Ponto, com auditoria do ator correto.
- Reutilizado o fluxo existente de falta, agora impedindo marcação futura,
  repetição de falta, tarefas já realizadas e tarefas com ponto aberto.
- A auditoria da falta passa a guardar também a ocorrência e o escopo
  selecionado da tarefa recorrente.
- O snapshot mensal passa a incluir `FALTA` por ocorrência e funcionário,
  sem criar ponto fictício, somar horas ou transformar automaticamente o dia
  inteiro em ausência.
- Gestor, funcionário e PDF distinguem falta, férias e dia trabalhado; dias
  com pontos e faltas preservam a situação mista.

#### Preservado
- A tarefa continua existente, as recorrências futuras não são alteradas e
  férias aprovadas permanecem separadas da falta.
- UUID, RBAC, RLS, isolamento multiempresa, START/STOP, histórico de pontos,
  remuneração e valuations não foram alterados.

### 🐞 Herança operacional in-app do Super Admin

#### Corrigido
- O Super Admin mantém o acesso global e, ao operar uma empresa, passa a receber
  as notificações in-app destinadas à gestão dessa empresa.
- A entrega foi centralizada em `public._notify`, com deduplicação e preservação
  do `company_id`; notificações de suporte passaram a usar o mesmo helper.

#### Preservado
- RLS, RBAC, isolamento multiempresa, emails operacionais, dados históricos,
  tarefas, ponto, recorrências e demais regras de negócio não foram alterados.

### 🐞 SUP-2026-000103 — Férias aprovadas no calendário e fechamento mensal

#### Adicionado
- O calendário de tarefas compõe férias aprovadas como eventos de RH, por funcionário, sem criar tarefas fictícias.
- O fechamento mensal e os relatórios exibem os dias de férias aprovadas, inclusive períodos que atravessam meses.
- Dias com férias e ponto existente ficam identificados como conflito, sem apagar ou alterar o ponto.

#### Preservado
- Apenas o estado técnico `aprovado` é exibido; pedidos pendentes, rejeitados e cancelados ficam fora.
- Férias não geram `time_entry`, horas trabalhadas ou alteração financeira automática.
- RLS, RBAC, recorrências, tarefas e histórico permanecem inalterados.

### 🐞 SUP-2026-000112 — Observação opcional ao concluir tarefa

#### Adicionado
- O colaborador pode registrar uma observação opcional no encerramento pela tela de Tarefas ou pela Folha de Ponto, em desktop e mobile.
- A observação é gravada como evento histórico `completion_note` em `task_audit_events`, com empresa, tarefa, autor, data e texto.
- Gestores e responsáveis autorizados conseguem consultar a observação na listagem da tarefa; o limite é de 2.000 caracteres.

#### Preservado
- `task_transition`, START, STOP, duração, geopontos, recorrências, RLS e RBAC continuam separados e inalterados.
- Falha opcional ao gravar a observação não desfaz a conclusão da tarefa nem o encerramento do ponto.

### 🐞 P0 — Anexo de despesas no Chrome Android

#### Corrigido
- `src/routes/app.despesas.tsx`: o seletor de ficheiros abortava silenciosamente no Chrome Android porque o `value` do input era limpo dentro do próprio `onClick` e o `accept` combinava imagem+PDF num único controlo.
- Passam a existir dois controlos explícitos — «Escolher da galeria/arquivos» (`accept="image/*,application/pdf"`, sem `capture`) e «Tirar foto» (`accept="image/*"`, `capture="environment"`) — accionados por botões reais, inputs `sr-only` (nunca `display:none`, nunca dentro de `<label>`), com `value = ""` **antes** do `click()`.
- Adicionada pré-visualização do ficheiro escolhido (miniatura para imagens, ícone para PDF), tamanho e MIME resolvido por extensão quando o Android devolve `type` vazio (JPEG, PNG, WEBP, HEIC/HEIF, AVIF, GIF, PDF).
- Cancelar o seletor deixa de apagar o anexo já escolhido; limite de 20 MB e mensagens de erro explícitas mantidos. Upload, caminho no bucket `employee-expenses` e persistência de `attachment_path` / `attachment_mime` / `attachment_size` permanecem inalterados.


### 🐞 P0 — Erro ao excluir tarefas recorrentes corrigido (ADR-052)

#### Corrigido
- `task_series_delete` falhava com `task_audit_events_event_check` porque registava o evento `delete`, ausente da constraint (que só aceitava `cancel`, `archive`, `unarchive`, `absence`).
- Constraint recriada de forma **aditiva** aceitando também `delete` (exclusão lógica de ocorrência) e `series_end` (encerramento da série). Nenhum valor histórico removido; nenhum registo alterado.
- Âmbito «esta e todas as futuras» passa a registar **um** evento `series_end` na ocorrência de corte, além dos eventos `delete`/`cancel` por ocorrência.

#### Preservado
- Auditoria ativa; soft-delete/cancelamento mantidos (sem delete físico); bloqueio `TASK_HAS_OPEN_PUNCH`; tarefas únicas e ocorrências passadas intactas.

### 🗑️ Exclusão segura de tarefas recorrentes (ADR-051)

#### Adicionado
- Modal de escolha de âmbito ao excluir uma ocorrência de série: **Apenas esta ocorrência** ou **Esta e todas as futuras**, com motivo opcional registado na auditoria.
- RPC `public.task_series_delete(_task_id, _scope, _reason)` — soft-delete das ocorrências sem histórico, cancelamento auditado das que têm histórico e encerramento da série na data de corte quando o âmbito é «futuras».
- `task_audit_events` passa a registar `recurrence_id`, `occurrence_date` e `action_scope`.

#### Preservado
- Tarefas únicas mantêm exatamente o fluxo de exclusão anterior (`task_soft_delete`).
- Ocorrências passadas nunca são alteradas; ocorrências com ponto, documentos ou fotos nunca são apagadas fisicamente; ponto aberto continua a bloquear a operação (`TASK_HAS_OPEN_PUNCH`).
- RLS/RBAC inalterados: apenas gestor da empresa ou super admin executa a operação.

---

### 🔁 Motor de recorrência v2 (ADR-050)

#### Corrigido
- «Semana sim, semana não» passa a repetir a cada 2 semanas até a data final. A âncora semanal agora é o domingo da semana de `start_date` (antes `date_trunc('week')`, base segunda-feira, deslocava séries que começavam ao domingo).
- Horizonte de materialização deixa de ser fixo em 14 dias: a criação de uma série gera as ocorrências até a data final (cap 400 dias) e a tela de Recorrências gera 60 dias. Novo job diário `tasks-recurrence-materialize-daily` mantém a fila abastecida.

#### Adicionado
- Frequência **Mensalmente (posição no mês)** — Primeira/Segunda/Terceira/Quarta/Última + dia da semana (ex.: última sexta-feira), persistida em `task_recurrences.monthly_rule` como `{ position, weekday }`.
- Frase-exemplo dinâmica e lista das **próximas 5 ocorrências** no formulário de recorrência, calculadas com a mesma lógica do motor no banco.
- Rótulo da regra mensal por posição na listagem de Recorrências.

#### Preservado
- Regra mensal legada `{ day_of_month }`, séries e tarefas já materializadas, RLS e a proteção de duplicidade por `(recurrence_id, recurrence_date)`.

---


### 🎯 Destino obrigatório do ticket (ADR-049)

#### Adicionado
- Catálogo de filas em `public.support_destinations` (Suporte/Desenvolvimento, Contabilista, Secretária) — novas filas (RH, Financeiro, Jurídico…) entram por dados, sem alterar código.
- Campo obrigatório **«Para quem deseja enviar este ticket?»** no `NewTicketDialog`, em cards, com resumo antes do envio (destino ≠ responsável).
- Coluna `support_tickets.destination_code` com backfill por tipo; badge de destino na lista e no detalhe; filtro por destino na Central de Suporte.
- Reencaminhamento auditado entre filas (`support_set_ticket_destination`) para Gestor e Super Admin, com evento `destination_changed`.
- Papel `secretary` no enum `app_role`; Contabilista e Secretária acedem apenas aos tickets da sua fila, dentro da própria empresa (RLS mantida).
- Detecção de semelhantes (ADR-048) passa a usar o destino como reforço de pontuação, sem excluir tickets de outras filas.


### 🎫 Correção sequencial de tickets abertos

#### Corrigido
- **Férias canceladas indevidamente — cancelamento passa a exigir confirmação (ADR-046).**
  Um pedido de férias podia ser cancelado com um único clique, sem motivo e sem
  registo de quem cancelou (causa da perda do pedido de 29/09→05/10 da Keila
  Oliveira, cancelado 17 s após a criação). Agora: novo diálogo com motivo
  obrigatório e dupla confirmação, colunas `cancelled_by`/`cancellation_reason`,
  tabela de auditoria `vacation_audit` com todas as transições e trigger que
  bloqueia qualquer cancelamento fora da ação oficial. O pedido afetado foi
  restaurado para "pendente", com histórico preservado e o gestor notificado
  novamente; nenhum outro pedido foi alterado.
- **SUP-2026-000074 (Urgente) — concluir tarefa com ponto esquecido (ADR-045).**
  Quando o funcionário esquecia a saída, a conclusão da tarefa falhava (ou
  fecharia o ponto em `now()`, inflando horas). O ecrã de Tarefas passa a
  detetar o ponto em aberto e abre o modal canónico de Recuperação de Ponto
  Aberto com hora real de saída + motivo obrigatórios, regularizando e
  concluindo a tarefa num único ato auditado (`punch_recover_open_entry` com
  `_complete_task = true`). Erros do `task_transition` relacionados com ponto
  aberto passam a oferecer a regularização em vez de mensagem seca.
- **SUP-2026-000073 (Urgente) — gestor sem opção de «marcar falta» (ADR-044).**
  A ausência só podia ser marcada automaticamente (ou pelo gestor após o limiar),
  e uma tarefa já «Ausente» ficava terminal, sem forma de registar formalmente a
  falta do funcionário. Passa a existir a RPC `public.task_mark_absent`
  (motivo obrigatório + classificação justificada/injustificada), disponível para
  tarefas pendentes, autorizadas, em andamento e já ausentes, com auditoria em
  `task_audit_events` e bloqueio quando existe ponto aberto. Novos campos em
  `public.tasks`: `marked_absent_by`, `absence_reason`, `absence_justified`,
  `absence_source`. UI: novo `MarkAbsentDialog` e destaque da falta na lista.
- **SUP-2026-000095 (Alta) — notificações sem gestão de estados (ADR-043).**
  A caixa de notificações só permitia abrir ou marcar como lida, pelo que o menu
  nunca ficava limpo. Passa a ter estados: **Nova**, **Em tratamento**,
  **Encaminhada** (com destinatário livre — Contabilista, Lea, Luc…, e nota
  opcional), **Resolvida** e **Arquivada**, com pastas/filtros e contadores,
  ação «Restaurar» para o arquivo e badge do menu a ignorar resolvidas/arquivadas.
  Novos campos em `public.notifications` e RPC `notification_set_state`.
- **SUP-2026-000070 (Urgente) — gestor sem forma de aceitar ou contestar a resposta
  do suporte.** Tickets devolvidos ao solicitante (`waiting_manager`,
  `waiting_employee`, `aguardando_cliente`, `returned_to_manager`, `em_validacao`)
  não ofereciam nem arquivamento nem reabertura. Agora o detalhe do ticket mostra
  «Confirmar solução e arquivar» e «O problema continua» (foca a caixa de resposta),
  e `close_support_ticket` aceita esses estados para o solicitante/gestor da empresa,
  mantendo o registo em `support_ticket_events`.
- **SUP-2026-000065 (Urgente) — tarefa gravada sem responsável (ADR-039).**
  Causa raiz: recorrência legada sem `assigned_to` cujas ocorrências eram
  materializadas com responsável nulo. Adicionadas as guardas server-side
  `tasks_require_assignee` e `task_recurrences_require_assignee`;
  `recurrence_materialize` passa a ignorar recorrências sem responsável; a
  recorrência legada foi pausada (nenhum dado apagado).

### 🗓️ Fechamento Mensal da Folha de Ponto (ADR-038)

#### Adicionado
- Papel **`accountant`** (Contabilista) em `app_role`, com navegação própria e
  acesso somente leitura às folhas liberadas.
- Tabelas `timesheet_periods`, `timesheet_period_versions` (append-only),
  `timesheet_day_confirmations` e `timesheet_audit_events`; bucket privado
  `timesheets` (25 MB).
- RPCs `timesheet_build_snapshot`, `timesheet_period_ensure`,
  `timesheet_open_month`, `timesheet_day_confirm`, `timesheet_sign`,
  `timesheet_register_pdf`, `timesheet_request_correction`,
  `timesheet_manager_close`, `timesheet_send_to_accounting`, `timesheet_list`,
  `timesheet_log_access`.
- Perfil: `SignatureVistoCard` para capturar assinatura e visto (rubrica),
  guardados no bucket `employee-signatures`.
- Funcionário: `/app/ponto/meus-relatorios` — prévia completa dos registos,
  visto diário, declaração de conferência, assinatura (gera versão imutável +
  PDF arquivado), pedido de correção, impressão e download.
- Gestor: `/app/ponto/fechamento` — abertura do mês, acompanhamento de
  assinaturas, fecho e liberação (individual ou em lote), impressão/download em
  lote num único PDF.
- Contabilista: `/app/contabilidade/folhas-ponto` — apenas períodos
  `disponivel_contabilidade`, com visualização e pacote mensal.

#### Notas
- Fechar/liberar **não recalcula** remuneração: usa a versão assinada. Snapshots
  existentes nunca são regenerados; PDFs arquivados são reutilizados no lote.
- Todo acesso a relatório registra `REPORT_VIEWED` / `REPORT_DOWNLOADED` em
  `timesheet_audit_events`.



### 🔁 Tarefas recorrentes — «Semana sim, semana não» (ADR-037)

#### Adicionado
- Nova opção de frequência **«Semana sim, semana não (a cada 2 semanas)»** na
  criação/edição de tarefas recorrentes.
- Coluna `public.task_recurrences.interval_weeks` (default `1`) — semântica
  RRULE `FREQ=WEEKLY;INTERVAL=n`.

#### Alterado
- `public.recurrence_materialize` passou a respeitar `interval_weeks`, usando a
  **semana da `start_date` como âncora** (`date_trunc('week', ...)`) em vez de
  somar 14 dias — imune a viradas de mês, ano e horário de verão.
- Listagem de recorrências mostra o rótulo correto da frequência quinzenal.

#### Notas
- Não existia opção «Quinzenal» antes: só `daily`, `weekly`, `monthly`, `custom`.
- Séries existentes ficam com `interval_weeks = 1` — comportamento inalterado.

### 🗂️ Folha de Ponto — Ausentes, cancelamento e arquivamento manual (ADR-036)

#### Adicionado
- `public.task_audit_events` — auditoria permanente de cancelamento,
  arquivamento e desarquivamento (ator, papel, estado anterior, motivo).
- RPC `public.task_cancel` — cancelamento com **motivo obrigatório** por gestor
  ou pelo responsável da tarefa; bloqueado quando existe ponto aberto
  (`TASK_HAS_OPEN_PUNCH`), remetendo para o fluxo oficial de Recuperação de Ponto.
- Coluna `public.tasks.cancellation_reason`.
- `CancelTaskDialog` e `ArchiveTaskDialog` (modais canónicos, sem `window.prompt`).
- Ações «Cancelar tarefa» e «Arquivar» na Folha de Ponto do funcionário
  (`/app/ponto`), na tarefa em destaque e na fila.

#### Alterado
- `public.task_archive` passou a permitir que o **responsável** arquive/desarquive
  a sua própria tarefa em estado terminal (ausente, cancelada, concluída);
  bloqueia com ponto aberto.
- `/app/tarefas`: ação «Cancelar» abre o modal com motivo em vez de transição direta.
- Fila da Folha de Ponto: primeiro o que exige ação; ausentes/canceladas ainda
  não arquivadas ficam no fim, de forma compacta. Arquivadas saem da fila.

#### Não alterado (por decisão)
- «Arquivado» **não** é status: `status` permanece intacto ao arquivar.
- Nunca há arquivamento automático nem por cron; ausência continua visível até
  ser tratada. Nada é apagado fisicamente.
- Auditoria de dados existentes: 61 ausentes, 17 canceladas e 18 arquivadas —
  nenhuma alteração em massa executada.

---

### 🚫 Tarefas — recusa pelo funcionário (SUP-2026-000077) (2026-08-24)

#### Corrigido
- Recusa de tarefa deixou de falhar com «Sem permissão para alterar estes campos
  da tarefa». A recusa é agora uma transição autorizada (`task_transition` com
  ação `recusar`), sem conceder ao funcionário permissão genérica de edição.

#### Adicionado
- Tabela `public.task_refusals` — histórico permanente das recusas (motivo, autor,
  data), com operação idempotente (sem duplicar auditoria ou notificação).
- Notificação `task_rejected` para gestores/owners com motivo e deep-link.
- RPC `task_reassign_from_refusal` e reatribuição pelo diálogo «Reatribuir tarefa»,
  que devolve a tarefa a `pendente` preservando o histórico.
- Filtro «Recusadas» (com contador) em `/app/tarefas` e destaque do motivo da
  recusa no cartão e na lista, com ação direta de reatribuição para o gestor.

#### Notas
- Guardas server-side validadas: motivo obrigatório, apenas o próprio responsável,
  apenas em `pendente`/`autorizado`, bloqueio com ponto aberto, negado para outro
  funcionário e para outra empresa (ADR-035).

### 🕒 Ponto — Recuperação de Ponto Aberto (2026-08-24)

#### Adicionado
- **Fluxo oficial de recuperação** para funcionários bloqueados por um ponto antigo
  em aberto: modal canónico com «Voltar à tarefa», «Encerrar ponto anterior»
  (data/hora + motivo obrigatórios) e «Solicitar ajuda ao gestor».
- **Painel «Pontos em aberto»** em `/app/ponto/gestao`, com severidade
  (Normal/Aviso/Crítico), deteção de inconsistências (tarefa concluída com ponto
  aberto) e regularização direta pelo gestor.
- RPCs `punch_open_entry_self`, `punch_open_entries_list`,
  `punch_recover_open_entry`, `punch_open_entry_request_help`.
- Eventos de notificação `punch_open_help_requested` e `punch_regularized`.

#### Notas
- A constraint de um único ponto aberto permanece ativa; nenhum registo é apagado
  nem fechado silenciosamente. Toda regularização exige motivo e gera auditoria em
  `time_entries_audit` (ADR-034).
- Validado em homologação (OMNIBIZ TESTES): regularização pelo gestor encerrou o
  ponto inconsistente, gravou auditoria e notificou o funcionário.

### 🐛 Ponto — erro genérico ao iniciar tarefa (2026-08-24)

#### Corrigido
- **Causa raiz comprovada:** `punch_start_v2` só verificava ponto aberto na
  *mesma* tarefa. Com um ponto aberto noutra tarefa, o `INSERT` violava
  `uniq_open_punch_per_user` (SQLSTATE 23505) e o frontend exibia apenas
  «Nao foi possivel registrar o ponto… Codigo: <correlation-id>».
  A RPC passa a devolver `ENTRY_ALREADY_OPEN` com o título da tarefa aberta,
  e a UI recarrega o ponto aberto no erro para exibir a tarefa a finalizar.
  Reproduzido (409/23505) e validado (200 + `ENTRY_ALREADY_OPEN`) em homologação.
- **`task_transition`:** chamada inválida `effective_minutes_round(v_total_sec/60.0)`
  (função tem assinatura `(numeric, numeric)`), que gerava
  `function public.effective_minutes_round(numeric) does not exist` ao
  concluir/cancelar/marcar ausência com ponto aberto. Corrigido para
  `effective_minutes_round(v_total_sec, 0)` — sem dupla divisão por 60.

---

### 🧪 Homologação de tickets — SUP-000065 e SUP-000077 (2026-08-23)

#### Corrigido
- **SUP-2026-000077 — funcionário não conseguia recusar tarefa.** A RPC
  `task_transition` grava `cancelled_by` na recusa, e o trigger
  `tasks_restrict_employee_update` bloqueava essa coluna para o responsável
  (`Sem permissao para alterar estes campos da tarefa`). O trigger passa a
  permitir exclusivamente a **auto-recusa** (`pendente|autorizado → cancelado`
  com `refusal_reason`, `refused_by = auth.uid()` e `cancelled_by = auth.uid()`).
  Todas as restantes colunas protegidas mantêm-se bloqueadas.

#### Adicionado
- **SUP-2026-000065 — reforço servidor:** trigger
  `trg_tasks_require_assignee` (`tasks_require_assignee_on_insert`) recusa
  criação manual de tarefa sem responsável (`auth.uid() IS NOT NULL AND
  recurrence_id IS NULL AND assigned_to IS NULL`), com a mesma mensagem da UI.
  Recorrências e rotinas internas não são afetadas; tarefas legadas sem
  responsável (29) permanecem intactas. `EXECUTE` revogado de `anon`/`authenticated`.

#### Validado (testes reais de interface)
- Gestor: criar tarefa sem responsável → toast «Atribua a tarefa a um
  funcionario antes de salvar.», sem `POST /rest/v1/tasks`, modal permanece aberto.
- Bypass da UI (token do gestor, insert direto) → **HTTP 400** `P0001`
  «Atribua a tarefa a um funcionário antes de salvar.».
- Regressão: criar tarefa **com** responsável → «Tarefa criada» (contador do
  funcionário 7 → 8).
- Funcionário: recusa com motivo → «Tarefa atualizada», estado **Cancelado**.
- RBAC inalterado: políticas de `tasks` continuam a permitir INSERT apenas a
  `is_company_manager` / `is_super_admin`; funcionário mantém SELECT/UPDATE
  restritos a `assigned_to = auth.uid()`.

---


### 👥 Fase B — Vínculos Cliente ↔ Responsável e multi-responsável (2026-08-23)

#### Adicionado
- **`tasks.task_group_id` / `task_recurrences.task_group_id`**: lote de criação
  multi-responsável. O fan-out mantém-se **uma tarefa por responsável** — estado,
  ponto, recusa e conclusão independentes; o grupo é apenas rastreio.
- **RPC `client_default_assignees(_client_id)`**: equipa ativa do cliente
  (`client_assignees` × `profiles.is_active`), com `is_primary` respeitado.
- **RPC `task_group_progress`**: progresso consolidado do lote para gestores.
- **Sugestão de equipa por cliente** no modal Nova Tarefa: ao escolher o cliente,
  os responsáveis são pré-carregados. Se o utilizador já tinha mexido na seleção,
  aparece confirmação explícita (*Usar equipa do cliente* / *Manter seleção*) —
  nunca há sobrescrita silenciosa. Cliente sem responsáveis mostra aviso.
- **Selo "em equipe"** nos cartões de tarefa, com explicação de independência.

#### Corrigido
- **Notificações de gestores duplicadas/ausentes em lotes.**
  `tasks_notify_insert` passa a notificar gestores **uma vez por lote**. A
  primeira tentativa usava `NOT EXISTS` sobre irmãos do grupo, mas triggers
  `AFTER ... FOR EACH ROW` de um `INSERT` multi-linha veem todas as linhas já
  inseridas — resultado: nenhum gestor era notificado. O critério passou a ser
  determinístico (menor `id` do grupo). Validado em base real: 1 notificação por
  responsável + exatamente 1 para o gestor.

---

### 🧭 Estabilidade da navegação — fonte canónica única (2026-08-19)

#### Corrigido
- **Menus autorizados desapareciam em algumas sessões** (Clientes, Tarefas e
  outros). Causa raiz: o menu do ramo *Restaurante & Delivery* (ADR-027)
  **substituía** a árvore geral em vez de acrescentar-se a ela. Empresas com
  `business_vertical = restaurant_delivery` (ex.: Grupo V-clean, Dinâmica
  Solução) perdiam Tarefas, Clientes, Contratos, RH · Recibos e Frota no menu,
  embora `enabled_modules` os mantivesse ativos e as rotas continuassem a
  funcionar por URL direta — inconsistência estrutural menu ↔ rota.
- **Contexto em carregamento deixou de ser tratado como "sem permissão".**
  Enquanto empresa/módulos não estão resolvidos (`contextReady === false`), a
  navegação mostra skeleton; o guard de módulo por rota também só corre depois.
- **Estado de grupos colapsados** saneado (`omnibiz:sidebar:groups:v2`): apenas
  valores `true` são persistidos, chave v1 é removida, lixo de sessões antigas
  já não esconde itens.
- **Mobile web:** o rodapé da sidebar (Perfil · Trocar empresa · Sair) fica
  sempre visível — altura `100dvh` em vez de `100vh` e
  `env(safe-area-inset-bottom)`. Estrutura em três regiões: header fixo,
  navegação rolável, rodapé fixo.

#### Adicionado
- `src/lib/navigation.ts` — `resolveAvailableNavigation(context)` e
  `resolveAuthorizedPaths(context)`: fonte canónica única de navegação para
  Desktop e Drawer Mobile (ADR-030). Nenhuma lista paralela.


### 📲 Notificações WhatsApp — worker, idempotência e auditoria (2026-07-26)

#### Adicionado
- `whatsapp_notifications.dedupe_key` com índice único parcial
  (`pending | sending | sent`) — a mesma alteração nunca gera dois avisos,
  mesmo com retry de RPC, dupla execução ou concorrência.
- Estado `sending` e colunas `next_attempt_at`, `max_attempts`, `locked_at`,
  `http_status`, `response_body`.
- RPCs de worker: `whatsapp_claim_batch` (`FOR UPDATE SKIP LOCKED`),
  `whatsapp_mark_sent`, `whatsapp_mark_failed` (backoff exponencial
  30 s → 3600 s, `max_attempts` 5) e `whatsapp_requeue` (Super Admin).
- Rota `POST /api/public/whatsapp/dispatch` — worker de envio ao ActivePieces,
  autenticado por `apikey`, timeout de 10 s, URL do webhook em secret de
  servidor (`ACTIVEPIECES_WEBHOOK_URL`).
- Agendamento `pg_cron` `whatsapp-dispatch-minute` (a cada minuto).
- Painel **Fila de notificações WhatsApp** em `/app/admin/suporte`
  (`WhatsappQueuePanel`) com estado, tentativas, erro e reenfileiramento.

#### Alterado
- Trigger de tickets deixou de usar cadeia `ELSIF`: várias alterações na mesma
  transação geram todos os eventos correspondentes.
- Novos eventos `ticket_priority_changed`, `ticket_resolved`, `ticket_reopened`.

#### Corrigido
- `search_path = public` fixado em `delete_email`, `enqueue_email`,
  `move_to_dlq` e `read_email_batch` (dívida pré-existente).

### 📲 Notificações WhatsApp de tickets — base e destinatário único (2026-07-26)

#### Adicionado
- `profiles.whatsapp` com validação E.164 e campo no ecrã **Meu Perfil**.
- `company_hr_settings.default_support_manager_id` — **Responsável padrão do
  Suporte** por empresa, configurável em `/app/empresa`.
- `public.platform_settings` (tabela singleton `id = 1`, RLS só Super Admin)
  com `default_support_super_admin_id`, configurável em `/app/admin/suporte`.
- `public.whatsapp_notifications` (outbox) com estados
  `pending | sent | failed | skipped`, `last_error`, RLS por empresa para
  gestores e global para Super Admin.
- `public.resolve_ticket_whatsapp_recipient` — devolve **no máximo um**
  destinatário válido (perfil ativo, papel compatível, WhatsApp E.164).
- `public.enqueue_ticket_whatsapp` + triggers em `support_tickets` e
  `support_ticket_messages` (outbox transacional). Sem destinatário válido,
  o registo é criado com `status = 'skipped'` e motivo específico.
- ADR-024.

### 🛠 SUP-2026-000040 + SUP-2026-000045 — Ordenação de tarefas e fluxo de férias (2026-07-26)

#### Adicionado
- **Ordenação canônica única** de tarefas em `src/lib/tasks.ts`
  (`sortTasksForDisplay`, `compareTasksForDisplay`, `compareTasksChronologically`):
  em andamento → atrasadas (mais antigas primeiro) → pendentes (mais próximas
  primeiro) → ausentes → concluídas → canceladas. No mesmo dia, tarefas sem
  horário definido vêm após as com horário; recorrências ordenam pela
  ocorrência, nunca pela série-mãe.
- **Regularização manual de ponto** pelo funcionário (`punch_employee_regularize`,
  `origin='manual_adjustment'`): nova secção "Pendentes de regularização" em
  `/app/ponto` com hora real de início/fim e motivo obrigatório, com auditoria.
- **Detalhe de pedido de férias por deep-link** (`/app/ferias?request=<id>`),
  abrindo estado, período, aprovador e decisão registada.

#### Corrigido
- Aprovação de férias solicitadas pelo próprio funcionário deixa de exigir
  nova confirmação: `vacation_decide` só entra em `pendente_confirmacao`
  quando o pedido foi **criado por outra pessoa** (`created_by <> user_id`).
- Notificações de férias passam a incluir `vacation_id` e levam ao pedido
  correto; o botão de ação permanece disponível após a leitura.
- Tarefas anteriores atrasadas, não iniciadas ou ausentes deixam de ocupar o
  destaque da operação e **não bloqueiam** o início da tarefa seguinte.
- Removidas ordenações locais dispersas em `/app/tarefas`, `/app/ponto` e no
  dashboard do funcionário (ponto único de ordenação).

### 🧭 Suporte em 2 Níveis — Triagem do Gestor (2026-07-23)

#### Adicionado
- **Fluxo oficial de 2 níveis** na Central de Suporte:
  - **Nível 1 (Empresa · Gestor):** funcionário abre ticket → gestor triagena,
    solicita informação, resolve internamente ou encaminha ao Desenvolvimento.
  - **Nível 2 (Técnico · Super Admin):** SA atua apenas em tickets escalados
    ou criados diretamente por SA; pode devolver a triagem ao Gestor.
- Colunas em `support_tickets`: `support_level`, `current_owner_role`,
  `created_by_role`, `escalated_to_super_admin`, `escalated_at`,
  `escalation_reason`, `escalation_technical_summary`,
  `manager_resolution_summary`, `manager_resolved_at`,
  `returned_to_manager_at`, `return_reason`.
- Enum `support_ticket_status` estendido com `under_manager_review`,
  `waiting_employee`, `resolved_by_manager`, `escalated`,
  `under_technical_review`, `waiting_manager`, `returned_to_manager`.
- Novas RPCs `SECURITY DEFINER`: `escalate_support_ticket`,
  `resolve_support_ticket_by_manager`, `manager_request_information`,
  `return_support_ticket_to_manager`, `support_notify_managers` +
  `create_support_ticket` v2 com autodetecção de papel.
- UI: rota `/app/suporte` liberada para `employee` ("Meu Suporte"),
  botão global **Reportar problema** disponível para funcionários,
  painéis de ação role-conditional no detalhe (Gestor: solicitar info,
  resolver internamente, encaminhar; SA: devolver ao Gestor),
  bloco "Nível do ticket" com histórico de escalonamento/devolução.
- Central Global do SA (`/app/admin/suporte`) agora filtra por
  `support_level=technical OR created_by_role=super_admin`.

#### Segurança
- RLS reforçada: `employee` só vê os próprios tickets/mensagens/anexos;
  notas internas continuam ocultas para não-admins. Trigger
  `prevent_forbidden_updates` impede funcionário de alterar status,
  prioridade ou nível.
- Backfill: tickets pré-existentes marcados como `technical` +
  `current_owner_role=super_admin` para preservar carga operacional atual.

### 🛠️ Correções Operacionais — Tarefas & Horário-Parede (2026-07-17)

#### Corrigido
- **Divergência de horário Gestor × Funcionário (P1).** Quatro pontos da
  visão do funcionário renderizavam `scheduled_for` com
  `new Date(iso).toLocaleString/toLocaleTimeString`, o que interpreta o
  timestamp armazenado (carimbado como `...Z` para preservar horário-parede)
  como UTC e converte para o fuso do dispositivo — resultando em desvio
  de 1h para operadores em `Europe/Lisbon` no verão (14:06 do Gestor
  aparecia como 15:06 para o Funcionário).
  - `src/routes/app.ponto.tsx` (hero, cabeçalho de execução, fila "Depois").
  - `src/components/dashboards/EmployeeDashboard.tsx` (lista "Próximas tarefas").
  - Passaram todos a usar `formatWallDate` / `formatWallTime` de
    `src/lib/wall-clock.ts`, que já é o padrão oficial para exibição de
    horários operacionais.
- **Recorrência com fallback silencioso de 60 minutos.** `emptyRecurrence()`
  em `RecurrenceForm.tsx` inicializava `scheduledTime: "09:00"` e
  `durationMinutes: 60`. Embora esses campos já sejam sobrescritos no
  submit por valores derivados do topo do formulário (start_stop) ou
  fixados em `00:00` / 0 (manual), o default residual foi removido para
  eliminar qualquer risco de fallback silencioso.

#### Adicionado
- **Tarefa sem horário para clientes em modo Manual.** O formulário de
  criação/edição agora exibe hint informativo quando o cliente selecionado
  tem `timing_mode = 'manual'`, marcando Início/Fim como opcionais e
  esclarecendo que o funcionário informará entrada/saída na Folha de
  Ponto. A UI passa a exibir **"Sem horário definido"** em listas do
  Gestor, no painel do Funcionário e no dashboard quando `scheduled_for`
  é nulo (a coluna já era nullable no banco — nenhuma migration necessária).

#### Não alterado
- Nenhuma alteração em RLS/RBAC, schema, RPCs, políticas ou UUIDs.
- Timestamps reais de ponto (`time_entries`) permanecem intocados.
- Detalhamento em `docs/homologacoes/CORRECOES_TAREFAS_SUPORTE_V1.md`.

---

### 🔒 Correção Crítica de Segurança — RLS cross-tenant (2026-07-16)

#### Corrigido
- **P0 — Isolamento multiempresa em anexos e mensagens de suporte.**
  As policies `INSERT` de `public.support_ticket_attachments` e
  `public.support_ticket_messages` continham a comparação
  autorreferencial `t.company_id = t.company_id` (sempre verdadeira),
  permitindo teoricamente que um Gestor da Empresa A inserisse
  anexos/mensagens referenciando um `ticket_id` da Empresa B.
- Corrigido para `t.company_id = support_ticket_<tabela>.company_id`,
  garantindo que o ticket referenciado pertence à mesma empresa
  informada na linha nova. Demais predicados preservados
  (`is_company_manager`, `uploaded_by/author_user_id = auth.uid()`,
  `is_internal = false` para mensagens).
- Nenhuma alteração em RBAC, dados, RPCs ou funcionalidades. Super
  Admin permanece coberto pela policy `ALL` existente.
- Auditoria completa das 4 tabelas do módulo — nenhuma outra
  comparação autorreferencial detectada. Registrado `KI-027` para
  endurecimento futuro de `UPDATE` de `support_tickets`
  (mutabilidade de `company_id`).

### Central de Suporte — Painel Operacional do Super Admin (2026-07-16)

#### Adicionado
- **RPC `get_support_ticket_requester_info(_ticket_id)`** (`SECURITY DEFINER`,
  `search_path = public`): retorna nome do solicitante, email
  (`auth.users.email`) e nome da empresa. Autorizado a Super Admin
  sempre; Gestor/Owner apenas para tickets da própria empresa.
  Nenhuma alteração de RLS ou tabelas.
- **Detalhe do ticket enriquecido** (`/app/suporte/$id`):
  - Bloco *Dados gerais* com empresa, solicitante, email (clicável +
    copiar), datas de abertura/atualização/resolução/fechamento.
  - Bloco *Local do erro* com módulo, rota e URL (link externo + copiar).
  - Bloco *Informações técnicas* (collapsible) com build, commit,
    ambiente, navegador, plataforma, idioma, resolução, viewport e
    timezone; botão *copiar JSON* do contexto completo.
  - Grid de anexos com miniaturas para imagens, ícone para PDFs,
    Signed URLs (900s) e ação de download por item.
  - Timeline unificada em ordem cronológica (eventos + mensagens),
    com rótulos humanos (`EVENT_TYPE_LABEL`).
  - Nome do autor nas mensagens (Solicitante / Suporte / Você).
  - Botão *copiar título+descrição* e *copiar número*.
- **Respostas rápidas** (Super Admin apenas): 7 templates prontos
  (Recebido, Em análise, Preciso de mais informação, Problema
  identificado, Correção aplicada, Atualize o sistema, Encerramento).
- **Central Global (`/app/admin/suporte`) — filtros e KPIs
  operacionais**:
  - Filtros por status, prioridade, tipo, empresa (populada da
    query) e intervalo de datas.
  - Pesquisa passa a considerar também a descrição.
  - Ordenação corrigida: prioridade (urgente → alta → normal → baixa),
    depois abertos primeiro, depois **mais antigos primeiro** (FIFO
    operacional).
  - 6 KPI-cards clicáveis: Total, Abertos, Urgentes (não fechados),
    Em análise, Aguardando cliente, Resolvidos hoje.
  - 4 painéis adicionais: tempo médio de 1ª resposta, tempo médio de
    resolução, top 3 empresas e top 3 módulos.
- **Cores de prioridade padronizadas** conforme spec Sara:
  urgente = vermelho, alta = laranja, normal = azul, baixa = cinza.

#### Segurança
- Nenhuma política RLS alterada. A nova RPC replica no plpgsql o
  mesmo predicado de acesso já existente em `support_tickets`
  (`has_role('super_admin')` ou pertencer à empresa via
  `profiles.current_company_id` / `company_id_primary`).
- `auth.users.email` acessado apenas dentro do `SECURITY DEFINER`;
  nunca exposto por join no cliente.

#### Documentação
- `docs/ARCHITECTURE_SUPPORT_TICKETS.md` — nova seção *Painel
  operacional do Super Admin*.
- `docs/HOMOLOGACAO_SUPORTE_V1.md` — bateria de homologação.
- `docs/KNOWN_ISSUES.md` — registrada KI-026 (respostas rápidas não
  editáveis pelo Super Admin nesta fase; edição na Fase 2).

### Correção da Homologação Sara V1.0 (2026-07-16)

#### Segurança
- **`/app/rh` e filhos protegidos por RoleGuard de layout**: a rota
  passou a ser um layout `_authenticated`-only com guarda para
  `manager`/`owner`/`super_admin`. Funcionário digitando `/app/rh`,
  `/app/rh/recibos` ou qualquer filho é redirecionado a `/app` — o
  menu deixa de ser o único mecanismo de segurança.
- **`/app/frota/cartoes` protegido por RoleGuard** (gestor/owner/super
  admin). Cartões de combustível deixam de ser acessíveis por URL
  direta a funcionários.

#### Corrigido
- **Recibos do Gestor abrem a tela própria**: `app.rh.tsx` era um leaf
  sem `<Outlet />` e engolia `/app/rh/recibos`, redirecionando para o
  Dashboard RH. A rota agora é `app.rh.index.tsx` e o layout `app.rh`
  monta os filhos via `<Outlet />`.
- **Recorrência sem horário/duração no bloco**: o formulário agora
  exibe apenas Data inicial / Data final. Horário e duração são
  herdados do topo do modal (Início/Fim). Em clientes `timing_mode =
  manual`, a hora é preenchida no apontamento.
- **Edição de recorrência com escopo obrigatório**: o diálogo oferece
  apenas "Apenas esta ocorrência" e "Esta e todas as futuras". A
  opção silenciosa "Recorrência completa" foi removida.
- **Duração exibida em HH:MM** (`formatDuration`) — nunca minutos
  brutos ao utilizador.
- **Separadores do editor de colaborador** renomeados para
  "Contabilidade/RH" e "Documentos" (apenas rótulos visuais; rotas,
  APIs e banco preservados).

### Módulo Central de Suporte — Fase 1 (2026-07-16)

#### Adicionado
- **Central de Suporte** disponível no menu do Gestor/Owner em
  `/app/suporte`, e **Central Global** exclusiva do Super Admin em
  `/app/admin/suporte`. Funcionário não tem acesso.
- **Botão global “Reportar problema”** no header do AppLayout: preenche
  automaticamente rota, URL, navegador, resolução, timezone, build e
  commit; nunca envia senha ou token.
- **4 tabelas** com RLS por `company_id`, GRANTs explícitos e trigger
  append-only para eventos:
  - `support_tickets` (com número humano `SUP-YYYY-NNNNNN` gerado
    automaticamente);
  - `support_ticket_messages` (com flag `is_internal` — nota interna
    visível apenas ao Super Admin);
  - `support_ticket_attachments` (metadados + hash SHA-256);
  - `support_ticket_events` (append-only; `UPDATE`/`DELETE` bloqueados
    por trigger).
- **7 RPCs `SECURITY DEFINER`** com validação de papel no servidor:
  `create_support_ticket`, `post_support_ticket_message`,
  `update_support_ticket_status`, `update_support_ticket_priority`,
  `assign_support_ticket`, `reopen_support_ticket`,
  `register_support_attachment`. Todas registram evento na timeline e
  disparam notificações via `support_notify_super_admins` /
  `support_notify_user`.
- **Rate limit** de 20 tickets por utilizador nas últimas 24h (server-side).
- **Bucket privado `support-ticket-attachments`** com RLS por
  `company_id` (Super Admin acesso total; Gestor apenas pasta da
  própria empresa). Signed URLs de 10 min. Tipos aceitos: imagem
  (PNG/JPEG/WEBP/GIF), PDF, DOC/DOCX, XLS/XLSX, TXT/CSV. Vídeo não
  suportado. Limite 20 MB.
- **Timeline append-only** exibida no detalhe do ticket.
- **Reabertura pelo Gestor** dentro de 7 dias do fechamento
  (`ticketReopenableByManager`); Super Admin pode reabrir sempre.
- **Realtime** publicado em `support_tickets`, `support_ticket_messages`
  e `support_ticket_events`.
- **6 novos eventos** no enum `notification_event`: `ticket_created`,
  `ticket_updated`, `ticket_message_added`, `ticket_status_changed`,
  `ticket_resolved`, `ticket_reopened`.

#### Segurança
- Todas as regras validadas server-side via RLS + RPC. Nenhuma
  confiança no frontend. Notas internas nunca aparecem em queries do
  Gestor (policy `support_ticket_messages` filtra por `is_internal =
  false`). Nomes de arquivo sanitizados; caminho no bucket segue
  `<company_id>/<ticket_id>/<uuid>-<nome>`.
- Ticket, mensagem, anexo ou evento nunca são apagados fisicamente:
  apenas mudanças de status (`fechado`, `rejeitado`) ou `archived_at`
  para eventual arquivamento futuro.

#### Documentação
- Documentação de arquitetura em `docs/ARCHITECTURE_SUPPORT_TICKETS.md`.
- Fase 2 (emails transacionais, dashboards, KPIs Super Admin/Gestor) e
  Fase 3 (manuais PDF, homologação E2E, release notes) pendentes.

### Restauração das credenciais de homologação (2026-07-16)

#### Corrigido
- **Senhas de homologação (`manager@homologacao.test`,
  `employee@homologacao.test`)** redefinidas para `Homolog@2026`
  via `UPDATE auth.users SET encrypted_password = crypt(..., gen_salt('bf'))`
  com trava dupla por `email` **e** `id`. UUIDs preservados
  (`549e267d-6809-473c-9f50-04c413026564` e
  `58f72122-cd91-4db6-9fd0-55bd66885ce3`). Nenhuma linha de
  `profiles`, `user_roles`, `companies`, `tasks`, `time_entries`,
  `time_entries_audit`, `notifications`, `payslips`, `contracts` ou
  qualquer tabela operacional foi tocada.
- **Validação E2E:** ambos os utilizadores autenticam via
  `/login` (`grant_type=password → 200`), recebem `access_token`,
  são redirecionados para `/app`, hidratam empresa (`OMNIBIZ TESTES`,
  `eec32f9a-32ad-4af8-9c10-25eb9cd26099`), papel correto (`manager` /
  `employee`) e histórico intacto (tarefas COIFA legadas visíveis para
  o gestor).
- **Super Admin (`edurts.pt@gmail.com`) intencionalmente não tocado.**
  Conta pertence ao dono do produto, autentica normalmente com senha
  real (último login registado em `2026-07-15 15:28`). Menções à
  senha `Homolog@2026` para essa conta em documentos anteriores devem
  ser lidas como *descrição do padrão de homologação*, não como
  aplicação efetiva sobre a conta real.

#### Observações estruturais (fora do escopo, registadas em KNOWN_ISSUES)
- KI-023: `public.user_roles` sem `UNIQUE(user_id, role)` — Super
  Admin acumulou 615 linhas duplicadas de `super_admin`.
- KI-024: `public.profiles.is_active = false` para o Super Admin,
  apesar de o login funcionar (campo não é consultado no gate de auth).

#### Impacto
- **KI-022 → parcialmente resolvido** para as contas de homologação
  operacionais (manager/employee). Super Admin sai do escopo.

### Atualizações Operacionais V1.0 — Bloco 3 (Fases H · I) (2026-07-16)

#### Adicionado
- **Documento consolidado da versão** `docs/ATUALIZACOES_OPERACIONAIS_V1_0.md`
  cobrindo as 9 novidades V1.0 com formato Objetivo · Como utilizar ·
  Benefícios · Observações · FAQ e marcadores de screenshot.
- **Release Notes por público** em `docs/release-notes/`:
  - `RELEASE_NOTES_ADMIN_V1.0.md`
  - `RELEASE_NOTES_GESTOR_V1.0.md`
  - `RELEASE_NOTES_FUNCIONARIO_V1.0.md`
- **Manuais operacionais** receberam addendum V1.0
  (`docs/manuals/Manual_Operacional_Gestor.md`,
  `docs/manuals/Manual_Operacional_Funcionario.md`).
- **PDFs** dos manuais gerados em `/mnt/documents/omnibiz-v1.0/`.
- **ADR-019** — Filtros de listagem em Tarefas via search-params validados.
- **ADR-020** — `EmployeePicker` como componente canônico.
- **Roadmap Técnico Futuro** em `docs/DECISIONS.md` — 10 recomendações
  arquiteturais identificadas durante V1.0.
- **KI-022** — Reset de senhas de homologação não executável do sandbox.

#### Fase H — não executada tecnicamente
O reset em massa das contas de homologação (`Homolog@2026`) não foi
executado pelo sandbox por ausência de service-role acessível e do wiring
de `functionMiddleware` em `src/start.ts`. Procedimento e workaround
documentados em KI-022 e no item 4 do "Roadmap Técnico Futuro".

### Atualizações Operacionais V1.0 — Bloco 2 (Fases F · G) (2026-07-16)

#### Adicionado
- **Dashboard clicável por status** (`src/routes/app.index.tsx`). Cards
  Pendentes / Em andamento / Concluídas / Atrasadas agora navegam para
  `/app/tarefas` já com o filtro aplicado via search-param
  (`?status=pendente|em_andamento|concluido|atrasadas`). "Atrasadas" é filtro
  derivado (não é status persistido): `status ≠ concluido` + `due_at < now()`.
- **Filtros de status + funcionário em `/app/tarefas`**
  (`src/routes/app.tarefas.tsx`). `validateSearch` valida `status` e
  `employee`; barra de chips troca o filtro sem recarregar; picker no topo
  filtra por responsável. Estado persistente na URL — compartilhável e
  bookmarkable.
- **Rollout do `<EmployeePicker />` como filtro de listagem**:
  - `/app/tarefas` (visão gestor)
  - `/app/despesas` (filtro de colaborador)
  - `/app/ferias` (filtro de colaborador)
  - `/app/ponto/gestao` (filtro de funcionário)
  Padrão único (busca por nome/cargo/equipe/email, debounce 180 ms,
  virtualização automática > 60 itens) substitui os antigos `<Select>` de
  colaborador nesses módulos.

#### Notas de compatibilidade
- Nenhuma migration necessária.
- Search-params são retro-compatíveis: URLs antigas (`/app/tarefas` sem
  query) continuam funcionando — filtros ficam em "Todos".
- RH (recibos) e Comercial não possuíam filtro de colaborador em listagens
  — nada foi retrocedido. Adoção do picker nesses módulos fica registrada
  em `docs/KNOWN_ISSUES.md` como oportunidade futura.

### Atualizações Operacionais V1.0 — Bloco 1 (Fases C · D · E) (2026-07-16)

#### Adicionado
- **Card "Valores padrão" em `/app/empresa`** (`src/routes/app.empresa.tsx`,
  componente `DefaultRatesCard`). Manager/owner/super_admin configuram
  `default_hourly_rate`, `default_fixed_rate` e `default_monthly_rate` na tabela
  `companies`. Deixar em branco = herança desligada.
- **Sobrescrita de valores por funcionário** na aba Financeiro do
  `EmployeeEditor` (`src/components/equipe/EmployeeEditor.tsx`,
  `TabFinanceiro`). Novos campos `manual_hourly_rate`, `manual_fixed_rate`,
  `manual_monthly_rate` na `profiles`. Herdam do cliente/empresa quando `NULL`.
- **Recorrência condicional por modo de apontamento**
  (`src/components/tasks/RecurrenceForm.tsx`). Novo prop opcional `timingMode`:
  quando `manual`, os campos "Horário" e "Duração estimada" ficam ocultos —
  apenas datas são requeridas. Consumidor (`src/routes/app.tarefas.tsx`)
  passa `timing_mode` do cliente selecionado; sem cliente, mantém o
  comportamento clássico (`start_stop`).

#### Banco (migration `20260716…manual_rate_overrides`)
- `profiles.manual_hourly_rate numeric(12,4)` (nullable)
- `profiles.manual_fixed_rate numeric(12,4)` (nullable)
- Comentários COLUMN documentam a herança ADR-017.
- Nenhuma alteração em RLS, GRANTs ou RBAC.

### Fase 5 — Onboarding automático de empresas (2026-07-07)

#### Adicionado
- **Envio automático do convite ao criar empresa (Super Admin):** `src/routes/app.admin.tsx`
  agora dispara o email de convite imediatamente após `admin_create_company_with_invite`,
  usando o helper unificado `sendInviteEmail` (registado em `email_send_log`,
  `trigger_source='invite'`). Toast: "Empresa criada com sucesso. Convite enviado para …".
  Envio manual permanece disponível apenas como contingência dentro de `<details>`.
- **`src/lib/invites/send-invite-email.ts`** — helper único para create/resend/replace
  (ADR-015). `idempotencyKey` derivada de `kind + inviteId + sendCount`.
- **`ManagerInviteCard`** em `src/components/empresa/ManagerInviteCard.tsx`, incluído
  em `/app/empresa` para super_admin e owner: lista convites de gestor com badge
  de status (Pendente/Aceito/Expirado/Revogado), contagem de envios, últimos
  timestamps, botão **Reenviar** (RPC `resend_invite`) e **Alterar email** (nova
  RPC `admin_replace_manager_invite`).
- **RPC `admin_replace_manager_invite(_invite_id, _new_email)`** SECURITY DEFINER:
  revoga o convite pendente e cria um novo com o novo email (mesma empresa/role).
- **RPC `admin_revoke_user_from_company(_email, _company_id)`** SECURITY DEFINER:
  remove `user_roles`, revoga convites pending/accepted e limpa
  `profiles.current_company_id`/`company_id_primary` para a empresa alvo. Não toca
  em `auth.users`, notificações, documentos ou histórico. Proteção: nunca remove
  o único owner da empresa.

#### Alterado
- `admin_create_company_with_invite` agora retorna também `invite_id` e
  `invite_email` (adição retrocompatível — nomes de coluna).

#### Manutenção
- Removidos os vínculos operacionais de `letrasmodestas@hotmail.com` na empresa
  **OMNIBIZ TESTES** (`eec32f9a-32ad-4af8-9c10-25eb9cd26099`): 1 role removida,
  1 invite `accepted` → `revoked`. Utilizador preservado no Auth; convite
  pendente noutra empresa e histórico intactos.

#### Decisões arquiteturais
- ADR-014 — Convites disparam email **automaticamente**. Envio manual só existe como
  fallback quando o send falha.
- ADR-015 — Todo envio de convite passa pelo helper `sendInviteEmail`.

---

### Fase 4 — Infraestrutura Realtime + EmployeePicker (2026-07-06)

#### Adicionado
- **Infraestrutura Realtime unificada:** `src/lib/realtime/subscribe.ts` expõe
  `useRealtimeSubscription` e `useRealtimeInvalidate`. Assinaturas seguem
  `cloud-realtime` (montagem em `useEffect`, cleanup obrigatório, canal único
  por escopo). Reutilizável em RH, Tarefas, Férias, Despesas, Comercial, Frota,
  Recibos e Contratos.
- **Helper de cache de Notificações:** `src/lib/cache/notifications.ts`
  (`invalidateNotificationsCache`), seguindo o padrão do helper de Clientes.
- **Scaffold `src/lib/events/`:** README + `types.ts` reservam o espaço para
  Domain Events (ADR-007). Sem implementação funcional.
- **`<EmployeePicker />` reutilizável** em `src/components/common/EmployeePicker.tsx`
  com debounce 180 ms, busca normalizada (case+acento) por nome, cargo, equipe
  e email, virtualização leve (`slice`) acima de 60 itens, acessibilidade
  (`role="combobox"`, foco visível) e contrato aberto (`EmployeeOption`).

#### Alterado
- `src/routes/app.notificacoes.tsx`: subscribe Realtime e invalidations agora
  passam pela nova infraestrutura e helper de cache. Nenhuma alteração de UI.
- `src/components/tasks/ReassignDialog.tsx`: `<Select>` de responsável trocado
  pelo `<EmployeePicker />` (mantém a mesma prop `members` — retrocompatível).
- `src/routes/app.tarefas.tsx`: query `members` agora projeta também
  `job_title` para enriquecer a busca no picker (adição não-quebrante).

#### Decisões arquiteturais
- ADR-011 — Infraestrutura Realtime única (`useRealtimeInvalidate`) obrigatória para todo módulo novo.
- ADR-012 — Helpers de cache por módulo. Novos módulos não podem chamar `qc.invalidateQueries` diretamente para tabelas cobertas por helper.
- ADR-013 — Componentes reutilizáveis em `src/components/common/*` como padrão.

#### Documentação
- `docs/DECISIONS.md`: adicionadas ADR-011, ADR-012 e ADR-013.
- `docs/KNOWN_ISSUES.md`: KI-007 (subscribers Realtime duplicados) registrado como Resolvido preventivamente.
- `docs/ARCHITECTURE_INDEX.md`: entradas para `src/lib/realtime/`, `src/lib/events/` e `EmployeePicker`.

#### Compatibilidade
- Nenhuma alteração em banco, RLS, RBAC, RPCs ou schemas.
- Assinatura pública de `ReassignDialog` preservada (aceita o mesmo tipo mais amplo `EmployeeOption`).
- Adicionar `job_title` à projeção de `profiles` não altera dados existentes.
- `tsgo --noEmit` aprovado.

---

### Fase 3 — Correções P0 (2026-07-06)

#### Corrigido
- **KI-001 · Geocoding `REQUEST_DENIED`:** geocoding direto e reverso migrados para server functions (`geocodeAddressFn`, `reverseGeocodeFn` em `src/lib/maps/geocoding.functions.ts`) que chamam o Lovable Connector Gateway (`google_maps`). Segredos (`LOVABLE_API_KEY`, `GOOGLE_MAPS_API_KEY`) permanecem exclusivamente server-side. O provider `google.ts` foi atualizado internamente; contrato `MapProvider` preservado (retrocompatível).
- **KI-002 · Cache de Clientes desatualizado:** criado helper central `invalidateClientsCache(qc)` em `src/lib/cache/clients.ts`. Todas as mutations e subscribers Realtime em `src/routes/app.clientes.tsx` migrados para o helper — nenhuma invalidação avulsa restante para prefixos de `public.clients`.

#### Decisões arquiteturais
- ADR-009 — Geocoding server-side via Lovable Connector Gateway.
- ADR-010 — Cache central de Clientes (`invalidateClientsCache`).

#### Documentação
- `docs/KNOWN_ISSUES.md`: KI-001 e KI-002 marcados **Resolvidos**.
- `docs/DECISIONS.md`: adicionadas ADR-009 e ADR-010.

#### Compatibilidade
- Nenhuma alteração em banco, RLS, RBAC ou RPCs.
- Contrato `MapProvider.geocode/reverseGeocode` inalterado.
- Nenhum novo segredo — reuso das credenciais já injetadas pelo conector Google Maps Platform.

---

### Fase 2 — Correções triviais (2026-07-06)

#### Adicionado
- `docs/CHANGELOG.md` como documento oficial do projeto.
- Item 05 · Dashboard clicável: os cartões "Pendentes / Em andamento / Concluídas / Atrasadas" e cada linha de "Próximas tarefas" agora navegam para `/app/tarefas`. Adicionado botão "Ver todas". Estados de hover, foco visível e `aria-label` descritivo (`src/routes/app.index.tsx`).
- Item 15 · Proteção contra tradução automática: `<html lang="pt-BR" translate="no" className="notranslate">` e `<meta name="google" content="notranslate">` em `src/routes/__root.tsx`, corrigindo `Hydration failed` provocado pela tradução do Chrome/Edge.

#### Verificado (sem alteração de código)
- Item 10 · Recorrência HH:MM: inputs de horário já utilizam `type="time"` (HH:MM nativo) em `RecurrenceForm.tsx` e `EditRecurrenceDialog.tsx`. Persistência normaliza para `HH:MM:00`; exibição em `app.tarefas.recorrentes.tsx` usa `slice(0,5)`. Nenhum ajuste necessário — comportamento em conformidade.
- Item 13 · Fluxo de férias (UI): revisão realizada em `src/routes/app.ferias.tsx`. Nenhuma alteração aplicada nesta fase; refinamentos maiores foram reclassificados para Fase 5 conforme princípios arquiteturais (auditoria + realtime) definidos em `docs/ARCHITECTURE_PRINCIPLES.md`.

#### Documentação
- `docs/KNOWN_ISSUES.md`: registrados KI-005 (Dashboard) e KI-006 (Tradução automática) como Resolvidos.

#### Compatibilidade
- Nenhuma alteração em banco, RLS, RBAC, RPCs ou contratos de dados.
- Nenhuma alteração em componentes reutilizáveis (apenas rota do Dashboard e shell raiz).
- 100% retrocompatível com a Fase 1 e com todos os módulos homologados.

---

## [v1.0] — Geolocalização (Produção Aprovada)

Consulte `docs/RELEASE_NOTES_GEOFENCING_v1.0.md` e `docs/RELEASE_HISTORY.md`.
---

## [Correção] Cliente Manual não pode ser marcado como ausente

#### Banco (fonte única de verdade)
- Novo helper `public.task_timing_is_manual(uuid)`.
- `tasks_sweep_absent` e `notifications_sweep_late` passam a ignorar tarefas de
  clientes com `timing_mode = 'manual'`.
- `task_transition` recusa `marcar_ausente` para tarefas de clientes manuais.
- Nova RPC `public.tasks_timing_modes(uuid[])` para a UI resolver o modo mesmo
  quando a RLS de `clients` não permite leitura ao funcionário.
- Registos `ausente` de clientes manuais revertidos para `pendente`, com nota de
  auditoria acrescentada à descrição (nenhum histórico removido).

#### Frontend
- `src/lib/tasks.ts`: `isVisuallyLate` e `canBecomeAbsent` devolvem `false` para
  clientes manuais; novo `attachClientTimingModes`.
- `src/routes/app.tarefas.tsx` e `src/routes/app.ponto.tsx`: tarefas enriquecidas
  com `client_timing_mode`.

#### Compatibilidade
- Clientes `start_stop` mantêm exatamente o comportamento anterior.
- Ver ADR-025 em `docs/DECISIONS.md`.

## [UI] Padronização global dos modais — Design System único

Todos os modais, dialogs, sheets e drawers passam a usar um padrão canónico
único, moderno e responsivo. **Nenhuma alteração de banco de dados, RBAC, RLS,
queries, mutations ou fluxos funcionais.**

#### Núcleo (primitivos canónicos)
- `src/components/ui/dialog.tsx`: novos `ModalHeader` (ícone + título + subtítulo
  + fechar 44×44px), `ModalBody` (único elemento rolável), `ModalFooter` (fixo no
  fundo, ações à direita no desktop e empilhadas no mobile), `ModalSection`
  (cards internos) e `ModalTabsBar`. `DialogContent` ganhou variantes de largura
  (`sm`, `md`, `lg`, `xl`) e é full-screen no mobile.
- `src/components/ui/sheet.tsx` e `src/components/ui/drawer.tsx`: shells em
  flex-column sem padding próprio, reexportando `ModalHeader`/`ModalFooter`.
- `src/components/ui/alert-dialog.tsx`: alinhado à mesma linguagem visual.
- `src/lib/utils.ts`: removidos os helpers legados (`modalContentFrame`,
  `modalSafePadding`, `modalHeaderChrome`, `modalHeaderPadding`,
  `modalTitleChrome`, `modalCloseChrome`), causa dos scrolls aninhados.

#### Ecrãs migrados
- Tarefas: `app.tarefas.tsx`, `EditRecurrenceDialog.tsx`, `ReassignDialog.tsx`.
- Ponto: `app.ponto.tsx`, `PunchEditorDrawer.tsx`, `PunchAuditDrawer.tsx`,
  `PunchGeoDrawer.tsx`, `PunchFlowOverlay.tsx`.
- Equipa/Clientes: `app.equipe.tsx`, `EmployeeEditor.tsx` (abas em `ModalTabsBar`
  + rodapé único que submete o formulário da aba ativa), `app.clientes.tsx`,
  `app.comercial.clientes.tsx`, `ManagerInviteCard.tsx`.
- RH/Admin/Suporte: `app.rh.recibos.tsx`, `app.admin.tsx`, `NewTicketDialog.tsx`.

#### Validação
- `tsgo --noEmit` limpo; `vite build` verde.
- Verificação no preview real (1920px e 390px) em Clientes, Tarefas e Suporte:
  exatamente **um** contentor rolável por modal, botão fechar 44×44px, sem
  overflow horizontal e full-screen no mobile.
- Documentação: `docs/ARCHITECTURE_MODAL_DESIGN_SYSTEM.md` e
  `docs/UI_MODAL_GUIDELINES.md`.

## Central de Suporte — Reabertura com encaminhamento (P1)
- Nova RPC atómica `public.reopen_support_ticket_with_message` (mensagem + reabertura + encaminhamento + evento append-only + notificação).
- Nova coluna `support_tickets.destination_type` (nullable) e normalização dos tickets `aberto` sem destino.
- Modal canónico `src/components/support/ReopenTicketDialog.tsx` substitui o `window.prompt` (fecha KI-025 no fluxo de reabertura).
- Ticket encerrado deixa de mostrar a caixa de resposta normal; passa a exibir "Responder / reabrir".

## Pacote Operacional V2 — Fase A (financeiro) · 2026-08-23

- Funcionário passa a ter **Tipo de pagamento**: Por Hora, Por Dia / Fixo, Por Mês
  (`profiles.pay_model`), com apenas o campo de valor relevante visível e opcional.
- Novo valor diário explícito em funcionário, cliente e empresa
  (`manual_daily_rate`, `clients.daily_rate`, `company_hr_settings.default_daily_rate`).
  O antigo "fixo" (por tarefa) manteve o significado.
- Cliente: os quatro valores (hora, dia, mês, fixo) são independentes e opcionais
  e já não são apagados ao mudar a forma de cobrança.
- Empresa: seção **Valores Padrão de Pagamento** com fonte única
  (`company_hr_settings`); valores anteriores migrados automaticamente.
- Hierarquia oficial implementada no servidor (FUNCIONÁRIO > CLIENTE > EMPRESA)
  em `resolve_billing_rule`, com nova RPC `resolve_effective_compensation`.
- Folha: hora usa tempo real; dia paga 1× por dia trabalhado; mensal é base e não
  é multiplicada por horas. Snapshot histórico preservado.
- Ver ADR-031.

## Novo vertical: Material de Construção — Fase A · 2026-08-23

- `companies.business_vertical` aceita agora `building_materials`, `hospitality` e
  `auto_repair` (migration idempotente, sem qualquer UPDATE de dados).
- 11 novos módulos `building_materials_*` no catálogo — **todos desativados** por
  omissão; `DEFAULT_ENABLED_MODULES` inalterado.
- Novo componente canónico `src/components/ModuleGuard.tsx` (403 por URL direta).
- 11 novas rotas `/app/material-construcao/*`, todas com `RoleGuard` + `ModuleGuard`.
- Grupo de menu "Material de Construção" em `src/lib/navigation.ts` (aditivo; só
  mostra itens de módulos ativos).
- Super Admin: nova aba "Material de Construção" na configuração de módulos, com
  todos os checkboxes desmarcados e sem ativação automática ao mudar o ramo.
- Hotelaria e Oficina: apenas verticais preparados (sem menus nem rotas).
- Ver ADR-033 e `docs/release-notes/RELEASE_NOTES_BUILDING_MATERIALS_FASE_A.md`.

## Limpeza controlada de tarefas duplicadas (P0) · 2026-08-26

- Auditoria por chave canónica (empresa + cliente + responsável + título + ocorrência):
  85 duplicatas comprovadas (`pendente`, sem qualquer histórico operacional) marcadas
  com `deleted_at` (soft-delete reversível — nenhum DELETE físico).
- 53 tarefas principais e 2 casos de `REVISAO_MANUAL` (concluídas / com folha de ponto)
  preservados sem qualquer alteração.
- 6 séries de recorrência clones encerradas (`status = 'ended'`), preservando a série
  principal de cada grupo.
- Auditoria integral em `public.task_dedupe_audit` (batch `ADR-041`): IDs preservados,
  duplicados, séries principais e séries clones.
- Causa raiz corrigida: índice único parcial na chave canónica das séries activas +
  trigger `trg_task_recurrences_block_duplicate_active` (`RECURRENCE_DUPLICATE_ACTIVE`).
- Frontend (`src/routes/app.tarefas.tsx`): guarda síncrona contra duplo clique/retry
  (`submittingRef`) e criação de séries **uma a uma** com tratamento idempotente do
  erro de duplicado (avisa "já existe", nunca aborta os restantes responsáveis).
- Ver ADR-041.

## Ponto · avaliação de geolocalização consistente (SUP-2026-000071) · 2026-08-26

- Chegada, Pausa, Retomada e Partida deixaram de gravar `geo_status = 'within'`
  fixo: passam a usar `_punch_resolve_policy` + `_punch_evaluate_geo`, como já
  faziam Início e Encerramento. Estes eventos continuam a **nunca bloquear** o
  funcionário — apenas registam a situação real (dentro, fora, sem GPS ou
  cliente sem coordenadas) com `client_lat/lng`, raio e distância.
- Fim da incoerência reportada: a mesma picagem, no mesmo local, aparecia como
  "Dentro do raio" na Pausa/Retomada/Partida e "Cliente sem coordenadas" no
  Início/Encerramento (falso "erro de geolocalização").
- `PunchGeoDrawer`: aviso explicativo quando o cliente não tem coordenadas —
  deixa claro que não é erro de GPS do funcionário e indica onde configurar.
- Ver ADR-042.

## Menu "Tarefas" desaparecido no Gestor (SUP-2026-000075) · 2026-08-26

- Causa raiz: `companies.enabled_modules` podia ser gravado sem módulos
  essenciais (`core`, `tasks`, `time_clock`, `hr`, `support`). O menu do Gestor
  esconde itens por módulo, pelo que "Tarefas" (e outros) desapareciam em
  silêncio — e o Super Admin não conseguia reativá-los, porque o toggle ignora
  módulos marcados como incluídos no plano.
- `normalizeModules` (src/lib/locale.ts) passa a garantir sempre o piso mínimo
  `ESSENTIAL_MODULES`, pelo que navegação e `ModuleGuard` nunca ficam sem os
  módulos incluídos no plano.
- Novo trigger `public.companies_enforce_essential_modules` reacrescenta os
  módulos essenciais em qualquer INSERT/UPDATE de `enabled_modules`; empresas
  existentes foram normalizadas na mesma migração.
- `/app/admin`: módulos incluídos aparecem com selo "incluído · sempre ativo",
  marcados e bloqueados.
- Ver ADR-047.

## Deteção de tickets duplicados / problemas semelhantes · 2026-08-26

- Antes de confirmar a abertura de um ticket, o OmniBiz procura tickets com o
  mesmo problema (ou significado semelhante) e mostra um modal preventivo com
  "Ver ticket", "Tenho o mesmo problema" e "Abrir novo ticket mesmo assim".
- Deteção em dois níveis no servidor: similaridade textual (`pg_trgm` +
  `unaccent`, texto normalizado com índices trigram) e assinatura semântica
  (ação + entidade a partir do título/módulo, com léxico determinístico).
- Isolamento multiempresa: da própria empresa vêm detalhes; de outras contas
  apenas uma contagem agregada ("já identificámos relatos semelhantes"), sem
  qualquer dado. Apenas o Super Admin vê tickets de várias empresas.
- Novas tabelas `support_ticket_links` (duplicado/relacionado) e
  `support_ticket_affected` (relatos "mesmo problema"), coluna
  `support_tickets.primary_ticket_id`.
- Novas RPCs: `support_find_similar`, `support_report_same_problem`,
  `support_link_tickets`, `support_unlink_tickets`, `support_related_tickets`,
  `support_duplicate_clusters` (Super Admin), `support_notify_affected`
  (Super Admin).
- Detalhe do ticket: secção "Tickets relacionados" com ligações, relatos de
  afetados, ferramenta de ligação (Gestor na própria empresa, Super Admin
  global) e "Notificar afetados".
- `/app/admin/suporte`: painel "Possíveis duplicados (últimos 180 dias)" a
  agrupar tickets por assinatura, com contagem de tickets, empresas e casos
  em aberto.
- Ver ADR-048.
## SUP-2026-000111 · Autorização de férias entre gestores · 2026-08-28

- Gestor pode encaminhar uma solicitação pendente para outro Gestor/Owner ativo da
  mesma empresa, com validação no backend e bloqueio de autoaprovação.
- O autorizador recebe notificação, decide pelo fluxo existente e o gestor que
  encaminhou recebe o resultado; o funcionário continua vendo apenas o fluxo
  simples de aprovação.
- Encaminhamento e solicitação passaram a compor o histórico append-only em
  `vacation_audit`, sem alterar pedidos antigos.
- Migration aditiva: `20260828173000_vacation_authorization_forwarding.sql`.
