import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { History, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { detailLines, ROLE_LABEL } from "@/components/dashboards/ActivityTimeline";
import {
  filterHistoryByField,
  historyFieldOptions,
  type EmployeeHistoryEvent,
} from "@/lib/employee-history";

const PAGE = 50;
const LOCALE = "pt-PT";
const ALL = "__all__";

/**
 * Aba "Histórico" da ficha do funcionário: tudo o que mudou nos dados dele,
 * com data/hora, quem alterou e "antes → depois". Só leitura (auditoria).
 */
export function EmployeeHistoryTab({ userId, companyId }: { userId: string; companyId: string }) {
  const [field, setField] = useState<string>(ALL);

  const history = useInfiniteQuery({
    queryKey: ["employee-history", companyId, userId],
    initialPageParam: null as null | { created_at: string; id: string },
    queryFn: async ({ pageParam }) => {
      // activity_events: os tipos gerados podem ainda não ter entity_type 'employee'.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("activity_events")
        .select("id, action, actor_name, actor_role, summary, source, created_at, changes")
        .eq("company_id", companyId)
        .eq("entity_type", "employee")
        .eq("entity_id", userId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE);
      if (pageParam) {
        q = q.or(
          `created_at.lt.${pageParam.created_at},and(created_at.eq.${pageParam.created_at},id.lt.${pageParam.id})`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as EmployeeHistoryEvent[];
    },
    getNextPageParam: (last) =>
      last.length === PAGE
        ? { created_at: last[last.length - 1].created_at, id: last[last.length - 1].id }
        : null,
  });

  const rows = history.data?.pages.flat() ?? [];
  const fields = historyFieldOptions(rows);
  const selected = field === ALL ? null : field;
  const visible = filterHistoryByField(rows, selected);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm">
        <History className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-muted-foreground">
          Registo de auditoria: cada alteração na ficha fica guardada com a data, quem alterou e o
          valor antes e depois. IBAN e números de documentos aparecem só com os últimos 4 dígitos. O
          registo começa na data em que esta função foi ativada.
        </p>
      </div>

      <div className="space-y-1.5 sm:max-w-xs">
        <Label htmlFor="employee-history-field">Filtrar por campo</Label>
        <Select value={field} onValueChange={setField}>
          <SelectTrigger id="employee-history-field">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os campos</SelectItem>
            {fields.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
      {!history.isLoading && !history.isError && visible.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          {selected
            ? `Sem alterações registadas em "${selected}".`
            : "Ainda não há alterações registadas."}
        </p>
      )}

      {visible.length > 0 && (
        <ol className="space-y-3" aria-label="Histórico de alterações">
          {visible.map((event) => {
            const lines = detailLines(event.changes, LOCALE).filter(
              (line) => line.key !== "Funcionário" && (!selected || line.key === selected),
            );
            return (
              <li key={event.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <time dateTime={event.created_at} className="text-sm font-medium tabular-nums">
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
                          <dd className="break-words">{line.value}</dd>
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

      {history.hasNextPage && (
        <div className="text-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void history.fetchNextPage()}
            disabled={history.isFetchingNextPage}
          >
            {history.isFetchingNextPage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Carregar mais
          </Button>
        </div>
      )}
    </div>
  );
}
