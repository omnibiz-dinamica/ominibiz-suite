/** Sugere a saída no dia real da entrada, com a hora atual do dispositivo. */
export function defaultRecoveryEndInput(startedAt: string, now = new Date()): string {
  const started = new Date(startedAt);
  const source = Number.isNaN(started.getTime()) ? now : started;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${source.getFullYear()}-${pad(source.getMonth() + 1)}-${pad(source.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
