/**
 * SUP-2026-000092 — Ponto do gestor: a fila "Próximas tarefas" mostrava as
 * tarefas abertas mais antigas da empresa inteira (sem data mínima), por isso
 * tarefas antigas nunca cumpridas ficavam lá para sempre.
 *
 * Para gestores a fila passa a mostrar só tarefas de hoje em diante e as que
 * estão em andamento. As antigas por resolver continuam em Tarefas e em
 * Ponto · Gestão (como "Atrasada"). Os horários das tarefas são guardados em
 * hora de parede serializada como UTC, por isso "hoje" é a data local do
 * dispositivo com o sufixo Z.
 */
const pad = (n: number) => String(n).padStart(2, "0");

/** Data local do dispositivo em "YYYY-MM-DD". */
export function localTodayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Filtro PostgREST (.or) da fila do gestor: em andamento ou de hoje em diante. */
export function managerUpcomingFilter(now: Date = new Date()): string {
  const today = localTodayKey(now);
  const startOfToday = `${today}T00:00:00.000Z`;
  return [
    "status.eq.em_andamento",
    `scheduled_for.gte.${startOfToday}`,
    `and(scheduled_for.is.null,recurrence_date.gte.${today})`,
    `and(scheduled_for.is.null,recurrence_date.is.null,due_at.gte.${startOfToday})`,
  ].join(",");
}
