import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tasksPage = readFileSync(new URL("../src/routes/app.tarefas.tsx", import.meta.url), "utf8");
const recurrenceDialog = readFileSync(
  new URL("../src/components/tasks/EditRecurrenceDialog.tsx", import.meta.url),
  "utf8",
);
const materialization = readFileSync(
  new URL(
    "../supabase/migrations/20260911120000_sup_2026_000145_preserve_task_groups_in_recurrence_materialization.sql",
    import.meta.url,
  ),
  "utf8",
);
const clientSchedule = readFileSync(new URL("../src/lib/tasks/client-schedule.ts", import.meta.url), "utf8");

test("task visibility stays company-scoped and employee-scoped by canonical IDs", () => {
  assert.match(tasksPage, /if \(currentCompanyId\) q = q\.eq\("company_id", currentCompanyId\)/);
  assert.match(tasksPage, /if \(!isManager\) q = q\.eq\("assigned_to", user!\.id\)/);
  assert.match(tasksPage, /const inserted = await supabase[\s\S]*\.from\("tasks"\)[\s\S]*assigned_to: memberId/);
  // A geração por série também lê quantas ocorrências foram criadas (data: materialized).
  assert.match(
    tasksPage,
    /const \{ (?:data: materialized, )?error: materializeError \} = await \(supabase\.rpc as any\)\(\s*"recurrence_materialize"/,
  );
  // Janela rolante de pré-geração: 12 meses (o campo "data final" da série
  // continua intacto — o limite existe só na materialização).
  assert.match(tasksPage, /const horizon = 365/);
});

test("occurrence generation runs per created series and surfaces real failures", () => {
  assert.match(tasksPage, /for \(const recurrenceId of createdRecurrenceIds\)/);
  assert.match(tasksPage, /_recurrence_id: recurrenceId/);
  assert.match(tasksPage, /toast\.error\(\s*`Recorrência salva, mas as ocorrências não foram geradas/);
  assert.doesNotMatch(tasksPage, /As próximas ocorrências serão geradas automaticamente/);
});
test("task creation always releases saving state after async failures", () => {
  assert.match(
    tasksPage,
    /if \(submittingRef\.current\) return;\s*submittingRef\.current = true;\s*setLoading\(true\);\s*try \{/,
  );
  assert.match(
    tasksPage,
    /catch \(submitError\)[\s\S]*toast\.error\(taskSaveErrorMessage\(submitError\)\)[\s\S]*finally \{[\s\S]*submittingRef\.current = false;[\s\S]*setLoading\(false\);/,
  );
});

test("client habitual schedules are not duplicated by active task series", () => {
  assert.match(clientSchedule, /return configured\.length > 0 \? configured : recurrences;/);
  assert.match(tasksPage, /const selectedAssignees = \[\.\.\.new Set\(assignees\)\]/);
});

test("single-occurrence recurrence edits preserve wall-clock overnight dates", () => {
  assert.match(
    recurrenceDialog,
    /const end = sfIso && safeDuration > 0 \? addWallMinutes\(startDate, startTime, safeDuration\) : null/,
  );
  assert.match(recurrenceDialog, /const seIso = end \? wallDateTimeToISO\(end\.date, end\.time\) : null/);
  assert.doesNotMatch(recurrenceDialog, /new Date\(sfIso\)|sfStart\.getTime\(\)|toISOString\(\)/);
});

test("recurrence materialization preserves the multi-employee task group", () => {
  assert.match(materialization, /recurrence_id, recurrence_date, task_group_id/);
  assert.match(materialization, /v_rec\.id, v_day, v_rec\.task_group_id/);
  assert.match(materialization, /existing_task\.title = v_rec\.title/);
  assert.match(materialization, /existing_task\.recurrence_id IS DISTINCT FROM v_rec\.id/);
});

// Instruções adicionais do cliente (clients.instructions): só exibição, sem mexer no ponto.
const punchPage = readFileSync(new URL("../src/routes/app.ponto.tsx", import.meta.url), "utf8");
const notificationsPage = readFileSync(new URL("../src/routes/app.notificacoes.tsx", import.meta.url), "utf8");
const notificationActions = readFileSync(new URL("../src/lib/notification-actions.ts", import.meta.url), "utf8");

test("Folha de Ponto mostra instruções do cliente sem alterar endereço nem ponto", () => {
  // leitura separada e tolerante a falhas
  assert.match(punchPage, /queryKey: \["punch-client-instructions", ids\]/);
  assert.match(punchPage, /\.select\("id,instructions"\)/);
  assert.match(punchPage, /if \(error\) return map;/);
  // a consulta de endereço continua igual
  assert.match(punchPage, /\.select\("id,address,geo_address,geo_lat,geo_lng"\)/);
  // só aparece com texto e começa fechado
  assert.match(
    punchPage,
    /function ClientInstructionsToggle[\s\S]*?useState\(false\)[\s\S]*?if \(!value\) return null;/,
  );
  // tarefa em andamento, próxima tarefa e lista do dia
  assert.equal((punchPage.match(/<ClientInstructionsToggle\s/g) ?? []).length, 3);
});

test("calendário mostra instruções do cliente sem mudar a lista de clientes", () => {
  assert.match(tasksPage, /queryKey: \["tasks-client-instructions", currentCompanyId\]/);
  assert.match(tasksPage, /\.select\("id,name,timing_mode,contracted_minutes"\)/);
  assert.match(
    tasksPage,
    /function CalendarClientInstructions[\s\S]*?useState\(false\)[\s\S]*?if \(!value\) return null;/,
  );
  assert.match(tasksPage, /<CalendarClientInstructions text=\{taskClientInstructions\(task\)\} \/>/);
  assert.match(tasksPage, /aria-label="Tem instruções do cliente"/);
});

test("notificações mostram a linha de instruções e abrem a Folha de Ponto", () => {
  assert.match(notificationsPage, /whitespace-pre-line break-words text-sm text-muted-foreground">\{n\.body\}/);
  assert.match(notificationsPage, /task_client_instructions_updated: "Instruções do cliente"/);
  assert.match(
    notificationActions,
    /LINK_EVENTS = new Set\(\["punch_regularized", "punch_adjusted", "task_client_instructions_updated"\]\)/,
  );
});

test("Super Admin e Owner veem pedidos de férias pendentes com outro aprovador (só leitura)", () => {
  const vacationsPage = readFileSync(new URL("../src/routes/app.ferias.tsx", import.meta.url), "utf8");
  assert.match(vacationsPage, /isSuperAdmin \|\| isOwner\s*\?\s*rows\.filter\(/);
  assert.match(vacationsPage, /Pendentes com outro aprovador/);
  assert.match(vacationsPage, /pendingWithOthers\.map\(\(r\) => \(\s*<li\s+key=\{r\.id\}\s+data-vacation-id=\{r\.id\}/);
  // a lista de decisão: aprovador atribuído, ou qualquer gestor só para pedido pendente não reencaminhado (SUP-149)
  assert.match(vacationsPage, /r\.assigned_approver_id === user\?\.id \|\|/);
});

test("datas personalizadas: sem aviso de intervalo e férias só nos dias escolhidos", () => {
  // o aviso de 'data de fim X dias depois' não vale para datas personalizadas
  assert.match(tasksPage, /if \(spanDays > 2 && !\(recurrence\.enabled && recurrence\.frequency === "custom"\)\) \{/);
  // férias: só conflita se cair num dos dias selecionados
  assert.match(tasksPage, /normalizeCustomRecurrenceDates\(recurrence\.selectedDates \?\? \[\]\)/);
  assert.match(tasksPage, /customDays\.some\(\(day\) => day >= v\.start_date && day <= v\.end_date\)/);
  assert.match(tasksPage, /if \(conflictingVacations\.length > 0\) \{/);
});

test("férias aprovadas agrupadas por mês, filtro de cargo, já gozadas em cinza e data do pedido", () => {
  const vacationsPage = readFileSync(new URL("../src/routes/app.ferias.tsx", import.meta.url), "utf8");
  assert.match(vacationsPage, /function vacationMonthGroupLabel\(start: string, end: string\)/);
  assert.match(vacationsPage, /approvedGroups\.map\(\(g\) =>/);
  assert.match(vacationsPage, /const \[filterJob, setFilterJob\] = useState<string>\("all"\)/);
  assert.match(vacationsPage, /r\.end_date < todayKey/);
  assert.match(vacationsPage, /\{fmtRequestedAt\(r\.created_at\)\}/);
  // Local de trabalho do pedido herda o Setor do utilizador
  assert.match(vacationsPage, /\.select\("work_location, job_title, sector"\)/);
});

test("atividade recente pesquisa por funcionário ou cliente no servidor", () => {
  const timeline = readFileSync(new URL("../src/components/dashboards/ActivityTimeline.tsx", import.meta.url), "utf8");
  assert.match(timeline, /queryKey: \["activity-events", companyId, tab, searchTerm\]/);
  assert.match(timeline, /changes->>Funcionário\.ilike/);
  assert.match(timeline, /changes->>Cliente\.ilike/);
  // paginação continua igual quando não há pesquisa
  assert.match(timeline, /\} else if \(pageFilter\) \{\s*q = q\.or\(pageFilter\);/);
});

test("tarefas mostram endereço e instruções na lista e no calendário, e a barra Lista/Calendário fica no topo", () => {
  assert.match(tasksPage, /queryKey: \["tasks-client-addresses", currentCompanyId\]/);
  assert.match(tasksPage, /function TaskClientAddress\(/);
  assert.match(tasksPage, /<TaskClientDetails task=\{t\} \/>/);
  assert.match(tasksPage, /<TaskClientDetails task=\{task\} \/>/);
  // a barra do funcionário vem antes da lista (não some no celular)
  const employeeBar = tasksPage.indexOf("{!isManager && !isLoading && (");
  const listView = tasksPage.indexOf('taskView === "list" && (');
  assert.ok(employeeBar > 0 && listView > 0 && employeeBar < listView);
});

test("excluir um colega recalcula as horas divididas de quem fica na tarefa", () => {
  // grupo guardado antes de excluir; só modo dividir (soma = horas contratadas do cliente)
  assert.match(tasksPage, /const rebalanceSnapshot = await snapshotGroupForRebalance\(ids,/);
  assert.match(tasksPage, /Math\.abs\(total - contracted\) > 1\) return null;/);
  // não mexe em tarefas já iniciadas ou concluídas
  assert.match(tasksPage, /\["pendente", "autorizado"\]\.includes\(String\(t\.status\)\)/);
  // redistribui o total entre quem ficou
  assert.match(tasksPage, /const shares = distributeContractedMinutes\(snapshot\.total, remaining\.length\);/);
});

test("formulário de nova tarefa mostra o horário de cada funcionário quando as horas são divididas", () => {
  assert.match(tasksPage, /const perEmployeeSchedule = \(\(\) => \{/);
  // mesma regra do salvamento: sem Hora fim manual e com horas contratadas
  assert.match(
    tasksPage,
    /contractedMinutes == null\s*\|\|\s*manualEndOverride\s*\|\|\s*!startDate\s*\|\|\s*!startTime\s*\|\|\s*!endTime/,
  );
  assert.match(tasksPage, /Horário de cada funcionário \(horas divididas\)/);
});

test("gestor vê endereço e instruções só no lápis (calendário) ou no botão do mapa (lista); funcionário vê sempre", () => {
  assert.match(tasksPage, /\{!isManager && <TaskClientDetails task=\{task\} \/>\}/);
  assert.match(tasksPage, /\{isManager && actionsOpen && <TaskClientDetails task=\{task\} \/>\}/);
  assert.match(tasksPage, /\{\(!isManager \|\| clientInfoOpen\) && <TaskClientDetails task=\{t\} \/>\}/);
});

test("SUP-149: qualquer gestor decide pedido de férias novo; resposta do ticket permite anexar", () => {
  const vacationsPage = readFileSync(new URL("../src/routes/app.ferias.tsx", import.meta.url), "utf8");
  const ticketPage = readFileSync(new URL("../src/routes/app.suporte.$id.tsx", import.meta.url), "utf8");
  assert.match(vacationsPage, /const canDecideAnyPending = isManager \|\| isOwner \|\| isSuperAdmin;/);
  // aprovador atribuído continua a decidir; outros gestores só pedidos pendentes não reencaminhados
  assert.match(
    vacationsPage,
    /r\.assigned_approver_id === user\?\.id \|\|\s*\(canDecideAnyPending && r\.status === "pendente" && !r\.forwarded_by\)/,
  );
  // quem pediu nunca decide o próprio pedido
  assert.match(
    vacationsPage,
    /const toApprove = rows\.filter\(\s*\(r\) =>\s*\(r\.status === "pendente" \|\| r\.status === "aguardando_aprovacao"\) &&\s*r\.user_id !== user\?\.id &&/,
  );
  assert.match(ticketPage, /aria-label="Anexar imagem ou ficheiro"/);
  assert.match(ticketPage, /if \(f\) uploadMut\.mutate\(f\);[\s\S]*replyMut\.mutate\(\)/);
});
