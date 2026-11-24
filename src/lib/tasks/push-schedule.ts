/**
 * 23/11/2026 — "Empurrar as seguintes".
 * Ao criar uma tarefa que se sobrepõe a outras do MESMO funcionário no MESMO dia,
 * o gestor pode passar as tarefas seguintes para depois, em cadeia, mantendo a
 * duração de cada uma (só mudam início e fim). Regras:
 *  - só tarefas que começam à mesma hora ou depois da nova tarefa;
 *  - pára no primeiro intervalo livre que já absorve o atraso;
 *  - tarefas iniciadas, concluídas ou com ponto NÃO mexem (ficam como aviso);
 *  - nenhuma tarefa passa da meia-noite (fica como aviso e não mexe);
 *  - canceladas e ausentes são ignoradas;
 *  - só aquele dia: a série recorrente não muda (a ocorrência mantém o dia).
 * Horários em "wall clock" (ISO com Z = hora de parede), como no resto das tarefas.
 */
import { supabase } from "@/integrations/supabase/client";

export type PushDayTask = {
  id: string;
  label: string;
  start: string;
  end: string;
  status: string;
  hasPunch: boolean;
};

export type PushMove = {
  id: string;
  label: string;
  fromStart: string;
  fromEnd: string;
  toStart: string;
  toEnd: string;
};

export type PushBlocked = {
  id: string;
  label: string;
  start: string;
  end: string;
  reason: "started" | "past_midnight" | "starts_before";
};

export type PushPlan = { moves: PushMove[]; blocked: PushBlocked[] };

const MOVABLE = new Set(["pendente", "autorizado"]);
const IGNORED = new Set(["cancelado", "ausente"]);

const ms = (iso: string) => new Date(iso).getTime();
const iso = (t: number) => new Date(t).toISOString();

/** Fim do dia (meia-noite seguinte) em wall clock para uma data "YYYY-MM-DD". */
export function wallDayBounds(dateKey: string): { start: string; end: string } {
  const start = new Date(`${dateKey}T00:00:00.000Z`).getTime();
  return { start: iso(start), end: iso(start + 24 * 60 * 60 * 1000) };
}

export function planPushSchedule(
  newStart: string,
  newEnd: string,
  dayTasks: PushDayTask[],
  dayEnd: string,
): PushPlan {
  const moves: PushMove[] = [];
  const blocked: PushBlocked[] = [];
  const ns = ms(newStart);
  let cursor = ms(newEnd);
  const limit = ms(dayEnd);
  const relevant = dayTasks
    .filter((t) => !IGNORED.has(t.status) && t.start && t.end && ms(t.end) > ms(t.start))
    .sort((a, b) => ms(a.start) - ms(b.start) || ms(a.end) - ms(b.end));

  for (const t of relevant) {
    const s = ms(t.start);
    const e = ms(t.end);
    if (s < ns) {
      // Começou antes da nova tarefa e sobrepõe-se: não se empurra, só avisa.
      if (e > ns) blocked.push({ id: t.id, label: t.label, start: t.start, end: t.end, reason: "starts_before" });
      continue;
    }
    if (s >= cursor) break; // intervalo livre: o resto do dia fica igual
    if (!MOVABLE.has(t.status) || t.hasPunch) {
      blocked.push({ id: t.id, label: t.label, start: t.start, end: t.end, reason: "started" });
      cursor = Math.max(cursor, e);
      continue;
    }
    const toStart = cursor;
    const toEnd = cursor + (e - s);
    if (toEnd > limit) {
      blocked.push({ id: t.id, label: t.label, start: t.start, end: t.end, reason: "past_midnight" });
      continue;
    }
    moves.push({ id: t.id, label: t.label, fromStart: t.start, fromEnd: t.end, toStart: iso(toStart), toEnd: iso(toEnd) });
    cursor = toEnd;
  }
  return { moves, blocked };
}

