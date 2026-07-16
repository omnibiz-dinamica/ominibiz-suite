import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Paperclip,
  Shield,
  RotateCcw,
} from "lucide-react";
import {
  TICKET_PRIORITY_LABEL,
  TICKET_PRIORITY_LIST,
  TICKET_PRIORITY_TONE,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_LIST,
  TICKET_STATUS_TONE,
  TICKET_TYPE_LABEL,
  ticketReopenableByManager,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from "@/lib/support/constants";
import {
  postMessage,
  reopenTicket,
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

function SupportDetailPage() {
  const { id } = useParams({ from: "/app/suporte/$id" });
  const { user, isSuperAdmin, currentCompanyId } = useAuth();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const ticketQ = useQuery<TicketDetail | null>({
    queryKey: ["support-ticket", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("id", id)
        .maybeSingle();
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

  const reopenMut = useMutation({
    mutationFn: async () => {
      const reason = window.prompt("Motivo para reabrir o ticket?") ?? "";
      if (!reason.trim()) throw new Error("Motivo obrigatório");
      await reopenTicket(id, reason);
    },
    onSuccess: () => {
      invalidateSupportTicket(qc, id);
      toast.success("Ticket reaberto.");
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

  if (ticketQ.isLoading) {
    return <div className="text-sm text-muted-foreground">Carregando…</div>;
  }
  const t = ticketQ.data;
  if (!t) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <h2 className="font-display text-xl font-semibold">Ticket não encontrado</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ele pode ter sido movido ou pertence a outra empresa.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/app/suporte"><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Link>
        </Button>
      </div>
    );
  }

  const messages = messagesQ.data ?? [];
  const events = eventsQ.data ?? [];
  const attachments = attachmentsQ.data ?? [];
  const canReopen =
    isSuperAdmin ||
    (["fechado", "resolvido", "rejeitado"].includes(t.status) &&
      ticketReopenableByManager(t.closed_at ?? t.resolved_at));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="flex items-center gap-2 text-sm">
          <Button asChild variant="ghost" size="sm">
            <Link to="/app/suporte"><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Link>
          </Button>
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
          </div>
          <h1 className="mt-2 font-display text-xl font-semibold">{t.title}</h1>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{t.description}</p>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div><dt>Aberto</dt><dd>{new Date(t.created_at).toLocaleString("pt-PT")}</dd></div>
            <div><dt>Atualizado</dt><dd>{new Date(t.updated_at).toLocaleString("pt-PT")}</dd></div>
            {t.module && <div><dt>Módulo</dt><dd>{t.module}</dd></div>}
            {t.route && <div><dt>Rota</dt><dd className="font-mono">{t.route}</dd></div>}
          </dl>
        </header>

        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Conversa
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

          {!["fechado"].includes(t.status) && (
            <div className="space-y-2 rounded-xl border border-border bg-card p-3">
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
                <Button
                  onClick={() => replyMut.mutate()}
                  disabled={replyMut.isPending || !reply.trim()}
                >
                  {replyMut.isPending ? (
                    <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Enviando</>
                  ) : (
                    "Enviar"
                  )}
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Timeline
          </h2>
          <ul className="space-y-1 rounded-xl border border-border bg-card p-3 text-xs">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {new Date(e.created_at).toLocaleString("pt-PT")}
                </span>
                <span className="font-mono">{e.event_type}</span>
              </li>
            ))}
          </ul>
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
              <Select
                value={t.status}
                onValueChange={(v) => statusMut.mutate(v as SupportTicketStatus)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_STATUS_LIST.map((s) => (
                    <SelectItem key={s} value={s}>{TICKET_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Prioridade</label>
              <Select
                value={t.priority}
                onValueChange={(v) => priorityMut.mutate(v as SupportTicketPriority)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITY_LIST.map((p) => (
                    <SelectItem key={p} value={p}>{TICKET_PRIORITY_LABEL[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Anexos
            </h3>
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
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => openAttachment(a.storage_path)}
                    className="flex w-full items-center gap-2 rounded border border-border bg-background px-2 py-1 text-left text-xs hover:border-primary/50"
                  >
                    <Paperclip className="h-3 w-3" />
                    <span className="min-w-0 flex-1 truncate">{a.file_name}</span>
                    <span className="text-muted-foreground">
                      {(a.size_bytes / 1024).toFixed(0)} KB
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {canReopen && ["fechado", "resolvido", "rejeitado"].includes(t.status) && (
          <Button variant="outline" className="w-full" onClick={() => reopenMut.mutate()}>
            <RotateCcw className="mr-1 h-4 w-4" /> Reabrir ticket
          </Button>
        )}
      </aside>
    </div>
  );
}