import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/routes/app.ferias.tsx", import.meta.url), "utf8");

const sectionOrder = (className: string) => {
  const match = page.match(new RegExp(`className=\\\"${className}[^\\\"]*\\\"`));
  assert.ok(match, `class ${className} not found`);
  const order = match[0].match(/order-(\d+)/)?.[1];
  assert.ok(order, `order value for ${className} not found`);
  return Number(order);
};

test("vacation management sections keep the requested visual order", () => {
  assert.deepEqual(
    [
      sectionOrder("order-10 rounded-2xl"),
      sectionOrder("order-20 rounded-2xl"),
      sectionOrder("order-30 rounded-2xl"),
      sectionOrder("order-40 rounded-2xl"),
      sectionOrder("order-50 rounded-2xl"),
    ],
    [10, 20, 30, 40, 50],
  );
  assert.ok(page.includes("/> Nova Solicitação"));
  assert.ok(page.includes("/> Agendar Férias para um colaborador"));
});
