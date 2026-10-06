import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RoleGuard } from "@/components/RoleGuard";
import { STATUS_LABELS, STATUS_TONE } from "@/lib/tasks";
import { formatWallDate, formatWallTime } from "@/lib/wall-clock";

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

type PreviewTask = {
  id: string; title: string; status: keyof typeof STATUS_LABELS;
  scheduled_for: string | null; scheduled_end: string | null;
  recurrence_date: string | null; due_at: string | null; client_name: string | null;
};

function PreviewPage() {
  const { currentCompanyId } = useAuth();
  const [target, setTarget] = useState("");

  const { data: members } = useQuery({
    queryKey: ["preview-members", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("company_active_member_options", { _company_id: currentCompanyId });
      if (error) throw error;
      return ((data ?? []) as { user_id?: string; id?: string; full_name: string | null }[])
        .map((m) => ({ id: (m.user_id ?? m.id) as string, name: (m.full_name ?? "").trim() }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const { data, isFetching, error } = useQuery({
    queryKey: ["admin-preview", target],
    enabled: !!target,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_preview_employee", { _target_employee_id: target });
      if (error) throw error;
      return data as { profile: { full_name: string | null } | null; tasks: PreviewTask[] };
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Ver como funcionário</h1>
        <p className="text-sm text-muted-foreground">
          Escolha um funcionário da empresa aberta. A visualização é só de leitura e fica registada.
        </p>
      </div>
      <select
        className="w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-sm"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      >
        <option value="">Selecione um funcionário…</option>
        {(members ?? []).map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>

      {target && (
        <div className="mx-auto w-[375px] overflow-hidden rounded-[2rem] border-8 border-foreground/80 bg-background shadow-xl">
          <div className="flex items-center gap-2 bg-destructive px-3 py-2 text-xs font-semibold text-destructive-foreground">
            <Eye className="h-3.5 w-3.5" /> Pré-visualização · somente leitura
          </div>
          <div className="h-[640px] space-y-4 overflow-y-auto p-4">
            {error ? (
              <p className="text-sm text-destructive">Não foi possível carregar.</p>
            ) : isFetching ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : (
              <>
                <h2 className="font-display text-xl font-semibold">
                  Olá, {data?.profile?.full_name ?? "colaborador"}
                </h2>
                <div className="rounded-xl border border-border bg-card">
                  <div className="border-b border-border px-4 py-2 text-sm font-medium">Próximas tarefas</div>
                  {(data?.tasks ?? []).length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">Sem tarefas pendentes.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {data!.tasks.map((t) => (
                        <li key={t.id} className="space-y-1 px-4 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <span className="truncate font-medium" title={t.title}>{t.title}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${STATUS_TONE[t.status] ?? ""}`}>
                              {STATUS_LABELS[t.status] ?? t.status}
                            </span>
                          </div>
                          {t.client_name && <div className="text-xs text-muted-foreground">{t.client_name}</div>}
                          <div className="text-xs text-muted-foreground">
                            {t.scheduled_for
                              ? `${formatWallDate(t.scheduled_for)} · ${formatWallTime(t.scheduled_for)}${t.scheduled_end ? ` → ${formatWallTime(t.scheduled_end)}` : ""}`
                              : t.recurrence_date
                                ? `${formatWallDate(t.recurrence_date)} · Sem horário definido`
                                : "Sem horário definido"}
                          </div>
                          <button disabled className="mt-1 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground opacity-60">
                            <Lock className="h-3 w-3" /> Iniciar (bloqueado)
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
