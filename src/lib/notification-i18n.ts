/**
 * Títulos dos avisos na língua de quem os lê. O banco grava o título em
 * português; aqui traduz-se o título conhecido, mesmo quando vem com o nome
 * do funcionário à frente ou atrás ("Ana — Tarefa cancelada"). Título
 * desconhecido fica como está.
 */
const SEPARATORS = [" — ", " · ", ": ", " - "];

export function translateNotificationTitle(
  title: string | null | undefined,
  t: (key: string) => string,
): string {
  const text = title ?? "";
  if (!text) return text;
  const whole = t(text);
  if (whole !== text) return whole;
  for (const sep of SEPARATORS) {
    const i = text.indexOf(sep);
    if (i <= 0) continue;
    const left = text.slice(0, i);
    const right = text.slice(i + sep.length);
    const tl = t(left);
    const tr = t(right);
    if (tl !== left || tr !== right) return `${tl}${sep}${tr}`;
  }
  return text;
}
