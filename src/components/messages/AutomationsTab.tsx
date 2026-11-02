import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, FolderOpen, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAutomations, updateAutomation } from "@/lib/messages/api";
import { AutomationDialog } from "./AutomationDialog";
import {
  AUTOMATION_STATUS_LABEL,
  type MsgAutomation,
  type MsgAutomationStatus,
} from "@/lib/messages/types";
import { EmptyState, ErrorBox, LoadingBox } from "./shared";
import { formatDateTime, normalizeSearch } from "@/lib/messages/format";

type View = "ativas" | "lixeira";
const ALL = "__all__";

const STATUS_CLASS: Record<MsgAutomationStatus, string> = {
  rascunho: "bg-muted text-muted-foreground",
  ativa: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  parada: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

export function AutomationsTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const key = ["msg-automations", companyId];
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: key,
    queryFn: () => listAutomations(companyId),
  });
  const [view, setView] = useState<View>("ativas");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [folder, setFolder] = useState<string>(ALL);
  const [editing, setEditing] = useState<MsgAutomation | "new" | null>(null);

  const all = useMemo(() => data ?? [], [data]);
  const folders = useMemo(
    () => [...new Set(all.map((a) => a.folder).filter((f): f is string => !!f))].sort(),
    [all],
  );
  const trashCount = all.filter((a) => a.deleted_at).length;
  const visible = useMemo(() => {
    const q = normalizeSearch(search);
    return all.filter(
      (a) =>
        (view === "lixeira" ? !!a.deleted_at : !a.deleted_at) &&
        (status === ALL || a.status === status) &&
        (folder === ALL || a.folder === folder) &&
        (!q || normalizeSearch(a.name).includes(q)),
    );
  }, [all, view, status, folder, search]);

  const move = useMutation({
    mutationFn: (v: { id: string; trash: boolean }) =>
      updateAutomation(companyId, v.id, { deleted_at: v.trash ? new Date().toISOString() : null }),
    onSuccess: (_d, v) => {
      toast.success(v.trash ? "Automação enviada para a lixeira." : "Automação restaurada.");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasFilters = !!search.trim() || status !== ALL || folder !== ALL;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar automação"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="md:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {(Object.keys(AUTOMATION_STATUS_LABEL) as MsgAutomationStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {AUTOMATION_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={folder} onValueChange={setFolder}>
          <SelectTrigger className="md:w-44">
            <SelectValue placeholder="Pasta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as pastas</SelectItem>
            {folders.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button
            variant={view === "lixeira" ? "default" : "outline"}
            onClick={() => setView(view === "lixeira" ? "ativas" : "lixeira")}
          >
            <Trash2 className="mr-1 h-4 w-4" /> Lixeira{trashCount ? ` (${trashCount})` : ""}
          </Button>
          <Button onClick={() => setEditing("new")}>
            <Plus className="mr-1 h-4 w-4" /> Nova automação
          </Button>
        </div>
      </div>

      {isLoading ? (
        <LoadingBox />
      ) : error ? (
        <ErrorBox message={(error as Error).message} onRetry={() => void refetch()} />
      ) : visible.length === 0 ? (
        view === "lixeira" ? (
          <EmptyState
            icon={Trash2}
            title="Lixeira vazia"
            description="As automações apagadas aparecem aqui e podem ser restauradas."
          />
        ) : hasFilters ? (
          <EmptyState
            icon={Search}
            title="Nenhuma automação encontrada"
            description="Nada corresponde aos filtros escolhidos."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatus(ALL);
                  setFolder(ALL);
                }}
              >
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Bot}
            title="Nenhuma automação ainda"
            description="Crie a primeira automação. Ela fica em rascunho até o editor estar disponível."
            action={
              <Button size="sm" onClick={() => setEditing("new")}>
                <Plus className="mr-1 h-4 w-4" /> Nova automação
              </Button>
            }
          />
        )
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          <div className="hidden grid-cols-12 gap-2 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
            <div className="col-span-4">Nome</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1 text-right">Execuções</div>
            <div className="col-span-1 text-right">Cliques</div>
            <div className="col-span-2">Última edição</div>
            <div className="col-span-2" />
          </div>
          <ul className="divide-y divide-border">
            {visible.map((a) => (
              <li
                key={a.id}
                className="grid grid-cols-2 items-center gap-2 px-4 py-3 text-sm md:grid-cols-12"
              >
                <div className="col-span-2 min-w-0 md:col-span-4">
                  <p className="truncate font-medium">{a.name}</p>
                  {a.folder ? (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <FolderOpen className="h-3 w-3" />
                      {a.folder}
                    </p>
                  ) : null}
                </div>
                <div className="md:col-span-2">
                  <Badge
                    variant="outline"
                    className={`border-transparent ${STATUS_CLASS[a.status]}`}
                  >
                    {AUTOMATION_STATUS_LABEL[a.status]}
                  </Badge>
                </div>
                <div className="text-right text-muted-foreground md:col-span-1">
                  <span className="md:hidden">Execuções: </span>
                  {a.runs_count}
                </div>
                <div className="text-muted-foreground md:col-span-1 md:text-right">
                  <span className="md:hidden">Cliques: </span>
                  {a.clicks_count}
                </div>
                <div className="text-xs text-muted-foreground md:col-span-2">
                  {formatDateTime(a.updated_at)}
                </div>
                <div className="col-span-2 flex justify-end gap-1 md:col-span-2">
                  {view === "lixeira" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={move.isPending}
                      onClick={() => move.mutate({ id: a.id, trash: false })}
                    >
                      <RotateCcw className="mr-1 h-4 w-4" /> Restaurar
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Editar"
                        onClick={() => setEditing(a)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Enviar para a lixeira"
                        disabled={move.isPending}
                        onClick={() => move.mutate({ id: a.id, trash: true })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing ? (
        <AutomationDialog
          key={editing === "new" ? "new" : editing.id}
          companyId={companyId}
          target={editing}
          folders={folders}
          onClose={() => setEditing(null)}
          onSaved={() => void qc.invalidateQueries({ queryKey: key })}
        />
      ) : null}
    </div>
  );
}
