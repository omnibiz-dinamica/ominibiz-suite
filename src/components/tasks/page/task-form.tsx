// Tarefas · formulário de criar/editar tarefa (extraído de app.tarefas.tsx).

import {
  recurrenceFromScheduleSlot,
  disableAutoRecurrence,
  scheduleSlotSummary,
} from "@/lib/tasks/schedule-recurrence";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  diffGroupAssignees,
  needsGroupAssigneeConfirmation,
  shouldAskGroupScheduleScope,
} from "@/lib/tasks/group-edit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModalBody, ModalFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { fetchClientSchedule, slotsForDate, nextDateForSchedule, describeSlot, slotTimesForTeam, teamStartTimeFor, type ClientScheduleSlot } from "@/lib/tasks/client-schedule";
import { clientTeamType } from "@/lib/tasks/client-team";
import { addWallMinutes, resolveWallEndDate, distributeContractedMinutes, formatContractedMinutes } from "@/lib/tasks/contracted-hours";
import { X, Upload, FileText, Search, AlertTriangle } from "lucide-react";
import { PUNCH_MODE_LABELS, type TaskRow, type PunchMode, checkTaskScheduleConflicts, type TaskScheduleConflict, previewRecurrenceDates } from "@/lib/tasks";

import { RecurrenceForm, emptyRecurrence, type RecurrenceFormValue } from "@/components/tasks/RecurrenceForm";
import { DraftNotice } from "@/components/form-draft/DraftNotice";
import {
  formatTaskFileSize,
  mergeTaskFiles,
  TASK_DOCUMENT_ACCEPT,
  removeTaskDocuments,
  uploadTaskDocuments,
  type TaskDocument,
} from "@/lib/tasks/task-documents";
import { localDateToDateKey, normalizeCustomRecurrenceDates } from "@/lib/tasks/custom-recurrence";

import { useT } from "@/i18n";
import { wallISOToDateInput, wallDateToEndOfDayISO, wallDateTimeToISO, formatWallDate, formatWallTime } from "@/lib/wall-clock";
import { dailyShiftDurationMinutes, taskDurationMinutes, LONG_STANDALONE_TASK_MINUTES } from "@/lib/tasks/daily-shift-duration";
import { tt, taskMemberName } from "./shared";

