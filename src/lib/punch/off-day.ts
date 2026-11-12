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
  /** Ticket 165: "DD/MM/AAAA" de hoje, para o texto "Hoje é dia …". */
  todayLabel: string;
}

/**
 * Ticket 165 (12/11/2026): turno da noite (ex.: 23:30 começado às 00:52) não é
 * "dia errado". Sem aviso quando agora está a até 12 h do horário previsto,
 * comparando horas de parede (scheduled_for guardado como UTC = hora de parede).
 */
export const OFF_DAY_TOLERANCE_HOURS = 12;

function wallNowMs(now: Date): number {
  return Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  );
}

const label = (key: string) => {
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
};

/** null quando a tarefa é de hoje (ou turno perto da meia-noite) ou não tem data. */
export function offDayInfo(task: TaskDates, now: Date = new Date()): OffDayInfo | null {
  const key = taskDayKey(task);
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const today = localTodayKey(now);
  if (key === today) return null;
  if (task.scheduled_for) {
    const planned = new Date(task.scheduled_for).getTime();
    if (
      Number.isFinite(planned) &&
      Math.abs(wallNowMs(now) - planned) <= OFF_DAY_TOLERANCE_HOURS * 3600 * 1000
    ) {
      return null;
    }
  }
  return {
    dayKey: key,
    dayLabel: label(key),
    when: key < today ? "past" : "future",
    todayLabel: label(today),
  };
}

/** Ticket 165: tarefa do MESMO cliente marcada para hoje (para sugerir em vez da errada). */
export function sameClientTaskToday<
  T extends TaskDates & {
    id: string;
    client_id?: string | null;
    assigned_to?: string | null;
    status?: string | null;
  },
>(wrong: T, list: T[], now: Date = new Date()): T | null {
  if (!wrong.client_id) return null;
  const today = localTodayKey(now);
  const candidates = list.filter(
    (t) =>
      t.id !== wrong.id &&
      t.client_id === wrong.client_id &&
      (t.assigned_to ?? null) === (wrong.assigned_to ?? null) &&
      taskDayKey(t) === today &&
      (t.status == null || ["pendente", "autorizado"].includes(t.status)),
  );
  // Dois turnos do mesmo cliente hoje: o mais perto da hora atual.
  const nowWall = wallNowMs(now);
  const dist = (t: T) =>
    t.scheduled_for
      ? Math.abs(new Date(t.scheduled_for).getTime() - nowWall)
      : Number.MAX_SAFE_INTEGER;
  return candidates.sort((a, b) => dist(a) - dist(b))[0] ?? null;
}
