/**
 * OmniBiz · Folha de Ponto — apresentação (SUP-2026-000301).
 *
 * Só apresentação: nunca altera ponto, versão assinada nem remuneração.
 *  - todos os dias do mês, com a letra do dia da semana (S, T, Q, Q, S, S, D);
 *  - cliente e observação da conclusão por dia;
 *  - horas fora do padrão marcado na tarefa (vermelho).
 *
 * Folhas assinadas antes desta versão não têm cliente/observação/vermelho no
 * snapshot guardado. Para essas, os dados ATUAIS são acrescentados na tela e no
 * PDF, com aviso — o snapshot assinado e o PDF arquivado ficam intactos.
 */
import {
  buildSnapshot,
  formatDayTime,
  type SnapshotDay,
  type SnapshotEntry,
  type TimesheetSnapshot,
} from "@/lib/timesheet";

/** getUTCDay(): 0 = domingo. Segunda S, terça T, quarta Q, quinta Q, sexta S, sábado S, domingo D. */
const WEEKDAY_LETTERS = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

/** Letras do dia (0 = domingo) por língua; sem língua conhecida, português. */
const WEEKDAY_LETTERS_BY_LANG: Record<string, readonly string[]> = {
  "pt-BR": WEEKDAY_LETTERS,
  en: ["S", "M", "T", "W", "T", "F", "S"],
  "nl-BE": ["Z", "M", "D", "W", "D", "V", "Z"],
  "fr-BE": ["D", "L", "M", "M", "J", "V", "S"],
};

/** Tradutor (chave = texto em português). Sem tradutor: o próprio português. */
export type Tr = (key: string, vars?: Record<string, unknown>) => string;
export const ptTr: Tr = (key, vars) =>
  key.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars?.[k] ?? ""));

export type ViewDay = SnapshotDay & {
  /** Dia sem registo, acrescentado só para mostrar o mês inteiro. */
  placeholder?: boolean;
};

export const AFTER_SIGNATURE_NOTICE =
  "Cliente, observações e marcações a vermelho foram acrescentados depois da assinatura, com os dados atuais. A versão assinada não foi alterada.";

export const OFF_SCHEDULE_LEGEND =
  "Vermelho: hora diferente da marcada na tarefa (clientes Coifa: só a entrada e mais de 6 h de trabalho).";

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-05" -> "S" (segunda). Data inválida -> "". */
export function weekdayLetter(dateKey: string | null | undefined, lang?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateKey ?? "");
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const letters = (lang && WEEKDAY_LETTERS_BY_LANG[lang]) || WEEKDAY_LETTERS;
  return letters[d.getUTCDay()] ?? "";
}

/** Sábado ou domingo. */
export function isWeekendKey(dateKey: string | null | undefined): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateKey ?? "");
  if (!m) return false;
  const wd = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return wd === 0 || wd === 6;
}

