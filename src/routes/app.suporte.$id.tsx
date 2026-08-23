import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ReopenTicketDialog } from "@/components/support/ReopenTicketDialog";
import { ArchiveTicketDialog } from "@/components/support/ArchiveTicketDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Paperclip,
  Shield,
  RotateCcw,
  Copy,
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  Zap,
  Archive,
} from "lucide-react";
import {
  EVENT_TYPE_LABEL,
  QUICK_REPLIES,
  TICKET_PRIORITY_LABEL,
  TICKET_PRIORITY_LIST,
  TICKET_PRIORITY_TONE,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_LIST,
  TICKET_STATUS_TONE,
  TICKET_TYPE_LABEL,
  isClosedTicketStatus,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from "@/lib/support/constants";
import {
  postMessage,
  
  reopenTicketWithMessage,
  signedAttachmentUrl,
  updatePriority,
  updateStatus,
  uploadAttachment,
} from "@/lib/support/tickets";
import { invalidateSupportTicket } from "@/lib/cache/support";
import { useRealtimeInvalidate } from "@/lib/realtime/subscribe";

export const Route = createFileRoute("/app/suporte/$id")({
  component: () => (
    <RoleGuard allow={["super_admin", "owner", "manager"]}>
      <SupportDetailPage />
    </RoleGuard>
  ),
});

type TicketDetail = {
  id: string;
  ticket_number: string;
  company_id: string;
  requester_user_id: string;
  assigned_user_id: string | null;
  type: string;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  title: string;
  description: string;
  module: string | null;
  route: string | null;
  page_url: string | null;
  technical_context: Record<string, unknown>;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  author_user_id: string;
  message: string;
  is_internal: boolean;
  created_at: string;
};

type EventRow = {
  id: string;
  actor_user_id: string | null;
  event_type: string;
  before_data: unknown;
  after_data: unknown;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type AttachmentRow = {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

type RequesterInfo = {
  requester_user_id: string;
  requester_full_name: string | null;
  requester_email: string | null;
  company_id: string;
  company_name: string | null;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentThumb({ att, onOpen }: { att: AttachmentRow; onOpen: (a: AttachmentRow) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = att.mime_type.startsWith("image/");
  const isPdf = att.mime_type === "application/pdf";
  useEffect(() => {
    if (!isImage && !isPdf) return;
    let alive = true;
    signedAttachmentUrl(att.storage_path, 900)
      .then((u) => alive && setUrl(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [att.storage_path, isImage, isPdf]);
  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-background">
      <button type="button" onClick={() => onOpen(att)} className="block w-full" title="Abrir em nova aba">
        {isImage && url ? (
          <img src={url} alt={att.file_name} className="h-32 w-full object-cover" />
        ) : isPdf ? (
          <div className="flex h-32 w-full items-center justify-center bg-muted">
            <FileText className="h-10 w-10 text-muted-foreground" />
          </div>
        ) : (
          <div className="flex h-32 w-full items-center justify-center bg-muted">
            <Paperclip className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
      </button>
      <div className="flex items-center justify-between gap-1 border-t border-border p-2 text-[11px]">
        <span className="min-w-0 flex-1 truncate" title={att.file_name}>
          {att.file_name}
        </span>
        <span className="text-muted-foreground">{formatBytes(att.size_bytes)}</span>
      </div>
      <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button type="button" onClick={() => onOpen(att)} className="rounded bg-background/90 p-1 shadow" title="Abrir">
          <ExternalLink className="h-3 w-3" />
        </button>
        <a
          href={url ?? "#"}
          download={att.file_name}
          onClick={(e) => {
            if (!url) e.preventDefault();
          }}
          className="rounded bg-background/90 p-1 shadow"
          title="Download"
        >
          <Download className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

function SupportDetailPage() {
  const { id } = useParams({ from: "/app/suporte/$id" });
  const { user, isSuperAdmin } = useAuth();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const ticketQ = useQuery<TicketDetail | null>({
    queryKey: ["support-ticket", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("support_tickets").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as TicketDetail | null;
    },
  });

  const messagesQ = useQuery<MessageRow[]>({
    queryKey: ["support-ticket-messages", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_ticket_messages")
        .select("id, author_user_id, message, is_internal, created_at")
        .eq("ticket_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });

  const eventsQ = useQuery<EventRow[]>({
    queryKey: ["support-ticket-events", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_ticket_events")
        .select("id, actor_user_id, event_type, before_data, after_data, metadata, created_at")
        .eq("ticket_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  const attachmentsQ = useQuery<AttachmentRow[]>({
    queryKey: ["support-ticket-attachments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_ticket_attachments")
        .select("id, storage_path, file_name, mime_type, size_bytes, created_at")
        .eq("ticket_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AttachmentRow[];
    },
  });

  const requesterQ = useQuery<RequesterInfo | null>({
    queryKey: ["support-ticket-requester", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_support_ticket_requester_info", {
        _ticket_id: id,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as RequesterInfo | null;
    },
  });

  const ticket = ticketQ.data ?? null;

  /** Papéis da empresa (para saber se o solicitante é Funcionário e listar funcionários ativos). */
  const rolesQ = useQuery<{ user_id: string; role: string }[]>({
    queryKey: ["support-company-roles", ticket?.company_id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("company_id", ticket!.company_id);
      if (error) throw error;
      return (data ?? []) as { user_id: string; role: string }[];
    },
    enabled: !!ticket?.company_id,
  });

  const employeeIds = useMemo(
    () => (rolesQ.data ?? []).filter((r) => r.role === "employee").map((r) => r.user_id),
    [rolesQ.data],
  );

  const employeesQ = useQuery<{ id: string; full_name: string | null; job_title: string | null }[]>({
    queryKey: ["support-company-employees", ticket?.company_id ?? null, employeeIds.length],
    queryFn: async () => {
      if (employeeIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, job_title, is_active")
        .in("id", employeeIds);
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((p) => p.is_active !== false)
        .map((p) => ({ id: p.id, full_name: p.full_name, job_title: p.job_title }));
    },
    enabled: employeeIds.length > 0,
  });

  const requesterIsEmployee = useMemo(() => {
    if (!ticket || !rolesQ.data) return false;
    const roles = rolesQ.data.filter((r) => r.user_id === ticket.requester_user_id).map((r) => r.role);
    if (roles.length === 0) return false;
    return roles.every((r) => r === "employee");
  }, [ticket, rolesQ.data]);

  useRealtimeInvalidate({
    channel: `support-detail-${id}`,
    table: "support_tickets",
    filter: `id=eq.${id}`,
    queryClient: qc,
    invalidate: (c) => invalidateSupportTicket(c, id),
  });
  useRealtimeInvalidate({
    channel: `support-msg-${id}`,
    table: "support_ticket_messages",
    filter: `ticket_id=eq.${id}`,
    queryClient: qc,
    invalidate: (c) => invalidateSupportTicket(c, id),
  });
  useRealtimeInvalidate({
    channel: `support-ev-${id}`,
    table: "support_ticket_events",
    filter: `ticket_id=eq.${id}`,
    queryClient: qc,
    invalidate: (c) => invalidateSupportTicket(c, id),
  });

  const replyMut = useMutation({
    mutationFn: async () => {
      if (!reply.trim()) throw new Error("Mensagem vazia");
      await postMessage(id, reply, isInternal);
    },
    onSuccess: () => {
      setReply("");
      setIsInternal(false);
      invalidateSupportTicket(qc, id);
      toast.success("Mensagem enviada.");
    },
    onError: (e) => toast.error("Erro: " + (e as Error).message),
  });

  const statusMut = useMutation({
    mutationFn: async (s: SupportTicketStatus) => updateStatus(id, s),
    onSuccess: () => {
      invalidateSupportTicket(qc, id);
      toast.success("Status atualizado.");
    },
    onError: (e) => toast.error("Erro: " + (e as Error).message),
  });

  const priorityMut = useMutation({
    mutationFn: async (p: SupportTicketPriority) => updatePriority(id, p),
    onSuccess: () => {
      invalidateSupportTicket(qc, id);
      toast.success("Prioridade atualizada.");
    },
    onError: (e) => toast.error("Erro: " + (e as Error).message),
  });


  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const t = ticketQ.data;
      if (!t) throw new Error("Ticket não carregado");
      await uploadAttachment(id, t.company_id, file);
    },
    onSuccess: () => {
      invalidateSupportTicket(qc, id);
      toast.success("Anexo enviado.");
    },
    onError: (e) => toast.error("Erro no upload: " + (e as Error).message),
  });

  async function openAttachment(path: string) {
    try {
      const url = await signedAttachmentUrl(path);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error("Falha ao abrir anexo: " + (e as Error).message);
    }
  }

  async function downloadAttachment(att: AttachmentRow) {
    try {
      const url = await signedAttachmentUrl(att.storage_path, 300);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.file_name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error("Falha ao baixar: " + (e as Error).message);
    }
  }

  function copyText(text: string, label = "Copiado") {
    navigator.clipboard.writeText(text).then(
      () => toast.success(label),
      () => toast.error("Não foi possível copiar"),
    );
  }

  if (ticketQ.isLoading) {
    return <div className="text-sm text-muted-foreground">Carregando…</div>;
  }
  const t = ticket;
  if (!t) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <h2 className="font-display text-xl font-semibold">Ticket não encontrado</h2>
        <p className="mt-1 text-sm text-muted-foreground">Ele pode ter sido movido ou pertence a outra empresa.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/app/suporte">
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
          </Link>
        </Button>
      </div>
    );
  }

  const messages = messagesQ.data ?? [];
  const events = eventsQ.data ?? [];
  const attachments = attachmentsQ.data ?? [];
  const requester = requesterQ.data ?? null;
  const tech = (t.technical_context ?? {}) as Record<string, unknown>;
  const techEntries: [string, string][] = [
    ["Build", String(tech.build ?? "—")],
    ["Commit", String(tech.commit ?? "—")],
    ["Ambiente", String(tech.build ?? "").includes("dev") ? "Preview/Dev" : "Produção"],
    ["Navegador", String(tech.user_agent ?? "—")],
    ["Plataforma", String(tech.platform ?? "—")],
    ["Idioma", String(tech.language ?? "—")],
    ["Resolução", String(tech.screen ?? "—")],
    ["Viewport", String(tech.viewport ?? "—")],
    ["Timezone", String(tech.timezone ?? "—")],
  ];
  const isClosed = isClosedTicketStatus(t.status);

  // Timeline unificada: eventos + mensagens (mensagens internas apenas para SA).
  const timeline = [
    ...events.map((e) => ({
      kind: "event" as const,
      id: `e-${e.id}`,
      at: e.created_at,
      label: EVENT_TYPE_LABEL[e.event_type] ?? e.event_type,
      meta: e,
    })),
    ...messages
      .filter((m) => isSuperAdmin || !m.is_internal)
      .map((m) => ({
        kind: "message" as const,
        id: `m-${m.id}`,
        at: m.created_at,
        label: m.is_internal ? "Nota interna" : "Mensagem",
        meta: m,
      })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="flex items-center gap-2 text-sm">
          <Button asChild variant="ghost" size="sm">
            <Link to="/app/suporte">
              <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
            </Link>
          </Button>
          {isSuperAdmin && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/admin/suporte">Central Global</Link>
            </Button>
          )}
        </div>

        <header className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono text-muted-foreground">{t.ticket_number}</span>
            <span className={"rounded px-1.5 py-0.5 " + TICKET_STATUS_TONE[t.status]}>
              {TICKET_STATUS_LABEL[t.status]}
            </span>
            <span className={"rounded px-1.5 py-0.5 " + TICKET_PRIORITY_TONE[t.priority]}>
              {TICKET_PRIORITY_LABEL[t.priority]}
            </span>
            <span className="text-muted-foreground">
              {TICKET_TYPE_LABEL[t.type as keyof typeof TICKET_TYPE_LABEL] ?? t.type}
            </span>
            <button
              type="button"
              onClick={() => copyText(t.ticket_number, "Número copiado")}
              className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              title="Copiar número"
            >
              <Copy className="h-3 w-3" /> copiar nº
            </button>
          </div>
          <div className="mt-3 flex items-start justify-between gap-2">
            <h1 className="font-display text-xl font-semibold">{t.title}</h1>
            <button
              type="button"
              onClick={() => copyText(`${t.title}\n\n${t.description}`, "Título e descrição copiados")}
              className="shrink-0 rounded border border-border p-1.5 text-muted-foreground hover:text-foreground"
              title="Copiar título + descrição"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground/90 selection:bg-primary/20">
            {t.description}
          </p>

          <div className="mt-4 grid gap-3 rounded-xl border border-border bg-muted/30 p-3 text-xs sm:grid-cols-2">
            <Row label="Empresa">{requester?.company_name ?? <span className="text-muted-foreground">—</span>}</Row>
            <Row label="Solicitante">
              {requester?.requester_full_name ?? <span className="text-muted-foreground">—</span>}
            </Row>
            <Row label="Email">
              {requester?.requester_email ? (
                <span className="inline-flex items-center gap-1">
                  <a href={`mailto:${requester.requester_email}`} className="hover:underline">
                    {requester.requester_email}
                  </a>
                  <button type="button" onClick={() => copyText(requester.requester_email!, "Email copiado")}>
                    <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Row>
            <Row label="Aberto em">{new Date(t.created_at).toLocaleString("pt-PT")}</Row>
            <Row label="Última atualização">{new Date(t.updated_at).toLocaleString("pt-PT")}</Row>
            {t.resolved_at && <Row label="Resolvido em">{new Date(t.resolved_at).toLocaleString("pt-PT")}</Row>}
            {t.closed_at && <Row label="Fechado em">{new Date(t.closed_at).toLocaleString("pt-PT")}</Row>}
          </div>

          <div className="mt-3 grid gap-3 rounded-xl border border-border bg-muted/20 p-3 text-xs sm:grid-cols-2">
            <div className="sm:col-span-2 font-display text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Local do erro
            </div>
            {t.module && <Row label="Módulo">{t.module}</Row>}
            {t.route && (
              <Row label="Rota">
                <code className="rounded bg-background px-1">{t.route}</code>
              </Row>
            )}
            {t.page_url && (
              <Row label="URL">
                <span className="inline-flex min-w-0 items-center gap-1">
                  <a
                    href={t.page_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="min-w-0 truncate hover:underline"
                  >
                    {t.page_url}
                  </a>
                  <button type="button" onClick={() => copyText(t.page_url!, "URL copiada")}>
                    <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                </span>
              </Row>
            )}
          </div>

          <details className="mt-3 rounded-xl border border-border bg-muted/20 p-3 text-xs">
            <summary className="cursor-pointer font-display text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Informações técnicas
            </summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {techEntries.map(([k, v]) => (
                <Row key={k} label={k}>
                  <span className="break-all">{v}</span>
                </Row>
              ))}
            </div>
            <button
              type="button"
              onClick={() => copyText(JSON.stringify(tech, null, 2), "Contexto técnico copiado")}
              className="mt-3 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-3 w-3" /> copiar JSON
            </button>
          </details>
        </header>

        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Conversa {messages.length > 0 && <span className="text-xs text-muted-foreground">({messages.length})</span>}
          </h2>
          {messages.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</div>
          ) : (
            <ul className="space-y-2">
              {messages
                .filter((m) => isSuperAdmin || !m.is_internal)
                .map((m) => {
                  const isMe = m.author_user_id === user?.id;
                  return (
                    <li
                      key={m.id}
                      className={
                        "rounded-xl border p-3 text-sm " +
                        (m.is_internal
                          ? "border-amber-500/40 bg-amber-500/10"
                          : isMe
                            ? "border-primary/40 bg-primary/5"
                            : "border-border bg-card")
                      }
                    >
                      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{new Date(m.created_at).toLocaleString("pt-PT")}</span>
                        <span>·</span>
                        <span>
                          {isMe
                            ? "Você"
                            : m.author_user_id === requester?.requester_user_id
                              ? (requester?.requester_full_name ?? "Solicitante")
                              : "Suporte"}
                        </span>
                        {m.is_internal && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
                            <Shield className="h-3 w-3" /> Nota interna
                          </span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap">{m.message}</p>
                    </li>
                  );
                })}
            </ul>
          )}

          {isClosed ? (
            <div className="space-y-2 rounded-xl border border-dashed border-border bg-card p-3">
              <p className="text-sm text-muted-foreground">
                Este ticket está encerrado. Para responder, reabra o ticket e escolha o destino.
              </p>
              <Button variant="outline" onClick={() => setReopenOpen(true)}>
                <RotateCcw className="mr-1 h-4 w-4" /> Responder / reabrir
              </Button>
            </div>
          ) : (
            <div className="space-y-2 rounded-xl border border-border bg-card p-3">
              {isSuperAdmin && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Zap className="h-3 w-3" /> Respostas rápidas:
                  </span>
                  {QUICK_REPLIES.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      onClick={() => setReply((r) => (r ? `${r}\n\n${q.text}` : q.text))}
                      className="rounded border border-border bg-background px-2 py-0.5 text-[11px] hover:border-primary/50"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              )}
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Escreva uma resposta…"
                rows={4}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                {isSuperAdmin ? (
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={isInternal} onCheckedChange={setIsInternal} />
                    Nota interna (não visível ao Gestor)
                  </label>
                ) : (
                  <span />
                )}
                <Button onClick={() => replyMut.mutate()} disabled={replyMut.isPending || !reply.trim()}>
                  {replyMut.isPending ? (
                    <>
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Enviando
                    </>
                  ) : (
                    "Enviar"
                  )}
                </Button>
              </div>
            </div>
          )}
        </section>

        {attachments.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Anexos ({attachments.length})
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {attachments.map((a) => (
                <AttachmentThumb key={a.id} att={a} onOpen={(x) => openAttachment(x.storage_path)} />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h2>
          <ol className="relative space-y-2 border-l border-border pl-4 text-xs">
            {timeline.map((it) => (
              <li key={it.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                <div className="flex flex-wrap items-baseline gap-2">
                  <time className="font-mono text-muted-foreground">{new Date(it.at).toLocaleString("pt-PT")}</time>
                  <span className="font-medium">{it.label}</span>
                </div>
                {it.kind === "message" && (
                  <p className="mt-0.5 line-clamp-2 text-muted-foreground">{(it.meta as MessageRow).message}</p>
                )}
              </li>
            ))}
            {timeline.length === 0 && <li className="text-muted-foreground">Sem eventos ainda.</li>}
          </ol>
        </section>
      </div>

      <aside className="space-y-4">
        {isSuperAdmin && (
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Ações do Super Admin
            </h3>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={t.status} onValueChange={(v) => statusMut.mutate(v as SupportTicketStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_STATUS_LIST.map((s) => (
                    <SelectItem key={s} value={s}>
                      {TICKET_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Prioridade</label>
              <Select value={t.priority} onValueChange={(v) => priorityMut.mutate(v as SupportTicketPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITY_LIST.map((p) => (
                    <SelectItem key={p} value={p}>
                      {TICKET_PRIORITY_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">Anexos</h3>
            <label className="cursor-pointer text-xs text-primary hover:underline">
              + Adicionar
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadMut.mutate(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {attachments.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum anexo.</p>
          ) : (
            <ul className="space-y-1">
              {attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  {a.mime_type.startsWith("image/") ? (
                    <ImageIcon className="h-3 w-3 shrink-0" />
                  ) : (
                    <Paperclip className="h-3 w-3 shrink-0" />
                  )}
                  <button
                    type="button"
                    onClick={() => openAttachment(a.storage_path)}
                    className="min-w-0 flex-1 truncate text-left hover:underline"
                    title={a.file_name}
                  >
                    {a.file_name}
                  </button>
                  <span className="text-muted-foreground">{formatBytes(a.size_bytes)}</span>
                  <button
                    type="button"
                    onClick={() => downloadAttachment(a)}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    title="Download"
                  >
                    <Download className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {isClosed && (
          <Button variant="outline" className="w-full" onClick={() => setReopenOpen(true)}>
            <RotateCcw className="mr-1 h-4 w-4" /> Reabrir ticket
          </Button>
        )}

        {ARCHIVABLE_STATUSES.includes(t.status) && (
          <Button className="w-full" onClick={() => setArchiveOpen(true)}>
            <Archive className="mr-1 h-4 w-4" /> Arquivar ticket
          </Button>
        )}
      </aside>

      <ReopenTicketDialog
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        ticket={{ id: t.id, ticket_number: t.ticket_number, title: t.title, status: t.status }}
        requesterIsEmployee={requesterIsEmployee}
        requesterName={requesterQ.data?.requester_full_name ?? requesterQ.data?.requester_email ?? null}
        employees={employeesQ.data ?? []}
        onDone={() => invalidateSupportTicket(qc, id)}
      />

      <ArchiveTicketDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        ticket={{ id: t.id, ticket_number: t.ticket_number, title: t.title, status: t.status }}
        onDone={() => invalidateSupportTicket(qc, id)}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-medium text-foreground">{children}</dd>
    </div>
  );
}
