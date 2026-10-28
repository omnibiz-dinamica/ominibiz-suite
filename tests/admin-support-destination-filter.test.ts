import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/routes/app.admin.suporte.tsx", import.meta.url), "utf8");

test("Central Mestre de Suporte filtra pelo destino (Suporte, Secretaria…)", () => {
  expect(page).toMatch(/if \(destination\) query = query\.eq\("destination_code", destination\);/);
  expect(page).toMatch(/queryFn: fetchSupportDestinations/);
  expect(page).toMatch(/<SelectItem value="all">Todos os destinos<\/SelectItem>/);
  expect(page).toMatch(/setDestination\(""\);/);
  expect(page).toMatch(/destinationLabel\(t\.destination_code, destinations\)/);
});
