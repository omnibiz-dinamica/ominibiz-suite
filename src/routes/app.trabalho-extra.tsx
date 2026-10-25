import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ModuleGuard } from "@/components/ModuleGuard";
import { useFormDraft } from "@/lib/form-draft";
import { DraftNotice } from "@/components/form-draft/DraftNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatWallDate, formatWallTime } from "@/lib/wall-clock";
import { Sparkles, Plus, Trash2, Users, Send, Check, X as XIcon, Search, Ban } from "lucide-react";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Aberto por notificação: ?convite=<convite> (funcionário) ou ?id=<trabalho extra> (gestor). */
interface ExtraWorkSearch {
  convite?: string;
  id?: string;
}

export const Route = createFileRoute("/app/trabalho-extra")({
  head: () => ({
    meta: [
      { title: "Trabalho Extra | OmniBiz" },
      {
        name: "description",
        content: "Registo de trabalhos extra, verificação de disponibilidade dos funcionários e envio de convites.",
      },
      { property: "og:title", content: "Trabalho Extra | OmniBiz" },
      {
        property: "og:description",
        content: "Registo de trabalhos extra, verificação de disponibilidade dos funcionários e envio de convites.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (raw: Record<string, unknown>): ExtraWorkSearch => ({
    convite: typeof raw.convite === "string" && UUID_RE.test(raw.convite) ? raw.convite : undefined,
    id: typeof raw.id === "string" && UUID_RE.test(raw.id) ? raw.id : undefined,
  }),
  component: TrabalhoExtraPage,
});

// As tabelas e RPCs do módulo ainda não estão no types.ts gerado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type DayDraft = { date: string; start: string; end: string };
type DayIso = { starts_at: string; ends_at: string };
type Availability = {
  user_id: string;
  full_name: string | null;
  available: boolean;
  reasons: string[] | null;
  warnings: string[] | null;
};
type InviteStatus = "enviado" | "aceite" | "recusado" | "fechado" | "cancelado";
type WorkStatus = "aberto" | "preenchido" | "cancelado";
type ExtraWorkRow = {
  id: string;
  title: string;
  description: string | null;
  slots: number;
  status: WorkStatus;
  created_at: string;
  cancellation_reason: string | null;
  extra_work_days: DayIso[] | null;
  extra_work_invites: { id: string; user_id: string; status: InviteStatus; responded_at: string | null }[] | null;
};
type MyInviteRow = {
  id: string;
  status: InviteStatus;
  invited_at: string;
  responded_at: string | null;
  extra_works: {
    id: string;
    title: string;
    description: string | null;
    slots: number;
    status: WorkStatus;
    extra_work_days: DayIso[] | null;
  } | null;
};

const INVITE_LABEL: Record<InviteStatus, string> = {
  enviado: "aguarda resposta",
  aceite: "aceite",
  recusado: "recusado",
  fechado: "vagas preenchidas",
  cancelado: "cancelado",
};
const INVITE_TONE: Record<InviteStatus, string> = {
  enviado: "bg-warning/15 text-warning-foreground",
  aceite: "bg-success/15 text-success",
  recusado: "bg-destructive/15 text-destructive",
  fechado: "bg-muted text-muted-foreground",
  cancelado: "bg-muted text-muted-foreground",
};
const WORK_LABEL: Record<WorkStatus, string> = { aberto: "aberto", preenchido: "completo", cancelado: "cancelado" };
const WORK_TONE: Record<WorkStatus, string> = {
  aberto: "bg-info/15 text-info",
  preenchido: "bg-success/15 text-success",
  cancelado: "bg-muted text-muted-foreground",
};

function tomorrowKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addOneDay(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Dias do formulário → horário de parede guardado como UTC (padrão das tarefas). Fim <= início = dia seguinte. */
function draftToDays(rows: DayDraft[]): DayIso[] {
  return rows
    .filter((r) => r.date && r.start && r.end)
    .map((r) => ({
      starts_at: `${r.date}T${r.start}:00.000Z`,
      ends_at: `${r.end <= r.start ? addOneDay(r.date) : r.date}T${r.end}:00.000Z`,
    }));
}

function sortDays(days: DayIso[] | null | undefined): DayIso[] {
  return [...(days ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

function DaysList({ days }: { days: DayIso[] | null | undefined }) {
  const list = sortDays(days);
  return (
    <ul className="space-y-0.5 text-sm">
      {list.map((d) => (
        <li key={d.starts_at}>
          {formatWallDate(d.starts_at)} · {formatWallTime(d.starts_at)}–{formatWallTime(d.ends_at)}
        </li>
      ))}
    </ul>
  );
}

function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return msg.replace(/^MODULE_NOT_ENABLED:\s*/, "");
}

function TrabalhoExtraPage() {
  const { isManager } = useAuth();
  return (
    <ModuleGuard module="extra_work">
      <div className="space-y-6">
        <header className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold">Trabalho Extra</h1>
            <p className="text-sm text-muted-foreground">
              {isManager
                ? "Registe o trabalho extra, veja quem está disponível e envie os convites."
                : "Convites para trabalhos extra. Os primeiros a aceitar ficam com as vagas."}
            </p>
          </div>
        </header>
        {isManager ? <ManagerView /> : <EmployeeView />}
      </div>
    </ModuleGuard>
  );
}

/* ------------------------------------------------------------------ */
/* Gestor                                                              */
/* ------------------------------------------------------------------ */

function ManagerView() {
  const { currentCompanyId } = useAuth();
  const search = Route.useSearch();
  const qc = useQueryClient();

  const { data: members } = useQuery({
    queryKey: ["extra-work-members", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await db
        .from("user_roles")
        .select("user_id, role, profiles!inner(full_name, is_active, status, termination_date)")
        .eq("company_id", currentCompanyId)
        .eq("role", "employee");
      if (error) throw error;
      const today = new Date().toISOString().slice(0, 10);
      const seen = new Set<string>();
      const rows: { id: string; name: string }[] = [];
      for (const r of (data ?? []) as {
        user_id: string;
        profiles: {
          full_name: string | null;
          is_active: boolean | null;
          status: string | null;
          termination_date: string | null;
        } | null;
      }[]) {
        const p = r.profiles;
        if (!p || seen.has(r.user_id)) continue;
        if (p.is_active === false || (p.status ?? "").toLowerCase() === "inativo") continue;
        if (p.termination_date && p.termination_date <= today) continue;
        seen.add(r.user_id);
        rows.push({ id: r.user_id, name: p.full_name ?? "Sem nome" });
      }
      return rows.sort((a, b) => a.name.localeCompare(b.name, "pt"));
    },
  });
  const nameById = useMemo(() => new Map((members ?? []).map((m) => [m.id, m.name])), [members]);

  const { data: clients } = useQuery({
    queryKey: ["extra-work-clients", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await db
        .from("clients")
        .select("id, name")
        .eq("company_id", currentCompanyId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: works, isLoading: worksLoading } = useQuery({
    queryKey: ["extra-works", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await db
        .from("extra_works")
        .select(
          "id, title, description, slots, status, created_at, cancellation_reason, extra_work_days(starts_at, ends_at), extra_work_invites(id, user_id, status, responded_at)",
        )
        .eq("company_id", currentCompanyId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ExtraWorkRow[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["extra-works"] });
    qc.invalidateQueries({ queryKey: ["extra-work-eligible"] });
  };

  const [invitingWork, setInvitingWork] = useState<ExtraWorkRow | null>(null);

  return (
    <div className="space-y-6">
      <EligibleSection members={members ?? []} />
      <NewExtraWorkSection clients={clients ?? []} onCreated={invalidate} />

      {invitingWork && (
        <section className="rounded-2xl border border-primary/40 bg-card p-5">
          <h2 className="mb-1 flex items-center gap-2 font-semibold">
            <Send className="h-4 w-4" /> Convidar mais funcionários · {invitingWork.title}
          </h2>
          <div className="mb-3 text-muted-foreground">
            <DaysList days={invitingWork.extra_work_days} />
          </div>
          <AvailabilityPicker
            days={sortDays(invitingWork.extra_work_days)}
            excludeUserIds={(invitingWork.extra_work_invites ?? []).map((i) => i.user_id)}
            confirmLabel="Enviar convites"
            onCancel={() => setInvitingWork(null)}
            onConfirm={async (userIds) => {
              const { data, error } = await db.rpc("extra_work_send_invites", {
                _extra_work_id: invitingWork.id,
                _user_ids: userIds,
              });
              if (error) throw error;
              reportSend(data);
              setInvitingWork(null);
              invalidate();
            }}
          />
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 font-semibold">Trabalhos extra</h2>
        {worksLoading && <div className="text-sm text-muted-foreground">A carregar…</div>}
        {!worksLoading && (works ?? []).length === 0 && (
          <div className="text-sm text-muted-foreground">Ainda não há trabalhos extra.</div>
        )}
        <div className="space-y-3">
          {(works ?? []).map((w) => (
            <ExtraWorkCard
              key={w.id}
              work={w}
              highlighted={search.id === w.id}
              nameById={nameById}
              onInviteMore={() => setInvitingWork(w)}
              onChanged={invalidate}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function reportSend(data: unknown) {
  const res = (data ?? {}) as { sent?: number; skipped?: { reason: string }[] };
  const sent = res.sent ?? 0;
  const skipped = res.skipped ?? [];
  if (sent > 0) toast.success(`${sent} convite(s) enviado(s)`);
  if (skipped.length > 0) toast.warning(`${skipped.length} não enviado(s): ${skipped.map((s) => s.reason).join("; ")}`);
  if (sent === 0 && skipped.length === 0) toast.info("Nenhum convite enviado");
}

function EligibleSection({ members }: { members: { id: string; name: string }[] }) {
  const { currentCompanyId } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Set<string> | null>(null);

  const { data: eligible } = useQuery({
    queryKey: ["extra-work-eligible", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await db.from("extra_work_eligible").select("user_id").eq("company_id", currentCompanyId);
      if (error) throw error;
      return new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id));
    },
  });

  const selected = draft ?? eligible ?? new Set<string>();
  // Sem lista definida: a lista abre logo, com a explicação (antes de criar trabalhos extra).
  const isEmpty = eligible !== undefined && eligible.size === 0;
  const showList = open || isEmpty;
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDraft(next);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("extra_work_eligible_set", {
        _company_id: currentCompanyId,
        _user_ids: Array.from(selected),
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast.success(`${n} funcionário(s) elegível(eis)`);
      setDraft(null);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["extra-work-eligible"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Users className="h-4 w-4" /> Funcionários que fazem trabalho extra
          <span className="text-sm font-normal text-muted-foreground">({eligible?.size ?? 0})</span>
        </h2>
        {!isEmpty && (
          <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
            {open ? "Fechar" : "Editar lista"}
          </Button>
        )}
      </div>
      {showList && (
        <div className="mt-3 space-y-3">
          {isEmpty && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              Primeiro escolha quem faz trabalho extra: marque os funcionários abaixo e carregue em "Guardar lista". Só
              eles aparecem na lista de disponíveis.
            </div>
          )}
          {members.length === 0 && <div className="text-sm text-muted-foreground">Sem funcionários ativos.</div>}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2 text-sm"
              >
                <input type="checkbox" className="h-4 w-4" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                {m.name}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? "A guardar..." : "Guardar lista"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDraft(null);
                setOpen(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function NewExtraWorkSection({
  clients,
  onCreated,
}: {
  clients: { id: string; name: string }[];
  onCreated: () => void;
}) {
  const { currentCompanyId } = useAuth();
  const [clientId, setClientId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [slots, setSlots] = useState("1");
  const [rows, setRows] = useState<DayDraft[]>([{ date: tomorrowKey(), start: "09:00", end: "13:00" }]);
  const [checkedDays, setCheckedDays] = useState<DayIso[] | null>(null);

  const days = draftToDays(rows);
  const daysKey = JSON.stringify(days);
  const checkedKey = checkedDays ? JSON.stringify(checkedDays) : null;
  const showPicker = checkedDays !== null && checkedKey === daysKey;

  const updateRow = (i: number, patch: Partial<DayDraft>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const reset = () => {
    setClientId("");
    setTitle("");
    setDescription("");
    setSlots("1");
    setRows([{ date: tomorrowKey(), start: "09:00", end: "13:00" }]);
    setCheckedDays(null);
  };

  const validate = (): string | null => {
    if (!clientId && !title.trim()) return "Escolha o cliente ou escreva um título";
    const n = Number(slots);
    if (!Number.isInteger(n) || n < 1 || n > 50) return "Número de vagas entre 1 e 50";
    if (rows.length === 0 || days.length !== rows.length) return "Preencha a data e as horas de todos os dias";
    return null;
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <Plus className="h-4 w-4" /> Novo trabalho extra
      </h2>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label>Cliente</Label>
          <Select value={clientId || "none"} onValueChange={(v) => setClientId(v === "none" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha o cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem cliente</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="ew-title">Título (opcional)</Label>
          <Input
            id="ew-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Limpeza pós-obra"
          />
        </div>
        <div>
          <Label htmlFor="ew-slots">Funcionários necessários</Label>
          <Input
            id="ew-slots"
            type="number"
            min={1}
            max={50}
            value={slots}
            onChange={(e) => setSlots(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-3">
        <Label htmlFor="ew-desc">Instruções (opcional)</Label>
        <Textarea id="ew-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="mt-4 space-y-2">
        <Label>Dias e horários (o funcionário aceita o pacote completo)</Label>
        {rows.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
          >
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={r.date} onChange={(e) => updateRow(i, { date: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Início</Label>
              <Input type="time" value={r.start} onChange={(e) => updateRow(i, { start: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Fim</Label>
              <Input type="time" value={r.end} onChange={(e) => updateRow(i, { end: e.target.value })} />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={rows.length === 1}
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              aria-label={`Remover dia ${i + 1}`}
            >
              <Trash2 className="h-4 w-4" /> Remover
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setRows((rs) => [
              ...rs,
              {
                date: rs.length ? addOneDay(rs[rs.length - 1].date) : tomorrowKey(),
                start: rs[rs.length - 1]?.start ?? "09:00",
                end: rs[rs.length - 1]?.end ?? "13:00",
              },
            ])
          }
        >
          <Plus className="h-4 w-4" /> Adicionar dia
        </Button>
      </div>

      <div className="mt-4">
        {!showPicker ? (
          <Button
            onClick={() => {
              const err = validate();
              if (err) {
                toast.error(err);
                return;
              }
              setCheckedDays(days);
            }}
          >
            <Search className="h-4 w-4" /> Ver funcionários disponíveis
          </Button>
        ) : (
          <AvailabilityPicker
            days={days}
            excludeUserIds={[]}
            confirmLabel="Criar e enviar convites"
            onCancel={() => setCheckedDays(null)}
            onConfirm={async (userIds) => {
              const err = validate();
              if (err) throw new Error(err);
              const { data: id, error } = await db.rpc("extra_work_create", {
                _company_id: currentCompanyId,
                _client_id: clientId || null,
                _title: title.trim() || null,
                _description: description.trim() || null,
                _slots: Number(slots),
                _days: days,
              });
              if (error) throw error;
              const { data: sent, error: sendError } = await db.rpc("extra_work_send_invites", {
                _extra_work_id: id,
                _user_ids: userIds,
              });
              if (sendError) throw sendError;
              reportSend(sent);
              reset();
              onCreated();
            }}
          />
        )}
      </div>
    </section>
  );
}

function AvailabilityPicker({
  days,
  excludeUserIds,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  days: DayIso[];
  excludeUserIds: string[];
  confirmLabel: string;
  onConfirm: (userIds: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const { currentCompanyId } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["extra-work-availability", currentCompanyId, JSON.stringify(days)],
    enabled: !!currentCompanyId && days.length > 0,
    queryFn: async () => {
      const { data, error } = await db.rpc("extra_work_availability", { _company_id: currentCompanyId, _days: days });
      if (error) throw error;
      return (data ?? []) as Availability[];
    },
  });

  const rows = (data ?? []).filter((r) => !excludeUserIds.includes(r.user_id));
  const available = rows.filter((r) => r.available);
  const busyRows = rows.filter((r) => !r.available);
  const allSelected = available.length > 0 && available.every((r) => selected.has(r.user_id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      {isLoading && <div className="text-sm text-muted-foreground">A verificar disponibilidade…</div>}
      {error && <div className="text-sm text-destructive">{errorMessage(error)}</div>}
      {!isLoading && !error && rows.length === 0 && (
        <div className="text-sm text-muted-foreground">
          Ainda não há funcionários na lista de trabalho extra. Escolha-os acima, em "Funcionários que fazem trabalho
          extra", e guarde a lista.
        </div>
      )}

      {available.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-success">Disponíveis ({available.length})</div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(available.map((r) => r.user_id)))}
              />
              Marcar todos
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {available.map((r) => (
              <label
                key={r.user_id}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={selected.has(r.user_id)}
                  onChange={() => toggle(r.user_id)}
                />
                <span>
                  {r.full_name ?? "Sem nome"}
                  {(r.warnings ?? []).map((w) => (
                    <span key={w} className="block text-xs text-warning-foreground">
                      ⚠ {w}
                    </span>
                  ))}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {busyRows.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">Ocupados ({busyRows.length})</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {busyRows.map((r) => (
              <div
                key={r.user_id}
                className="rounded-lg border border-border bg-muted/30 p-2 text-sm text-muted-foreground"
              >
                {r.full_name ?? "Sem nome"}
                {(r.reasons ?? []).map((x) => (
                  <span key={x} className="block text-xs">
                    {x}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || selected.size === 0}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm(Array.from(selected));
              setSelected(new Set());
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Send className="h-4 w-4" /> {busy ? "A enviar..." : `${confirmLabel} (${selected.size})`}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          Voltar
        </Button>
      </div>
    </div>
  );
}

function ExtraWorkCard({
  work,
  highlighted,
  nameById,
  onInviteMore,
  onChanged,
}: {
  work: ExtraWorkRow;
  highlighted: boolean;
  nameById: Map<string, string>;
  onInviteMore: () => void;
  onChanged: () => void;
}) {
  const invites = work.extra_work_invites ?? [];
  const accepted = invites.filter((i) => i.status === "aceite").length;
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reason, setReason] = useState("");

  const cancelMut = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("extra_work_cancel", { _extra_work_id: work.id, _reason: reason.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Trabalho extra cancelado");
      setConfirmCancel(false);
      onChanged();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className={`rounded-xl border p-3 ${highlighted ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{work.title}</div>
          <div className="text-muted-foreground">
            <DaysList days={work.extra_work_days} />
          </div>
          {work.description && <div className="mt-1 text-sm">{work.description}</div>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${WORK_TONE[work.status]}`}>
            {WORK_LABEL[work.status]}
          </span>
          <span className="text-sm font-medium">
            {accepted}/{work.slots} vagas
          </span>
        </div>
      </div>

      {invites.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {invites.map((i) => (
            <span key={i.id} className={`rounded-full px-2 py-0.5 text-xs ${INVITE_TONE[i.status]}`}>
              {nameById.get(i.user_id) ?? "Funcionário"} · {INVITE_LABEL[i.status]}
            </span>
          ))}
        </div>
      )}
      {work.status === "cancelado" && work.cancellation_reason && (
        <div className="mt-2 text-xs text-muted-foreground">Motivo: {work.cancellation_reason}</div>
      )}

      {work.status === "aberto" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onInviteMore}>
            <Send className="h-4 w-4" /> Convidar mais
          </Button>
          {accepted === 0 && !confirmCancel && (
            <Button size="sm" variant="outline" onClick={() => setConfirmCancel(true)}>
              <Ban className="h-4 w-4" /> Cancelar
            </Button>
          )}
        </div>
      )}
      {confirmCancel && (
        <div className="mt-3 space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <Label htmlFor={`cancel-${work.id}`}>Motivo do cancelamento (opcional)</Label>
          <Input id={`cancel-${work.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="destructive" disabled={cancelMut.isPending} onClick={() => cancelMut.mutate()}>
              Confirmar cancelamento
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmCancel(false)}>
              Voltar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Funcionário                                                         */
/* ------------------------------------------------------------------ */

function EmployeeView() {
  const { user } = useAuth();
  const search = Route.useSearch();
  const qc = useQueryClient();

  const { data: invites, isLoading } = useQuery({
    queryKey: ["extra-work-my-invites", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("extra_work_invites")
        .select(
          "id, status, invited_at, responded_at, extra_works(id, title, description, slots, status, extra_work_days(starts_at, ends_at))",
        )
        .eq("user_id", user!.id)
        .order("invited_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as MyInviteRow[];
    },
  });

  const respondMut = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const { data, error } = await db.rpc("extra_work_respond", { _invite_id: id, _accept: accept });
      if (error) throw error;
      return data as { status: string };
    },
    onSuccess: (res) => {
      toast.success(
        res?.status === "aceite" ? "Aceite! As tarefas foram criadas em Minhas Tarefas." : "Convite recusado.",
      );
      qc.invalidateQueries({ queryKey: ["extra-work-my-invites"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      qc.invalidateQueries({ queryKey: ["extra-work-my-invites"] });
    },
  });

  const open = (invites ?? []).filter((i) => i.status === "enviado" && i.extra_works?.status === "aberto");
  const history = (invites ?? []).filter((i) => !open.includes(i));

  const card = (i: MyInviteRow, actions: boolean) => (
    <div
      key={i.id}
      className={`rounded-xl border p-3 ${search.convite === i.id ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{i.extra_works?.title ?? "Trabalho extra"}</div>
          <div className="text-muted-foreground">
            <DaysList days={i.extra_works?.extra_work_days} />
          </div>
          {i.extra_works?.description && <div className="mt-1 text-sm">{i.extra_works.description}</div>}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${INVITE_TONE[i.status]}`}>
          {INVITE_LABEL[i.status]}
        </span>
      </div>
      {actions && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={respondMut.isPending} onClick={() => respondMut.mutate({ id: i.id, accept: true })}>
            <Check className="h-4 w-4" /> Aceitar
          </Button>
          <Button
            variant="outline"
            disabled={respondMut.isPending}
            onClick={() => respondMut.mutate({ id: i.id, accept: false })}
          >
            <XIcon className="h-4 w-4" /> Recusar
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 font-semibold">Convites em aberto</h2>
        {isLoading && <div className="text-sm text-muted-foreground">A carregar…</div>}
        {!isLoading && open.length === 0 && (
          <div className="text-sm text-muted-foreground">Sem convites em aberto.</div>
        )}
        <div className="space-y-3">{open.map((i) => card(i, true))}</div>
      </section>
      {history.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 font-semibold">Histórico</h2>
          <div className="space-y-3">{history.map((i) => card(i, false))}</div>
        </section>
      )}
    </div>
  );
}
