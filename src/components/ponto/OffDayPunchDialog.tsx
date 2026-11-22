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
import { tr } from "@/i18n";

/** Alerta antes de bater o ponto de uma tarefa que não é de hoje. */
export function OffDayPunchDialog({
  info,
  taskLabel,
  todayTaskLabel,
  onCancel,
  onConfirm,
  onUseToday,
}: {
  info: OffDayInfo | null;
  taskLabel: string;
  /** Ticket 165: tarefa do mesmo cliente marcada para hoje (se houver). */
  todayTaskLabel?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  onUseToday?: () => void;
}) {
  return (
    <AlertDialog open={!!info} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <CalendarX className="h-5 w-5 text-warning-foreground" />
            {tr("Este ponto não é do dia de hoje")}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p className="text-base text-foreground">
                {tr("Esta tarefa é do dia")} <strong>{info?.dayLabel}</strong>{tr(". Hoje é dia")}{" "}
                <strong>{info?.todayLabel}</strong>.
              </p>
              <p>
                <strong>{taskLabel}</strong>
                {info?.when === "past"
                  ? tr(" — tarefa de um dia anterior.")
                  : tr(" — tarefa de um dia posterior.")}{" "}
                {todayTaskLabel
                  ? tr("Há uma tarefa deste cliente marcada para hoje: use essa.")
                  : tr("Confirme que quer bater o ponto hoje nesta tarefa.")}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel onClick={onCancel}>{tr("Cancelar")}</AlertDialogCancel>
          {onUseToday && todayTaskLabel && (
            <AlertDialogAction onClick={onUseToday}>{tr("Usar a tarefa de hoje")}</AlertDialogAction>
          )}
          <AlertDialogAction
            onClick={onConfirm}
            className={
              onUseToday && todayTaskLabel
                ? "bg-muted text-foreground hover:bg-muted/80"
                : undefined
            }
          >
            {tr("Bater o ponto mesmo assim")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
