/**
 * OmniBiz — Painel "Pontos em aberto" (Folha de Ponto · Gestão).
 *
 * Lista somente `time_entries` realmente abertos da empresa, com badge de
 * severidade (Normal / Atenção / Crítico) e ação "Resolver ponto", que abre o
 * modal canónico de regularização auditada.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronDown, ChevronUp, TimerReset } from "lucide-react";
import {
  SEVERITY_LABEL,
  SEVERITY_TONE,
  fetchOpenEntries,
  formatOpenDuration,
  openMinutesFrom,
  type OpenEntryRow,
} from "@/lib/punch/recovery";
import { OpenPunchRecoveryDialog } from "@/components/ponto/OpenPunchRecoveryDialog";

export function OpenPunchPanel({ companyId }: { companyId: string | null }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [target, setTarget] = useState<OpenEntryRow | null>(null);

  const { data: rows } = useQuery({
    queryKey: ["punch-open-entries", companyId],
    enabled: !!companyId,
    refetchInterval: 60_000,
    queryFn: () => fetchOpenEntries(companyId),
  });

  const list = rows ?? [];
  const critical = list.filter((r) => r.severity === "critical").length;

  return (
    <section className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
        aria-expanded={expanded}
      >
        <TimerReset className="h-5 w-5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Pontos em aberto: {list.length}</div>
          <div className="text-xs text-muted-foreground">
            {critical > 0
              ? `${critical} com mais de 12h em aberto — regularize com o funcionário.`
              : "Registos ainda sem saída. Clique para ver e regularizar."}
          </div>
        </div>
        {critical > 0 ? <AlertTriangle className="h-4 w-4 text-destructive" /> : null}
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded ? (
        list.length === 0 ? (
          <div className="border-t border-border px-5 py-8 text-center text-sm text-muted-foreground">
            Nenhum ponto em aberto.
          </div>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {list.map((r) => (
              <li key={r.time_entry_id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.user_name ?? "Funcionário"}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {r.task_title ?? "Sem tarefa"}
                    {r.client_name ? ` · ${r.client_name}` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Entrada: {new Date(r.started_at).toLocaleString("pt-PT")} ·{" "}
                    {formatOpenDuration(openMinutesFrom(r.started_at))} em aberto
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_TONE[r.severity]}`}
                  >
                    {SEVERITY_LABEL[r.severity]}
                  </span>
                  {r.inconsistent ? (
                    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning-foreground">
                      Inconsistente
                    </span>
                  ) : null}
                  <Button size="sm" onClick={() => setTarget(r)}>
                    Resolver ponto
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      <OpenPunchRecoveryDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        mode="manager"
        entry={target}
        onResolved={() => {
          setTarget(null);
          qc.invalidateQueries({ queryKey: ["punch-open-entries"] });
          qc.invalidateQueries({ queryKey: ["punch-admin-list"] });
          qc.invalidateQueries({ queryKey: ["punch-audit"] });
        }}
      />
    </section>
  );
}
