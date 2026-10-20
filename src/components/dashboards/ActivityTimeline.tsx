import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ChevronDown, Loader2, Search, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/realtime/subscribe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

type Tab = "gestao" | "execucao";
type EventRow = {
  id: string;
  actor_name: string | null;
  actor_role: string | null;
  summary: string;
  source: string;
  created_at: string;
  changes: Record<string, unknown> | null;
};

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  owner: "Proprietário",
  manager: "Gestor",
  accountant: "Contabilidade",
  secretary: "Secretaria",
  employee: "Funcionário",
};

/** Valor de um detalhe em texto legível (datas, listas, sim/não). */
function formatDetailValue(value: unknown, locale: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) {
    const items = value.map((v) => formatDetailValue(v, locale));
    return items.length > 20 ? `${items.slice(0, 20).join(", ")} e mais ${items.length - 20}` : items.join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) {
    const d = new Date(text);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, day] = text.split("-");
    return `${day}/${m}/${y}`;
  }
  return text;
}

/** Linhas de detalhe: "Campo: antes → depois" ou "Campo: valor". */
function detailLines(changes: Record<string, unknown> | null, locale: string) {
  if (!changes || typeof changes !== "object") return [];
  return Object.entries(changes).map(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value) && ("de" in value || "para" in value)) {
      const v = value as { de?: unknown; para?: unknown };
      return { key, before: formatDetailValue(v.de, locale), after: formatDetailValue(v.para, locale) };
    }
    return { key, value: formatDetailValue(value, locale) };
  });
}

const PAGE = 30;

