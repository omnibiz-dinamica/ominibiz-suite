/**
 * OmniBiz — Modal canónico de Recuperação de Ponto Aberto.
 *
 * Usado pelo Funcionário (quando um ponto anterior bloqueia o início de outra
 * tarefa) e pelo Gestor (secção "Pontos em aberto" na Folha de Ponto · Gestão).
 *
 * Nunca fecha ponto silenciosamente: hora de saída + motivo são obrigatórios e
 * ficam registados em auditoria pela RPC `punch_recover_open_entry`.
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, ModalBody, ModalFooter, ModalHeader, ModalSection } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlarmClockCheck, ArrowRight, LifeBuoy, TimerReset } from "lucide-react";
import { toast } from "sonner";
import {
  EMPLOYEE_REASONS,
  MANAGER_REASONS,
  formatOpenDuration,
  isoToLocalInput,
  localInputToIso,
  openMinutesFrom,
  recoverOpenEntry,
  requestOpenEntryHelp,
} from "@/lib/punch/recovery";

export interface RecoveryEntry {
  time_entry_id: string;
  task_id: string | null;
  task_title: string | null;
  task_status?: string | null;
  client_name: string | null;
  company_name?: string | null;
  started_at: string;
  notes?: string | null;
  user_name?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "employee" | "manager";
  entry: RecoveryEntry | null;
  /** Tarefa que o funcionário tentou iniciar (contexto do pedido de ajuda). */
  attemptedTaskId?: string | null;
  /** Funcionário: "Voltar para esta tarefa". */
  onGoToEntry?: () => void;
  onResolved?: () => void;
  /**
   * SUP-2026-000074 — regularizar E concluir a tarefa no mesmo ato
   * (usado quando o gestor tenta concluir uma tarefa com ponto esquecido).
   */
  completeTask?: boolean;
}

type Step = "choose" | "form" | "confirm";

