import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Play, Check, X, ShieldCheck, UserX, Clock } from "lucide-react";
import {
  STATUS_LABELS,
  STATUS_TONE,
  type TaskAction,
  type TaskRow,
  ACTION_LABELS,
  availableActions,
  isVisuallyLate,
  sweepAbsent,
  transitionTask,
} from "@/lib/tasks";

export const Route = createFileRoute("/app/tarefas")({
  component: TasksPage,
});

function TasksPage() {
  const { user, isManager, currentCompanyId } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks", currentCompanyId, user?.id, isManager],
    queryFn: async () => {
      let q = supabase
        .from("tasks")
        .select("*")
        .order("scheduled_for", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (!isManager) q = q.eq("assigned_to", user!.id);
      else if (currentCompanyId) q = q.eq("company_id", currentCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as TaskRow[];
    },
    enabled: !!user,
  });

  const { data: members } = useQuery({
    queryKey: ["members", currentCompanyId],
    queryFn: async () => {
      if (!currentCompanyId) return [];
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("company_id", currentCompanyId);
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return profs ?? [];
    },
    enabled: isManager && !!currentCompanyId,
  });

  // Varredura de ausentes por evento: ao carregar a tela. Nunca em loop.
  useEffect(() => {
    if (!user || !isManager) return;
    void sweepAbsent(currentCompanyId).then((n) => {
      if (n > 0) qc.invalidateQueries({ queryKey: ["tasks"] });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isManager, currentCompanyId]);

  // Realtime: APENAS sincroniza a UI. Nenhuma lógica de negócio aqui.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("tasks-ui-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => qc.invalidateQueries({ queryKey: ["tasks"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user?.id, qc]);

  const transition = useMutation({
    mutationFn: ({ id, action }: { id: string; action: TaskAction }) => transitionTask(id, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Tarefa atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Tarefas</h1>
          <p className="mt-1 text-muted-foreground">
            {isManager ? "Crie, atribua e acompanhe a operação." : "Suas tarefas atribuídas."}
          </p>
        </div>
        {isManager && currentCompanyId && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Nova tarefa</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova tarefa</DialogTitle></DialogHeader>
              <NewTaskForm members={members ?? []} companyId={currentCompanyId} userId={user!.id} onCreated={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["tasks"] }); }} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!currentCompanyId && isManager && (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning-foreground">
          Sua empresa ainda está aguardando aprovação. Você poderá criar tarefas assim que for liberada.
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card">
        <div className="grid grid-cols-12 border-b border-border px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <div className="col-span-5">Tarefa</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Prioridade</div>
          <div className="col-span-3 text-right">Ações</div>
        </div>
        {isLoading && <div className="px-5 py-8 text-center text-sm text-muted-foreground">Carregando...</div>}
        {!isLoading && (tasks ?? []).length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">Nenhuma tarefa ainda.</div>
        )}
        <ul className="divide-y divide-border">
          {(tasks ?? []).map((t) => {
            const late = isVisuallyLate(t);
            const actions = availableActions(t, { userId: user!.id, isManager });
            return (
              <li key={t.id} className="grid grid-cols-12 items-center px-5 py-4">
                <div className="col-span-5">
                  <div className="flex items-center gap-2 font-medium">
                    <span>{t.title}</span>
                    {late && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
                        <Clock className="h-3 w-3" /> atrasado
                      </span>
                    )}
                  </div>
                  {t.description && <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{t.description}</div>}
                </div>
                <div className="col-span-2">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[t.status]}`}>
                    {STATUS_LABELS[t.status]}
                  </span>
                </div>
                <div className="col-span-2 text-sm capitalize text-muted-foreground">{t.priority}</div>
                <div className="col-span-3 flex justify-end gap-2">
                  {actions.map((a) => (
                    <ActionButton
                      key={a}
                      action={a}
                      disabled={transition.isPending}
                      onClick={() => transition.mutate({ id: t.id, action: a })}
                    />
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ActionButton({
  action,
  onClick,
  disabled,
}: {
  action: TaskAction;
  onClick: () => void;
  disabled?: boolean;
}) {
  const map = {
    autorizar: { Icon: ShieldCheck, variant: "outline" as const },
    iniciar: { Icon: Play, variant: "outline" as const },
    concluir: { Icon: Check, variant: "default" as const },
    marcar_ausente: { Icon: UserX, variant: "ghost" as const },
    cancelar: { Icon: X, variant: "ghost" as const },
  }[action];
  const { Icon, variant } = map;
  return (
    <Button size="sm" variant={variant} onClick={onClick} disabled={disabled} title={ACTION_LABELS[action]}>
      <Icon className="h-3 w-3" />
      <span className="ml-1 hidden sm:inline">{ACTION_LABELS[action]}</span>
    </Button>
  );
}

function NewTaskForm({
  members,
  companyId,
  userId,
  onCreated,
}: {
  members: { id: string; full_name: string | null }[];
  companyId: string;
  userId: string;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [priority, setPriority] = useState<"baixa" | "media" | "alta" | "urgente">("media");
  const [scheduledFor, setScheduledFor] = useState<string>("");
  const [graceMinutes, setGraceMinutes] = useState<number>(15);
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.from("tasks").insert({
          company_id: companyId,
          title: title.trim(),
          description: description.trim() || null,
          assigned_to: assignedTo || null,
          priority,
          created_by: userId,
          scheduled_for: scheduledFor ? new Date(scheduledFor).toISOString() : null,
          absence_grace_minutes: graceMinutes,
        });
        setLoading(false);
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("Tarefa criada");
        onCreated();
      }}
    >
      <div className="space-y-1.5">
        <Label>Título</Label>
        <Input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Descrição</Label>
        <Textarea maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Atribuir a</Label>
          <Select value={assignedTo} onValueChange={setAssignedTo}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.id.slice(0, 8)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Prioridade</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="baixa">Baixa</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Agendado para</Label>
          <Input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
        </div>
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
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Criando..." : "Criar tarefa"}
      </Button>
    </form>
  );
}