import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Lock, Menu, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RoleGuard } from "@/components/RoleGuard";
import { STATUS_LABELS, STATUS_TONE } from "@/lib/tasks";
import { formatWallDate, formatWallTime } from "@/lib/wall-clock";
import { resolveAvailableNavigation } from "@/lib/navigation";
import { DEFAULT_ENABLED_MODULES, normalizeModules } from "@/lib/locale";

export const Route = createFileRoute("/app/admin/preview")({
  head: () => ({
    meta: [
      { title: "Pré-visualização de funcionário — OmniBiz" },
      { name: "description", content: "Veja, só em leitura, o que um funcionário vê no telemóvel." },
      { property: "og:title", content: "Pré-visualização de funcionário — OmniBiz" },
      { property: "og:description", content: "Modo somente leitura para Super Admin." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RoleGuard allow={["super_admin"]}>
      <PreviewPage />
    </RoleGuard>
  ),
});

type PTask = {
  id: string; title: string; status: keyof typeof STATUS_LABELS;
  scheduled_for: string | null; scheduled_end: string | null;
  recurrence_date: string | null; due_at: string | null; client_name: string | null;
};
type PreviewData = {
  profile: { full_name: string | null } | null;
  company: { name: string; enabled_modules: string[] | null } | null;
  has_vehicle: boolean;
  tasks: PTask[]; history: PTask[];
  time_entries: { id: string; started_at: string; ended_at: string | null; effective_minutes: number | null; task_title: string | null }[];
  notifications: { id: string; title: string; body: string | null; created_at: string; read_at: string | null }[];
  vacations: { id: string; start_date: string; end_date: string; status: string; note: string | null }[];
  payslips: { id: string; period_year: number; period_month: number; net_amount: number | null; original_filename: string | null }[];
};

const Blocked = ({ label }: { label: string }) => (
  <button disabled className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground opacity-60">
    <Lock className="h-3 w-3" /> {label}
  </button>
);

function when(t: PTask) {
  if (t.scheduled_for)
    return `${formatWallDate(t.scheduled_for)} · ${formatWallTime(t.scheduled_for)}${t.scheduled_end ? ` → ${formatWallTime(t.scheduled_end)}` : ""}`;
  return t.recurrence_date ? `${formatWallDate(t.recurrence_date)} · Sem horário definido` : "Sem horário definido";
}

function TaskList({ tasks, actions }: { tasks: PTask[]; actions?: string[] }) {
  if (!tasks.length) return <Empty text="Sem tarefas." />;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {tasks.map((t) => (
        <li key={t.id} className="space-y-1 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <span className="truncate font-medium" title={t.title}>{t.title}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${STATUS_TONE[t.status] ?? ""}`}>
              {STATUS_LABELS[t.status] ?? t.status}
            </span>
          </div>
          {t.client_name && <div className="text-xs text-muted-foreground">{t.client_name}</div>}
          <div className="text-xs text-muted-foreground">{when(t)}</div>
          {actions && <div className="flex flex-wrap gap-1 pt-1">{actions.map((a) => <Blocked key={a} label={a} />)}</div>}
        </li>
      ))}
    </ul>
  );
}

const Empty = ({ text }: { text: string }) => (
  <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">{text}</p>
);

function Screen({ path, d }: { path: string; d: PreviewData }) {
  switch (path) {
    case "/app":
      return (
        <>
          <h2 className="font-display text-xl font-semibold">Olá, {d.profile?.full_name ?? "colaborador"}</h2>
          <p className="text-xs text-muted-foreground">Sua operação do dia. Bata o ponto e foque nas suas tarefas.</p>
          <div className="text-sm font-medium">Próximas tarefas</div>
          <TaskList tasks={d.tasks.slice(0, 8)} />
        </>
      );
    case "/app/ponto":
      return (<><h2 className="font-display text-xl font-semibold">Folha de Ponto</h2>
        <TaskList tasks={d.tasks.slice(0, 20)} actions={["Iniciar", "Recusar"]} /></>);
    case "/app/ponto/meus-relatorios":
      return (<><h2 className="font-display text-xl font-semibold">Meus Relatórios</h2>
        {d.time_entries.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {d.time_entries.map((e) => (
              <li key={e.id} className="px-4 py-3 text-xs">
                <div className="font-medium text-sm">{e.task_title ?? "Registo"}</div>
                {formatWallDate(e.started_at)} · {formatWallTime(e.started_at)}
                {e.ended_at ? ` → ${formatWallTime(e.ended_at)}` : " · em aberto"}
                {e.effective_minutes != null && ` · ${Math.floor(e.effective_minutes / 60)}h${String(e.effective_minutes % 60).padStart(2, "0")}`}
              </li>
            ))}
          </ul>) : <Empty text="Sem registos de ponto." />}</>);
    case "/app/tarefas":
      return (<><h2 className="font-display text-xl font-semibold">Minhas Tarefas</h2>
        <div className="text-sm font-medium">A fazer</div><TaskList tasks={d.tasks} actions={["Iniciar"]} />
        <div className="text-sm font-medium">Histórico</div><TaskList tasks={d.history} /></>);
    case "/app/notificacoes":
      return (<><h2 className="font-display text-xl font-semibold">Notificações</h2>
        {d.notifications.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {d.notifications.map((n) => (
              <li key={n.id} className="px-4 py-3">
                <div className={`text-sm ${n.read_at ? "" : "font-semibold"}`}>{n.title}</div>
                {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
                <div className="text-[10px] text-muted-foreground">{formatWallDate(n.created_at)}</div>
              </li>
            ))}
          </ul>) : <Empty text="Sem notificações." />}</>);
    case "/app/ferias":
      return (<><h2 className="font-display text-xl font-semibold">Férias</h2><Blocked label="Pedir férias" />
        {d.vacations.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {d.vacations.map((v) => (
              <li key={v.id} className="px-4 py-3 text-sm">
                {formatWallDate(v.start_date)} → {formatWallDate(v.end_date)}
                <div className="text-xs text-muted-foreground">{v.status}</div>
              </li>
            ))}
          </ul>) : <Empty text="Sem pedidos de férias." />}</>);
    case "/app/meus-recibos":
      return (<><h2 className="font-display text-xl font-semibold">Meus Recibos</h2>
        {d.payslips.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {d.payslips.map((p) => (
              <li key={p.id} className="flex justify-between px-4 py-3 text-sm">
                <span>{String(p.period_month).padStart(2, "0")}/{p.period_year}</span>
                <Blocked label="Abrir" />
              </li>
            ))}
          </ul>) : <Empty text="Sem recibos." />}</>);
    default:
      return (<><h2 className="font-display text-xl font-semibold">Ecrã</h2>
        <Empty text="Este ecrã existe no menu do funcionário. Na pré-visualização mostra-se só a navegação." /></>);
  }
}

