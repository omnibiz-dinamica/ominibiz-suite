import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Loader2, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/realtime/subscribe";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tab = "gestao" | "execucao";
type EventRow = {
  id: string;
  actor_name: string | null;
  summary: string;
  source: string;
  created_at: string;
};

const PAGE = 30;

/** created_at é um instante real (timestamptz): mostra-se na hora local do aparelho, no formato HH:mm da tela de Tarefas. */
function formatEventTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  return sameDay ? time : `${d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" })} ${time}`;
}

function minutesSince(iso: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

export function ActivityTimeline({ companyId }: { companyId: string }) {
  const [tab, setTab] = useState<Tab>("gestao");
  const [now, setNow] = useState(() => Date.now());
  const qc = useQueryClient();

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      void qc.invalidateQueries({ queryKey: ["activity-in-progress", companyId] });
    }, 60_000);
    return () => clearInterval(id);
  }, [qc, companyId]);

  const events = useInfiniteQuery({
    queryKey: ["activity-events", companyId, tab],
    initialPageParam: null as null | { created_at: string; id: string },
    queryFn: async ({ pageParam }) => {
      let q = (supabase as any)
        .from("activity_events")
        .select("id, actor_name, summary, source, created_at")
        .eq("company_id", companyId)
        .eq("tab", tab)
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
      return (data ?? []) as EventRow[];
    },
    getNextPageParam: (last) =>
      last.length < PAGE ? undefined : { created_at: last[last.length - 1].created_at, id: last[last.length - 1].id },
  });

  const inProgress = useQuery({
    queryKey: ["activity-in-progress", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("work_item_in_progress", { _company_id: companyId });
      if (error) throw error;
      return data ?? [];
    },
  });

  useRealtimeInvalidate({
    channel: `company:${companyId}:activity-events`,
    table: "activity_events",
    event: "INSERT",
    filter: `company_id=eq.${companyId}`,
    queryClient: qc,
    invalidate: (client) => {
      void client.invalidateQueries({ queryKey: ["activity-events", companyId] });
      void client.invalidateQueries({ queryKey: ["activity-in-progress", companyId] });
    },
  });
  useRealtimeInvalidate({
    channel: `company:${companyId}:activity-reservations`,
    table: "vacation_manager_queue",
    filter: `company_id=eq.${companyId}`,
    queryClient: qc,
    invalidate: (client) => void client.invalidateQueries({ queryKey: ["activity-in-progress", companyId] }),
  });

  const rows = events.data?.pages.flat() ?? [];
  const busy = inProgress.data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Activity className="h-4 w-4 text-primary" /> Atividade recente
        </h2>
        <div className="inline-flex rounded-lg border border-border p-0.5" role="tablist">
          {(["gestao", "execucao"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition",
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "gestao" ? "Gestão" : "Execução"}
            </button>
          ))}
        </div>
      </div>

      {busy.length > 0 && (
        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-primary">Em atendimento agora</div>
          <ul className="space-y-1">
            {busy.map((b) => (
              <li key={`${b.entity_type}:${b.entity_id}`} className="flex items-center gap-2 text-sm">
                <UserCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="min-w-0 truncate">
                  <span className="font-medium">{b.holder_name}</span> · {b.label}
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  há {minutesSince(b.claimed_at, now)} min
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="mt-4 divide-y divide-border">
        {events.isLoading && (
          <li className="py-8 text-center text-sm text-muted-foreground">Carregando atividade...</li>
        )}
        {events.isError && (
          <li className="py-8 text-center text-sm text-destructive">
            Não foi possível carregar a atividade.{" "}
            <button className="underline" onClick={() => void events.refetch()}>
              Tentar novamente
            </button>
          </li>
        )}
        {!events.isLoading && !events.isError && rows.length === 0 && (
          <li className="py-8 text-center text-sm text-muted-foreground">Ainda não há atividade registada.</li>
        )}
        {rows.map((e) => (
          <li key={e.id} className="flex gap-3 py-3">
            <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">{formatEventTime(e.created_at)}</span>
            <span className="min-w-0 text-sm">
              {e.actor_name && e.source === "user" && <span className="font-medium">{e.actor_name} · </span>}
              {e.source !== "user" && <span className="font-medium text-muted-foreground">Sistema · </span>}
              {e.summary}
            </span>
          </li>
        ))}
      </ul>

      {events.hasNextPage && (
        <div className="mt-3 text-center">
          <Button variant="ghost" size="sm" onClick={() => void events.fetchNextPage()} disabled={events.isFetchingNextPage}>
            {events.isFetchingNextPage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Carregar mais
          </Button>
        </div>
      )}
    </div>
  );
}
