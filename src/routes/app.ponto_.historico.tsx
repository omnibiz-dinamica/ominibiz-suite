/**
 * OmniBiz · Funcionário — Histórico de ponto (12/11/2026).
 * Os próprios pontos encerrados: cliente, dia da tarefa, hora prevista,
 * entrada/saída registadas, pausas e total. Filtros por data e cliente.
 * Só leitura; o banco (RLS) garante que cada um vê apenas os seus pontos.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDuration } from "@/lib/tasks";
import {
  filterHistory,
  finishedPauses,
  formatPauseSeconds,
  localDateKey,
  fromHistoryRpc,
  plannedWindow,
  taskDayKey,
  type HistoryEntry,
  type HistoryRpcRow,
} from "@/lib/ponto/history";

export const Route = createFileRoute("/app/ponto_/historico")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["employee", "manager", "owner", "super_admin"]}>
      <MyHistory />
    </RoleGuard>
  );
}

const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmtDay = (key: string) => {
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
};
const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) : "—";

function MyHistory() {
  const { user, currentCompanyId } = useAuth();
  const today = localDateKey(new Date().toISOString());
  const [from, setFrom] = useState(addDays(today, -30));
  const [to, setTo] = useState(today);
  const [clientId, setClientId] = useState("all");
  const [text, setText] = useState("");

  // my_punch_history: só os pontos do próprio utilizador (o banco usa auth.uid()),
  // com o cliente e as pausas — também de tarefas já arquivadas.
  const entries = useQuery({
    queryKey: ["my-punch-history", user?.id, currentCompanyId, from, to],
    enabled: !!user && !!currentCompanyId && !!from && !!to && from <= to,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("my_punch_history", {
        _company_id: currentCompanyId,
        _from: from,
        _to: to,
      });
      if (error) throw error;
      return ((data ?? []) as HistoryRpcRow[]).map(fromHistoryRpc);
    },
  });

  const names = useMemo(() => {
    const map: Record<string, string> = {};
    for (const e of entries.data ?? []) {
      if (e.tasks?.client_id && e.client_name) map[e.tasks.client_id] = e.client_name;
    }
    return map;
  }, [entries.data]);

  // Só os clientes que aparecem no período escolhido.
  const clientOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const e of entries.data ?? []) {
      const id = e.tasks?.client_id;
      if (id) set.set(id, names[id] ?? e.tasks?.title ?? "Cliente");
    }
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt"));
  }, [entries.data, names]);

  const rows = useMemo(
    () =>
      filterHistory(entries.data ?? [], {
        from,
        to,
        clientId: clientId === "all" ? undefined : clientId,
        clientNames: names,
        text,
      }),
    [entries.data, from, to, clientId, names, text],
  );
  const totalMin = rows.reduce((s, e) => s + (e.effective_minutes ?? 0), 0);

  const clientName = (e: HistoryEntry) => e.client_name || e.tasks?.title || "Ponto sem tarefa";
  const pauseText = (e: HistoryEntry) => {
    const list = finishedPauses(
      e,
      (e.pauses ?? []).map((p) => ({ time_entry_id: e.id, ...p })),
    );
    if (list.length === 0) return null;
    return list.map((p, i) => ({
      key: `${e.id}:${i}`,
      label: `${i + 1}ª`,
      range: p.start ? `${fmtTime(p.start)}–${fmtTime(p.end)}` : "anteriores",
      dur: formatPauseSeconds(p.seconds),
    }));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold sm:text-3xl">
          <History className="h-6 w-6" /> Histórico
        </h1>
        <p className="text-sm text-muted-foreground">
          Os seus pontos encerrados: horário previsto, o que registou, pausas e total.
        </p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="h-from">De</Label>
          <Input
            id="h-from"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="h-to">Até</Label>
          <Input
            id="h-to"
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Cliente</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clientOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="h-text">Pesquisar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="h-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Nome do cliente"
              className="pl-8"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setFrom(today);
              setTo(today);
            }}
          >
            Hoje
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setFrom(addDays(today, -7));
              setTo(today);
            }}
          >
            7 dias
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setFrom(`${today.slice(0, 7)}-01`);
              setTo(today);
            }}
          >
            Este mês
          </Button>
          {(clientId !== "all" || text) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setClientId("all");
                setText("");
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {from > to ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-destructive">
          A data "De" tem de ser anterior ou igual a "Até".
        </div>
      ) : entries.isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Carregando histórico...
        </div>
      ) : entries.isError ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <span>{(entries.error as Error).message}</span>
          <Button size="sm" variant="outline" onClick={() => entries.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhum ponto encontrado neste período.
        </div>
      ) : (
        <>
          <div className="text-sm text-muted-foreground">
            {rows.length} registo(s) · total{" "}
            <span className="font-semibold text-foreground">{formatDuration(totalMin)}</span>
          </div>

          {/* Computador */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Dia</th>
                  <th className="px-3 py-2 text-left">Cliente</th>
                  <th className="px-3 py-2 text-left">Previsto</th>
                  <th className="px-3 py-2 text-left">Entrada</th>
                  <th className="px-3 py-2 text-left">Saída</th>
                  <th className="px-3 py-2 text-left">Pausas</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const ps = pauseText(e);
                  return (
                    <tr key={e.id} className="border-t border-border align-top">
                      <td className="whitespace-nowrap px-3 py-2">{fmtDay(taskDayKey(e))}</td>
                      <td className="px-3 py-2 font-medium">{clientName(e)}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {plannedWindow(e.tasks) ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{fmtTime(e.started_at)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{fmtTime(e.ended_at)}</td>
                      <td className="px-3 py-2 text-xs">
                        {ps ? (
                          ps.map((p) => (
                            <div key={p.key} className="whitespace-nowrap">
                              {p.label} {p.range} · {p.dur}
                            </div>
                          ))
                        ) : (
                          <span className="text-muted-foreground">sem pausa</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                        {formatDuration(e.effective_minutes ?? 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Telemóvel */}
          <ul className="space-y-2 md:hidden">
            {rows.map((e) => {
              const ps = pauseText(e);
              return (
                <li key={e.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{clientName(e)}</div>
                      <div className="text-xs text-muted-foreground">{fmtDay(taskDayKey(e))}</div>
                    </div>
                    <div className="shrink-0 font-mono text-base font-semibold">
                      {formatDuration(e.effective_minutes ?? 0)}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Previsto</span>
                    <span>{plannedWindow(e.tasks) ?? "—"}</span>
                    <span className="text-muted-foreground">Registado</span>
                    <span>
                      {fmtTime(e.started_at)} – {fmtTime(e.ended_at)}
                    </span>
                    <span className="text-muted-foreground">Pausas</span>
                    <span>
                      {ps
                        ? ps.map((p) => (
                            <span key={p.key} className="block">
                              {p.label} {p.dur}
                            </span>
                          ))
                        : "sem pausa"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
