import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Calendar as CalendarIcon, Check, X as XIcon, Plus, Plane } from "lucide-react";

export const Route = createFileRoute("/app/ferias")({ component: FeriasPage });

type VacationStatus = "pendente" | "aprovado" | "rejeitado" | "cancelado";
type VacationRow = {
  id: string;
  company_id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  note: string | null;
  status: VacationStatus;
  decision_reason: string | null;
  decided_at: string | null;
  created_at: string;
};

const STATUS_TONE: Record<VacationStatus, string> = {
  pendente: "bg-warning/15 text-warning-foreground",
  aprovado: "bg-success/15 text-success",
  rejeitado: "bg-destructive/15 text-destructive",
  cancelado: "bg-muted text-muted-foreground",
};

const fmt = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

function FeriasPage() {
  const { user, currentCompanyId, effectiveRole, isManager } = useAuth();
  const qc = useQueryClient();
  const isEmployee = effectiveRole === "employee";

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["vacations", currentCompanyId, effectiveRole, user?.id],
    enabled: !!user?.id && !!currentCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("vacation_requests")
        .select("*")
        .order("start_date", { ascending: false });
      if (currentCompanyId) q = q.eq("company_id", currentCompanyId);
      if (isEmployee) q = q.eq("user_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as VacationRow[];
    },
  });

  // Names for manager view
  const userIds = useMemo(() => Array.from(new Set(rows.map((r) => r.user_id))), [rows]);
  const { data: names = {} } = useQuery({
    queryKey: ["vac-profiles", userIds.join(",")],
    enabled: userIds.length > 0 && isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p: any) => [p.id, p.full_name ?? "Usuário"]));
    },
  });

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!start || !end) throw new Error("Informe início e fim");
      if (end < start) throw new Error("Data final deve ser após o início");
      if (!currentCompanyId || !user?.id) throw new Error("Empresa não selecionada");
      const { error } = await supabase.from("vacation_requests").insert({
        company_id: currentCompanyId,
        user_id: user.id,
        start_date: start,
        end_date: end,
        note: note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação enviada");
      setStart(""); setEnd(""); setNote("");
      qc.invalidateQueries({ queryKey: ["vacations"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao solicitar"),
  });

  const decide = useMutation({
    mutationFn: async (vars: { id: string; action: "aprovar" | "rejeitar" | "cancelar"; reason?: string }) => {
      const { error } = await (supabase as any).rpc("vacation_decide", {
        _id: vars.id,
        _action: vars.action,
        _reason: vars.reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vacations"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha na operação"),
  });

  const pending = rows.filter((r) => r.status === "pendente");
  const approved = rows.filter((r) => r.status === "aprovado");
  const history = rows.filter((r) => r.status === "rejeitado" || r.status === "cancelado");

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
          <Plane className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold">Férias</h1>
          <p className="text-sm text-muted-foreground">
            {isManager ? "Aprove solicitações e acompanhe o calendário da equipe." : "Solicite e acompanhe suas férias."}
          </p>
        </div>
      </header>

      {/* Employee form */}
      {isEmployee && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" /> Nova solicitação</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label htmlFor="start">Início</Label>
              <Input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="end">Fim</Label>
              <Input id="end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div className="md:col-span-3">
              <Label htmlFor="note">Observação (opcional)</Label>
              <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo, contexto..." />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button onClick={() => create.mutate()} disabled={create.isPending || !start || !end}>
              Enviar solicitação
            </Button>
          </div>
        </section>
      )}

      {/* Manager: pending */}
      {isManager && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 font-semibold">Pendentes ({pending.length})</h2>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma solicitação pendente.</p>
          ) : (
            <ul className="space-y-2">
              {pending.map((r) => (
                <PendingRow
                  key={r.id}
                  row={r}
                  name={names[r.user_id] ?? "Usuário"}
                  onApprove={() => decide.mutate({ id: r.id, action: "aprovar" })}
                  onReject={(reason) => decide.mutate({ id: r.id, action: "rejeitar", reason })}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Approved calendar */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <CalendarIcon className="h-4 w-4" /> Aprovadas ({approved.length})
        </h2>
        {approved.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma férias aprovada.</p>
        ) : (
          <ul className="divide-y divide-border">
            {approved.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <div className="font-medium">
                    {isManager ? names[r.user_id] ?? "Usuário" : "Você"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {fmt(r.start_date)} → {fmt(r.end_date)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE.aprovado}`}>aprovado</span>
                  {(r.user_id === user?.id || isManager) && (
                    <Button size="sm" variant="ghost" onClick={() => decide.mutate({ id: r.id, action: "cancelar" })}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Employee: own pending list */}
      {isEmployee && pending.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 font-semibold">Minhas pendentes</h2>
          <ul className="divide-y divide-border">
            {pending.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">{fmt(r.start_date)} → {fmt(r.end_date)}</div>
                  {r.note && <div className="text-xs text-muted-foreground">{r.note}</div>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => decide.mutate({ id: r.id, action: "cancelar" })}>
                  Cancelar
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* History */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 font-semibold">Histórico</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem registros.</p>
        ) : (
          <ul className="divide-y divide-border">
            {history.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <div className="font-medium">
                    {isManager ? names[r.user_id] ?? "Usuário" : "Você"} — {fmt(r.start_date)} → {fmt(r.end_date)}
                  </div>
                  {r.decision_reason && (
                    <div className="text-xs text-muted-foreground">Motivo: {r.decision_reason}</div>
                  )}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[r.status]}`}>{r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PendingRow({
  row, name, onApprove, onReject,
}: {
  row: VacationRow;
  name: string;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium">{name}</div>
          <div className="text-sm text-muted-foreground">
            {fmt(row.start_date)} → {fmt(row.end_date)}
          </div>
          {row.note && <div className="mt-1 text-xs text-muted-foreground">"{row.note}"</div>}
        </div>
        {!rejecting ? (
          <div className="flex gap-2">
            <Button size="sm" onClick={onApprove}>
              <Check className="h-4 w-4" /> Aprovar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
              <XIcon className="h-4 w-4" /> Rejeitar
            </Button>
          </div>
        ) : null}
      </div>
      {rejecting && (
        <div className="mt-3 space-y-2">
          <Label htmlFor={`r-${row.id}`}>Motivo da rejeição</Label>
          <Textarea
            id={`r-${row.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explique o motivo..."
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setRejecting(false); setReason(""); }}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!reason.trim()}
              onClick={() => { onReject(reason.trim()); setRejecting(false); setReason(""); }}
            >
              Confirmar rejeição
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}