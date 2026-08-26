/**
 * Painel de grupos de possíveis duplicados (ADR-048) — exclusivo Super Admin.
 * Agrupa tickets pela assinatura do problema (entidade + ação) em toda a plataforma.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TICKET_STATUS_LABEL } from "@/lib/support/constants";
import { fetchDuplicateClusters, signatureLabel } from "@/lib/support/similar";

export function DuplicateClustersPanel({
  companyNames,
}: {
  companyNames: Map<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const clustersQ = useQuery({
    queryKey: ["support-duplicate-clusters"],
    queryFn: () => fetchDuplicateClusters(180),
    enabled: open,
  });

  const clusters = clustersQ.data ?? [];

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <Layers className="h-4 w-4 text-primary" />
          Possíveis duplicados (últimos 180 dias)
        </h2>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          {open ? "Ocultar" : "Analisar"}
        </Button>
      </div>

      {open && (
        <div className="space-y-2">
          {clustersQ.isLoading && <p className="text-sm text-muted-foreground">A analisar…</p>}
          {!clustersQ.isLoading && clusters.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum grupo de tickets semelhantes encontrado.</p>
          )}
          {clusters.map((c) => {
            const key = `${c.action}:${c.entity}`;
            const isOpen = expanded === key;
            return (
              <div key={key} className="rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : key)}
                  className="flex w-full flex-wrap items-center gap-3 p-3 text-left text-sm hover:bg-muted/40"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-medium">{signatureLabel(c.action, c.entity)}</span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    {c.tickets_count} tickets
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    {c.companies_count} empresa(s)
                  </span>
                  {c.open_count > 0 && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                      {c.open_count} em aberto
                    </span>
                  )}
                  <time className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {new Date(c.last_at).toLocaleDateString("pt-PT")}
                  </time>
                </button>

                {isOpen && (
                  <ul className="space-y-1 border-t border-border p-3 text-xs">
                    {c.tickets.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center gap-2">
                        <Link
                          to="/app/suporte/$id"
                          params={{ id: t.id }}
                          className="font-mono font-semibold text-primary hover:underline"
                        >
                          {t.ticket_number}
                        </Link>
                        <span className="min-w-0 flex-1 truncate">{t.title}</span>
                        <span className="text-muted-foreground">
                          {companyNames.get(t.company_id) ?? "—"}
                        </span>
                        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                          {TICKET_STATUS_LABEL[t.status] ?? t.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
