import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  punchAdminCreate,
  punchAdminUpdate,
  toLocalInput,
  fromLocalInput,
  type AdminTimeEntry,
  ORIGIN_LABEL,
} from "@/lib/punch-admin";
import { formatDuration } from "@/lib/tasks";

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
}

interface FormState {
  user_id: string;
  task_id: string;
  started_at: string;
  ended_at: string;
  paused_at: string;
  resumed_at: string;
  notes: string;
  reason: string;
}

const emptyForm = (): FormState => ({
  user_id: "",
  task_id: "",
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

export function PunchEditorDrawer({
  open,
  onOpenChange,
  mode,
  companyId,
  entry,
  entryTaskTitle,
  entryUserName,
  entryClientName,
}: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && entry) {
      setForm({
        user_id: entry.user_id,
        task_id: entry.task_id,
        started_at: toLocalInput(entry.started_at),
        ended_at: toLocalInput(entry.ended_at),
        paused_at: toLocalInput(entry.paused_at),
        resumed_at: toLocalInput(entry.resumed_at),
        notes: entry.notes ?? "",
        reason: "",
      });
    } else if (mode === "create") {
      setForm(emptyForm());
    }
  }, [open, mode, entry]);

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
    enabled: open && mode === "create" && !!companyId && !!form.user_id,
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

  const eff = previewEffective(form);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["punch-admin-list"] });
    qc.invalidateQueries({ queryKey: ["punch-audit"] });
  };

  const createMut = useMutation({
    mutationFn: () =>
      punchAdminCreate(
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
      ),
    onSuccess: () => {
      toast.success("Ponto criado");
      invalidate();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: () => {
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
      if (Object.keys(payload).length === 0) throw new Error("Nada a alterar");
      return punchAdminUpdate(entry.id, payload, form.reason);
    },
    onSuccess: () => {
      toast.success("Correção aplicada");
      invalidate();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    if (mode === "create") {
      if (!form.user_id || !form.task_id || !form.started_at) {
        toast.error("Funcionário, tarefa e início são obrigatórios");
        return;
      }
      createMut.mutate();
    } else {
      updateMut.mutate();
    }
  };

  const pending = createMut.isPending || updateMut.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{mode === "create" ? "Adicionar ponto" : "Corrigir ponto"}</SheetTitle>
          <SheetDescription>
            {mode === "create" ? "Registro manual. Toda criação é auditada." : "Toda alteração é gravada no histórico."}
          </SheetDescription>
        </SheetHeader>

        {mode === "edit" && entry && (
          <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1">
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

        <div className="mt-5 space-y-4">
          {mode === "create" && (
            <>
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
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <Label>Pausa</Label>
              <Input
                type="datetime-local"
                value={form.paused_at}
                onChange={(e) => setForm({ ...form, paused_at: e.target.value })}
              />
            </div>
            <div>
              <Label>Retorno</Label>
              <Input
                type="datetime-local"
                value={form.resumed_at}
                onChange={(e) => setForm({ ...form, resumed_at: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label>Notas</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          {eff !== null && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              Tempo efetivo previsto: <span className="font-mono font-semibold">{formatDuration(eff)}</span>
            </div>
          )}

          {mode === "edit" && diffPreview.length > 0 && (
            <div className="rounded-lg border border-info/40 bg-info/5 p-3 text-xs space-y-1">
              <div className="font-medium text-info">Alterações a aplicar:</div>
              {diffPreview.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}

          <div>
            <Label>
              Motivo{" "}
              <span className="text-xs text-muted-foreground">
                (opcional — quando informado, fica registrado no histórico)
              </span>
            </Label>
            <Textarea
              rows={2}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Ex.: Funcionário esqueceu de bater saída; correção conferida com supervisor."
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={submit} disabled={pending} className="flex-1">
              {pending ? "Salvando..." : mode === "create" ? "Criar registro" : "Aplicar correção"}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
