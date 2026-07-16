/**
 * Diálogo de criação de ticket. Reutilizado por:
 *  - página /app/suporte (botão "Novo ticket")
 *  - botão global "Reportar problema" no header do AppLayout
 *
 * Segue as regras: max-height, header/footer fixos, scroll central.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { AlertCircle, Loader2, Paperclip, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import {
  ALLOWED_ATTACHMENT_MIME,
  MAX_ATTACHMENT_SIZE_BYTES,
  TICKET_PRIORITY_LABEL,
  TICKET_PRIORITY_LIST,
  TICKET_TYPE_LABEL,
  TICKET_TYPE_LIST,
  type SupportTicketPriority,
  type SupportTicketType,
} from "@/lib/support/constants";
import {
  collectTechnicalContext,
  createTicket,
  uploadAttachment,
} from "@/lib/support/tickets";
import { invalidateSupportCache } from "@/lib/cache/support";

const schema = z.object({
  type: z.string().min(1),
  priority: z.string().min(1),
  title: z.string().trim().min(3, "Mínimo 3 caracteres").max(200),
  description: z.string().trim().min(5, "Mínimo 5 caracteres").max(10000),
  module: z.string().max(120).optional(),
});

export interface NewTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preenche automaticamente o campo módulo (ex.: "Tarefas"). */
  defaultModule?: string;
  /** Preenche automaticamente o tipo (ex.: "erro"). */
  defaultType?: SupportTicketType;
  /** Título sugerido (ex.: "Reportar problema em Tarefas"). */
  defaultTitle?: string;
}

export function NewTicketDialog({
  open,
  onOpenChange,
  defaultModule,
  defaultType,
  defaultTitle,
}: NewTicketDialogProps) {
  const { currentCompanyId } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const route = useRouterState({ select: (s) => s.location.pathname });

  const [type, setType] = useState<SupportTicketType>(defaultType ?? "duvida");
  const [priority, setPriority] = useState<SupportTicketPriority>("normal");
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [description, setDescription] = useState("");
  const [module, setModule] = useState(defaultModule ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const pageUrl = useMemo(
    () => (typeof window !== "undefined" ? window.location.href : ""),
    [open],
  );

  useEffect(() => {
    if (open) {
      setType(defaultType ?? "duvida");
      setPriority("normal");
      setTitle(defaultTitle ?? "");
      setDescription("");
      setModule(defaultModule ?? "");
      setFiles([]);
      setFormError(null);
    }
  }, [open, defaultType, defaultTitle, defaultModule]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!currentCompanyId) throw new Error("Nenhuma empresa selecionada.");
      const parsed = schema.safeParse({ type, priority, title, description, module });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      }
      const ticket = await createTicket({
        companyId: currentCompanyId,
        type,
        priority,
        title: parsed.data.title,
        description: parsed.data.description,
        module: parsed.data.module || null,
        route,
        pageUrl,
        technicalContext: collectTechnicalContext(),
      });
      // Upload dos anexos (sequencial para simplificar)
      for (const file of files) {
        await uploadAttachment(ticket.id, currentCompanyId, file);
      }
      return ticket;
    },
    onSuccess: (ticket) => {
      invalidateSupportCache(qc);
      toast.success(`Ticket ${ticket.ticket_number} criado.`);
      onOpenChange(false);
      nav({ to: "/app/suporte/$id", params: { id: ticket.id } }).catch(() => {
        nav({ to: "/app/suporte" });
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(msg);
      toast.error("Falha ao criar ticket: " + msg);
    },
  });

  const onFileChange = (list: FileList | null) => {
    if (!list) return;
    const arr: File[] = [];
    for (const f of Array.from(list)) {
      if (!ALLOWED_ATTACHMENT_MIME.has(f.type)) {
        toast.error(`Tipo não permitido: ${f.name}`);
        continue;
      }
      if (f.size > MAX_ATTACHMENT_SIZE_BYTES) {
        toast.error(`Arquivo grande demais: ${f.name}`);
        continue;
      }
      arr.push(f);
    }
    setFiles((prev) => [...prev, ...arr].slice(0, 5));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle>Nova solicitação de suporte</DialogTitle>
          <DialogDescription>
            Envie diretamente para a equipe do OmniBiz. Preencha o máximo de detalhes possível.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {!currentCompanyId && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <span>Selecione uma empresa antes de abrir um ticket.</span>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo do pedido</Label>
              <Select value={type} onValueChange={(v) => setType(v as SupportTicketType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_TYPE_LIST.map((t) => (
                    <SelectItem key={t} value={t}>{TICKET_TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as SupportTicketPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITY_LIST.map((p) => (
                    <SelectItem key={p} value={p}>{TICKET_PRIORITY_LABEL[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Resuma o problema em uma frase"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição detalhada</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              maxLength={10000}
              placeholder="O que aconteceu? O que você tentou fazer? Qual era o resultado esperado?"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Módulo afetado (opcional)</Label>
            <Input
              value={module}
              onChange={(e) => setModule(e.target.value)}
              maxLength={120}
              placeholder="Ex.: Tarefas, Folha de ponto, Frota"
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">Contexto técnico enviado automaticamente</div>
            <div>Rota atual: <span className="font-mono">{route || "-"}</span></div>
            <div className="truncate">URL: <span className="font-mono">{pageUrl || "-"}</span></div>
            <div>Nenhuma senha, token ou dado sensível é enviado.</div>
          </div>

          <div className="space-y-2">
            <Label>Anexos (imagem, PDF, documento — até 20 MB, máx. 5)</Label>
            <input
              type="file"
              multiple
              accept={Array.from(ALLOWED_ATTACHMENT_MIME).join(",")}
              onChange={(e) => onFileChange(e.target.files)}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-primary hover:file:bg-primary/20"
            />
            {files.length > 0 && (
              <ul className="space-y-1">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between rounded border border-border bg-background px-2 py-1 text-xs"
                  >
                    <span className="flex items-center gap-2">
                      <Paperclip className="h-3 w-3" /> {f.name}
                      <span className="text-muted-foreground">
                        ({(f.size / 1024).toFixed(0)} KB)
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label="Remover"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {formError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {formError}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-6 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !currentCompanyId}
          >
            {mutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando…</>
            ) : (
              "Enviar solicitação"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}