export function OpenPunchRecoveryDialog({
  open,
  onOpenChange,
  mode,
  entry,
  attemptedTaskId,
  onGoToEntry,
  onResolved,
}: Props) {
  const reasons = mode === "manager" ? MANAGER_REASONS : EMPLOYEE_REASONS;
  const [step, setStep] = useState<Step>(mode === "manager" ? "form" : "choose");
  const [endedAt, setEndedAt] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(mode === "manager" ? "form" : "choose");
    setEndedAt(isoToLocalInput(new Date().toISOString()));
    setReasonCode("");
    setReasonText("");
    setBusy(false);
  }, [open, mode, entry?.time_entry_id]);

  const openMinutes = entry ? openMinutesFrom(entry.started_at) : 0;
  const computed = useMemo(() => {
    if (!entry || !endedAt) return null;
    const end = new Date(endedAt).getTime();
    const start = new Date(entry.started_at).getTime();
    if (Number.isNaN(end)) return null;
    return Math.round((end - start) / 60000);
  }, [entry, endedAt]);

  if (!entry) return null;

  const reasonRequiresText = reasonCode === "outro" || mode === "manager";
  const canSubmit =
    !!endedAt &&
    !!reasonCode &&
    (!reasonRequiresText || reasonText.trim().length >= 3) &&
    computed != null &&
    computed >= 0;

  const validateLocal = (): string | null => {
    if (!endedAt) return "Informe a hora real de saída.";
    if (computed == null) return "Hora de saída inválida.";
    if (computed < 0) return "A hora de saída não pode ser anterior à hora de entrada.";
    if (new Date(endedAt).getTime() > Date.now() + 5 * 60_000)
      return "A hora de saída não pode ser no futuro.";
    if (!reasonCode) return "Selecione o motivo.";
    if (reasonRequiresText && reasonText.trim().length < 3)
      return mode === "manager" ? "Escreva a observação do gestor." : "Descreva o motivo.";
    return null;
  };

  const submit = async () => {
    const err = validateLocal();
    if (err) {
      toast.error(err);
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const res = await recoverOpenEntry({
        timeEntryId: entry.time_entry_id,
        endedAtIso: localInputToIso(endedAt),
        reasonCode,
        reasonText: reasonText.trim() || null,
        completeTask: false,
      });
      if (!res.success) {
        toast.error(res.message ?? res.code);
        setStep("form");
        return;
      }
      toast.success(res.message ?? "Ponto regularizado.");
      onOpenChange(false);
      onResolved?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const askHelp = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await requestOpenEntryHelp({
        timeEntryId: entry.time_entry_id,
        attemptedTaskId: attemptedTaskId ?? null,
      });
      if (res.success) {
        toast.success(res.message ?? "Pedido enviado ao gestor.");
        onOpenChange(false);
      } else {
        toast.error(res.message ?? res.code);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const details = (
    <ModalSection title="Registo em aberto">
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        {mode === "manager" && entry.user_name ? (
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Funcionário</dt>
            <dd className="truncate font-medium">{entry.user_name}</dd>
          </div>
        ) : null}
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Tarefa</dt>
          <dd className="truncate font-medium">{entry.task_title ?? "Sem título"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Cliente</dt>
          <dd className="truncate">{entry.client_name ?? "—"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Entrada registada</dt>
          <dd className="font-mono">{new Date(entry.started_at).toLocaleString("pt-PT")}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Tempo em aberto</dt>
          <dd className="font-mono">{formatOpenDuration(openMinutes)}</dd>
        </div>
        {entry.task_status ? (
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Estado da tarefa</dt>
            <dd className="truncate">{entry.task_status}</dd>
          </div>
        ) : null}
        {entry.company_name ? (
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Empresa</dt>
            <dd className="truncate">{entry.company_name}</dd>
          </div>
        ) : null}
        {entry.notes ? (
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Observação</dt>
            <dd className="break-words">{entry.notes}</dd>
          </div>
        ) : null}
      </dl>
    </ModalSection>
  );

  const form = (
    <ModalSection
      title={mode === "manager" ? "Hora correta de saída" : "Hora real de saída"}
      description="A duração é recalculada a partir da hora informada. Nada é fechado sem motivo registado."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <Label className="text-xs">Data e hora de saída *</Label>
          <Input
            type="datetime-local"
            value={endedAt}
            onChange={(e) => setEndedAt(e.target.value)}
            max={isoToLocalInput(new Date().toISOString())}
          />
        </div>
        <div className="min-w-0">
          <Label className="text-xs">Motivo *</Label>
          <Select value={reasonCode} onValueChange={setReasonCode}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o motivo" />
            </SelectTrigger>
            <SelectContent>
              {reasons.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {reasonRequiresText ? (
          <div className="min-w-0 sm:col-span-2">
            <Label className="text-xs">
              {mode === "manager" ? "Observação do gestor *" : "Descreva o motivo *"}
            </Label>
            <Textarea
              rows={3}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder={mode === "manager" ? "Contexto da regularização" : "O que aconteceu?"}
            />
          </div>
        ) : null}
        {computed != null ? (
          <div className="sm:col-span-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Tempo calculado:{" "}
            <span className="font-mono text-foreground">
              {computed < 0 ? "inválido" : formatOpenDuration(computed)}
            </span>
          </div>
        ) : null}
      </div>
    </ModalSection>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <ModalHeader
          icon={mode === "manager" ? AlarmClockCheck : TimerReset}
          title={mode === "manager" ? "Regularizar ponto do funcionário" : "Você possui um ponto em aberto"}
          description={
            mode === "manager"
              ? "Encerre o registo informando a hora correta de saída e o motivo. Tudo fica auditado."
              : "Resolva o registo anterior para poder iniciar uma nova tarefa."
          }
        />
        <ModalBody className="space-y-4">
          {details}
          {step === "choose" ? (
            <ModalSection title="O que deseja fazer?">
              <div className="grid grid-cols-1 gap-2">
                <Button
                  variant="outline"
                  className="justify-between"
                  onClick={() => {
                    onOpenChange(false);
                    onGoToEntry?.();
                  }}
                >
                  <span className="text-left">
                    Voltar para esta tarefa
                    <span className="block text-xs font-normal text-muted-foreground">
                      Continuar a execução (pausar, retomar ou concluir)
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </Button>
                <Button className="justify-between" onClick={() => setStep("form")}>
                  <span className="text-left">
                    Encerrar ponto anterior
                    <span className="block text-xs font-normal opacity-80">
                      Informar a hora real de saída e o motivo
                    </span>
                  </span>
                  <TimerReset className="h-4 w-4 shrink-0" />
                </Button>
                <Button variant="ghost" className="justify-between" disabled={busy} onClick={askHelp}>
                  <span className="text-left">
                    Solicitar ajuda ao gestor
                    <span className="block text-xs font-normal text-muted-foreground">
                      O gestor recebe o pedido e regulariza por você
                    </span>
                  </span>
                  <LifeBuoy className="h-4 w-4 shrink-0" />
                </Button>
              </div>
            </ModalSection>
          ) : null}

          {step === "form" ? form : null}

          {step === "confirm" ? (
            <ModalSection title="Confirmar regularização">
              <p className="text-sm">
                Você está encerrando manualmente o ponto de{" "}
                <strong>{entry.user_name ?? "este funcionário"}</strong>.
              </p>
              <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Entrada</dt>
                  <dd className="font-mono">{new Date(entry.started_at).toLocaleString("pt-PT")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Saída informada</dt>
                  <dd className="font-mono">{new Date(endedAt).toLocaleString("pt-PT")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Tempo calculado</dt>
                  <dd className="font-mono">{computed != null ? formatOpenDuration(computed) : "—"}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                Motivo: {reasons.find((r) => r.value === reasonCode)?.label ?? reasonCode}
                {reasonText.trim() ? ` · ${reasonText.trim()}` : ""}
              </p>
            </ModalSection>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          {step === "form" ? (
            <Button
              disabled={!canSubmit || busy}
              onClick={() => {
                const err = validateLocal();
                if (err) {
                  toast.error(err);
                  return;
                }
                if (mode === "manager") setStep("confirm");
                else void submit();
              }}
            >
              {mode === "manager" ? "Revisar" : busy ? "A encerrar…" : "Encerrar ponto"}
            </Button>
          ) : null}
          {step === "confirm" ? (
            <>
              <Button variant="ghost" onClick={() => setStep("form")} disabled={busy}>
                Voltar
              </Button>
              <Button disabled={busy} onClick={() => void submit()}>
                {busy ? "A regularizar…" : "Confirmar regularização"}
              </Button>
            </>
          ) : null}
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