function PreviewPage() {
  const { currentCompanyId } = useAuth();
  const [target, setTarget] = useState("");
  const [path, setPath] = useState("/app");
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: members } = useQuery({
    queryKey: ["preview-members", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("company_active_member_options");
      if (error) throw error;
      return ((data ?? []) as { company_id: string; id: string; full_name: string | null }[])
        .filter((m) => m.company_id === currentCompanyId)
        .map((m) => ({ id: m.id, name: (m.full_name ?? "").trim() }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const { data, isFetching, error } = useQuery({
    queryKey: ["admin-preview-full", target, currentCompanyId],
    enabled: !!target && !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_preview_employee_full", {
        _target_employee_id: target, _company_id: currentCompanyId,
      });
      if (error) throw error;
      return data as PreviewData;
    },
  });

  const groups = useMemo(() => {
    if (!data) return [];
    return resolveAvailableNavigation({
      effectiveRole: "employee", isSuperAdmin: false, companyId: currentCompanyId,
      vertical: "cleaning" as never,
      enabledModules: normalizeModules(data.company?.enabled_modules ?? DEFAULT_ENABLED_MODULES),
      employeeHasVehicle: data.has_vehicle, contextReady: true,
    }).groups;
  }, [data, currentCompanyId]);
  const current = groups.flatMap((g) => g.items).find((i) => i.to === path);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Ver como funcionário</h1>
        <p className="text-sm text-muted-foreground">
          Escolha um funcionário da empresa aberta. Navegue pelo menu dele. Só leitura, e fica registado.
        </p>
      </div>
      <select
        className="w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-sm"
        value={target}
        onChange={(e) => { setTarget(e.target.value); setPath("/app"); setMenuOpen(false); }}
      >
        <option value="">Selecione um funcionário…</option>
        {(members ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>

      {target && (
        <div className="mx-auto w-[375px] max-w-full overflow-hidden rounded-[2rem] border-8 border-foreground/80 bg-background shadow-xl">
          <div className="flex items-center gap-2 bg-destructive px-3 py-1.5 text-[11px] font-semibold text-destructive-foreground">
            <Eye className="h-3.5 w-3.5" />
            <span className="truncate">Pré-visualização · {data?.profile?.full_name ?? "…"} · somente leitura</span>
          </div>
          <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
            <button aria-label="Menu" onClick={() => setMenuOpen((o) => !o)} className="rounded p-1 hover:bg-muted">
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <span className="truncate text-sm font-semibold">{current?.label ?? "OmniBiz"}</span>
            <span className="ml-auto truncate text-[10px] text-muted-foreground">{data?.company?.name}</span>
          </div>
          <div className="relative h-[620px]">
            {menuOpen && (
              <nav className="absolute inset-0 z-10 overflow-y-auto bg-card p-3">
                {groups.map((g) => (
                  <div key={g.id} className="mb-3">
                    <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</div>
                    {g.items.map((i) => {
                      const Icon = i.icon;
                      return (
                        <button key={i.to} onClick={() => { setPath(i.to); setMenuOpen(false); }}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm ${path === i.to ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}>
                          <Icon className="h-4 w-4" /> {i.label}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </nav>
            )}
            <div className="h-full space-y-3 overflow-y-auto p-4">
              {error ? <p className="text-sm text-destructive">Não foi possível carregar.</p>
                : isFetching || !data ? <p className="text-sm text-muted-foreground">Carregando…</p>
                : <Screen path={path} d={data} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
