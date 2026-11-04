/**
 * Anotações manuais do gestor sobre o funcionário (separadas do histórico
 * automático). Só a gestão vê (RLS em employee_notes). Quem escreveu pode
 * editar/apagar; o Owner também.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, StickyNote, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type EmployeeNote = {
  id: string;
  body: string;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export const NOTE_MAX = 5000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const notesTable = () => (supabase as any).from("employee_notes");

export function EmployeeNotesPanel({ userId, companyId }: { userId: string; companyId: string }) {
  const qc = useQueryClient();
  const { user, isOwner, isSuperAdmin } = useAuth();
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const key = ["employee-notes", companyId, userId];

  const notes = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await notesTable()
        .select("id, body, created_by, created_by_name, created_at, updated_at")
        .eq("company_id", companyId)
        .eq("profile_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as EmployeeNote[];
    },
  });

  const add = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await notesTable().insert({
        company_id: companyId,
        profile_id: userId,
        body,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setText("");
      toast.success("Anotação salva");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const edit = useMutation({
    mutationFn: async (v: { id: string; body: string }) => {
      const { error } = await notesTable().update({ body: v.body }).eq("id", v.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setEditing(null);
      toast.success("Anotação atualizada");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await notesTable().delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Anotação apagada");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canChange = (n: EmployeeNote) => n.created_by === user?.id || !!isOwner || !!isSuperAdmin;
  const trimmed = text.trim();

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
        <Label htmlFor="employee-note-new" className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-primary" /> Nova anotação
        </Label>
        <Textarea
          id="employee-note-new"
          rows={3}
          maxLength={NOTE_MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreva o que quiser sobre este funcionário. Só a gestão vê."
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {text.length}/{NOTE_MAX}
          </span>
          <Button
            size="sm"
            disabled={!trimmed || add.isPending}
            onClick={() => add.mutate(trimmed)}
          >
            {add.isPending ? "A salvar…" : "Salvar anotação"}
          </Button>
        </div>
      </div>

      {notes.isLoading && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />A carregar anotações…
        </p>
      )}
      {notes.isError && (
        <p className="py-6 text-center text-sm text-destructive">
          Não foi possível carregar as anotações.{" "}
          <button type="button" className="underline" onClick={() => void notes.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      {!notes.isLoading && !notes.isError && (notes.data ?? []).length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Ainda não há anotações.
        </p>
      )}

      <ol className="space-y-3" aria-label="Anotações">
        {(notes.data ?? []).map((n) => (
          <li key={n.id} className="rounded-xl border border-border bg-card p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <time dateTime={n.created_at} className="text-sm font-medium tabular-nums">
                {new Date(n.created_at).toLocaleString("pt-PT", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </time>
              <span className="text-xs text-muted-foreground">
                {n.created_by_name ?? "Gestão"}
                {n.updated_at !== n.created_at &&
                new Date(n.updated_at).getTime() - new Date(n.created_at).getTime() > 1000
                  ? " · editada"
                  : ""}
              </span>
            </div>
            {editing?.id === n.id ? (
              <div className="mt-2 space-y-2">
                <Textarea
                  rows={3}
                  maxLength={NOTE_MAX}
                  value={editing.body}
                  onChange={(e) => setEditing({ id: n.id, body: e.target.value })}
                  aria-label="Editar anotação"
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    disabled={!editing.body.trim() || edit.isPending}
                    onClick={() => edit.mutate({ id: n.id, body: editing.body.trim() })}
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-1 whitespace-pre-line break-words text-sm">{n.body}</p>
            )}
            {canChange(n) && editing?.id !== n.id && (
              <div className="mt-2 flex justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing({ id: n.id, body: n.body })}
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (confirm("Apagar esta anotação?")) remove.mutate(n.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Apagar
                </Button>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