export function taskSaveErrorMessage(error: unknown): string {
  const technicalError = (error && typeof error === "object" ? error : {}) as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
  const fallbackMessage = typeof error === "string" ? error : "Não foi possível salvar a tarefa.";
  return [
    technicalError.code ? `Código: ${technicalError.code}` : null,
    technicalError.message ?? fallbackMessage,
    technicalError.details ? `Detalhes: ${technicalError.details}` : null,
    technicalError.hint ? `Orientação: ${technicalError.hint}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Rascunho do formulário de tarefa (criar/editar), guardado pelo pai. */
export interface TaskFormDraft extends Record<string, unknown> {
  title: string;
  description: string;
  assignees: string[];
  clientId: string;
  priority: "baixa" | "media" | "alta" | "urgente";
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  graceMinutes: number;
  punchMode: string;
  recurrence: RecurrenceFormValue;
  manualEndOverride: boolean;
}

export function TaskForm({
  formId,
  members,
  clients,
  companyId,
  userId,
  initial,
  onCancel,
  onDone,
  documentsSlot,
  draftValues = null,
  draftSavedAt = null,
  draftConflict = false,
  onDraftValues,
  onDraftDiscard,
}: {
  formId: string;
  members: { id: string; full_name: string | null; email?: string | null; job_title?: string | null; sector?: string | null }[];
  clients: {
    id: string;
    name: string;
    timing_mode?: "start_stop" | "manual" | null;
    contracted_minutes?: number | null;
  }[];
  companyId: string;
  userId: string;
  initial?: TaskRow;
  onCancel: () => void;
  onDone: () => void;
  documentsSlot?: ReactNode;
  draftValues?: TaskFormDraft | null;
  draftSavedAt?: number | null;
  draftConflict?: boolean;
  onDraftValues?: (values: TaskFormDraft) => void;
  onDraftDiscard?: () => void;
}) {
  const { t } = useT();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [assignees, setAssignees] = useState<string[]>(initial?.assigned_to ? [initial.assigned_to] : []);
  const assignedTo = assignees[0] ?? "";
  // SUP-66: na edição, carrega todos os responsáveis do grupo DESTA ocorrência.
  const [groupAssignees, setGroupAssignees] = useState<string[]>(initial?.assigned_to ? [initial.assigned_to] : []);
  const [groupSchedulePrompt, setGroupSchedulePrompt] = useState<{
    count: number;
    resolve: (choice: "all" | "mine" | null) => void;
  } | null>(null);
  const initialGroupId = (initial as { task_group_id?: string | null } | undefined)?.task_group_id ?? null;
  useEffect(() => {
    if (!initial?.id || !initialGroupId) return;
    let cancelled = false;
    void (async () => {
      let q = supabase
        .from("tasks")
        .select("id, assigned_to, recurrence_date")
        .eq("company_id", companyId)
        .eq("task_group_id", initialGroupId)
        .is("deleted_at", null)
        .is("archived_at", null)
        .neq("status", "cancelado");
      q = initial.recurrence_date ? q.eq("recurrence_date", initial.recurrence_date) : q.is("recurrence_date", null);
      const { data } = await q;
      if (cancelled || !data) return;
      const ids = [
        ...new Set([initial.assigned_to, ...data.map((r) => r.assigned_to)].filter((v): v is string => !!v)),
      ];
      setGroupAssignees(ids);
      setAssignees(ids);
    })();
    return () => {
      cancelled = true;
    };
  }, [initial?.id, initialGroupId, initial?.recurrence_date, initial?.assigned_to, companyId]);
  const toggleAssignee = (id: string) => {
    setTouchedAssignees(true);
    setAssignees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const [assigneeQuery, setAssigneeQuery] = useState("");
  const filteredAssignees = useMemo(() => {
    const q = assigneeQuery
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const base = !q.trim()
      ? members
      : members.filter((m) => {
          const name = (m.full_name ?? "")
            .toLocaleLowerCase("pt-BR")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          const email = (m.email ?? "").toLocaleLowerCase("pt-BR");
          // SUP-2026-000305 — também pesquisa pelo setor e cargo do funcionário.
          const details = [m.sector, m.job_title]
            .join(" ")
            .toLocaleLowerCase("pt-BR")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          const haystack = `${name} ${email} ${details}`;
          return q
            .split(/\s+/)
            .filter(Boolean)
            .every((token) => haystack.includes(token));
        });
    // Selecionados primeiro, depois ordem alfabética (mesma regra da ficha do cliente).
    return [...base].sort((a, b) => {
      const sa = assignees.includes(a.id) ? 0 : 1;
      const sb = assignees.includes(b.id) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return (a.full_name ?? "").localeCompare(b.full_name ?? "", "pt-BR", { sensitivity: "base" });
    });
  }, [members, assigneeQuery, assignees]);
  const [clientId, setClientId] = useState<string>(initial?.client_id ?? "");
  /**
   * 12092026-002a — pesquisa OPCIONAL dentro do dropdown de Cliente.
   * Vazio mostra a lista completa; a pesquisa nunca esconde o cliente já
   * selecionado e nunca altera os IDs canônicos nem os nomes exibidos.
   */
  const [clientQuery, setClientQuery] = useState("");
  const filteredClients = useMemo(() => {
    const norm = (value: string) =>
      value
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    const q = norm(clientQuery.trim());
    if (!q) return clients;
    const tokens = q.split(/\s+/).filter(Boolean);
    return clients.filter((c) => c.id === clientId || tokens.every((token) => norm(c.name ?? "").includes(token)));
  }, [clients, clientQuery, clientId]);
  const [priority, setPriority] = useState<"baixa" | "media" | "alta" | "urgente">(initial?.priority ?? "media");
  const [startDate, setStartDate] = useState<string>(
    wallISOToDateInput(initial?.scheduled_for ?? initial?.recurrence_date ?? initial?.due_at),
  );
  const [startTime, setStartTime] = useState<string>(
    initial?.scheduled_for ? formatWallTime(initial.scheduled_for) : "",
  );
  const [endDate, setEndDate] = useState<string>(
    wallISOToDateInput(initial?.scheduled_end ?? initial?.due_at ?? initial?.scheduled_for),
  );
  const [endTime, setEndTime] = useState<string>(initial?.scheduled_end ? formatWallTime(initial.scheduled_end) : "");
  const [graceMinutes, setGraceMinutes] = useState<number>(initial?.absence_grace_minutes ?? 15);
  const [punchMode, setPunchMode] = useState<PunchMode | "">((initial?.punch_mode_override as PunchMode) ?? "");
  const [recurrence, setRecurrence] = useState<RecurrenceFormValue>(emptyRecurrence());
  const [pendingDocs, setPendingDocs] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  /**
   * ADR-041 — guarda síncrona contra duplo clique/retry. O estado `loading`
   * só reflete no próximo render; o ref bloqueia a segunda submissão já no
   * mesmo tick, antes de qualquer INSERT.
   */
  const submittingRef = useRef(false);
  const createdTaskIdsRef = useRef<string[]>([]);
  /** True depois que o gestor edita a data inicial da recorrência à mão. */
  const recurrenceStartTouchedRef = useRef(false);
  const [scheduleConflicts, setScheduleConflicts] = useState<TaskScheduleConflict[]>([]);
  const [scheduleCheckError, setScheduleCheckError] = useState<string | null>(null);
  const confirmedConflictsRef = useRef(false);

  const handleRecurrenceChange = (next: RecurrenceFormValue) => {
    // A data inicial da recorrência é do usuário: a data principal apenas
    // sugere o valor até ele editar o campo (nunca sobrescreve depois disso).
    if (next.frequency !== "custom" && next.startDate !== recurrence.startDate) {
      recurrenceStartTouchedRef.current = true;
    }
    setRecurrence(next);
    if (next.enabled && next.frequency === "custom") {
      // The explicit date selection is also the task's visible date range.
      setTouchedDates(true);
      setStartDate(next.startDate);
      setEndDate(next.endDate);
    }
  };

  const timingMode: "start_stop" = "start_stop";

  // ---------------------------------------------------------------
  // Fase B — equipe responsável do cliente (client_assignees).
  // Ao escolher o cliente, sugerimos os colaboradores ativos vinculados.
  // A seleção do Gestor NUNCA é sobrescrita em silêncio: se ele já mexeu,
  // pedimos decisão explícita (usar equipe do novo cliente / manter).
  // ---------------------------------------------------------------
  const [touchedAssignees, setTouchedAssignees] = useState(false);
  const [teamPrompt, setTeamPrompt] = useState<{ clientName: string; team: string[] } | null>(null);
  const [teamHint, setTeamHint] = useState<string | null>(null);

  // ---------------------------------------------------------------
  // SUP-2026-000110 — programação habitual do cliente (sugestão).
  // Fonte de verdade reutilizada: séries ativas em `task_recurrences`.
  // Nunca sobrescreve horário já digitado pelo Gestor nem tarefas em edição.
  // ---------------------------------------------------------------
  const [clientSchedule, setClientSchedule] = useState<ClientScheduleSlot[]>([]);
  const [touchedTimes, setTouchedTimes] = useState(false);
  const [manualEndOverride, setManualEndOverride] = useState(Boolean(initial?.scheduled_end));
  const [touchedDates, setTouchedDates] = useState(false);
  const [schedulePrompt, setSchedulePrompt] = useState<ClientScheduleSlot[]>([]);
  const [scheduleHint, setScheduleHint] = useState<string | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);

  // ----- Rascunho automático: restaura os valores guardados e reporta mudanças -----
  const appliedDraftRef = useRef(false);
  const applyDraftValues = (values: TaskFormDraft) => {
    appliedDraftRef.current = true;
    setTitle(values.title);
    setDescription(values.description);
    setAssignees(values.assignees);
    setGroupAssignees(values.assignees);
    setClientId(values.clientId);
    setPriority(values.priority);
    setStartDate(values.startDate);
    setStartTime(values.startTime);
    setEndDate(values.endDate);
    setEndTime(values.endTime);
    setGraceMinutes(values.graceMinutes);
    setPunchMode(values.punchMode as PunchMode | "");
    setRecurrence(values.recurrence);
    setManualEndOverride(values.manualEndOverride);
  };
  useEffect(() => {
    if (!draftValues || appliedDraftRef.current || draftConflict) return;
    applyDraftValues(draftValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftValues, draftConflict]);
  useEffect(() => {
    onDraftValues?.({
      title,
      description,
      assignees,
      clientId,
      priority,
      startDate,
      startTime,
      endDate,
      endTime,
      graceMinutes,
      punchMode,
      recurrence,
      manualEndOverride,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    title,
    description,
    assignees,
    clientId,
    priority,
    startDate,
    startTime,
    endDate,
    endTime,
    graceMinutes,
    punchMode,
    recurrence,
    manualEndOverride,
  ]);

  const selectedClient = clients.find((client) => client.id === clientId);
  const selectedSchedule = clientSchedule.find((schedule) => schedule.id === selectedScheduleId) ?? null;
  // Programações com nome no cadastro do cliente (ex.: "Klein", "Grote").
  const namedSchedules = clientSchedule.filter(
    (schedule) => Boolean(schedule.label) && schedule.id.startsWith("client-habitual:"),
  );
  const scheduleName = selectedSchedule?.label?.trim() || null;
  const clientContractedMinutes = selectedSchedule?.contractedMinutes ?? selectedClient?.contracted_minutes ?? null;
  /**
   * SUP-2026-000315 — sem carga no cadastro do cliente, o total a dividir é o
   * horário da própria tarefa (início → fim). Ex.: 08:00–11:00 para 2 pessoas
   * = 1h30 cada (08:00–09:30). Só na criação: a edição divide depois de gravar.
   */
  const taskTotalMinutes =
    !initial && startTime && endTime
      ? taskDurationMinutes(startDate, startTime, endDate, endTime, recurrence.enabled)
      : null;
  const contractedMinutes = clientContractedMinutes ?? taskTotalMinutes;
  const splitFromTaskTimes = clientContractedMinutes == null && contractedMinutes != null;
  // A hora de fim digitada só bloqueia a divisão quando a carga vem do cadastro;
  // sem cadastro, é precisamente essa hora que define o total a dividir.
  const endTypedByManager = manualEndOverride && !splitFromTaskTimes;
  const distributedMinutes = useMemo(
    () => distributeContractedMinutes(contractedMinutes, assignees.length),
    [contractedMinutes, assignees.length],
  );
  // Prévia, no próprio formulário, do horário de cada funcionário quando as horas contratadas
  // são divididas (mesma regra usada ao gravar: mesmo início, cada um com a sua parte).
  /**
   * SUP-2026-000315 — na edição, a divisão é feita no banco quando muda o nº de
   * pessoas (task_group_edit_occurrence). Prévia com a mesma regra: carga do
   * cliente; sem carga, ao acrescentar, horário da tarefa × pessoas que já estavam.
   */
  const editSplitTotal = (() => {
    const count = new Set(assignees).size;
    if (!initial || !startTime || !endTime || count === groupAssignees.length) return null;
    if (selectedClient?.contracted_minutes) return selectedClient.contracted_minutes;
    if (count < groupAssignees.length) return null;
    const minutes = dailyShiftDurationMinutes(startTime, endTime);
    return minutes > 0 ? minutes * Math.max(groupAssignees.length, 1) : null;
  })();
  const perEmployeeSchedule = (() => {
    const unique = [...new Set(assignees)];
    const total = initial ? editSplitTotal : endTypedByManager ? null : contractedMinutes;
    if (total == null || !startDate || !startTime || !endTime || unique.length < 2) {
      return [] as { id: string; name: string; end: string; duration: string }[];
    }
    const shares = distributeContractedMinutes(total, unique.length);
    return unique.map((id, index) => {
      const minutes = shares[index] ?? shares[0] ?? 0;
      const end = addWallMinutes(startDate, startTime, minutes);
      const name = members.find((m) => m.id === id)?.full_name?.trim() || "Funcionário";
      return {
        id,
        name,
        end: end ? (end.date !== startDate ? `${end.time} (dia seguinte)` : end.time) : "—",
        duration: formatContractedMinutes(minutes),
      };
    });
  })();

  useEffect(() => {
    if (initial || !startDate || recurrenceStartTouchedRef.current) return;
    // Datas de negócio não passam por Date/UTC. A data principal só sugere o
    // início da série enquanto o gestor não editar o campo; recorrências
    // customizadas continuam sendo definidas pelo calendário de datas.
    setRecurrence((current) =>
      current.frequency === "custom" || current.startDate === startDate ? current : { ...current, startDate },
    );
  }, [initial, startDate]);

  /**
   * A carga contratada do cliente é o TOTAL do serviço. Trocar a quantidade de
   * responsáveis apenas redistribui esse total (3h/2 = 1h30 cada; 3h/1 = 3h),
   * nunca reduz o serviço. Como o total muda de dono, uma hora de fim digitada
   * antes deixa de valer e o recálculo volta a ser automático.
   */
  const assigneeCountRef = useRef(assignees.length);
  useEffect(() => {
    if (assigneeCountRef.current === assignees.length) return;
    assigneeCountRef.current = assignees.length;
    if (contractedMinutes != null && assignees.length > 0) setManualEndOverride(false);
  }, [assignees.length, contractedMinutes]);

  /**
   * Entrada conforme o número de pessoas (programação do cliente). Ex.: 2 pessoas
   * entram às 08:30 (1h30 cada); 1 pessoa entra às 07:30 (3h). Só em tarefas
   * novas, com uma programação escolhida e sem horário digitado pelo gestor.
   */
  const teamSize = new Set(assignees).size;
  const teamTimesRef = useRef<string | null>(null);
  useEffect(() => {
    if (initial || touchedTimes || !selectedSchedule?.teamVariations?.length || teamSize === 0) return;
    const key = `${selectedSchedule.id}:${teamSize}`;
    if (teamTimesRef.current === key) return;
    teamTimesRef.current = key;
    const times = slotTimesForTeam(selectedSchedule, teamSize);
    if (!times.startTime) return;
    setStartTime(times.startTime);
    setEndTime(times.endTime ?? "");
    setManualEndOverride(false);
    if (times.adjusted) {
      setScheduleHint(
        `Entrada ajustada para ${teamSize} ${teamSize === 1 ? "pessoa" : "pessoas"}: ${times.startTime}${times.endTime ? `–${times.endTime}` : ""} (a carga do serviço não muda).`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, touchedTimes, selectedSchedule?.id, teamSize]);

  // A hora de fim é OPCIONAL e pertence exclusivamente ao gestor/super admin.
  // O sistema nunca preenche nem deriva esse campo: se o gestor não digitar,
  // a tarefa é gravada sem hora de fim (scheduled_end = null).

  /**
   * 12092026-001c — a data de fim acompanha o intervalo em wall clock:
   * avança para o dia seguinte quando é overnight e desfaz esse avanço
   * automático quando deixa de ser. Datas escolhidas explicitamente pelo
   * gestor (vários dias) nunca são alteradas.
   */
  useEffect(() => {
    if (!startDate || !endDate) return;
    const resolved = resolveWallEndDate(startDate, startTime, endTime, endDate);
    if (resolved && resolved !== endDate) setEndDate(resolved);
  }, [endDate, endTime, startDate, startTime]);

  const applySlot = (slot: ClientScheduleSlot, silent = false) => {
    setSelectedScheduleId(slot.id);
    setManualEndOverride(false);
    // Flexible schedules may still contain an optional suggested time pair.
    // Com entrada alternativa para o nº de pessoas escolhido, usa essa entrada.
    const teamTimes = !initial && teamSize > 0 ? slotTimesForTeam(slot, teamSize) : null;
    teamTimesRef.current = teamTimes ? `${slot.id}:${teamSize}` : null;
    setStartTime(teamTimes?.startTime ?? slot.startTime ?? "");
    setEndTime(teamTimes?.endTime ?? slot.endTime ?? "");
    if (slot.punchMode) setPunchMode(slot.punchMode as PunchMode);
    setSchedulePrompt([]);
    if (!silent) setScheduleHint(`Horário sugerido pela programação do cliente: ${describeSlot(slot)}.`);
  };

  /** True quando a recorrência foi ligada pela escolha de uma programação. */
  const autoRecurrenceRef = useRef(false);
  const recurrenceBlockRef = useRef<HTMLDivElement>(null);
  /** Escolha explícita de programação (só criação): liga a recorrência do cadastro. */
  const applySlotRecurrence = (slot: ClientScheduleSlot) => {
    if (initial) return;
    const next = recurrenceFromScheduleSlot(recurrence, slot);
    if (!next) return;
    autoRecurrenceRef.current = true;
    // A data de início da série segue o ciclo da programação, não a data da tarefa.
    recurrenceStartTouchedRef.current = true;
    setRecurrence(next);
    // Abre o bloco de recorrência para conferência e rola até ele.
    setTimeout(() => {
      // Rola SÓ o corpo do modal (nunca o shell/rodapé).
      const block = recurrenceBlockRef.current;
      const body = block?.closest<HTMLElement>("[data-modal-body]");
      if (!block || !body) return;
      const top = block.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 8;
      body.scrollTo({ top, behavior: "smooth" });
    }, 50);
    if (!touchedDates) {
      setStartDate(next.startDate);
      setEndDate(next.startDate);
    }
  };

  const suggestFromSchedule = (slots: ClientScheduleSlot[], dateKey: string) => {
    setSchedulePrompt([]);
    if (initial || touchedTimes || slots.length === 0) return;
    const effectiveDate = dateKey || (!touchedDates ? nextDateForSchedule(slots) : null);
    if (!effectiveDate) return;
    const matches = slotsForDate(slots, effectiveDate);
    const unique = matches.filter((s, i, arr) => arr.findIndex((o) => o.id === s.id) === i);
    if (unique.length === 1) {
      if (!dateKey && !startDate && !touchedDates) {
        setStartDate(effectiveDate);
        setEndDate(effectiveDate);
      }
      applySlot(unique[0]);
      return;
    }
    if (unique.length > 1) {
      setSchedulePrompt(unique);
      setScheduleHint(`Programação encontrada para ${effectiveDate}: escolha um dos horários abaixo.`);
    }
  };

  const fetchClientTeam = async (cid: string): Promise<string[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)("client_default_assignees", { _client_id: cid });
    if (error) throw error;
    const rows = (data ?? []) as { user_id: string; is_active: boolean; assignment_type?: string | null }[];
    // Só colaboradores ativos e que ainda pertencem à empresa (lista `members`).
    const memberIds = new Set(members.map((m) => m.id));
    return [
      ...new Set(
        rows
          .filter((r) => r.is_active && memberIds.has(r.user_id) && clientTeamType(r) === "habitual")
          .map((r) => r.user_id),
      ),
    ];
  };

  const loadClientSchedule = async (cid: string) => {
    if (initial || !cid) {
      setClientSchedule([]);
      setSchedulePrompt([]);
      setScheduleHint(null);
      setSelectedScheduleId(null);
      return;
    }
    try {
      const slots = await fetchClientSchedule(cid);
      setClientSchedule(slots);
      setSelectedScheduleId(null);
      setScheduleHint(null);
      // Clientes com programações nomeadas começam SEMPRE em "Livre / Manual":
      // nada é preenchido até o gestor escolher no seletor.
      const hasNamed = slots.some((s) => Boolean(s.label) && s.id.startsWith("client-habitual:"));
      if (!hasNamed) suggestFromSchedule(slots, startDate);
    } catch {
      // Cliente sem programação legível não pode bloquear a criação da tarefa.
      setClientSchedule([]);
      setSchedulePrompt([]);
    }
  };

  const applyClient = async (cid: string) => {
    if (!initial && autoRecurrenceRef.current && cid !== clientId) {
      // Não herdar a recorrência ligada pela programação do cliente anterior.
      setRecurrence((prev) => disableAutoRecurrence(prev, true));
      recurrenceStartTouchedRef.current = false;
      autoRecurrenceRef.current = false;
    }
    setClientId(cid);
    setTeamPrompt(null);
    if (initial || !cid) return;
    void loadClientSchedule(cid);
    let team: string[] = [];
    try {
      team = await fetchClientTeam(cid);
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
    const clientName = clients.find((c) => c.id === cid)?.name ?? "cliente";
    if (team.length === 0) {
      setTeamHint(`${clientName} não tem responsáveis cadastrados. Selecione manualmente.`);
      return;
    }
    // A equipe do cliente é apenas SUGESTÃO: nunca sobrescreve uma escolha
    // manual (inclusive quando o gestor removeu todos os sugeridos).
    if (!touchedAssignees) {
      setAssignees(team);
      setTeamHint(
        team.length === 1
          ? `Responsável sugerido pelo cadastro do cliente. Pode remover ou trocar.`
          : `${team.length} responsáveis sugeridos pelo cadastro do cliente. Pode remover, trocar ou acrescentar.`,
      );
      return;
    }
    setTeamPrompt({ clientName, team });
  };

  return (
    <>
      <ModalBody className="space-y-4" data-modal-body>
        {draftSavedAt !== null && (
          <DraftNotice
            savedAt={draftSavedAt}
            conflict={draftConflict}
            onUseDraft={() => {
              if (draftValues) applyDraftValues(draftValues);
            }}
            onDiscard={() => {
              appliedDraftRef.current = false;
              onDraftDiscard?.();
            }}
          />
        )}
        <form
          id={formId}
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            // A trava precisa ser síncrona e o ciclo completo precisa liberar o estado,
            // inclusive quando uma chamada ao Supabase rejeita.
            if (submittingRef.current) return;
            submittingRef.current = true;
            setLoading(true);
            try {
              // Regra operacional: pelo menos um responsável. A equipe do cliente é
              // sugestão, então a validação olha só o que está selecionado agora.
              if (assignees.length === 0) {
                toast.error("Selecione pelo menos um funcionário para esta tarefa.");
                document.getElementById("task-assignee-search")?.focus();
                return;
              }
              if (!initial && recurrence.enabled && recurrence.frequency === "custom") {
                const selectedDates = normalizeCustomRecurrenceDates(recurrence.selectedDates);
                if (selectedDates.length === 0) {
                  toast.error("Selecione pelo menos uma data no calendário da recorrência.");
                  return;
                }
              }
              // Datas são obrigatórias; horas são opcionais e não criam horário falso.
              const datePattern = /^\d{4}-\d{2}-\d{2}$/;
              if (!startDate || !datePattern.test(startDate)) {
                toast.error("Data de início obrigatória.");
                return;
              }
              if (!endDate || !datePattern.test(endDate)) {
                toast.error("Data de fim obrigatória.");
                return;
              }
              // A série usa a data digitada no formulário de recorrência; a data
              // principal da tarefa é apenas o valor sugerido inicialmente.
              const recurrenceStartDate = recurrence.enabled ? recurrence.startDate || startDate : startDate;
              const recurrenceEndDate = recurrence.enabled ? recurrence.endDate || null : null;
              if (recurrence.enabled && (!recurrenceStartDate || !datePattern.test(recurrenceStartDate))) {
                toast.error("Data de início da recorrência inválida.");
                return;
              }
              if (
                recurrence.enabled &&
                recurrenceEndDate &&
                (!datePattern.test(recurrenceEndDate) || recurrenceEndDate < recurrenceStartDate)
              ) {
                toast.error("A data final da recorrência deve ser igual ou posterior à data inicial.");
                return;
              }
              const startISO = startTime ? wallDateTimeToISO(startDate, startTime) : null;
              const resolvedEndDate = resolveWallEndDate(startDate, startTime, endTime, endDate);
              const endISO = endTime ? wallDateTimeToISO(resolvedEndDate, endTime) : null;
              const dueISO = endISO ?? wallDateToEndOfDayISO(endDate);
              const selectedAssignees = [...new Set(assignees)];
              const selectedDistributedMinutes = distributeContractedMinutes(
                contractedMinutes,
                selectedAssignees.length,
              );
              if (selectedAssignees.length === 0) {
                toast.error("Selecione pelo menos um funcionário para esta tarefa.");
                return;
              }
              if (!dueISO) {
                toast.error("Data de fim inválida.");
                return;
              }
              if (startTime && !startISO) {
                toast.error("Hora de início inválida.");
                return;
              }
              if (endTime && !endISO) {
                toast.error("Horário de fim inválido.");
                return;
              }
              if (endDate < startDate) {
                toast.error("A data de fim deve ser igual ou posterior à data de início.");
                return;
              }
              {
                const spanDays = Math.round(
                  (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000,
                );
                if (spanDays > 2 && !(recurrence.enabled && recurrence.frequency === "custom")) {
                  const ok = window.confirm(
                    `Atenção: a data de fim está ${spanDays} dias depois da data de início.\n\n` +
                      "A data de fim é o fim do turno de trabalho (normalmente o mesmo dia ou o dia seguinte). " +
                      "Para repetir a tarefa em vários dias, use a opção de recorrência.\n\n" +
                      "Deseja manter mesmo assim?",
                  );
                  if (!ok) return;
                }
              }
              if (startISO && endISO && endISO < startISO) {
                toast.error("O horário de fim deve ser posterior ao de início.");
                return;
              }
              // Conflito com férias aprovadas dos funcionários no período.
              {
                const rangeStart = recurrence.enabled ? recurrenceStartDate : startDate;
                const rangeEnd = recurrence.enabled ? recurrenceEndDate || endDate : endDate;
                const { data: vacations } = await supabase
                  .from("vacation_requests")
                  .select("start_date, end_date, user_id")
                  .eq("company_id", companyId)
                  .in("user_id", selectedAssignees)
                  .eq("status", "aprovado")
                  .lte("start_date", rangeEnd)
                  .gte("end_date", rangeStart);
                // Datas personalizadas: cada data é um turno separado; só conta férias que caem
                // num dos dias escolhidos (não no intervalo entre a primeira e a última data).
                const customDays =
                  recurrence.enabled && recurrence.frequency === "custom"
                    ? normalizeCustomRecurrenceDates(recurrence.selectedDates ?? [])
                    : null;
                const conflictingVacations = (vacations ?? []).filter(
                  (v) => !customDays || customDays.some((day) => day >= v.start_date && day <= v.end_date),
                );
                if (conflictingVacations.length > 0) {
                  const periods = conflictingVacations
                    .map((v) => {
                      const name = members.find((m) => m.id === v.user_id)?.full_name ?? "Funcionário";
                      return `${name}: ${v.start_date} → ${v.end_date}`;
                    })
                    .join(", ");
                  const ok = window.confirm(
                    `Há férias aprovadas no período (${periods}). Deseja continuar mesmo assim?`,
                  );
                  if (!ok) return;
                }
              }
              // Título derivado do cliente quando não preenchido manualmente.
              const clientName = clients.find((c) => c.id === clientId)?.name ?? "";
              // O nome do cliente manda: ao trocar o cliente numa edição, o título acompanha.
              const finalTitle = clientName.trim() || title.trim() || description.trim().slice(0, 80) || "Tarefa";
              const payload = {
                title: finalTitle,
                description: description.trim() || null,
                assigned_to: assignedTo,
                client_id: clientId || null,
                priority,
                // Wall-clock: preservar o horário exato cadastrado, sem fuso.
                scheduled_for: startISO,
                scheduled_end: endISO,
                due_at: dueISO,
                recurrence_date: startDate,
                absence_grace_minutes: graceMinutes,
                punch_mode_override: punchMode || null,
                // Etiqueta da programação do cliente escolhida pelo gestor.
                schedule_name: scheduleName,
              };
              // A distribuição da carga contratada só pode recalcular uma hora de fim
              // que o gestor JÁ registou. Sem hora de fim digitada, nada é derivado.
              const useContractedSchedule =
                contractedMinutes != null &&
                !endTypedByManager &&
                startDate !== "" &&
                startTime !== "" &&
                endTime !== "";

              const scheduleRulesByEmployee =
                selectedSchedule?.cycleLengthWeeks && selectedSchedule.cycleLengthWeeks > 1
                  ? selectedAssignees.map((_, employeeIndex) =>
                      clientSchedule
                        .filter(
                          (slot) =>
                            slot.id.startsWith(`client-habitual:${clientId}:`) &&
                            slot.cycleLengthWeeks === selectedSchedule.cycleLengthWeeks &&
                            slot.cycleAnchorDate === selectedSchedule.cycleAnchorDate,
                        )
                        .map((slot) => ({
                          weekdays: slot.weekdays,
                          schedule_name: slot.label ?? null,
                          start_time: teamStartTimeFor(slot, selectedAssignees.length) ?? slot.startTime,
                          duration_minutes:
                            distributeContractedMinutes(
                              slot.contractedMinutes ?? slot.durationMinutes,
                              selectedAssignees.length,
                            )[employeeIndex] ??
                            slot.contractedMinutes ??
                            slot.durationMinutes,
                          cycle_length_weeks: slot.cycleLengthWeeks,
                          cycle_position: slot.cyclePosition,
                          cycle_anchor_date: slot.cycleAnchorDate,
                        })),
                    )
                  : [];
              const manualDurationMinutes =
                startISO && endISO
                  ? Math.max(0, Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60000))
                  : 0;
              // Série: duração = SOMENTE o turno diário (hora início → hora fim,
              // +24 h se passar da meia-noite), nunca a amplitude das datas; máx. 1440.
              const seriesShiftMinutes = startTime && endTime ? dailyShiftDurationMinutes(startTime, endTime) : 0;
              // Tarefa avulsa com mais de 24 h: confirmação simples, sem bloquear.
              if (
                !recurrence.enabled &&
                (!useContractedSchedule || splitFromTaskTimes) &&
                manualDurationMinutes > LONG_STANDALONE_TASK_MINUTES &&
                !confirmedConflictsRef.current &&
                !window.confirm(tt("Esta tarefa dura mais de 24 horas. Confirmar?"))
              ) {
                submittingRef.current = false;
                setLoading(false);
                return;
              }
              const taskTimesFor = (index: number) => {
                if (!useContractedSchedule) {
                  return { scheduled_for: startISO, scheduled_end: endISO, due_at: dueISO };
                }
                const minutes = selectedDistributedMinutes[index] ?? selectedDistributedMinutes[0] ?? 0;
                const end = addWallMinutes(startDate, startTime, minutes);
                if (!end) return { scheduled_for: startISO, scheduled_end: endISO, due_at: dueISO };
                const scheduledEnd = wallDateTimeToISO(end.date, end.time);
                return { scheduled_for: startISO, scheduled_end: scheduledEnd, due_at: scheduledEnd ?? dueISO };
              };

              // SUP-2026-000140 — consulta definitiva imediatamente antes da gravação.
              // Para recorrências, cada data é enviada como uma proposta separada;
              // assim overnight e conflitos pontuais não viram um bloqueio da série.
              if (!confirmedConflictsRef.current) {
                const recurrenceDates = recurrence.enabled
                  ? recurrence.frequency === "custom"
                    ? normalizeCustomRecurrenceDates(recurrence.selectedDates)
                    : previewRecurrenceDates(
                        {
                          frequency: recurrence.frequency,
                          intervalWeeks: recurrence.intervalWeeks,
                          weekdays: recurrence.weekdays,
                          monthlyRule:
                            recurrence.monthPosition != null
                              ? { position: recurrence.monthPosition, weekday: recurrence.monthWeekday }
                              : { day_of_month: recurrence.dayOfMonth },
                          startDate: recurrenceStartDate,
                          endDate: recurrenceEndDate,
                        },
                        400,
                      ).map(localDateToDateKey)
                  : [startDate];
                const proposals = recurrence.enabled
                  ? recurrenceDates.flatMap((dateKey) =>
                      selectedAssignees.flatMap((memberId, index) => {
                        if (!startTime) return [];
                        const minutes = useContractedSchedule
                          ? (selectedDistributedMinutes[index] ?? selectedDistributedMinutes[0] ?? 0)
                          : seriesShiftMinutes;
                        const end = addWallMinutes(dateKey, startTime, minutes);
                        if (!end) return [];
                        const proposedStart = wallDateTimeToISO(dateKey, startTime);
                        const proposedEnd = wallDateTimeToISO(end.date, end.time);
                        return proposedStart && proposedEnd
                          ? [{ assignee_id: memberId, start_at: proposedStart, end_at: proposedEnd }]
                          : [];
                      }),
                    )
                  : selectedAssignees.flatMap((memberId, index) => {
                      const times = taskTimesFor(index);
                      return times.scheduled_for && times.scheduled_end
                        ? [{ assignee_id: memberId, start_at: times.scheduled_for, end_at: times.scheduled_end }]
                        : [];
                    });
                try {
                  const conflicts = await checkTaskScheduleConflicts(companyId, proposals, initial?.id);
                  if (conflicts.length > 0) {
                    setScheduleConflicts(conflicts);
                    submittingRef.current = false;
                    setLoading(false);
                    return;
                  }
                } catch (conflictError) {
                  const technicalError = conflictError as {
                    code?: string;
                    message?: string;
                    details?: string;
                    hint?: string;
                  };
                  const rawMsg = String(technicalError?.message ?? conflictError ?? "");
                  const isNetworkError =
                    rawMsg.includes("Failed to fetch") ||
                    rawMsg.includes("NetworkError") ||
                    rawMsg.includes("Load failed") ||
                    (typeof navigator !== "undefined" && !navigator.onLine);
                  if (isNetworkError) {
                    submittingRef.current = false;
                    setLoading(false);
                    toast.error(
                      "Falha de conexão ao verificar a agenda. Nada foi alterado. Verifique a internet e tente salvar novamente.",
                    );
                    return;
                  }
                  const diagnostic = [
                    technicalError.code ? `Código: ${technicalError.code}` : null,
                    technicalError.message ?? "Falha desconhecida na consulta de sobreposição.",
                    technicalError.details ? `Detalhes: ${technicalError.details}` : null,
                    technicalError.hint ? `Orientação: ${technicalError.hint}` : null,
                  ]
                    .filter(Boolean)
                    .join("\n");
                  console.error("[task-schedule-conflicts] failed", {
                    code: technicalError.code,
                    message: technicalError.message,
                    details: technicalError.details,
                    hint: technicalError.hint,
                    error: conflictError,
                  });
                  submittingRef.current = false;
                  setLoading(false);
                  setScheduleCheckError(diagnostic);
                  return;
                }
              }
              confirmedConflictsRef.current = false;
              let error: { message: string } | null = null;
              let recurrenceSummary: { kind: "success" | "info" | "warning"; text: string } | null = null;
              const createdTaskIds: string[] = [...createdTaskIdsRef.current];
              // Fase B: lote multi-responsável. Cada responsável mantém a SUA tarefa
              // (estado, ponto, recusa e conclusão próprios); o grupo só correlaciona.
              const groupId = selectedAssignees.length > 1 ? crypto.randomUUID() : null;
              if (initial) {
                // SUP-66 / SUP-224: edição atómica da ocorrência (grupo incluído) via RPC.
                // Nunca altera a série; quem já iniciou é preservado pelo backend.
                if (needsGroupAssigneeConfirmation(groupAssignees, selectedAssignees)) {
                  const diff = diffGroupAssignees(groupAssignees, selectedAssignees);
                  const ok = window.confirm(
                    tt("Esta alteração afeta {{count}} colaboradores desta ocorrência. Confirmar?", {
                      count: diff.affected,
                    }),
                  );
                  if (!ok) return;
                }
                const colleagues = groupAssignees.filter((id) => id !== initial.assigned_to).length;
                let applyToGroup = false;
                if (
                  shouldAskGroupScheduleScope({
                    colleagues,
                    oldStart: initial.scheduled_for,
                    oldEnd: initial.scheduled_end,
                    newStart: startISO,
                    newEnd: endISO,
                  })
                ) {
                  const choice = await new Promise<"all" | "mine" | null>((resolve) =>
                    setGroupSchedulePrompt({ count: colleagues, resolve }),
                  );
                  if (!choice) return;
                  applyToGroup = choice === "all";
                }
                // Mantém o responsável da linha clicada em primeiro, se continuar selecionado.
                const orderedAssignees = selectedAssignees.includes(initial.assigned_to ?? "")
                  ? [initial.assigned_to as string, ...selectedAssignees.filter((id) => id !== initial.assigned_to)]
                  : selectedAssignees;
                const { assigned_to: _ignored, ...rpcPayload } = payload;
                void _ignored;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const res = await (supabase.rpc as any)("task_group_edit_occurrence", {
                  _task_id: initial.id,
                  _payload: rpcPayload,
                  _assignees: orderedAssignees,
                  _apply_schedule_to_group: applyToGroup,
                });
                error = res.error;
                // SUP-2026-000315 — divisão das horas feita no banco ao mudar o nº de pessoas.
                const split = (res.data ?? null) as {
                  split_count?: number;
                  split_people?: number;
                  split_minutes?: number | null;
                  split_skipped?: string | null;
                } | null;
                if (!error && split?.split_count && split.split_minutes) {
                  toast.info(
                    `Horas divididas por ${split.split_people} pessoas: ${formatContractedMinutes(split.split_minutes)} cada.`,
                  );
                } else if (!error && split?.split_skipped === "started") {
                  toast.warning("As horas não foram divididas porque alguém desta tarefa já começou ou tem ponto.");
                }
              } else if (recurrence.enabled) {
                // Horario e duracao da recorrencia sao derivados do topo do formulario.
                // Sem horario, a recorrencia fica por dia; nunca materializa 00:00.
                const derivedTime = startTime ? `${startTime}:00` : null;
                // Em recorrências a "data fim" é o fim da série, não do turno:
                // a duração é só a do turno diário (hora fim − hora início,
                // com passagem de meia-noite), nunca a amplitude entre as datas.
                const derivedDuration = seriesShiftMinutes;
                // Uma série (task_recurrence) por funcionário selecionado.
                // ADR-041: inserção individual + idempotência. Se o banco recusar por
                // série ativa equivalente (RECURRENCE_DUPLICATE_ACTIVE), tratamos como
                // "já existe" — nunca criamos um clone e nunca abortamos os restantes.
                let duplicates = 0;
                let created = 0;
                const createdRecurrenceIds: string[] = [];
                const existingRecurrenceIds: string[] = [];
                for (const [index, memberId] of selectedAssignees.entries()) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const ins = await (supabase.from("task_recurrences" as any) as any)
                    .insert({
                      company_id: companyId,
                      created_by: userId,
                      title: payload.title,
                      description: payload.description,
                      assigned_to: memberId,
                      client_id: payload.client_id,
                      priority: payload.priority,
                      absence_grace_minutes: payload.absence_grace_minutes,
                      punch_mode_override: payload.punch_mode_override,
                      frequency: recurrence.frequency,
                      // RRULE FREQ=WEEKLY;INTERVAL=n — 2 = "semana sim, semana não" (âncora = start_date).
                      interval_weeks:
                        recurrence.frequency === "weekly" ? Math.max(1, recurrence.intervalWeeks || 1) : 1,
                      weekdays: recurrence.frequency === "weekly" ? recurrence.weekdays : [],
                      // Mensal: dia fixo do mês (legado) OU posição no mês (BYSETPOS/BYDAY).
                      monthly_rule:
                        recurrence.frequency === "monthly"
                          ? recurrence.monthPosition != null
                            ? { position: recurrence.monthPosition, weekday: recurrence.monthWeekday }
                            : { day_of_month: recurrence.dayOfMonth }
                          : {},
                      start_date: recurrenceStartDate,
                      end_date: recurrenceEndDate,
                      selected_dates:
                        recurrence.frequency === "custom"
                          ? normalizeCustomRecurrenceDates(recurrence.selectedDates)
                          : [],
                      scheduled_time: derivedTime,
                      duration_minutes: useContractedSchedule
                        ? (selectedDistributedMinutes[index] ?? selectedDistributedMinutes[0] ?? derivedDuration)
                        : derivedDuration,
                      schedule_rules: scheduleRulesByEmployee[index] ?? [],
                      schedule_name: payload.schedule_name,
                      task_group_id: groupId,
                    })
                    .select("id");
                  if (ins.error) {
                    const insErrorMessage = String(ins.error.message ?? "");
                    if (insErrorMessage.includes("RECURRENCE_DUPLICATE_ACTIVE")) {
                      duplicates += 1;
                      // A série ativa equivalente já existe: em vez de não fazer nada, gera as
                      // ocorrências que estejam em falta nela (idempotente: série + data é único).
                      const existingId = insErrorMessage.match(
                        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
                      )?.[0];
                      if (existingId && !existingRecurrenceIds.includes(existingId))
                        existingRecurrenceIds.push(existingId);
                      continue;
                    }
                    error = ins.error;
                    break;
                  }
                  created += 1;
                  for (const row of (ins.data ?? []) as { id: string }[]) createdRecurrenceIds.push(row.id);
                }
                if (!error) {
                  // A geração roda POR SÉRIE (recém-criada ou já existente equivalente). Varrer
                  // todas as séries da empresa estourava o statement_timeout em bases grandes.
                  // Janela de 12 meses; o índice único (série + data) mantém a idempotência.
                  const reusedRecurrenceIds = existingRecurrenceIds.filter((id) => !createdRecurrenceIds.includes(id));
                  const toMaterialize = [...createdRecurrenceIds, ...reusedRecurrenceIds];
                  const horizon = 365;
                  const failed: string[] = [];
                  let generated = 0;
                  const materializeOne = async (recurrenceId: string) => {
                    try {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const { data: materialized, error: materializeError } = await (supabase.rpc as any)(
                        "recurrence_materialize",
                        {
                          _days_ahead: horizon,
                          _company_id: companyId,
                          _recurrence_id: recurrenceId,
                        },
                      );
                      if (materializeError) failed.push(materializeError.message ?? "erro desconhecido");
                      else generated += Number(materialized ?? 0) || 0;
                    } catch (materializeFailure) {
                      failed.push((materializeFailure as Error).message ?? "erro desconhecido");
                    }
                  };
                  for (const recurrenceId of createdRecurrenceIds) await materializeOne(recurrenceId);
                  for (const recurrenceId of reusedRecurrenceIds) await materializeOne(recurrenceId);
                  if (failed.length > 0) {
                    // Falha de geração é erro real: nunca prometemos geração futura.
                    toast.error(
                      `Recorrência salva, mas as ocorrências não foram geradas (${failed.length} de ${toMaterialize.length}): ${failed[0]}. Use "Gerar próximos 12 meses" em Recorrências.`,
                    );
                    recurrenceSummary = {
                      kind: "warning",
                      text: "Recorrência salva, mas as tarefas não foram geradas.",
                    };
                  } else if (created > 0 && generated === 0) {
                    recurrenceSummary = {
                      kind: "warning",
                      text: "Recorrência salva, mas nenhuma tarefa foi gerada. Confira as datas escolhidas e se já existem tarefas iguais (mesmo funcionário, cliente, data e horário).",
                    };
                  } else if (created === 0 && duplicates > 0) {
                    recurrenceSummary = {
                      kind: "info",
                      text:
                        generated > 0
                          ? `Esta recorrência já existia e não foi duplicada. Foram geradas ${generated} tarefa(s) que estavam em falta.`
                          : "Esta recorrência já existe e não foi duplicada. Não havia tarefas em falta para gerar.",
                    };
                  } else {
                    recurrenceSummary = {
                      kind: "success",
                      text:
                        `Recorrência criada: ${generated} tarefa(s) gerada(s).` +
                        (duplicates > 0 ? ` ${duplicates} recorrência(s) já existiam e não foram duplicadas.` : ""),
                    };
                  }
                }
              } else if (createdTaskIds.length === 0) {
                // Uma tarefa por funcionário selecionado (tasks.assigned_to segue único).
                const inserted = await supabase
                  .from("tasks")
                  .insert(
                    selectedAssignees.map((memberId, index) => ({
                      ...payload,
                      assigned_to: memberId,
                      company_id: companyId,
                      created_by: userId,
                      task_group_id: groupId,
                      ...taskTimesFor(index),
                    })),
                  )
                  .select("id");
                error = inserted.error;
                for (const row of inserted.data ?? []) createdTaskIds.push(row.id);
                if (!error) createdTaskIdsRef.current = [...createdTaskIds];
              }

              if (error) {
                submittingRef.current = false;
                setLoading(false);
                toast.error(error.message);
                return;
              }
              if (!initial && createdTaskIds.length > 0 && pendingDocs.length > 0) {
                try {
                  const uploadedForAllTasks: TaskDocument[] = [];
                  try {
                    for (const taskId of createdTaskIds) {
                      uploadedForAllTasks.push(
                        ...(await uploadTaskDocuments({
                          taskId,
                          companyId,
                          files: pendingDocs,
                          uploadedBy: userId,
                        })),
                      );
                    }
                  } catch (uploadError) {
                    await removeTaskDocuments(uploadedForAllTasks);
                    throw uploadError;
                  }
                } catch (e) {
                  submittingRef.current = false;
                  setLoading(false);
                  toast.error((e as Error).message);
                  return;
                }
              }
              submittingRef.current = false;
              setLoading(false);
              if (recurrenceSummary) {
                if (recurrenceSummary.kind === "warning") toast.warning(recurrenceSummary.text, { duration: 15000 });
                else if (recurrenceSummary.kind === "info") toast.info(recurrenceSummary.text, { duration: 10000 });
                else toast.success(recurrenceSummary.text);
              } else {
                toast.success(
                  initial
                    ? "Tarefa atualizada"
                    : selectedAssignees.length > 1
                      ? `${selectedAssignees.length} tarefas criadas`
                      : "Tarefa criada",
                );
              }
              onDone();
            } catch (submitError) {
              console.error("[task-create] failed", submitError);
              toast.error(taskSaveErrorMessage(submitError));
            } finally {
              submittingRef.current = false;
              setLoading(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Select
              value={clientId}
              onValueChange={(v) => void applyClient(v)}
              onOpenChange={(open) => {
                if (!open) setClientQuery("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o cliente" />
              </SelectTrigger>
              <SelectContent>
                <div className="sticky top-0 z-10 border-b border-border bg-popover p-2">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      value={clientQuery}
                      onChange={(e) => setClientQuery(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      placeholder="Buscar cliente..."
                      className="h-9 pl-8"
                      aria-label="Buscar cliente"
                    />
                  </div>
                </div>
                {filteredClients.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum cliente encontrado</div>
                ) : (
                  filteredClients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {!initial && namedSchedules.length > 0 && (
              <div className="space-y-1" data-testid="client-schedule-picker">
                <Label>Programação do cliente</Label>
                <Select
                  value={selectedScheduleId ?? "__free__"}
                  onValueChange={(value) => {
                    if (value === "__free__") {
                      setSelectedScheduleId(null);
                      setScheduleHint(null);
                      if (!initial) {
                        setRecurrence((prev) => disableAutoRecurrence(prev, autoRecurrenceRef.current));
                        if (autoRecurrenceRef.current) recurrenceStartTouchedRef.current = false;
                        autoRecurrenceRef.current = false;
                      }
                      return;
                    }
                    const slot = namedSchedules.find((s) => s.id === value);
                    if (slot) {
                      applySlot(slot);
                      if (!initial) applySlotRecurrence(slot);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Livre / Manual" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__free__">Livre / Manual</SelectItem>
                    {namedSchedules.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  O nome escolhido aparece como etiqueta nas tarefas e no calendário.
                </p>
              </div>
            )}
            {!initial && (clientSchedule.length > 0 || contractedMinutes != null) && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
                <p className="font-medium text-foreground">
                  {clientSchedule.length > 0 || clientContractedMinutes != null
                    ? "Configuração do cliente"
                    : "Divisão do horário"}
                </p>
                {clientSchedule.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {clientSchedule.map((s) => (
                      <li key={s.id}>{describeSlot(s)}</li>
                    ))}
                  </ul>
                )}
                {contractedMinutes != null && (
                  <p className="mt-1 text-muted-foreground">
                    {splitFromTaskTimes ? "Carga total (horário da tarefa):" : "Carga total contratada:"}{" "}
                    <span className="font-medium text-foreground">{formatContractedMinutes(contractedMinutes)}</span>
                  </p>
                )}
                {distributedMinutes.length > 0 && (
                  <p className="mt-1 text-muted-foreground">
                    {assignees.length} {assignees.length === 1 ? "funcionário" : "funcionários"} selecionado(s)
                    {" → "}
                    <span className="font-medium text-foreground">
                      {formatContractedMinutes(distributedMinutes[0])} por funcionário
                    </span>
                    {" (o total do serviço não muda ao remover ou acrescentar funcionários)"}
                  </p>
                )}
                {contractedMinutes != null && assignees.length === 0 && (
                  <p className="mt-1 text-muted-foreground">
                    Selecione pelo menos um funcionário para calcular a duração individual.
                  </p>
                )}
                {schedulePrompt.length > 1 && (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-foreground">Este cliente possui mais de uma programação para este dia.</p>
                    <div className="flex flex-wrap gap-1.5">
                      {schedulePrompt.map((s) => (
                        <Button key={s.id} type="button" size="sm" variant="outline" onClick={() => applySlot(s)}>
                          {s.title}: {s.startTime ?? "flexível"}
                          {s.endTime ? `–${s.endTime}` : ""}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {scheduleHint && <p className="mt-1 text-muted-foreground">{scheduleHint}</p>}
              </div>
            )}
            {teamPrompt && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
                <p className="font-medium">
                  Você já escolheu responsáveis. Usar a equipe padrão de {teamPrompt.clientName} (
                  {teamPrompt.team.length}) ou manter a sua seleção?
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setAssignees(teamPrompt.team);
                      setTouchedAssignees(false);
                      setTeamHint("Equipe padrão do novo cliente aplicada.");
                      setTeamPrompt(null);
                    }}
                  >
                    Usar equipe do cliente
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTeamHint("Seleção manual mantida.");
                      setTeamPrompt(null);
                    }}
                  >
                    Manter seleção atual
                  </Button>
                </div>
              </div>
            )}
            {!teamPrompt && teamHint && <p className="text-xs text-muted-foreground">{teamHint}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {!initial && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label htmlFor="task-docs-create">Documentos da tarefa</Label>
                  <p className="text-xs text-muted-foreground">PDF, JPG ou PNG ate 10 MB.</p>
                </div>
                <Button type="button" variant="outline" size="sm" asChild>
                  <label htmlFor="task-docs-create" className="cursor-pointer">
                    <Upload className="mr-1 h-3.5 w-3.5" />
                    Anexar
                  </label>
                </Button>
              </div>
              <Input
                id="task-docs-create"
                type="file"
                accept={TASK_DOCUMENT_ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => {
                  setPendingDocs((current) => mergeTaskFiles(current, Array.from(e.target.files ?? [])));
                  e.target.value = "";
                }}
              />
              {pendingDocs.length > 0 && (
                <ul className="space-y-1">
                  {pendingDocs.map((file) => (
                    <li
                      key={`${file.name}-${file.lastModified}`}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <span className="shrink-0">{formatTaskFileSize(file.size)}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        title={`Remover ${file.name}`}
                        onClick={() => setPendingDocs((current) => current.filter((item) => item !== file))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                {pendingDocs.length === 0
                  ? "Nenhum ficheiro selecionado."
                  : `${pendingDocs.length} ${pendingDocs.length === 1 ? "ficheiro selecionado" : "ficheiros selecionados"}.`}
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Atribuir a</Label>
              {
                <>
                  <Label htmlFor="task-assignee-search">Nome do funcionário</Label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      id="task-assignee-search"
                      value={assigneeQuery}
                      onChange={(e) => setAssigneeQuery(e.target.value)}
                      placeholder="Pesquisar por nome ou setor"
                      aria-label="Pesquisar funcionário"
                      className="h-9 pl-8"
                    />
                  </div>
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                    {members.length === 0 && (
                      <p className="px-1 py-2 text-xs text-muted-foreground">Nenhum funcionário disponível.</p>
                    )}
                    {filteredAssignees.length === 0 && members.length > 0 && (
                      <p className="px-1 py-2 text-xs text-muted-foreground">Nenhum funcionário encontrado.</p>
                    )}
                    {filteredAssignees.map((m) => {
                      const checked = assignees.includes(m.id);
                      return (
                        <label
                          key={m.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            checked={checked}
                            onChange={() => toggleAssignee(m.id)}
                          />
                          <span className="truncate" title={taskMemberName(members, m.id, "Funcionário")}>
                            {taskMemberName(members, m.id, "Funcionário")}
                          </span>
                          {m.sector && (
                            <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground">{m.sector}</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Os funcionários do cadastro do cliente vêm apenas como sugestão: pode remover, trocar ou acrescentar
                    livremente sem alterar o cadastro do cliente. Cada responsável recebe a sua própria tarefa, com
                    estado, ponto, recusa e conclusão independentes — a ação de um não altera a do outro.
                  </p>
                </>
              }
            </div>
            <div className="space-y-1.5">
              <Label>Data início</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const next = e.target.value;
                  setTouchedDates(true);
                  setStartDate(next);
                  suggestFromSchedule(clientSchedule, next);
                }}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Hora início <span className="text-xs text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => {
                  setTouchedTimes(true);
                  setSchedulePrompt([]);
                  setStartTime(e.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data fim</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setTouchedDates(true);
                  setEndDate(e.target.value);
                }}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Hora fim <span className="text-xs text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => {
                  setManualEndOverride(true);
                  setTouchedTimes(true);
                  setSchedulePrompt([]);
                  setEndTime(e.target.value);
                }}
              />
            </div>
            {perEmployeeSchedule.length > 1 && (
              <div className="col-span-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
                <div className="font-medium">Horário de cada funcionário (horas divididas)</div>
                <ul className="mt-1 space-y-0.5">
                  {perEmployeeSchedule.map((p) => (
                    <li key={p.id}>
                      <span className="font-medium">{p.name}</span>: {startTime} → {p.end} ({p.duration})
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-muted-foreground">
                  A Hora fim acima é o fim do serviço completo; cada funcionário fica com a sua parte. Ao marcar ou
                  desmarcar funcionários, o cálculo é refeito. Para dar o horário completo a todos, altere a Hora fim.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Tolerância de ausência (min)</Label>
              <Input
                type="number"
                min={0}
                max={1440}
                value={graceMinutes}
                onChange={(e) => setGraceMinutes(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Modo de folha de ponto</Label>
              <Select
                value={punchMode || "default"}
                onValueChange={(v) => setPunchMode(v === "default" ? "" : (v as PunchMode))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Padrão da empresa</SelectItem>
                  <SelectItem value="automatico">{PUNCH_MODE_LABELS.automatico}</SelectItem>
                  <SelectItem value="manual">{PUNCH_MODE_LABELS.manual}</SelectItem>
                  <SelectItem value="ambos">{PUNCH_MODE_LABELS.ambos}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {!initial && (
            <div ref={recurrenceBlockRef} data-testid="recurrence-block">
              <RecurrenceForm
                value={recurrence}
                onChange={handleRecurrenceChange}
                timingMode={timingMode}
                summary={
                  !initial && recurrence.enabled && selectedSchedule?.label
                    ? scheduleSlotSummary(selectedSchedule, t)
                    : null
                }
              />
            </div>
          )}
        </form>
        {documentsSlot && <div className="border-t border-border pt-4">{documentsSlot}</div>}
      </ModalBody>
      <ModalFooter>
        <Button type="button" variant="outline" disabled={loading} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" form={formId} disabled={loading}>
          {loading ? "Salvando..." : initial ? "Salvar alterações" : "Criar tarefa"}
        </Button>
      </ModalFooter>
      <AlertDialog
        open={!!groupSchedulePrompt}
        onOpenChange={(open) => {
          if (!open && groupSchedulePrompt) {
            groupSchedulePrompt.resolve(null);
            setGroupSchedulePrompt(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tt("Novo horário da tarefa de grupo")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tt("Aplicar o novo horário aos {{count}} colegas desta mesma ocorrência?", {
                count: groupSchedulePrompt?.count ?? 0,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tt("Cancelar")}</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                groupSchedulePrompt?.resolve("mine");
                setGroupSchedulePrompt(null);
              }}
            >
              {tt("Só a minha")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                groupSchedulePrompt?.resolve("all");
                setGroupSchedulePrompt(null);
              }}
            >
              {tt("Sim, a todos")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={scheduleConflicts.length > 0}
        onOpenChange={(open) => {
          if (!open) {
            setScheduleConflicts([]);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-warning-foreground">
              <AlertTriangle className="h-5 w-5" /> Atenção: sobreposição de tarefas
            </AlertDialogTitle>
            <AlertDialogDescription>
              Uma ou mais pessoas selecionadas já possuem tarefas neste período. A criação continua disponível.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            {assignees.map((assigneeId) => {
              const employeeConflicts = scheduleConflicts.filter((conflict) => conflict.assignee_id === assigneeId);
              const member = members.find((m) => m.id === assigneeId);
              const employee = member?.full_name?.trim() || member?.email?.trim() || "Funcionário";
              return (
                <div key={assigneeId} className="space-y-2 rounded-md border border-border/70 bg-background/70 p-3">
                  <p className="font-semibold text-foreground">
                    {employeeConflicts.length > 0 ? "⚠" : "✓"} {employee}
                  </p>
                  {employeeConflicts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Disponível neste horário</p>
                  ) : (
                    employeeConflicts.map((conflict, index) => (
                      <div
                        key={`${conflict.conflicting_task_id}-${conflict.proposed_start}-${index}`}
                        className="space-y-1"
                      >
                        <p className="text-muted-foreground">
                          Tarefa existente:{" "}
                          <span className="font-medium text-foreground">
                            {conflict.conflicting_client_name || conflict.conflicting_title}
                          </span>
                        </p>
                        <p className="text-muted-foreground">
                          {formatWallDate(conflict.conflicting_start)} · {formatWallTime(conflict.conflicting_start)} →{" "}
                          {formatWallDate(conflict.conflicting_end) !== formatWallDate(conflict.conflicting_start)
                            ? `${formatWallDate(conflict.conflicting_end)} · `
                            : ""}
                          {formatWallTime(conflict.conflicting_end)}
                        </p>
                        <p className="text-muted-foreground">
                          Nova tarefa: {formatWallDate(conflict.proposed_start)} ·{" "}
                          {formatWallTime(conflict.proposed_start)} → {formatWallTime(conflict.proposed_end)}
                        </p>
                        <p className="font-medium text-warning-foreground">
                          Conflito: {formatWallTime(conflict.overlap_start)} → {formatWallTime(conflict.overlap_end)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setScheduleConflicts([])}>Voltar e ajustar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmedConflictsRef.current = true;
                setScheduleConflicts([]);
                (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit();
              }}
            >
              Criar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={scheduleCheckError !== null}
        onOpenChange={(open) => {
          if (!open) setScheduleCheckError(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Falha técnica na verificação</AlertDialogTitle>
            <AlertDialogDescription>
              A tarefa não foi criada. Corrija a configuração do banco e tente novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            {scheduleCheckError}
          </pre>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setScheduleCheckError(null)}>Voltar ao formulário</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
