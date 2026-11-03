/**
 * Aviso de ponto fora do dia: antes de bater o ponto de uma tarefa marcada
 * para outro dia (anterior ou posterior), o funcionário vê um modal de alerta.
 *
 * A data da tarefa é a mesma que a fila usa: scheduled_for, senão
 * recurrence_date, senão due_at — guardadas em hora de parede (UTC), por isso
 * compara-se com a data local do dispositivo.
 */
import { localTodayKey } from "@/lib/punch/manager-queue";

type TaskDates = {
  scheduled_for?: string | null;
  recurrence_date?: string | null;
  due_at?: string | null;
};

/** "YYYY-MM-DD" da tarefa, ou null se não tiver data. */
export function taskDayKey(task: TaskDates): string | null {
  if (task.scheduled_for) return task.scheduled_for.slice(0, 10);
  if (task.recurrence_date) return task.recurrence_date.slice(0, 10);
  if (task.due_at) return task.due_at.slice(0, 10);
  return null;
}

export interface OffDayInfo {
  dayKey: string;
  /** "DD/MM/AAAA" */
  dayLabel: string;
  when: "past" | "future";
}

/** null quando a tarefa é de hoje ou não tem data; senão diz se é de um dia anterior ou posterior. */
export function offDayInfo(task: TaskDates, now: Date = new Date()): OffDayInfo | null {
  const key = taskDayKey(task);
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const today = localTodayKey(now);
  if (key === today) return null;
  const [y, m, d] = key.split("-");
  return { dayKey: key, dayLabel: `${d}/${m}/${y}`, when: key < today ? "past" : "future" };
}
