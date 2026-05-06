import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Play, Check, X } from "lucide-react";

export const Route = createFileRoute("/app/tarefas")({
  component: TasksPage,
});

type TaskStatus = "pendente" | "em_andamento" | "concluido" | "cancelado" | "ausente" | "autorizado";
const STATUS_LABELS: Record<TaskStatus, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
  ausente: "Ausente",
  autorizado: "Autorizado",
};
const STATUS_TONE: Record<TaskStatus, string> = {
  pendente: "bg-info/15 text-info",
  em_andamento: "bg-primary/15 text-primary",
  concluido: "bg-success/15 text-success",
  cancelado: "bg-muted text-muted-foreground",
  ausente: "bg-destructive/15 text-destructive",
  autorizado: "bg-warning/15 text-warning-foreground",
};

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
        .order("created_at", { ascending: false });
      if (!isManager) q = q.eq("assigned_to", user!.id);
      else if (currentCompanyId) q = q.eq("company_id", currentCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
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

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const patch: Record<string, unknown> = { status };
      if (status === "em_andamento") patch.started_at = new Date().toISOString();
      if (status === "concluido") patch.completed_at = new Date().toISOString();
      const { error } = await supabase.from("tasks").update(patch).eq("id", id);
      if (error) throw error;
    },
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
            const isAssignee = t.assigned_to === user?.id;
            return (
              <li key={t.id} className="grid grid-cols-12 items-center px-5 py-4">
                <div className="col-span-5">
                  <div className="font-medium">{t.title}</div>
                  {t.description && <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{t.description}</div>}
                </div>
                <div className="col-span-2">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[t.status as TaskStatus]}`}>
                    {STATUS_LABELS[t.status as TaskStatus]}
                  </span>
                </div>
                <div className="col-span-2 text-sm capitalize text-muted-foreground">{t.priority}</div>
                <div className="col-span-3 flex justify-end gap-2">
                  {isAssignee && t.status === "pendente" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: t.id, status: "em_andamento" })}>
                      <Play className="mr-1 h-3 w-3" /> Iniciar
                    </Button>
                  )}
                  {isAssignee && t.status === "em_andamento" && (
                    <Button size="sm" onClick={() => updateStatus.mutate({ id: t.id, status: "concluido" })}>
                      <Check className="mr-1 h-3 w-3" /> Concluir
                    </Button>
                  )}
                  {isManager && t.status !== "cancelado" && t.status !== "concluido" && (
                    <Button size="sm" variant="ghost" onClick={() => updateStatus.mutate({ id: t.id, status: "cancelado" })}>
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
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
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Criando..." : "Criar tarefa"}
      </Button>
    </form>
  );
}