import { readdirSync, readFileSync } from "node:fs";

/**
 * Texto do ecrã de Tarefas: a rota (src/routes/app.tarefas.tsx) e os módulos
 * extraídos dela (src/components/tasks/page/*), juntos. Os testes que procuram
 * texto no ecrã de tarefas leem daqui para continuarem válidos após a divisão
 * do ficheiro (prompt 09, file-size-refactor).
 */
export function tasksPageSource(): string {
  const root = new URL("../../", import.meta.url);
  const dir = new URL("src/components/tasks/page/", root);
  const parts = [readFileSync(new URL("src/routes/app.tarefas.tsx", root), "utf8")];
  for (const name of readdirSync(dir).sort()) {
    if (/\.(ts|tsx)$/.test(name)) parts.push(readFileSync(new URL(name, dir), "utf8"));
  }
  return parts.join("\n");
}