type TaskQueryRow = {
  id: string;
  title: string | null;
  status: string;
  scheduled_for: string | null;
  scheduled_end: string | null;
  clients?: { name: string | null } | null;
};

/** Tarefas do funcionário no dia (wall clock), com indicação de ponto registado. */
export async function fetchPushDayTasks(companyId: string, assigneeId: string, dateKey: string): Promise<PushDayTask[]> {
  const { start, end } = wallDayBounds(dateKey);
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, status, scheduled_for, scheduled_end, clients(name)")
    .eq("company_id", companyId)
    .eq("assigned_to", assigneeId)
    .is("deleted_at", null)
    .gte("scheduled_for", start)
    .lt("scheduled_for", end);
  if (error) throw error;
  const rows = ((data ?? []) as unknown as TaskQueryRow[]).filter((r) => r.scheduled_for && r.scheduled_end);
  const ids = rows.map((r) => r.id);
  const punched = new Set<string>();
  if (ids.length > 0) {
    const te = await supabase.from("time_entries").select("task_id").in("task_id", ids);
    if (te.error) throw te.error;
    for (const r of (te.data ?? []) as { task_id: string | null }[]) if (r.task_id) punched.add(r.task_id);
  }
  return rows.map((r) => ({
    id: r.id,
    label: r.clients?.name?.trim() || r.title?.trim() || "Tarefa",
    start: r.scheduled_for as string,
    end: r.scheduled_end as string,
    status: r.status,
    hasPunch: punched.has(r.id),
  }));
}

/** Aplica as mudanças (só início/fim/prazo). Devolve quantas foram alteradas. */
export async function applyPushMoves(companyId: string, moves: PushMove[]): Promise<number> {
  let done = 0;
  // Da última para a primeira: nunca fica uma tarefa "por cima" de outra a meio.
  for (const m of [...moves].sort((a, b) => ms(b.toStart) - ms(a.toStart))) {
    const { error } = await supabase
      .from("tasks")
      .update({ scheduled_for: m.toStart, scheduled_end: m.toEnd, due_at: m.toEnd })
      .eq("id", m.id)
      .eq("company_id", companyId)
      .in("status", ["pendente", "autorizado"]);
    if (error) throw error;
    done += 1;
  }
  return done;
}

/**
 * 24/11/2026 — primeiro horário livre do dia para uma tarefa com esta duração,
 * a partir da hora desejada (e, se não couber até à meia-noite, desde o início do dia).
 * Canceladas e ausentes não ocupam. Devolve null se não houver espaço.
 */
export function findFreeSlot(
  desiredStart: string,
  durationMinutes: number,
  dayTasks: PushDayTask[],
  dayStart: string,
  dayEnd: string,
): { start: string; end: string } | null {
  const dur = durationMinutes * 60000;
  if (!(dur > 0)) return null;
  const busy = dayTasks
    .filter((t) => !IGNORED.has(t.status) && t.start && t.end && ms(t.end) > ms(t.start))
    .map((t) => [ms(t.start), ms(t.end)] as const)
    .sort((a, b) => a[0] - b[0]);
  const limit = ms(dayEnd);
  const search = (from: number): number | null => {
    let candidate = from;
    for (const [s, e] of busy) {
      if (candidate + dur <= s) break;
      if (e > candidate) candidate = Math.max(candidate, e);
    }
    return candidate + dur <= limit ? candidate : null;
  };
  const found = search(ms(desiredStart)) ?? search(ms(dayStart));
  return found == null ? null : { start: iso(found), end: iso(found + dur) };
}

/** Tarefas do dia que se sobrepõem ao intervalo (canceladas/ausentes não contam). */
export function overlappingTasks(start: string, end: string, dayTasks: PushDayTask[]): PushDayTask[] {
  const s = ms(start);
  const e = ms(end);
  return dayTasks.filter((t) => !IGNORED.has(t.status) && ms(t.start) < e && ms(t.end) > s);
}