/** Limpa o texto da pesquisa (remove caracteres que quebram o filtro); mínimo 2 letras. */
function sanitizeActivitySearch(value: string): string {
  const clean = value
    .replace(/[,()*%\\:"'.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length >= 2 ? clean.slice(0, 60) : "";
}

/** Pesquisa no resumo, no autor e no funcionário/cliente gravados no detalhe da ação. */
function activitySearchFilter(term: string): string {
  const p = `*${term}*`;
  return [
    `summary.ilike.${p}`,
    `actor_name.ilike.${p}`,
    `changes->>Funcionário.ilike.${p}`,
    `changes->>Funcionários.ilike.${p}`,
    `changes->>Cliente.ilike.${p}`,
  ].join(",");
}

/** created_at é um instante real (timestamptz): mostra-se na hora local do aparelho, no formato HH:mm da tela de Tarefas. */
function formatEventTime(iso: string, locale: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return sameDay ? time : `${d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })} ${time}`;
}

function minutesSince(iso: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

export function ActivityTimeline({ companyId }: { companyId: string }) {
  const [tab, setTab] = useState<Tab>("gestao");
  // Detalhe fica escondido; abre ao clicar na linha (uma de cada vez).
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  // Pesquisa por funcionário ou cliente (no servidor, em todo o histórico).
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setSearchTerm(sanitizeActivitySearch(searchInput)), 350);
    return () => window.clearTimeout(id);
  }, [searchInput]);
  const { t: tr, lang } = useT();
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
    queryKey: ["activity-events", companyId, tab, searchTerm],
    initialPageParam: null as null | { created_at: string; id: string },
    queryFn: async ({ pageParam }) => {
      let q = (supabase as any)
        .from("activity_events")
        .select("id, actor_name, actor_role, summary, source, created_at, changes")
        .eq("company_id", companyId)
        .eq("tab", tab)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE);
      const pageFilter = pageParam
        ? `created_at.lt.${pageParam.created_at},and(created_at.eq.${pageParam.created_at},id.lt.${pageParam.id})`
        : null;
      const searchFilter = searchTerm ? activitySearchFilter(searchTerm) : null;
      if (pageFilter && searchFilter) {
        q = q.or(`and(or(${pageFilter}),or(${searchFilter}))`);
      } else if (pageFilter) {
        q = q.or(pageFilter);
      } else if (searchFilter) {
        q = q.or(searchFilter);
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
          <Activity className="h-4 w-4 text-primary" /> {tr("Atividade recente")}
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
              {t === "gestao" ? tr("Gestão") : tr("Execução")}
            </button>
          ))}
        </div>
      </div>
      <div className="relative mt-3">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={tr("Pesquisar funcionário ou cliente…")}
          aria-label={tr("Pesquisar funcionário ou cliente")}
          className="pl-9"
        />
      </div>

      {busy.length > 0 && (
        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-primary">
            {tr("Em atendimento agora")}
          </div>
          <ul className="space-y-1">
            {busy.map((b) => (
              <li key={`${b.entity_type}:${b.entity_id}`} className="flex items-center gap-2 text-sm">
                <UserCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="min-w-0 truncate">
                  <span className="font-medium">{b.holder_name}</span> · {b.label}
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {tr("há {{n}} min", { n: minutesSince(b.claimed_at, now) })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="mt-4 divide-y divide-border">
        {events.isLoading && (
          <li className="py-8 text-center text-sm text-muted-foreground">{tr("Carregando atividade...")}</li>
        )}
        {events.isError && (
          <li className="py-8 text-center text-sm text-destructive">
            {tr("Não foi possível carregar a atividade.")}{" "}
            <button className="underline" onClick={() => void events.refetch()}>
              {tr("Tentar novamente")}
            </button>
          </li>
        )}
        {!events.isLoading && !events.isError && rows.length === 0 && (
          <li className="py-8 text-center text-sm text-muted-foreground">{tr("Ainda não há atividade registada.")}</li>
        )}
        {rows.map((e) => {
          const locale = lang === "en" ? "en-GB" : "pt-PT";
          const isOpen = openEventId === e.id;
          const lines = isOpen ? detailLines(e.changes, locale) : [];
          return (
            <li key={e.id} className="py-1">
              <button
                type="button"
                onClick={() => setOpenEventId(isOpen ? null : e.id)}
                aria-expanded={isOpen}
                className="flex w-full gap-3 rounded-lg px-1 py-2 text-left hover:bg-muted/50"
              >
                <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatEventTime(e.created_at, locale)}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  {e.actor_name && e.source === "user" && <span className="font-medium">{e.actor_name} · </span>}
                  {e.source !== "user" && <span className="font-medium text-muted-foreground">{tr("Sistema")} · </span>}
                  {e.summary}
                </span>
                <ChevronDown
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
              {isOpen && (
                <div className="mb-2 ml-1 space-y-1.5 rounded-lg border border-border bg-muted/30 p-3 text-xs sm:ml-24">
                  <div className="text-muted-foreground">
                    {new Date(e.created_at).toLocaleString(locale, { dateStyle: "full", timeStyle: "medium" })}
                    {e.source === "user" && e.actor_name
                      ? ` · ${e.actor_name}${e.actor_role ? ` (${ROLE_LABEL[e.actor_role] ?? e.actor_role})` : ""}`
                      : ` · ${tr("Sistema")}`}
                  </div>
                  {lines.length === 0 ? (
                    <div className="text-muted-foreground">{tr("Sem detalhes registados para esta ação.")}</div>
                  ) : (
                    <dl className="space-y-1">
                      {lines.map((l) => (
                        <div key={l.key} className="flex flex-wrap gap-x-1.5">
                          <dt className="font-medium">{l.key}:</dt>
                          {"value" in l ? (
                            <dd className="break-words">{l.value}</dd>
                          ) : (
                            <dd className="break-words">
                              <span className="text-muted-foreground line-through">{l.before}</span> →{" "}
                              <span>{l.after}</span>
                            </dd>
                          )}
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {events.hasNextPage && (
        <div className="mt-3 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void events.fetchNextPage()}
            disabled={events.isFetchingNextPage}
          >
            {events.isFetchingNextPage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tr("Carregar mais")}
          </Button>
        </div>
      )}
    </div>
  );
}
