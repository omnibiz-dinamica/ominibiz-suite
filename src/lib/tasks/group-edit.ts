/** SUP-66 / SUP-224 — regras puras da edição de uma ocorrência de grupo. */
export function diffGroupAssignees(current: string[], desired: string[]) {
  const cur = [...new Set(current)];
  const des = [...new Set(desired)];
  const added = des.filter((id) => !cur.includes(id));
  const removed = cur.filter((id) => !des.includes(id));
  // Troca 1↔1 conta como uma mudança de responsável da mesma linha.
  const affected = new Set([...added, ...removed]).size;
  return { added, removed, affected, changed: added.length + removed.length > 0 };
}

/** Confirmação explícita quando a mudança atinge mais de um colaborador. */
export function needsGroupAssigneeConfirmation(current: string[], desired: string[]): boolean {
  return diffGroupAssignees(current, desired).affected > 1;
}

/** Pergunta "aplicar aos colegas" só se o horário mudou e há colegas na ocorrência. */
export function shouldAskGroupScheduleScope(params: {
  colleagues: number;
  oldStart: string | null;
  oldEnd: string | null;
  newStart: string | null;
  newEnd: string | null;
}): boolean {
  const same = (a: string | null, b: string | null) =>
    (a ? Date.parse(a) : null) === (b ? Date.parse(b) : null);
  return params.colleagues > 0 && (!same(params.oldStart, params.newStart) || !same(params.oldEnd, params.newEnd));
}
