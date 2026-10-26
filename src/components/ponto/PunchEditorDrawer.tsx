import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useFormDraft } from "@/lib/form-draft";
import { DraftNotice } from "@/components/form-draft/DraftNotice";
import { Sheet, SheetContent, ModalBody, ModalFooter, ModalHeader, ModalSection } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  punchAdminCreate,
  punchAbsenceRegularize,
  punchAdminUpdate,
  punchPaidLeaveCreate,
  toLocalInput,
  fromLocalInput,
  type AdminTimeEntry,
  ORIGIN_LABEL,
} from "@/lib/punch-admin";
import { wallISOToInput } from "@/lib/wall-clock";
import { validatePauseList, type TimeEntryPauseRow } from "@/lib/punch/pause";
import { formatDuration } from "@/lib/tasks";
import { ClockPlus, Pencil, Users, Clock, FileText, Coffee, Plus, Trash2 } from "lucide-react";

type Mode = "create" | "edit";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  companyId: string;
  entry?: AdminTimeEntry | null;
  entryTaskTitle?: string;
  entryUserName?: string;
  entryClientName?: string;
  initialEntryKind?: "work" | "paid_leave";
  initialUserId?: string | null;
  initialTaskId?: string | null;
  /** Horário previsto da tarefa: sugestão inicial ao lançar ponto manual (o gestor pode alterar). */
  initialStartedAt?: string | null;
  initialEndedAt?: string | null;
  regularizeTaskAbsence?: boolean;
}

interface FormState {
  entry_kind: "work" | "paid_leave";
  user_id: string;
  task_id: string;
  leave_date: string;
  leave_minutes: string;
  started_at: string;
  ended_at: string;
  paused_at: string;
  resumed_at: string;
  notes: string;
  reason: string;
}

const emptyForm = (entryKind: "work" | "paid_leave" = "work"): FormState => ({
  entry_kind: entryKind,
  user_id: "",
  task_id: "",
  leave_date: "",
  leave_minutes: "480",
  started_at: "",
  ended_at: "",
  paused_at: "",
  resumed_at: "",
  notes: "",
  reason: "",
});

function previewEffective(f: Pick<FormState, "started_at" | "ended_at" | "paused_at" | "resumed_at">): number | null {
  if (!f.started_at || !f.ended_at) return null;
  const start = new Date(f.started_at).getTime();
  const end = new Date(f.ended_at).getTime();
  if (isNaN(start) || isNaN(end) || end < start) return null;
  let pauseMs = 0;
  if (f.paused_at) {
    const p = new Date(f.paused_at).getTime();
    const r = f.resumed_at ? new Date(f.resumed_at).getTime() : end;
    pauseMs = Math.max(0, r - p);
  }
  return Math.max(0, Math.floor((end - start - pauseMs) / 1000 / 60 + 0.5));
}

export function PunchEditorDrawer(props: Props) {
  const { user } = useAuth();
  // O formulário, as pausas e as refs pertencem à mesma identidade do rascunho.
  // Desmontar o editor anterior também descarrega a sua gravação pendente.
  const editorKey = JSON.stringify([
    user?.id ?? null,
    props.companyId,
    props.mode,
    props.mode === "edit" ? props.entry?.id ?? null : null,
    props.mode === "create" ? props.regularizeTaskAbsence ?? false : false,
    props.mode === "create" ? props.initialTaskId ?? null : null,
    props.mode === "create" ? props.initialUserId ?? null : null,
    props.mode === "create" ? props.initialEntryKind ?? "work" : null,
  ]);
  return <PunchEditorSession key={editorKey} {...props} />;
}

