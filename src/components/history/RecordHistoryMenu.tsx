import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, ModalBody, ModalHeader } from "@/components/ui/dialog";
import { detailLines, ROLE_LABEL } from "@/components/dashboards/ActivityTimeline";

/**
 * SUP-2026-000312 — "quem e quando" em qualquer registo.
 *
 * Botão direito do rato (ou toque longo no telemóvel) sobre o registo →
 * "Ver histórico (quem e quando)". Mostra a timeline (activity_events) só
 * daquele registo: data/hora, quem fez e "antes → depois".
 * Só gestores/owners/Super Admin (a timeline é deles por RLS); para os
 * restantes o componente não muda nada.
 */
export type HistoryEntityType =
  "task" | "recurrence" | "vacation" | "employee" | "client" | "punch" | "expense";

export type HistoryRef = { type: HistoryEntityType; id: string | null | undefined };

type HistoryEvent = {
  id: string;
  entity_type: string;
  actor_name: string | null;
  actor_role: string | null;
  summary: string;
  source: string;
  created_at: string;
  changes: Record<string, unknown> | null;
};

const LOCALE = "pt-PT";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filtro PostgREST "(tipo e id) ou (tipo e id)…" só com ids válidos. */
export function historyRefsFilter(refs: HistoryRef[]): string | null {
  const valid = refs.filter(
    (r): r is { type: HistoryEntityType; id: string } => !!r.id && UUID.test(r.id),
  );
  if (valid.length === 0) return null;
  return valid.map((r) => `and(entity_type.eq.${r.type},entity_id.eq.${r.id})`).join(",");
}

export function RecordHistoryMenu({
  entityType,
  entityId,
  related = [],
  title,
  children,
}: {
  entityType: HistoryEntityType;
  entityId: string | null | undefined;
  /** Outros registos cujo histórico também interessa (ex.: a série de uma tarefa). */
  related?: HistoryRef[];
  /** Nome do registo no título da janela (ex.: nome do cliente). */
  title?: string | null;
  children: ReactNode;
}) {
  const { isManager, currentCompanyId } = useAuth();
  const [open, setOpen] = useState(false);
  if (!isManager || !currentCompanyId || !entityId) return <>{children}</>;
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-60">
          <ContextMenuItem onSelect={() => setOpen(true)}>
            <History className="mr-2 h-4 w-4" />
            Ver histórico (quem e quando)
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {open && (
        <RecordHistoryDialog
          open={open}
          onOpenChange={setOpen}
          companyId={currentCompanyId}
          refs={[{ type: entityType, id: entityId }, ...related]}
          title={title}
        />
      )}
    </>
  );
}

export function RecordHistoryDialog({
  open,
  onOpenChange,
  companyId,
  refs,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  refs: HistoryRef[];
  title?: string | null;
}) {
  const filter = historyRefsFilter(refs);
  const history = useQuery({
    queryKey: ["record-history", companyId, filter],
    enabled: open && !!filter,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("activity_events")
        .select("id, entity_type, actor_name, actor_role, summary, source, created_at, changes")
        .eq("company_id", companyId)
        .or(filter)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as HistoryEvent[];
    },
  });
  const rows = history.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <ModalHeader
          icon={History}
          title="Histórico (quem e quando)"
          description={title ? title : "Alterações registadas neste registo"}
        />
        <ModalBody className="space-y-3">
          {history.isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Carregando histórico…
            </p>
          )}
          {history.isError && (
            <p className="py-8 text-center text-sm text-destructive">
              Não foi possível carregar o histórico.{" "}
              <button type="button" className="underline" onClick={() => void history.refetch()}>
                Tentar novamente
              </button>
            </p>
          )}
          {!history.isLoading && !history.isError && rows.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              Ainda não há alterações registadas neste registo. O registo começou quando o histórico
              foi ativado.
            </p>
          )}
          {rows.length > 0 && (
            <ol className="space-y-3" aria-label="Histórico do registo">
              {rows.map((event) => {
                const lines = detailLines(event.changes, LOCALE);
                return (
                  <li key={event.id} className="rounded-xl border border-border bg-card p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <time
                        dateTime={event.created_at}
                        className="text-sm font-medium tabular-nums"
                      >
                        {new Date(event.created_at).toLocaleString(LOCALE, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </time>
                      <span className="text-xs text-muted-foreground">
                        {event.source === "user" && event.actor_name
                          ? `${event.actor_name}${event.actor_role ? ` (${ROLE_LABEL[event.actor_role] ?? event.actor_role})` : ""}`
                          : "Sistema"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{event.summary}</p>
                    {lines.length > 0 && (
                      <dl className="mt-2 space-y-1 rounded-lg bg-muted/40 p-2 text-xs">
                        {lines.map((line) => (
                          <div key={line.key} className="flex flex-wrap gap-x-1.5">
                            <dt className="font-medium">{line.key}:</dt>
                            {"value" in line ? (
                              <dd className="whitespace-pre-line break-words">{line.value}</dd>
                            ) : (
                              <dd className="break-words">
                                <span className="text-muted-foreground line-through">
                                  {line.before}
                                </span>{" "}
                                → <span className="font-medium">{line.after}</span>
                              </dd>
                            )}
                          </div>
                        ))}
                      </dl>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </ModalBody>
      </DialogContent>
    </Dialog>
  );
}
