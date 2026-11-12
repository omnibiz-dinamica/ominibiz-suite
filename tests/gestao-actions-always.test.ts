import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const g = read("../src/routes/app.ponto_.gestao.tsx");
const drawer = read("../src/components/ponto/PunchEditorDrawer.tsx");

describe("Ticket 218: Ponto · Gestão tem sempre o menu de ações", () => {
  test("nenhuma linha fica só com '—' na coluna Ação", () => {
    expect(g).not.toMatch(
      /isOperationalTask\(r\) \|\| isVacation\(r\) \? \(\s*<span className="text-muted-foreground">—<\/span>/,
    );
    expect(g).toContain('aria-label="Ações da tarefa"');
    expect(g).toContain('aria-label="Ações das férias"');
  });

  test("tarefa pendente/atrasada: Lançar ponto, Marcar falta e Histórico (bloqueados com ponto aberto)", () => {
    expect(g).toMatch(/Lançar ponto\s*<\/DropdownMenuItem>/);
    expect(g).toContain("onClick={() => openAbsenceCreate(r)}");
    expect(g).toMatch(/disabled=\{!r\.task_id \|\| resolvedTaskStatus\(r\) === "em_andamento"\}/);
    expect(g).toContain('<MarkAbsentDialog\n        mode="create"');
  });

  test("férias: ponto avulso no dia (nunca o id das férias como tarefa) e atalho para Férias", () => {
    expect(g).toContain("setAddPointDay({ userId: r.user_id, date: localDayKey(r.started_at) })");
    expect(g).toContain('nav({ to: "/app/ferias" })');
    expect(g).toMatch(/const openVacationAddPoint[\s\S]{0,200}setManualPointTarget\(null\)/);
  });

  test("horário sugerido: recorrência usa só a hora do fim; título certo no editor", () => {
    expect(g).toContain(
      "launchDefaults(manualPointTarget.tasks?.scheduled_for, manualPointTarget.tasks?.scheduled_end)",
    );
    expect(g).not.toContain("initialEndedAt={manualPointTarget?.tasks?.scheduled_end ?? null}");
    expect(g).toContain(
      'regularizeKind={manualPointTarget && !isAbsence(manualPointTarget) ? "task" : "absence"}',
    );
    expect(drawer).toMatch(/regularizeKind === "task"\s*\? "Lançar ponto"/);
  });
});
