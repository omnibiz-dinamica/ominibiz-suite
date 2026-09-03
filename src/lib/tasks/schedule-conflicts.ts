export type ScheduleProposal = {
  assignee_id: string;
  start_at: string;
  end_at: string;
};

export type TaskScheduleConflict = {
  assignee_id: string;
  assignee_name: string | null;
  conflicting_task_id: string;
  conflicting_title: string;
  conflicting_client_name: string | null;
  conflicting_start: string;
  conflicting_end: string;
  overlap_start: string;
  overlap_end: string;
  proposed_start: string;
  proposed_end: string;
};

/** Intervalos abertos nas pontas não conflitam: 10:00-12:00 + 12:00-14:00. */
export function intervalsOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  const aStart = new Date(startA).getTime();
  const aEnd = new Date(endA).getTime();
  const bStart = new Date(startB).getTime();
  const bEnd = new Date(endB).getTime();
  if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite)) return false;
  if (aStart >= aEnd || bStart >= bEnd) return false;
  return aStart < bEnd && bStart < aEnd;
}

export function overlapInterval(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): { start: string; end: string } | null {
  if (!intervalsOverlap(startA, endA, startB, endB)) return null;
  const start = Math.max(new Date(startA).getTime(), new Date(startB).getTime());
  const end = Math.min(new Date(endA).getTime(), new Date(endB).getTime());
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}
