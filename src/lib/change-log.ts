/**
 * Identificação funcional das alterações do OmniBiz.
 *
 * Formato: `DDMMAAAA-XXXc` (correção) e `DDMMAAAA-XXXa` (atualização/melhoria).
 * A sequência `XXX` é diária, começa em `001` e nunca é reutilizada.
 *
 * Este identificador NÃO substitui commit SHA, build, versão ou branch: é uma
 * etiqueta funcional rastreável, mantida à mão neste ficheiro (fonte única).
 */

export type ChangeKind = "c" | "a";

export type ChangeEntry = {
  /** `DDMMAAAA-XXXc` ou `DDMMAAAA-XXXa`. */
  id: string;
  kind: ChangeKind;
  /** Resumo funcional curto, em linguagem de negócio. */
  summary: string;
};

const CHANGE_ID = /^(\d{2})(\d{2})(\d{4})-(\d{3})([ca])$/;

export function parseChangeId(value: string): { datePart: string; sequence: number; kind: ChangeKind } | null {
  const match = CHANGE_ID.exec(value.trim());
  if (!match) return null;
  const [, day, month, year, sequence, kind] = match;
  const dayNumber = Number(day);
  const monthNumber = Number(month);
  if (dayNumber < 1 || dayNumber > 31 || monthNumber < 1 || monthNumber > 12) return null;
  return { datePart: `${day}${month}${year}`, sequence: Number(sequence), kind: kind as ChangeKind };
}

/** Data-only: nunca converte por `Date`/UTC. */
export function changeDatePart(date: { day: number; month: number; year: number }): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.day)}${pad(date.month)}${date.year}`;
}

/** Próximo identificador da data, continuando a sequência já usada (correções e melhorias partilham a sequência). */
export function nextChangeId(datePart: string, kind: ChangeKind, existingIds: string[]): string {
  const highest = existingIds.reduce((max, value) => {
    const parsed = parseChangeId(value);
    if (!parsed || parsed.datePart !== datePart) return max;
    return Math.max(max, parsed.sequence);
  }, 0);
  const next = highest + 1;
  if (next > 999) throw new Error(`Limite diário de identificadores excedido para ${datePart}`);
  return `${datePart}-${String(next).padStart(3, "0")}${kind}`;
}

/** Histórico, do mais antigo para o mais recente. */
export const CHANGE_LOG: readonly ChangeEntry[] = [
  {
    id: "11092026-001c",
    kind: "c",
    summary: "Equipa responsável do cliente volta a ser gravada no cadastro e na edição.",
  },
  {
    id: "11092026-002c",
    kind: "c",
    summary: "Sair e voltar à aba/janela nunca atualiza a tela nem descarta o formulário aberto.",
  },
  {
    id: "11092026-003c",
    kind: "c",
    summary: "Data inicial e data final da recorrência passam a ser editáveis e respeitadas.",
  },
  {
    id: "11092026-004a",
    kind: "a",
    summary: "Pesquisa por nome do funcionário na equipa responsável do cliente.",
  },
  {
    id: "11092026-005a",
    kind: "a",
    summary: "Empresa de testes Grupo V-clean TESTE criada a partir da empresa real.",
  },
];

export function latestChange(): ChangeEntry | null {
  return CHANGE_LOG.length > 0 ? CHANGE_LOG[CHANGE_LOG.length - 1] : null;
}

export function latestChangeId(): string | null {
  return latestChange()?.id ?? null;
}
