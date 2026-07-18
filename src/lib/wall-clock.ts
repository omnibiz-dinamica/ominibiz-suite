/**
 * Wall-clock datetime helpers.
 *
 * Horários operacionais (início/fim de tarefa) devem ser preservados
 * EXATAMENTE como cadastrados pelo gestor — sem conversão de fuso.
 *
 * Estratégia: serializar o input local como se fosse UTC (`...Z`),
 * e ler de volta usando os componentes UTC do ISO. Assim "06:00"
 * permanece "06:00" em qualquer dispositivo.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-05-20T06:00" -> "2026-05-20T06:00:00.000Z" (preserva wall clock). */
export function wallInputToISO(local: string | null | undefined): string | null {
  if (!local) return null;
  // Normaliza para "YYYY-MM-DDTHH:MM:SS" descartando ms/tz que possam vir do input,
  // depois acrescenta ".000Z" para preservar o horário-parede.
  // Aceita: "YYYY-MM-DDTHH:MM", "YYYY-MM-DDTHH:MM:SS", "YYYY-MM-DDTHH:MM:SS.sss",
  //         "...Z", "...±HH:MM".
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2}))?/.exec(local);
  if (!m) return null;
  const base = m[1];
  const sec = m[2] ?? "00";
  return `${base}:${sec}.000Z`;
}

/** ISO -> "YYYY-MM-DDTHH:MM" para <input type="datetime-local">, sem aplicar fuso. */
export function wallISOToInput(iso: string | null | undefined): string {
  if (!iso) return "";
  // Lê componentes UTC do ISO armazenado.
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** ISO -> "YYYY-MM-DD" para <input type="date">, sem aplicar fuso. */
export function wallISOToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** "2026-05-20" -> fim do dia em wall-clock, usado para tarefas sem horario. */
export function wallDateToEndOfDayISO(date: string | null | undefined): string | null {
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return `${date}T23:59:59.000Z`;
}

/** "20/05/2026" (sem fuso). */
export function formatWallDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** "06:00" (sem fuso). */
export function formatWallTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Horário local do dispositivo (ex.: "Atualizado: 10:42") — esse SIM acompanha o fuso. */
export function formatLocalTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
