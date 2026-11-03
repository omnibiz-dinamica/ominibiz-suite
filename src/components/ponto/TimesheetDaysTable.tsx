/**
 * Tabela de dias da Folha de Ponto (SUP-2026-000301) — usada pelo gestor,
 * pela contabilidade e pelo funcionário. Só apresentação.
 */
import { Fragment, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatMinutes, type TimesheetSnapshot } from "@/lib/timesheet";
import {
  AFTER_SIGNATURE_NOTICE,
  OFF_SCHEDULE_LEGEND,
  dayClients,
  dayInText,
  dayOutText,
  dayFlags,
  fillMonthDays,
  hasOffSchedule,
  isWeekendKey,
  offScheduleText,
  weekdayLetter,
  type ViewDay,
} from "@/lib/timesheet-view";
import { formatWallDate } from "@/lib/wall-clock";

const RED = "font-semibold text-destructive";

export function TimesheetDaysTable({
  snapshot,
  extrasLive = false,
  renderVisto,
}: {
  snapshot: TimesheetSnapshot;
  /** Cliente/observação/vermelho vieram dos dados atuais (folha assinada antes). */
  extrasLive?: boolean;
  renderVisto: (day: ViewDay) => ReactNode;
}) {
  const days = fillMonthDays(snapshot);
  const anyRed = hasOffSchedule(days);

  return (
    <div className="space-y-2">
      {extrasLive && (
        <div className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          {AFTER_SIGNATURE_NOTICE}
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Cliente</th>
              <th className="px-3 py-2 text-left">Entrada</th>
              <th className="px-3 py-2 text-left">Saída</th>
              <th className="px-3 py-2 text-left">Pausas</th>
              <th className="px-3 py-2 text-left">Total</th>
              <th className="px-3 py-2 text-left">Situação</th>
              <th className="px-3 py-2 text-left">Visto</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const f = dayFlags(d);
              const off = f.start || f.end || f.over6h;
              const letter = weekdayLetter(d.work_date);
              const weekend = isWeekendKey(d.work_date);
              const notes = d.task_notes ?? [];
              return (
                <Fragment key={d.work_date}>
                  <tr
                    className={`border-t border-border ${d.placeholder ? "text-muted-foreground" : ""} ${
                      weekend ? "bg-muted/30" : ""
                    }`}
                    title={off ? offScheduleText(d) : undefined}
                  >
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatWallDate(d.work_date) || d.work_date}{" "}
                      <span className="ml-1 inline-block w-4 text-center text-xs font-semibold text-muted-foreground">
                        {letter}
                      </span>
                    </td>
                    <td className="px-3 py-2">{d.placeholder ? "" : dayClients(d) || "—"}</td>
                    <td className={`px-3 py-2 ${f.start ? RED : ""}`}>
                      {d.placeholder ? "" : dayInText(d)}
                    </td>
                    <td className={`px-3 py-2 ${f.end ? RED : ""}`}>
                      {d.placeholder ? "" : dayOutText(d)}
                    </td>
                    <td className="px-3 py-2">
                      {d.placeholder ? "" : formatMinutes(d.break_minutes)}
                    </td>
                    <td className={`px-3 py-2 ${f.over6h ? RED : ""}`}>
                      {d.placeholder ? "" : formatMinutes(d.worked_minutes)}
                    </td>
                    <td className="px-3 py-2">
                      {d.placeholder ? (
                        "—"
                      ) : d.attendance_status === "absence" ||
                        d.attendance_status === "vacation_absence" ? (
                        <div className="space-y-1">
                          <Badge variant="destructive">FALTA</Badge>
                          <div className="text-xs text-muted-foreground">
                            {d.absence_task_count ?? 0} tarefa(s):{" "}
                            {d.absence_tasks?.map((t) => t.title).join(", ")}
                          </div>
                          {d.attendance_status === "vacation_absence" && (
                            <div className="text-xs text-amber-700">Também há férias aprovadas</div>
                          )}
                        </div>
                      ) : d.attendance_status === "mixed" ? (
                        <div className="space-y-1">
                          <Badge variant="destructive">Trabalhado + falta</Badge>
                          <div className="text-xs text-muted-foreground">
                            {d.absence_task_count ?? 0} tarefa(s) sem realização
                          </div>
                        </div>
                      ) : d.day_type === "vacation" ? (
                        <div className="space-y-1">
                          <Badge variant="secondary">Férias</Badge>
                          {d.first_in && (
                            <div className="text-xs text-amber-700">Conflito com ponto</div>
                          )}
                        </div>
                      ) : (
                        "Trabalhado"
                      )}
                    </td>
                    <td className="px-3 py-2">{d.placeholder ? "" : renderVisto(d)}</td>
                  </tr>
                  {off && (
                    <tr className="text-xs text-destructive">
                      <td className="px-3 pb-2" colSpan={8}>
                        {offScheduleText(d)}
                      </td>
                    </tr>
                  )}
                  {notes.length > 0 && (
                    <tr className="text-xs text-muted-foreground">
                      <td className="px-3 pb-2 italic" colSpan={8}>
                        {notes
                          .map((n) => `Obs. (${n.client_name ?? n.title ?? "tarefa"}): ${n.note}`)
                          .join(" · ")}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {anyRed && <div className="text-xs text-destructive">{OFF_SCHEDULE_LEGEND}</div>}
    </div>
  );
}
