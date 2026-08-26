/**
 * Painel "Tickets relacionados" (ADR-048).
 *
 * Mostrado no detalhe do ticket:
 *  - ligações existentes (duplicado / relacionado), respeitando o isolamento por empresa;
 *  - quem mais relatou o mesmo problema;
 *  - ferramenta de ligação para Gestores (dentro da empresa) e Super Admin (global);
 *  - aviso de "notificar afetados" (Super Admin).
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GitMerge, Link2, Loader2, Megaphone, Search, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TICKET_STATUS_LABEL } from "@/lib/support/constants";
import {
  fetchRelatedTickets,
  linkTickets,
  notifyAffected,
  unlinkTickets,
} from "@/lib/support/similar";

interface Candidate {
  id: string;
  ticket_number: string;
  title: string;
  status: string;
}

export function RelatedTicketsPanel({
  ticketId,
  isSuperAdmin,
}: {
  ticketId: string;
  isSuperAdmin: boolean;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [relation, setRelation] = useState<"duplicate" | "related">("related");
  const [notifyMsg, setNotifyMsg] = useState("");
  const [showNotify, setShowNotify] = useState(false);

  const relatedQ = useQuery({
    queryKey: ["support-related", ticketId],
    queryFn: () => fetchRelatedTickets(ticketId),
  });

  const candidatesQ = useQuery<Candidate[]>({
    queryKey: ["support-link-candidates", ticketId, search],
    enabled: search.trim().length >= 3,
    queryFn: async () => {
      const term = `%${search.trim()}%`;
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id, ticket_number, title, status")
        .or(`ticket_number.ilike.${term},title.ilike.${term}`)
        .neq("id", ticketId)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as Candidate[];
    },
  });

  const linkMut = useMutation({
    mutationFn: (relatedTicketId: string) =>
      linkTickets({ ticketId, relatedTicketId, relation }),
    onSuccess: () => {
      toast.success("Tickets ligados.");
      setSearch("");
      void qc.invalidateQueries({ queryKey: ["support-related", ticketId] });
    },
    onError: (e: unknown) =>
      toast.error("Falha ao ligar: " + (e instanceof Error ? e.message : String(e))),
  });

  const unlinkMut = useMutation({
    mutationFn: (linkId: string) => unlinkTickets(linkId),
    onSuccess: () => {
      toast.success("Ligação removida.");
      void qc.invalidateQueries({ queryKey: ["support-related", ticketId] });
    },
    onError: (e: unknown) =>
      toast.error("Falha ao remover: " + (e instanceof Error ? e.message : String(e))),
  });

  const notifyMut = useMutation({
    mutationFn: () => notifyAffected(ticketId, notifyMsg.trim()),
    onSuccess: (n) => {
      toast.success(`${n} pessoa(s) notificada(s).`);
      setNotifyMsg("");
      setShowNotify(false);
    },
    onError: (e: unknown) =>
      toast.error("Falha ao notificar: " + (e instanceof Error ? e.message : String(e))),
  });

  const data = relatedQ.data;
  if (!data) return null;
  const hasContent = data.links.length > 0 || data.affected_count > 0 || data.can_manage;
  if (!hasContent) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Tickets relacionados
        {data.affected_count > 0 && (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal">
            <Users className="h-3 w-3" /> {data.affected_count} relato(s) do mesmo problema
          </span>
        )}
      </h2>

      <div className="space-y-2">
        {data.links.map((l) => (
          <div
            key={l.link_id}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm"
          >
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                l.relation === "duplicate"
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {l.relation === "duplicate" ? <GitMerge className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
              {l.relation === "duplicate" ? "duplicado" : "relacionado"}
            </span>
            <Link
              to="/app/suporte/$id"
              params={{ id: l.ticket.id }}
              className="font-mono text-xs font-semibold text-primary hover:underline"
            >
              {l.ticket.ticket_number}
            </Link>
            <span className="min-w-0 flex-1 truncate">{l.ticket.title}</span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
              {TICKET_STATUS_LABEL[l.ticket.status as keyof typeof TICKET_STATUS_LABEL] ?? l.ticket.status}
            </span>
            {data.can_manage && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Remover ligação"
                onClick={() => unlinkMut.mutate(l.link_id)}
                disabled={unlinkMut.isPending}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
        {data.links.length === 0 && (
          <p className="text-xs text-muted-foreground">Sem tickets ligados.</p>
        )}
      </div>

      {data.affected.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-border bg-muted/30 p-3 text-xs">
          {data.affected.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium">
                {a.user_name ?? (a.same_company ? "Utilizador da empresa" : "Utilizador de outra conta")}
              </span>
              <time className="font-mono text-muted-foreground">
                {new Date(a.created_at).toLocaleString("pt-PT")}
              </time>
              {a.note && <span className="text-muted-foreground">— {a.note}</span>}
            </li>
          ))}
        </ul>
      )}

      {data.can_manage && (
        <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Procurar ticket por número ou título"
                className="pl-8"
              />
            </div>
            <Select value={relation} onValueChange={(v) => setRelation(v as "duplicate" | "related")}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="related">Relacionado</SelectItem>
                <SelectItem value="duplicate">Duplicado de…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {search.trim().length >= 3 && (
            <ul className="space-y-1">
              {(candidatesQ.data ?? []).map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-2 text-xs"
                >
                  <span className="font-mono font-semibold">{c.ticket_number}</span>
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => linkMut.mutate(c.id)}
                    disabled={linkMut.isPending}
                  >
                    {linkMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Ligar"}
                  </Button>
                </li>
              ))}
              {candidatesQ.data?.length === 0 && (
                <li className="text-xs text-muted-foreground">Nenhum ticket encontrado.</li>
              )}
            </ul>
          )}

          {isSuperAdmin && data.affected_count + data.links.length > 0 && (
            <div className="space-y-2 pt-1">
              {showNotify ? (
                <>
                  <Textarea
                    value={notifyMsg}
                    onChange={(e) => setNotifyMsg(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Mensagem enviada a todos os afetados e autores dos tickets ligados."
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => notifyMut.mutate()}
                      disabled={notifyMut.isPending || notifyMsg.trim().length < 3}
                    >
                      {notifyMut.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                      Enviar notificação
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setShowNotify(false)}>
                      Cancelar
                    </Button>
                  </div>
                </>
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={() => setShowNotify(true)}>
                  <Megaphone className="mr-1.5 h-3.5 w-3.5" /> Notificar afetados
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
