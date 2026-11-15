/**
 * SUP-2026-000299 (parte 2): "Férias" numa linha da conferência. O banco
 * anula o ponto (fica no histórico), marca a tarefa como falta justificada
 * "Férias", cria as férias aprovadas desse dia e avisa o funcionário.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Palmtree } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  markReconciliationVacation,
  vacationConfirmText,
  type ReconciliationRow,
} from "@/lib/ponto/reconciliation";

export function ReconciliationVacationButton({
  companyId,
  employeeId,
  row,
  disabled,
  onDone,
}: {
  companyId: string;
  employeeId: string;
  row: ReconciliationRow;
  disabled?: boolean;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const mark = useMutation({
    mutationFn: () =>
      markReconciliationVacation({ companyId, employeeId, taskId: row.task_id!, note }),
    onSuccess: (r) => {
      toast.success(
        r.vacation_pending
          ? "Dia registado como férias. Já havia um pedido de férias pendente para este dia: aprove-o em Férias."
          : "Dia registado como férias (aprovadas). O funcionário foi avisado.",
      );
      setOpen(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || mark.isPending}
        onClick={() => {
          setNote("");
          setOpen(true);
        }}
        title="Registar o dia como férias"
      >
        <Palmtree className="mr-1 h-3.5 w-3.5" />
        Férias
      </Button>
      <AlertDialog open={open} onOpenChange={(v) => !mark.isPending && setOpen(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registar como férias?</AlertDialogTitle>
            <AlertDialogDescription>{vacationConfirmText(row)}</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Observação (opcional)"
            aria-label="Observação das férias"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mark.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={mark.isPending}
              onClick={(e) => {
                e.preventDefault();
                mark.mutate();
              }}
            >
              {mark.isPending ? "A registar..." : "Registar férias"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
