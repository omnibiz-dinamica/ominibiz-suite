import { CalendarX } from "lucide-react";
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
import type { OffDayInfo } from "@/lib/punch/off-day";

/** Alerta antes de bater o ponto de uma tarefa que não é de hoje. */
export function OffDayPunchDialog({
  info,
  taskLabel,
  onCancel,
  onConfirm,
}: {
  info: OffDayInfo | null;
  taskLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={!!info} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <CalendarX className="h-5 w-5 text-warning-foreground" />
            Este ponto não é do dia de hoje
          </AlertDialogTitle>
          <AlertDialogDescription>
            A tarefa <strong>{taskLabel}</strong> está marcada para{" "}
            <strong>{info?.dayLabel}</strong>
            {info?.when === "past" ? " (um dia anterior)" : " (um dia posterior)"}. Confirme que
            quer bater o ponto hoje nesta tarefa.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Bater o ponto mesmo assim</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