/** Todas as datas do mês, "YYYY-MM-DD". */
export function monthDateKeys(year: number, month: number): string[] {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`);
}

const dayKey = (d: SnapshotDay) => String(d.work_date).slice(0, 10);

/** Dias do snapshot + os dias sem registo, por ordem. Não altera o snapshot. */
export function fillMonthDays(snapshot: Pick<TimesheetSnapshot, "days" | "period">): ViewDay[] {
  const byKey = new Map<string, ViewDay>();
  for (const d of snapshot.days ?? []) byKey.set(dayKey(d), d);
  const keys = new Set(monthDateKeys(snapshot.period.year, snapshot.period.month));
  for (const k of byKey.keys()) keys.add(k);
  return [...keys].sort().map(
    (k) =>
      byKey.get(k) ?? {
        work_date: k,
        first_in: null,
        last_out: null,
        worked_minutes: 0,
        break_minutes: 0,
        entries_count: 0,
        confirmed_at: null,
        placeholder: true,
      },
  );
}

/** O snapshot é anterior ao SUP-301 (falta cliente ou marcação vermelha em algum dia). */
export function snapshotNeedsLiveExtras(snapshot: Pick<TimesheetSnapshot, "days">): boolean {
  return (snapshot.days ?? []).some(
    (d) =>
      d.clients === undefined ||
      d.schedule_flags === undefined ||
      d.time_zone === undefined ||
      d.entries === undefined,
  );
}

/**
 * Acrescenta aos dias de um snapshot antigo o cliente, a observação e o vermelho
 * do snapshot atual (mesma data). Devolve um objeto novo; o original fica igual.
 */
export function mergeLiveExtras(
  stored: TimesheetSnapshot,
  live: Pick<TimesheetSnapshot, "days">,
): { snapshot: TimesheetSnapshot; merged: boolean } {
  const liveByKey = new Map((live.days ?? []).map((d) => [dayKey(d), d]));
  let merged = false;
  const days = (stored.days ?? []).map((d) => {
    const l = liveByKey.get(dayKey(d));
    if (!l) return d;
    const next: SnapshotDay = { ...d };
    if (d.clients === undefined && l.clients !== undefined) {
      next.clients = l.clients;
      next.task_notes = l.task_notes ?? [];
      merged = true;
    }
    if (d.schedule_flags === undefined && l.schedule_flags !== undefined) {
      next.schedule_flags = l.schedule_flags;
      next.schedule_issues = l.schedule_issues ?? [];
      merged = true;
    }
    if (d.time_zone === undefined && l.time_zone !== undefined) {
      // As horas continuam as da versão guardada; só se mostram no fuso de onde se marcou.
      next.time_zone = l.time_zone;
      next.first_in_local = formatTimeInZone(d.first_in, l.time_zone);
      next.last_out_local = formatTimeInZone(d.last_out, l.time_zone);
      merged = true;
    }
    if (d.entries === undefined && l.entries !== undefined) {
      next.entries = l.entries;
      merged = true;
    }
    return next;
  });
  return { snapshot: { ...stored, days }, merged };
}

/** Para folhas assinadas antes do SUP-301: junta os dados atuais (só para mostrar). */
export async function withLiveExtras(
  stored: TimesheetSnapshot,
): Promise<{ snapshot: TimesheetSnapshot; extrasLive: boolean }> {
  if (!snapshotNeedsLiveExtras(stored)) return { snapshot: stored, extrasLive: false };
  try {
    const live = await buildSnapshot({
      companyId: stored.company.id,
      employeeId: stored.employee.id,
      year: stored.period.year,
      month: stored.period.month,
    });
    const { snapshot, merged } = mergeLiveExtras(stored, live);
    return { snapshot, extrasLive: merged };
  } catch (err) {
    // Sem os dados atuais a folha continua a abrir, só sem os campos novos.
    console.error("[timesheet] live extras unavailable", err);
    return { snapshot: stored, extrasLive: false };
  }
}

/** "HH:MI" de um instante no fuso indicado; sem fuso válido, como a folha sempre mostrou. */
export function formatTimeInZone(
  iso: string | null | undefined,
  timeZone: string | null | undefined,
): string | null {
  if (!iso) return null;
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat("pt-PT", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone,
      }).format(new Date(iso));
    } catch {
      /* fuso inválido */
    }
  }
  return formatDayTime(iso);
}

/** Entrada/saída do dia: hora do sítio onde se marcou (quando conhecida). */
export function dayInText(d: SnapshotDay): string {
  if (d.first_in_local !== undefined) return d.first_in_local ?? "—";
  return formatDayTime(d.first_in);
}
export function dayOutText(d: SnapshotDay): string {
  if (d.last_out_local !== undefined) return d.last_out_local ?? "—";
  return formatDayTime(d.last_out);
}

/** Pontos do dia para mostrar em linhas próprias (só quando há mais de um). */
export function dayEntryRows(d: SnapshotDay): SnapshotEntry[] {
  return (d.entries ?? []).length > 1 ? (d.entries ?? []) : [];
}

/** "Retificada pela gestão em DD/MM/AAAA HH:MM por Nome — motivo". */
export function revisionText(
  s: Pick<TimesheetSnapshot, "revision">,
  tr: Tr = ptTr,
  locale = "pt-PT",
): string | null {
  const r = s.revision;
  if (!r) return null;
  const when = new Date(r.at).toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return r.by_name
    ? tr(
        "Retificada pela gestão em {{when}} por {{name}} — {{reason}}. Assinatura do funcionário mantida.",
        { when, name: r.by_name, reason: r.reason },
      )
    : tr("Retificada pela gestão em {{when}} — {{reason}}. Assinatura do funcionário mantida.", {
        when,
        reason: r.reason,
      });
}

/**
 * "YYYY-MM-DDTHH:MM" na hora de um fuso -> instante ISO (UTC).
 * Sem fuso válido usa o do dispositivo.
 */
export function zonedLocalToIso(local: string, timeZone?: string | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (!timeZone) return new Date(y, mo - 1, d, h, mi).toISOString();
  const target = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (ms: number) => {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(ms));
      const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
      return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")) - ms;
    } catch {
      return null;
    }
  };
  const off = offsetAt(target);
  if (off === null) return new Date(y, mo - 1, d, h, mi).toISOString();
  let ms = target - off;
  const off2 = offsetAt(ms);
  if (off2 !== null && off2 !== off) ms = target - off2;
  return new Date(ms).toISOString();
}

export function dayClients(d: SnapshotDay): string {
  return (d.clients ?? []).join(", ");
}

export function dayFlags(d: SnapshotDay) {
  const f = d.schedule_flags;
  return { start: !!f?.start_off, end: !!f?.end_off, over6h: !!f?.over_6h };
}

export function hasOffSchedule(days: SnapshotDay[]): boolean {
  return days.some((d) => {
    const f = dayFlags(d);
    return f.start || f.end || f.over6h;
  });
}

const hhmm = (v: string | null | undefined) => (v ? v.slice(-5) : "—");

/** "DD/MM HH:MI" -> minutos (para comparar duas horas do mesmo mês/ano). */
function hhmmMinutes(v: string | null | undefined): { day: string; minutes: number } | null {
  const m = /^(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/.exec(v ?? "");
  if (!m) return null;
  return { day: `${m[2]}-${m[1]}`, minutes: Number(m[3]) * 60 + Number(m[4]) };
}

/** Hora real (do sítio onde se marcou) e diferença em relação à hora marcada. */
function deviation(
  label: "entrada" | "saída",
  actual?: string | null,
  planned?: string | null,
): string {
  const a = hhmmMinutes(actual);
  const p = hhmmMinutes(planned);
  if (!a || !p) return `${label} diferente da hora marcada (${hhmm(planned)})`;
  if (a.day !== p.day) return `${label} noutro dia (marcada ${planned})`;
  const diff = a.minutes - p.minutes;
  const abs = Math.abs(diff);
  const amount = abs >= 60 ? `${Math.floor(abs / 60)}h${pad(abs % 60)}` : `${abs} min`;
  return `${label} ${hhmm(actual)}, ${amount} ${diff > 0 ? "depois" : "antes"} da hora marcada (${hhmm(planned)})`;
}

/** Texto curto do que ficou fora do padrão, por tarefa. */
export function offScheduleText(d: SnapshotDay): string {
  return (d.schedule_issues ?? [])
    .map((i) => {
      const parts: string[] = [];
      if (i.start_off) parts.push(deviation("entrada", i.actual_start_hhmm, i.planned_start_hhmm));
      if (i.end_off) parts.push(deviation("saída", i.actual_end_hhmm, i.planned_end_hhmm));
      if (i.over_6h) {
        const h = Math.floor(i.effective_minutes / 60);
        const m = i.effective_minutes % 60;
        parts.push(`${h}h${pad(m)} de trabalho (mais de 6 h)`);
      }
      return `${i.client_name ?? "Sem cliente"}: ${parts.join(", ")}`;
    })
    .join(" · ");
}

/** Situação do dia (texto), igual à tela e ao PDF. */
export function dayStatusText(d: ViewDay, tr: Tr = ptTr): string {
  if (d.placeholder) return "—";
  if (d.attendance_status === "absence" || d.attendance_status === "vacation_absence")
    return tr("Falta ({{n}} tarefa(s))", { n: d.absence_task_count ?? 0 });
  if (d.attendance_status === "mixed")
    return tr("Trabalhado + falta ({{n}})", { n: d.absence_task_count ?? 0 });
  if (d.day_type === "vacation") return d.first_in ? tr("Férias + ponto") : tr("Férias");
  return tr("Trabalhado");
}
