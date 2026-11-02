import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ListPlus, Pencil, Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createCustomField,
  listCustomFields,
  listTags,
  renameCustomField,
  saveTag,
  setCustomFieldArchived,
  setTagArchived,
} from "@/lib/messages/api";
import {
  FIELD_SCOPE_LABEL,
  FIELD_TYPE_LABEL,
  type MsgCustomField,
  type MsgFieldScope,
  type MsgFieldType,
  type MsgTag,
} from "@/lib/messages/types";
import { EmptyState, ErrorBox, LoadingBox } from "./shared";

type Editing =
  { kind: "tag"; item: MsgTag | null } | { kind: "field"; item: MsgCustomField | null } | null;

export function TagsFieldsTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const tagsQ = useQuery({ queryKey: ["msg-tags", companyId], queryFn: () => listTags(companyId) });
  const fieldsQ = useQuery({
    queryKey: ["msg-fields", companyId],
    queryFn: () => listCustomFields(companyId),
  });
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);

  const archive = useMutation({
    mutationFn: async (v: { kind: "tag" | "field"; id: string; archived: boolean }) =>
      v.kind === "tag"
        ? setTagArchived(companyId, v.id, v.archived)
        : setCustomFieldArchived(companyId, v.id, v.archived),
    onSuccess: (_d, v) => {
      toast.success(v.archived ? "Arquivado." : "Reativado.");
      void qc.invalidateQueries({
        queryKey: [v.kind === "tag" ? "msg-tags" : "msg-fields", companyId],
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tags = (tagsQ.data ?? []).filter((t) => showArchived || !t.archived_at);
  const fields = (fieldsQ.data ?? []).filter((f) => showArchived || !f.archived_at);

  const row = (
    id: string,
    kind: "tag" | "field",
    title: string,
    sub: string,
    archived: boolean,
    onEdit: () => void,
  ) => (
    <li key={id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {archived ? <Badge variant="secondary">Arquivado</Badge> : null}
        <Button size="icon" variant="ghost" aria-label="Editar" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={archived ? "Reativar" : "Arquivar"}
          disabled={archive.isPending}
          onClick={() => archive.mutate({ kind, id, archived: !archived })}
        >
          {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
        </Button>
      </div>
    </li>
  );

  return (
    <div className="space-y-6">
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Switch checked={showArchived} onCheckedChange={setShowArchived} /> Mostrar arquivados
      </label>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Tags</h2>
          <Button size="sm" onClick={() => setEditing({ kind: "tag", item: null })}>
            <Plus className="mr-1 h-4 w-4" /> Nova tag
          </Button>
        </div>
        {tagsQ.isLoading ? (
          <LoadingBox />
        ) : tagsQ.error ? (
          <ErrorBox message={(tagsQ.error as Error).message} onRetry={() => void tagsQ.refetch()} />
        ) : tags.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="Nenhuma tag"
            description="As tags ajudam a separar contatos (ex.: Cliente, VIP, Orçamento)."
            action={
              <Button size="sm" onClick={() => setEditing({ kind: "tag", item: null })}>
                <Plus className="mr-1 h-4 w-4" /> Nova tag
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {tags.map((t) =>
              row(
                t.id,
                "tag",
                t.name,
                t.folder ? `Pasta: ${t.folder}` : "Sem pasta",
                !!t.archived_at,
                () => setEditing({ kind: "tag", item: t }),
              ),
            )}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Campos personalizados</h2>
          <Button size="sm" onClick={() => setEditing({ kind: "field", item: null })}>
            <Plus className="mr-1 h-4 w-4" /> Novo campo
          </Button>
        </div>
        {fieldsQ.isLoading ? (
          <LoadingBox />
        ) : fieldsQ.error ? (
          <ErrorBox
            message={(fieldsQ.error as Error).message}
            onRetry={() => void fieldsQ.refetch()}
          />
        ) : fields.length === 0 ? (
          <EmptyState
            icon={ListPlus}
            title="Nenhum campo personalizado"
            description="Guarde informações extra dos contatos ou da conta (ex.: Cidade, Data de aniversário)."
            action={
              <Button size="sm" onClick={() => setEditing({ kind: "field", item: null })}>
                <Plus className="mr-1 h-4 w-4" /> Novo campo
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {fields.map((f) =>
              row(
                f.id,
                "field",
                f.name,
                `${FIELD_SCOPE_LABEL[f.scope]} · ${FIELD_TYPE_LABEL[f.type]}`,
                !!f.archived_at,
                () => setEditing({ kind: "field", item: f }),
              ),
            )}
          </ul>
        )}
      </section>

      {editing ? (
        <EditDialog
          key={`${editing.kind}-${editing.item?.id ?? "new"}`}
          companyId={companyId}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() =>
            void qc.invalidateQueries({
              queryKey: [editing.kind === "tag" ? "msg-tags" : "msg-fields", companyId],
            })
          }
        />
      ) : null}
    </div>
  );
}

function EditDialog({
  companyId,
  editing,
  onClose,
  onSaved,
}: {
  companyId: string;
  editing: NonNullable<Editing>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isTag = editing.kind === "tag";
  const [name, setName] = useState(editing.item?.name ?? "");
  const [folder, setFolder] = useState(
    isTag ? ((editing.item as MsgTag | null)?.folder ?? "") : "",
  );
  const [scope, setScope] = useState<MsgFieldScope>("contato");
  const [type, setType] = useState<MsgFieldType>("texto");

  const save = useMutation({
    mutationFn: async () => {
      if (isTag) await saveTag(companyId, editing.item?.id ?? null, name, folder || null);
      else if (editing.item) await renameCustomField(companyId, editing.item.id, name);
      else await createCustomField(companyId, name, scope, type);
    },
    onSuccess: () => {
      toast.success("Guardado.");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const title = `${editing.item ? "Editar" : "Novo"} ${isTag ? "tag" : "campo"}`;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="msg-tf-name">Nome</Label>
            <Input
              id="msg-tf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
            />
          </div>
          {isTag ? (
            <div className="space-y-1">
              <Label htmlFor="msg-tf-folder">Pasta (opcional)</Label>
              <Input
                id="msg-tf-folder"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                maxLength={60}
              />
            </div>
          ) : editing.item ? (
            <p className="text-xs text-muted-foreground">
              O âmbito e o tipo não mudam depois de criado, para não estragar valores já guardados.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Âmbito</Label>
                <Select value={scope} onValueChange={(v) => setScope(v as MsgFieldScope)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FIELD_SCOPE_LABEL) as MsgFieldScope[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {FIELD_SCOPE_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={type} onValueChange={(v) => setType(v as MsgFieldType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FIELD_TYPE_LABEL) as MsgFieldType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {FIELD_TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
