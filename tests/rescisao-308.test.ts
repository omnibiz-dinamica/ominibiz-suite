import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  employeeExitState,
  exitBadgeLabel,
  exitVisibleUntil,
  isEmployeeActive,
  isExplicitlyInactive,
} from "../src/lib/employee-status";
import { groupExitTasks } from "../src/components/equipe/ExitTasksDialog";

const read = (p: string) => readFileSync(p, "utf8");
const today = "2026-11-18";

describe("SUP-308 — rescisão", () => {
  test("estados: ativo, sai em, em saída, inativo", () => {
    expect(employeeExitState({ is_active: true }, today)).toBe("ativo");
    expect(employeeExitState({ termination_date: "2026-11-30" }, today)).toBe("sai_em");
    expect(employeeExitState({ termination_date: "2026-11-18" }, today)).toBe("em_saida");
    expect(employeeExitState({ termination_date: "2026-10-01", is_active: false }, today)).toBe(
      "inativo",
    );
    expect(employeeExitState({ status: "Inativo" }, today)).toBe("inativo");
    // sem novas tarefas a partir da saída (regra antiga mantida)
    expect(isEmployeeActive({ termination_date: "2026-11-18" }, today)).toBe(false);
    expect(isExplicitlyInactive({ termination_date: "2026-11-18" })).toBe(false);
  });

  test("visível até = saída + dias da empresa", () => {
    expect(exitVisibleUntil("2026-10-30", 45)).toBe("2026-12-14");
    expect(exitBadgeLabel({ termination_date: "2026-10-30" }, 45, today)).toBe(
      "Em saída · visível até 14/12/2026",
    );
    expect(exitBadgeLabel({ termination_date: "2026-12-01" }, 45, today)).toBe("Sai em 01/12/2026");
    expect(exitBadgeLabel({ termination_date: null }, 45, today)).toBeNull();
  });

  test("lista de tarefas depois da saída: avulsas e séries agrupadas", () => {
    const rows = [
      {
        id: "a",
        title: "Avulsa",
        scheduled_for: "2026-12-02T09:00:00Z",
        recurrence_date: null,
        recurrence_id: null,
      },
      {
        id: "s2",
        title: "Série",
        scheduled_for: "2026-12-08T09:00:00Z",
        recurrence_date: "2026-12-08",
        recurrence_id: "r1",
      },
      {
        id: "s1",
        title: "Série",
        scheduled_for: "2026-12-01T09:00:00Z",
        recurrence_date: "2026-12-01",
        recurrence_id: "r1",
      },
    ];
    const g = groupExitTasks(rows);
    expect(g.map((x) => x.key)).toEqual(["s:r1", "t:a"]);
    const series = g[0];
    expect(series.kind === "series" && series.first.id).toBe("s1");
    expect(series.kind === "series" && series.count).toBe(2);
  });

  test("ecrãs: Equipe mostra 'Em saída', ficha pergunta pelas tarefas, empresa define os dias, login bloqueia", () => {
    expect(read("src/routes/app.equipe.tsx")).toContain('data-testid="exit-badge"');
    const editor = read("src/components/equipe/EmployeeEditor.tsx");
    expect(editor).toContain("setExitTasksOpen(true)");
    expect(editor).toContain('"access_authorized_until" in profile');
    expect(read("src/routes/app.empresa.tsx")).toContain("termination_grace_days: value");
    expect(read("src/lib/auth.tsx")).toContain('rpc("my_access_blocked")');
    expect(read("src/components/equipe/ExitTasksDialog.tsx")).toContain(
      'deleteTaskSeries(g.first.id, "future", "Rescisão do funcionário")',
    );
  });

  test("SQL: guardas, bloqueio via Auth, tarefa diária e desfazer", () => {
    const sql = read("docs/sql/rescisao_20261118_aplicar.sql");
    expect(sql).toContain("RAISE EXCEPTION 'PARAR: este script já foi aplicado.");
    expect(sql).toContain("UPDATE auth.users SET banned_until = now() + interval '100 years'");
    expect(sql).toContain("Só a gestão pode autorizar o acesso após a rescisão.");
    expect(sql).toContain("cron.schedule('employee-terminations-daily'");
    const undo = read("docs/sql/rescisao_20261118_desfazer.sql");
    expect(undo).toContain("UPDATE auth.users u SET banned_until = NULL");
  });
});
