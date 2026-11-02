import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listContactTags, listContacts, listTags } from "@/lib/messages/api";
import type { MsgContact } from "@/lib/messages/types";
import { ContactDialog } from "./ContactDialog";
import { ImportContactsDialog } from "./ImportContactsDialog";
import { EmptyState, ErrorBox, LoadingBox } from "./shared";
import { normalizeSearch } from "@/lib/messages/format";

/**
 * Contatos: owner/manager criam, editam, aplicam tags e importam CSV.
 * Secretary só vê (canManage = false) — a RLS também bloqueia a escrita.
 */
export function ContactsTab({ companyId, canManage }: { companyId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const contactsQ = useQuery({
    queryKey: ["msg-contacts", companyId],
    queryFn: () => listContacts(companyId),
  });
  const tagsQ = useQuery({ queryKey: ["msg-tags", companyId], queryFn: () => listTags(companyId) });
  const linksQ = useQuery({
    queryKey: ["msg-contact-tags", companyId],
    queryFn: () => listContactTags(companyId),
  });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<MsgContact | "new" | null>(null);
  const [importing, setImporting] = useState(false);

  const contacts = useMemo(() => contactsQ.data ?? [], [contactsQ.data]);
  const tagName = useMemo(
    () => new Map((tagsQ.data ?? []).map((t) => [t.id, t.name])),
    [tagsQ.data],
  );
  const tagsByContact = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of linksQ.data ?? [])
      m.set(l.contact_id, [...(m.get(l.contact_id) ?? []), l.tag_id]);
    return m;
  }, [linksQ.data]);

  const visible = useMemo(() => {
    const q = normalizeSearch(search);
    const digits = search.replace(/\D/g, "");
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        normalizeSearch(c.name).includes(q) ||
        (!!digits && (c.phone ?? "").replace(/\D/g, "").includes(digits)),
    );
  }, [contacts, search]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["msg-contacts", companyId] });
    void qc.invalidateQueries({ queryKey: ["msg-contact-tags", companyId] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome ou telefone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {canManage ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload className="mr-1 h-4 w-4" /> Importar CSV
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus className="mr-1 h-4 w-4" /> Novo contato
            </Button>
          </div>
        ) : null}
      </div>

      {contactsQ.isLoading ? (
        <LoadingBox />
      ) : contactsQ.error ? (
        <ErrorBox
          message={(contactsQ.error as Error).message}
          onRetry={() => void contactsQ.refetch()}
        />
      ) : contacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum contato ainda"
          description={
            canManage
              ? "Crie um contato ou importe uma lista em CSV (nome, telefone, e-mail)."
              : "Ainda não há contatos nesta empresa."
          }
          action={
            canManage ? (
              <Button size="sm" onClick={() => setEditing("new")}>
                <Plus className="mr-1 h-4 w-4" /> Novo contato
              </Button>
            ) : undefined
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nenhum contato encontrado"
          description={`Nada corresponde a “${search}”.`}
          action={
            <Button variant="outline" size="sm" onClick={() => setSearch("")}>
              Limpar pesquisa
            </Button>
          }
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {visible.length} de {contacts.length} contato(s)
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((c) => {
              const tags = (tagsByContact.get(c.id) ?? [])
                .map((id) => tagName.get(id))
                .filter(Boolean) as string[];
              return (
                <li
                  key={c.id}
                  className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {c.phone ?? "Sem telefone"}
                      </p>
                      {c.email ? (
                        <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                      ) : null}
                    </div>
                    {canManage ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Editar contato"
                        onClick={() => setEditing(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {c.status === "inativo" ? <Badge variant="secondary">Inativo</Badge> : null}
                    {!c.opted_in ? <Badge variant="secondary">Sem consentimento</Badge> : null}
                    {tags.map((t) => (
                      <Badge key={t} variant="outline">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {editing ? (
        <ContactDialog
          key={editing === "new" ? "new" : editing.id}
          companyId={companyId}
          contact={editing === "new" ? null : editing}
          tags={(tagsQ.data ?? []).filter(
            (t) =>
              !t.archived_at ||
              (editing !== "new" && (tagsByContact.get(editing.id) ?? []).includes(t.id)),
          )}
          currentTagIds={editing === "new" ? [] : (tagsByContact.get(editing.id) ?? [])}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}
      {importing ? (
        <ImportContactsDialog
          companyId={companyId}
          existingPhones={contacts.map((c) => c.phone).filter((p): p is string => !!p)}
          onClose={() => setImporting(false)}
          onImported={refresh}
        />
      ) : null}
    </div>
  );
}