function PunchEditorSession({
  open,
  onOpenChange,
  mode,
  companyId,
  entry,
  entryTaskTitle,
  entryUserName,
  entryClientName,
  initialEntryKind = "work",
  initialUserId = null,
  initialTaskId = null,
  initialStartedAt = null,
  initialEndedAt = null,
  regularizeTaskAbsence = false,
}: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm());
  // Várias pausas (fase 2): lista editável das pausas terminadas do ponto.
  const [pauseRows, setPauseRows] = useState<{ paused_at: string; resumed_at: string }[]>([]);
  const [pausesDirty, setPausesDirty] = useState(false);

  // ----- Rascunho automático do editor de ponto -----
  interface PunchEditorDraft extends Record<string, unknown> {
    form: FormState;
    pauseRows: { paused_at: string; resumed_at: string }[];
    pausesDirty: boolean;
  }
  const { user } = useAuth();
  const appliedDraftRef = useRef(false);
  const restoredDraftRef = useRef<PunchEditorDraft | null>(null);
  const suppressedDraftRef = useRef(false);
  const initialFingerprintRef = useRef("");
  // Valores iniciais do formulário (antes de qualquer rascunho), para "Descartar".
  const baseSnapshotRef = useRef<PunchEditorDraft | null>(null);
  const reopenedRef = useRef(false);
  const draftDirty =
    initialFingerprintRef.current !== "" &&
    JSON.stringify({ form, pauseRows, pausesDirty }) !== initialFingerprintRef.current;
  const draft = useFormDraft<PunchEditorDraft>({
    formId: "punch-editor",
    recordId:
      mode === "edit" ? (entry?.id ?? null) : regularizeTaskAbsence ? `regularize-${initialTaskId ?? ""}` : null,
    baseUpdatedAt: mode === "edit" ? (entry?.updated_at ?? null) : null,
    userId: user?.id,
    companyId,
    enabled: mode === "create" || !!entry?.id,
    dirty: open && draftDirty,
  });
  const applyDraft = (values: PunchEditorDraft) => {
    appliedDraftRef.current = true;
    setForm(values.form);
    setPauseRows(values.pauseRows);
    setPausesDirty(values.pausesDirty);
    initialFingerprintRef.current = JSON.stringify(values);
  };
  useEffect(() => {
    if (!draft.restored || appliedDraftRef.current) return;
    restoredDraftRef.current = draft.restored;
    if (mode === "create" && draft.restoredOpen && !open && !reopenedRef.current) {
      reopenedRef.current = true;
      onOpenChange(true);
      return;
    }
    if (!open || draft.conflict) return;
    applyDraft(draft.restored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.restored, draft.restoredOpen, draft.conflict, open, mode]);
  useEffect(() => {
    if (!open) return;
    if (suppressedDraftRef.current) return;
    if (draft.restored && !appliedDraftRef.current) return; // rascunho pendente de decisão
    if (initialFingerprintRef.current === "") {
      // Primeira passagem após abrir: fixa a linha de base, ainda não grava.
      initialFingerprintRef.current = JSON.stringify({ form, pauseRows, pausesDirty });
      baseSnapshotRef.current = { form, pauseRows, pausesDirty };
      return;
    }
    if (!draftDirty) return;
    draft.save({ form, pauseRows, pausesDirty }, { open: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, pauseRows, pausesDirty, open, draftDirty]);
  const clearDraft = () => {
    suppressedDraftRef.current = true;
    appliedDraftRef.current = false;
    restoredDraftRef.current = null;
    draft.clear();
  };
  // Fechar por ESC/clique fora: mantém o rascunho com open:false.
  const handleOpenChange = (v: boolean) => {
    if (!v && !suppressedDraftRef.current && draftDirty) {
      draft.save({ form, pauseRows, pausesDirty }, { open: false });
    }
    if (v) suppressedDraftRef.current = false;
    onOpenChange(v);
  };


  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && entry) {
      setForm({
        entry_kind: entry.entry_kind ?? "work",
        user_id: entry.user_id,
        task_id: entry.task_id ?? "",
        leave_date: entry.started_at ? new Date(entry.started_at).toISOString().slice(0, 10) : "",
        leave_minutes: String(entry.paid_leave_minutes ?? entry.effective_minutes ?? 480),
        started_at: toLocalInput(entry.started_at),
        ended_at: toLocalInput(entry.ended_at),
        paused_at: toLocalInput(entry.paused_at),
        resumed_at: toLocalInput(entry.resumed_at),
        notes: entry.notes ?? "",
        reason: "",
      });
    } else if (mode === "create") {
      setForm({
        ...emptyForm(initialEntryKind),
        user_id: initialUserId ?? "",
        task_id: initialTaskId ?? "",
        // Ponto manual de uma tarefa: já vem com o horário previsto da tarefa,
        // que é wall-clock (guardado como se fosse UTC). Ler componentes UTC
        // evita o deslocamento do fuso do dispositivo; ao salvar, fromLocalInput
        // grava o horário de parede como instante local correto.
        started_at: wallISOToInput(initialStartedAt),
        ended_at: wallISOToInput(initialEndedAt),
      });
    }
    if (!appliedDraftRef.current) {
      initialFingerprintRef.current = "";
    }
  }, [open, mode, entry, initialEntryKind, initialUserId, initialTaskId, initialStartedAt, initialEndedAt]);

  // Membros da empresa para o select de usuário (somente modo create)
  const { data: members } = useQuery({
    queryKey: ["punch-admin-members", companyId],
    enabled: open && mode === "create" && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, profiles!inner(full_name)")
        .eq("company_id", companyId);
      if (error) throw error;
      const seen = new Set<string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[])
        .filter((r) => {
          if (seen.has(r.user_id)) return false;
          seen.add(r.user_id);
          return true;
        })
        .map((r) => ({ id: r.user_id as string, name: (r.profiles?.full_name as string) ?? r.user_id }));
    },
  });

  // Tarefas do usuário escolhido (para modo create)
  const { data: userTasks } = useQuery({
    queryKey: ["punch-admin-user-tasks", companyId, form.user_id],
    enabled: open && mode === "create" && form.entry_kind === "work" && !!companyId && !!form.user_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,scheduled_for,status")
        .eq("company_id", companyId)
        .eq("assigned_to", form.user_id)
        .order("scheduled_for", { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as { id: string; title: string; scheduled_for: string | null; status: string }[];
    },
  });

  const diffPreview = useMemo(() => {
    if (mode !== "edit" || !entry) return [] as string[];
    const lines: string[] = [];
    const compare = (label: string, oldV: string | null, newLocal: string) => {
      const newIso = fromLocalInput(newLocal);
      if ((oldV ?? null) !== (newIso ?? null)) {
        const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");
        lines.push(`${label}: ${fmt(oldV)} → ${fmt(newIso)}`);
      }
    };
    compare("Início", entry.started_at, form.started_at);
    compare("Fim", entry.ended_at, form.ended_at);
    compare("Pausa", entry.paused_at, form.paused_at);
    compare("Retorno", entry.resumed_at, form.resumed_at);
    if ((entry.notes ?? "") !== form.notes) {
      lines.push(`Notas alteradas`);
    }
    return lines;
  }, [mode, entry, form]);

  // Várias pausas por ponto: as pausas anteriores (só leitura nesta fase) também são descontadas.
  const { data: entryPauses } = useQuery({
    queryKey: ["punch-entry-pauses", entry?.id ?? null],
    enabled: open && mode === "edit" && !!entry?.id,
    queryFn: async () => {
      const { data, error } = await (supabase.from("time_entry_pauses" as never) as any)
        .select("time_entry_id, paused_at, resumed_at, is_current")
        .eq("time_entry_id", entry!.id)
        .order("paused_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TimeEntryPauseRow[];
    },
  });
  // Ponto de trabalho em edição: as pausas são editadas como lista (todas contam no efetivo).
  const isWorkEdit = mode === "edit" && !!entry && (entry.entry_kind ?? "work") === "work" && !regularizeTaskAbsence;
  // Pausa a decorrer num ponto aberto: não é editável.
  const runningPauseStart = entry && !entry.ended_at && entry.paused_at && !entry.resumed_at ? entry.paused_at : null;

  useEffect(() => {
    if (!open || !isWorkEdit || !entry || entryPauses === undefined) return;
    if (appliedDraftRef.current) return;
    const finished = entryPauses.filter((p) => !!p.resumed_at);
    const base =
      entryPauses.length > 0
        ? finished.map((p) => ({ paused_at: p.paused_at, resumed_at: p.resumed_at as string }))
        : entry.paused_at && entry.resumed_at
          ? [{ paused_at: entry.paused_at, resumed_at: entry.resumed_at }]
          : [];
    const baseRows = base.map((p) => ({ paused_at: toLocalInput(p.paused_at), resumed_at: toLocalInput(p.resumed_at) }));
    setPauseRows(baseRows);
    setPausesDirty(false);
    if (!appliedDraftRef.current) {
      initialFingerprintRef.current = JSON.stringify({ form, pauseRows: baseRows, pausesDirty: false });
      baseSnapshotRef.current = { form, pauseRows: baseRows, pausesDirty: false };
    } else if (baseSnapshotRef.current) {
      baseSnapshotRef.current = { ...baseSnapshotRef.current, pauseRows: baseRows, pausesDirty: false };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isWorkEdit, entry, entryPauses]);

  const updatePauseRow = (i: number, patch: Partial<{ paused_at: string; resumed_at: string }>) => {
    setPauseRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setPausesDirty(true);
  };
  const removePauseRow = (i: number) => {
    setPauseRows((rows) => rows.filter((_, j) => j !== i));
    setPausesDirty(true);
  };
  const addPauseRow = () => {
    setPauseRows((rows) => [...rows, { paused_at: "", resumed_at: "" }]);
    setPausesDirty(true);
  };

  const pauseRowsMs = pauseRows.reduce((acc, p) => {
    const a = new Date(p.paused_at).getTime();
    const b = new Date(p.resumed_at).getTime();
    return Number.isFinite(a) && Number.isFinite(b) && b > a ? acc + (b - a) : acc;
  }, 0);
  const eff = (() => {
    if (!isWorkEdit) return previewEffective(form);
    if (!form.started_at || !form.ended_at) return null;
    const s = new Date(form.started_at).getTime();
    const e = new Date(form.ended_at).getTime();
    if (isNaN(s) || isNaN(e) || e < s) return null;
    return Math.max(0, Math.floor((e - s - pauseRowsMs) / 60000 + 0.5));
  })();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["punch-admin-list"] });
    qc.invalidateQueries({ queryKey: ["punch-audit"] });
    qc.invalidateQueries({ queryKey: ["punch-entry-pauses"] });
    qc.invalidateQueries({ queryKey: ["punch-admin-pauses"] });
  };

  const createMut = useMutation({
    mutationFn: () => {
      if (form.entry_kind === "paid_leave") {
        return punchPaidLeaveCreate(
          {
            company_id: companyId,
            user_id: form.user_id,
            date: form.leave_date,
            minutes: Number(form.leave_minutes || 480),
            notes: form.notes || null,
          },
          form.reason,
        );
      }

      if (regularizeTaskAbsence) {
        return punchAbsenceRegularize(
          form.task_id,
          fromLocalInput(form.started_at)!,
          fromLocalInput(form.ended_at),
          form.reason,
        );
      }

      return punchAdminCreate(
        {
          task_id: form.task_id,
          user_id: form.user_id,
          started_at: fromLocalInput(form.started_at)!,
          ended_at: fromLocalInput(form.ended_at),
          paused_at: fromLocalInput(form.paused_at),
          resumed_at: fromLocalInput(form.resumed_at),
          notes: form.notes || null,
        },
        form.reason,
      );
    },
    onSuccess: () => {
      clearDraft();
      toast.success("Ponto criado");
      invalidate();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!entry) throw new Error("Sem registro");
      const payload: Record<string, unknown> = {};
      const oldStarted = toLocalInput(entry.started_at);
      const oldEnded = toLocalInput(entry.ended_at);
      const oldPaused = toLocalInput(entry.paused_at);
      const oldResumed = toLocalInput(entry.resumed_at);
      if (form.started_at !== oldStarted) payload.started_at = fromLocalInput(form.started_at);
      if (form.ended_at !== oldEnded) payload.ended_at = fromLocalInput(form.ended_at);
      if (form.paused_at !== oldPaused) payload.paused_at = fromLocalInput(form.paused_at);
      if (form.resumed_at !== oldResumed) payload.resumed_at = fromLocalInput(form.resumed_at);
      if (form.notes !== (entry.notes ?? "")) payload.notes = form.notes || null;
      // Várias pausas: a lista é validada aqui e de novo no banco (punch_admin_set_pauses).
      let pausesPayload: { paused_at: string | null; resumed_at: string | null }[] | null = null;
      if (isWorkEdit && pausesDirty) {
        const iso = pauseRows.map((p) => ({
          paused_at: fromLocalInput(p.paused_at),
          resumed_at: fromLocalInput(p.resumed_at),
        }));
        const limit = runningPauseStart ?? fromLocalInput(form.ended_at) ?? new Date().toISOString();
        const err = validatePauseList(iso, fromLocalInput(form.started_at), limit);
        if (err) throw new Error(err);
        pausesPayload = iso;
      }
      if (Object.keys(payload).length === 0 && !pausesPayload) throw new Error("Nada a alterar");
      let result: unknown = null;
      if (Object.keys(payload).length > 0) result = await punchAdminUpdate(entry.id, payload, form.reason);
      if (pausesPayload) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.rpc as any)("punch_admin_set_pauses", {
          _id: entry.id,
          _pauses: pausesPayload,
          _reason: form.reason || null,
        });
        if (error) throw new Error(error.message);
        result = data;
      }
      return result;
    },
    onSuccess: () => {
      clearDraft();
      toast.success("Correção aplicada");
      invalidate();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    if (mode === "create") {
      if (form.entry_kind === "paid_leave") {
        if (!form.user_id || !form.leave_date || !form.leave_minutes) {
          toast.error("Funcionario, data e horas remuneradas sao obrigatorios");
          return;
        }
        if (form.reason.trim().length < 5) {
          toast.error("Informe o motivo da folga remunerada");
          return;
        }
        createMut.mutate();
        return;
      }

      if (!form.user_id || !form.task_id || !form.started_at) {
        toast.error("Funcionário, tarefa e início são obrigatórios");
        return;
      }
      if (regularizeTaskAbsence && form.reason.trim().length < 3) {
        toast.error("Informe o motivo da regularização");
        return;
      }
      createMut.mutate();
    } else {
      updateMut.mutate();
    }
  };

  const pending = createMut.isPending || updateMut.isPending;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <ModalHeader
          icon={mode === "create" ? ClockPlus : Pencil}
          title={regularizeTaskAbsence ? "Regularizar falta" : mode === "create" ? "Adicionar ponto" : "Corrigir ponto"}
          description={
            regularizeTaskAbsence
              ? "Informe o horário real. A falta será substituída por um ponto manual auditado."
              : mode === "create"
                ? "Registro manual. Toda criação é auditada."
                : "Toda alteração é gravada no histórico."
          }
        />

        <ModalBody className="space-y-4">
          {draft.savedAt !== null && (
            <DraftNotice
              savedAt={draft.savedAt}
              conflict={draft.conflict}
              onUseDraft={() => {
                if (restoredDraftRef.current) applyDraft(restoredDraftRef.current);
              }}
              onDiscard={() => {
                // Repõe os valores iniciais e limpa o rascunho.
                const base = baseSnapshotRef.current;
                clearDraft();
                if (base) {
                  setForm(base.form);
                  setPauseRows(base.pauseRows);
                  setPausesDirty(base.pausesDirty);
                  initialFingerprintRef.current = JSON.stringify(base);
                }
                suppressedDraftRef.current = false;
              }}
            />
          )}
          {mode === "edit" && entry && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1">
              <div>
                <span className="text-muted-foreground">Funcionário:</span> {entryUserName ?? entry.user_id}
              </div>
              <div>
                <span className="text-muted-foreground">Tarefa:</span> {entryTaskTitle ?? entry.task_id}
              </div>
              <div>
                <span className="text-muted-foreground">Cliente:</span> {entryClientName ?? "Sem cliente"}
              </div>
              <div>
                <span className="text-muted-foreground">Origem:</span> {ORIGIN_LABEL[entry.origin]}
              </div>
              {entry.last_edited_at && (
                <div>
                  <span className="text-muted-foreground">Última edição:</span>{" "}
                  {new Date(entry.last_edited_at).toLocaleString()}
                </div>
              )}
            </div>
          )}

          {mode === "create" && regularizeTaskAbsence && (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">Funcionário:</span>{" "}
                {entryUserName ?? "Selecionado na ocorrência"}
              </div>
              <div>
                <span className="text-muted-foreground">Tarefa:</span> {entryTaskTitle ?? "Selecionada na ocorrência"}
              </div>
              <div>
                <span className="text-muted-foreground">Cliente:</span> {entryClientName ?? "Sem cliente"}
              </div>
            </div>
          )}

          {mode === "create" && !regularizeTaskAbsence && (
            <ModalSection title="Funcionário / tarefa / cliente" icon={Users}>
              <div>
                <Label>Tipo de registro</Label>
                <Select
                  value={form.entry_kind}
                  onValueChange={(v) => setForm({ ...form, entry_kind: v as "work" | "paid_leave", task_id: "" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="work">Ponto trabalhado</SelectItem>
                    <SelectItem value="paid_leave">Folga remunerada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Funcionário</Label>
                <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v, task_id: "" })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {(members ?? []).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.entry_kind === "work" && (
                <div>
                  <Label>Tarefa</Label>
                  <Select
                    value={form.task_id}
                    onValueChange={(v) => setForm({ ...form, task_id: v })}
                    disabled={!form.user_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={form.user_id ? "Selecione" : "Escolha o funcionário primeiro"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(userTasks ?? []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.title}
                          {t.scheduled_for ? ` · ${new Date(t.scheduled_for).toLocaleDateString()}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </ModalSection>
          )}

          {mode === "create" && form.entry_kind === "paid_leave" ? (
            <ModalSection
              title="Folga remunerada"
              icon={Clock}
              contentClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 space-y-0"
            >
              <div>
                <Label>Data da folga *</Label>
                <Input
                  type="date"
                  value={form.leave_date}
                  onChange={(e) => setForm({ ...form, leave_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Horas remuneradas *</Label>
                <Input
                  type="number"
                  min="0.25"
                  max="24"
                  step="0.25"
                  value={Number(form.leave_minutes || 0) / 60}
                  onChange={(e) =>
                    setForm({ ...form, leave_minutes: String(Math.round(Number(e.target.value || 0) * 60)) })
                  }
                />
              </div>
            </ModalSection>
          ) : (
            <ModalSection
              title="Horários"
              icon={Clock}
              contentClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 space-y-0"
            >
              <div>
                <Label>Início *</Label>
                <Input
                  type="datetime-local"
                  value={form.started_at}
                  onChange={(e) => setForm({ ...form, started_at: e.target.value })}
                />
              </div>
              <div>
                <Label>Fim</Label>
                <Input
                  type="datetime-local"
                  value={form.ended_at}
                  onChange={(e) => setForm({ ...form, ended_at: e.target.value })}
                />
              </div>
              {!regularizeTaskAbsence && !isWorkEdit && (
                <div>
                  <Label>Pausa</Label>
                  <Input
                    type="datetime-local"
                    value={form.paused_at}
                    onChange={(e) => setForm({ ...form, paused_at: e.target.value })}
                  />
                </div>
              )}
              {!regularizeTaskAbsence && !isWorkEdit && (
                <div>
                  <Label>Retorno</Label>
                  <Input
                    type="datetime-local"
                    value={form.resumed_at}
                    onChange={(e) => setForm({ ...form, resumed_at: e.target.value })}
                  />
                </div>
              )}
            </ModalSection>
          )}

          {isWorkEdit && (
            <ModalSection title="Pausas" icon={Coffee}>
              {entryPauses === undefined ? (
                <div className="text-xs text-muted-foreground">A carregar pausas…</div>
              ) : (
                <div className="space-y-2">
                  {pauseRows.length === 0 && (
                    <div className="text-xs text-muted-foreground">Sem pausas terminadas.</div>
                  )}
                  {pauseRows.map((p, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-1 gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                    >
                      <div>
                        <Label>Pausa {i + 1} · início</Label>
                        <Input
                          type="datetime-local"
                          value={p.paused_at}
                          onChange={(e) => updatePauseRow(i, { paused_at: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Retorno</Label>
                        <Input
                          type="datetime-local"
                          value={p.resumed_at}
                          onChange={(e) => updatePauseRow(i, { resumed_at: e.target.value })}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removePauseRow(i)}
                        aria-label={`Remover pausa ${i + 1}`}
                      >
                        <Trash2 className="h-4 w-4" /> Remover
                      </Button>
                    </div>
                  ))}
                  {runningPauseStart && (
                    <div className="rounded-lg border border-warning/40 bg-warning/5 p-2 text-xs">
                      Pausa em curso desde{" "}
                      {new Date(runningPauseStart).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}{" "}
                      — não pode ser editada enquanto decorre.
                    </div>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={addPauseRow}>
                    <Plus className="h-4 w-4" /> Adicionar pausa
                  </Button>
                </div>
              )}
            </ModalSection>
          )}

          <ModalSection title="Motivo e auditoria" icon={FileText}>
            <div>
              <Label>Notas</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            {eff !== null && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                Tempo efetivo previsto: <span className="font-mono font-semibold">{formatDuration(eff)}</span>
              </div>
            )}

            {mode === "edit" && (diffPreview.length > 0 || pausesDirty) && (
              <div className="rounded-lg border border-info/40 bg-info/5 p-3 text-xs space-y-1">
                <div className="font-medium text-info">Alterações a aplicar:</div>
                {diffPreview.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
                {pausesDirty && <div>Pausas: {pauseRows.length} pausa(s) depois da correção</div>}
              </div>
            )}

            <div>
              <Label>
                Motivo{" "}
                <span className="text-xs text-muted-foreground">
                  {regularizeTaskAbsence
                    ? "(obrigatório — fica registrado no histórico)"
                    : "(opcional — quando informado, fica registrado no histórico)"}
                </span>
              </Label>
              <Textarea
                rows={2}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Ex.: Funcionário esqueceu de bater saída; correção conferida com supervisor."
              />
            </div>
          </ModalSection>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              clearDraft();
              onOpenChange(false);
            }}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending
              ? "Salvando..."
              : regularizeTaskAbsence
                ? "Registrar ponto e regularizar"
                : mode === "create"
                  ? "Criar registro"
                  : "Aplicar correção"}
          </Button>
        </ModalFooter>
      </SheetContent>
    </Sheet>
  );
}
